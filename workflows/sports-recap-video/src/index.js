import {existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ZvidClient} from '@zvid/sdk';
import {run} from './run.js';
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, value) => {writeFileSync(p + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(p + '.tmp', p);};
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const {values: o} = parseArgs({options: {input: {type: 'string', default: 'data/match.json'}, config: {type: 'string', default: 'config.json'}, out: {type: 'string', default: 'out/live'}, offline: {type: 'boolean'}, 'dry-run': {type: 'boolean'}, render: {type: 'boolean'}, 'max-credits': {type: 'string'}, resume: {type: 'boolean'}, fetch: {type: 'boolean'}}});
  if ([o.offline, o['dry-run'], o.render, o.resume].filter(Boolean).length > 1) throw new Error('Choose offline, dry-run, render or resume');
  if (o.resume && o.fetch) throw new Error('Resume uses the saved accepted job, not a new source fetch');
  if (!o.offline && !process.env.ZVID_API_KEY) throw new Error('Set ZVID_API_KEY in .env');
  mkdirSync(o.out, {recursive: true});
  const output = path.join(o.out, 'result.json'), lockPath = path.join(o.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  try {
    const existing = existsSync(output) ? json(output) : null;
    if (!o.resume && ['submission-pending', 'submitted', 'completed'].includes(existing?.state)) throw new Error('This folder has a paid attempt; use --resume or inspect it before choosing a new folder');
    if (o.resume && !existing) throw new Error('No result.json to resume');
    const input = o.resume ? null : json(o.input), config = json(o.config);
    if (o.fetch) {
      if (!/^\d+$/.test(String(input.request.EventId))) throw new Error('EventId must be numeric');
      if (!process.env.SPORTSDB_API_KEY) throw new Error('Set SPORTSDB_API_KEY to fetch current facts');
      const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(process.env.SPORTSDB_API_KEY)}/lookupevent.php?id=${encodeURIComponent(input.request.EventId)}`;
      const response = await fetch(url, {signal: AbortSignal.timeout(20000)});
      input.response = {statusCode: response.status, body: await response.json()};
    }
    const client = o.offline ? null : new ZvidClient({apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0, fetch: (u, init) => fetch(u, {...init, signal: AbortSignal.timeout(120000)})});
    const state = await run({config, input, client, offline: o.offline, render: o.render, maxCredits: o['max-credits'] === undefined ? undefined : Number(o['max-credits']), prior: o.resume ? existing : null, save: s => write(output, s), saveProject: p => write(path.join(o.out, 'project.json'), p)});
    console.log(JSON.stringify({state: state.state, reviewStatus: state.plan?.status, creditsQuoted: state.creditsQuoted, result: output}, null, 2));
  } finally {closeSync(lock); unlinkSync(lockPath);}
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
