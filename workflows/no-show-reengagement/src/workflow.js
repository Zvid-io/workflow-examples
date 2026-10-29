import { buildProject } from './build-project.js';

export function prepare(config, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object');
  for (const key of ['firstName', 'eventName']) if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`${key} is required by this example`);
  if (!Array.isArray(config.highlights) || config.highlights.length < 2 || config.highlights.length > 3 || config.highlights.some(x => typeof x !== 'string' || !x.trim())) throw new Error('Provide two or three nonempty highlights');
  if (config.musicUrl) throw new Error('This companion reproduces the silent sample. Leave musicUrl empty; the n8n workflow supports optional music');
  if (input.rebookUrl && !/^https:\/\//.test(input.rebookUrl)) throw new Error('Use an HTTPS rebookUrl');
  return buildProject(config, input, null);
}

export async function renderOne({ payload, client, prior, render = false, maxCredits, save,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 1200000, pollMs = 10000 }) {
  let state = prior;
  if (!state) {
    const validation = await client.authoring.validate({ payload });
    if (!validation.valid) throw new Error(`Zvid rejected the project: ${JSON.stringify(validation.errors || [])}`);
    if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired < 0) throw new Error('No usable credit quote returned');
    state = { state: 'validated', creditsQuoted: validation.creditsRequired, warnings: validation.warnings || [] };
    save(state);
    if (!render) return state;
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Set a positive --max-credits limit before rendering');
    if (validation.creditsRequired > maxCredits) throw new Error(`Quote ${validation.creditsRequired} exceeds limit ${maxCredits}; no render submitted`);
    state.state = 'submission-pending'; save(state);
    const accepted = await client.renders.create({ payload });
    if (!accepted.jobId) throw new Error('No job ID returned. Inspect the Zvid dashboard before another submission');
    state = { ...state, state: 'submitted', jobId: accepted.jobId }; save(state);
  }
  if (!state.jobId) throw new Error('No saved job ID. Inspect the Zvid dashboard before another submission');
  if (state.state === 'completed') return state;
  const deadline = now() + timeoutMs;
  for (;;) {
    const job = await client.jobs.get(state.jobId);
    state.status = job.state; save(state);
    if (job.state === 'failed') { state.state = 'failed'; state.error = job.failedReason || 'Render failed'; save(state); throw new Error(state.error); }
    if (job.state === 'completed') {
      const videoUrl = typeof job.result === 'string' ? job.result : job.result?.url;
      if (!/^https:\/\//.test(videoUrl || '')) throw new Error('Completed job has no HTTPS video URL');
      state.state = 'completed'; state.videoUrl = videoUrl; save(state); return state;
    }
    if (now() >= deadline) throw new Error('Waiting timed out. Resume this saved job without submitting again');
    await sleep(pollMs);
  }
}
