import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { run } from './run.js';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(file + '.tmp', file); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: options } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, input: { type: 'string' },
    out: { type: 'string', default: 'out/live' }, offline: { type: 'boolean' },
    render: { type: 'boolean' }, resume: { type: 'boolean' }, 'max-credits': { type: 'string' },
  } });
  if ((options.offline && (options.render || options.resume)) || (options.render && options.resume)) throw new Error('Choose offline, render or resume');
  const config = json(options.config);
  if (!options.resume && config.metricsSource === 'live' && !options.input) throw new Error('Live mode requires --input path/to/metrics.json');
  if (!options.offline && !process.env.ZVID_API_KEY) throw new Error('Set ZVID_API_KEY in .env');
  mkdirSync(options.out, { recursive: true });
  const resultFile = path.join(options.out, 'result.json');
  const lockFile = path.join(options.out, '.run.lock');
  const lock = openSync(lockFile, 'wx');
  try {
    const existing = existsSync(resultFile) ? json(resultFile) : null;
    if (!options.resume && ['submission-pending', 'submitted', 'completed'].includes(existing?.state)) throw new Error('This folder has a paid attempt; use --resume or inspect it before using a new folder');
    if (options.resume && !existing) throw new Error('No result.json to resume');
    const client = options.offline ? null : new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }) });
    const result = await run({ config, input: options.input ? json(options.input) : null,
      client, offline: options.offline, render: options.render,
      maxCredits: options['max-credits'] === undefined ? undefined : Number(options['max-credits']),
      prior: options.resume ? existing : null, save: state => write(resultFile, state),
      saveFiles: built => { write(path.join(options.out, 'project.json'), built.payload); write(path.join(options.out, 'source.json'), built.response.body); writeFileSync(path.join(options.out, 'review.csv'), built.reviewCsv); },
    });
    console.log(JSON.stringify({ state: result.state, creditsQuoted: result.creditsQuoted, result: resultFile }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
