import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunner, defaults, buildFromResponses, readBounded, checkBudget, validateProjects, submitClip } from '../src/workflow.js';

const input = { videoUrl: 'https://cdn.zvid.io/example.mp4', title: 'Example', layout: 'fit' };
const transcript = { words: Array.from({ length: 100 }, (_, i) => ({ text: `word${i}`, start: i * 0.4, end: i * 0.4 + 0.3, type: 'word' })) };
test('reject watch pages and insecure URLs before any paid service', () => {
  for (const videoUrl of ['https://youtu.be/12345678901', 'https://www.youtube.com/watch?v=x', 'http://example.com/a.mp4']) {
    assert.throws(() => createRunner().run('Video request', { videoUrl }));
  }
});
test('Google Drive share link normalization preserves the file identifier', () => {
  assert.equal(createRunner().run('Video request', { videoUrl: 'https://drive.google.com/file/d/abcdefghijk/view' })[0].json.videoUrl,
    'https://drive.google.com/uc?export=download&id=abcdefghijk');
});
test('transcript must contain usable timed words', () => {
  const runner = createRunner(); runner.run('Video request', input);
  assert.throws(() => runner.run('Read transcript', { words: transcript.words.slice(0, 5) }), /5 usable words/);
});
test('invalid model output falls back, and captions stay within each clip', () => {
  const result = buildFromResponses({ config: { ...defaults, clipCount: 2 }, input, transcript, highlights: {} });
  assert.equal(result.projects.length, 2);
  for (const project of result.projects) {
    assert.equal(project.meta.layout, 'fit');
    assert(project.meta.seconds > 4);
    assert(project.meta.seconds <= 40.75);
    assert(!JSON.stringify(project).includes('NaN'));
  }
});
test('model ranges cannot create overlapping source windows beyond boundary padding', () => {
  const result = buildFromResponses({ config: defaults, input, transcript, highlights: { choices: [{ message: { content: JSON.stringify({ clips: [{ startWord: 0, endWord: 70 }, { startWord: 30, endWord: 90 }] }) } }] } });
  assert.equal(result.projects.length, 1);
});
test('bounded reader refuses oversized responses before transcription', async () => {
  await assert.rejects(readBounded(new Response(new Uint8Array(20), { headers: { 'content-type': 'video/mp4' } }), 10), /exceeded/);
  await assert.rejects(readBounded(new Response('<html>', { headers: { 'content-type': 'text/html' } }), 100), /HTML/);
});
test('credit cap covers the complete batch before the first submission', () => {
  assert.equal(checkBudget([23, 24], 47), 47);
  assert.throws(() => checkBudget([23, 24], 46), /No jobs submitted/);
  assert.throws(() => checkBudget([23], Number.NaN), /positive limit/);
});
test('validation rejection cannot become a render quote', async () => {
  const client = { authoring: { validate: async () => ({ valid: false, errors: ['bad input'] }) } };
  await assert.rejects(validateProjects(client, [{ payload: {} }]), /rejected/);
});
test('persist submission intent before network and accepted job before polling', async () => {
  const statuses = [], state = {};
  await submitClip({ client: { renders: { create: async () => { assert.deepEqual(statuses, ['submitting']); return { jobId: 'example-job' }; } } }, project: { payload: {} }, state, save: () => statuses.push(state.status) });
  assert.deepEqual(statuses, ['submitting', 'submitted']); assert.equal(state.jobId, 'example-job');
});
test('ambiguous submission error is retained and never retried automatically', async () => {
  let calls = 0; const state = {};
  await assert.rejects(submitClip({ client: { renders: { create: async () => { calls++; throw new Error('timeout'); } } }, project: { payload: {} }, state, save: () => {} }), /timeout/);
  assert.equal(calls, 1); assert.equal(state.status, 'submitting'); assert.equal(state.jobId, undefined);
});
test('frozen sample contains the exact project used for the included rendered output', () => {
  const read = file => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url)));
  assert.deepEqual(read('data/sample-prepared.json').projects[0].payload, read('assets/sample-project.json'));
  assert.equal(read('assets/sample-output.json').duration, 22.87);
});
