import { readFileSync,writeFileSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync,renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildDue } from './workflow.js';
import { submitBatch,waitForJob } from './run.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>{const t=p+'.'+randomUUID()+'.tmp';writeFileSync(t,JSON.stringify(v,null,2)+'\n');renameSync(t,p);};
async function main(){
  const {values:o}=parseArgs({options:{input:{type:'string',default:'data/events.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out'},offline:{type:'boolean'},'dry-run':{type:'boolean'},resume:{type:'boolean'},'max-credits':{type:'string'},help:{type:'boolean'}}});
  if([o.offline,o['dry-run'],o.resume].filter(Boolean).length>1)throw new Error('Use only one of --offline, --dry-run or --resume');
  if(o.help){console.log('npm run offline | npm run sample | npm start -- --max-credits 14 | npm start -- --resume\nUse --input file --config file --out folder to select inputs and a persistent state directory.');return;}
  const config=read(o.config);mkdirSync(o.out,{recursive:true});
  const lockPath=path.join(o.out,'.run.lock');let lock;
  try{lock=openSync(lockPath,'wx');}catch{throw new Error('Output directory is locked. Confirm the previous process has stopped before removing .run.lock');}
  try{
    const statePath=path.join(o.out,'state.json');const state=existsSync(statePath)?read(statePath):{jobs:{}};
    const save=async()=>write(statePath,state);
    const plan=o.resume?null:buildDue(config,read(o.input),state);
    if(plan){write(path.join(o.out,'selection.json'),plan.selection);for(const p of plan.projects)write(path.join(o.out,p.key+'.project.json'),p.payload);}
    if(o.offline){console.log(`${plan.projects.length} project(s) prepared. No API call made.`);return;}
    if(!o.resume&&!plan.projects.length){console.log(plan.selection[0]?.reason||'Nothing due');return;}
    if(!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in .env');
    const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:process.env.ZVID_API_URL||'https://api.zvid.io',maxRetries:0});
    if(!o.resume&&(o['dry-run']||config.dryRun)){
      const quotes=[];for(const p of plan.projects){const q=await client.authoring.validate({payload:p.payload});if(!q.valid)throw new Error('Validation failed: '+JSON.stringify(q.errors||[]));quotes.push({key:p.key,creditsQuoted:q.creditsRequired,warnings:q.warnings||[]});}
      write(path.join(o.out,'validation.json'),quotes);console.log('Validation saved. No render submitted and no completion history changed.');return;
    }
    const finish=async key=>{
      const job=state.jobs[key];if(job.state!=='completed')await waitForJob(client,job,{save,pollMs:config.pollSeconds*1000,timeoutMs:config.timeoutMinutes*60000});
      const file=path.join(o.out,key+'.mp4');if(existsSync(file)&&job.downloaded)return;
      const r=await fetch(job.videoUrl,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('Download failed; --resume retries without rendering again');
      const bytes=Buffer.from(await r.arrayBuffer());const length=r.headers.get('content-length');
      if(bytes.length<32||bytes.subarray(4,8).toString()!=='ftyp'||(length&&Number(length)!==bytes.length))throw new Error('Incomplete or invalid MP4 download; use --resume to retry');
      const temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,bytes);renameSync(temporary,file);job.downloaded=true;await save();console.log(`Saved ${file}`);
    };
    if(o.resume){const keys=Object.keys(state.jobs).filter(k=>state.jobs[k].state!=='rejected');if(!keys.length)throw new Error('No accepted jobs to resume');for(const key of keys)await finish(key);}
    else await submitBatch(client,plan.projects,state,{maxCredits:Number(o['max-credits']),save,onAccepted:finish});
  }finally{closeSync(lock);unlinkSync(lockPath);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
