import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from './workflow.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const sample = build(config, null, new Date('2026-10-29T09:00:00Z'));
const out = path.resolve('out/sample');
mkdirSync(out, { recursive: true });
for (const [name, value] of [['project.json', sample.payload], ['source.json', sample.response.body], ['plan.json', sample.plan]]) {
  writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
}
writeFileSync(path.join(out, 'review.csv'), sample.reviewCsv);
console.log('Prepared the fixed illustrative 22-28 October 2026 example in out/sample. No network requests or render credits.');
