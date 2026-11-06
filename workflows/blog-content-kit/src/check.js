import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workflow } from './workflow.js';
const names = new Set(workflow.nodes.map(n => n.name));
if (names.size !== workflow.nodes.length) throw new Error('Duplicate node names.');
for (const node of workflow.nodes) {
  if (node.parameters.jsCode) new Function(node.parameters.jsCode);
  if (node.credentials) throw new Error(`Export contains credential references: ${node.name}`);
  if (node.type.includes('n8n-nodes-zvid') && !['@zvid/n8n-nodes-zvid.zvid', '@zvid/n8n-nodes-zvid.zvidTrigger'].includes(node.type)) throw new Error('Invalid Zvid node type.');
}
for (const ports of Object.values(workflow.connections)) for (const branches of Object.values(ports)) for (const branch of branches) for (const link of branch) if (!names.has(link.node)) throw new Error(`Missing node: ${link.node}`);
const provenance = JSON.parse(readFileSync(new URL('../data/workflow-source.json', import.meta.url), 'utf8'));
const digest = createHash('sha256').update(readFileSync(new URL('../n8n/workflow.json', import.meta.url))).digest('hex');
if (digest !== provenance.sha256) throw new Error('Workflow source digest mismatch.');
const sample = JSON.parse(readFileSync(new URL('../data/sample-prepared.json', import.meta.url), 'utf8'));
if (sample.pieces.length !== 3 || !sample.post.title) throw new Error('Missing prepared sample.');
console.log(`Checked ${workflow.nodes.length} nodes, connections, source digest and three-piece sample.`);
