import { readFileSync,writeFileSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync,renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildPlan } from './workflow.js';
import { quoteProjects,submitProjects,waitForJob } from './run.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>{const t=p+'.'+randomUUID()+'.tmp';writeFileSync(t,JSON.stringify(v,null,2)+'\n');renameSync(t,p);};
async function main(){
  const {values:o}=parseArgs({options:{input:{type:'string',default:'data/workouts.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out'},offline:{type:'boolean'},'dry-run':{type:'boolean'},resume:{type:'boolean'},'max-credits':{type:'string'},help:{type:'boolean'}}});
  if([o.offline,o['dry-run'],o.resume].filter(Boolean).length>1)throw Error('Use only one of --offline, --dry-run or --resume');
  if(o.help){console.log('npm run offline | npm run sample | npm start -- --max-credits 26 | npm start -- --resume\nUse --input file --config file --out folder to select inputs and persistent state.');return;}
  const config=read(o.config);mkdirSync(o.out,{recursive:true});
  const lockPath=path.join(o.out,'.run.lock');let lock;
  try{lock=openSync(lockPath,'wx');}catch{throw Error('Output directory is locked. Confirm the previous process stopped before removing .run.lock');}
  try{
    const statePath=path.join(o.out,'state.json'),state=existsSync(statePath)?read(statePath):{jobs:{}};
    const save=async()=>write(statePath,state);
    const plan=o.resume?null:buildPlan({...config,dryRun:o['dry-run']||config.dryRun},read(o.input),state);
    if(plan){write(path.join(o.out,'selection.json'),plan.selection);for(const p of plan.projects)write(path.join(o.out,p.key+'.project.json'),p.payload);}
    if(o.offline){console.log(plan.projects.length+' project(s) prepared. No API calls or state changes.');return;}
    if(!o.resume&&!plan.projects.length&&!plan.resumeKeys.length){console.log(plan.selection[0]?.reason||'Nothing to render');return;}
    if(!process.env.ZVID_API_KEY)throw Error('Set ZVID_API_KEY in .env');
    const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:process.env.ZVID_API_URL||'https://api.zvid.io',maxRetries:0});
    const finish=async key=>{
      const job=state.jobs[key];
      if(!job)throw Error('Saved job comes from the input row but has no local ledger. Reconcile it in n8n or Zvid before continuing');
      if(job.state!=='completed')await waitForJob(client,job,{save,pollMs:config.pollSeconds*1000,timeoutMs:config.timeoutMinutes*60000});
      const file=path.join(o.out,key+'.mp4');if(existsSync(file)&&job.downloaded)return;
      const response=await fetch(job.videoUrl,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error('Download failed; --resume retries the saved video without rendering again');
      const bytes=Buffer.from(await response.arrayBuffer()),length=response.headers.get('content-length');
      if(bytes.length<32||bytes.subarray(4,8).toString()!=='ftyp'||(length&&Number(length)!==bytes.length))throw Error('Invalid or incomplete MP4; retry the download with --resume');
      const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,bytes);renameSync(temporary,file);
      writeFileSync(path.join(o.out,key+'.caption.txt'),job.caption+'\n');job.downloaded=true;await save();console.log('Saved '+file);
    };
    if(o.resume){
      const keys=Object.keys(state.jobs).filter(k=>state.jobs[k].state!=='rejected');
      if(!keys.length)throw Error('No accepted or uncertain jobs in this output folder');
      for(const key of keys)await finish(key);return;
    }
    if(o['dry-run']||config.dryRun){
      const quotes=await quoteProjects(client,plan.projects,config);
      write(path.join(o.out,'validation.json'),quotes.map(p=>({key:p.key,variant:p.variant,creditsQuoted:p.creditsQuoted,warnings:p.warnings})));
      console.log('Validation saved; no render, editor draft or completion state changed.');return;
    }
    for(const key of plan.resumeKeys)await finish(key);
    const quotes=await quoteProjects(client,plan.projects,config);
    write(path.join(o.out,'validation.json'),quotes.map(p=>({key:p.key,variant:p.variant,creditsQuoted:p.creditsQuoted,warnings:p.warnings})));
    if(quotes.length)await submitProjects(client,quotes,state,{maxCredits:Number(o['max-credits']),save,onAccepted:finish});
  }finally{closeSync(lock);unlinkSync(lockPath);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
