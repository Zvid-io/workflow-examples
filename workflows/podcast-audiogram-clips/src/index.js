#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ZvidClient} from '@zvid/sdk';
import {defaults,checkConfig,buildClips} from './workflow.js';
import {preparePodcast} from './prepare.js';
import {renderClips} from './render.js';
const read=file=>JSON.parse(readFileSync(file,'utf8'));
async function main(){
  if(existsSync('.env'))process.loadEnvFile('.env');
  const {values:args}=parseArgs({options:{config:{type:'string',default:'config.json'},out:{type:'string',default:'out/live'},offline:{type:'boolean'},sample:{type:'boolean'},prepare:{type:'boolean'},validate:{type:'boolean'},resume:{type:'boolean'},'allow-upstream-costs':{type:'boolean'},'max-credits':{type:'string'}}});
  if([args.offline,args.prepare,args.validate,args.resume].filter(Boolean).length>1)throw new Error('Choose one of --offline, --prepare, --validate or --resume');
  const config=checkConfig({...defaults,...read(args.config)});
  mkdirSync(args.out,{recursive:true});
  const file=name=>path.join(args.out,name);const lockFile=file('.run.lock');const lock=openSync(lockFile,'wx');
  const save=(name,value)=>{writeFileSync(file(name)+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(file(name)+'.tmp',file(name));};
  const saveProjects=prepared=>{const projects=buildClips(prepared);save('projects.json',projects);for(const p of projects)save(`clip-${p.meta.clipIndex}.json`,p.payload);return projects;};
  try{
    if(args.offline){saveProjects(read('data/sample.json'));console.log('Built the supplied sample locally; no requests or charges.');return;}
    if(!process.env.ZVID_API_KEY)throw new Error('Set ZVID_API_KEY in .env');
    const client=new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(120_000)})});
    if(args.prepare){
      if(!args['allow-upstream-costs'])throw new Error('Live preparation transcribes audio and calls a model. Add --allow-upstream-costs to proceed');
      if(existsSync(file('preparation-status.json')))throw new Error('Preparation was already attempted here. Inspect saved files before choosing a new --out');
      const prepared=await preparePodcast({config,client,save,saveBinary:(name,bytes)=>writeFileSync(file(name),bytes),keys:{ELEVENLABS_API_KEY:process.env.ELEVENLABS_API_KEY,OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY}});
      saveProjects(prepared);console.log('Prepared clips; transcription and model charges may apply. No render submitted.');return;
    }
    const prior=existsSync(file('result.json'))?read(file('result.json')):null;
    if(args.resume&&!prior)throw new Error('No result.json to resume');
    if(prior&&!args.resume&&prior.state!=='validated')throw new Error('A render was attempted here. Use --resume; do not submit it again');
    const projects=args.resume?undefined:args.sample?saveProjects(read('data/sample.json')):read(file('projects.json'));
    const result=await renderClips({projects,client,prior:args.resume?prior:null,validateOnly:args.validate||(!args.resume&&config.dryRun),maxCredits:Number(args['max-credits']),save:state=>save('result.json',state),pollSeconds:config.pollSeconds,timeoutMinutes:config.timeoutMinutes});
    console.log(JSON.stringify({state:result.state,creditsQuoted:result.creditsQuoted,result:file('result.json')},null,2));
  }finally{closeSync(lock);unlinkSync(lockFile);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
