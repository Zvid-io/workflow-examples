import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildProject, checkpoint, planCelebration } from './project.js';
import { submitChecked, waitForJob } from './run.js';

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {const temporary = p + '.' + randomUUID() + '.tmp';writeFileSync(temporary, JSON.stringify(v,null,2)+'\n');renameSync(temporary,p);};

async function main() {
  const {values:o} = parseArgs({options:{input:{type:'string',default:'data/celebrations.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out'},date:{type:'string'},'dry-run':{type:'boolean',default:false},'max-credits':{type:'string'},resume:{type:'boolean',default:false},help:{type:'boolean'}}});
  if(o.help){console.log('npm run sample | npm start -- --max-credits 15 | npm start -- --resume\nOptions: --input file --config file --out folder --date YYYY-MM-DD --dry-run --max-credits number --resume');return;}
  const config=readJson(o.config), maxCredits=Number(o['max-credits']??config.maxCreditsPerVideo);
  if(!Number.isFinite(maxCredits)||maxCredits<=0)throw new Error('maxCreditsPerVideo must be positive');
  if(!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in your local .env file');
  const now=o.date?new Date(o.date+'T12:00:00Z'):new Date();
  const pollMs=Number(config.pollSeconds??10)*1000,timeoutMs=Number(config.timeoutMinutes??20)*60000;
  if(!Number.isFinite(pollMs)||pollMs<=0||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Polling settings must be positive');
  mkdirSync(o.out,{recursive:true});
  const lockPath=path.join(o.out,'.run.lock');
  let lock;
  try {lock=openSync(lockPath,'wx');}catch(e){if(e.code==='EEXIST')throw new Error('Output folder is locked. Confirm the earlier process stopped before removing .run.lock.');throw e;}
  try {
    const logPath=path.join(o.out,'celebration-runs.json'),resultPath=path.join(o.out,'result.json');
    const logs=existsSync(logPath)?readJson(logPath):[];
    const previous=existsSync(resultPath)?readJson(resultPath):{};
    const dryRun=o['dry-run']||config.dryRun===true;
    let plan;
    if(o.resume){
      if(!previous.jobId)throw new Error('No accepted job ID in result.json');
      plan={...previous.plan,ready:true,jobId:previous.jobId,renderKey:previous.renderKey};
    }else{
      plan=planCelebration({...config,dryRun},readJson(o.input),logs,now);
    }
    if(!plan.ready){writeJson(path.join(o.out,'review.json'),plan);console.log(plan.reason||'No eligible greeting. Inspect review.json.');return;}
    let result={renderKey:plan.renderKey,plan};
    const row=logs.find(r=>r.RenderKey===plan.renderKey)||{RenderKey:plan.renderKey,PlanJson:checkpoint(plan),DeliveryStatus:'manual_review'};
    const save=async patch=>{
      result={...result,...patch};
      const statuses={'submission-pending':'submitting','submission-unknown':'needs_review',submitted:'rendering',active:'rendering',waiting:'rendering',completed:'completed',failed:'failed'};
      Object.assign(row,{Status:statuses[result.state]||'rendering',JobId:result.jobId||'',CreditsQuoted:result.creditsQuoted??row.CreditsQuoted??'',VideoUrl:result.videoUrl||row.VideoUrl||'',CompletedAt:result.state==='completed'?new Date().toISOString():row.CompletedAt||''});
      if(!logs.includes(row))logs.push(row);
      writeJson(logPath,logs);writeJson(resultPath,result);
    };
    const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:process.env.ZVID_API_URL||'https://api.zvid.io',maxRetries:0});
    let jobId=plan.jobId;
    if(!jobId){
      const built=buildProject(config,plan);
      writeJson(path.join(o.out,'project.json'),built.payload);
      if(dryRun){
        const validation=await client.authoring.validate({payload:built.payload});
        if(!validation.valid)throw new Error('Project validation failed: '+JSON.stringify(validation.errors||[]));
        if(!Number.isFinite(validation.creditsRequired)||validation.creditsRequired>maxCredits)throw new Error('The quote exceeds the credit ceiling or cannot be verified');
        writeJson(path.join(o.out,'preview.json'),{plan,...built,validation});
        console.log(`Validation-only preview saved to ${o.out}/preview.json. Quote: ${validation.creditsRequired} credits. No render, delivery or log change.`);return;
      }
      jobId=await submitChecked(client,built.payload,{maxCredits,save});
    }
    await save({jobId,state:'submitted'});
    const finished=await waitForJob(client,jobId,{timeoutMs,pollMs,save});
    await save(finished);
    const response=await fetch(finished.videoUrl,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('Download failed. Use --resume to retrieve the same accepted job.');
    writeFileSync(path.join(o.out,'greeting.mp4'),Buffer.from(await response.arrayBuffer()));
    await save({downloaded:true});
    console.log(`Greeting saved to ${o.out}/greeting.mp4. Review privately before delivery. No email sent.`);
  }finally{closeSync(lock);unlinkSync(lockPath);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
