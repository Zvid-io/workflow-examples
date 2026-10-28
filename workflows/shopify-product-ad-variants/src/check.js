import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWorkflow, readWorkflowConfig, loadFixture, createPlan, createRenderPayload } from './planner.js';
const { workflow, byName } = await loadWorkflow();
assert.equal(workflow.active, false, 'The imported schedule must be inactive');
for (const node of workflow.nodes) {
  if (node.type.includes('n8n-nodes-zvid')) assert.ok(node.type.startsWith('@zvid/n8n-nodes-zvid.'));
  if (node.type === 'n8n-nodes-base.httpRequest') assert.ok(!String(node.parameters.url).includes('api.zvid.io/api/render'), 'Use native Zvid nodes');
}
const config = { ...readWorkflowConfig(byName), ...JSON.parse(readFileSync('config.json','utf8')) };
const plan = await createPlan({ byName, config, shopifyResponse: await loadFixture() });
const build = await createRenderPayload({ byName, config, plan });
assert.equal(build.items.length, 1);
assert.equal(build.payload.resolution, 'instagram-post');
assert.equal(config.deliveryWebhookUrl, '');
console.log('Bundled workflow, scoped Zvid nodes, one-ad default and offline planner verified.');
