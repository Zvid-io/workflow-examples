import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, prepare } from '../src/workflow.js';
import { run } from '../src/run.js';
const config = { ...defaults, ...JSON.parse(readFileSync(new URL('../config.json', import.meta.url))) };
const input = JSON.parse(readFileSync(new URL('../data/reviews.json', import.meta.url)));
const services = () => {
  const calls = { validate: 0, create: 0, wait: 0 };
  return { calls, client: {
    authoring: { validate: async () => { calls.validate++; return { valid: true, creditsRequired: 16 }; } },
    renders: { create: async () => { calls.create++; return { jobId: 'job_test' }; } },
    jobs: { wait: async id => { calls.wait++; assert.equal(id, 'job_test'); return { state: 'completed', result: 'https://cdn.zvid.io/example.mp4' }; } },
  } };
};
test('sample keeps actual quote, five stars, illustrative label and no audio', () => {
  const b = prepare(input, config);
  assert.equal(b.meta.starsFilled, 5); assert.equal(b.meta.quote, input[0].ReviewText);
  assert.equal(b.payload.scenes.length, 3); assert.equal(b.payload.audios, undefined);
  assert.match(JSON.stringify(b.payload), /Illustrative review/);
});
test('selection skips processed and below-threshold rows', () => {
  const b = prepare([{ ...input[0], Status: 'done' }, { ...input[0], Rating: 4 }, input[0]], config);
  assert.equal(b.meta.rowNumber, 4);
  assert.equal(prepare([{ ...input[0], Rating: 4 }], config).selected.found, false);
});
test('four stars remain four when accepted', () => assert.equal(prepare([{ ...input[0], Rating: 4 }], { ...config, minRating: 4 }).meta.starsFilled, 4));
test('invalid ratings and incomplete eligible rows fail before API calls', () => {
  assert.throws(() => prepare([{ ...input[0], Rating: 6 }], config), /between 1 and 5/);
  assert.throws(() => prepare([{ ...input[0], Reviewer: '' }], config), /missing Reviewer/);
});
test('long quotes shorten at a word boundary without inventing text', () => {
  const original = 'The tote is useful and sturdy. '.repeat(30);
  const b = prepare([{ ...input[0], ReviewText: original }], { ...config, maxQuoteChars: 100 });
  assert.ok(b.meta.quote.length <= 100); assert.ok(original.startsWith(b.meta.quote.replace(/…$/, '')));
});
test('offline calls no API and saves project', async () => {
  const { calls, client } = services(); let project;
  const result = await run({ input, config, client, offline: true, saveProject: p => { project = p; } });
  assert.equal(result.state, 'offline'); assert.ok(project); assert.deepEqual(calls, { validate: 0, create: 0, wait: 0 });
});
test('default validates but never renders', async () => {
  const { calls, client } = services(); const state = await run({ input, config, client });
  assert.equal(state.state, 'validated'); assert.equal(calls.create, 0);
});
test('budget is required and enforced', async () => {
  const { calls, client } = services();
  await assert.rejects(run({ input, config, client, render: true }), /max-credits/);
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 15 }), /exceeds/);
  assert.equal(calls.create, 0);
});
test('accepted job is saved before polling; resume never resubmits', async () => {
  const { calls, client } = services(); const states = [];
  client.jobs.wait = async () => { throw new Error('timeout'); };
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 16, save: s => states.push(structuredClone(s)) }), /timeout/);
  assert.deepEqual(states.slice(-2).map(s => s.state), ['submission-pending', 'submitted']);
  const prior = states.at(-1); assert.equal(prior.jobId, 'job_test');
  const fresh = services(); const complete = await run({ config, client: fresh.client, prior });
  assert.equal(complete.state, 'completed'); assert.equal(fresh.calls.create, 0); assert.equal(fresh.calls.validate, 0);
  assert.equal(calls.create, 1);
});
test('uncertain submission keeps a durable pending state', async () => {
  const { client } = services(); let saved;
  client.renders.create = async () => { throw new Error('connection lost'); };
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 16, save: s => { saved = structuredClone(s); } }), /connection lost/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ config, client, prior: saved }), /No saved job ID/);
});
test('failed completed-state check rejects without inventing a video', async () => {
  const { client } = services(); client.jobs.wait = async () => ({ state: 'failed' });
  await assert.rejects(run({ config, client, prior: { jobId: 'job_test', state: 'submitted' } }), /no completed HTTPS/);
});

test('explicit 429 rejection records the longer provider delay and cannot poll an unaccepted job', async () => {
  const { client, calls } = services(); let saved;
  client.renders.create = async () => { throw Object.assign(new Error('capacity'), { status: 429, retryAfter: 120 }); };
  const before = Date.now();
  await assert.rejects(run({ input, config, client, render: true, maxCredits: 16, save: s => { saved = structuredClone(s); } }), /Capacity rejected/);
  assert.equal(saved.state, 'rejected'); assert.ok(saved.retryAt >= before + 120000); assert.equal(saved.jobId, undefined);
  await assert.rejects(run({ config, client, prior: saved }), /rerun the original input command/);
  assert.equal(calls.wait, 0);
});
