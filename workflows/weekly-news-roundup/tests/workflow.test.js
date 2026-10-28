import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, execute, buildEdition } from '../src/workflow.js';
import { renderEdition } from '../src/render.js';
const edition=JSON.parse(readFileSync(new URL('../data/edition.json',import.meta.url),'utf8'));
test('build the retained five-story edition, captions and timed scenes',()=>{
  const built=buildEdition(defaults,edition);
  assert.equal(built.meta.storyCount,5);assert.equal(built.meta.sceneCount,7);
  assert.equal(built.meta.totalDuration,51.1);assert.equal(built.meta.cutsAlignedToSpeech,true);
  assert.equal(built.payload.subtitle.captions.length,44);
  assert.deepEqual(built.payload,JSON.parse(readFileSync(new URL('../assets/sample-project.json',import.meta.url),'utf8')));
  for(const scene of built.payload.scenes) assert.ok(Math.abs(scene.duration*10-Math.round(scene.duration*10))<1e-6);
});
test('empty feeds stop; duplicate titles and old items are excluded',()=>{
  assert.throws(()=>execute('Pool headlines',[],{Config:defaults}),/No usable stories/);
  const items=[{title:'A real headline',link:'https://example.org/one',isoDate:new Date().toISOString()},
    {title:'A real headline',link:'https://example.org/two'},
    {title:'Old headline',link:'https://example.org/old',isoDate:'2000-01-01'},
    {title:'Undated headline',link:'https://example.org/undated'}];
  const pool=execute('Pool headlines',items,{Config:defaults})[0].json;
  assert.equal(pool.pooled,2);assert.equal(pool.pool[0].source,'example.org');
});
test('invalid model source indices never invent a source label',()=>{
  const content={intro:edition.rundown.intro,outro:edition.rundown.outro,stories:edition.rundown.stories.map(s=>({...s,index:999}))};
  const parsed=execute('Parse rundown',[{choices:[{message:{content:JSON.stringify(content)}}]}],{Config:defaults,'Pool headlines':{pool:[{n:1,source:'example.org',link:'https://example.org'}],nowIso:'2026-09-20T00:00:00Z',pooled:1}})[0].json;
  assert.ok(parsed.stories.every(s=>s.source===''&&s.link===''));
});
test('missing stock becomes designed fallback scenes',()=>{
  const built=buildEdition(defaults,{...edition,sceneMedia:edition.sceneMedia.map(()=>null),music:null});
  assert.equal(built.meta.missingClips,5);assert.equal(built.payload.audios.length,1);
});
test('validation failure and quote ceiling never submit a render',async()=>{
  let submitted=0;
  const client={authoring:{validate:async()=>({valid:true,creditsRequired:52})},renders:{create:async()=>{submitted++;}}};
  await assert.rejects(renderEdition({payload:{},client,maxCredits:20,save:()=>{}}),/exceeds limit/);
  assert.equal(submitted,0);
  client.authoring.validate=async()=>({valid:false,errors:[{field:'scenes',message:'bad'}]});
  await assert.rejects(renderEdition({payload:{},client,maxCredits:100,save:()=>{}}),/rejected/);assert.equal(submitted,0);
});
test('validate-only makes no submission; resume polls accepted job exactly once',async()=>{
  let submitted=0,polls=0;
  const client={authoring:{validate:async()=>({valid:true,creditsRequired:52})},renders:{create:async()=>{submitted++;return {jobId:'example-job'}}},jobs:{get:async()=>{polls++;return {state:'completed',result:{url:'https://cdn.zvid.io/example.mp4'}}}}};
  assert.equal((await renderEdition({payload:{},client,validateOnly:true,save:()=>{}})).state,'validated');assert.equal(submitted,0);
  const state=await renderEdition({client,prior:{jobId:'existing',state:'submitted'},save:()=>{}});assert.equal(state.state,'completed');assert.equal(polls,1);assert.equal(submitted,0);
});
test('uncertain acceptance leaves a pending receipt and timeout never resubmits',async()=>{
  const saved=[];let submissions=0;
  const client={authoring:{validate:async()=>({valid:true,creditsRequired:52})},renders:{create:async()=>{submissions++;throw Error('connection closed')}},jobs:{get:async()=>({state:'active'})}};
  await assert.rejects(renderEdition({payload:{},client,maxCredits:60,save:s=>saved.push(structuredClone(s))}),/connection closed/);
  assert.equal(saved.at(-1).state,'submission-pending');assert.equal(submissions,1);
  let time=0;await assert.rejects(renderEdition({client,prior:{jobId:'existing'},save:()=>{},now:()=>time+=1000,timeoutMinutes:.001,sleep:async()=>{}}),/timed out/);assert.equal(submissions,1);
});
test('failed or malformed completed results are never reported as success',async()=>{
  for(const job of [{state:'failed',failedReason:'media unavailable'},{state:'completed',result:null}]){
    await assert.rejects(renderEdition({client:{jobs:{get:async()=>job}},prior:{jobId:'existing'},save:()=>{}}),/unavailable|HTTPS/);
  }
});
