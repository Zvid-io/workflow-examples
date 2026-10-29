import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workflow, buildCampaign } from './workflow.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const config = read('../config.json'), plan = buildCampaign(config, read('../data/jobs.json'), new Date('2026-10-25T12:00:00Z'));
assert.deepEqual(plan.payload, read('../assets/sample-project.json'));
assert.equal(config.dryRun, false);
assert.equal(JSON.parse(workflow.nodes.find(n => n.name === 'Set recruitment campaign defaults').parameters.jsonOutput).dryRun, false);
const names = new Set(workflow.nodes.map(n => n.name));
for (const [from, ports] of Object.entries(workflow.connections)) { assert(names.has(from)); for (const groups of Object.values(ports)) for (const edges of groups) for (const edge of edges) assert(names.has(edge.node)); }
for (const node of workflow.nodes) {
  assert(!node.credentials); assert(node.type.startsWith('n8n-nodes-base.') || node.type === '@zvid/n8n-nodes-zvid.zvid');
  if (node.type === 'n8n-nodes-base.httpRequest') assert(!String(node.parameters.url).includes('/api/render'));
}
const metadata = read('../assets/sample-output.json');
for (const [file, property] of [['sample-output.mp4', 'videoSha256'], ['sample-project.json', 'projectSha256'], ['sample-output.jpg', 'posterSha256']]) {
  assert.equal(createHash('sha256').update(readFileSync(new URL('../assets/' + file, import.meta.url))).digest('hex'), metadata[property]);
}
assert.equal(createHash('sha256').update(readFileSync(new URL('../n8n/workflow.json', import.meta.url))).digest('hex'), metadata.workflowSha256);
console.log('Exact sample parity, native node operations, no embedded credentials, connections and media hashes passed.');
