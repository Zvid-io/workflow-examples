import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProject } from './project.js';
const json=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const built=buildProject(json('config.json'),json('data/signup.json'));
assert.deepEqual(built.payload,json('assets/sample-project.json'));
const w=json('n8n/workflow.json');
const names=new Set(w.nodes.map(n=>n.name));
assert.equal(names.size,w.nodes.length);
for(const branches of Object.values(w.connections))for(const links of Object.values(branches))for(const group of links)for(const c of group)assert(names.has(c.node));
for(const n of w.nodes){
  assert(!n.credentials,`Credential in ${n.name}`);
  if(n.type.includes('n8n-nodes-zvid'))assert.equal(n.type,'@zvid/n8n-nodes-zvid.zvid');
  if(n.type==='n8n-nodes-base.code')new Function(n.parameters.jsCode);
}
assert.equal(json('config.json').dryRun,false);
console.log('Sample project matches the recorded render; workflow connections, code and credential hygiene passed.');
