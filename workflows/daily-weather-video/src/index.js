import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { defaults, fetchWeather } from './workflow.js';
import { run } from './run.js';
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const write = (p,v) => { writeFileSync(p+'.tmp', JSON.stringify(v,null,2)+'\n'); renameSync(p+'.tmp',p); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values:o } = parseArgs({ options: { input:{type:'string',default:'data/sample.json'}, config:{type:'string',default:'config.json'}, out:{type:'string',default:'out/sample'}, offline:{type:'boolean'}, 'dry-run':{type:'boolean'}, render:{type:'boolean'}, live:{type:'boolean'}, 'max-credits':{type:'string'}, resume:{type:'boolean'} } });
  if ([o.offline,o['dry-run'],o.render,o.resume].filter(Boolean).length > 1) throw Error('Choose offline, dry-run, render or resume');
  if (!o.offline && !process.env.ZVID_API_KEY) throw Error('Set ZVID_API_KEY in .env');
  mkdirSync(o.out,{recursive:true});
  const resultFile=path.join(o.out,'result.json'), lockFile=path.join(o.out,'.run.lock');
  const lock=openSync(lockFile,'wx');
  try {
    const config={...defaults,...json(o.config)}, existing=existsSync(resultFile)?json(resultFile):null;
    if (!o.resume && ['submission-pending','submitted','completed'].includes(existing?.state)) throw Error('This folder has a paid attempt; use --resume or inspect it before using a new folder');
    if (o.resume && !existing) throw Error('No result.json to resume');
    let input,now;
    if (!o.resume) {
      input=json(o.input); now=o.live?new Date():new Date(input.generatedAt);
      if (!Number.isFinite(now.getTime())) throw Error('Fixture input needs a valid generatedAt timestamp; use --live for current weather');
      if (o.live) input=await fetchWeather(config,input.bookings,now);
    }
    const ZvidClient=o.offline?null:(await import('@zvid/sdk')).ZvidClient;
    const client=o.offline?null:new ZvidClient({ apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(120000)}) });
    const state=await run({config,input,now,client,offline:o.offline,dryRun:!o.render,maxCredits:o['max-credits']===undefined?undefined:Number(o['max-credits']),prior:o.resume?existing:null,save:s=>write(resultFile,s),saveArtifacts:built=>{
      write(path.join(o.out,'project.json'),built.payload);
      write(path.join(o.out,'plan.json'),{renderKey:built.renderKey,decisions:built.decisions,note:built.note});
      writeFileSync(path.join(o.out,'decisions.csv'),Buffer.from(built.csv.data,'base64'));
      writeFileSync(path.join(o.out,'tentative-outdoor-bookings.ics'),Buffer.from(built.calendar.data,'base64'));
    }});
    console.log(JSON.stringify({state:state.state,creditsQuoted:state.creditsQuoted,result:resultFile},null,2));
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
