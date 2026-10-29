import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, prepare, checkConfig } from '../src/workflow.js';
import { run } from '../src/run.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const config = { ...defaults, ...read('../config.json') };
const input = read('../data/testimonials.json');
function client({ valid=true, credits=20, submitError, waitError }={}) {
  const calls = { validate:0, submit:0, wait:0 };
  return { calls,
    authoring: { validate: async()=>{calls.validate++;return {valid,creditsRequired:credits,errors:valid?[]:['bad project']};} },
    renders: { create: async()=>{calls.submit++;if(submitError)throw submitError;return {jobId:'job-test'};} },
    jobs: { wait:async id=>{calls.wait++;assert.equal(id,'job-test');if(waitError)throw waitError;return {state:'completed',result:'https://cdn.zvid.io/example.mp4'};} },
  };
}
test('sample exactly reproduces the retained template payload',()=>assert.deepEqual(prepare(input,config).payload,read('../assets/sample-project.json')));
test('selection excludes non-featured, compiled and empty rows',()=>{
  const rows=[{...input[0],Featured:false},{...input[0],Status:'compiled'},{...input[0],Quote:''},...input];
  const b=prepare(rows,config);assert.equal(b.meta.quoteCount,2);assert.deepEqual(b.selected.skipped,{notFeatured:1,alreadyCompiled:1,noQuote:1});
});
test('fewer than two pending quotes stops without an API call',async()=>{const c=client();const r=await run({input:[input[0]],config,client:c});assert.equal(r.state,'empty');assert.equal(c.calls.validate,0);});
test('monthly label never filters dates and override wins',()=>{const b=prepare(input.map(r=>({...r,SubmittedAt:'2020-01-01'})),config);assert.equal(b.meta.quoteCount,2);assert.equal(b.meta.monthLabel,'October 2026');});
test('blank ratings add no stars and invalid ratings are rejected',()=>{assert.equal(prepare(input,config).meta.starredCount,0);assert.throws(()=>prepare([{...input[0],Rating:9},input[1]],config),/Rating/);});
test('quote cap preserves source order',()=>{const b=prepare([...input,{...input[0],Author:'Third'}],config);assert.deepEqual(b.meta.rows.map(r=>r.author),['Maya Chen','Alex Morgan']);});
test('long quotes are reported and untrusted HTML is escaped',()=>{const b=prepare([{...input[0],Quote:'<script> {{bad}} '+ 'long quoted words '.repeat(30)},input[1]],config);assert.equal(b.meta.truncatedCount,1);const q=b.payload.variables.testimonials[0].quote;assert.ok(q.includes('&lt;script&gt;'));assert.ok(!q.includes('{{bad}}'));});
test('invalid configuration fails before network use',()=>{assert.throws(()=>checkConfig({...config,minQuotes:1}),/minQuotes/);assert.throws(()=>checkConfig({...config,musicUrl:'https://example.com/music.mp3'}),/silent/);});
test('offline builds without validation or rendering',async()=>{const c=client();const r=await run({input,config,client:c,offline:true});assert.equal(r.state,'offline');assert.deepEqual(c.calls,{validate:0,submit:0,wait:0});});
test('default validates without submission',async()=>{const c=client();const r=await run({input,config,client:c});assert.equal(r.state,'validated');assert.equal(c.calls.submit,0);});
test('invalid project and over-budget quote block rendering',async()=>{for(const opts of [{valid:false},{credits:21}]){const c=client(opts);await assert.rejects(run({input,config,client:c,render:true,maxCredits:20}));assert.equal(c.calls.submit,0);}});
test('render requires a positive explicit ceiling',async()=>{const c=client();await assert.rejects(run({input,config,client:c,render:true}),/max-credits/);assert.equal(c.calls.submit,0);});
test('paid attempt is persisted before submission and job id before polling',async()=>{const c=client();const states=[];const r=await run({input,config,client:c,render:true,maxCredits:20,save:s=>states.push(structuredClone(s))});assert.equal(r.state,'completed');assert.ok(states.some(s=>s.state==='submission-pending'));assert.ok(states.some(s=>s.state==='submitted'&&s.jobId==='job-test'));assert.equal(c.calls.submit,1);});
test('timeout leaves accepted job for resume without resubmission',async()=>{const c=client({waitError:new Error('timeout')});let saved;await assert.rejects(run({input,config,client:c,render:true,maxCredits:20,save:s=>saved=structuredClone(s)}),/timeout/);assert.equal(saved.jobId,'job-test');const resumed=client();assert.equal((await run({config,client:resumed,prior:saved})).state,'completed');assert.equal(resumed.calls.submit,0);});
test('uncertain submission is never retried automatically',async()=>{const c=client({submitError:new Error('connection lost')});let saved;await assert.rejects(run({input,config,client:c,render:true,maxCredits:20,save:s=>saved=structuredClone(s)}),/connection lost/);assert.equal(saved.state,'submission-pending');await assert.rejects(run({config,client:c,prior:saved}),/dashboard/);assert.equal(c.calls.submit,1);});
test('explicit capacity rejection records a delay',async()=>{const e=Object.assign(new Error('busy'),{status:429,retryAfter:60});const c=client({submitError:e});let saved;await assert.rejects(run({input,config,client:c,render:true,maxCredits:20,save:s=>saved=structuredClone(s)}),/Capacity/);assert.equal(saved.state,'rejected');assert.ok(saved.retryAt>Date.now()+50000);});
