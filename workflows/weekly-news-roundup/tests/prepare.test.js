import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEdition } from '../src/prepare.js';
import { defaults, buildEdition } from '../src/workflow.js';

function preparationHarness({ stockFails = false, voiceFails = false } = {}) {
  const saved = new Map(), warnings = [];
  const counts = { curation: 0, speech: 0, uploads: 0, videoSearches: 0, audioSearches: 0 };
  const stories = Array.from({ length: 5 }, (_, i) => ({
    index: i + 1, headline: `Engineering update ${i + 1}`,
    blurb: 'The product team shared a practical update this week, explaining its design choices and the next steps for careful testing.',
    visualQuery: 'office design team',
  }));
  const rundown = { intro: 'Here are the five engineering updates for this week.', outro: 'Follow the next edition for more carefully reviewed team updates.', musicTag: 'calm', stories };
  const feedUrl = 'https://example.org/test-feed.xml';
  const config = { ...defaults, feedUrls: [feedUrl] };
  const fetchImpl = async (url, options = {}) => {
    if (url === feedUrl) return new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>Test digest</title><link>https://example.org/</link><description>Synthetic fixture</description>${stories.map((s, i) => `<item><title>${s.headline}</title><link>https://example.org/update-${i + 1}</link><description>Approved synthetic engineering update.</description></item>`).join('')}</channel></rss>`, { headers: { 'Content-Type': 'application/rss+xml' } });
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      counts.curation++;
      assert.equal(options.method, 'POST');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(rundown) } }] }));
    }
    if (String(url).startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
      counts.speech++;
      assert.equal(options.method, 'POST');
      assert.match(url, /\/with-timestamps\?/);
      if (voiceFails) return new Response('{}', { status: 503 });
      const chars = [...JSON.parse(options.body).text];
      return new Response(JSON.stringify({ audio_base64: 'eA==', alignment: {
        characters: chars,
        character_start_times_seconds: chars.map((_, i) => i * 0.04),
        character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.04),
      } }));
    }
    if (options.method === 'HEAD' && url === `${config.apiUrl}/healthz`) return new Response(null, { status: 200 });
    throw new Error(`Unexpected mocked request: ${url}`);
  };
  const client = {
    request: async (method, route, options) => {
      assert.equal(method, 'GET'); assert.equal(route, '/api/stock/search');
      counts[options.query.type === 'video' ? 'videoSearches' : 'audioSearches']++;
      if (stockFails) throw new Error('Service failure with private-key and private-url details');
      return { items: [] };
    },
    uploads: { create: async (blob, options) => {
      counts.uploads++; assert.equal(blob.type, 'audio/mpeg'); assert.equal(blob.size, 1);
      assert.equal(options.fileName, 'voiceover.mp3');
      return { url: 'https://cdn.zvid.io/test/fixture-voice.mp3' };
    } },
  };
  return { config, counts, saved, warnings, invoke: () => prepareEdition({
    config, client, keys: { OPENROUTER_API_KEY: 'test', ELEVENLABS_API_KEY: 'test' }, fetchImpl,
    save: (name, value) => saved.set(name, structuredClone(value)), warn: message => warnings.push(message),
  }) };
}

test('live preparation contract uses one speech request and produces a buildable edition', async () => {
  const h = preparationHarness();
  const edition = await h.invoke();
  assert.equal(h.counts.curation, 1); assert.equal(h.counts.speech, 1); assert.equal(h.counts.uploads, 1);
  assert.equal(h.counts.videoSearches, 5); assert.ok(h.counts.audioSearches > 0);
  assert.deepEqual(edition.sceneMedia, [null, null, null, null, null]);
  assert.equal(edition.music, null); assert.deepEqual(edition.warnings, []);
  assert.equal(edition.timings.words.length, edition.rundown.wordCount);
  assert.equal(h.saved.get('preparation-status.json').state, 'prepared');
  const built = buildEdition(h.config, edition);
  assert.equal(built.meta.storyCount, 5); assert.equal(built.payload.scenes.length, 7);
  assert.equal(built.payload.audios[0].src, edition.upload.url);
  assert.ok(built.payload.subtitle.captions.length > 0);
});

test('optional stock failures preserve preparation, with safe deduplicated warnings', async () => {
  const h = preparationHarness({ stockFails: true });
  const edition = await h.invoke();
  assert.equal(h.counts.curation, 1); assert.equal(h.counts.speech, 1); assert.equal(h.counts.uploads, 1);
  assert.deepEqual(edition.sceneMedia, [null, null, null, null, null]); assert.equal(edition.music, null);
  assert.equal(h.warnings.length, 2); assert.deepEqual(edition.warnings, h.warnings);
  assert.deepEqual(h.saved.get('preparation-warnings.json'), h.warnings);
  assert.doesNotMatch(h.warnings.join(' '), /private-key|private-url/);
  assert.equal(buildEdition(h.config, edition).meta.missingClips, 5);
});

test('speech failure is not retried or reported as prepared', async () => {
  const h = preparationHarness({ voiceFails: true });
  await assert.rejects(h.invoke(), /HTTP 503/);
  assert.equal(h.counts.curation, 1); assert.equal(h.counts.speech, 1); assert.equal(h.counts.uploads, 0);
  assert.equal(h.saved.get('preparation-status.json').state, 'voice-pending');
  assert.ok(h.saved.has('rundown.json')); assert.equal(h.saved.has('edition.json'), false);
});
