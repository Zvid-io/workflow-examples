import fs from 'node:fs';
import assert from 'node:assert/strict';
import { workflow,buildPlan } from './workflow.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const config=read('../config.json'),rows=read('../data/workouts.json');
assert.equal(workflow.active,false);
const plan=buildPlan(config,rows,undefined,new Date('2026-10-29T12:00:00Z'));
assert.equal(plan.projects.length,2);
for(const n of workflow.nodes){if(n.type.includes('n8n-nodes-zvid'))assert.equal(n.type,'@zvid/n8n-nodes-zvid.zvid');assert(!n.credentials,'Export must not contain credentials');}
assert.deepEqual(plan.projects[0].payload,read('../assets/sample-project.json'));
assert.deepEqual(plan.projects[1].payload,read('../assets/sample-scaled-project.json'));
console.log('Workflow structure, clean credentials and matching sample projects checked.');
