import {readFileSync} from 'node:fs';
const workflow=JSON.parse(readFileSync(new URL('../n8n/workflow.json',import.meta.url),'utf8'));
export function checkConfig(config){
  if(typeof config.dryRun!=='boolean')throw new Error('dryRun must be true or false');
  if(!Number.isInteger(config.maxPerRun)||config.maxPerRun<1||config.maxPerRun>100)throw new Error('maxPerRun must be an integer from 1 to 100');
  for(const k of ['pollSeconds','timeoutMinutes'])if(!Number.isFinite(config[k])||config[k]<=0)throw new Error(`${k} must be positive`);
  return config;
}
// Only the checked-in canonical nodes are executable. Never load a user-provided workflow.
function execute(name,inputs,context){
  const code=workflow.nodes.find(n=>n.name===name).parameters.jsCode;
  const lookup=n=>{if(!(n in context))throw new Error(`Unexpected node lookup: ${n}`);const a=Array.isArray(context[n])?context[n]:[context[n]];return {first:()=>({json:a[0]}),all:()=>a.map(json=>({json}))};};
  return new Function('$','$input',code)(lookup,{all:()=>inputs.map(json=>({json})),first:()=>({json:inputs[0]})}).map(i=>i.json);
}
async function probe(url,fetcher){
  if(!url)return {};
  if(!/^https:\/\//.test(url))return {statusCode:400};
  try{const r=await fetcher(url,{method:'HEAD',signal:AbortSignal.timeout(15000)});return {statusCode:r.status,headers:Object.fromEntries(r.headers)};}catch{return {};}
}
export async function buildLeads(rows,config,{offline=false,fetcher=fetch}={}){
  checkConfig(config);
  if(!Array.isArray(rows))throw new Error('Lead input must be a JSON array');
  const ids=new Set();for(const r of rows){if(!Number.isInteger(r.row_number)||r.row_number<2||ids.has(r.row_number))throw new Error('Every lead needs a unique integer row_number of at least 2');ids.add(r.row_number);}
  const selected=execute('Pick batch',rows,{Config:config});
  if(!selected[0].found)return {selection:selected,built:null};
  const probes=offline?selected.map(()=>({statusCode:404})):await Promise.all(selected.map(r=>probe(r.logoUrl,fetcher)));
  const music=offline?{statusCode:404}:await probe(config.musicUrl,fetcher);
  const built=execute('Build project JSON',[],{Config:config,'Pick batch':selected,'Check lead logos':probes,'Check music track':music})[0];
  return {selection:selected,built};
}
