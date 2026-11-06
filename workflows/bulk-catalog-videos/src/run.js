import { buildCatalog } from './workflow.js';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function run({ catalog, config, client, offline = false, dryRun = false, maxCredits, prior, save = () => {}, saveProject = () => {}, sleep = pause, now = Date.now }) {
  if (maxCredits !== undefined && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('max-credits must be a positive number');
  let state = prior;
  if (!state) {
    const { selection, built } = buildCatalog(catalog, config);
    state = { version: 1, state: 'prepared', catalog, selection, products: built?.meta.products || [], videos: [], errors: [] };
    save(state);
    if (!built) { state.state = 'empty'; save(state); return state; }
    saveProject('batch', { payload: built.payload, items: built.items });
    if (offline) { state.state = 'offline'; save(state); return state; }
    state.quotes = [];
    for (const [index, item] of built.items.entries()) {
      const result = await client.authoring.validate({ payload: built.payload, variables: item.variables });
      if (!result.valid) throw new Error(`Product ${index + 1} failed validation: ${JSON.stringify(result.errors || [])}`);
      if (!Number.isFinite(result.creditsRequired) || result.creditsRequired < 0 || !result.payload) throw new Error('Validation returned no usable quote or resolved project');
      saveProject(`product-${index + 1}`, result.payload);
      state.quotes.push({ index, credits: result.creditsRequired, warnings: result.warnings || [] });
    }
    state.creditsQuoted = state.quotes.reduce((n,q) => n + q.credits, 0);
    state.state = 'validated'; save(state);
    if (dryRun) { state.state = 'dry-run'; save(state); return state; }
    if (maxCredits === undefined) throw new Error('Paid rendering requires --max-credits after reviewing the quote');
    if (state.creditsQuoted > maxCredits) throw new Error(`Quote ${state.creditsQuoted} exceeds limit ${maxCredits}; no render submitted`);
    state.state = 'submission-pending'; save(state);
    let response;
    try {
      response = await client.renders.createBulk({ name: config.bulkName, payload: built.payload, items: built.items });
    } catch (error) {
      // A rate-limit response is a definite rejection. Network and server errors remain uncertain.
      if (error.status === 429) {
        const seconds = Number.isFinite(error.retryAfter) ? Math.max(0, error.retryAfter) : 60;
        state.state = 'rejected'; state.retryAt = now() + seconds * 1000;
        state.rejection = { status: 429, message: error.message, retryAfterSeconds: seconds };
        save(state);
      }
      throw error;
    }
    state.submission = response; state.bulkId = response.bulkId; state.state = 'submitted'; save(state);
  } else if (offline || dryRun) throw new Error('Resume cannot be combined with offline or dry-run');
  if (!state.bulkId || !Array.isArray(state.submission?.jobs) || !state.submission.jobs.length) throw new Error('No recoverable batch receipt. Check the dashboard before submitting again');
  const seen = new Set(); const indices = new Set();
  for (const ref of state.submission.jobs) {
    if (!ref.jobId || seen.has(ref.jobId) || !Number.isInteger(ref.index) || !state.products[ref.index] || indices.has(ref.index)) throw new Error('Invalid job mapping in saved receipt');
    seen.add(ref.jobId); indices.add(ref.index);
  }
  const rejectedIndices = new Set((state.submission.errors || []).map(error => error.item));
  state.receiptErrors = state.products.flatMap((product, index) => indices.has(index) || rejectedIndices.has(index)
    ? [] : [{ index, Product: product.product, error: 'Submission receipt did not account for this product. Inspect the dashboard before retrying it' }]);
  const deadline = now() + config.timeoutMinutes * 60000;
  for (;;) {
    const result = await client.renders.getBulk(state.bulkId);
    const jobs = new Map((result.jobs || []).map(j => [j.id,j]));
    state.videos = []; state.errors = [...(state.submission.errors || []), ...state.receiptErrors];
    if (state.submission.failedToQueue) state.errors.push({ error: `${state.submission.failedToQueue} jobs failed to queue` });
    let pending = false;
    for (const ref of state.submission.jobs) {
      const job = jobs.get(ref.jobId); const product = state.products[ref.index];
      if (!job || !['completed','failed'].includes(job.status)) { pending = true; continue; }
      if (job.status === 'failed' || !job.outputUrl) { state.errors.push({ Product: product.product, jobId: ref.jobId, error: job.errorMessage || 'No video URL' }); continue; }
      const url = new URL(job.outputUrl);
      if (url.protocol !== 'https:') throw new Error('Completed output URL must use HTTPS');
      state.videos.push({ Product: product.product, VideoUrl: url.href, jobId: ref.jobId });
    }
    state.state = pending ? 'rendering' : state.errors.length ? 'partial' : 'rendered';
    state.updatedCatalog = state.catalog.map(row => {
      const video = state.videos.find(v => v.Product === String(row.Product || '').trim());
      return video ? { ...row, VideoUrl: video.VideoUrl } : row;
    });
    save(state);
    if (!pending) return state;
    if (now() >= deadline) throw new Error('Render wait timed out. Use --resume with this output directory; server jobs continue');
    await sleep(config.pollSeconds * 1000);
  }
}
