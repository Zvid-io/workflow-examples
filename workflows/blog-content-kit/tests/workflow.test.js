import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunner, checkBudget, runKit, prepareLive } from '../src/workflow.js';
import { checkMediaBytes } from '../src/download.js';
const sample = JSON.parse(readFileSync(new URL('../data/sample-prepared.json', import.meta.url)));
const feed = JSON.parse(readFileSync(new URL('../data/sample-post.json', import.meta.url)));

test('current builder reproduces all retained sample projects exactly', () => {
  const r = createRunner(sample.config);
  r.run('Pick newest post', [{ json: feed }]);
  r.put('Music guard', { kit: sample.kit, music: null, musicNote: sample.pieces[0].meta.musicNote });
  const built = r.run('Build project JSON').map(x => x.json);
  assert.deepEqual(built, sample.pieces);
  assert.equal(built[2].payload.quality, undefined);
});

test('latest completed feed entry is skipped and an empty feed is rejected', () => {
  assert.equal(createRunner(sample.config, { lastGuid: sample.post.guid }).run('Pick newest post', [{ json: feed }])[0].json.found, false);
  assert.throws(() => createRunner(sample.config).run('Pick newest post', []), /no readable posts/);
});

test('model output requires usable points and headline fields', () => {
  const r = createRunner(sample.config);
  r.put('Pick newest post', sample.post); r.put('Prepare kit prompt', { articleSource: 'feed' });
  assert.throws(() => r.run('Parse kit copy', { choices: [{ message: { content: JSON.stringify({ ...sample.kit, liPoints: ['one'] }) } }] }), /need 2-3/);
  assert.throws(() => r.run('Parse kit copy', { choices: [{ message: { content: JSON.stringify({ ...sample.kit, ogTitle: '' }) } }] }), /ogTitle/);
});

test('all outputs disabled is rejected; untrusted copy is escaped', () => {
  const r = createRunner({ ...sample.config, makeLinkedInVideo: false, makeXTeaser: false, makeOgImage: false });
  r.put('Pick newest post', sample.post); r.put('Music guard', { kit: sample.kit, music: null });
  assert.throws(() => r.run('Build project JSON'), /Every output is switched off/);
  const escaped = createRunner(sample.config);
  escaped.put('Pick newest post', sample.post); escaped.put('Music guard', { kit: { ...sample.kit, liHeadline: '<img src=x onerror=bad>' }, music: null });
  assert.match(JSON.stringify(escaped.run('Build project JSON')), /&lt;img/);
});

test('budget refuses missing or excessive total before submission', () => {
  assert.throws(() => checkBudget(29, undefined), /max-credits/);
  assert.throws(() => checkBudget(29, 28), /exceeds/);
  assert.throws(() => checkBudget(NaN, 29), /positive/);
  checkBudget(29, 29);
});

function mockClient({ failDownload = false } = {}) {
  const calls = [], jobs = new Map();
  const submit = type => async () => { const jobId = `job-${calls.length}`; calls.push(type); jobs.set(jobId, { state: 'completed', result: 'https://example.com/output' }); return { jobId }; };
  return { calls, client: { authoring: { validate: async ({ payload }) => ({ valid: true, creditsRequired: payload.type === 'image' ? 1 : payload.resolution === 'squared' ? 20 : 8 }) }, renders: { create: submit('video'), createImage: submit('image') }, jobs: { wait: async () => ({ state: 'completed' }) } } };
}

test('serial kit saves every ID; resume keeps completed jobs and submits only missing pieces', async () => {
  const { calls, client } = mockClient(); const state = {};
  let downloads = 0;
  await assert.rejects(runKit({ prepared: sample, client, state, save: () => {}, maxCredits: 29, download: async () => { downloads++; throw new Error('download interrupted'); } }), /interrupted/);
  assert.equal(calls.length, 1); assert.ok(state.pieces[0].jobId);
  await runKit({ prepared: sample, client, state, save: () => {}, maxCredits: 29, resume: true, download: async () => { downloads++; } });
  assert.deepEqual(calls, ['video', 'video', 'image']);
  assert.equal(state.status, 'completed'); assert.equal(downloads, 4);
});

test('unknown submission outcome and insufficient cap never create jobs', async () => {
  const { calls, client } = mockClient();
  await assert.rejects(runKit({ prepared: sample, client, state: {}, save: () => {}, maxCredits: 1, download: async () => {} }), /exceeds/);
  await assert.rejects(runKit({ prepared: sample, client, state: { pieces: sample.pieces.map((p, i) => ({ kind: p.meta.kind, status: i ? 'prepared' : 'submitting' })) }, save: () => {}, maxCredits: 29, resume: true, download: async () => {} }), /unknown outcome/);
  assert.equal(calls.length, 0);
});

test('live preparation makes one copy request and uses the feed when page retrieval fails', async () => {
  const requests = [];
  const prepared = await prepareLive({ config: sample.config, openRouterKey: 'test-key', parseFeed: async () => [feed], request: async (url, init) => {
    requests.push({ url, method: init.method });
    if (!init.method) throw new Error('page blocked');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(sample.kit) } }] }) };
  } });
  assert.equal(requests.filter(x => x.method === 'POST').length, 1);
  assert.equal(prepared.pieces.length, 3); assert.equal(prepared.articleSource, 'feed');
});

test('completed jobs remain recoverable when source projects can no longer validate', async () => {
  const { client } = mockClient();
  client.authoring.validate = async () => { throw new Error('expired source'); };
  const state = { pieces: sample.pieces.map((p, i) => ({ kind: p.meta.kind, jobId: `existing-${i}`, status: 'completed', creditsQuoted: [20, 8, 1][i] })) };
  let downloads = 0;
  await runKit({ prepared: sample, client, state, save: () => {}, maxCredits: 29, resume: true, download: async () => { downloads++; } });
  assert.equal(downloads, 3);
});

test('HTML success responses and truncated media are refused before final files are written', () => {
  assert.throws(() => checkMediaBytes(Buffer.from('<html>Bad gateway</html>'), 'mp4'), /not mp4/);
  const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]);
  assert.throws(() => checkMediaBytes(mp4, 'mp4', 100), /length/);
  checkMediaBytes(mp4, 'mp4', mp4.length);
});

test('explicit capacity rejection is recorded as rejected rather than unknown', async () => {
  const { client } = mockClient(), state = {};
  client.renders.create = async () => { throw Object.assign(new Error('capacity'), { status: 429, retryAfter: 30 }); };
  await assert.rejects(runKit({ prepared: sample, client, state, save: () => {}, maxCredits: 29, download: async () => {} }), /capacity/);
  assert.equal(state.pieces[0].status, 'rejected');
  assert.equal(state.pieces[0].retryAfter, 30);
});
