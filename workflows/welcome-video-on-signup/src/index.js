import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildProject } from './project.js';
import { ensureNewSubmissionAllowed, submitChecked, waitForJob } from './run.js';

const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
const writeJson=(p,v)=>{const temporary=p+'.'+randomUUID()+'.tmp';writeFileSync(temporary,JSON.stringify(v,null,2)+'\n');renameSync(temporary,p);};

async function main(){
  const {values:o}=parseArgs({options:{input:{type:'string',default:'data/signup.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out'},'dry-run':{type:'boolean',default:false},'max-credits':{type:'string'},resume:{type:'boolean',default:false},help:{type:'boolean'}}});
  if(o.help){console.log('npm run sample | npm start -- --max-credits 15 | npm start -- --resume\nOptions: --input file --config file --out folder --dry-run --max-credits number --resume');return;}
  const config=readJson(o.config);
  const maxCredits=o['max-credits']===undefined?undefined:Number(o['max-credits']);
  if(maxCredits!==undefined&&(!Number.isFinite(maxCredits)||maxCredits<=0))throw new Error('--max-credits must be a positive number');
  const pollMs=Number(config.pollSeconds??10)*1000, timeoutMs=Number(config.timeoutMinutes??20)*60000;
  if(!Number.isFinite(pollMs)||pollMs<=0||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('pollSeconds and timeoutMinutes must be positive numbers');
  if(!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in your local .env file');
  mkdirSync(o.out,{recursive:true});
  const lockPath=path.join(o.out,'.run.lock');
  let lock;
  try { lock=openSync(lockPath,'wx'); }
  catch(error) { if(error.code==='EEXIST')throw new Error('This output folder is locked by a running or interrupted command. Confirm the earlier process has stopped before removing .run.lock.');throw error; }
  try {
  const resultPath=path.join(o.out,'result.json');
  let result=existsSync(resultPath)?readJson(resultPath):{};
  if(!o.resume)ensureNewSubmissionAllowed(result);
  if(o.resume&&!result.jobId)throw new Error('No saved job ID in this output folder');
  const save=async patch=>{result={...result,...patch};writeJson(resultPath,result);};
  const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:process.env.ZVID_API_URL||'https://api.zvid.io',maxRetries:0});
  let jobId=result.jobId;
  if(!o.resume){
    const built=buildProject(config,readJson(o.input));
    writeJson(path.join(o.out,'project.json'),built.payload);
    await save({firstName:built.meta.firstName,company:built.meta.company,videoSeconds:built.meta.totalDuration});
    if(o['dry-run']||config.dryRun===true){
      const v=await client.authoring.validate({payload:built.payload});
      if(!v.valid)throw new Error('Project validation failed: '+(v.errors||[]).map(e=>`${e.field}: ${e.message}`).join('; '));
      const project=await client.projects.create(built.payload.name,built.payload);
      await save({dryRun:true,videoUrl:null,creditsQuoted:v.creditsRequired,warnings:v.warnings||[],editorLink:`https://editor.zvid.io/?project=${project.id}`});
      console.log(`Draft saved. Credit estimate: ${v.creditsRequired}. Open editorLink in ${resultPath}. No render submitted.`);return;
    }
    await save({dryRun:false});
    jobId=await submitChecked(client,built.payload,{maxCredits,save});
    console.log(`Render accepted. Job ID saved in ${resultPath}.`);
  }
  const finished=await waitForJob(client,jobId,{timeoutMs,pollMs,save});
  await save(finished);
  const response=await fetch(finished.videoUrl,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('The completed video could not be downloaded. Use --resume to retry the download without another render.');
  writeFileSync(path.join(o.out,'welcome.mp4'),Buffer.from(await response.arrayBuffer()));
  await save({downloaded:true,outputFile:'welcome.mp4'});
  console.log(`Video saved to ${path.join(o.out,'welcome.mp4')}. No email sent.`);
  } finally { closeSync(lock);unlinkSync(lockPath); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
