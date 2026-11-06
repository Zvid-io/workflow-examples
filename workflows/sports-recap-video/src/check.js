import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {review, project, workflow} from './workflow.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const config = read('../config.json'), input = read('../data/match.json');
const plan = review(config, input), payload = project(config, plan);
assert.equal(plan.ready, true); assert.equal(payload.scenes.length, 2);
assert.equal(payload.scenes.reduce((sum, scene) => sum + scene.duration, 0), 12);
assert.equal(plan.fact.home, 'Cedar FC'); assert.equal(plan.fact.homeScore, 3);
assert.equal(workflow.active, false);
for (const node of workflow.nodes) {
  assert.ok(!node.credentials, 'Export must contain no credential identifiers');
  if (node.type.includes('n8n-nodes-zvid')) assert.equal(node.type, '@zvid/n8n-nodes-zvid.zvid');
}
console.log('Exact approval, canonical two-scene project, inactive workflow and credential hygiene passed. No API calls.');
