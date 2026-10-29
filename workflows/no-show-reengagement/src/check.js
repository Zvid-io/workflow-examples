import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from './workflow.js';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const built=prepare(json('config.json'),json('data/no-show.json'));
assert.deepEqual(built.payload,json('assets/sample-project.json'),'Sample must reproduce the real source project');
assert.equal(built.meta.firstName,'Maya');
assert.equal(built.meta.totalSeconds,15.07);
assert.equal(built.meta.hasMusic,false);
const workflow=json('n8n/workflow.json');
for(const node of workflow.nodes) {
  assert(!node.credentials,'No credentials allowed in published workflow');
  assert(!node.type.startsWith('CUSTOM.'),'No dev node prefixes');
}
assert.equal(JSON.parse(workflow.nodes.find(n=>n.name==='Config').parameters.jsonOutput).dryRun,false);
console.log('Recorded source project reproduced; synchronized n8n defaults and credential absence checked.');
