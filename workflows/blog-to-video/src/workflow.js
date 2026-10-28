import { readFileSync } from 'node:fs';

export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute only the checked-in workflow's Code nodes, keeping its selection,
// script parsing, caption timing and layout identical to the n8n download.
export function createRunner(config = defaults, memory = {}) {
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
    const result = new Function('$', '$input', '$getWorkflowStaticData', '$runIndex', node.parameters.jsCode)(lookup, { all: () => items, first: () => items[0] }, () => memory, 0);
    return put(name, result);
  };
  return { run, put, get: name => lookup(name).first().json, all: name => lookup(name).all(), memory };
}

export function checkBudget(quote, cap) {
  if (!Number.isFinite(quote) || quote <= 0) throw new Error('Validation did not return a positive credit quote.');
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('Rendering requires --max-credits with a positive limit.');
  if (quote > cap) throw new Error(`Quote ${quote} exceeds --max-credits ${cap}. No render submitted.`);
}

export async function prepareLive({ config, client, openRouterKey, elevenLabsKey, request = fetch, parseFeed, memory = {} }) {
  if (!openRouterKey || !elevenLabsKey) throw new Error('Set OPENROUTER_API_KEY and ELEVENLABS_API_KEY before a live run.');
  const r = createRunner(config, memory);
  const get = async (url, init = {}) => {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Service request failed: HTTP ${response.status}`);
    return response;
  };
  const post = r.run('Pick newest post', (await parseFeed(config.feedUrl)).map(json => ({ json })))[0].json;
  if (!post.found) return { skipped: true, reason: post.reason };
  let html = '';
  try { html = await (await get(post.link)).text(); } catch { /* Feed is the supported fallback. */ }
  const prompt = r.run('Prepare prompt', { data: html })[0].json;
  const scriptResponse = await (await get('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.llmModel, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'You turn blog posts into scripts for short vertical summary videos. Return JSON only and use clean spoken English.' },
      { role: 'user', content: prompt.promptText },
    ] }),
  })).json();
  const script = r.run('Parse script', scriptResponse)[0].json;
  const searches = [];
  for (const point of script.points) {
    try { searches.push({ json: await client.request('GET', '/api/stock/search', { query: { type: 'video', query: point.visualQuery, page: 1, perPage: 20 } }) }); }
    catch { searches.push({ json: { items: [] } }); }
  }
  r.run('Pick scene clip', searches);
  const musicSearches = [];
  for (const item of r.run('Music queries')) {
    try { musicSearches.push({ json: await client.request('GET', '/api/stock/search', { query: { type: 'audio', query: item.json.query, page: 1, perPage: 10 } }) }); }
    catch { musicSearches.push({ json: { items: [] } }); }
  }
  const shortlist = r.run('Shortlist music', musicSearches);
  const probes = [];
  for (const item of shortlist) {
    try { const p = await request(item.json.probeUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) }); probes.push({ json: { statusCode: p.status, headers: Object.fromEntries(p.headers) } }); }
    catch { probes.push({ json: { statusCode: 0 } }); }
  }
  r.run('Pick music', probes);
  // One request creates one take. No automatic retry can duplicate this charge.
  const voice = await (await get(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: script.narration, model_id: config.elevenModel, voice_settings: { stability: config.voiceStability, similarity_boost: config.voiceSimilarity } }),
  })).json();
  const timed = r.run('Voice + timings', voice)[0];
  const upload = await client.uploads.create(new Blob([Buffer.from(timed.binary.data.data, 'base64')], { type: 'audio/mpeg' }), { fileName: 'voiceover.mp3' });
  r.put('Upload voiceover', { upload });
  const built = r.run('Build project JSON')[0].json;
  return { ...built, script, config, preparedAt: new Date().toISOString() };
}

export async function renderPrepared({ prepared, client, maxCredits, state, save }) {
  const checked = await client.authoring.validate({ payload: prepared.payload });
  if (!checked.valid) throw new Error(`Zvid rejected the project: ${JSON.stringify(checked.errors || checked.message)}`);
  checkBudget(Number(checked.creditsRequired), maxCredits);
  state.creditsQuoted = Number(checked.creditsRequired);
  state.status = 'submitting'; save(state);
  // maxRetries: 0 on the client avoids automatic paid-submission retries.
  const submitted = await client.renders.create({ payload: prepared.payload });
  if (!submitted.jobId) throw new Error('Render response had no jobId. Inspect Zvid before retrying.');
  state.jobId = submitted.jobId;
  state.status = 'submitted'; save(state);
  return submitted.jobId;
}
