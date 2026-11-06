#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildSale, run } from './workflow.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: args } = parseArgs({ options: {
    input: { type: 'string', default: 'data/sale.json' }, config: { type: 'string', default: 'config.json' },
    out: { type: 'string', default: 'out/run' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    resume: { type: 'boolean' }, 'max-credits': { type: 'string' },
  } });
  if (args.resume && (args.offline || args['dry-run'])) throw new Error('--resume checks saved render jobs; omit --offline and --dry-run');
  mkdirSync(args.out, { recursive: true });
  const file = path.join(args.out, 'result.json');
  const lockPath = path.join(args.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  const save = state => { writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2) + '\n'); renameSync(`${file}.tmp`, file); };
  try {
    const prior = existsSync(file) ? json(file) : null;
    if (args.resume && !prior) throw new Error('No saved run exists at this --out path');
    if (args.resume && ['offline', 'dry-run', 'validated'].includes(prior.state)) throw new Error('No render was attempted in this run. Omit --resume to validate again before rendering.');
    if (!args.resume && prior && !['offline', 'dry-run', 'validated'].includes(prior.state)) throw new Error('This output folder records a render attempt. Use --resume or inspect it before choosing a new --out');
    const items = args.resume ? prior.items : buildSale(json(args.input), json(args.config));
    if (args.offline) { save({ state: 'offline', items }); console.log('Built video and banner project JSON in ' + file + '. No API calls or renders.'); return; }
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000) }), });
    const state = await run({ items, client, prior: args.resume ? prior : null, dryRun: Boolean(args['dry-run']),
      maxCredits: args['max-credits'] === undefined ? undefined : Number(args['max-credits']), save });
    console.log(JSON.stringify({ state: state.state, creditsQuoted: state.creditsQuoted, result: file, outputs: state.items.map(i => ({ kind: i.kind, url: i.url || null })) }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
