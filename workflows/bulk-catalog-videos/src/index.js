import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { defaults } from './workflow.js';
import { run } from './run.js';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value,null,2)+'\n'); renameSync(`${file}.tmp`,file); };
async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { values: args } = parseArgs({ options: { catalog: {type:'string',default:'data/catalog.json'}, config:{type:'string',default:'config.json'}, out:{type:'string',default:'out/run'}, offline:{type:'boolean'}, 'dry-run':{type:'boolean'}, resume:{type:'boolean'}, 'max-credits':{type:'string'} } });
  const config = {...defaults,...json(args.config)};
  mkdirSync(args.out,{recursive:true});
  const stateFile=path.join(args.out,'result.json'); const lockPath=path.join(args.out,'.run.lock'); const lock=openSync(lockPath,'wx');
  try {
    const prior=args.resume?json(stateFile):null;
    if (!args.resume && existsSync(stateFile)) {
      const previous=json(stateFile);
      if (!['prepared','offline','empty','validated','dry-run','rejected'].includes(previous.state)) throw new Error('This output directory records a paid submission attempt. Use --resume or inspect it before choosing a new --out');
      if (previous.state==='rejected' && Date.now()<previous.retryAt) throw new Error(`Rate limited. Retry after ${new Date(previous.retryAt).toISOString()}`);
    }
    const state=await run({catalog:prior?null:json(args.catalog),config,prior,offline:args.offline,dryRun:args['dry-run'],maxCredits:args['max-credits']===undefined?undefined:Number(args['max-credits']),
      client:args.offline?null:new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(120000)})}),
      save:s=>{write(stateFile,s);if(s.updatedCatalog)write(path.join(args.out,'updated-catalog.json'),s.updatedCatalog);},saveProject:(name,value)=>write(path.join(args.out,`${name}.json`),value)});
    console.log(JSON.stringify({state:state.state,products:state.products.length,creditsQuoted:state.creditsQuoted,videos:state.videos.length,errors:state.errors.length,result:stateFile},null,2));
    if(state.errors.length)process.exitCode=1;
  } finally {closeSync(lock);unlinkSync(lockPath);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
