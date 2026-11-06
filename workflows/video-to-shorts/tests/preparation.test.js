import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { prepareWithJournal } from '../src/preparation.js';
import { prepareLive, defaults, assertResumableState } from '../src/workflow.js';

test('a paid preparation failure saves its transcript and blocks an accidental repeat', async () => {
  const testRoot = path.resolve('out/test-artifacts');
  mkdirSync(testRoot, { recursive: true });
  const directory = mkdtempSync(path.join(testRoot, 'preparation-'));
  let calls = 0;
  try {
    const prepare = async ({ checkpoint }) => {
      assert(existsSync(path.join(directory, 'preparation-status.json')));
      calls++;
      checkpoint('transcript', { words: [{ text: 'Retained', start: 0, end: 1 }] });
      throw new Error('downstream builder failed');
    };
    await assert.rejects(prepareWithJournal({ directory, prepare }), /downstream builder/);
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'preparation-status.json'))).state, 'interrupted');
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'transcript.json'))).words[0].text, 'Retained');
    await assert.rejects(prepareWithJournal({ directory, prepare }), /already records a preparation attempt/);
    assert.equal(calls, 1);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), testRoot);
    rmSync(directory, { recursive: true });
  }
});

test('live preparation journals a successful speech response before parsing can fail', async () => {
  const events = [];
  let calls = 0;
  const request = async () => {
    calls++;
    if (calls === 1) return new Response(new Uint8Array(20), { headers: { 'content-type': 'video/mp4' } });
    if (calls === 2) {
      assert.equal(events[0].phase, 'transcription-requested');
      return Response.json({ words: [], transcription_id: 'example-transcription' });
    }
    throw new Error('The model must not run after invalid transcript');
  };
  await assert.rejects(prepareLive({ config: defaults, input: { videoUrl: 'https://cdn.zvid.io/example.mp4' }, elevenLabsKey: 'example', openRouterKey: 'example', request,
    checkpoint: (phase, data) => events.push({ phase, data }),
  }), /0 usable words/);
  assert.equal(calls, 2);
  assert.equal(events[1].phase, 'transcript');
  assert.equal(events[1].data.transcription_id, 'example-transcription');
});

test('resume stops on ambiguous or wholly unsubmitted work', () => {
  assert.throws(() => assertResumableState({ clips: [{ status: 'submitting' }] }), /no confirmed job ID/);
  assert.throws(() => assertResumableState({ clips: [{ status: 'prepared' }] }), /No accepted jobs/);
  assert.doesNotThrow(() => assertResumableState({ clips: [{ status: 'submitted', jobId: 'example-job' }] }));
});
