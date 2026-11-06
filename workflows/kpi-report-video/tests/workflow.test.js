import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../src/workflow.js';
import { run } from '../src/run.js';
const now = new Date('2026-10-29T09:00:00Z');
const config = { metricsSource: 'sample', narrate: false, sendSlack: false, musicUrl: '', pollSeconds: 10, timeoutMinutes: 20, maxCreditsPerVideo: 65 };
const sample = () => build(config, null, now);
test('sample is labeled, exact deltas are calculated and real histories become charts', () => {
  const result = sample();
  assert.equal(result.plan.usingDemoData, true);
  assert.equal(result.plan.exceptionCount, 2);
  assert.equal(result.plan.metrics[0].id, 'response');
  assert.equal(result.plan.metrics.find(m => m.id === 'revenue').delta, -20);
  assert.equal(result.plan.period, '2026-10-22 to 2026-10-28');
  assert.match(result.reviewCsv, /SAMPLE DATA/);
  assert.equal(result.payload.scenes.length, 5);
  assert.equal(JSON.stringify(result.payload).includes('http'), true); // SVG namespaces, no remote media.
  assert.equal(result.payload.audios, undefined);
});
test('bad facts stop; zero baseline stays N/A; source mode cannot hide sample data', () => {
  const input = sample().response.body;
  assert.throws(() => build({ ...config, metricsSource: 'live' }, input, now), /sample-data marker/);
  const live = { ...input, sampleData: false };
  live.metrics[0].previous = 0;
  const result = build({ ...config, metricsSource: 'live' }, live, now);
  assert.equal(result.plan.metrics.find(m => m.id === 'revenue').delta, null);
  assert.match(result.reviewCsv, /N\/A/);
  assert.throws(() => build({ ...config, metricsSource: 'live' }, { ...live, generatedAt: '2020-01-01T00:00:00Z' }, now), /stale/);
  assert.throws(() => build({ ...config, metricsSource: 'live' }, { ...live, periodEnd: '2026-10-29' }, now), /completed reporting period/);
  assert.throws(() => build({ ...config, sendSlack: true }, null, now), /does not send Slack/);
});
test('no exceptions can skip a video; CSV escapes spreadsheet formulas', () => {
  const input = sample().response.body;
  input.sampleData = false;
  for (const m of input.metrics) { m.value = m.previous; m.target = m.value; delete m.history; }
  const result = build({ ...config, metricsSource: 'live', onlyExceptions: true }, input, now);
  assert.equal(result.payload, null);
  input.metrics[0].label = '=SUM(1)';
  assert.match(build({ ...config, metricsSource: 'live' }, input, now).reviewCsv, /'=SUM/);
});
test('quote ceiling blocks submission and accepted ID is persisted before wait', async () => {
  const states = []; let creates = 0;
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 24 }) }, renders: { create: async () => { creates++; return { jobId: 'job_test' }; } }, jobs: { wait: async () => { assert.equal(states.at(-1).jobId, 'job_test'); return { state: 'completed', result: { url: 'https://cdn.example/video.mp4' } }; } } };
  await assert.rejects(run({ config, now, client, render: true, maxCredits: 23 }), /exceeds/);
  assert.equal(creates, 0);
  await assert.rejects(run({ config: { ...config, maxCreditsPerVideo: 20 }, now, client, render: true, maxCredits: 30 }), /exceeds/);
  assert.equal(creates, 0);
  await assert.rejects(run({ config: { ...config, maxCreditsPerVideo: 0 }, now, client, render: true, maxCredits: 30 }), /positive config/);
  assert.equal(creates, 0);
  const result = await run({ config, now, client, render: true, maxCredits: 24, save: s => states.push(structuredClone(s)) });
  assert.equal(result.state, 'completed'); assert.equal(creates, 1);
  await run({ config, client, prior: result }); assert.equal(creates, 1);
});
test('uncertain submission remains recoverable without automatic resubmission', async () => {
  let saved;
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 24 }) }, renders: { create: async () => { throw new Error('network interrupted'); } } };
  await assert.rejects(run({ config, now, client, render: true, maxCredits: 24, save: s => { saved = structuredClone(s); } }), /network/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ config, client, prior: saved }), /No saved job ID/);
});
