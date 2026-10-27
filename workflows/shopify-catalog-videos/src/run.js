import { buildCatalog, checkConfig } from './workflow.js';
import { httpsUrl } from './shopify.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function run({ config, catalog, client, shopify, offline = false, fixture = false,
  maxCredits, prior, save = () => {}, saveProject = () => {}, sleep = pause, now = Date.now }) {
  checkConfig(config);
  if (fixture && config.publishToShopify) throw new Error('Fixture input cannot publish to Shopify');
  if (maxCredits !== undefined && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('max credits must be positive');
  let state = prior;
  if (!state) {
    const { selection, built } = buildCatalog(catalog, config);
    state = { version: 1, state: 'prepared', fixture, shopDomain: fixture ? null : config.shopDomain,
      selection, products: built?.meta.products || [], videos: [], errors: [] };
    save(state);
    if (!built) { state.state = 'empty'; save(state); return state; }
    saveProject('batch', { payload: built.payload, items: built.items });
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quotes = [];
    for (const [index, item] of built.items.entries()) {
      const validation = await client.authoring.validate({ payload: built.payload, variables: item.variables });
      if (!validation.valid) throw new Error(`Product ${index + 1} failed Zvid validation: ${JSON.stringify(validation.errors || [])}`);
      if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired < 0) throw new Error('Zvid did not return a usable credit quote');
      if (!validation.payload) throw new Error('Zvid did not return a resolved project');
      saveProject(`product-${index + 1}`, validation.payload);
      quotes.push({ index, credits: validation.creditsRequired, warnings: validation.warnings || [] });
    }
    state.quotes = quotes;
    state.creditsQuoted = quotes.reduce((total, quote) => total + quote.credits, 0);
    state.state = 'validated'; save(state);
    if (config.dryRun) { state.state = 'dry-run'; save(state); return state; }
    if (maxCredits !== undefined && state.creditsQuoted > maxCredits) throw new Error(`Quoted ${state.creditsQuoted} credits exceed the ${maxCredits} limit; no render submitted`);
    state.state = 'submission-pending'; save(state);
    const submitted = await client.renders.createBulk({ name: config.bulkName, payload: built.payload, items: built.items });
    // Save the raw acceptance before checking it, so malformed/partial responses remain recoverable.
    state.submission = submitted;
    state.bulkId = submitted.bulkId;
    state.state = 'submitted'; save(state);
  } else {
    if (offline || config.dryRun) throw new Error('Resume polls an existing render; do not combine it with offline or dry-run');
    if (state.shopDomain && state.shopDomain !== config.shopDomain) throw new Error('Resume store does not match the saved run');
    if (state.fixture && config.publishToShopify) throw new Error('Fixture runs cannot publish to Shopify');
  }
  if (!state.bulkId || !Array.isArray(state.submission?.jobs) || !state.submission.jobs.length) {
    throw new Error('No recoverable batch receipt. Check the Zvid dashboard before starting another run');
  }
  const indices = new Set();
  const jobIds = new Set();
  for (const ref of state.submission.jobs) {
    if (!Number.isInteger(ref.index) || !state.products[ref.index] || indices.has(ref.index) || !ref.jobId || jobIds.has(ref.jobId)) {
      throw new Error('Batch receipt has invalid product indices or duplicate jobs; inspect it before publishing');
    }
    indices.add(ref.index); jobIds.add(ref.jobId);
  }
  const deadline = now() + config.timeoutMinutes * 60_000;
  for (;;) {
    const status = await client.renders.getBulk(state.bulkId);
    const jobs = new Map((status.jobs || []).map(job => [job.id, job]));
    let pending = false;
    const videos = [];
    const errors = [...(state.submission.errors || [])];
    if (state.submission.failedToQueue) errors.push({ error: `${state.submission.failedToQueue} jobs failed to queue` });
    for (const ref of state.submission.jobs) {
      const job = jobs.get(ref.jobId);
      const product = state.products[ref.index];
      if (!job || !['completed', 'failed'].includes(job.status)) { pending = true; continue; }
      if (job.status === 'failed' || !job.outputUrl) {
        errors.push({ productId: product.shopifyProductId, jobId: ref.jobId, error: job.errorMessage || 'No completed video URL' });
        continue;
      }
      const previous = state.videos.find(video => video.jobId === ref.jobId);
      videos.push({ ...previous, jobId: ref.jobId, productId: product.shopifyProductId,
        title: product.product, productUrl: product.productUrl, videoUrl: httpsUrl(job.outputUrl) });
    }
    state.videos = videos; state.errors = errors;
    state.state = pending ? 'rendering' : errors.length ? 'partial' : 'rendered';
    save(state);
    if (!pending) break;
    if (now() >= deadline) throw new Error('Render wait timed out. Resume this output directory; do not submit a new batch');
    await sleep(config.pollSeconds * 1000);
  }
  if (config.publishToShopify) {
    if (!shopify) throw new Error('Shopify client required for publication');
    for (const video of state.videos) {
      // Any recorded association attempt is deliberately not repeated automatically.
      if (video.publication) continue;
      try {
        await shopify.publish(video, update => { Object.assign(video, update); save(state); });
      } catch (error) {
        video.publishError = error.message; save(state);
      }
    }
  }
  save(state);
  return state;
}
