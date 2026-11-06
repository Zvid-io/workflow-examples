import {checkConfig,prepare,checkQuote} from './workflow.js';

export async function run({rows=[],config,history=[],now=new Date(),client,offline=false,render=false,resumeKey,maxCredits,save=()=>{},saveProject=()=>{}}){
  checkConfig(config);
  if(offline&&(render||resumeKey))throw new Error('Offline cannot render or resume');
  if(render&&(!Number.isFinite(maxCredits)||maxCredits<=0))throw new Error('Rendering requires a positive --max-credits value');
  const effective={...config,dryRun:!(render||resumeKey),maxCreditsPerVideo:render?Math.min(config.maxCreditsPerVideo,maxCredits):config.maxCreditsPerVideo};
  let plan;
  if(resumeKey){
    const records=history.filter(r=>r.CampaignKey===resumeKey);
    if(records.length!==1)throw new Error('Resume needs exactly one saved campaign');
    const record=records[0];
    if(!record.JobId)throw new Error('No saved job ID. Inspect Zvid before any new paid submission');
    if(['submitting','failed','needs_review'].includes(record.Status))throw new Error('Inspect the saved job and resolve its state before resuming');
    plan=JSON.parse(record.PlanJson);
    if(plan.campaignKey!==resumeKey||!plan.payload)throw new Error('Saved campaign snapshot is invalid');
    plan={...plan,jobId:record.JobId,creditsRequired:Number(record.CreditsQuoted),resumed:true};
    if(record.Status==='completed'&&record.VideoUrl)return {...plan,status:'completed',videoUrl:record.VideoUrl};
  }else plan=prepare(rows,effective,history,now);
  if(!plan.ready)return plan;
  saveProject(plan.payload);
  if(offline)return {...plan,status:'offline',videoUrl:null};
  const upsert=(status,extras={})=>{
    const record={CampaignKey:plan.campaignKey,Status:status,JobId:plan.jobId||'',CreditsQuoted:plan.creditsRequired,VideoUrl:'',Caption:plan.caption,PlanJson:JSON.stringify(plan),CompletedAt:'',...extras};
    const index=history.findIndex(r=>r.CampaignKey===plan.campaignKey);
    if(index<0)history.push(record);else history[index]=record;
    save(history);
  };
  if(!plan.jobId){
    plan=checkQuote(effective,plan,await client.authoring.validate({payload:plan.payload}));
    if(JSON.stringify(plan).length>45000)throw new Error('Campaign snapshot exceeds the matching n8n cell budget');
    if(!render)return {...plan,status:'preview',dryRun:true,videoUrl:null};
    upsert('submitting');
    const receipt=await client.renders.create({payload:plan.payload});
    const id=String(receipt?.jobId||'').trim();
    if(!id)throw new Error('Submission returned no job ID. The history remains submitting; inspect Zvid before resetting it');
    plan={...plan,jobId:id};upsert('rendering');
  }
  try{
    const job=await client.jobs.wait(plan.jobId,{timeoutMs:config.timeoutMinutes*60000,pollIntervalMs:config.pollSeconds*1000});
    const url=typeof job.result==='string'?job.result:job.result?.url||job.result?.videoUrl;
    if(job.state!=='completed'||!/^https:\/\//i.test(url||'')){
      upsert(job.state==='failed'?'failed':'needs_review');
      throw new Error('Saved job did not return completed HTTPS media. Inspect Zvid; do not resubmit');
    }
    plan={...plan,status:'completed',videoUrl:url,renderedAt:new Date().toISOString()};
    upsert('completed',{VideoUrl:url,CompletedAt:plan.renderedAt});return plan;
  }catch(error){
    // An interrupted wait keeps the accepted ID and original design recoverable.
    throw error;
  }
}
