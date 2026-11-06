#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { defaults } from './workflow.js';
import { run } from './run.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${file}.tmp`, file); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: o } = parseArgs({ options: {
    input: { type: 'string' }, config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out/compilation' },
    offline: { type: 'boolean' }, render: { type: 'boolean' }, resume: { type: 'boolean' },
    'max-credits': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (o.help) { console.log('Default validates only. Use --input data/testimonials.json; --offline to build without API calls; --render --max-credits N to render; --resume --out <saved-folder> to poll a saved job. Read README.md.'); return; }
  if (o.resume && (o.input || o.offline || o.render)) throw new Error('Resume uses saved state; omit input, offline and render');
  if (o.offline && o.render) throw new Error('Choose offline or render');
  if (!o.resume && !o.input) throw new Error('Provide --input <JSON>');
  mkdirSync(o.out, { recursive: true });
  const stateFile = path.join(o.out, 'result.json');
  const lockFile = path.join(o.out, '.run.lock');
  const lock = openSync(lockFile, 'wx');
  try {
    if (!o.resume && existsSync(stateFile) && ['submission-pending', 'submitted', 'completed'].includes(json(stateFile).state)) throw new Error('This folder records a paid attempt. Resume it or inspect it before choosing another output folder');
    if (!o.resume && existsSync(stateFile)) {
      const previous = json(stateFile);
      if (previous.state === 'rejected' && Date.now() < previous.retryAt) throw new Error('Capacity rejection is still within its retry delay. Wait until retryAt in result.json before retrying');
    }
    const config = { ...defaults, ...json(o.config) };
    const client = o.offline ? null : new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }),
    });
    const state = await run({ input: o.resume ? undefined : json(o.input), config, client, offline: o.offline, render: o.render,
      prior: o.resume ? json(stateFile) : undefined,
      maxCredits: o['max-credits'] === undefined ? undefined : Number(o['max-credits']),
      save: state => write(stateFile, state), saveProject: project => write(path.join(o.out, 'project.json'), project),
    });
    if (state.state === 'completed') {
      const response = await fetch(state.videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Video download returned ${response.status}; completed job remains saved`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1024 || bytes.subarray(4, 8).toString() !== 'ftyp') throw new Error('Downloaded response is not an MP4; completed job remains saved');
      writeFileSync(path.join(o.out, 'video.mp4'), bytes);
    }
    console.log(JSON.stringify({ state: state.state, quotes: state.meta?.quoteCount, seconds: state.meta?.totalSeconds, creditsQuoted: state.creditsQuoted, output: o.out }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
