#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { fetchShopifyCatalog, loadWorkflow, readWorkflowConfig } from './planner.js';
import { run } from './run.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
function saveJson(file, data) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
}
function positive(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${name} must be a positive integer.`);
  return number;
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: options } = parseArgs({ options: {
    mode: { type: 'string', default: 'plan' }, config: { type: 'string', default: 'config.json' },
    fixture: { type: 'string' }, out: { type: 'string', default: 'out/live' },
    'max-products': { type: 'string' }, 'variants-per-product': { type: 'string' }, 'max-total-ads': { type: 'string' },
    'confirm-render': { type: 'boolean' }, 'max-credits': { type: 'string' },
    resume: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (options.help) {
    console.log(`Shopify Product Video Ads
  npm run offline                  offline planner check, no accounts or credits
  npm start                        read Shopify and save a plan
  npm run validate                 free validation and per-variant estimates
  npm start -- --mode render --confirm-render --max-credits 30
  npm start -- --resume             poll the existing batch; never submit again
Use --out to keep separate runs. --max-credits is a local estimate guard, not a server-side cap.
The script saves a delivery manifest. It does not publish ads or call a delivery webhook.`);
    return;
  }
  if (!['plan', 'validate', 'render'].includes(options.mode)) throw new Error('Invalid --mode. Use plan, validate, or render.');
  if (options.resume && options.fixture) throw new Error('--resume uses the saved input; omit --fixture.');
  if (options.fixture?.endsWith('.offline.json') && options.mode !== 'plan') throw new Error('The offline fixture contains placeholder images. Use data/sample.json or live Shopify for validation/rendering.');
  if (!options.resume && options.mode === 'render' && (!options['confirm-render'] || !Number.isFinite(Number(options['max-credits'])) || Number(options['max-credits']) <= 0)) {
    throw new Error('Rendering requires --confirm-render and a positive --max-credits limit.');
  }
  const { byName } = await loadWorkflow();
  const config = { ...readWorkflowConfig(byName), ...json(options.config) };
  if (process.env.SHOPIFY_STORE_DOMAIN) config.shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  for (const [flag, key] of [['max-products','maxProducts'],['variants-per-product','variantsPerProduct'],['max-total-ads','maxTotalAds']]) {
    config[key] = positive(options[flag] ?? config[key], key);
  }
  config.pollSeconds = positive(config.pollSeconds, 'pollSeconds');
  config.timeoutMinutes = positive(config.timeoutMinutes, 'timeoutMinutes');
  mkdirSync(options.out, { recursive: true });
  const file = path.join(options.out, 'result.json');
  const lockFile = path.join(options.out, '.run.lock');
  const lock = openSync(lockFile, 'wx');
  try {
    const prior = options.resume ? json(file) : null;
    if (!options.resume && existsSync(file) && !['planned','validated','empty'].includes(json(file).state)) throw new Error('This output directory records a render attempt. Use --resume or inspect it before choosing a new --out.');
    const response = prior ? null : options.fixture ? json(options.fixture)
      : await fetchShopifyCatalog(config, process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);
    const client = options.mode === 'plan' && !prior ? null : new ZvidClient({
      apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000) }),
    });
    const state = await run({ byName, config, shopifyResponse: response, client,
      mode: options.mode, prior, confirmRender: options['confirm-render'],
      maxCredits: Number(options['max-credits']), save: value => saveJson(file, value) });
    if (state.manifest) saveJson(path.join(options.out, 'delivery-manifest.json'), state.manifest);
    if (state.build) saveJson(path.join(options.out, 'render-payload.json'), state.build);
    console.log(JSON.stringify({ state: state.state, products: state.plan.productsSelected,
      ads: state.plan.ads.length, creditsQuoted: state.creditsQuoted,
      videos: state.manifest?.assets.length, failures: state.manifest?.failures.length, result: file }, null, 2));
    if (state.manifest?.failures.length) process.exitCode = 1;
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
