import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDue,workflow } from './workflow.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const built=buildDue(read('../config.json'),read('../data/events.json'));
assert.equal(built.projects.length,1);assert.equal(built.projects[0].meta.kind,'promo');
const names=new Set(workflow.nodes.map(n=>n.name));
for(const [from,ports] of Object.entries(workflow.connections)){assert(names.has(from));for(const groups of Object.values(ports))for(const edges of groups)for(const edge of edges)assert(names.has(edge.node));}
for(const n of workflow.nodes){assert(!n.credentials);assert(n.type.startsWith('n8n-nodes-base.')||n.type==='@zvid/n8n-nodes-zvid.zvid');if(n.type==='n8n-nodes-base.httpRequest')assert(!String(n.parameters.url).includes('/api/render'));}
assert.equal(JSON.parse(workflow.nodes.find(n=>n.name==='Config').parameters.jsonOutput).dryRun,false);
assert.deepEqual(built.projects[0].payload,read('../assets/sample-project.json'));
console.log('Structure, credentials, native Zvid operations, sample mapping and project parity passed.');
