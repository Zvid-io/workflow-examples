export async function submitEpisode(client,plan,logs,{maxCredits,save,now=Date.now}){
  if(!Number.isFinite(maxCredits)||maxCredits<=0)throw new Error('Set a positive --max-credits limit before rendering');
  const prior=logs.find(r=>r.RenderKey===plan.renderKey);
  if(prior&&!(prior.Status==='rate_limited'&&!prior.JobId&&!prior.VideoUrl))throw new Error('This episode already has a saved submission; inspect or resume it instead');
  if(prior?.RetryAt&&now()<prior.RetryAt)throw new Error('Capacity retry delay has not elapsed');
  const quote=await client.authoring.validate({payload:plan.payload});
  if(quote.valid!==true)throw new Error('Project validation failed: '+JSON.stringify(quote.errors||[]));
  if(!Number.isFinite(quote.creditsRequired)||quote.creditsRequired<0)throw new Error('No usable credit quote returned');
  if(quote.creditsRequired>maxCredits)throw new Error('Credit quote exceeds the limit; no render submitted');
  const {payload,...snapshot}=plan;
  const row=prior||{RenderKey:plan.renderKey};if(!prior)logs.push(row);
  Object.assign(row,{Status:'submitting',JobId:'',CreditsQuoted:quote.creditsRequired,PlanJson:JSON.stringify({...snapshot,snapshotVersion:1}),VideoUrl:'',CompletedAt:''});
  await save();
  let response;
  try{response=await client.renders.create({payload});}
  catch(error){
    if(error.status===429){const delay=Math.max(30,Number(error.retryAfter)||60);Object.assign(row,{Status:'rate_limited',RetryAt:now()+delay*1000});await save();throw new Error('Capacity rejected the request; wait at least '+delay+' seconds, then run again');}
    row.Status='needs_review';await save();throw new Error('Submission status is uncertain. Inspect Zvid before resetting this episode');
  }
  if(!response.jobId){row.Status='needs_review';await save();throw new Error('No job ID returned. Inspect Zvid before resetting this episode');}
  Object.assign(row,{Status:'rendering',JobId:response.jobId});await save();
  return row;
}
export async function finishEpisode(client,row,{save,pollMs=10000,timeoutMs=1200000,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!row.JobId)throw new Error('No saved job ID to resume');
  if(row.Status==='completed'&&row.VideoUrl)return row;
  const deadline=now()+timeoutMs;
  const timedOut=async()=>{row.Status='timed_out';await save();throw new Error('Polling timed out; use --resume to check the saved job without a new render');};
  for(;;){
    const remaining=deadline-now();
    if(remaining<=0)return timedOut();
    const signal=AbortSignal.timeout(Math.ceil(remaining));
    let r;
    try{r=await client.jobs.get(row.JobId,{signal});}
    catch(error){if(signal.aborted||error.name==='TimeoutError'||error.cause?.name==='TimeoutError')return timedOut();throw error;}
    const state=String(r.state||r.status||'').toLowerCase();
    if(state==='completed'){
      const url=typeof r.result==='string'?r.result:r.result?.url||r.result?.videoUrl;
      if(!/^https:\/\/\S+$/.test(url||'')){row.Status='needs_review';await save();throw new Error('Completed job has no HTTPS media URL');}
      Object.assign(row,{Status:'completed',VideoUrl:url,CompletedAt:new Date(now()).toISOString()});await save();return row;
    }
    if(['failed','cancelled','canceled'].includes(state)){row.Status='failed';row.Error=r.failedReason||state;await save();throw new Error(row.Error);}
    if(!['waiting','queued','delayed','prioritized','waiting-children','active','processing','rendering','pending'].includes(state)){row.Status='needs_review';await save();throw new Error('Unrecognized render status; inspect the saved job');}
    if(now()>=deadline)return timedOut();
    await sleep(Math.min(pollMs,Math.max(0,deadline-now())));
  }
}
