import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { workflow, checkConfig, buildEdition } from './workflow.js';
for (const file of ['src/index.js','src/workflow.js','src/prepare.js','src/render.js']) {
  if (spawnSync(process.execPath,['--check',file],{stdio:'inherit'}).status !== 0) process.exit(1);
}
const names = new Set(workflow.nodes.map(n=>n.name));
if (names.size !== workflow.nodes.length) throw new Error('Duplicate workflow nodes');
for (const [name, outputs] of Object.entries(workflow.connections)) {
  if (!names.has(name)) throw new Error(`Missing connection source ${name}`);
  for (const group of Object.values(outputs)) for (const targets of group) for (const edge of targets) if (!names.has(edge.node)) throw new Error(`Missing target ${edge.node}`);
}
for (const n of workflow.nodes) {
  if (n.type.includes('n8n-nodes-zvid') && !['@zvid/n8n-nodes-zvid.zvid','@zvid/n8n-nodes-zvid.zvidTrigger'].includes(n.type)) throw new Error('Invalid Zvid node type');
  if (n.credentials) throw new Error('Export includes credentials');
  if (n.parameters.jsCode) new Function('$','$input',n.parameters.jsCode);
}
const config = checkConfig(JSON.parse(readFileSync('config.json','utf8')));
const sample = buildEdition(config,JSON.parse(readFileSync('data/edition.json','utf8')));
if (!sample.payload.scenes.length || sample.meta.storyCount !== 5) throw new Error('Invalid five-story sample');
console.log('Source, workflow connections, scoped nodes and sample build checked.');
