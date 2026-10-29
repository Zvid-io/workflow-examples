import { readFileSync } from 'node:fs';

export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Run only the checked-in canonical workflow code, never remote or user-supplied code.
export function createRunner(config = defaults) {
  const outputs = new Map([['Config', [{ json: config }]]]);
  const put = (name, value) => { outputs.set(name, Array.isArray(value) ? value : [{ json: value }]); return outputs.get(name); };
  const lookup = name => {
    const values = outputs.get(name);
    if (!values) throw new Error(`Missing preceding node: ${name}`);
    return { first: () => values[0], all: () => values };
  };
  const run = (name, input = []) => {
    const node = workflow.nodes.find(n => n.name === name);
    if (!node?.parameters?.jsCode) throw new Error(`Unknown Code node: ${name}`);
    const items = Array.isArray(input) ? input : [{ json: input }];
    return put(name, new Function('$', '$input', node.parameters.jsCode)(lookup, { first: () => items[0], all: () => items }));
  };
  return { put, run, get: name => lookup(name).first().json };
}

export async function readBounded(response, limit) {
  if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (type.includes('text/html')) throw new Error('Source returned HTML instead of a video file.');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('Source ignored Range or exceeded maxTranscribeMB. No transcription requested.'); }
    chunks.push(value);
  }
  if (!size) throw new Error('Source returned an empty video file.');
  return new Blob(chunks, { type: type || 'video/mp4' });
}

export function buildFromResponses({ config, input, transcript, highlights }) {
  const runner = createRunner(config);
  runner.run('Video request', input);
  runner.run('Read transcript', transcript);
  const clips = runner.run('Prepare clips', highlights);
  const projects = runner.run('Build project JSON', clips).map(x => x.json);
  return { projects, config, input: runner.get('Video request') };
}

export async function prepareLive({ config, input, elevenLabsKey, openRouterKey, request = fetch, checkpoint = () => {} }) {
  if (!elevenLabsKey || !openRouterKey) throw new Error('Set ELEVENLABS_API_KEY and OPENROUTER_API_KEY.');
  const limit = Math.floor(Number(config.maxTranscribeMB) * 1024 * 1024);
  if (!Number.isFinite(limit) || limit < 1024 || limit > 1024 * 1024 * 1024) throw new Error('maxTranscribeMB must be between 0.001 and 1024.');
  const runner = createRunner(config);
  const normalized = runner.run('Video request', input)[0].json;
  const source = await request(normalized.videoUrl, { headers: { Range: `bytes=0-${limit - 1}` }, signal: AbortSignal.timeout(120000) });
  const video = await readBounded(source, limit);
  const form = new FormData();
  form.set('file', video, 'source.mp4');
  form.set('model_id', config.scribeModel);
  form.set('timestamps_granularity', 'word');
  // One request only. Do not retry paid transcription automatically.
  checkpoint('transcription-requested', { model: config.scribeModel, sourceBytes: video.size });
  const speech = await request('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': elevenLabsKey }, body: form, signal: AbortSignal.timeout(120000),
  });
  if (!speech.ok) throw new Error(`Speech-to-text failed: HTTP ${speech.status}. Inspect the provider before retrying.`);
  const transcript = await speech.json();
  checkpoint('transcript', transcript);
  const words = runner.run('Read transcript', transcript)[0].json;
  let highlights = {};
  checkpoint('highlight-requested', { model: config.llmModel });
  try {
    const response = await request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.llmModel, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You are a short-form video editor. Return JSON only. Never invent words; choose transcript ranges by index.' },
        { role: 'user', content: words.promptText },
      ] }), signal: AbortSignal.timeout(120000),
    });
    if (response.ok) { highlights = await response.json(); checkpoint('highlights', highlights); }
  } catch { /* The canonical selector supports a deterministic split fallback. */ }
  return buildFromResponses({ config, input, transcript, highlights });
}

export function assertResumableState(state) {
  if (state.clips.some(clip => clip.status === 'submitting' && !clip.jobId)) {
    throw new Error('An earlier submission has no confirmed job ID. Inspect Zvid before resuming or retrying.');
  }
  if (!state.clips.some(clip => clip.jobId)) throw new Error('No accepted jobs are saved. Inspect preparation, then use render-prepared with an explicit cap.');
}

export async function validateProjects(client, projects) {
  const quotes = [];
  for (const project of projects) {
    const checked = await client.authoring.validate({ payload: project.payload });
    if (!checked.valid) throw new Error(`Zvid rejected a clip: ${JSON.stringify(checked.errors || checked.message)}`);
    const quote = Number(checked.creditsRequired);
    if (!Number.isFinite(quote) || quote <= 0) throw new Error('Validation returned no positive credit estimate.');
    quotes.push(quote);
  }
  return quotes;
}

export function checkBudget(quotes, maxCredits) {
  const total = quotes.reduce((sum, quote) => sum + quote, 0);
  if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Rendering requires --max-credits with a positive limit.');
  if (!Number.isFinite(total) || total <= 0 || total > maxCredits) throw new Error(`Quoted ${total} credits exceeds or invalidates the cap ${maxCredits}. No jobs submitted.`);
  return total;
}

export async function submitClip({ client, project, state, save }) {
  state.status = 'submitting'; save();
  const result = await client.renders.create({ payload: project.payload });
  if (!result.jobId) throw new Error('No jobId was returned. Inspect Zvid before any retry.');
  state.jobId = result.jobId; state.status = 'submitted'; save();
}
