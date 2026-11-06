#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import { ZvidClient, outputUrl } from '@zvid/sdk';
import { defaults, prepareLive, validateKit, runKit } from './workflow.js';
import { saveMedia } from './download.js';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
function saveJson(file, value) { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${file}.tmp`, file); }
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: o } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out/live' },
    sample: { type: 'boolean' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    'render-prepared': { type: 'boolean' }, resume: { type: 'boolean' },
    'allow-generation': { type: 'boolean' }, 'max-credits': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (o.help) { console.log('Read README.md. Offline sample: npm run offline. Live preview: npm run dry-run -- --allow-generation. Render: npm run render-prepared -- --max-credits 29. Recovery: npm run resume -- --max-credits 29.'); return; }
  if (o['dry-run'] && (o['render-prepared'] || o.resume)) throw new Error('--dry-run cannot be combined with --render-prepared or --resume.');
  if (o.offline && !o.sample) throw new Error('--offline requires --sample.');
  if ([o.resume, o['render-prepared'], o.sample].filter(Boolean).length > 1) throw new Error('Choose one of --sample, --render-prepared or --resume.');
  const config = { ...defaults, ...json(o.config), ...(o['dry-run'] ? { dryRun: true } : {}) };
  for (const key of ['pollSeconds', 'timeoutMinutes']) if (!Number.isFinite(Number(config[key])) || Number(config[key]) <= 0) throw new Error(`${key} must be positive.`);
  mkdirSync(o.out, { recursive: true });
  const stateFile = path.join(o.out, 'state.json'), preparedFile = path.join(o.out, 'prepared.json');
  const memoryFile = path.resolve('out/feed-memory.json'), lockPath = path.join(o.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  const save = state => saveJson(stateFile, state);
  try {
    let state = existsSync(stateFile) ? json(stateFile) : { status: 'new' }, prepared;
    if (!o.resume && !o['render-prepared'] && state.pieces?.some(p => p.status !== 'prepared')) throw new Error('This output folder records a render attempt. Inspect it or use --resume.');
    if (o.resume || o['render-prepared']) {
      prepared = json(preparedFile);
      if (state.preparedSha256 !== digest(prepared)) throw new Error('Prepared input changed after it was saved. Use a new output folder.');
      if (o.resume && !state.pieces?.some(p => p.jobId)) throw new Error('No saved job to resume. Inspect any unknown submission before retrying.');
    } else if (o.sample) {
      prepared = json(new URL('../data/sample-prepared.json', import.meta.url));
    } else {
      if (!o['allow-generation']) throw new Error('Live preparation calls OpenRouter. Pass --allow-generation to acknowledge that separate cost.');
      if (!config.dryRun && !(Number(o['max-credits']) > 0)) throw new Error('Set --max-credits before live generation and rendering, or use --dry-run.');
      const parser = new Parser({ timeout: 20000 });
      prepared = await prepareLive({ config, openRouterKey: process.env.OPENROUTER_API_KEY, parseFeed: async url => (await parser.parseURL(url)).items, memory: existsSync(memoryFile) ? json(memoryFile) : {} });
      if (prepared.skipped) { console.log(JSON.stringify(prepared)); return; }
    }
    if (!o.resume && !o['render-prepared']) {
      saveJson(preparedFile, prepared);
      state = { status: o.offline ? 'offline' : 'prepared', sample: Boolean(o.sample), preparedSha256: digest(prepared) }; save(state);
    }
    if (o.offline) { console.log(JSON.stringify({ status: 'offline', pieces: prepared.pieces.length, prepared: preparedFile })); return; }
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }) });
    if (!o.resume && !o['render-prepared'] && config.dryRun) {
      const quotes = await validateKit(prepared, client);
      state.kitCreditsQuoted = quotes.reduce((a, b) => a + b, 0); state.previews = [];
      for (let i = 0; i < prepared.pieces.length; i++) {
        const piece = prepared.pieces[i];
        const preview = { kind: piece.meta.kind, creditsQuoted: quotes[i] };
        try { const draft = await client.projects.create(piece.payload.name, piece.payload); preview.editorLink = `https://editor.zvid.io/?project=${draft.id}`; }
        catch { preview.editorLink = null; preview.warning = 'Draft could not be saved. Check saved-project allowance in Zvid; the validation quote is retained.'; }
        state.previews.push(preview); save(state);
      }
      state.status = 'dry-run'; save(state); console.log(JSON.stringify(state, null, 2)); return;
    }
    await runKit({ prepared, client, state, save, maxCredits: Number(o['max-credits']), resume: Boolean(o.resume), download: async (job, piece, record) => {
      const url = outputUrl(job);
      if (!url) throw new Error('Completed output is unavailable or expired. Inspect Zvid before rendering again.');
      record.outputUrl = url; save(state);
      await saveMedia(url, path.join(o.out, `${piece.meta.kind}.${piece.meta.format}`), piece.meta.format);
    } });
    if (!state.sample && prepared.post.guid) { mkdirSync(path.dirname(memoryFile), { recursive: true }); saveJson(memoryFile, { lastGuid: prepared.post.guid }); }
    console.log(JSON.stringify({ status: state.status, pieces: state.pieces.length, kitCreditsQuoted: state.kitCreditsQuoted, out: o.out }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
