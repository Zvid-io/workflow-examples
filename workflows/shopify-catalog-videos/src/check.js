import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildCatalog, checkConfig } from './workflow.js';

for (const file of readdirSync('src').filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', `src/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const workflow = JSON.parse(readFileSync('n8n/workflow.json'));
const raw = JSON.stringify(workflow);
if (/(?<!@zvid\/)n8n-nodes-zvid|CUSTOM\.|dashboard\.zvid\.io|zvid_[A-Za-z0-9]{20,}/.test(raw)) throw new Error('Unsafe workflow export');
const names = new Set(workflow.nodes.map(node => node.name));
if (names.size !== workflow.nodes.length) throw new Error('Duplicate node names');
for (const node of workflow.nodes) {
  if (node.credentials) throw new Error('Export must not contain credential references');
  if (node.type === 'n8n-nodes-base.httpRequest' && /api\.zvid\.io/.test(node.parameters.url || '')) throw new Error('Use native Zvid nodes');
}
const config = checkConfig(JSON.parse(readFileSync('config.json')));
const { built } = buildCatalog(JSON.parse(readFileSync('data/catalog.json')), config);
if (!built?.items.length) throw new Error('Sample catalog produced no render items');
console.log(`Syntax, workflow export and ${built.items.length} sample product checked`);
