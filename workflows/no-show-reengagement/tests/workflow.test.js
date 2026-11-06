import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare,renderOne} from '../src/workflow.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const input=JSON.parse(readFileSync(new URL('../data/no-show.json',import.meta.url)));
test('input restrictions are explicit and identity is escaped',()=>{
  assert.throws(()=>prepare(config,{...input,firstName:''}),/firstName/);
  assert.throws(()=>prepare({...config,highlights:[]},input),/highlights/);
  assert.throws(()=>prepare(config,{...input,rebookUrl:'javascript:alert(1)'}),/HTTPS/);
  const html=JSON.stringify(prepare(config,{...input,firstName:'<Maya>'}).payload);
  assert(!html.includes('<Maya>'));assert(html.includes('&lt;Maya&gt;'));
});
function harness(quote=16,states=[{state:'completed',result:{url:'https://cdn.zvid.io/example.mp4'}}]) {
  const saved=[];let submissions=0,polls=0;
  return {saved,get submissions(){return submissions;},client:{authoring:{validate:async()=>({valid:true,creditsRequired:quote,warnings:[]})},renders:{create:async()=>{submissions++;return {jobId:'saved-job'};}},jobs:{get:async()=>states[Math.min(polls++,states.length-1)]}},save:state=>saved.push(structuredClone(state))};
}
test('default validates without a paid submission',async()=>{const h=harness();const r=await renderOne({...h,payload:{}});assert.equal(r.state,'validated');assert.equal(h.submissions,0);});
test('invalid and over-budget quotes never submit',async()=>{
  for(const quote of [null,NaN,30]) {const h=harness(quote);await assert.rejects(()=>renderOne({...h,payload:{},render:true,maxCredits:20}));assert.equal(h.submissions,0);}
});
test('saves pending state before submission and the ID before polling',async()=>{
  const h=harness();await renderOne({...h,payload:{},render:true,maxCredits:20});
  assert.deepEqual(h.saved.slice(0,3).map(x=>x.state),['validated','submission-pending','submitted']);
  assert.equal(h.saved[2].jobId,'saved-job');assert.equal(h.submissions,1);
});
test('resume never submits another render',async()=>{
  const h=harness();const r=await renderOne({...h,prior:{state:'submitted',jobId:'existing-job'}});assert.equal(r.state,'completed');assert.equal(h.submissions,0);
  await assert.rejects(()=>renderOne({...h,prior:{state:'submission-pending'}}),/dashboard/);assert.equal(h.submissions,0);
});
test('failure preserves the saved job; timeouts remain resumable',async()=>{
  let h=harness(16,[{state:'failed',failedReason:'Input asset unavailable'}]);await assert.rejects(()=>renderOne({...h,prior:{state:'submitted',jobId:'existing-job'}}),/Input asset/);assert.equal(h.saved.at(-1).state,'failed');
  h=harness(16,[{state:'active'}]);await assert.rejects(()=>renderOne({...h,prior:{state:'submitted',jobId:'existing-job'},timeoutMs:0}),/timed out/);assert.equal(h.submissions,0);assert.equal(h.saved.at(-1).jobId,'existing-job');
});
