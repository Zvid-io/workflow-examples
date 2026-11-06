#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildProject } from './build-project.js';
import { normalizeDeal } from './normalize.js';
import { renderEdition } from './render.js';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: args } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, input: { type: 'string', default: 'data/deal.json' },
    out: { type: 'string', default: 'out/sample' }, validate: { type: 'boolean' }, render: { type: 'boolean' },
    resume: { type: 'boolean' }, 'max-credits': { type: 'string' },
  } });
  if ([args.validate, args.render, args.resume].filter(Boolean).length > 1) throw new Error('Choose one of --validate, --render or --resume');
  if ((args.validate || args.render || args.resume) && !process.env.ZVID_API_KEY) throw new Error('Set ZVID_API_KEY in your private .env file');
  const config = read(args.config);
  if (!Number.isFinite(config.pollSeconds) || config.pollSeconds <= 0 || !Number.isFinite(config.timeoutMinutes) || config.timeoutMinutes <= 0) throw new Error('pollSeconds and timeoutMinutes must be positive numbers');
  if (args.render && !(Number(args['max-credits']) > 0)) throw new Error('Rendering requires --max-credits with a positive limit');
  mkdirSync(args.out, { recursive: true });
  const file = name => path.join(args.out, name);
  const lockFile = file('.run.lock');
  const lock = openSync(lockFile, 'wx');
  const save = (name, value) => { writeFileSync(file(name) + '.tmp', JSON.stringify(value, null, 2) + '\n'); renameSync(file(name) + '.tmp', file(name)); };
  try {
    const prior = existsSync(file('result.json')) ? read(file('result.json')) : null;
    if (args.resume && !prior?.jobId) throw new Error('No saved job ID. Check the Zvid dashboard before another paid submission');
    if (!args.resume && prior && prior.state !== 'validated') throw new Error('A render was already attempted here. Use --resume to inspect its saved job');
    let payload;
    if (!args.resume) {
      let probe = {};
      if (config.musicUrl && (args.validate || args.render)) {
        try { const r = await fetch(config.musicUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) }); probe = { statusCode: r.status, headers: Object.fromEntries(r.headers) }; }
        catch { probe = { statusCode: 0 }; }
      }
      const built = buildProject(config, normalizeDeal(read(args.input), config), probe);
      payload = built.payload; save('project.json', payload); save('summary.json', built.meta);
      if (!args.validate && !args.render) { console.log('Built project.json locally. No network requests or credits spent. Optional music is not probed in offline mode.'); return; }
    }
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(120000) }) });
    const result = await renderEdition({ payload, client, prior: args.resume ? prior : null,
      validateOnly: args.validate, maxCredits: Number(args['max-credits']), pollSeconds: config.pollSeconds,
      timeoutMinutes: config.timeoutMinutes, save: state => save('result.json', state) });
    if (result.state === 'completed') {
      const response = await fetch(result.videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Video download failed (${response.status}); run --resume to retry the download without rendering again`);
      writeFileSync(file('video.mp4'), new Uint8Array(await response.arrayBuffer()));
    }
    console.log(JSON.stringify({ state: result.state, creditsQuoted: result.creditsQuoted, result: file('result.json'), video: result.state === 'completed' ? file('video.mp4') : undefined }, null, 2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
