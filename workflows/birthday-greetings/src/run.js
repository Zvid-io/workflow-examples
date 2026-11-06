export async function waitForJob(client, jobId, {timeoutMs=1200000, pollMs=10000, now=Date.now, sleep=ms=>new Promise(r=>setTimeout(r,ms)), save=()=>{}}={}) {
  const deadline=now()+timeoutMs;
  while(true) {
    const job=await client.jobs.get(jobId);
    await save({jobId,state:job.state,failedReason:job.failedReason||null});
    if(job.state==='completed') {
      const videoUrl=typeof job.result==='string'?job.result:job.result?.url;
      if(!videoUrl) throw new Error('Render completed without an output URL. Keep the saved job ID and inspect it in Zvid.');
      return {jobId,state:'completed',videoUrl};
    }
    if(job.state==='failed') throw new Error('Render failed. Inspect the saved result and job in Zvid before submitting another render.');
    if(now()>=deadline) throw new Error('Render polling timed out. Resume the saved job instead of submitting again.');
    await sleep(pollMs);
  }
}

export async function submitChecked(client, payload, {maxCredits, save}) {
  const validation=await client.authoring.validate({payload});
  if(!validation.valid) throw new Error('Project validation failed: '+(validation.errors||[]).map(e=>`${e.field}: ${e.message}`).join('; '));
  if(maxCredits!==undefined && (!Number.isFinite(validation.creditsRequired)||validation.creditsRequired>maxCredits)) throw new Error('The credit estimate exceeds the limit or could not be verified. No render submitted.');
  await save({state:'submission-pending'});
  let submitted;
  try {
    submitted=await client.renders.create({payload});
    if(!submitted.jobId) throw new Error('No job ID returned');
  } catch {
    await save({state:'submission-unknown'});
    throw new Error('Submission status is unknown. Check Zvid before trying again; this output folder will not submit another render.');
  }
  await save({jobId:submitted.jobId,state:'submitted',creditsQuoted:validation.creditsRequired});
  return submitted.jobId;
}

export function ensureNewSubmissionAllowed(result) {
  if(result.jobId)throw new Error('This output folder already has an accepted job. Use --resume or choose a new --out folder for an intentional new render.');
  if(['submission-pending','submission-unknown'].includes(result.state))throw new Error('An earlier submission may have been accepted. Check the Zvid dashboard before choosing a new --out folder for an intentional retry.');
}
