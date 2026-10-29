import { readFileSync } from 'node:fs';
import { buildCatalog, defaults } from './workflow.js';
const config={...defaults,...JSON.parse(readFileSync('config.json','utf8'))};
const {built}=buildCatalog(JSON.parse(readFileSync('data/catalog.json','utf8')),config);
if(!built?.items.length)throw new Error('Sample input selected no products');
console.log(`Built ${built.items.length} product payload(s); ${built.meta.approxVideoSeconds} seconds each. No API calls or credits.`);
