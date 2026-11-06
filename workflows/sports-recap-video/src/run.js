import { review, project } from './workflow.js';
export async function run({config, input, client, offline = false, render = false, maxCredits, prior, save = () => {}, saveProject = () => {}}) {
  let state = prior;
  if (!state) {
    const plan = review({...config, dryRun: !render}, input);
    state = {version: 1, state: 'review', plan, history: input.history};
    save(state);
    if (!plan.ready) return state;
    const payload = project(config, plan);
    saveProject(payload);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quote = await client.authoring.validate({payload});
    if (!quote.valid) throw new Error('Project validation failed; inspect the returned design before rendering');
    if (!Number.isFinite(quote.creditsRequired) || quote.creditsRequired < 0) throw new Error('No usable credit quote');
    state.creditsQuoted = quote.creditsRequired; state.warnings = quote.warnings || []; state.state = 'validated'; save(state);
    if (!render) return state;
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Rendering requires a positive --max-credits ceiling');
    if (quote.creditsRequired > Math.min(maxCredits, config.maxCreditsPerVideo)) throw new Error('Credit quote exceeds the ceiling; no render submitted');
    state.state = 'submission-pending'; save(state);
    const receipt = await client.renders.create({payload});
    if (!receipt.jobId) throw new Error('No accepted job ID. Inspect Zvid before another submission');
    state.jobId = receipt.jobId; state.state = 'submitted'; save(state);
  }
  if (!state.jobId) throw new Error('No saved job ID. Inspect Zvid before another submission');
  const job = await client.jobs.wait(state.jobId, {timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000});
  const videoUrl = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//.test(videoUrl || '')) throw new Error('Saved job has no completed HTTPS output; preserve result.json and inspect its status');
  state.state = 'completed'; state.videoUrl = videoUrl; state.outputExpiresAt = job.outputExpiresAt || null;
  const plan = {...state.plan, snapshotVersion: 1};
  state.completedHistoryRow = {RenderKey: plan.renderKey, Status: 'completed', JobId: state.jobId, CreditsQuoted: state.creditsQuoted, PlanJson: JSON.stringify(plan), VideoUrl: videoUrl, CompletedAt: new Date().toISOString()};
  save(state); return state;
}
