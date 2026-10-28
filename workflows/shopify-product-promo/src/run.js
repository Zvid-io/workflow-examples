import { selectProduct, buildProduct, checkConfig } from './workflow.js';

export async function run({ input, config, client, marker = {}, prior, offline = false,
  maxCredits, musicProbe = {}, save = () => {}, saveProject = () => {}, saveMarker = () => {} }) {
  checkConfig(config);
  if (maxCredits !== undefined && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('max credits must be positive');
  let state = prior;
  if (!state) {
    const product = selectProduct(input, config, marker);
    state = { version: 1, state: 'prepared', source: config.source, shopDomain: config.source === 'shopify' ? config.shopDomain : null, product };
    save(state);
    if (!product.found) {
      state.state = product.seeded ? 'seeded' : 'empty'; save(state);
      if (product.seeded && !offline && !config.dryRun) saveMarker(marker);
      return state;
    }
    const built = buildProduct(product, config, musicProbe);
    state.meta = built.meta;
    saveProject(built.payload);
    if (offline) { state.state = 'offline'; save(state); return state; }
    const quote = await client.authoring.validate({ payload: built.payload });
    if (!quote.valid) throw new Error(`Validation failed: ${JSON.stringify(quote.errors || [])}`);
    if (!Number.isFinite(quote.creditsRequired) || quote.creditsRequired < 0) throw new Error('No usable credit quote');
    state.creditsQuoted = quote.creditsRequired;
    state.warnings = quote.warnings || [];
    state.state = 'validated'; save(state);
    if (config.dryRun) { state.state = 'dry-run'; save(state); return state; }
    if (maxCredits === undefined) throw new Error('Rendering requires an explicit --max-credits ceiling');
    if (quote.creditsRequired > maxCredits) throw new Error(`Quote of ${quote.creditsRequired} credits exceeds limit ${maxCredits}; no render submitted`);
    state.state = 'submission-pending'; save(state);
    const receipt = await client.renders.create({ payload: built.payload });
    state.receipt = receipt;
    state.jobId = receipt.jobId;
    state.state = 'submitted'; save(state);
  } else {
    if (offline || config.dryRun) throw new Error('Resume cannot be combined with offline or dry-run');
    if (state.shopDomain && state.shopDomain !== config.shopDomain) throw new Error('Resume store differs from the saved run');
  }
  if (!state.jobId) throw new Error('No saved job ID. Inspect the Zvid dashboard before another submission');
  const job = await client.jobs.wait(state.jobId, { timeoutMs: config.timeoutMinutes * 60000, pollIntervalMs: config.pollSeconds * 1000 });
  const url = typeof job.result === 'string' ? job.result : job.result?.url;
  if (job.state !== 'completed' || !/^https:\/\//.test(url || '')) throw new Error(`Job ${state.jobId} has no completed HTTPS video URL`);
  state.state = 'completed'; state.videoUrl = url; state.outputExpiresAt = job.outputExpiresAt || null;
  save(state);
  if (state.source === 'shopify' && state.product.productId) {
    marker.lastProductId = state.product.productId; saveMarker(marker);
  }
  return state;
}
