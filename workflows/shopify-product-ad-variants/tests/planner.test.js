import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPlan,
  createRenderPayload,
  loadFixture,
  loadWorkflow,
  readWorkflowConfig,
  fetchShopifyCatalog,
  normalizeStoreDomain,
} from '../src/planner.js';

test('only store prefixes and exact Shopify hosts are accepted', () => {
  for (const input of ['store-name', 'store-name.myshopify.com', 'https://store-name.myshopify.com/']) {
    assert.equal(normalizeStoreDomain(input), 'store-name');
  }
  for (const input of ['outside.example/path', 'store.myshopify.com.evil.test', 'https://store.myshopify.com@evil.test',
    'https://store.myshopify.com/path', 'https://store.myshopify.com?next=evil', 'https://store.myshopify.com:443',
    'http://store.myshopify.com', '', '../store', 'store_name']) {
    assert.throws(() => normalizeStoreDomain(input), /Shopify store prefix/);
  }
});

test('invalid Shopify destinations never receive a token and redirects are blocked', async () => {
  const originalFetch = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({url, options});
    return { status: 200, json: async () => ({data:{products:{nodes:[]}}}) };
  };
  try {
    const config = {shopDomain:'outside.example/path',shopifyApiVersion:'2026-07'};
    await assert.rejects(fetchShopifyCatalog(config, 'test-placeholder'), /Shopify store prefix/);
    assert.equal(requests.length, 0);
    await fetchShopifyCatalog({...config,shopDomain:'test-store.myshopify.com'}, 'test-placeholder');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://test-store.myshopify.com/admin/api/2026-07/graphql.json');
    assert.equal(requests[0].options.redirect, 'error');
  } finally { globalThis.fetch = originalFetch; }
});

async function arrange(overrides) {
  const { byName } = await loadWorkflow();
  const config = { ...readWorkflowConfig(byName), ...overrides };
  const shopifyResponse = await loadFixture();
  const plan = await createPlan({ byName, config, shopifyResponse });
  const build = await createRenderPayload({ byName, config, plan });
  return { config, plan, build };
}

test('two products and a global cap of two create one video per product', async () => {
  const { plan, build } = await arrange({
    maxProducts: 2,
    variantsPerProduct: 1,
    maxTotalAds: 2,
  });
  assert.equal(plan.productsScanned, 5);
  assert.equal(plan.productsSelected, 2);
  assert.equal(plan.ads.length, 2);
  assert.deepEqual(plan.variantDistribution.map((row) => row.variants), [1, 1]);
  assert.equal(new Set(plan.ads.map((ad) => ad.shopifyProductId)).size, 2);
  assert.equal(build.items.length, 2);
});

test('two products by two variants create four distinct concepts with a cap of four', async () => {
  const { plan, build } = await arrange({
    maxProducts: 2,
    variantsPerProduct: 2,
    maxTotalAds: 4,
  });
  assert.equal(plan.ads.length, 4);
  assert.deepEqual(plan.variantDistribution.map((row) => row.variants), [2, 2]);
  assert.deepEqual(plan.variantDistribution.map((row) => row.formats), [
    ['product-first', 'benefit-first'],
    ['product-first', 'benefit-first'],
  ]);
  assert.equal(new Set(plan.ads.map((ad) => ad.trackingKey)).size, 4);
  for (const productId of new Set(plan.ads.map((ad) => ad.shopifyProductId))) {
    const variants = plan.ads.filter((ad) => ad.shopifyProductId === productId);
    assert.notEqual(variants[0].openerHeadline, variants[1].openerHeadline);
    assert.notEqual(variants[0].angleLabel, variants[1].angleLabel);
    assert.notEqual(variants[0].storyKicker, variants[1].storyKicker);
    const visibleCopy = variants.map((ad) => JSON.stringify({
      angleLabel: ad.angleLabel,
      openerHeadline: ad.openerHeadline,
      openerSubheadline: ad.openerSubheadline,
      storyKicker: ad.storyKicker,
      storyCopy: ad.storyCopy,
      benefits: ad.benefits,
      offer: ad.offer,
    }));
    assert.equal(new Set(visibleCopy).size, 2);
  }
  assert.equal(build.items.length, 4);
  assert.equal(new Set(build.items.map((item) => item.name)).size, 4);
});

test('maxTotalAds is intentionally a global cap', async () => {
  const { plan } = await arrange({
    maxProducts: 2,
    variantsPerProduct: 2,
    maxTotalAds: 1,
  });
  assert.equal(plan.productsSelected, 2);
  assert.equal(plan.ads.length, 1);
  assert.deepEqual(plan.variantDistribution.map((row) => row.variants), [1, 0]);
});

test('approved render design contains readability overlays on the first two scenes', async () => {
  const { build } = await arrange({
    maxProducts: 1,
    variantsPerProduct: 1,
    maxTotalAds: 1,
  });
  const [opener, about, , , outro] = build.payload.scenes;
  assert.equal(opener.id, 'opener');
  assert.equal(about.id, 'about');
  assert.ok(opener.visuals.some((visual) => visual.type === 'SVG' && visual.svg.includes('editorialOpen')));
  assert.ok(about.visuals.some((visual) => visual.type === 'SVG' && visual.svg.includes('productReadability')));
  assert.ok(outro.visuals.some((visual) => visual.type === 'SVG' && visual.svg.includes("width='480'")));
});
