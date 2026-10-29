import { build } from './workflow.js';
export async function run({config, input, now, client, offline=false, dryRun=true, maxCredits, prior, save=()=>{}, saveArtifacts=()=>{}}) {
  let state = prior;
  if (!state) {
    const built = build(config, input, now);
    if (!built.ready) return { state: 'nothing_to_render', reason: built.reason };
    saveArtifacts(built);
    state = { version: 1, state: 'prepared', renderKey: built.renderKey, decisions: built.decisions };
    save(state);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quote = await client.authoring.validate({ payload: built.payload });
    if (!quote.valid) throw Error(`Validation failed: ${JSON.stringify(quote.errors || [])}`);
    if (!Number.isFinite(quote.creditsRequired) || quote.creditsRequired < 0) throw Error('No usable credit quote');
    state.creditsQuoted = quote.creditsRequired; state.warnings = quote.warnings || []; state.state = 'validated'; save(state);
    if (dryRun) return state;
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw Error('Rendering requires a positive --max-credits ceiling');
    if (quote.creditsRequired > Math.min(maxCredits, config.maxCreditsPerVideo)) throw Error('Credit quote exceeds the configured ceiling; no render submitted');
    state.state = 'submission-pending'; save(state);
    const receipt = await client.renders.create({ payload: built.payload });
    if (!receipt.jobId) throw Error('Submission returned no job ID. Inspect the dashboard before retrying.');
    state.jobId = receipt.jobId; state.state = 'submitted'; save(state);
  }
  if (!state.jobId) throw Error('No saved job ID. Inspect the dashboard before submitting again.');
  const job = await client.jobs.wait(state.jobId, { timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000 });
  const url = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//.test(url || '')) throw Error(`Job ${state.jobId} has no completed HTTPS result`);
  state.state = 'completed'; state.videoUrl = url; state.outputExpiresAt = job.outputExpiresAt || null; save(state); return state;
}
