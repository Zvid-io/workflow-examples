import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, checkedQuote, composeDraft, DRAFT_TOOLS, unpack, waitForVideo } from '../src/agent.js';
const quote = () => ({ kind: 'draft', draftId: 'prj_example', quoteToken: 'example-signed-quote-token', estimatedCredits: 12, quoteExpiresAt: new Date(Date.now() + 60000).toISOString() });
const state = () => ({ quote: quote(), idempotencyKey: '00000000-0000-4000-8000-000000000000' });

test('unpacks actual MCP text content and rejects tool errors', () => {
  assert.equal(unpack({ content: [{ type: 'text', text: JSON.stringify(quote()) }] }).estimatedCredits, 12);
  assert.throws(() => unpack({ isError: true }), /error/);
});
test('rejects missing, excessive and invalid quote prices', () => {
  assert.throws(() => checkedQuote({}, 25), /saved draft/);
  assert.throws(() => checkedQuote({ ...quote(), estimatedCredits: 26 }, 25), /ceiling/);
  assert.throws(() => checkedQuote({ ...quote(), estimatedCredits: NaN }, 25), /ceiling/);
});
test('render needs explicit approval, an unspent folder and unexpired quote', () => {
  assert.throws(() => canSubmit(state(), false, 25), /--approve/);
  assert.throws(() => canSubmit({ ...state(), submissionAttempted: true }, true, 25), /submission/);
  assert.throws(() => canSubmit({ ...state(), jobId: 'accepted' }, true, 25), /submission/);
  assert.throws(() => canSubmit({ ...state(), quote: { ...quote(), quoteExpiresAt: 1 } }, true, 25), /expired/);
  assert.equal(canSubmit(state(), true, 25).idempotencyKey, state().idempotencyKey);
});
test('draft model never receives a render tool and cannot call it anyway', async () => {
  assert.equal(DRAFT_TOOLS.has('render_media'), false);
  let invoked = false;
  await assert.rejects(composeDraft({ brief: 'video', availableTools: [{ name: 'render_media', inputSchema: {} }], callTool: async () => { invoked = true; }, complete: async (_, tools) => {
    assert.equal(tools.length, 0);
    return { role: 'assistant', tool_calls: [{ id: '1', function: { name: 'render_media', arguments: '{}' } }] };
  } }), /allowlist/);
  assert.equal(invoked, false);
});
test('drafting stops once a real tool returns a signed draft', async () => {
  let count = 0;
  const result = await composeDraft({ brief: 'FocusFlow', availableTools: [{ name: 'create_media', inputSchema: {} }], callTool: async () => { count++; return { content: [{ type: 'text', text: JSON.stringify(quote()) }] }; }, complete: async () => ({ role: 'assistant', tool_calls: [{ id: '1', function: { name: 'create_media', arguments: '{}' } }] }) });
  assert.equal(result.draftId, 'prj_example'); assert.equal(count, 1);
});
test('resumes the same job and only returns a completed allowed URL', async () => {
  let count = 0;
  const client = { jobs: { get: async id => { assert.equal(id, 'saved'); return count++ ? { state: 'completed', result: 'https://cdn.zvid.io/videos/sample.mp4' } : { state: 'active' }; } } };
  assert.equal(await waitForVideo(client, 'saved', { sleep: async () => {} }), 'https://cdn.zvid.io/videos/sample.mp4');
  assert.equal(count, 2);
  await assert.rejects(waitForVideo({ jobs: { get: async () => ({ state: 'completed', result: 'https://cdn.zvid.io/examples/demo.mp4' }) } }, 'saved'), /permitted/);
  await assert.rejects(waitForVideo({ jobs: { get: async () => ({ state: 'failed' }) } }, 'saved'), /failed/);
});
test('poll timeout preserves the existing job route', async () => {
  let time = 0;
  await assert.rejects(waitForVideo({ jobs: { get: async () => ({ state: 'active' }) } }, 'saved', { now: () => time++, timeoutMs: 0 }), /status/);
});
