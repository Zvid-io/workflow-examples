import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClips,execute,defaults,checkConfig} from '../src/workflow.js';
import {boundedDownload,preparePodcast} from '../src/prepare.js';
import {renderClips} from '../src/render.js';
const sample=JSON.parse(readFileSync(new URL('../data/sample.json',import.meta.url),'utf8'));
test('sample keeps original-audio offsets and word captions inside the clip',()=>{
  const [{payload,meta}]=buildClips(sample);assert.equal(meta.clipSeconds,23.76);assert.equal(payload.audios[0].audioBegin,0.14);assert.equal(payload.audios[0].audioEnd,23.9);assert.equal(payload.subtitle.captions.length,18);
  for(const cue of payload.subtitle.captions){assert.ok(cue.start>=0);assert.ok(cue.end<=meta.clipSeconds);for(const word of cue.words)assert.ok(word.start>=0&&word.end<=meta.clipSeconds);}
});
test('no model choice falls back to transcript words',()=>{const built=buildClips({...sample,selection:{}});assert.ok(built.length);assert.ok(built.every(x=>x.meta.momentSource==='fallback'));});
test('short or invalid transcript fails before upload or render',()=>{assert.throws(()=>buildClips({...sample,transcript:{words:[]}}),/recognised 0 words/);assert.throws(()=>checkConfig({...defaults,clipCount:2.5}),/integer/);});
test('RSS selection sorts dates and skips entries without audio',()=>{const items=[{title:'old',pubDate:'2020-01-01',enclosure:{url:'https://example.com/old.mp3'}},{title:'not audio',pubDate:'2027-01-01'},{title:'new',pubDate:'2026-01-01',enclosure:{url:'https://example.com/new.mp3'}}];const chosen=execute('Pick latest episode',items,{Config:defaults})[0].json;assert.equal(chosen.episodeTitle,'new');assert.equal(chosen.maxBytes,4*1024*1024);});
test('oversized/empty audio is rejected even when Range was ignored',async()=>{await assert.rejects(boundedDownload(new Response(new Uint8Array(10)),5),/exceeds/);await assert.rejects(boundedDownload(new Response(new Uint8Array()),5),/empty/);assert.equal((await boundedDownload(new Response(new Uint8Array(5)),5)).length,5);});
const projects=[{payload:{name:'a'},meta:{clipIndex:1}},{payload:{name:'b'},meta:{clipIndex:2}}];
function fakeClient(){const calls=[];return {calls,authoring:{validate:async()=>({valid:true,creditsRequired:24})},renders:{create:async({payload})=>{calls.push(payload.name);return{jobId:payload.name};}},jobs:{get:async id=>({state:'completed',result:`https://cdn.zvid.io/${id}.mp4`})}};}
test('aggregate budget prevents all submissions when total exceeds cap',async()=>{const client=fakeClient();await assert.rejects(renderClips({projects,client,maxCredits:30,save:()=>{}}),/exceeds/);assert.deepEqual(client.calls,[]);});
test('validate-only never creates a render',async()=>{const client=fakeClient();const out=await renderClips({projects,client,validateOnly:true,save:()=>{}});assert.equal(out.creditsQuoted,48);assert.deepEqual(client.calls,[]);});
test('sequential render persists pending state before each submission',async()=>{const client=fakeClient();const saved=[];const out=await renderClips({projects,client,maxCredits:50,save:s=>saved.push(structuredClone(s))});assert.equal(out.state,'completed');assert.deepEqual(client.calls,['a','b']);assert.ok(saved.some(s=>s.clips[0].state==='submission-pending'));assert.ok(saved.some(s=>s.clips[0].state==='completed'&&s.clips[1].state==='submission-pending'));});
test('resume polls an accepted job and never submits another',async()=>{const client=fakeClient();const prior={state:'rendering',creditsQuoted:24,clips:[{index:1,jobId:'a',state:'submitted'}]};const out=await renderClips({prior,client,save:()=>{}});assert.equal(out.state,'completed');assert.deepEqual(client.calls,[]);});
test('uncertain submission remains blocked on resume',async()=>{const client=fakeClient();await assert.rejects(renderClips({prior:{clips:[{state:'submission-pending'}]},client,save:()=>{}}),/uncertain/);assert.deepEqual(client.calls,[]);});
test('failed accepted render is not submitted again',async()=>{const client=fakeClient();client.jobs.get=async()=>({state:'failed',failedReason:'Source unavailable'});await assert.rejects(renderClips({prior:{clips:[{jobId:'a',state:'submitted'}]},client,save:()=>{}}),/Source unavailable/);assert.deepEqual(client.calls,[]);});
test('timed-out job keeps ID for recovery',async()=>{const client=fakeClient();client.jobs.get=async()=>({state:'active'});let t=0;const saves=[];await assert.rejects(renderClips({projects:projects.slice(0,1),client,maxCredits:30,save:s=>saves.push(structuredClone(s)),timeoutMinutes:1,now:()=>t+=61_000,sleep:async()=>{}}),/timed out/);assert.equal(saves.at(-1).clips[0].jobId,'a');assert.deepEqual(client.calls,['a']);});
test('live preparation transcribes once and uploads exactly those downloaded bytes',async()=>{
  const audio=Buffer.from('fictional mocked audio bytes');const calls=[];let transcribed,uploaded;
  const fetchImpl=async(url,options={})=>{
    calls.push(url);
    if(url==='https://example.com/feed.xml')return new Response('<rss version="2.0"><channel><title>Demo</title><item><title>Example</title><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate><enclosure url="https://example.com/audio.mp3" type="audio/mpeg" /></item></channel></rss>');
    if(url==='https://example.com/audio.mp3'){assert.equal(options.headers.Range,'bytes=0-4194303');return new Response(audio,{headers:{'content-type':'audio/mpeg'}});}
    if(url.includes('elevenlabs')){transcribed=Buffer.from(await options.body.get('file').arrayBuffer());return Response.json(sample.transcript);}
    if(url.includes('openrouter'))return Response.json(sample.selection);
    throw new Error('Unexpected request');
  };
  const saved={};
  const prepared=await preparePodcast({config:{...defaults,...sample.config,feedUrl:'https://example.com/feed.xml'},client:{uploads:{create:async blob=>{uploaded=Buffer.from(await blob.arrayBuffer());return{url:sample.audioUrl};}}},keys:{ELEVENLABS_API_KEY:'test',OPENROUTER_API_KEY:'test'},save:(name,value)=>saved[name]=value,saveBinary:()=>{},fetchImpl});
  assert.deepEqual(transcribed,audio);assert.deepEqual(uploaded,audio);assert.equal(calls.filter(x=>x.includes('elevenlabs')).length,1);assert.equal(calls.filter(x=>x.includes('openrouter')).length,1);assert.equal(saved['preparation-status.json'].state,'prepared');assert.equal(buildClips(prepared).length,1);
});
