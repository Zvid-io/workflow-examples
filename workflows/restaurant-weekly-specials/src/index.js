#!/usr/bin/env node
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ZvidClient} from '@zvid/sdk';
import {defaults,csvRows} from './workflow.js';
import {run} from './run.js';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,x)=>{writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');renameSync(p+'.tmp',p);};
async function main(){
  if(existsSync('.env'))process.loadEnvFile('.env');
  const {values:o}=parseArgs({options:{input:{type:'string'},config:{type:'string',default:'config.json'},history:{type:'string',default:'out/campaign-history.json'},out:{type:'string',default:'out/review'},date:{type:'string'},offline:{type:'boolean'},render:{type:'boolean'},resume:{type:'string'},'max-credits':{type:'string'},help:{type:'boolean'}}});
  if(o.help){console.log('Default: validate only. Use --input data/menu.json, --offline, --render --max-credits 30, or --resume campaign-key. Read README.md before rendering.');return;}
  if(o.resume&&(o.input||o.render||o.offline||o.date))throw new Error('Resume uses saved history; omit input, render, offline and date');
  if(!o.resume&&!o.input)throw new Error('Provide --input <JSON>');
  if(o.date&&!/^\d{4}-\d{2}-\d{2}$/.test(o.date))throw new Error('date must be YYYY-MM-DD');
  const now=o.date?new Date(o.date+'T12:00:00Z'):new Date();
  if(o.date&&(!Number.isFinite(now.getTime())||now.toISOString().slice(0,10)!==o.date))throw new Error('date must be a real date');
  mkdirSync(o.out,{recursive:true});mkdirSync(path.dirname(o.history),{recursive:true});
  const lockFile=o.history+'.lock';const lock=openSync(lockFile,'wx');
  try{
    const config={...defaults,...json(o.config)};
    const client=o.offline?null:new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(120000)})});
    const result=await run({rows:o.input?json(o.input):[],config,history:existsSync(o.history)?json(o.history):[],now,client,offline:o.offline,render:o.render,resumeKey:o.resume,maxCredits:o['max-credits']===undefined?undefined:Number(o['max-credits']),save:history=>write(o.history,history),saveProject:project=>write(path.join(o.out,'project.json'),project)});
    write(path.join(o.out,'result.json'),result);
    if(result.posts)writeFileSync(path.join(o.out,'posting-plan.csv'),csvRows(result));
    if(result.status==='completed'){
      const response=await fetch(result.videoUrl,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`Download returned ${response.status}; saved completed job can be resumed`);
      const bytes=Buffer.from(await response.arrayBuffer());const len=response.headers.get('content-length');
      if(bytes.length<1024||bytes.subarray(4,8).toString()!=='ftyp'||(len&&bytes.length!==Number(len)))throw new Error('Download is not a complete MP4; keep the saved job');
      writeFileSync(path.join(o.out,'video.mp4.tmp'),bytes);renameSync(path.join(o.out,'video.mp4.tmp'),path.join(o.out,'video.mp4'));
    }
    console.log(JSON.stringify({status:result.status,campaignKey:result.campaignKey,dishes:result.dishes?.map(d=>d.name),creditsQuoted:result.creditsRequired,output:o.out},null,2));
  }finally{closeSync(lock);unlinkSync(lockFile);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
