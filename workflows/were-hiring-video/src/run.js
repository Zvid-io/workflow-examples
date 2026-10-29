export async function validateCampaign(client, plan, maxCredits) {
  if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Set a positive credit ceiling');
  const quote = await client.authoring.validate({ payload: plan.payload });
  if (quote.valid !== true) throw new Error('Project validation failed: ' + JSON.stringify(quote.errors || []));
  const credits = quote.creditsRequired;
  if (!Number.isFinite(credits) || credits < 0) throw new Error('No usable credit quote returned');
  if (credits > maxCredits) throw new Error(`Video needs ${credits} credits; ceiling is ${maxCredits}. No render submitted.`);
  return { creditsQuoted: credits, warnings: quote.warnings || [] };
}

export async function submitCampaign(client, plan, state, { maxCredits, save }) {
  const key = plan.campaignKey;
  if (state.campaigns[key]) throw new Error('This campaign has a saved submission. Use --resume; inspect uncertain submissions in Zvid.');
  const quote = await validateCampaign(client, plan, maxCredits);
  const saved = state.campaigns[key] = { status: 'submitting', plan, ...quote };
  await save();
  let response;
  try { response = await client.renders.create({ payload: plan.payload }); }
  catch {
    saved.status = 'submission_unknown';
    await save();
    throw new Error('Submission status is uncertain. Inspect Zvid before making another request; the saved state blocks duplicate submissions.');
  }
  if (!response.jobId) {
    saved.status = 'submission_unknown'; await save();
    throw new Error('Zvid returned no job ID. Inspect the account before retrying; no automatic paid retry was made.');
  }
  saved.jobId = response.jobId;
  saved.status = 'rendering';
  await save();
  return saved;
}

export async function waitForCampaign(client, saved, { save, pollMs = 10000, timeoutMs = 1200000, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!saved.jobId) throw new Error('There is no saved job ID. Inspect the uncertain submission in Zvid before changing state.');
  if (saved.status === 'completed' && saved.videoUrl) return saved;
  const deadline = now() + timeoutMs;
  for (;;) {
    const job = await client.jobs.get(saved.jobId);
    if (job.state === 'failed') {
      saved.status = 'failed'; saved.error = job.failedReason || 'Render failed'; await save(); throw new Error(saved.error);
    }
    if (job.state === 'completed') {
      const url = typeof job.result === 'string' ? job.result : job.result?.url;
      if (!/^https:\/\//.test(url || '')) throw new Error('Completed job has no HTTPS output URL; retain its job ID and inspect it.');
      saved.status = 'completed'; saved.videoUrl = url; saved.completedAt = new Date().toISOString(); await save(); return saved;
    }
    saved.status = 'rendering'; await save();
    if (now() >= deadline) throw new Error('Wait timed out. Use --resume to poll this saved job without submitting another render.');
    await sleep(pollMs);
  }
}
