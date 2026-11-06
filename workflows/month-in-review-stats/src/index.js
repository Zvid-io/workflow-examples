import { existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { run } from './run.js';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,v)=>{writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');renameSync(p+'.tmp',p);};
async function main(){
  if(existsSync('.env'))process.loadEnvFile('.env');
  const {values:o}=parseArgs({options:{input:{type:'string',default:'data/metrics.json'},config:{type:'string',default:'config.json'},out:{type:'string',default:'out/live'},offline:{type:'boolean'},'dry-run':{type:'boolean'},render:{type:'boolean'},'max-credits':{type:'string'},resume:{type:'boolean'}}});
  if((o.offline&&o.render)||(o['dry-run']&&o.render)||(o.resume&&(o.offline||o['dry-run']||o.render)))throw new Error('Choose offline, dry-run, render or resume');
  if(!o.offline&&!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in .env');
  mkdirSync(o.out,{recursive:true});
  const resultFile=path.join(o.out,'result.json'),lockFile=path.join(o.out,'.run.lock');
  const lock=openSync(lockFile,'wx');
  try{
    const existing=existsSync(resultFile)?json(resultFile):null;
    if(!o.resume&&['submission-pending','submitted','completed'].includes(existing?.state))throw new Error('This folder has a paid attempt; use --resume or inspect it before using a new folder');
    if(o.resume&&!existing)throw new Error('No result.json to resume');
    const client=o.offline?null:new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(u,i)=>fetch(u,{...i,signal:AbortSignal.timeout(120000)})});
    const state=await run({input:o.resume?null:json(o.input),config:json(o.config),client,offline:o.offline,dryRun:!o.render,prior:o.resume?existing:null,maxCredits:o['max-credits']===undefined?undefined:Number(o['max-credits']),save:s=>write(resultFile,s),saveProject:p=>write(path.join(o.out,'project.json'),p)});
    console.log(JSON.stringify({state:state.state,creditsQuoted:state.creditsQuoted,result:resultFile},null,2));
  }finally{closeSync(lock);unlinkSync(lockFile);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
