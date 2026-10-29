import {buildLeads,checkConfig} from './workflow.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function run({rows,config,client,prior,offline=false,maxCredits,save=()=>{},saveProject=()=>{},sleep=pause,now=Date.now,fetcher=fetch}){
  checkConfig(config);
  if(maxCredits!==undefined&&(!Number.isFinite(maxCredits)||maxCredits<=0))throw new Error('max-credits must be positive');
  let state=prior;
  if(!state){
    const {selection,built}=await buildLeads(rows,config,{offline,fetcher});
    state={version:1,state:'prepared',rows,selection,videos:[],errors:[]};save(state);
    if(!built){state.state='empty';save(state);return state;}
    state.leads=built.meta.leads;saveProject('batch',{payload:built.payload,items:built.items});
    if(offline){state.state='offline';save(state);return state;}
    state.quotes=[];
    for(const [index,item] of built.items.entries()){
      const v=await client.authoring.validate({payload:built.payload,variables:item.variables});
      if(!v.valid)throw new Error(`Lead ${index+1} failed validation: ${JSON.stringify(v.errors||[])}`);
      if(!Number.isFinite(v.creditsRequired)||v.creditsRequired<0)throw new Error('Missing usable credit quote');
      if(!v.payload)throw new Error('Missing resolved project');
      saveProject(`lead-${index+1}`,v.payload);state.quotes.push({index,credits:v.creditsRequired,warnings:v.warnings||[]});
    }
    state.creditsQuoted=state.quotes.reduce((n,q)=>n+q.credits,0);state.state='validated';save(state);
    if(config.dryRun){state.state='dry-run';save(state);return state;}
    if(maxCredits!==undefined&&state.creditsQuoted>maxCredits)throw new Error(`Quoted ${state.creditsQuoted} credits exceed ${maxCredits}; no batch submitted`);
    state.state='submission-pending';save(state);
    const response=await client.renders.createBulk({name:config.bulkName,payload:built.payload,items:built.items});
    state.submission=response;state.bulkId=response.bulkId;state.state='submitted';save(state);
  }else if(offline||config.dryRun)throw new Error('Resume polls an existing batch; omit offline and dry-run');
  if(!state.bulkId||!Array.isArray(state.submission?.jobs)||!state.submission.jobs.length)throw new Error('No recoverable receipt. Check the Zvid dashboard before submitting again');
  const indices=new Set(),ids=new Set();
  for(const ref of state.submission.jobs){if(!Number.isInteger(ref.index)||!state.leads[ref.index]||indices.has(ref.index)||!ref.jobId||ids.has(ref.jobId))throw new Error('Invalid batch receipt: inspect saved result');indices.add(ref.index);ids.add(ref.jobId);}
  const deadline=now()+config.timeoutMinutes*60000;
  for(;;){
    const status=await client.renders.getBulk(state.bulkId),jobs=new Map((status.jobs||[]).map(j=>[j.id,j]));
    const videos=[],errors=[...(state.submission.errors||[])];let pending=false;
    if(state.submission.failedToQueue)errors.push({error:`${state.submission.failedToQueue} jobs failed to queue`});
    for(const ref of state.submission.jobs){const job=jobs.get(ref.jobId),lead=state.leads[ref.index];if(!job||!['completed','failed'].includes(job.status)){pending=true;continue;}
      if(job.status==='failed'||!/^https:\/\//.test(job.outputUrl||'')){errors.push({rowNumber:lead.rowNumber,jobId:ref.jobId,error:job.errorMessage||'No completed HTTPS video URL'});continue;}
      videos.push({rowNumber:lead.rowNumber,firstName:lead.firstName,company:lead.company,videoUrl:job.outputUrl,jobId:ref.jobId});
    }
    state.videos=videos;state.errors=errors;state.state=pending?'rendering':errors.length?'partial':'rendered';
    state.updatedRows=state.rows.map(r=>{const v=videos.find(v=>v.rowNumber===r.row_number);return v?{...r,Status:config.statusDoneValue,VideoUrl:v.videoUrl}:r;});save(state);
    if(!pending)return state;
    if(now()>=deadline)throw new Error('Wait timed out. Use --resume with the same output directory; accepted jobs continue');
    await sleep(config.pollSeconds*1000);
  }
}
