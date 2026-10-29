import {readFileSync} from 'node:fs';import {buildLeads} from './workflow.js';
const json=f=>JSON.parse(readFileSync(new URL(f,import.meta.url),'utf8'));
const {built}=await buildLeads(json('../data/leads.json'),json('../config.json'),{offline:true});
if(built.items.length!==1||built.payload.width!==1920||built.payload.height!==1080)throw new Error('Unexpected example shape');
console.log('Fictional lead maps to one landscape video; no API calls or render credits.');
