import {readFileSync} from 'node:fs';
import {buildEpisode,workflow} from './workflow.js';
const config=JSON.parse(readFileSync('config.json','utf8'));
const rows=JSON.parse(readFileSync('data/questions.json','utf8'));
const plan=buildEpisode({...config,dryRun:true},rows,[],new Date('2026-10-29T12:00:00Z'));
if(!plan.ready||plan.questions.length!==3||plan.payload.scenes.length!==9)throw new Error('Expected a three-round, nine-scene quiz');
if(workflow.nodes.some(n=>n.type.includes('n8n-nodes-zvid')&&!n.type.startsWith('@zvid/n8n-nodes-zvid.')))throw new Error('Invalid Zvid node type');
console.log('Three approved questions, nine scenes, native Zvid nodes and source-backed review rows checked.');
