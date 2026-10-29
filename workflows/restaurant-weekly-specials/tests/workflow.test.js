import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare,csvRows} from '../src/workflow.js';
import {run} from '../src/run.js';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const rows=json('../data/menu.json'),config=json('../config.json'),now=new Date('2026-10-22T12:00:00Z');
const client=()=>({authoring:{validate:async()=>({valid:true,creditsRequired:13})},renders:{create:async()=>({jobId:'job-test'})},jobs:{wait:async()=>({state:'completed',result:'https://example.com/result.mp4'})}});
test('selects full-week approved menu and marks past posting dates',()=>{
  const p=prepare(rows,config,[],now);
  assert.deepEqual(p.dishes.map(d=>d.key),['DEMO-PASTA','DEMO-BOWL','DEMO-DESSERT']);
  assert.equal(p.skipped.find(s=>s.key==='DEMO-LATE').reason,'not_available_for_entire_campaign_week');
  assert.deepEqual(p.posts.map(p=>p.reviewStatus),['past_date_do_not_publish','past_date_do_not_publish','review_before_scheduling']);
});
test('requires approval, price, photo and menu variety',()=>{
  const p=prepare(rows.map(r=>({...r,Category:'Main'})),config,[],now);assert.equal(p.status,'menu_needs_revision');
  const bad=structuredClone(rows);bad[0].Approval='pending';bad[1].Price='';bad[2].PhotoUrl='';
  assert.equal(prepare(bad,config,[],now).ready,false);
});
test('duplicate identifiers and invalid dates fail visibly',()=>{
  assert.throws(()=>prepare([...rows,rows[0]],config,[],now),/unique DishKey/);
  assert.throws(()=>prepare([{...rows[0],AvailableFrom:'2026-02-30'}],config,[],now),/real YYYY-MM-DD/);
});
test('equal-priority dishes rotate while selecting category variety',()=>{
  const menu=rows.slice(0,3).map(r=>({...r,Priority:1}));
  menu.push({...menu[0],DishKey:'DEMO-NEW',Dish:'New pasta'});
  const ledger=[{Status:'completed',PlanJson:JSON.stringify({weekStart:'2026-10-12',dishes:[{key:'DEMO-PASTA'}]})}];
  const p=prepare(menu,config,ledger,now);assert(p.dishes.some(d=>d.key==='DEMO-NEW'));assert(!p.dishes.some(d=>d.key==='DEMO-PASTA'));
});
test('preview never saves history or submits a paid render',async()=>{
  const c=client();c.renders.create=()=>{throw new Error('paid call forbidden');};
  const p=await run({rows,config,now,client:c,save:()=>{throw new Error('history write forbidden');}});assert.equal(p.status,'preview');assert.equal(p.creditsRequired,13);
});
test('over-budget quote stops before reservation or render',async()=>{
  const c=client();c.renders.create=()=>{throw new Error('paid call forbidden');};
  await assert.rejects(run({rows,config,now,client:c,render:true,maxCredits:12,save:()=>{throw new Error('history write forbidden');}}),/maxCreditsPerVideo/);
});
test('accepted job is persisted before polling and resumed without another submission',async()=>{
  let history=[];const c=client();c.jobs.wait=async()=>{throw new Error('connection interrupted');};
  await assert.rejects(run({rows,config,now,client:c,render:true,maxCredits:30,save:h=>{history=structuredClone(h);}}),/connection interrupted/);
  assert.equal(history[0].JobId,'job-test');assert.equal(history[0].Status,'rendering');
  const recover=client();recover.renders.create=()=>{throw new Error('duplicate paid call');};recover.authoring.validate=()=>{throw new Error('must use snapshot');};
  const p=await run({config,now,client:recover,history,resumeKey:'menu-2026-10-19-1',save:h=>{history=structuredClone(h);}});
  assert.equal(p.status,'completed');assert.equal(history[0].Status,'completed');
});
test('uncertain submission remains blocked from automatic retry',async()=>{
  let history=[];const c=client();c.renders.create=async()=>{throw new Error('network unknown');};
  await assert.rejects(run({rows,config,now,client:c,render:true,maxCredits:30,save:h=>{history=structuredClone(h);}}),/network unknown/);
  assert.equal(history[0].Status,'submitting');
  const p=await run({rows,config,now,client:c,history,render:true,maxCredits:30});assert.equal(p.status,'nothing_to_render');
});
test('completed campaign is skipped and duplicate log records fail',()=>{
  const record={CampaignKey:'menu-2026-10-19-1',Status:'completed',VideoUrl:'https://example.com/video.mp4'};
  assert.equal(prepare(rows,config,[record],now).status,'nothing_to_render');
  assert.throws(()=>prepare(rows,config,[record,record],now),/Duplicate CampaignKey/);
});
test('CSV protects spreadsheet formula prefixes and escapes quotes',()=>{
  const csv=csvRows({campaignKey:'key',posts:[{date:'2026-10-19',purpose:'=formula',caption:'Hello "world"',reviewStatus:'review_before_scheduling'}]});
  assert(csv.includes('"\'=formula"'));assert(csv.includes('Hello ""world""'));
});
