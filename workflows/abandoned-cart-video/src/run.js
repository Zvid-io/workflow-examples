import { build } from './workflow.js';
export async function run({ rows, config, client, offline = false, prior, maxCredits, probe = {}, save = () => {}, saveProject = () => {} }) {
  let state = prior;
  if (!state) {
    const built = build(rows, config, probe);
    state = { state: built.payload ? 'prepared' : 'empty', source: 'local-json' };
    if (!built.payload) { save(state); return state; }
    state.meta = built.meta; saveProject(built.payload); save(state);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quote = await client.authoring.validate({ payload: built.payload });
    if (!quote.valid) throw new Error(`Validation failed: ${JSON.stringify(quote.errors || [])}`);
    if (!Number.isFinite(quote.creditsRequired) || quote.creditsRequired < 0) throw new Error('No usable credit quote');
    state.creditsQuoted = quote.creditsRequired; state.warnings = quote.warnings || []; state.state = 'validated'; save(state);
    if (config.dryRun) { state.state = 'dry-run'; save(state); return state; }
    if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Rendering requires a positive --max-credits ceiling');
    if (quote.creditsRequired > maxCredits) throw new Error(`Quote exceeds ${maxCredits} credits; nothing submitted`);
    state.state = 'submission-pending'; save(state);
    const receipt = await client.renders.create({ payload: built.payload });
    state.jobId = receipt.jobId; state.state = 'submitted'; save(state);
  } else if (offline || config.dryRun) throw new Error('Resume cannot be combined with offline or dry-run');
  if (!state.jobId) throw new Error('No saved job ID. Inspect the Zvid dashboard before another submission');
  const job = await client.jobs.wait(state.jobId, { timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000 });
  const url = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//.test(url || '')) throw new Error('The saved job has no completed HTTPS video URL');
  state.state = 'completed'; state.videoUrl = url; state.outputExpiresAt = job.outputExpiresAt || null; save(state); return state;
}
