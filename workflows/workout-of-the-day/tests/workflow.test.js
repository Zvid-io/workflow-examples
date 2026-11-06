import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlan,jobKey } from '../src/workflow.js';
import { quoteProjects,submitProjects,waitForJob } from '../src/run.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const config=read('../config.json'),rows=read('../data/workouts.json'),now=new Date('2026-10-29T12:00:00Z');
test('both supplied variants preserve the original date, exact exercises and sample designs',()=>{
  const plan=buildPlan(config,rows,undefined,now);
  assert.deepEqual(plan.selection.map(x=>x.exercises[0]),[{name:'Squat',reps:'5x5'},{name:'Box squat',reps:'3x8'}]);
  assert(plan.selection.every(x=>x.usedFallback&&x.dateIso==='2026-10-01'));
  assert.deepEqual(plan.projects[0].payload,read('../assets/sample-project.json'));
  assert.deepEqual(plan.projects[1].payload,read('../assets/sample-scaled-project.json'));
});
test('no fallback means no old plan; future dates never become a fallback',()=>{
  assert.equal(buildPlan({...config,fallbackToLatest:false},rows,undefined,now).projects.length,0);
  assert.equal(buildPlan(config,[{...rows[0],Date:'2026-11-01'}],undefined,now).projects.length,0);
});
test('approval, unique keys, dates and variant completion control selection',()=>{
  assert.equal(buildPlan(config,[{...rows[0],Approval:''}],undefined,now).projects.length,0);
  assert.throws(()=>buildPlan(config,[rows[0],rows[0]],undefined,now),/unique/);
  assert.throws(()=>buildPlan(config,[{...rows[0],Date:'2026-02-30'}],undefined,now),/Date/);
  const standardKey=jobKey(rows[0].WorkoutKey,'Standard');
  const state={jobs:{[standardKey]:{state:'completed',jobId:'j',videoUrl:'https://example.com/standard.mp4'}}};
  assert.deepEqual(buildPlan(config,rows,state,now).projects.map(x=>x.variant),['Scaled']);
});
test('saved job is selected for recovery without creating a new project',()=>{
  const key=jobKey(rows[0].WorkoutKey,'Standard'),state={jobs:{[key]:{state:'rendering',jobId:'accepted'}}};
  const plan=buildPlan(config,[{...rows[0],Approval:''}],state,now);
  assert.equal(plan.projects.length,0);assert.deepEqual(plan.resumeKeys,[key]);
  assert.equal(buildPlan({...config,dryRun:true},rows,state,now).resumeKeys.length,0);
});
test('last spaced x separates exercise names and reps',()=>{
  const plan=buildPlan(config,[{...rows[0],Ex1:'Complex x variation x 3x5',ScaledEx1:''}],undefined,now);
  assert.deepEqual(plan.selection[0].exercises[0],{name:'Complex x variation',reps:'3x5'});
});
test('invalid or oversized quote prevents submission',async()=>{
  const projects=buildPlan(config,rows,undefined,now).projects;
  for(const result of [{valid:true},{valid:true,creditsRequired:21},{valid:false,errors:[{message:'bad media'}]}])await assert.rejects(quoteProjects({authoring:{validate:async()=>result}},projects,config));
});
test('total budget is checked before the first paid request',async()=>{
  let submitted=0;const projects=buildPlan(config,rows,undefined,now).projects.map(p=>({...p,creditsQuoted:13}));
  await assert.rejects(submitProjects({renders:{create:async()=>{submitted++;return{jobId:'j'}}}},projects,{jobs:{}},{maxCredits:25,save:async()=>{}}),/exceeds/);
  assert.equal(submitted,0);
});
test('accepted IDs are saved before waiting and each variant finishes before the next submit',async()=>{
  const state={jobs:{}},order=[],projects=buildPlan(config,rows,undefined,now).projects.map(p=>({...p,creditsQuoted:13}));
  await submitProjects({renders:{create:async()=>{order.push('submit');return{jobId:'j'+order.length}}}},projects,state,{maxCredits:26,save:async()=>{},onAccepted:async key=>{assert(state.jobs[key].jobId);order.push('finish')}});
  assert.deepEqual(order,['submit','finish','submit','finish']);assert.equal(Object.keys(state.jobs).length,2);
});
test('ambiguous submission stays blocked instead of rendering twice',async()=>{
  let submitted=0;const state={jobs:{}},projects=buildPlan(config,rows,undefined,now).projects.map(p=>({...p,creditsQuoted:13}));
  const client={renders:{create:async()=>{submitted++;throw Error('network disconnected')}}};
  await assert.rejects(submitProjects(client,projects,state,{maxCredits:26,save:async()=>{}}),/unknown/);
  assert.equal(state.jobs[projects[0].key].state,'submission-unknown');
  await assert.rejects(submitProjects(client,projects,state,{maxCredits:26,save:async()=>{}}),/Saved/);assert.equal(submitted,1);
});
test('failed and timed-out jobs keep their IDs',async()=>{
  const failed={jobId:'f'};await assert.rejects(waitForJob({jobs:{get:async()=>({state:'failed',failedReason:'media missing'})}},failed,{save:async()=>{}}),/media missing/);assert.equal(failed.jobId,'f');
  const timed={jobId:'t'};let time=0;await assert.rejects(waitForJob({jobs:{get:async()=>({state:'active'})}},timed,{save:async()=>{},now:()=>time++,timeoutMs:1,sleep:async()=>{}}),/timed out/);assert.equal(timed.jobId,'t');assert.equal(timed.state,'timed_out');
});
test('completed jobs need a valid HTTPS output and preserve returned URLs',async()=>{
  const job={jobId:'c'};await waitForJob({jobs:{get:async()=>({state:'completed',result:{url:'https://example.com/video.mp4'}})}},job,{save:async()=>{}});assert.equal(job.videoUrl,'https://example.com/video.mp4');
  await assert.rejects(waitForJob({jobs:{get:async()=>({state:'completed'})}},{jobId:'bad'},{save:async()=>{}}),/no HTTPS/);
});
