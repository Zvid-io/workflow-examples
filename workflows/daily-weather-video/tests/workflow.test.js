import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, defaults, fetchWeather } from '../src/workflow.js';
import { run } from '../src/run.js';
const input=JSON.parse(readFileSync(new URL('../data/sample.json',import.meta.url)));
const config={...defaults,...JSON.parse(readFileSync(new URL('../config.json',import.meta.url)))};
const now=new Date(input.generatedAt);
test('priority planning respects confirmed reservations and exports only tentative proposals',()=>{
  const result=build(config,input,now);
  assert.deepEqual(result.decisions.map(d=>d.Decision),['keep','reschedule','defer']);
  assert.equal(result.decisions[1].Start,'2026-10-29T11:00:00.000Z');
  const ics=Buffer.from(result.calendar.data,'base64').toString();
  assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
  assert.equal((ics.match(/STATUS:TENTATIVE/g)||[]).length,2);
  assert(!/ATTENDEE:|METHOD:REQUEST/.test(ics));
  assert.equal(result.payload.scenes.reduce((a,s)=>a+s.duration,0),23);
});
test('unapproved inputs skip; bad dates, missing data and ambiguous timezone fail',()=>{
  const unapproved=structuredClone(input);unapproved.bookings.forEach(b=>b.Approval='');
  assert.equal(build(config,unapproved,now).ready,false);
  assert.throws(()=>build({...config,planningDate:'2026-10-28'},input,now),/past/);
  const missing=structuredClone(input);missing.forecast.hourly.temperature_2m[9]=null;
  assert.throws(()=>build(config,missing,now),/temperature must/);
  assert.throws(()=>build({...config,timezone:'UTC'},input,now),/timezone must match/);
});
test('dry run validates and writes review artifacts without creating a render',async()=>{
  let creations=0;
  const result=await run({config,input,now,client:{authoring:{validate:async()=>({valid:true,creditsRequired:23})},renders:{create:async()=>{creations++;}}}});
  assert.equal(result.state,'validated');assert.equal(creations,0);
});
test('credit ceiling stops before paid submission',async()=>{
  let creations=0;
  await assert.rejects(()=>run({config,input,now,dryRun:false,maxCredits:22,client:{authoring:{validate:async()=>({valid:true,creditsRequired:23})},renders:{create:async()=>{creations++;}}}}),/ceiling/);
  assert.equal(creations,0);
});
test('uncertain submission remains reserved and resume never resubmits',async()=>{
  const states=[];
  await assert.rejects(()=>run({config,input,now,dryRun:false,maxCredits:35,save:s=>states.push(structuredClone(s)),client:{authoring:{validate:async()=>({valid:true,creditsRequired:23})},renders:{create:async()=>{throw Error('network timeout');}}}}),/network timeout/);
  assert.equal(states.at(-1).state,'submission-pending');
  await assert.rejects(()=>run({config,prior:states.at(-1),client:{}}),/No saved job ID/);
  let waited;
  const done=await run({config,prior:{state:'submitted',jobId:'fixture-job'},client:{jobs:{wait:async id=>{waited=id;return {state:'completed',result:'https://cdn.zvid.io/fixture.mp4'};}}}});
  assert.equal(waited,'fixture-job');assert.equal(done.state,'completed');
});
test('live source path resolves an unambiguous configured location and fetches the exact date',async()=>{
  const seen=[];
  const output=await fetchWeather(config,input.bookings,now,async url=>{
    seen.push(String(url));
    return {ok:true,json:async()=>String(url).includes('geocoding')?{results:[input.place]}:input.forecast};
  });
  assert.equal(output.place.timezone,'Europe/Lisbon');
  assert(seen[1].includes('start_date=2026-10-29'));assert(seen[1].includes('timeformat=unixtime'));
});
