import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildProject,planCelebration} from './project.js';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const cfg=json('config.json'),rows=json('data/celebrations.json');
const plan=planCelebration(cfg,rows,[],new Date('2026-10-29T12:00:00Z'));
assert.deepEqual(buildProject(cfg,plan).payload,json('assets/sample-project.json'));
const workflow=json('n8n/workflow.json'),names=new Set(workflow.nodes.map(n=>n.name));
assert.equal(names.size,workflow.nodes.length);
for(const branches of Object.values(workflow.connections))for(const links of Object.values(branches))for(const group of links)for(const c of group)assert(names.has(c.node));
for(const n of workflow.nodes){assert(!n.credentials);if(n.type.includes('n8n-nodes-zvid'))assert.equal(n.type,'@zvid/n8n-nodes-zvid.zvid');if(n.type==='n8n-nodes-base.code')new Function(n.parameters.jsCode);}
assert.equal(cfg.dryRun,false);assert.equal(cfg.sendEmail,false);
console.log('Sample design, synchronized workflow graph, scoped nodes and credential hygiene passed.');
