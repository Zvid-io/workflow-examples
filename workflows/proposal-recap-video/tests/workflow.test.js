import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProject } from '../src/build-project.js';
import { normalizeDeal } from '../src/normalize.js';
import { renderEdition } from '../src/render.js';
const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const config = read('../config.json');
const sample = read('../data/deal.json');
const build = (deal = sample, cfg = config, probe = {}) => buildProject(cfg, normalizeDeal(deal, cfg), probe);

test('same fictional deal reproduces the historically rendered project byte for byte as JSON', () => assert.deepEqual(build().payload, read('../assets/sample-project.json')));
test('amounts are formatted without currency conversion and decimals remain', () => assert.equal(build({ ...sample, amount: '148500.00', currency: 'EUR' }).meta.amountText, '€148,500.00'));
test('empty or incomplete inputs cannot silently become a sample', () => {
  assert.throws(() => normalizeDeal({}, config), /nonempty/);
  assert.throws(() => build({ company: 'Example' }));
  assert.throws(() => build({ ...sample, amount: 'TBD' }), /readable Amount/);
});
test('scope omission produces three scenes and a shorter video', () => { const b = build({ ...sample, scope: [] }); assert.equal(b.meta.sceneCount, 3); assert.equal(b.meta.totalSeconds, 17.2); });
test('HTML-like names stay escaped and long names are reported', () => { const b = build({ ...sample, company: '<script>alert(1)</script>' + ' long company'.repeat(20) }); assert.ok(b.meta.truncated.some(x => x.field === 'company')); assert.ok(!JSON.stringify(b.payload).includes('<script>')); });
test('unavailable and oversized music is omitted', () => { const cfg = { ...config, musicUrl: 'https://example.com/track.mp3' }; assert.ok(!build(sample,cfg,{statusCode:404}).payload.audios); assert.ok(!build(sample,cfg,{statusCode:200,headers:{'content-length':9000000}}).payload.audios); });

function harness(quote = 25, jobs = [{ state: 'completed', result: { url: 'https://cdn.zvid.io/example.mp4' } }]) {
  const saved = []; let submissions = 0;
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: quote }) }, renders: { create: async () => { submissions++; return {jobId:'job-test'}; } }, jobs: { get: async () => jobs.shift() || {state:'active'} } };
  return { client, save: value => saved.push(structuredClone(value)), saved, count: () => submissions };
}
test('validation and an over-budget quote never submit a render', async () => {
  const a = harness(); await renderEdition({ ...a, payload: {}, validateOnly: true }); assert.equal(a.count(), 0);
  await assert.rejects(() => renderEdition({ ...a, payload: {}, maxCredits: 24 }), /exceeds limit/); assert.equal(a.count(), 0);
});
test('accepted job ID is saved before waiting and resume never resubmits', async () => {
  const a = harness(); const result = await renderEdition({ ...a, payload: {}, maxCredits: 25 }); assert.equal(result.state, 'completed');
  assert.ok(a.saved.some(x=>x.state==='submitted'&&x.jobId==='job-test')); assert.equal(a.count(), 1);
  const b = harness(); await renderEdition({ ...b, prior: {jobId:'job-test'} }); assert.equal(b.count(), 0);
});
test('job failure and timeout retain the ID without a second submission', async () => {
  const a = harness(25,[{state:'failed',failedReason:'test failure'}]); await assert.rejects(()=>renderEdition({...a,payload:{},maxCredits:25}),/test failure/); assert.equal(a.count(),1); assert.equal(a.saved.at(-1).jobId,'job-test');
  const b = harness(25,[]); let clock=0; await assert.rejects(()=>renderEdition({...b,prior:{jobId:'job-test'},timeoutMinutes:1,now:()=>clock+=60000,sleep:async()=>{}}),/timed out/); assert.equal(b.count(),0);
});
