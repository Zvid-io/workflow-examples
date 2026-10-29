import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, prepare, checkConfig } from '../src/workflow.js';
import { run } from '../src/run.js';
const config = { ...defaults, ...JSON.parse(readFileSync(new URL('../config.json', import.meta.url))) };
const input = JSON.parse(readFileSync(new URL('../data/listings.json', import.meta.url)));
const services = () => {
  const calls = { validate: 0, create: 0, wait: 0 };
  return { calls, client: {
    authoring: { validate: async () => { calls.validate++; return { valid: true, creditsRequired: 13 }; } },
    renders: { create: async () => { calls.create++; return { jobId: 'job_test' }; } },
    jobs: { wait: async id => { calls.wait++; assert.equal(id, 'job_test'); return { state: 'completed', result: 'https://cdn.zvid.io/example.mp4' }; } },
  } };
};
test('sample exactly reproduces the historically rendered project', () => {
  const built = prepare(input, config);
  assert.deepEqual(built.payload, JSON.parse(readFileSync(new URL('../assets/sample-project.json', import.meta.url))));
  assert.equal(built.meta.price, '$425,000'); assert.equal(built.meta.sqft, '1,800');
  assert.equal(built.meta.totalSeconds, 12.5); assert.equal(built.payload.audios, undefined);
  assert.match(JSON.stringify(built.payload), /FICTIONAL LISTING/);
});
test('queue skips done rows and stops when empty', () => {
  const built = prepare([{ ...input[0], Status: 'done' }, input[0]], config);
  assert.equal(built.meta.rowNumber, 3);
  assert.equal(prepare([{ ...input[0], Status: 'done' }], config).selected.found, false);
});
test('wrong-case Status header is rejected rather than re-rendered', () => {
  const row = { ...input[0], status: 'done' }; delete row.Status;
  assert.throws(() => prepare([row], config), /Rename that header to exactly/);
});
test('missing address or second image fails before API calls', () => {
  assert.throws(() => prepare([{ ...input[0], Address: '' }], config), /missing Address/);
  assert.throws(() => prepare([{ ...input[0], Photo2: '' }], config), /at least 2/);
  assert.throws(() => prepare([{ ...input[0], Photo1: 'http://example.com/photo.jpg' }], config), /HTTPS/);
});
test('five-photo cap changes duration and no extra photo is included', () => {
  const row = { ...input[0], Photo3: input[0].Photo1, Photo4: input[0].Photo2, Photo5: input[0].Photo1, Photo6: 'https://example.com/ignored.jpg' };
  const built = prepare([row], config);
  assert.equal(built.meta.photoCount, 5); assert.equal(built.meta.totalSeconds, 22.4);
  assert.doesNotMatch(JSON.stringify(built.payload), /ignored.jpg/);
});
test('formatted price remains verbatim and HTML in listing values is escaped', () => {
  const b = prepare([{ ...input[0], Price: 'Offers over $425k', Address: '<b>Demo</b>' }], config);
  assert.equal(b.meta.price, 'Offers over $425k'); assert.match(JSON.stringify(b.payload), /&lt;b&gt;/);
});
test('configuration rejects unsupported source and music', () => {
  assert.throws(() => checkConfig({ ...config, source: 'airtable' }), /local JSON/);
  assert.throws(() => checkConfig({ ...config, musicUrl: 'https://example.com/music.mp3' }), /silent/);
});
test('offline and default validation never submit a render', async () => {
  const { calls, client } = services();
  assert.equal((await run({ input, config, client, offline: true })).state, 'offline');
  assert.deepEqual(calls, { validate: 0, create: 0, wait: 0 });
  assert.equal((await run({ input, config, client })).state, 'validated');
  assert.equal(calls.create, 0);
});
test('budget is required and blocks excess quote', async () => {
  const { calls, client } = services();
  await assert.rejects(run({ input, config, client, render: true }), /max-credits/);
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 12 }), /exceeds/);
  assert.equal(calls.create, 0);
});
test('saved accepted job resumes without a second submission', async () => {
  const { client } = services(); const states = [];
  client.jobs.wait = async () => { throw new Error('timeout'); };
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 13, save: s => states.push(structuredClone(s)) }), /timeout/);
  assert.deepEqual(states.slice(-2).map(s => s.state), ['submission-pending', 'submitted']);
  const fresh = services();
  assert.equal((await run({ config, client: fresh.client, prior: states.at(-1) })).state, 'completed');
  assert.equal(fresh.calls.create, 0); assert.equal(fresh.calls.validate, 0);
});
test('uncertain submissions preserve pending state and failed jobs have no invented output', async () => {
  const { client } = services(); let saved;
  client.renders.create = async () => { throw new Error('connection lost'); };
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 13, save: s => { saved = structuredClone(s); } }), /connection lost/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ config, client, prior: saved }), /No saved job ID/);
  client.jobs.wait = async () => ({ state: 'failed' });
  await assert.rejects(run({ config, client, prior: { jobId: 'job_test', state: 'submitted' } }), /no completed HTTPS/);
});
test('capacity rejection preserves retry delay and cannot poll an unaccepted job', async () => {
  const { client, calls } = services(); let saved;
  client.renders.create = async () => { throw Object.assign(new Error('capacity'), { status: 429, retryAfter: 120 }); };
  const before = Date.now();
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 13, save: s => { saved = structuredClone(s); } }), /Capacity rejected/);
  assert.ok(saved.retryAt >= before + 120000);
  await assert.rejects(run({ config, client, prior: saved }), /rerun the original input command/);
  assert.equal(calls.wait, 0);
});
test('resume uses accepted job even after later input-design config changes', async () => {
  const { client, calls } = services();
  const result = await run({ config: { ...config, source: 'airtable', musicUrl: 'https://example.com/new-music.mp3' }, client, prior: { jobId: 'job_test', state: 'submitted' } });
  assert.equal(result.state, 'completed');
  assert.deepEqual(calls, { validate: 0, create: 0, wait: 1 });
  await assert.rejects(run({ config: { ...config, timeoutMinutes: 0 }, client, prior: { jobId: 'job_test', state: 'submitted' } }), /timeoutMinutes/);
});
test('missing job ID preserves uncertain submission state', async () => {
  const { client, calls } = services(); let saved;
  client.renders.create = async () => ({});
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 13, save: s => { saved = structuredClone(s); } }), /no job ID/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ config, client, prior: saved }), /No saved job ID/);
  assert.equal(calls.wait, 0);
});
