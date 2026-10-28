import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWorkflow, readWorkflowConfig, loadFixture } from '../src/planner.js';
import { run } from '../src/run.js';

async function setup(overrides = {}) {
  const { byName } = await loadWorkflow();
  return { byName, config: { ...readWorkflowConfig(byName), maxProducts: 1, variantsPerProduct: 2, maxTotalAds: 2 },
    shopifyResponse: await loadFixture(), ...overrides };
}
function fakeClient({ invalid = false, missingQuote = false, uncertain = false, failed = false, pending = false } = {}) {
  const calls = { validate: 0, submit: 0, poll: 0 };
  return { calls, client: {
    authoring: { validate: async () => { calls.validate++; return { valid: !invalid, ...(missingQuote ? {} : { creditsRequired: 20 }) }; } },
    renders: {
      createBulk: async () => { calls.submit++; if (uncertain) throw new Error('network timeout'); return { bulkId: 'bulk_fixture', jobs: [{jobId:'job_1',index:0},{jobId:'job_2',index:1}] }; },
      getBulk: async () => { calls.poll++; return { bulk: { counts: { pending: pending ? 2 : 0 } }, jobs: [
        { id: 'job_1', status: 'completed', outputUrl: 'https://cdn.zvid.io/example.mp4' },
        { id: 'job_2', status: failed ? 'failed' : 'completed', ...(failed ? {errorMessage:'Fixture failure'} : {outputUrl:'https://cdn.zvid.io/example2.mp4'}) },
      ] }; },
    },
  } };
}
test('plan is entirely offline and does not validate or render', async () => {
  const { client, calls } = fakeClient();
  const state = await run(await setup({ client }));
  assert.equal(state.state, 'planned'); assert.deepEqual(calls, {validate:0,submit:0,poll:0});
});
test('every variant is validated and the total quote gates paid submission', async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(run(await setup({ client, mode: 'render', confirmRender: true, maxCredits: 39 })), /exceeds/);
  assert.equal(calls.validate, 2); assert.equal(calls.submit, 0);
});
test('invalid or unquoted projects do not render', async () => {
  for (const flags of [{invalid:true},{missingQuote:true}]) {
    const { client, calls } = fakeClient(flags);
    await assert.rejects(run(await setup({ client, mode:'render',confirmRender:true,maxCredits:100 })));
    assert.equal(calls.submit, 0);
  }
});
test('paid render requires explicit confirmation', async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(run(await setup({ client, mode:'render',maxCredits:100 })), /confirm-render/);
  assert.equal(calls.submit, 0); assert.equal(calls.validate, 0);
});
test('accepted job mapping is saved before polling and partial failure retains successes', async () => {
  const { client } = fakeClient({failed:true}); const states=[];
  const state = await run(await setup({ client,mode:'render',confirmRender:true,maxCredits:40,save:async s=>states.push(structuredClone(s)) }));
  assert.ok(states.some(s=>s.state==='submitted'&&s.submission.bulkId==='bulk_fixture'&&!s.lastStatus));
  assert.equal(state.state,'completed_with_errors'); assert.equal(state.manifest.assets.length,1); assert.equal(state.manifest.failures.length,1);
});
test('resume polls a saved batch without validating or submitting again', async () => {
  const first = fakeClient();
  const prior = await run(await setup({client:first.client,mode:'render',confirmRender:true,maxCredits:40}));
  const second = fakeClient();
  const state = await run(await setup({client:second.client,prior}));
  assert.equal(state.state,'completed'); assert.deepEqual(second.calls,{validate:0,submit:0,poll:1});
});
test('an uncertain submission is persisted and cannot be blindly resumed', async () => {
  const {client,calls}=fakeClient({uncertain:true}); let saved;
  await assert.rejects(run(await setup({client,mode:'render',confirmRender:true,maxCredits:40,save:async s=>{saved=structuredClone(s)}})), /network timeout/);
  assert.equal(saved.state,'submitting'); assert.equal(calls.submit,1);
  await assert.rejects(run(await setup({client,prior:saved})), /No accepted bulk ID/);
  assert.equal(calls.submit,1);
});
test('poll timeout preserves the existing batch for resume', async () => {
  const {client,calls}=fakeClient({pending:true}); let saved; let time=0;
  await assert.rejects(run(await setup({client,mode:'render',confirmRender:true,maxCredits:40,
    now:()=>time, sleep:async()=>{time+=2_000_000},save:async s=>{saved=structuredClone(s)}})), /Renders continue/);
  assert.equal(saved.submission.bulkId,'bulk_fixture'); assert.equal(calls.submit,1);
});
