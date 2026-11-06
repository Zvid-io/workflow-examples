#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { prepare, renderOne } from './workflow.js';

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: args } = parseArgs({options:{
    config:{type:'string',default:'config.json'},input:{type:'string',default:'data/no-show.json'},out:{type:'string',default:'out/sample'},
    offline:{type:'boolean'},validate:{type:'boolean'},render:{type:'boolean'},resume:{type:'boolean'},'max-credits':{type:'string'}
  }});
  if ([args.offline,args.validate,args.render,args.resume].filter(Boolean).length > 1) throw new Error('Choose only one of --offline, --validate, --render or --resume');
  mkdirSync(args.out,{recursive:true});
  const file = name => path.join(args.out,name);
  const read = filename => JSON.parse(readFileSync(filename,'utf8'));
  const save = (name,value) => {writeFileSync(file(name)+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(file(name)+'.tmp',file(name));};
  const lockFile=file('.run.lock'); const lock=openSync(lockFile,'wx');
  try {
    const prior=existsSync(file('result.json'))?read(file('result.json')):null;
    if (args.resume && !prior) throw new Error('No result.json found in this --out directory');
    if (prior && prior.state!=='validated' && !args.resume) throw new Error('A render was already attempted here. Use --resume with the same --out');
    let payload;
    if (!args.resume) {
      const built=prepare(read(args.config),read(args.input));payload=built.payload;
      save('project.json',payload);save('summary.json',built.meta);
      if (args.offline) {console.log('Built project.json locally. No requests or charges.');return;}
    }
    const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,
      fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(120000)})});
    const result=await renderOne({payload,client,prior:args.resume?prior:null,render:args.render===true,
      maxCredits:Number(args['max-credits']),save:value=>save('result.json',value)});
    if(result.state==='completed') {
      const target=file('video.mp4');
      if(!existsSync(target)) {
        const response=await fetch(result.videoUrl,{signal:AbortSignal.timeout(120000)});
        if(!response.ok)throw new Error(`Download failed (${response.status}). Use --resume to download without rendering again`);
        writeFileSync(target,Buffer.from(await response.arrayBuffer()),{mode:0o600});
      }
    }
    console.log(JSON.stringify({state:result.state,creditsQuoted:result.creditsQuoted,result:file('result.json'),video:result.state==='completed'?file('video.mp4'):undefined},null,2));
  } finally {closeSync(lock);unlinkSync(lockFile);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
