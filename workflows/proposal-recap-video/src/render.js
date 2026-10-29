export async function renderEdition({ payload, client, prior, validateOnly = false, maxCredits, save,
  pollSeconds = 10, timeoutMinutes = 20, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now }) {
  if (!validateOnly && !prior && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('Set a positive --max-credits limit before rendering');
  let state = prior;
  if (!state) {
    const validation = await client.authoring.validate({ payload });
    if (!validation.valid) throw new Error(`Zvid rejected the project: ${JSON.stringify(validation.errors || [])}`);
    if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired < 0) throw new Error('Validation returned no usable credit quote');
    state = { state: 'validated', creditsQuoted: validation.creditsRequired, warnings: validation.warnings || [] };
    save(state);
    if (validateOnly) return state;
    if (state.creditsQuoted > maxCredits) throw new Error(`Quote of ${state.creditsQuoted} credits exceeds limit ${maxCredits}; no render submitted`);
    state.state = 'submission-pending'; save(state);
    const accepted = await client.renders.create({ payload });
    state.accepted = accepted; state.jobId = accepted.jobId; state.state = 'submitted'; save(state);
  }
  if (!state.jobId) throw new Error('No saved job ID. Inspect the Zvid dashboard before starting another render');
  const deadline = now() + timeoutMinutes * 60_000;
  for (;;) {
    const job = await client.jobs.get(state.jobId);
    state.status = job.state; save(state);
    if (job.state === 'failed') { state.state = 'failed'; state.error = job.failedReason || 'Render failed'; save(state); throw new Error(state.error); }
    if (job.state === 'completed') {
      const videoUrl = typeof job.result === 'string' ? job.result : job.result?.url;
      if (!/^https:\/\//.test(videoUrl || '')) throw new Error('Completed job returned no HTTPS video URL');
      state.state = 'completed'; state.videoUrl = videoUrl; save(state); return state;
    }
    if (now() >= deadline) throw new Error('Render wait timed out. Use --resume to poll this job without resubmitting');
    await sleep(pollSeconds * 1000);
  }
}
