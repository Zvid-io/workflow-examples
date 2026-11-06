export async function quoteProjects(client,projects,config){
  const quoted=[];
  for(const project of projects){
    const result=await client.authoring.validate({payload:project.payload});
    if(!result.valid)throw Error('Validation failed: '+JSON.stringify(result.errors||[]));
    if(!Number.isFinite(result.creditsRequired)||result.creditsRequired<0)throw Error('Validation returned no usable credit quote');
    if(result.creditsRequired>config.maxCreditsPerVideo)throw Error('Quote exceeds maxCreditsPerVideo; no render submitted');
    quoted.push({...project,creditsQuoted:result.creditsRequired,warnings:result.warnings||[]});
  }
  return quoted;
}
export async function submitProjects(client,projects,state,{maxCredits,save,onAccepted=async()=>{}}){
  if(!Number.isFinite(maxCredits)||maxCredits<=0)throw Error('Supply a positive --max-credits budget');
  if(projects.some(p=>!Number.isFinite(p.creditsQuoted)||p.creditsQuoted<0))throw Error('Every project needs a valid quote');
  if(projects.reduce((s,p)=>s+p.creditsQuoted,0)>maxCredits)throw Error('Total quote exceeds --max-credits; no render submitted');
  for(const p of projects)if(state.jobs[p.key]&&state.jobs[p.key].state!=='rejected')throw Error('Saved submission exists; use --resume and inspect uncertain work');
  for(const p of projects){
    state.jobs[p.key]={workoutKey:p.workoutKey,variant:p.variant,dateIso:p.dateIso,caption:p.meta.caption,creditsQuoted:p.creditsQuoted,state:'submission-pending'};
    await save();
    let response;
    try{response=await client.renders.create({payload:p.payload});}
    catch(error){
      state.jobs[p.key].state=error.status===429?'rejected':'submission-unknown';await save();
      throw Error(error.status===429?'Submission explicitly rejected by rate limit. Wait before another normal run.':'Submission status is unknown. Inspect Zvid before changing the saved state.');
    }
    if(!response.jobId){state.jobs[p.key].state='submission-unknown';await save();throw Error('No accepted job ID returned. Inspect Zvid before retrying');}
    Object.assign(state.jobs[p.key],{jobId:response.jobId,state:'rendering'});await save();
    await onAccepted(p.key);
  }
}
export async function waitForJob(client,job,{save,pollMs=10000,timeoutMs=1200000,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!job.jobId)throw Error('No saved job ID. Reconcile the uncertain submission in Zvid');
  const deadline=now()+timeoutMs;
  for(;;){
    const result=await client.jobs.get(job.jobId);job.state=result.state;
    if(result.state==='failed'){job.error=result.failedReason||'Render failed';await save();throw Error(job.error);}
    if(result.state==='completed'){
      const url=typeof result.result==='string'?result.result:result.result?.url;
      if(!/^https:\/\//.test(url||'')){job.state='needs_review';await save();throw Error('Completed render has no HTTPS video URL');}
      job.videoUrl=url;job.completedAt=new Date().toISOString();await save();return;
    }
    if(now()>=deadline){job.state='timed_out';await save();throw Error('Polling timed out. Use --resume without creating another render');}
    await save();await sleep(pollMs);
  }
}
