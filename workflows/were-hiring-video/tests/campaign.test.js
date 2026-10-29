import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCampaign, handoffCsv } from '../src/workflow.js';
import { submitCampaign, validateCampaign, waitForCampaign } from '../src/run.js';
const read = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'));
const config = read('config.json'), rows = read('data/jobs.json'), now = new Date('2026-10-25T12:00:00Z');
const build = (c = config, r = rows, date = now) => buildCampaign(c, r, date);

test('Current n8n designer exactly reproduces the retained spotlight project', () => {
  const plan = build(); assert.equal(plan.ready, true); assert.deepEqual(plan.payload, read('assets/sample-project.json'));
  assert.equal(plan.payload.scenes.reduce((sum, scene) => sum + scene.duration, 0), 17);
  assert.equal(plan.roles[0].jobKey, 'DEMO-ENG-01');
});
test('Unapproved, closed and missing explicitly requested roles block the entire campaign', () => {
  assert.equal(build(config, [{ ...rows[0], Approval: '' }]).status, 'brief_needs_revision');
  assert.equal(build(config, rows, new Date('2027-01-01T12:00:00Z')).status, 'brief_needs_revision');
  assert.equal(build({ ...config, manualBrief: { ...config.manualBrief, Mode: 'roundup', JobKeys: 'DEMO-ENG-01,MISSING' } }).ready, false);
  assert.throws(() => build(config, [rows[0], rows[0]]), /unique JobKey/);
});
test('Roundup selects earlier closing roles and keeps application query parameters', () => {
  const other = { ...rows[0], JobKey: 'DEMO-DES-02', Role: 'Designer', ClosesOn: '2026-11-01', ApplyUrl: 'https://example.com/apply?role=design&utm_campaign=old#form' };
  const c = { ...config, manualBrief: { ...config.manualBrief, Mode: 'roundup', JobKeys: '', MaxRoles: 2 } };
  const p = build(c, [...rows, other]); assert.equal(p.roles[0].jobKey, 'DEMO-DES-02');
  assert.equal(p.payload.scenes.reduce((sum, scene) => sum + scene.duration, 0), 20);
  const u = new URL(p.roles[0].applyUrl); assert.equal(u.searchParams.get('role'), 'design'); assert.equal(u.hash, '#form'); assert.equal(u.searchParams.getAll('utm_campaign').length, 1);
});
test('CSV handoff protects leading formulas and escapes quotes and line breaks', () => {
  const plan = build(); plan.roles[0].role = '=HYPERLINK("bad")';
  const csv = handoffCsv(plan, 'https://example.com/video.mp4');
  assert.match(csv, /"'=HYPERLINK\(""bad""\)"/); assert.match(csv, /CampaignKey/); assert.match(csv, /https:\/\/example.com\/video.mp4/);
});
test('Invalid and excessive quotes cannot submit or change saved state', async () => {
  let creates = 0, saves = 0;
  const state = { campaigns: {} }, plan = build();
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 21 }) }, renders: { create: async () => { creates++; } } };
  await assert.rejects(submitCampaign(client, plan, state, { maxCredits: 20, save: async () => saves++ }), /No render submitted/);
  assert.equal(creates, 0); assert.equal(saves, 0); assert.deepEqual(state.campaigns, {});
  client.authoring.validate = async () => ({ valid: true, creditsRequired: NaN });
  await assert.rejects(validateCampaign(client, plan, 20), /No usable/);
});
test('Persist intent before submission, preserve accepted ID, and reject duplicates', async () => {
  const state = { campaigns: {} }, plan = build(), savedStates = [];
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 17 }) }, renders: { create: async () => { assert.equal(savedStates[0], 'submitting'); return { jobId: 'accepted-1' }; } } };
  const saved = await submitCampaign(client, plan, state, { maxCredits: 20, save: async () => savedStates.push(state.campaigns[plan.campaignKey].status) });
  assert.equal(saved.jobId, 'accepted-1'); assert.deepEqual(savedStates, ['submitting', 'rendering']);
  await assert.rejects(submitCampaign(client, plan, state, { maxCredits: 20, save: async () => {} }), /saved submission/);
});
test('An uncertain submission blocks another paid request and cannot resume without its ID', async () => {
  const state = { campaigns: {} }, plan = build();
  const client = { authoring: { validate: async () => ({ valid: true, creditsRequired: 17 }) }, renders: { create: async () => { throw new Error('Connection lost'); } } };
  await assert.rejects(submitCampaign(client, plan, state, { maxCredits: 20, save: async () => {} }), /uncertain/);
  assert.equal(state.campaigns[plan.campaignKey].status, 'submission_unknown');
  await assert.rejects(waitForCampaign(client, state.campaigns[plan.campaignKey], { save: async () => {} }), /no saved job ID/);
});
test('Resume polls only the accepted ID; timeout keeps it and success saves output', async () => {
  const saved = { status: 'rendering', jobId: 'existing-1' };
  const pending = { jobs: { get: async id => { assert.equal(id, 'existing-1'); return { state: 'active' }; } } };
  await assert.rejects(waitForCampaign(pending, saved, { save: async () => {}, timeoutMs: 0, now: () => 1 }), /timed out/);
  assert.equal(saved.jobId, 'existing-1');
  const complete = { jobs: { get: async () => ({ state: 'completed', result: 'https://example.com/video.mp4' }) } };
  await waitForCampaign(complete, saved, { save: async () => {} }); assert.equal(saved.status, 'completed'); assert.equal(saved.videoUrl, 'https://example.com/video.mp4');
});
test('Failed accepted jobs remain inspectable and are never resubmitted', async () => {
  const saved = { jobId: 'failed-1' };
  await assert.rejects(waitForCampaign({ jobs: { get: async () => ({ state: 'failed', failedReason: 'Source failed' }) } }, saved, { save: async () => {} }), /Source failed/);
  assert.equal(saved.status, 'failed'); assert.equal(saved.jobId, 'failed-1');
});
