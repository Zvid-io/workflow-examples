import { readFileSync } from 'node:fs';
import { build,workflow } from './workflow.js';
const j=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
for(const n of workflow.nodes) {
  if(n.type.includes('n8n-nodes-zvid')&&!['@zvid/n8n-nodes-zvid.zvid','@zvid/n8n-nodes-zvid.zvidTrigger'].includes(n.type))throw new Error('Incorrect Zvid node prefix');
  if(n.type==='n8n-nodes-base.code')new Function('$','$input',n.parameters.jsCode);
}
const {payload,meta}=build(j('../config.json'),j('../data/metrics.json'));
if(meta.statCount!==4||payload.scenes.length!==6)throw new Error('Unexpected sample shape');
console.log(JSON.stringify({statCount:meta.statCount,seconds:meta.totalDurationSec,scenes:payload.scenes.length}));
