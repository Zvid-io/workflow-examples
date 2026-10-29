import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { run } from './run.js';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(`${file}.tmp`, file); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: o } = parseArgs({ options: { input: { type: 'string', default: 'data/cart.json' }, config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out/live' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, resume: { type: 'boolean' }, 'max-credits': { type: 'string' } } });
  const config = { ...json(o.config), ...(o['dry-run'] ? { dryRun: true } : {}) };
  mkdirSync(o.out, { recursive: true });
  const file = path.join(o.out, 'result.json'), lockFile = path.join(o.out, '.lock');
  const lock = openSync(lockFile, 'wx');
  try {
    if (!o.resume && existsSync(file)) throw new Error('A saved run exists. Use --resume to poll its job, or a new --out for a new run');
    const prior = o.resume ? json(file) : null;
    let probe = {};
    if (!o.offline && !prior && config.musicUrl) {
      try { const r = await fetch(config.musicUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) }); probe = { statusCode: r.status, headers: Object.fromEntries(r.headers) }; } catch { /* music is optional */ }
    }
    const client = o.offline ? null : new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }) });
    const state = await run({ rows: prior ? null : json(o.input), config, client, offline: o.offline, prior, probe,
      maxCredits: o['max-credits'] === undefined ? undefined : Number(o['max-credits']), save: v => write(file, v), saveProject: v => write(path.join(o.out, 'project.json'), v) });
    console.log(JSON.stringify({ state: state.state, creditsQuoted: state.creditsQuoted, resultFile: file }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
