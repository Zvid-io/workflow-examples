import { buildProject } from './build-project.js';
import { eligible, httpsUrl, selectCheckout } from './shopify.js';

export function checkConfig(config) {
  for (const [key,min,max] of [['scanLimit',1,50],['recoveryWaitMinutes',0,10080],['followUpWaitMinutes',0,10080],['pollSeconds',1,300],['timeoutMinutes',0.01,120]]) {
    if (!Number.isFinite(config[key]) || config[key]<min || config[key]>max) throw new Error(`Invalid ${key}`);
  }
  if (typeof config.dryRun !== 'boolean') throw new Error('dryRun must be a boolean');
  return config;
}

export async function run({config, fixture, client, shopify, prior, ledger = {}, offline = false, maxCredits,
  save = () => {}, saveLedger = () => {}, saveProject = () => {}, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve,ms))}) {
  checkConfig(config);
  if (offline && !fixture) throw new Error('Offline mode requires a fixture');
  if (maxCredits !== undefined && (!Number.isFinite(maxCredits) || maxCredits <= 0)) throw new Error('max credits must be positive');
  let state = prior;
  const update = () => save(state);
  if (!state) {
    const cart = fixture || selectCheckout(await shopify.list(), ledger, config.shopDomain);
    if (!cart) { state = {version:1,state:'empty',fixture:false,shopDomain:config.shopDomain}; update(); return state; }
    state = {version:1, state:'waiting', fixture:Boolean(fixture), shopDomain:fixture?null:config.shopDomain,
      config:{...config}, cart, createdAt:now(), checkAt:now()+(fixture?0:config.recoveryWaitMinutes*60_000)};
    // Save the selection before recording it in the shared local ledger.
    update();
    if (!fixture) { ledger[`${config.shopDomain}:${cart.checkoutId}`] = {state:'selected',createdAt:now()}; saveLedger(ledger); }
  } else {
    if (state.shopDomain && state.shopDomain !== config.shopDomain) throw new Error('Saved run belongs to a different Shopify store');
    if (fixture || offline) throw new Error('Resume uses saved input; omit fixture and offline');
    config = {...state.config, dryRun:config.dryRun};
  }
  if (['rendered','stopped','empty','failed'].includes(state.state)) return state;
  if (state.state === 'submission-pending' && !state.jobId) throw new Error('Render acceptance is uncertain. Inspect Zvid before any new submission; this run will not submit again');
  if (['waiting','offline','dry-run','validated'].includes(state.state)) {
    if (!state.fixture && now()<state.checkAt) return state;
    if (!state.fixture && !eligible(await shopify.confirm(state.cart.checkoutId), config.skipIfShopifyAlreadyEmailed)) {
      state.state='stopped'; state.reason='Checkout is no longer eligible'; update(); return state;
    }
    const currencyCode=state.cart.currencyCode;
    if (!state.fixture && !/^[A-Z]{3}$/.test(currencyCode||'')) throw new Error('Shopify did not return a usable currency code; review the checkout before rendering');
    const currencySymbol=currencyCode
      ? new Intl.NumberFormat('en',{style:'currency',currency:currencyCode}).formatToParts(0).find(part=>part.type==='currency').value
      : config.currencySymbol;
    const built = buildProject({...config,currencySymbol}, {...state.cart, music: config.musicUrl?{src:httpsUrl(config.musicUrl)}:null});
    state.payload = built.payload; state.videoSeconds = built.meta.totalSeconds;
    saveProject(state.payload);
    if (offline) { state.state='offline'; update(); return state; }
    const validation = await client.authoring.validate({payload:state.payload});
    if (!validation.valid) throw new Error('Zvid validation failed; inspect the saved project before retrying');
    if (!Number.isFinite(validation.creditsRequired) || validation.creditsRequired<0) throw new Error('No usable credit quote was returned');
    state.creditsQuoted=validation.creditsRequired; state.warnings=validation.warnings||[];
    state.payload=validation.payload||state.payload; state.state='validated'; saveProject(state.payload); update();
    if (config.dryRun) {
      const draft = await client.projects.create(state.payload.name,state.payload);
      if (!draft?.id) throw new Error('No editor draft ID returned');
      state.editorLink=`https://editor.zvid.io?project=${encodeURIComponent(draft.id)}`;
      state.state='dry-run'; update(); return state;
    }
    if (maxCredits === undefined) throw new Error('Rendering requires --max-credits after reviewing the quote');
    if (state.creditsQuoted>maxCredits) throw new Error(`Quote ${state.creditsQuoted} exceeds ceiling ${maxCredits}; no render submitted`);
    state.state='submission-pending'; update();
    const receipt = await client.renders.create({payload:state.payload});
    state.receipt=receipt; state.jobId=receipt?.jobId; update();
    if (!state.jobId) throw new Error('No render job ID received. Inspect Zvid before any new submission');
    state.state='rendering'; update();
  }
  if (!state.jobId) throw new Error('Saved run has no recoverable job ID');
  const deadline=now()+config.timeoutMinutes*60_000;
  for (;;) {
    const job=await client.jobs.get(state.jobId);
    if (job.state==='failed') {state.state='failed'; update(); throw new Error('Render failed; inspect the recorded job in Zvid');}
    if (job.state==='completed') {
      state.videoUrl=httpsUrl(typeof job.result==='string'?job.result:job.result?.url);
      state.state='rendered'; state.renderedAt=now(); update();
      if (!state.fixture) {ledger[`${state.shopDomain}:${state.cart.checkoutId}`]={state:'rendered',createdAt:state.createdAt}; saveLedger(ledger);}
      return state;
    }
    if (now()>=deadline) throw new Error('Render wait timed out. Use --resume with the same output directory; no new render is needed');
    await sleep(config.pollSeconds*1000);
  }
}
