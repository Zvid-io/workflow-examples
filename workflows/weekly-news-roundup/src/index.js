#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { defaults, checkConfig, buildEdition } from './workflow.js';
import { prepareEdition } from './prepare.js';
import { renderEdition } from './render.js';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: args } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out/live' },
    offline: { type: 'boolean' }, sample: { type: 'boolean' }, prepare: { type: 'boolean' },
    validate: { type: 'boolean' }, resume: { type: 'boolean' }, 'max-credits': { type: 'string' },
  } });
  const config = checkConfig({ ...defaults, ...read(args.config) });
  if ([args.offline, args.prepare, args.validate, args.resume].filter(Boolean).length > 1) throw new Error('Choose one of --offline, --prepare, --validate or --resume');
  mkdirSync(args.out, { recursive: true });
  const lockFile = path.join(args.out, '.run.lock');
  const lock = openSync(lockFile, 'wx');
  const file = name => path.join(args.out, name);
  const save = (name, value) => { writeFileSync(file(name)+'.tmp', JSON.stringify(value,null,2)+'\n'); renameSync(file(name)+'.tmp',file(name)); };
  try {
    if (args.offline) {
      const built = buildEdition(config, read('data/edition.json'));
      save('project.json', built.payload); save('summary.json', built.meta);
      console.log('Built sample project locally; no requests or charges.'); return;
    }
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(120_000) }) });
    if (args.prepare) {
      if (existsSync(file('preparation-status.json'))) throw new Error('Preparation already attempted here. Inspect saved state before choosing a new --out');
      const edition = await prepareEdition({ config, client, save, keys: {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
      } });
      const built = buildEdition(config, edition); save('project.json', built.payload); save('summary.json', built.meta);
      console.log('Prepared one edition. Script and speech charges apply; no render submitted. Review rundown.json and project.json.'); return;
    }
    const prior = existsSync(file('result.json')) ? read(file('result.json')) : null;
    if (prior && !args.resume && prior.state !== 'validated') throw new Error('A render was attempted here. Use --resume; do not submit it again');
    if (args.resume && !prior) throw new Error('No saved result.json to resume');
    let payload;
    if (!args.resume) {
      if (args.sample) { const built = buildEdition(config, read('data/edition.json')); payload = built.payload; save('project.json', payload); }
      else payload = read(file('project.json'));
    }
    const result = await renderEdition({ payload, client, prior: args.resume ? prior : null,
      validateOnly: args.validate || (config.dryRun && !args.resume), maxCredits: Number(args['max-credits']),
      pollSeconds: config.pollSeconds, timeoutMinutes: config.timeoutMinutes, save: value => save('result.json', value) });
    console.log(JSON.stringify({ state: result.state, creditsQuoted: result.creditsQuoted, result: file('result.json') }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
