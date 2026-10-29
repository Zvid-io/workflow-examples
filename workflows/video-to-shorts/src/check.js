import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workflow, createRunner, defaults } from './workflow.js';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url));
const sample = JSON.parse(read('assets/sample-output.json'));
assert.equal(createHash('sha256').update(read('n8n/workflow.json')).digest('hex'), sample.workflowSha256);
assert.equal(createHash('sha256').update(read('assets/sample-output.mp4')).digest('hex'), sample.videoSha256);
assert.equal(defaults.dryRun, false);
assert.equal(new Set(workflow.nodes.map(n => n.name)).size, workflow.nodes.length);
for (const node of workflow.nodes) {
  assert(!node.credentials, 'Export must not include account credentials');
  if (node.parameters.jsCode) new Function('$', '$input', node.parameters.jsCode);
}
assert.equal(createRunner().run('Video request', JSON.parse(read('data/input.json')))[0].json.layout, 'fit');
const prepared = JSON.parse(read('data/sample-prepared.json'));
assert.deepEqual(prepared.projects[0].payload, JSON.parse(read('assets/sample-project.json')));
console.log('Checked workflow structure, sample hashes, defaults and reproducible prepared project. No network calls.');
