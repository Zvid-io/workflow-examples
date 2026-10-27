#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { defaults, checkConfig } from './workflow.js';
import { createShopify } from './shopify.js';
import { run } from './run.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
function writeJson(file, value) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: options } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, fixture: { type: 'string' },
    out: { type: 'string', default: 'out/live' }, 'max-credits': { type: 'string' },
    'dry-run': { type: 'boolean' }, offline: { type: 'boolean' },
    'publish-to-shopify': { type: 'boolean' }, resume: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (options.help) {
    console.log(`Shopify catalog videos
  npm run offline                    build sample locally; no credentials or credits
  npm run dry-run                    read Shopify + validate each project for free
  npm start -- --max-credits 100      render catalog videos for review (spends credits)
  npm run sample -- --max-credits 30  render the fictional sample
  npm start -- --resume               recover the batch recorded in out/live
  npm start -- --resume --publish-to-shopify  attach reviewed videos to Shopify

Options: --config <json>, --fixture <json>, --out <directory>, --max-credits <number>,
         --dry-run, --offline (requires --fixture), --resume, --publish-to-shopify
Set ZVID_API_KEY, SHOPIFY_ACCESS_TOKEN and SHOPIFY_SHOP_DOMAIN in .env.
The default is dryRun=false and publishToShopify=false. Read README.md before rendering.`);
    return;
  }
  if (options.offline && !options.fixture) throw new Error('--offline requires a local --fixture');
  if (options.resume && options.fixture) throw new Error('--resume uses its saved input; omit --fixture');
  const config = checkConfig({ ...defaults, ...json(options.config),
    ...(process.env.SHOPIFY_SHOP_DOMAIN ? { shopDomain: process.env.SHOPIFY_SHOP_DOMAIN } : {}),
    ...(options['dry-run'] ? { dryRun: true } : {}),
    ...(options['publish-to-shopify'] ? { publishToShopify: true } : {}),
  });
  mkdirSync(options.out, { recursive: true });
  const file = path.join(options.out, 'result.json');
  const lockPath = path.join(options.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  try {
    const prior = options.resume ? json(file) : null;
    if (!options.resume && existsSync(file) && !['offline', 'empty', 'dry-run', 'validated', 'prepared'].includes(json(file).state)) {
      throw new Error('This directory already records a render attempt. Use --resume or inspect it before choosing a new --out');
    }
    const fixture = Boolean(options.fixture || prior?.fixture);
    if (fixture && config.publishToShopify) throw new Error('Fixture runs cannot publish to Shopify');
    const shopify = (!fixture && (!prior || config.publishToShopify))
      ? createShopify(config, process.env.SHOPIFY_ACCESS_TOKEN) : null;
    const catalog = prior ? null : options.fixture ? json(options.fixture) : await shopify.getCatalog();
    const client = options.offline ? null : new ZvidClient({
      apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000) }),
    });
    const state = await run({ config, catalog, client, shopify, fixture, prior,
      offline: options.offline,
      maxCredits: options['max-credits'] === undefined ? undefined : Number(options['max-credits']),
      save: value => writeJson(file, value),
      saveProject: (name, value) => writeJson(path.join(options.out, `${name}.json`), value),
    });
    console.log(JSON.stringify({ state: state.state, products: state.products.length,
      creditsQuoted: state.creditsQuoted, result: file, videos: state.videos.length, errors: state.errors.length }, null, 2));
    if (state.errors.length || state.videos.some(v => v.publishError)) process.exitCode = 1;
  } finally {
    closeSync(lock); unlinkSync(lockPath);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
