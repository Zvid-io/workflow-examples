export async function renderClips({projects,client,prior,validateOnly=false,maxCredits,save,pollSeconds=10,timeoutMinutes=20,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}) {
  if(!validateOnly&&!prior&&(!Number.isFinite(maxCredits)||maxCredits<=0))throw new Error('Set a positive --max-credits limit before rendering');
  let state=prior;
  if(!state){
    if(!projects?.length)throw new Error('No clip projects supplied');
    const clips=[];
    for(const project of projects){const v=await client.authoring.validate({payload:project.payload});if(!v.valid)throw new Error(`Zvid rejected clip ${project.meta.clipIndex}: ${JSON.stringify(v.errors||[])}`);if(!Number.isFinite(v.creditsRequired)||v.creditsRequired<0)throw new Error('Validation returned no usable credit quote');clips.push({index:project.meta.clipIndex,creditsQuoted:v.creditsRequired,state:'validated'});}
    state={state:'validated',creditsQuoted:clips.reduce((n,c)=>n+c.creditsQuoted,0),clips};save(state);
    if(validateOnly)return state;
    if(state.creditsQuoted>maxCredits)throw new Error(`Quote of ${state.creditsQuoted} credits exceeds limit ${maxCredits}; no render submitted`);
  }
  for(let i=0;i<state.clips.length;i++){
    const clip=state.clips[i];
    if(clip.state==='completed')continue;
    if(!clip.jobId){
      if(prior)throw new Error('This saved run has an unsubmitted or uncertain clip. Inspect the dashboard before preparing a new run; --resume never submits');
      clip.state='submission-pending';state.state='rendering';save(state);
      const accepted=await client.renders.create({payload:projects[i].payload});
      if(!accepted.jobId)throw new Error('No job ID returned; inspect the dashboard before another submission');
      clip.jobId=accepted.jobId;clip.state='submitted';save(state);
    }
    const deadline=now()+timeoutMinutes*60_000;
    for(;;){
      const job=await client.jobs.get(clip.jobId);clip.status=job.state;save(state);
      if(job.state==='failed'){clip.state='failed';clip.error=job.failedReason||'Render failed';save(state);throw new Error(clip.error);}
      if(job.state==='completed'){const url=typeof job.result==='string'?job.result:job.result?.url;if(!/^https:\/\//.test(url||''))throw new Error('Completed job has no HTTPS video URL');clip.videoUrl=url;clip.state='completed';save(state);break;}
      if(now()>=deadline)throw new Error('Render wait timed out. Use --resume to poll accepted jobs without resubmitting');
      await sleep(pollSeconds*1000);
    }
  }
  state.state='completed';save(state);return state;
}
