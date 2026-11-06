import test from 'node:test';
import assert from 'node:assert/strict';
import { ZvidClient } from '@zvid/sdk';
import { buildSale, run } from '../src/workflow.js';
const row = { Product: 'Demo Studio Headphones', OldPrice: '89', NewPrice: '54', ImageUrl: 'https://cdn.zvid.io/example.jpg', EndsAt: 'Sunday 11:59 PM', Status: '' };
const items = () => buildSale(row);
function fake(overrides = {}) {
  let submissions = 0; const order = [];
  const client = { authoring: { validate: async ({ payload }) => ({ valid: true, creditsRequired: payload.type === 'image' ? 1 : 14 }) },
    renders: { create: async () => { submissions++; order.push('submit' + submissions); return { jobId: 'job' + submissions }; } },
    jobs: { get: async id => { order.push('poll' + id); return { id, state: 'completed', progress: 100, result: { url: 'https://cdn.zvid.io/' + id } }; } }, ...overrides };
  return { client, order, count: () => submissions };
}
test('one sale builds consistent video and banner; discount floors', () => {
  const out = items(); assert.equal(out[0].meta.discountPct, 39); assert.equal(out[1].meta.discountPct, 39);
  assert.equal(out[0].meta.savedDisplay, '$35'); assert.equal(out[0].payload.audios, undefined);
  assert.equal(out[1].payload.width, 1200); assert.equal(out[1].payload.height, 628);
});
test('invalid prices and completed rows stop before API calls', () => {
  for (const NewPrice of ['100', '0', '-1', 'bad', '88.9']) assert.throws(() => buildSale({ ...row, NewPrice }));
  assert.throws(() => buildSale({ ...row, Status: 'done' }));
  assert.throws(() => buildSale({ ...row, ImageUrl: '' }));
});
test('quote-only mode does not submit and returns summed quote', async () => {
  const f = fake(); const out = await run({ items: items(), client: f.client, dryRun: true, save() {} });
  assert.equal(out.creditsQuoted, 15); assert.equal(f.count(), 0);
});
test('budget below combined quotes stops every paid request', async () => {
  const f = fake(); await assert.rejects(run({ items: items(), client: f.client, maxCredits: 14, save() {} }), /at least 15/); assert.equal(f.count(), 0);
});
test('each accepted asset completes before submitting the next', async () => {
  const f = fake(); const out = await run({ items: items(), client: f.client, maxCredits: 15, save() {} });
  assert.deepEqual(f.order, ['submit1', 'polljob1', 'submit2', 'polljob2']); assert.equal(out.state, 'completed');
});
test('resume accepted job does not submit it again', async () => {
  const f = fake(); const saved = { state: 'waiting', creditsQuoted: 15, items: items() }; saved.items[0].jobId = 'existing'; saved.items[0].status = 'accepted';
  await run({ prior: saved, client: f.client, maxCredits: 15, save() {} }); assert.equal(f.count(), 1); assert.equal(f.order[0], 'pollexisting');
});
test('uncertain submission is persisted and never blindly repeated', async () => {
  let saved; const f = fake({ renders: { create: async () => { throw new Error('connection lost'); } } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, save: s => { saved = structuredClone(s); } }), /uncertain/);
  assert.equal(saved.items[0].status, 'unknown'); await assert.rejects(run({ prior: saved, client: fake().client, maxCredits: 15, save() {} }), /uncertain/);
});
test('a failed video prevents the banner submission', async () => {
  const f = fake({ jobs: { get: async () => ({ id: 'job1', state: 'failed', progress: null, failedReason: 'image inaccessible' }) } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, save() {} }), /image inaccessible/); assert.equal(f.count(), 1);
});
test('explicit capacity rejection is distinct from uncertain submission', async () => {
  let saved; const before = Date.now(); const error = Object.assign(new Error('capacity'), { status: 429, retryAfter: 120 });
  const f = fake({ renders: { create: async () => { throw error; } } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, save: s => { saved = structuredClone(s); } }), /Capacity rejected/);
  assert.equal(saved.items[0].status, 'rejected');
  assert.ok(saved.items[0].retryNotBefore >= before + 120_000);
  await assert.rejects(run({ prior: saved, client: fake().client, maxCredits: 15, save() {} }), /Wait at least 30/);
});
test('completed job without a URL stops the pair and keeps the ID', async () => {
  let saved; const f = fake({ jobs: { get: async () => ({ id: 'job1', state: 'completed', progress: 100 }) } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, save: s => { saved = structuredClone(s); } }), /without an output URL/);
  assert.equal(saved.items[0].jobId, 'job1'); assert.equal(f.count(), 1);
});
test('timeout keeps an accepted job for a later resume', async () => {
  let saved; const f = fake({ jobs: { get: async () => ({ id: 'job1', state: 'active', progress: 50 }) } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, timeoutMs: 0, save: s => { saved = structuredClone(s); } }), /timed out/);
  assert.equal(saved.items[0].jobId, 'job1'); assert.equal(saved.state, 'waiting'); assert.equal(f.count(), 1);
});
test('real SDK transport uses JobStatus state and completes both assets', async () => {
  let submitted = 0;
  const client = new ZvidClient({ apiKey: 'test-only-not-a-real-key', baseUrl: 'https://api.zvid.io', maxRetries: 0,
    fetch: async (url, init) => {
      const pathname = new URL(url).pathname;
      let response;
      if (pathname === '/api/render/validate/api-key') response = { creditsRequired: JSON.parse(init.body).payload.type === 'image' ? 1 : 14, payload: JSON.parse(init.body).payload };
      else if (pathname === '/api/render/api-key') response = { jobId: 'sdk-job-' + (++submitted) };
      else if (pathname.startsWith('/api/jobs/')) response = { id: pathname.split('/').pop(), state: 'completed', progress: 100, result: 'https://cdn.zvid.io/sdk-output' };
      else throw new Error('Unexpected API route: ' + pathname);
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const state = await run({ items: items(), client, maxCredits: 15, save() {} });
  assert.equal(state.state, 'completed'); assert.equal(submitted, 2); assert.ok(state.items.every(item => item.url));
});
test('completed output must be an HTTPS URL', async () => {
  const f = fake({ jobs: { get: async () => ({ id: 'job1', state: 'completed', result: 'http://example.com/video.mp4' }) } });
  await assert.rejects(run({ items: items(), client: f.client, maxCredits: 15, save() {} }), /must use HTTPS/); assert.equal(f.count(), 1);
});
