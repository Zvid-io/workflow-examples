import Parser from 'rss-parser';
import { execute } from './workflow.js';

async function requestJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Service returned HTTP ${response.status}; inspect credentials or quota before retrying`);
  return response.json();
}

export async function prepareEdition({ config, client, keys, save, fetchImpl = fetch, warn = console.warn }) {
  for (const [name, value] of Object.entries(keys)) if (!value) throw new Error(`${name} is required for live preparation`);
  const parser = new Parser({ timeout: 30000 });
  const feeds = execute('Plan feeds', [config]).map(x => x.json.feedUrl);
  const items = [];
  for (const url of feeds) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) continue;
      items.push(...(await parser.parseString(await response.text())).items);
    } catch { /* A failed feed contributes nothing, as in the n8n workflow. */ }
  }
  const pool = execute('Pool headlines', items, { Config: config })[0].json;
  save('pool.json', pool);
  // These paid requests are deliberately not retried automatically.
  save('preparation-status.json', { state: 'curation-pending', startedAt: new Date().toISOString() });
  const curation = await requestJson('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${keys.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.llmModel, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'You curate and script a weekly news countdown video. Return JSON only. Every sentence is spoken and captioned. Use clean spoken English without formatting.' },
      { role: 'user', content: pool.promptText },
    ] }),
  }, fetchImpl);
  save('curation.json', curation);
  const rundown = execute('Parse rundown', [curation], { Config: config, 'Pool headlines': pool })[0].json;
  save('rundown.json', rundown);
  const warnings = [];
  const stock = async (type, query, perPage) => {
    try {
      return await client.request('GET', '/api/stock/search', { query: { type, query, provider: 'all', page: 1, perPage } });
    } catch {
      // Optional media must not discard an already prepared script. Do not log
      // service errors: they may include private URLs or authorization details.
      const message = type === 'video'
        ? 'A stock video search failed; this scene will use its designed fallback.'
        : 'A music search failed; continuing with any other usable result or no music.';
      if (!warnings.includes(message)) { warnings.push(message); warn(message); save('preparation-warnings.json', warnings); }
      return { items: [] };
    }
  };
  const clips = [];
  for (const story of rundown.stories) clips.push(await stock('video', story.visualQuery, 20));
  const sceneMedia = execute('Pick story clips', clips, { Config: config, 'Parse rundown': rundown })[0].json.sceneMedia;
  const musicResponses = [];
  for (const query of execute('Music queries', [], { 'Parse rundown': rundown })) musicResponses.push(await stock('audio', query.json.query, 10));
  const shortlist = execute('Shortlist music', musicResponses, { Config: config }).map(x => x.json);
  const probes = [];
  for (const candidate of shortlist) {
    try {
      const response = await fetchImpl(candidate.probeUrl, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      probes.push({ statusCode: response.status, headers: Object.fromEntries(response.headers) });
    } catch { probes.push({ statusCode: 0 }); }
  }
  const music = execute('Pick music', probes, { Config: config, 'Shortlist music': shortlist })[0].json.music;
  save('preparation-status.json', { state: 'voice-pending', startedAt: new Date().toISOString() });
  const voice = await requestJson(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': keys.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: rundown.narration, model_id: config.elevenModel, voice_settings: {
      stability: config.voiceStability, similarity_boost: config.voiceSimilarity,
    } }),
  }, fetchImpl);
  save('voice-response.json', voice);
  const timed = execute('Voice + timings', [voice])[0];
  const upload = await client.uploads.create(new Blob([Buffer.from(voice.audio_base64, 'base64')], { type: 'audio/mpeg' }), { fileName: 'voiceover.mp3' });
  const edition = { rundown, sceneMedia, music, upload: { url: upload.url }, timings: timed.json, warnings };
  save('edition.json', edition);
  save('preparation-status.json', { state: 'prepared', finishedAt: new Date().toISOString() });
  return edition;
}
