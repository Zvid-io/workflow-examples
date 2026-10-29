import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from '../src/workflow.js';
import { run } from '../src/run.js';
const json = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const rows = json('../data/cart.json'), config = json('../config.json');
test('skips completed and blank rows, preserves selected row number', () => {
  const b = build([{ Status: 'done', Item1: 'old' }, {}, ...rows], config);
  assert.equal(b.meta.firstName, 'Alex'); assert.equal(b.cart.rowNumber, 2);
});
test('no pending row returns empty without API calls', async () => {
  const s = await run({ rows: [{ Item1: 'old', Status: 'done' }], config }); assert.equal(s.state, 'empty');
});
test('invalid email stops before render; missing photos use numbered design', () => {
  assert.throws(() => build([{ ...rows[0], Email: 'invalid' }], config), /Email/);
  assert.equal(build([{ ...rows[0], Item1Image: '' }], config).meta.itemsWithImages, 0);
});
test('unreadable prices suppress the total and music failure remains usable', () => {
  const b = build([{ ...rows[0], Item1Price: 'call us' }], config, { statusCode: 404 });
  assert.equal(b.meta.totalDisplay, null); assert.equal(b.meta.musicUsed, false);
});
test('dry run validates once and never submits', async () => {
  let calls = 0; const client = { authoring: { validate: async () => { calls++; return { valid: true, creditsRequired: 14 }; } } };
  const s = await run({ rows, config: { ...config, dryRun: true }, client }); assert.equal(s.state, 'dry-run'); assert.equal(calls, 1);
});
test('invalid project and exceeded ceiling never submit', async () => {
  await assert.rejects(run({ rows, config, maxCredits: 15, client: { authoring: { validate: async () => ({ valid: false, errors: ['invalid'] }) } } }), /Validation failed/);
  await assert.rejects(run({ rows, config, maxCredits: 13, client: { authoring: { validate: async () => ({ valid: true, creditsRequired: 14 }) } } }), /exceeds/);
});
test('receipt persists before wait and resume never creates another render', async () => {
  const saved = []; let submissions = 0;
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 14 }) }, renders: { create: async () => { submissions++; return { jobId: 'fixture-job' }; } }, jobs: { wait: async () => { assert.equal(saved.at(-1).jobId, 'fixture-job'); throw new Error('timeout'); } } };
  await assert.rejects(run({ rows, config, client, maxCredits: 14, save: v => saved.push(structuredClone(v)) }), /timeout/);
  client.jobs.wait = async () => ({ state: 'completed', result: { url: 'https://cdn.zvid.io/example.mp4' } });
  const s = await run({ config, client, prior: saved.at(-1) }); assert.equal(s.state, 'completed'); assert.equal(submissions, 1);
});
test('ambiguous submission is not automatically retried', async () => {
  await assert.rejects(run({ config, client: {}, prior: { state: 'submission-pending' } }), /No saved job ID/);
});
