import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ZvidClient } from '@zvid/sdk';
import { canSubmit, checkedQuote, composeDraft, unpack, waitForVideo } from './agent.js';

const json = file => JSON.parse(readFileSync(file, 'utf8'));
const atomic = (file, value) => { const temporary = file + '.tmp'; writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, file); };

async function main() {
  const { values: opts, positionals } = parseArgs({ allowPositionals: true, options: { project: { type: 'string' }, brief: { type: 'string', default: 'data/brief.txt' }, out: { type: 'string', default: 'out' }, approve: { type: 'boolean', default: false }, 'max-credits': { type: 'string' }, help: { type: 'boolean' } } });
  const command = positionals[0] || 'draft';
  if (opts.help) { console.log('draft [--project data/project.json] | quote | render --approve | status\nOptions: --brief data/brief.txt --out out --max-credits 25'); return; }
  if (!['draft', 'quote', 'render', 'status'].includes(command)) throw new Error('Choose draft, quote, render, or status.');
  const ceiling = Number(opts['max-credits'] || process.env.MAX_RENDER_CREDITS || 25);
  if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 10000) throw new Error('The credit ceiling must be a whole number between 1 and 10000.');
  if (!process.env.ZVID_API_KEY) throw new Error('Set ZVID_API_KEY in your private .env file.');
  mkdirSync(opts.out, { recursive: true });
  const lockPath = path.join(opts.out, '.run.lock');
  let lock;
  try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('This output folder is in use or a command was interrupted. Confirm no command is running before removing .run.lock.'); }
  const statePath = path.join(opts.out, 'state.json');
  let state = existsSync(statePath) ? json(statePath) : { idempotencyKey: randomUUID() };
  const save = async patch => { state = { ...state, ...patch }; atomic(statePath, state); };
  const api = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: 'https://api.zvid.io', maxRetries: 0 });
  let mcp;
  try {
    if (command !== 'status') {
      mcp = new Client({ name: 'zvid-chat-video-example', version: '1.0.0' });
      await mcp.connect(new StreamableHTTPClientTransport(new URL(`https://mcp.zvid.io/mcp?profile=creator&maxRenderCredits=${ceiling}`), { requestInit: { headers: { 'x-api-key': process.env.ZVID_API_KEY } } }));
    }
    const call = (name, args) => mcp.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
    if (command === 'draft') {
      if (state.quote || state.submissionAttempted || state.jobId) throw new Error('This folder already contains a draft or render. Choose a new --out folder for a deliberate new draft.');
      const brief = readFileSync(opts.brief, 'utf8').trim();
      let quote;
      if (opts.project) quote = unpack(await call('create_media', { brief, payload: json(opts.project) }));
      else {
        if (!process.env.OPENROUTER_API_KEY) throw new Error('Set OPENROUTER_API_KEY for model drafting, or use --project data/project.json.');
        let all = [], cursor;
        do { const page = await mcp.listTools(cursor ? { cursor } : {}); all.push(...page.tools); cursor = page.nextCursor; } while (cursor);
        let count = 0;
        quote = await composeDraft({ brief, availableTools: all, callTool: call, onTool: async (name, raw) => atomic(path.join(opts.out, `tool-${++count}.json`), { name, raw }), complete: async (messages, tools) => {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1', messages, tools, temperature: 0.2, max_tokens: 16384 }), signal: AbortSignal.timeout(120000) });
          if (!response.ok) throw new Error(`Model request failed (${response.status}). No render submitted.`);
          const body = await response.json();
          if (!body.choices?.[0]?.message) throw new Error('Model returned no usable response.');
          return body.choices[0].message;
        } });
      }
      await save({ quote, state: 'draft' });
      checkedQuote(quote, ceiling);
      console.log(`Draft saved. ${quote.estimatedCredits} credits quoted. Review ${quote.editorUrl}. Run render --approve only after reviewing.`);
      return;
    }
    if (command === 'quote') {
      if (!state.quote?.draftId || state.jobId || state.submissionAttempted) throw new Error('Quote refresh needs an unsubmitted saved draft.');
      const quote = unpack(await call('get_media', { mediaId: state.quote.draftId, includePayload: false }));
      await save({ quote }); checkedQuote(quote, ceiling);
      console.log(`Fresh quote: ${quote.estimatedCredits} credits. Review ${quote.editorUrl} before approving.`); return;
    }
    if (command === 'render') {
      const args = canSubmit(state, opts.approve, ceiling);
      await save({ submissionAttempted: true, state: 'submission-pending', requestedJobId: state.idempotencyKey });
      const result = unpack(await call('render_media', args));
      if (!result.jobId) throw new Error('Submission outcome is uncertain. Run status to inspect the saved requested ID; do not create a new render.');
      await save({ jobId: result.jobId, state: 'submitted' });
    }
    const jobId = state.jobId || state.requestedJobId;
    if (!jobId) throw new Error('No saved render job. Review the draft before rendering.');
    const videoUrl = await waitForVideo(api, jobId, { save });
    await save({ videoUrl, state: 'completed' });
    const response = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Video download failed. Run status to retry without rendering again.');
    writeFileSync(path.join(opts.out, 'video.mp4'), Buffer.from(await response.arrayBuffer()));
    console.log(`Saved ${path.join(opts.out, 'video.mp4')}. No Telegram message sent.`);
  } finally { if (mcp) await mcp.close().catch(() => {}); closeSync(lock); unlinkSync(lockPath); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
