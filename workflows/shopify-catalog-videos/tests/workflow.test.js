import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog, checkConfig, defaults } from '../src/workflow.js';
import { run } from '../src/run.js';
import { createShopify } from '../src/shopify.js';

const fixture = () => JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const config = overrides => ({ ...defaults, ...overrides });
function mockClient({ valid = true, credits = 14, refs, jobs, submitError } = {}) {
  let submissions = 0;
  return {
    get submissions() { return submissions; },
    authoring: { validate: async () => ({ valid, creditsRequired: credits, payload: { name: 'resolved' } }) },
    renders: {
      createBulk: async () => {
        submissions++;
        if (submitError) throw new Error(submitError);
        return { bulkId: 'batch', jobs: refs || [{ jobId: 'one', index: 0 }] };
      },
      getBulk: async () => ({ jobs: jobs || [{ id: 'one', status: 'completed', outputUrl: 'https://cdn.example.test/video.mp4' }] }),
    },
  };
}

test('canonical mapper and builder produce one vertical three-scene video', () => {
  const { built, selection } = buildCatalog(fixture(), config());
  assert.equal(selection.rows.length, 1);
  assert.equal(built.items.length, 1);
  assert.equal(built.payload.scenes.length, 3);
  assert.equal(built.payload.resolution, 'instagram-reel');
  assert.equal(built.meta.products[0].shopifyProductId, 'gid://shopify/Product/1');
});

test('skip existing videos, tagged, inactive, incomplete and invalid-price products', () => {
  const catalog = fixture();
  const base = catalog.data.products.nodes[0];
  catalog.data.products.nodes = [base,
    { ...base, id: 'gid://shopify/Product/2', hostedVideos: { nodes: [{ mediaContentType: 'VIDEO', status: 'PROCESSING' }] } },
    { ...base, id: 'gid://shopify/Product/3', tags: ['zvid-video'] },
    { ...base, id: 'gid://shopify/Product/4', status: 'DRAFT' },
    { ...base, id: 'gid://shopify/Product/5', productImages: { nodes: [] } },
    { ...base, id: 'gid://shopify/Product/6', variants: { nodes: [{ price: 'oops' }] } },
  ];
  const { selection } = buildCatalog(catalog, config());
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.skipped.length, 5);
});

test('empty and offline runs do not contact Zvid', async () => {
  const catalog = fixture(); catalog.data.products.nodes = [];
  assert.equal((await run({ catalog, config: config() })).state, 'empty');
  assert.equal((await run({ catalog: fixture(), config: config(), offline: true })).state, 'offline');
});

test('validation failures and missing quotes prevent rendering', async () => {
  for (const client of [mockClient({ valid: false }), mockClient({ credits: NaN })]) {
    await assert.rejects(run({ catalog: fixture(), config: config(), client }));
    assert.equal(client.submissions, 0);
  }
});

test('dry run validates for free and credit ceiling blocks a paid batch', async () => {
  const client = mockClient();
  const result = await run({ catalog: fixture(), config: config({ dryRun: true }), client });
  assert.equal(result.creditsQuoted, 14);
  assert.equal(client.submissions, 0);
  await assert.rejects(run({ catalog: fixture(), config: config(), client, maxCredits: 13 }), /exceed/);
  assert.equal(client.submissions, 0);
});

test('each product is validated and quotes are summed before submission', async () => {
  const catalog = fixture();
  catalog.data.products.nodes.push({ ...catalog.data.products.nodes[0], id: 'gid://shopify/Product/2' });
  const client = mockClient(); let calls = 0;
  client.authoring.validate = async () => ({ valid: true, payload: {}, creditsRequired: ++calls * 10 });
  await assert.rejects(run({ catalog, config: config(), client, maxCredits: 29 }), /Quoted 30/);
  assert.equal(calls, 2); assert.equal(client.submissions, 0);
});

test('maps out-of-order jobs using submission indices, never array order or title', async () => {
  const catalog = fixture();
  catalog.data.products.nodes.push({ ...catalog.data.products.nodes[0], id: 'gid://shopify/Product/2' });
  const client = mockClient({ refs: [{ jobId: 'two', index: 1 }, { jobId: 'one', index: 0 }], jobs: [
    { id: 'one', status: 'completed', outputUrl: 'https://cdn.example.test/one.mp4' },
    { id: 'two', status: 'completed', outputUrl: 'https://cdn.example.test/two.mp4' },
  ] });
  const result = await run({ catalog, config: config(), client });
  assert.equal(result.videos[0].productId, 'gid://shopify/Product/2');
  assert.equal(result.videos[0].videoUrl, 'https://cdn.example.test/two.mp4');
});

test('ambiguous submission is recorded before the request and never retried on resume', async () => {
  let saved;
  const client = mockClient({ submitError: 'network timeout' });
  await assert.rejects(run({ catalog: fixture(), config: config(), client, save: x => { saved = structuredClone(x); } }), /network timeout/);
  assert.equal(saved.state, 'submission-pending');
  await assert.rejects(run({ prior: saved, config: config(), client }), /No recoverable/);
  assert.equal(client.submissions, 1);
});

test('timeout persists receipt and resume polls without resubmitting', async () => {
  let saved; let clock = 0;
  const client = mockClient({ jobs: [] });
  await assert.rejects(run({ catalog: fixture(), config: config(), client,
    now: () => clock++ * 2_000_000, save: x => { saved = structuredClone(x); } }), /timed out/);
  const resumed = mockClient();
  const result = await run({ prior: saved, config: config(), client: resumed });
  assert.equal(result.videos.length, 1); assert.equal(resumed.submissions, 0);
});

test('invalid indices stop publishing and failed renders remain explicit', async () => {
  await assert.rejects(run({ catalog: fixture(), config: config(), client: mockClient({ refs: [{ jobId: 'one' }] }) }), /invalid product/);
  const result = await run({ catalog: fixture(), config: config(), client: mockClient({ jobs: [{ id: 'one', status: 'failed', errorMessage: 'asset unavailable' }] }) });
  assert.equal(result.state, 'partial'); assert.equal(result.videos.length, 0); assert.equal(result.errors.length, 1);
});

test('fixture runs cannot write Shopify media, including when resumed', async () => {
  await assert.rejects(run({ catalog: fixture(), config: config({ publishToShopify: true }), fixture: true }), /Fixture/);
  const saved = await run({ catalog: fixture(), config: config(), client: mockClient(), fixture: true });
  await assert.rejects(run({ prior: saved, config: config({ publishToShopify: true }), client: mockClient() }), /Fixture/);
});

test('Shopify is untouched by default and recorded association attempts are not repeated', async () => {
  let calls = 0;
  const shopify = { publish: async (_, record) => { calls++; record({ publication: 'association-pending' }); throw new Error('ambiguous response'); } };
  const saved = await run({ catalog: fixture(), config: config(), client: mockClient(), shopify });
  assert.equal(calls, 0);
  const attempted = await run({ prior: saved, config: config({ publishToShopify: true }), client: mockClient(), shopify });
  await run({ prior: attempted, config: config({ publishToShopify: true }), client: mockClient(), shopify });
  assert.equal(calls, 1);
});

test('configuration rejects invalid caps, booleans, and credential destinations', () => {
  for (const values of [{ maxProducts: 0 }, { scanLimit: 251 }, { dryRun: 'false' }, { timeoutMinutes: NaN }]) assert.throws(() => checkConfig(config(values)));
  assert.throws(() => createShopify(config({ shopDomain: 'evil.example/path' }), 'secret'));
});

test('Shopify staged transfer uses all returned parameters, attaches correct GID, then tags', async () => {
  const calls = []; const progress = [];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisomtestbytes')]);
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://cdn.example.test/video.mp4') return new Response(mp4);
    if (url === 'https://storage.example.test/staged') return new Response('', { status: 201 });
    const { query, variables } = JSON.parse(init.body);
    if (query.includes('StageVideo')) {
      assert.equal(variables.input[0].fileSize, String(mp4.length));
      return Response.json({ data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://storage.example.test/staged', resourceUrl: 'https://storage.example.test/resource', parameters: [{ name: 'key', value: 'safe-fixture' }, { name: 'policy', value: 'fixture' }] }], userErrors: [] } } });
    }
    if (query.includes('AttachVideo')) {
      assert.equal(variables.product.id, 'gid://shopify/Product/1');
      return Response.json({ data: { productUpdate: { product: { id: variables.product.id }, userErrors: [] } } });
    }
    assert.equal(progress.at(-1).publication, 'processing');
    return Response.json({ data: { tagsAdd: { node: { id: variables.id }, userErrors: [] } } });
  };
  const shopify = createShopify(config({ shopDomain: 'example' }), 'fixture-token', fakeFetch);
  await shopify.publish({ productId: 'gid://shopify/Product/1', title: 'Sample', videoUrl: 'https://cdn.example.test/video.mp4' }, x => progress.push(x));
  assert.equal(calls.length, 5);
  assert.equal(calls[2].init.body.get('policy'), 'fixture');
  assert.equal(calls[2].init.headers, undefined);
  assert.deepEqual(progress.at(-1), { publication: 'processing', tagged: true });
});

test('Shopify rejects GraphQL errors without pretending catalog is empty', async () => {
  const shopify = createShopify(config({ shopDomain: 'example' }), 'fixture-token', async () => Response.json({ errors: [{ message: 'Access denied' }] }));
  await assert.rejects(shopify.getCatalog(), /Access denied/);
});

test('Shopify association rejection never adds the processed tag', async () => {
  const mutations = [];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisomtestbytes')]);
  const fakeFetch = async (url, init) => {
    if (url === 'https://cdn.example.test/video.mp4') return new Response(mp4);
    if (url === 'https://storage.example.test/staged') return new Response('', { status: 201 });
    const { query } = JSON.parse(init.body); mutations.push(query);
    if (query.includes('StageVideo')) return Response.json({ data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://storage.example.test/staged', resourceUrl: 'https://storage.example.test/resource', parameters: [{ name: 'key', value: 'fixture' }] }], userErrors: [] } } });
    return Response.json({ data: { productUpdate: { product: null, userErrors: [{ message: 'Rejected media' }] } } });
  };
  const shopify = createShopify(config({ shopDomain: 'example' }), 'fixture-token', fakeFetch);
  await assert.rejects(shopify.publish({ productId: 'gid://shopify/Product/1', title: 'Sample', videoUrl: 'https://cdn.example.test/video.mp4' }), /Rejected media/);
  assert.equal(mutations.length, 2);
  assert.ok(mutations.every(query => !query.includes('TagVideo')));
});
