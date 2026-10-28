import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workflow } from './workflow.js';
const names = new Set(workflow.nodes.map(n => n.name));
for (const node of workflow.nodes) {
  if (node.parameters.jsCode) new Function(node.parameters.jsCode);
  if (node.credentials) throw new Error(`Export contains credential references: ${node.name}`);
  if (node.type.includes('n8n-nodes-zvid') && !node.type.startsWith('@zvid/n8n-nodes-zvid.')) throw new Error('Invalid Zvid node type');
}
for (const ports of Object.values(workflow.connections)) for (const branches of Object.values(ports)) for (const branch of branches) for (const link of branch) if (!names.has(link.node)) throw new Error(`Missing node: ${link.node}`);
const provenance = JSON.parse(readFileSync(new URL('../data/workflow-source.json', import.meta.url), 'utf8'));
const digest = createHash('sha256').update(readFileSync(new URL('../n8n/workflow.json', import.meta.url))).digest('hex');
if (digest !== provenance.sha256) throw new Error('Workflow source digest does not match.');
const sample = JSON.parse(readFileSync(new URL('../data/sample-prepared.json', import.meta.url), 'utf8'));
if (!sample.payload.scenes?.length || !sample.meta.postTitle) throw new Error('Missing sample payload.');
console.log(`Checked ${workflow.nodes.length} nodes, connections, scoped package, sample and source digest.`);
