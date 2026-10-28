import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, selectProduct, buildProduct } from '../src/workflow.js';
import { run } from '../src/run.js';

const config = { ...defaults, musicUrl: '', dryRun: false };
const input = { Title: 'Demo Lip Color Kit', Price: '36', CompareAtPrice: '48', ImageUrl1: 'https://cdn.zvid.io/example.jpg', Tagline: 'Three colors for your everyday kit.', row_number: 2 };
const client = () => ({
  authoring: { validate: async () => ({ valid: true, creditsRequired: 15 }) },
  renders: { create: async () => ({ jobId: 'job_test' }) },
  jobs: { wait: async () => ({ state: 'completed', result: 'https://cdn.zvid.io/result.mp4' }) },
});
test('picks first pending row and rejects incomplete pending rows', () => {
  const p = selectProduct([{ ...input, Status: 'done' }, { ...input, row_number: 3 }], config);
  assert.equal(p.rowNumber, 3);
  assert.throws(() => selectProduct({ ...input, Title: '' }, config), /no Title/);
});
test('builder uses two images, discount math and matching duration', () => {
  const p = selectProduct({ ...input, ImageUrl2: 'https://cdn.zvid.io/example-2.jpg' }, config);
  const { meta, payload } = buildProduct(p, config);
  assert.equal(meta.savePct, 25); assert.equal(meta.imageCount, 2); assert.equal(meta.totalSeconds, 14.3);
  assert.equal(payload.scenes.length, 3); assert.equal(payload.audios, undefined);
});
test('Shopify initializes once and unchanged newest product is skipped', () => {
  const marker = {};
  const c = { ...config, source: 'shopify', shopDomain: 'example' };
  const response = { statusCode: 200, body: { products: [{ id: '123', title: 'First' }] } };
  assert.equal(selectProduct(response, c, marker).seeded, true);
  assert.equal(selectProduct(response, c, marker).found, false);
});
test('Shopify errors do not masquerade as empty catalogs', () => {
  assert.throws(() => selectProduct({ statusCode: 401 }, { ...config, source: 'shopify' }), /401/);
  assert.throws(() => selectProduct({ error: 'network' }, { ...config, source: 'shopify' }), /no HTTP response/);
});
test('offline has no client or credit dependency', async () => {
  const state = await run({ input, config, offline: true });
  assert.equal(state.state, 'offline');
});
test('dry run validates without submitting', async () => {
  const c = client(); c.renders.create = () => { throw new Error('unexpected submit'); };
  assert.equal((await run({ input, config: { ...config, dryRun: true }, client: c })).state, 'dry-run');
});
test('cost ceiling and missing ceiling block render submission', async () => {
  const c = client(); c.renders.create = () => { throw new Error('unexpected submit'); };
  await assert.rejects(run({ input, config, client: c, maxCredits: 14 }), /exceeds/);
  await assert.rejects(run({ input, config, client: c }), /explicit/);
});
test('invalid validation blocks rendering', async () => {
  const c = client(); c.authoring.validate = async () => ({ valid: false, errors: [{ field: 'payload', message: 'bad' }] });
  await assert.rejects(run({ input, config, client: c, maxCredits: 20 }), /Validation failed/);
});
test('receipt is persisted before a wait timeout and resume does not submit', async () => {
  const c = client(); let saved;
  c.jobs.wait = async () => { throw new Error('timeout'); };
  await assert.rejects(run({ input, config, client: c, maxCredits: 20, save: s => { saved = structuredClone(s); } }), /timeout/);
  assert.equal(saved.jobId, 'job_test');
  const resumed = client(); resumed.renders.create = () => { throw new Error('resubmitted'); };
  assert.equal((await run({ config, client: resumed, prior: saved })).state, 'completed');
});
test('uncertain submission stays blocked without a receipt', async () => {
  const c = client(); let saved;
  c.renders.create = async () => { throw new Error('connection lost'); };
  await assert.rejects(run({ input, config, client: c, maxCredits: 20, save: s => { saved = structuredClone(s); } }), /connection lost/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ config, client: c, prior: saved }), /No saved job/);
});
