import { build } from './workflow.js';

export async function run({ config, input, client, offline = false, render = false, maxCredits,
  prior, now, save = () => {}, saveFiles = () => {} }) {
  let state = prior;
  if (!state) {
    const built = build(config, input, now);
    state = { version: 1, state: 'prepared', renderKey: built.plan.renderKey, plan: built.plan, meta: built.meta };
    save(state);
    if (!built.plan.ready) { state.state = 'nothing_to_render'; save(state); return state; }
    saveFiles(built);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quote = await client.authoring.validate({ payload: built.payload });
    if (!quote.valid) throw new Error(`Validation failed: ${JSON.stringify(quote.errors || [])}`);
    if (!Number.isFinite(quote.creditsRequired) || quote.creditsRequired < 0) throw new Error('Missing usable credit quote');
    state.state = 'validated'; state.creditsQuoted = quote.creditsRequired;
    state.warnings = quote.warnings || []; save(state);
    if (!render) return state;
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Rendering requires a positive --max-credits ceiling');
    if (!Number.isFinite(config.maxCreditsPerVideo) || config.maxCreditsPerVideo <= 0) throw new Error('Rendering requires a positive config.maxCreditsPerVideo ceiling');
    const ceiling = Math.min(maxCredits, config.maxCreditsPerVideo);
    if (quote.creditsRequired > ceiling) throw new Error('Credit quote exceeds the lower of --max-credits and config.maxCreditsPerVideo; no render submitted');
    state.state = 'submission-pending'; save(state);
    const receipt = await client.renders.create({ payload: built.payload });
    if (!receipt.jobId) throw new Error('Submission returned no job ID; reconcile the dashboard before trying again');
    state.jobId = receipt.jobId; state.state = 'submitted'; save(state);
  }
  if (!state.jobId) throw new Error('No saved job ID; inspect the dashboard before another paid attempt');
  const job = await client.jobs.wait(state.jobId, { timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000 });
  const url = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//.test(url || '')) throw new Error(`Job ${state.jobId} has no completed HTTPS result`);
  state.state = 'completed'; state.videoUrl = url; state.outputExpiresAt = job.outputExpiresAt || null;
  save(state); return state;
}
