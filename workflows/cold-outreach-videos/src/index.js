import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';import {parseArgs} from 'node:util';import {ZvidClient} from '@zvid/sdk';import {run} from './run.js';
const json=f=>JSON.parse(readFileSync(f,'utf8'));
const write=(f,v)=>{writeFileSync(`${f}.tmp`,JSON.stringify(v,null,2)+'\n',{mode:0o600});renameSync(`${f}.tmp`,f);};
async function main(){
  if(existsSync('.env'))process.loadEnvFile('.env');
  const {values:o}=parseArgs({options:{config:{type:'string',default:'config.json'},input:{type:'string',default:'data/leads.json'},out:{type:'string',default:'out/live'},offline:{type:'boolean'},'dry-run':{type:'boolean'},resume:{type:'boolean'},'max-credits':{type:'string'}}});
  const config={...json(o.config),...(o['dry-run']?{dryRun:true}:{})};mkdirSync(o.out,{recursive:true});
  const file=path.join(o.out,'result.json'),lock=path.join(o.out,'.lock');const fd=openSync(lock,'wx');
  try{
    if(!o.resume&&existsSync(file)&&!['offline','dry-run','validated','prepared','empty'].includes(json(file).state))throw new Error('Saved submission exists. Use --resume with this output directory');
    const client=o.offline?null:new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(120000)})});
    const state=await run({rows:o.resume?null:json(o.input),config,client,prior:o.resume?json(file):null,offline:o.offline,maxCredits:o['max-credits']===undefined?undefined:Number(o['max-credits']),save:s=>write(file,s),saveProject:(name,p)=>write(path.join(o.out,`${name}.json`),p)});
    if(state.updatedRows)write(path.join(o.out,'leads-updated.json'),state.updatedRows);
    console.log(JSON.stringify({state:state.state,creditsQuoted:state.creditsQuoted,videos:state.videos.length,result:file},null,2));
  }finally{closeSync(fd);unlinkSync(lock);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
