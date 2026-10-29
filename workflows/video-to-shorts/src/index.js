#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient, outputUrl } from '@zvid/sdk';
import { defaults, validateProjects, checkBudget, submitClip, assertResumableState } from './workflow.js';
import { prepareWithJournal } from './preparation.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${file}.tmp`, file); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: options } = parseArgs({ options: {
    config: { type: 'string', default: 'config.json' }, input: { type: 'string', default: 'data/input.json' }, out: { type: 'string', default: 'out/live' },
    sample: { type: 'boolean' }, offline: { type: 'boolean' }, 'allow-ai': { type: 'boolean' },
    'render-prepared': { type: 'boolean' }, resume: { type: 'boolean' }, 'max-credits': { type: 'string' },
  } });
  if ([options.sample, options['render-prepared'], options.resume].filter(Boolean).length > 1) throw new Error('Choose sample, render-prepared or resume, not a combination.');
  if (options.offline && !options.sample) throw new Error('--offline requires --sample.');
  const config = { ...defaults, ...json(options.config) };
  if (!(Number(config.pollSeconds) > 0) || !(Number(config.timeoutMinutes) > 0)) throw new Error('pollSeconds and timeoutMinutes must be positive.');
  mkdirSync(options.out, { recursive: true });
  const lockPath = path.join(options.out, '.run.lock');
  const lock = openSync(lockPath, 'wx');
  try {
    const preparedFile = path.join(options.out, 'prepared.json');
    const stateFile = path.join(options.out, 'state.json');
    let state = existsSync(stateFile) ? json(stateFile) : { clips: [] };
    const save = () => write(stateFile, state);
    let prepared;
    if (options.resume || options['render-prepared']) {
      prepared = json(preparedFile);
      if (!state.clips.length) throw new Error('No saved preparation exists in this output folder.');
    } else {
      if (state.clips.some(c => c.jobId || c.status === 'submitting')) throw new Error('This folder has a render attempt. Resume it or use a different output folder.');
      if (options.sample) prepared = json(new URL('../data/sample-prepared.json', import.meta.url));
      else {
        if (!options['allow-ai']) throw new Error('Live preparation uses paid transcription and a model request. Pass --allow-ai to acknowledge those separate costs.');
        prepared = await prepareWithJournal({ directory: options.out, config, input: json(options.input), elevenLabsKey: process.env.ELEVENLABS_API_KEY, openRouterKey: process.env.OPENROUTER_API_KEY });
      }
      write(preparedFile, prepared);
      state = { mode: options.sample ? 'sample' : 'live', clips: prepared.projects.map((p, index) => ({ index: index + 1, title: p.meta.title, status: 'prepared' })) }; save();
    }
    if (options.offline) { console.log(JSON.stringify({ status: 'offline', prepared: preparedFile, clips: state.clips.length })); return; }
    if (options.resume) assertResumableState(state);
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120000) }) });
    if (!options.resume) {
      if (state.clips.some(c => c.status === 'submitting')) throw new Error('An earlier submission has no confirmed job ID. Inspect Zvid before retrying.');
      const quotes = await validateProjects(client, prepared.projects);
      state.creditsQuoted = quotes.reduce((a, b) => a + b, 0);
      state.clips.forEach((c, i) => { c.creditsQuoted = quotes[i]; }); save();
      if (!options['render-prepared']) { console.log(JSON.stringify({ status: 'validated', creditsQuoted: state.creditsQuoted, prepared: preparedFile })); return; }
      checkBudget(quotes, Number(options['max-credits']));
    }
    for (let i = 0; i < state.clips.length; i++) {
      const clip = state.clips[i];
      if (!clip.jobId) {
        if (options.resume) continue;
        await submitClip({ client, project: prepared.projects[i], state: clip, save });
      }
      if (clip.status !== 'completed') {
        const job = await client.jobs.wait(clip.jobId, { pollIntervalMs: Number(config.pollSeconds) * 1000, timeoutMs: Number(config.timeoutMinutes) * 60000, raiseOnFailure: false });
        if (job.state !== 'completed') { clip.status = 'failed'; save(); throw new Error(`Clip ${i + 1} did not complete: ${job.failedReason || job.state}. Inspect its saved jobId; do not submit it again blindly.`); }
        const url = outputUrl(job);
        if (!url) throw new Error('Completed output is unavailable or expired. Inspect the saved job.');
        clip.status = 'completed'; clip.videoUrl = url; save();
      }
      const response = await fetch(clip.videoUrl, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Download failed (${response.status}). Use resume to retry the existing output.`);
      writeFileSync(path.join(options.out, `clip-${i + 1}.mp4`), Buffer.from(await response.arrayBuffer()));
    }
    if (options.resume && state.clips.some(clip => !clip.jobId)) throw new Error('Saved jobs were checked, but some clips were never submitted. Inspect the state, then use render-prepared with an explicit full batch cap to continue.');
    console.log(JSON.stringify({ clips: state.clips.map(c => ({ clip: c.index, status: c.status })), state: stateFile }));
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
