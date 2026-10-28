import { createPlan, createRenderPayload } from './planner.js';

const terminal = new Set(['completed', 'failed', 'cancelled']);

export function assertBudget(credits, maxCredits) {
  if (!Number.isFinite(maxCredits) || maxCredits <= 0) throw new Error('Rendering requires a positive --max-credits limit.');
  if (!Number.isFinite(credits) || credits <= 0) throw new Error('The credit estimate is missing or invalid; no render was submitted.');
  if (credits > maxCredits) throw new Error(`Quoted ${credits} credits exceeds --max-credits ${maxCredits}; no render was submitted.`);
}

export function collectResult(state, result) {
  const byId = new Map((state.submission.jobs || []).map(job => [job.jobId, job.index]));
  const assets = [];
  const failures = [...(state.submission.errors || [])];
  for (const job of result.jobs || []) {
    const index = byId.get(job.id);
    const ad = state.build.meta.ads[index];
    if (!ad) throw new Error('The batch contains an unmapped job. Inspect the saved response before retrying.');
    if (job.status === 'completed' && job.outputUrl) {
      assets.push({ index, trackingKey: ad.trackingKey, productId: ad.shopifyProductId,
        product: ad.product, productUrl: ad.productUrl, creativeFormat: ad.creativeFormat,
        hook: ad.audienceHook, offer: ad.offer, videoUrl: job.outputUrl, jobId: job.id,
        creditsUsed: job.creditsConsumed ?? null,
        performance: { status: 'not_published', impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 },
      });
    } else {
      failures.push({ index, product: ad.product, creativeFormat: ad.creativeFormat,
        status: job.status, error: job.errorMessage || 'No completed video URL returned' });
    }
  }
  for (const id of byId.keys()) {
    if (!(result.jobs || []).some(job => job.id === id)) failures.push({ jobId: id, error: 'Job missing from final response' });
  }
  return { source: 'zvid-node-shopify-product-ad-variants', generatedAt: new Date().toISOString(),
    campaign: state.config.bulkName, bulkId: state.submission.bulkId, assets, failures };
}

export async function run({ byName, config, shopifyResponse, client, mode = 'plan',
  confirmRender = false, maxCredits, prior = null, save = async () => {},
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  if (!['plan', 'validate', 'render'].includes(mode)) throw new Error('--mode must be plan, validate, or render.');
  let state = prior;
  if (state) {
    if (!state.submission?.bulkId) throw new Error('No accepted bulk ID was saved. If submission was uncertain, inspect https://app.zvid.io before attempting another render.');
    if (!Array.isArray(state.submission.jobs) || !state.submission.jobs.length) throw new Error('Saved submission has no job mapping; inspect the existing batch in Zvid.');
  } else {
    if (mode === 'render' && !confirmRender) throw new Error('Paid rendering requires --confirm-render.');
    const plan = await createPlan({ byName, config, shopifyResponse });
    state = { state: 'planned', createdAt: new Date().toISOString(), config, plan, build: null };
    if (!plan.ads.length) { state.state = 'empty'; await save(state); return state; }
    state.build = await createRenderPayload({ byName, config, plan });
    await save(state);
    if (mode === 'plan') return state;

    state.validations = [];
    // Validate every actual variant. A first-item estimate alone is not a batch quote.
    for (const item of state.build.items) {
      const validation = await client.authoring.validate({ payload: state.build.payload, variables: item.variables });
      state.validations.push(validation);
      await save(state);
      if (!validation.valid) throw new Error('Zvid validation failed; inspect result.json validations. No batch was submitted.');
      if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired <= 0) throw new Error('A variant returned no usable credit estimate; no batch was submitted.');
    }
    state.creditsQuoted = state.validations.reduce((sum, item) => sum + item.creditsRequired, 0);
    state.state = 'validated';
    await save(state);
    if (mode === 'validate') return state;
    assertBudget(state.creditsQuoted, maxCredits);

    // Persist uncertainty before a paid request. Never automatically resubmit it.
    state.state = 'submitting';
    await save(state);
    const submission = await client.renders.createBulk({ payload: state.build.payload,
      items: state.build.items, name: config.bulkName });
    state.submission = submission;
    state.state = 'submitted';
    await save(state);
    if (!submission.bulkId || !submission.jobs?.length) throw new Error('Submission did not return a usable bulk ID and job mapping; inspect result.json and the Zvid dashboard before retrying.');
  }

  const deadline = now() + Number(state.config.timeoutMinutes || 20) * 60_000;
  for (;;) {
    const result = await client.renders.getBulk(state.submission.bulkId);
    state.lastStatus = result;
    await save(state);
    const counts = result.bulk?.counts;
    const done = counts && Number.isFinite(counts.pending) ? counts.pending === 0
      : Array.isArray(result.jobs) && result.jobs.length === state.submission.jobs.length && result.jobs.every(job => terminal.has(job.status));
    if (done) {
      state.manifest = collectResult(state, result);
      state.state = state.manifest.failures.length ? 'completed_with_errors' : 'completed';
      await save(state);
      return state;
    }
    if (now() >= deadline) throw new Error(`Timed out waiting for ${state.submission.bulkId}. Renders continue. Use --resume with the same --out; do not submit a new batch.`);
    await sleep(Number(state.config.pollSeconds || 10) * 1000);
  }
}
