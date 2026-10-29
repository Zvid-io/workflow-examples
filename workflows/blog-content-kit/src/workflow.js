import { readFileSync } from 'node:fs';
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Reuse only this reviewed export's local Code nodes, never downloaded code.
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
    return put(name, new Function('$', '$input', '$getWorkflowStaticData', '$runIndex', node.parameters.jsCode)(lookup, { all: () => items, first: () => items[0] }, () => memory, 0));
  };
  return { run, put, get: name => lookup(name).first().json, memory };
}

export function checkBudget(total, cap) {
  if (!Number.isFinite(total) || total <= 0) throw new Error('Validation did not return a positive kit quote.');
  if (!Number.isFinite(cap) || cap <= 0) throw new Error('Rendering requires --max-credits with a positive kit limit.');
  if (total > cap) throw new Error(`Kit quote ${total} exceeds --max-credits ${cap}. No render submitted.`);
}

export async function prepareLive({ config, openRouterKey, request = fetch, parseFeed, memory = {} }) {
  if (!openRouterKey) throw new Error('Set OPENROUTER_API_KEY before live copy generation.');
  const r = createRunner(config, memory);
  const post = r.run('Pick newest post', (await parseFeed(config.feedUrl)).map(json => ({ json })))[0].json;
  if (!post.found) return { skipped: true, reason: post.reason };
  let html = '';
  try {
    const page = await request(post.link, { signal: AbortSignal.timeout(20000) });
    if (page.ok) html = await page.text();
  } catch { /* Feed text is the documented fallback. */ }
  const prompt = r.run('Prepare kit prompt', { data: html })[0].json;
  const response = await request('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.llmModel, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'You are a social editor. Turn one blog post into concise copy for a three-piece social kit. Return JSON only. Word budgets are hard limits. Never use quotes, emoji or markdown.' },
      { role: 'user', content: prompt.promptText },
    ] }),
  });
  if (!response.ok) throw new Error(`Copy request failed: HTTP ${response.status}. It is not automatically retried.`);
  const parsed = r.run('Parse kit copy', await response.json())[0].json;
  let probe = { statusCode: 0 };
  if (config.musicUrl) {
    try { const result = await request(config.musicUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) }); probe = { statusCode: result.status, headers: Object.fromEntries(result.headers) }; }
    catch { /* A failed optional music probe produces silent videos. */ }
  }
  r.run('Music guard', probe);
  return { pieces: r.run('Build project JSON').map(x => x.json), post: parsed.post, kit: parsed.kit, articleSource: parsed.articleSource, config };
}

export async function validateKit(prepared, client) {
  const quotes = [];
  for (const piece of prepared.pieces) {
    const validation = await client.authoring.validate({ payload: piece.payload });
    if (!validation.valid) throw new Error(`Zvid rejected ${piece.meta.kind}: ${JSON.stringify(validation.errors || validation.message)}`);
    const credits = Number(validation.creditsRequired);
    if (!Number.isFinite(credits) || credits <= 0) throw new Error(`Invalid quote for ${piece.meta.kind}.`);
    quotes.push(credits);
  }
  return quotes;
}

export async function runKit({ prepared, client, state, save, maxCredits, resume = false, download }) {
  if (!Array.isArray(prepared.pieces) || !prepared.pieces.length) throw new Error('Prepared kit has no pieces.');
  if (!state.pieces) state.pieces = prepared.pieces.map(piece => ({ kind: piece.meta.kind, status: 'prepared' }));
  if (state.pieces.length !== prepared.pieces.length || state.pieces.some((p, i) => p.kind !== prepared.pieces[i].meta.kind)) throw new Error('Saved state does not match prepared kit.');
  if (state.pieces.some(p => p.status === 'submitting' && !p.jobId)) throw new Error('A submission has an unknown outcome. Inspect Zvid before creating another paid job.');
  if (!resume && state.pieces.some(p => p.jobId)) throw new Error('This kit already has jobs. Use --resume.');
  // Validate the whole kit before its first paid request, not halfway through.
  const pendingIndexes = state.pieces.map((record, i) => record.jobId ? -1 : i).filter(i => i >= 0);
  const pendingQuotes = pendingIndexes.length ? await validateKit({ pieces: pendingIndexes.map(i => prepared.pieces[i]) }, client) : [];
  const quotes = prepared.pieces.map((_, i) => state.pieces[i].jobId ? Number(state.pieces[i].creditsQuoted) : pendingQuotes[pendingIndexes.indexOf(i)]);
  const alreadyQuoted = state.pieces.reduce((total, p) => total + (p.jobId ? Number(p.creditsQuoted || 0) : 0), 0);
  const pendingQuote = quotes.reduce((total, q, i) => total + (state.pieces[i].jobId ? 0 : q), 0);
  checkBudget(alreadyQuoted + pendingQuote, maxCredits);
  state.kitCreditsQuoted = alreadyQuoted + pendingQuote;
  save(state);
  for (let i = 0; i < prepared.pieces.length; i++) {
    const piece = prepared.pieces[i], record = state.pieces[i];
    if (!record.jobId) {
      record.status = 'submitting'; record.creditsQuoted = quotes[i]; save(state);
      const submit = piece.payload.type === 'image' ? client.renders.createImage : client.renders.create;
      let job;
      try { job = await submit({ payload: piece.payload }); }
      catch (error) {
        if (error.status === 429) { record.status = 'rejected'; record.retryAfter = error.retryAfter || null; save(state); }
        throw error;
      }
      if (!job.jobId) throw new Error('Submission returned no jobId. Inspect Zvid before retrying.');
      record.jobId = job.jobId; record.status = 'submitted'; save(state);
    }
    const job = await client.jobs.wait(record.jobId, { timeoutMs: Number(prepared.config.timeoutMinutes) * 60000, pollIntervalMs: Number(prepared.config.pollSeconds) * 1000, raiseOnFailure: false });
    if (job.state !== 'completed') { record.status = 'failed'; save(state); throw new Error(`Saved ${record.kind} job is ${job.state}. Inspect it before retrying.`); }
    record.status = 'completed'; save(state);
    await download(job, piece, record);
    record.downloaded = true; save(state);
  }
  state.status = 'completed'; save(state);
}
