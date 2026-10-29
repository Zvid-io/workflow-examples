import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const bytes = readFileSync(new URL('../n8n/workflow.json', import.meta.url));
const workflow = JSON.parse(bytes);
export const workflowSha256 = createHash('sha256').update(bytes).digest('hex');
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);
const code = name => workflow.nodes.find(n => n.name === name).parameters.jsCode;

// Execute only the checked-in workflow's own mapper, never user-supplied code.
export function buildSale(row, config = {}) {
  const cfg = { ...defaults, ...config };
  const rows = [{ json: { ...row, row_number: 2 } }];
  const selected = new Function('$input', code('Pick next sale'))({ all: () => rows })[0].json;
  if (!selected.found) throw new Error('The sale has a Status already. Use a new pending row.');
  if (cfg.musicUrl) throw new Error('This companion uses silent output. Keep musicUrl empty; add licensed audio in a reviewed adaptation.');
  selected.musicUrl = '';
  selected.musicNote = 'Silent example';
  const built = new Function('$', '$input', code('Build project JSON'))(
    name => { if (name !== 'Config') throw new Error(`Unexpected node: ${name}`); return { first: () => ({ json: cfg }) }; },
    { first: () => ({ json: selected }) },
  );
  return built.map(item => item.json);
}

export async function run({ items, client, prior, dryRun = false, maxCredits, save, pollMs = 10_000, timeoutMs = 1_200_000, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  let state = prior || { version: 1, state: 'prepared', workflowSha256, items, creditsQuoted: 0 };
  if (!prior) {
    for (const item of state.items) {
      const quote = await client.authoring.validate({ payload: item.payload });
      if (!quote.valid) throw new Error(`${item.kind} validation failed: ${JSON.stringify(quote.errors || quote.error)}`);
      const credits = Number(quote.creditsRequired);
      if (!Number.isFinite(credits) || credits < 0) throw new Error(`${item.kind} has no usable credit quote`);
      item.creditsQuoted = credits;
      item.warnings = quote.warnings || [];
      state.creditsQuoted += credits;
    }
    state.state = dryRun ? 'dry-run' : 'validated';
    save(state);
    if (dryRun) return state;
  }
  if (!Number.isFinite(maxCredits) || maxCredits < state.creditsQuoted) throw new Error(`Set --max-credits to at least ${state.creditsQuoted} to authorize this quoted pair`);
  for (const item of state.items) {
    if (item.status === 'completed') continue;
    if (['submitting', 'unknown'].includes(item.status) && !item.jobId) throw new Error(`${item.kind} submission is uncertain. Check the dashboard before starting another render; this run will not resubmit it`);
    if (item.status === 'failed') throw new Error(`${item.kind} failed; inspect its saved job before creating a new run`);
    if (item.status === 'rejected' && Date.now() < item.retryNotBefore) throw new Error('Capacity was rejected. Wait at least 30 seconds and any longer server retry delay before resuming.');
    if (!item.jobId) {
      item.status = 'submitting'; state.state = 'rendering'; save(state);
      try {
        const accepted = await client.renders.create({ payload: item.payload });
        if (!accepted.jobId) throw new Error('Accepted response contained no jobId');
        item.jobId = accepted.jobId; item.status = 'accepted'; save(state);
      } catch (error) {
        item.status = error.status === 429 ? 'rejected' : 'unknown';
        if (error.status === 429) item.retryNotBefore = Date.now() + Math.max(30, Number(error.retryAfter) || 0) * 1000;
        item.error = error.status === 429 ? 'Capacity rejected the submission. Wait at least 30 seconds, then resume.' : 'Submission outcome is uncertain. Inspect the dashboard.';
        state.state = item.status; save(state); throw new Error(item.error);
      }
    }
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const job = await client.jobs.get(item.jobId);
      item.status = job.state;
      if (job.state === 'failed') {
        item.error = job.failedReason || 'Render failed'; state.state = 'failed'; save(state); throw new Error(`${item.kind}: ${item.error}`);
      }
      if (job.state === 'completed') {
        item.url = typeof job.result === 'string' ? job.result : job.result?.url;
        if (!item.url) { item.status = 'missing-output'; save(state); throw new Error(`${item.kind} completed without an output URL`); }
        if (new URL(item.url).protocol !== 'https:') { item.status = 'invalid-output'; save(state); throw new Error(`${item.kind} output URL must use HTTPS`); }
        save(state); break;
      }
      save(state);
      if (Date.now() >= deadline) { state.state = 'waiting'; save(state); throw new Error(`Polling timed out for ${item.kind}; use --resume to check the saved job`); }
      await sleep(pollMs);
    }
  }
  state.state = 'completed'; save(state); return state;
}
