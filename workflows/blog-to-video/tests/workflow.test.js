import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRunner, defaults, checkBudget, renderPrepared, prepareLive } from '../src/workflow.js';

test('explicit dry-run cannot enter the saved-project paid render path', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url)), '--render-prepared', '--dry-run', '--max-credits', '60'], { encoding: 'utf8', cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, ZVID_API_KEY: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--dry-run cannot be combined/);
});

test('newest entry selection and completed GUID deduplication', () => {
  const feed = [{ json: { title: 'Older', guid: 'old', isoDate: '2026-01-01' } }, { json: { title: 'Newer', guid: 'new', isoDate: '2026-02-01' } }];
  assert.equal(createRunner().run('Pick newest post', feed)[0].json.guid, 'new');
  assert.equal(createRunner(defaults, { lastGuid: 'new' }).run('Pick newest post', feed)[0].json.found, false);
});
test('empty feed provides actionable failure', () => {
  assert.throws(() => createRunner().run('Pick newest post', [{ json: {} }]), /feed returned no readable posts/);
});
test('page-fetch failure falls back to feed text', () => {
  const runner = createRunner(); runner.put('Pick newest post', { title: 'Article', domain: 'example.com', feedText: 'A short supplied article.' });
  const result = runner.run('Prepare prompt', { error: 'offline' })[0].json;
  assert.equal(result.articleSource, 'feed'); assert.match(result.promptText, /A short supplied article/);
});
test('missing footage uses designed fallback and never an empty clip', () => {
  const r = createRunner(); r.put('Parse script', { points: [{}, {}, {}] });
  assert.deepEqual(r.run('Pick scene clip', [{ json: { items: [] } }])[0].json, { sceneMedia: [null, null, null], missing: 3 });
});
test('voice without timestamp alignment fails before upload/render', () => {
  assert.throws(() => createRunner().run('Voice + timings', { audio_base64: 'x' }), /no alignment/);
});
test('quote limits reject invalid or excessive spend', () => {
  assert.throws(() => checkBudget(37, 30), /exceeds/); assert.throws(() => checkBudget(NaN, 60), /quote/); assert.throws(() => checkBudget(37, NaN), /max-credits/); checkBudget(37, 40);
});
test('rejected validation or budget never submits render', async () => {
  let submitted = 0;
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 37 }) }, renders: { create: async () => { submitted++; return { jobId: 'test' }; } } };
  await assert.rejects(renderPrepared({ prepared: { payload: {} }, client, maxCredits: 30, state: {}, save: () => {} }), /exceeds/);
  assert.equal(submitted, 0);
  client.authoring.validate = async () => ({ valid: false, errors: [{ field: 'scenes', message: 'required' }] });
  await assert.rejects(renderPrepared({ prepared: { payload: {} }, client, maxCredits: 60, state: {}, save: () => {} }), /rejected/);
  assert.equal(submitted, 0);
});
test('submission intent is saved before request and job ID immediately afterward', async () => {
  const saved = [];
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 37 }) }, renders: { create: async () => { assert.equal(saved.at(-1).status, 'submitting'); return { jobId: 'test-job' }; } } };
  const state = {};
  await renderPrepared({ prepared: { payload: {} }, client, maxCredits: 40, state, save: s => saved.push({ ...s }) });
  assert.equal(saved.at(-1).jobId, 'test-job'); assert.equal(saved.at(-1).status, 'submitted');
});
test('the checked-in sample rebuilds exactly from its script, timings and audio', () => {
  const s = JSON.parse(readFileSync(new URL('../data/sample-prepared.json', import.meta.url), 'utf8'));
  const words = JSON.parse(readFileSync(new URL('../data/sample-timings.json', import.meta.url), 'utf8'));
  const r = createRunner(s.config);
  r.put('Parse script',s.script); r.put('Pick scene clip',{sceneMedia:s.script.points.map(()=>null)});
  r.put('Pick music',{music:null}); r.put('Upload voiceover',{upload:{url:s.payload.audios[0].src}});
  r.put('Voice + timings',{words,duration:36,wordCount:words.length});
  assert.deepEqual(r.run('Build project JSON')[0].json.payload,s.payload);
});
test('live preparation contract builds with one speech call and missing-stock fallback', async () => {
  const s=JSON.parse(readFileSync(new URL('../data/sample-prepared.json',import.meta.url),'utf8'));
  let speechCalls=0,uploads=0;
  const raw={title:s.script.title,hook:s.script.hook,points:s.script.points,cta:s.script.cta,musicTag:'calm'};
  const narration=[raw.hook,...raw.points.map(p=>p.text),raw.cta].join(' ');
  const chars=[...narration],starts=chars.map((_,i)=>i*0.05),ends=starts.map(t=>t+0.05);
  const request=async (url,init={})=>{
    if(url.includes('openrouter.ai'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}));
    if(url.includes('elevenlabs.io')){speechCalls++;return new Response(JSON.stringify({audio_base64:'eA==',alignment:{characters:chars,character_start_times_seconds:starts,character_end_times_seconds:ends}}));}
    return new Response('<article>'+narration+'</article>');
  };
  const client={request:async()=>({items:[]}),uploads:{create:async()=>{uploads++;return {url:'https://cdn.zvid.io/test/example.mp3'};}}};
  const result=await prepareLive({config:defaults,client,openRouterKey:'test',elevenLabsKey:'test',request,parseFeed:async()=>[{title:'A sample post',guid:'sample',link:'https://example.com/post',content:narration}]});
  assert.equal(speechCalls,1);assert.equal(uploads,1);assert.equal(result.meta.videoClips,0);assert.equal(result.payload.scenes.length,7);
});
