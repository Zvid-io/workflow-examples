#!/usr/bin/env node
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ZvidClient} from '@zvid/sdk';
import {run,checkConfig} from './run.js';
import {createShopify} from './shopify.js';
import {deliver,emailContent} from './delivery.js';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
function writeJson(file,value) {writeFileSync(`${file}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(`${file}.tmp`,file);}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const {values:o}=parseArgs({options:{config:{type:'string',default:'config.json'},fixture:{type:'string'},
    out:{type:'string',default:'out/live'},ledger:{type:'string',default:'out/checkout-ledger.json'},
    offline:{type:'boolean'},'dry-run':{type:'boolean'},resume:{type:'boolean'},
    'max-credits':{type:'string'},deliver:{type:'string'},help:{type:'boolean'}}});
  if(o.help) {console.log(`Shopify abandoned checkout videos
  npm run offline                 build fictional input locally
  npm run dry-run                 validate + editor draft, no render
  npm run sample -- --max-credits 20  render fictional input, no email
  npm start -- --dry-run           select one live checkout; save its wait deadline
  npm start -- --resume --dry-run  after the wait, recheck + preview
  npm start -- --resume --max-credits 20  recheck and render, or poll saved job
  npm start -- --resume --deliver initial  explicitly send reviewed live result
  npm start -- --resume --deliver follow-up  after delay, recheck and send once
Options: --config, --fixture, --out, --ledger, --offline, --dry-run, --resume,
         --max-credits, --deliver initial|follow-up
Keep the same --out for resume and the same --ledger for a store.
All files under out/ are private. Rendering spends credits. No automatic emails.`);return;}
  if(o.offline&&!o.fixture)throw new Error('--offline requires --fixture');
  if(o.resume&&(o.fixture||o.offline))throw new Error('--resume uses saved input; omit fixture and offline');
  if(o.deliver&&(!o.resume||o['dry-run']||o.fixture||o.offline))throw new Error('Delivery requires --resume alone with --deliver');
  const config=checkConfig({...json(o.config),...(process.env.SHOPIFY_SHOP_DOMAIN?{shopDomain:process.env.SHOPIFY_SHOP_DOMAIN}:{}),...(o['dry-run']?{dryRun:true}:{})});
  mkdirSync(o.out,{recursive:true});mkdirSync(path.dirname(o.ledger),{recursive:true});
  const stateFile=path.join(o.out,'result.json'),lockFile=`${o.ledger}.lock`;
  const lock=openSync(lockFile,'wx');
  try {
    const prior=o.resume?json(stateFile):null;
    if(!o.resume&&existsSync(stateFile))throw new Error('This output directory has a saved run. Use --resume or a different directory for a genuinely new checkout');
    const fixture=o.fixture?json(o.fixture):null;
    const isFixture=Boolean(fixture||prior?.fixture);
    const shopify=isFixture?null:createShopify(config,process.env.SHOPIFY_ACCESS_TOKEN);
    const save=state=>writeJson(stateFile,state);
    let state;
    if(o.deliver) {
      const port=Number(process.env.SMTP_PORT||587);
      if(![465,587].includes(port)||!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD)throw new Error('Configure SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER and SMTP_PASSWORD');
      if(prior.shopDomain!==config.shopDomain)throw new Error('Saved run belongs to a different Shopify store');
      const nodemailer=(await import('nodemailer')).default;
      const mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port===587,
        auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},logger:false,debug:false,
        connectionTimeout:30_000,greetingTimeout:30_000,socketTimeout:60_000});
      try {state=await deliver({state:prior,phase:o.deliver,confirmedRecipient:process.env.CONFIRM_RECIPIENT,
        from:process.env.SMTP_FROM,shopify,mailer,save});} finally {mailer.close();}
    } else {
      const client=o.offline?null:new ZvidClient({apiKey:process.env.ZVID_API_KEY,baseUrl:'https://api.zvid.io',maxRetries:0,
        fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(120_000)})});
      const ledger=existsSync(o.ledger)?json(o.ledger):{};
      state=await run({config,fixture,prior,shopify,client,ledger,offline:o.offline,
        maxCredits:o['max-credits']===undefined?undefined:Number(o['max-credits']),save,
        saveLedger:value=>writeJson(o.ledger,value),saveProject:value=>writeJson(path.join(o.out,'project.json'),value)});
    }
    if(state.state==='rendered')for(const phase of ['initial','follow-up'])writeFileSync(path.join(o.out,`${phase}-email.html`),emailContent(state,phase).html,{mode:0o600});
    console.log(JSON.stringify({state:state.state,fixture:state.fixture,checkAt:state.checkAt?new Date(state.checkAt).toISOString():null,
      creditsQuoted:state.creditsQuoted,result:stateFile,deliveries:state.deliveries?Object.fromEntries(Object.entries(state.deliveries).map(([k,v])=>[k,v.status])):{}},null,2));
  }finally{closeSync(lock);unlinkSync(lockFile);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
