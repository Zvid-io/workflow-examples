import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildProject} from '../src/build-project.js';
import {run} from '../src/run.js';
import {eligible,selectCheckout,createShopify} from '../src/shopify.js';
import {deliver,emailContent} from '../src/delivery.js';
const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const config={...read('../config.json'),shopDomain:'example-shop'};
const fixture=read('../data/checkout.json');
const clone=value=>structuredClone(value);
const ok=()=>({customerHasNoOrderSinceAbandonment:true,customerHasNoDraftOrderSinceAbandonment:true,
  inventoryAvailable:true,isMostSignificantAbandonment:true,emailSentAt:null,
  abandonedCheckoutPayload:{completedAt:null,abandonedCheckoutUrl:'https://example-shop.myshopify.com/checkouts/recovery'},
  customer:{defaultEmailAddress:{emailAddress:'alex@example.com'}}});
function clientMock() {
  const calls={render:0,poll:0};
  return {calls,authoring:{validate:async({payload})=>({valid:true,payload,creditsRequired:14,warnings:[]})},
    projects:{create:async()=>({id:'prj_example'})},renders:{create:async()=>{calls.render++;return{jobId:'job_example'};}},
    jobs:{get:async()=>{calls.poll++;return{state:'completed',result:'https://cdn.zvid.io/example.mp4'};}}};
}
const liveState=()=>({state:'rendered',fixture:false,shopDomain:config.shopDomain,config:clone(config),cart:clone(fixture),videoUrl:'https://cdn.zvid.io/example.mp4'});
const deliveryArgs=state=>({state,phase:'initial',confirmedRecipient:'alex@example.com',from:'sender@example.com',
  shopify:{confirmDelivery:async()=>ok()},mailer:{sendMail:async()=>({accepted:['alex@example.com'],rejected:[],messageId:'test'})}});

test('design matches three scenes and keeps private delivery fields out',()=>{
  const result=buildProject(config,fixture),text=JSON.stringify(result.payload);
  assert.equal(result.meta.totalSeconds,13.8);assert.equal(result.payload.scenes.length,3);
  for(const field of ['email','phone','checkoutUrl'])assert.equal(text.includes(fixture[field]),false);
  assert.match(text,/Clay Pocket Oversized Tee/);assert.match(text,/Alex/);
});
test('one to three items and missing images produce usable designs',()=>{
  for(const count of [1,2,3]){const result=buildProject(config,{...fixture,items:Array.from({length:count},(_,i)=>({title:'Item '+i,imageUrl:'file:///private',price:'12.00'}))});assert.equal(result.meta.itemCount,count);assert.equal(result.meta.itemsWithImages,0);}
  assert.throws(()=>buildProject(config,{...fixture,items:[]}),/no line items/);
});
test('offline fixture never calls a service',async()=>{
  const state=await run({config,fixture,offline:true});assert.equal(state.state,'offline');assert.equal(state.jobId,undefined);
});
test('dry run creates draft without render',async()=>{
  const client=clientMock();const state=await run({config:{...config,dryRun:true},fixture,client});
  assert.equal(state.state,'dry-run');assert.match(state.editorLink,/editor.zvid.io/);assert.equal(client.calls.render,0);
});
test('missing and exceeded credit ceilings block submission',async()=>{
  for(const maxCredits of [undefined,13]){const client=clientMock();await assert.rejects(run({config,fixture,client,maxCredits}),/max-credits|exceeds/);assert.equal(client.calls.render,0);}
});
test('accepted render is saved before polling and resume does not resubmit',async()=>{
  const client=clientMock();let saved;
  client.jobs.get=async()=>{throw new Error('connection lost');};
  await assert.rejects(run({config,fixture,client,maxCredits:14,save:s=>{saved=clone(s);}}),/connection lost/);
  assert.equal(saved.jobId,'job_example');const resumed=clientMock();
  const state=await run({config,prior:saved,client:resumed});assert.equal(state.state,'rendered');assert.equal(resumed.calls.render,0);
});
test('ambiguous acceptance cannot silently retry rendering',async()=>{
  const client=clientMock();let saved;client.renders.create=async()=>{throw new Error('timeout');};
  await assert.rejects(run({config,fixture,client,maxCredits:14,save:s=>{saved=clone(s);}}),/timeout/);
  assert.equal(saved.state,'submission-pending');await assert.rejects(run({config,prior:saved,client:clientMock()}),/uncertain/);
});
test('live selection waits and records a persistent duplicate key',async()=>{
  const checkout={id:'gid://shopify/AbandonedCheckout/1',customer:{firstName:'Alex',defaultEmailAddress:{emailAddress:'alex@example.com'}},
    abandonedCheckoutUrl:'https://example-shop.myshopify.com/recovery',lineItems:{nodes:[{title:'Tee',quantity:1}]}};
  const data={abandonedCheckouts:{nodes:[checkout]}};const ledger={};
  const state=await run({config,shopify:{list:async()=>data},ledger,now:()=>1000});
  assert.equal(state.state,'waiting');assert.equal(state.checkAt,3601000);assert.equal(selectCheckout(data,ledger,config.shopDomain),null);
});
test('conversion and unavailable inventory suppress recovery',()=>{
  assert.equal(eligible(ok()),true);
  for(const flag of ['customerHasNoOrderSinceAbandonment','customerHasNoDraftOrderSinceAbandonment','inventoryAvailable','isMostSignificantAbandonment'])assert.equal(eligible({...ok(),[flag]:false}),false);
  assert.equal(eligible({...ok(),emailSentAt:'2026-10-28'}),false);
});
test('fixture and unconfirmed recipients cannot be sent',async()=>{
  await assert.rejects(deliver(deliveryArgs({...liveState(),fixture:true})),/Fixture/);
  await assert.rejects(deliver({...deliveryArgs(liveState()),confirmedRecipient:'other@example.com'}),/CONFIRM_RECIPIENT/);
});
test('changed recipients and recovered checkouts block sending',async()=>{
  for(const fresh of [{...ok(),inventoryAvailable:false},{...ok(),customer:{defaultEmailAddress:{emailAddress:'changed@example.com'}}}])
    await assert.rejects(deliver({...deliveryArgs(liveState()),shopify:{confirmDelivery:async()=>fresh}}),/eligible|recipient changed/);
});
test('SMTP acceptance is recorded only after success and duplicate sends stop',async()=>{
  const state=liveState(),events=[];await deliver({...deliveryArgs(state),save:s=>events.push(s.deliveries.initial.status)});
  assert.deepEqual(events,['attempting','sent']);await assert.rejects(deliver(deliveryArgs(state)),/attempt record/);
});
test('ambiguous SMTP result remains uncertain and cannot retry blindly',async()=>{
  const state=liveState();await assert.rejects(deliver({...deliveryArgs(state),mailer:{sendMail:async()=>{throw new Error('socket gone');}}}),/unconfirmed/);
  assert.equal(state.deliveries.initial.status,'uncertain');await assert.rejects(deliver(deliveryArgs(state)),/attempt record/);
});
test('follow-up requires initial send, elapsed wait and fresh eligibility',async()=>{
  const state=liveState();await assert.rejects(deliver({...deliveryArgs(state),phase:'follow-up'}),/initial SMTP/);
  state.deliveries.initial={status:'sent',sentAt:100};
  await assert.rejects(deliver({...deliveryArgs(state),phase:'follow-up',now:()=>101}),/delay/);
  await assert.rejects(deliver({...deliveryArgs(state),phase:'follow-up',now:()=>50_000_000,shopify:{confirmDelivery:async()=>({...ok(),customerHasNoOrderSinceAbandonment:false})}}),/eligible/);
});
test('explicitly disabled follow-up never calls SMTP',async()=>{
  const state=liveState();state.config.followUpEnabled=false;state.deliveries={initial:{status:'sent',sentAt:0}};
  let sends=0;
  await assert.rejects(deliver({...deliveryArgs(state),phase:'follow-up',now:()=>50_000_000,mailer:{sendMail:async()=>{sends++;}}}),/disabled/);
  assert.equal(sends,0);
});
test('live EUR checkout uses its Shopify currency instead of the dollar default',async()=>{
  const state={state:'waiting',fixture:false,shopDomain:config.shopDomain,config:clone(config),cart:{...clone(fixture),currencyCode:'EUR'},checkAt:0};
  const result=await run({config:{...config,dryRun:true},prior:state,shopify:{confirm:async()=>ok()},client:clientMock()});
  const text=JSON.stringify(result.payload);assert.match(text,/€35\.00/);assert.doesNotMatch(text,/\$35\.00/);
});
test('HTML escapes cart content and does not embed video as an attachment',()=>{
  const state=liveState();state.cart.firstName='<script>';
  const content=emailContent(state);assert.match(content.html,/&lt;script&gt;/);assert.doesNotMatch(content.html,/<script>|<video/);
});
test('Shopify read uses canonical URL and does not expose token on error',async()=>{
  let captured;const api=createShopify(config,'secret',async(url,opts)=>{captured={url,opts};return{ok:false,status:401};});
  await assert.rejects(api.list(),error=>error.message.includes('401')&&!error.message.includes('secret'));
  assert.equal(captured.opts.redirect,'error');assert.match(captured.url,/example-shop\.myshopify\.com/);
});
