import { build } from './workflow.js';
export async function run({config,input,client,offline=false,dryRun=true,maxCredits,prior,save=()=>{},saveProject=()=>{}}) {
  let state=prior;
  if(!state) {
    const built=build(config,input);
    saveProject(built.payload);
    state={version:1,state:'prepared',meta:built.meta};save(state);
    if(offline){state.state='offline';save(state);return state;}
    const q=await client.authoring.validate({payload:built.payload});
    if(!q.valid)throw new Error(`Validation failed: ${JSON.stringify(q.errors||[])}`);
    if(!Number.isFinite(q.creditsRequired)||q.creditsRequired<0)throw new Error('No usable credit quote');
    state.creditsQuoted=q.creditsRequired;state.warnings=q.warnings||[];state.state='validated';save(state);
    if(dryRun)return state;
    if(!Number.isFinite(maxCredits)||maxCredits<=0)throw new Error('Rendering requires a positive --max-credits ceiling');
    if(q.creditsRequired>maxCredits)throw new Error('Credit quote exceeds --max-credits; no render submitted');
    state.state='submission-pending';save(state);
    const receipt=await client.renders.create({payload:built.payload});
    state.jobId=receipt.jobId;state.state='submitted';save(state);
  }
  if(!state.jobId)throw new Error('No saved job ID. Inspect the Zvid dashboard before submitting again');
  const job=await client.jobs.wait(state.jobId,{timeoutMs:config.timeoutMinutes*60000,pollIntervalMs:config.pollSeconds*1000});
  const url=typeof job.result==='string'?job.result:job.result?.url;
  if(job.state!=='completed'||!/^https:\/\//.test(url||''))throw new Error(`Job ${state.jobId} has no completed HTTPS result`);
  state.state='completed';state.videoUrl=url;state.outputExpiresAt=job.outputExpiresAt||null;save(state);return state;
}
