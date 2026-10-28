#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import Parser from 'rss-parser';
import { ZvidClient, outputUrl } from '@zvid/sdk';
import { defaults, prepareLive, renderPrepared } from './workflow.js';

const json = p => JSON.parse(readFileSync(p, 'utf8'));
function saveJson(p, value) { writeFileSync(`${p}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${p}.tmp`, p); }
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: o } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out/live' },
    sample: { type: 'boolean' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    'render-prepared': { type: 'boolean' }, resume: { type: 'boolean' },
    'allow-generation': { type: 'boolean' }, 'max-credits': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (o.help) { console.log('Read README.md. Offline: npm run offline. Live preview: npm run dry-run -- --allow-generation. Render saved preview: npm run render-prepared -- --max-credits 60. Recover submitted job: npm run resume.'); return; }
  if (o['dry-run'] && (o['render-prepared'] || o.resume)) throw new Error('--dry-run cannot be combined with --render-prepared or --resume. Use the sample or live preview command to validate without rendering.');
  if (o.offline && !o.sample) throw new Error('--offline requires --sample');
  if ([o.resume, o['render-prepared'], o.sample].filter(Boolean).length > 1) throw new Error('Choose only one of --resume, --render-prepared or --sample.');
  const config = { ...defaults, ...json(o.config), ...(o['dry-run'] ? { dryRun: true } : {}) };
  if (!Number.isFinite(Number(config.targetSeconds)) || Number(config.targetSeconds) <= 0) throw new Error('targetSeconds must be positive.');
  if (!Number.isFinite(Number(config.pollSeconds)) || Number(config.pollSeconds) <= 0 || !Number.isFinite(Number(config.timeoutMinutes)) || Number(config.timeoutMinutes) <= 0) throw new Error('pollSeconds and timeoutMinutes must be positive.');
  mkdirSync(o.out, { recursive: true });
  const stateFile = path.join(o.out, 'state.json');
  const projectFile = path.join(o.out, 'prepared.json');
  const memoryFile = path.resolve('out/feed-memory.json');
  const lockPath = path.join(o.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  const save = s => saveJson(stateFile, s);
  try {
    let state = existsSync(stateFile) ? json(stateFile) : { status: 'new' };
    if (!o.resume && !o['render-prepared'] && ['submitting', 'submitted', 'completed', 'failed'].includes(state.status)) throw new Error('This output folder records a render attempt. Inspect it or use --resume.');
    const client = o.offline ? null : new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }) });
    let prepared;
    if (o.resume) {
      if (!state.jobId) throw new Error('No saved jobId. If state is submitting, inspect Zvid before trying again.');
      prepared = json(projectFile);
    } else if (o['render-prepared']) {
      if (!['prepared', 'dry-run', 'offline'].includes(state.status)) throw new Error('Expected a prepared preview with no prior submission.');
      prepared = json(projectFile);
    } else if (o.sample) {
      prepared = json(new URL('../data/sample-prepared.json', import.meta.url));
      saveJson(projectFile, prepared);
      state = { status: o.offline ? 'offline' : 'prepared', sample: true, postTitle: prepared.meta.postTitle }; save(state);
    } else {
      if (!o['allow-generation']) throw new Error('Live preparation uses OpenRouter and ElevenLabs. Pass --allow-generation to acknowledge those separate costs.');
      if (!config.dryRun && (!Number.isFinite(Number(o['max-credits'])) || Number(o['max-credits']) <= 0)) throw new Error('Set --max-credits before a live render, or use --dry-run for preparation only.');
      const parser = new Parser({ timeout: 20000 });
      const memory = existsSync(memoryFile) ? json(memoryFile) : {};
      prepared = await prepareLive({ config, client, openRouterKey: process.env.OPENROUTER_API_KEY, elevenLabsKey: process.env.ELEVENLABS_API_KEY,
        parseFeed: async url => (await parser.parseURL(url)).items, memory });
      if (prepared.skipped) { console.log(JSON.stringify(prepared)); return; }
      saveJson(projectFile, prepared);
      state = { status: 'prepared', sample: false, postTitle: prepared.meta.postTitle }; save(state);
    }
    if (o.offline) { console.log(JSON.stringify({ state: 'offline', project: projectFile, post: prepared.meta.postTitle })); return; }
    if (!o.resume && !o['render-prepared'] && config.dryRun) {
      const check = await client.authoring.validate({ payload: prepared.payload });
      if (!check.valid) throw new Error(`Zvid rejected the project: ${JSON.stringify(check.errors || check.message)}`);
      state.creditsQuoted = check.creditsRequired;
      const draft = await client.projects.create(prepared.payload.name, prepared.payload);
      state.status = 'dry-run'; state.editorLink = `https://editor.zvid.io/?project=${draft.id}`; save(state);
      console.log(JSON.stringify({ ...state, project: projectFile })); return;
    }
    if (!o.resume) await renderPrepared({ prepared, client, maxCredits: Number(o['max-credits']), state, save });
    const job = await client.jobs.wait(state.jobId, { timeoutMs: Number(config.timeoutMinutes) * 60000, pollIntervalMs: Number(config.pollSeconds) * 1000, raiseOnFailure: false });
    if (job.state !== 'completed') { state.status = 'failed'; state.failedReason = job.failedReason || job.state; save(state); throw new Error(`Render failed. Saved job: ${state.jobId}. ${state.failedReason}`); }
    const url = outputUrl(job);
    if (!url) throw new Error('The job completed but its output is unavailable or expired. Inspect Zvid before retrying.');
    state.status = 'completed'; state.videoUrl = url; save(state);
    if (!state.sample && prepared.meta.guid) { mkdirSync(path.dirname(memoryFile), { recursive: true }); saveJson(memoryFile, { lastGuid: prepared.meta.guid }); }
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Video download failed (${response.status}). Run --resume to retry the existing output.`);
    writeFileSync(path.join(o.out, 'video.mp4'), Buffer.from(await response.arrayBuffer()));
    console.log(JSON.stringify({ state: 'completed', video: path.join(o.out, 'video.mp4'), result: stateFile, creditsQuoted: state.creditsQuoted }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
