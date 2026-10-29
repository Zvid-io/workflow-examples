import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildSale } from './workflow.js';
const read = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url)));
const items = buildSale(read('data/sale.json'), read('config.json'));
assert.equal(items.length, 2);
assert.equal(items[0].kind, 'video');
assert.equal(items[1].payload.type, 'image');
assert.equal(items[0].meta.discountPct, 39);
const workflow = read('n8n/workflow.json');
for (const node of workflow.nodes) {
  assert(!node.credentials, 'No credentials in the publishable export');
  if (node.type.includes('n8n-nodes-zvid')) assert.equal(node.type, '@zvid/n8n-nodes-zvid.zvid');
}
assert.equal(JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput).dryRun, false);
console.log('Sample video/banner build and export checks passed.');
