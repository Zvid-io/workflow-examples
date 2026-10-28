#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { defaults, checkConfig } from './workflow.js';
import { run } from './run.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${file}.tmp`, file); };

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: o } = parseArgs({ options: {
    input: { type: 'string' }, shopify: { type: 'boolean' }, config: { type: 'string', default: 'config.json' },
    out: { type: 'string', default: 'out/live' }, 'dry-run': { type: 'boolean' }, offline: { type: 'boolean' },
    'max-credits': { type: 'string' }, resume: { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (o.help) { console.log('Use --input data/product.json or --shopify. --offline builds locally; --dry-run validates. Rendering needs --max-credits N. --resume polls the saved job in --out. Read README.md.'); return; }
  if (o.input && o.shopify) throw new Error('Choose a local input or Shopify');
  if (!o.resume && !o.input && !o.shopify) throw new Error('Provide --input <JSON> or --shopify');
  if (o.offline && !o.input) throw new Error('Offline mode requires --input');
  if (o.resume && (o.input || o.shopify)) throw new Error('Resume uses saved input; omit --input and --shopify');
  mkdirSync(o.out, { recursive: true });
  const resultFile = path.join(o.out, 'result.json');
  const markerFile = path.join(o.out, 'shopify-marker.json');
  const lockFile = path.join(o.out, '.run.lock');
  const lock = openSync(lockFile, 'wx');
  try {
    const prior = o.resume ? json(resultFile) : null;
    if (!o.resume && existsSync(resultFile) && ['submission-pending', 'submitted', 'completed'].includes(json(resultFile).state)) {
      throw new Error('This folder records a paid attempt. Resume it or inspect it before choosing a new output folder');
    }
    const config = checkConfig({ ...defaults, ...json(o.config), source: prior?.source || (o.shopify ? 'shopify' : 'sheet'),
      ...(process.env.SHOPIFY_SHOP_DOMAIN ? { shopDomain: process.env.SHOPIFY_SHOP_DOMAIN } : {}),
      ...(o['dry-run'] ? { dryRun: true } : {}),
    });
    const marker = existsSync(markerFile) ? json(markerFile) : {};
    let input;
    if (!prior) {
      if (o.input) input = json(o.input);
      else {
        if (!process.env.SHOPIFY_ACCESS_TOKEN) throw new Error('Set SHOPIFY_ACCESS_TOKEN');
        const response = await fetch(`https://${config.shopDomain}.myshopify.com/admin/api/${config.apiVersion}/products.json?limit=5&order=created_at+desc`, {
          headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }, signal: AbortSignal.timeout(20000),
        });
        input = { statusCode: response.status, body: await response.json() };
      }
    }
    let musicProbe = {};
    if (!o.offline && !prior && config.musicUrl) {
      try {
        const response = await fetch(config.musicUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        musicProbe = { statusCode: response.status, headers: Object.fromEntries(response.headers) };
      } catch { musicProbe = { error: 'Music check failed' }; }
    }
    const client = o.offline ? null : new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }),
    });
    const state = await run({ input, config, client, marker, prior, offline: o.offline, musicProbe,
      maxCredits: o['max-credits'] === undefined ? undefined : Number(o['max-credits']),
      save: value => write(resultFile, value), saveProject: value => write(path.join(o.out, 'project.json'), value),
      saveMarker: value => write(markerFile, value),
    });
    console.log(JSON.stringify({ state: state.state, product: state.product.title, creditsQuoted: state.creditsQuoted, result: resultFile }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
