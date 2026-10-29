import {readFileSync,writeFileSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createClient} from './client.js';
import {buildEpisode,reviewCsv} from './workflow.js';
import {submitEpisode,finishEpisode} from './run.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>{const t=p+'.'+randomUUID()+'.tmp';writeFileSync(t,JSON.stringify(v,null,2)+'\n');renameSync(t,p);};
async function main(){
  const {values:o}=parseArgs({options:{input:{type:'string',default:'data/questions.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out'},date:{type:'string'},offline:{type:'boolean'},'dry-run':{type:'boolean'},resume:{type:'boolean'},'max-credits':{type:'string'},help:{type:'boolean'}}});
  if([o.offline,o['dry-run'],o.resume].filter(Boolean).length>1)throw new Error('Use only one of --offline, --dry-run or --resume');
  if(o.help){console.log('npm run offline | npm run sample | npm start -- --max-credits 60 | npm start -- --resume\nOptional --date YYYY-MM-DD fixes the rehearsal date. --out selects persistent history.');return;}
  if(o.date&&!/^\d{4}-\d{2}-\d{2}$/.test(o.date))throw new Error('--date must use YYYY-MM-DD');
  const now=o.date?new Date(o.date+'T12:00:00Z'):new Date();
  if(o.date&&now.toISOString().slice(0,10)!==o.date)throw new Error('--date must be a real date');
  const config=read(o.config);mkdirSync(o.out,{recursive:true});
  const lockFile=path.join(o.out,'.run.lock');let lock;
  try{lock=openSync(lockFile,'wx');}catch{throw new Error('Output folder is locked. Confirm the previous process stopped before removing .run.lock');}
  try{
    const stateFile=path.join(o.out,'quiz-episodes.json'),logs=existsSync(stateFile)?read(stateFile):[];
    const save=async()=>write(stateFile,logs);
    const dryRun=o['dry-run']||config.dryRun;
    const plan=o.resume?null:buildEpisode({...config,dryRun:!!(dryRun||o.offline)},read(o.input),logs,now);
    if(plan){write(path.join(o.out,'plan.json'),plan);if(plan.payload)write(path.join(o.out,'project.json'),plan.payload);if(plan.handoff)writeFileSync(path.join(o.out,'quiz-shorts-review.csv'),reviewCsv(plan.handoff));}
    if(o.offline){console.log(plan.ready?'Project and review CSV prepared. No API calls.':plan.reason||plan.status);return;}
    if(plan&&!plan.ready){console.log(plan.reason||plan.status);return;}
    if(!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in .env');
    const client=createClient({apiKey:process.env.ZVID_API_KEY,baseUrl:process.env.ZVID_API_URL||'https://api.zvid.io'});
    if(dryRun&&!o.resume){const quote=await client.authoring.validate({payload:plan.payload});write(path.join(o.out,'validation.json'),quote);if(quote.valid!==true)throw new Error('Validation failed; see out/validation.json');if(!Number.isFinite(quote.creditsRequired)||quote.creditsRequired>config.maxCreditsPerVideo)throw new Error('Quote is unavailable or exceeds maxCreditsPerVideo');console.log('Validation saved. No render or history write.');return;}
    let row;
    if(o.resume){row=logs.find(r=>r.JobId&&r.Status!=='completed')||logs.findLast(r=>r.Status==='completed');if(!row)throw new Error('No accepted job to resume');}
    else if(plan.jobId){row=logs.find(r=>r.RenderKey===plan.renderKey);}
    else row=await submitEpisode(client,plan,logs,{maxCredits:Math.min(Number(o['max-credits']),config.maxCreditsPerVideo),save});
    await finishEpisode(client,row,{save,pollMs:config.pollSeconds*1000,timeoutMs:config.timeoutMinutes*60000});
    const file=path.join(o.out,row.RenderKey+'.mp4');
    const response=await fetch(row.VideoUrl,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Download failed; use --resume without another render');
    const bytes=Buffer.from(await response.arrayBuffer()),length=response.headers.get('content-length');
    if(bytes.length<32||bytes.subarray(4,8).toString()!=='ftyp'||(length&&Number(length)!==bytes.length))throw new Error('Incomplete or invalid MP4; use --resume');
    const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,bytes);renameSync(temp,file);
    const snapshot=JSON.parse(row.PlanJson);writeFileSync(path.join(o.out,'quiz-shorts-review.csv'),reviewCsv(snapshot.handoff||[]));console.log('Saved '+file);
  }finally{closeSync(lock);unlinkSync(lockFile);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
