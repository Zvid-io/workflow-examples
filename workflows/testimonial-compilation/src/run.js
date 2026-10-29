import { prepare, checkConfig } from './workflow.js';

export async function run({ input, config, client, offline = false, render = false, prior,
  maxCredits, save = () => {}, saveProject = () => {} }) {
  checkConfig(config);
  if (maxCredits !== undefined && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('max credits must be positive');
  let state = prior;
  if (!state) {
    const built = prepare(input, config);
    state = { version: 1, state: built.selected.found ? 'prepared' : 'empty', selected: built.selected };
    save(state);
    if (!built.selected.found) return state;
    state.meta = built.meta;
    saveProject(built.payload);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const validation = await client.authoring.validate({ payload: built.payload });
    if (!validation.valid) throw new Error(`Validation failed: ${JSON.stringify(validation.errors || [])}`);
    if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired < 0) throw new Error('No usable credit quote');
    state.creditsQuoted = validation.creditsRequired;
    state.warnings = validation.warnings || [];
    state.state = 'validated'; save(state);
    if (!render) return state;
    if (maxCredits === undefined) throw new Error('Rendering requires --max-credits N');
    if (state.creditsQuoted > maxCredits) throw new Error(`Quote of ${state.creditsQuoted} credits exceeds limit ${maxCredits}; no render submitted`);
    state.state = 'submission-pending'; save(state);
    try {
      const receipt = await client.renders.create({ payload: built.payload });
      state.receipt = receipt;
      state.jobId = receipt.jobId;
      state.state = 'submitted'; save(state);
    } catch (error) {
      if (error.status === 429) {
        const seconds = Number(error.retryAfter);
        state.state = 'rejected';
        state.retryAt = Date.now() + Math.max(30, Number.isFinite(seconds) ? seconds : 0) * 1000;
        save(state);
        throw new Error('Capacity rejected this submission. Wait for retryAt in result.json, then rerun the original input command to validate again');
      }
      throw error;
    }
  } else if (offline || render || input) {
    throw new Error('Resume uses the saved job; omit offline, render and input');
  }
  if (state.state === 'rejected') throw new Error('This submission was rejected. Wait for retryAt, then rerun the original input command; resume only checks accepted jobs');
  if (!state.jobId) throw new Error('No saved job ID. Check the Zvid dashboard before another submission');
  const job = await client.jobs.wait(state.jobId, { timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000 });
  const url = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//i.test(url || '')) throw new Error(`Job ${state.jobId} has no completed HTTPS video URL`);
  state.state = 'completed'; state.videoUrl = url; state.outputExpiresAt = job.outputExpiresAt || null; save(state);
  return state;
}
