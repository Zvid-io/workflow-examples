export function ensureCanSubmit(state,key) {
  const previous=state.jobs[key];
  if(previous?.state==='rejected'&&previous.retryAt){if(Date.now()<previous.retryAt)throw new Error('Rate limit delay has not elapsed; retry after '+new Date(previous.retryAt).toISOString());return;}
  if(previous)throw new Error('This event video has a saved submission. Use --resume; inspect unknown submissions in Zvid before retrying');
}
export async function submitBatch(client,projects,state,{maxCredits,save,onAccepted=async()=>{}}) {
  if(!Number.isFinite(maxCredits)||maxCredits<=0)throw new Error('Set a positive --max-credits limit before rendering');
  const quotes=[];
  for(const p of projects){
    ensureCanSubmit(state,p.key);
    const quote=await client.authoring.validate({payload:p.payload});
    if(!quote.valid)throw new Error('Project validation failed: '+JSON.stringify(quote.errors||[]));
    if(!Number.isFinite(quote.creditsRequired)||quote.creditsRequired<0)throw new Error('No usable credit quote returned');
    quotes.push(quote.creditsRequired);
  }
  if(quotes.reduce((a,b)=>a+b,0)>maxCredits)throw new Error('The total quote exceeds --max-credits; no jobs submitted');
  for(let i=0;i<projects.length;i++){
    const p=projects[i];
    state.jobs[p.key]={eventKey:p.meta.eventKey,kind:p.meta.kind,creditsQuoted:quotes[i],state:'submission-pending'};
    await save(state);
    try {
      const response=await client.renders.create({payload:p.payload});
      if(!response.jobId)throw new Error('Missing job ID');
      Object.assign(state.jobs[p.key],{jobId:response.jobId,state:'submitted'});await save(state);
    } catch(error) {
      if(error.status===429){
        const delay=Math.max(30,Number(error.retryAfter)||60);
        Object.assign(state.jobs[p.key],{state:'rejected',retryAt:Date.now()+delay*1000,error:'Rate limit rejected submission'});await save(state);
        throw new Error('Render submission rejected by rate limit. Wait at least '+delay+' seconds, then rerun the normal command; no job ID was accepted');
      }
      state.jobs[p.key].state='submission-unknown';await save(state);
      throw new Error('Submission status is unknown. Check the Zvid dashboard; this state prevents another submission');
    }
    await onAccepted(p.key);
  }
  return projects.map(p=>p.key);
}
export async function waitForJob(client,job,{save,pollMs=10000,timeoutMs=1200000,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
  if(!job.jobId)throw new Error('No saved job ID. Inspect the unknown submission in Zvid before retrying');
  const deadline=now()+timeoutMs;
  for(;;){
    const result=await client.jobs.get(job.jobId);job.state=result.state;
    if(result.state==='failed'){job.error=result.failedReason||'Render failed';await save();throw new Error(job.error);}
    if(result.state==='completed'){
      const url=typeof result.result==='string'?result.result:result.result?.url;
      if(!/^https:\/\//.test(url||''))throw new Error('Completed job has no HTTPS output URL');
      job.videoUrl=url;await save();return;
    }
    await save();if(now()>=deadline)throw new Error('Timed out. Use --resume to poll the saved jobs without another render');
    await sleep(pollMs);
  }
}
