import { readFileSync } from 'node:fs';

const workflow=JSON.parse(readFileSync(new URL('../n8n/workflow.json',import.meta.url),'utf8'));
export const defaults=JSON.parse(workflow.nodes.find(n=>n.name==='Set weekly menu campaign rules').parameters.jsonOutput);
function source(name,stop){
  const code=workflow.nodes.find(n=>n.name===name)?.parameters.jsCode;
  if(!code||!code.includes(stop))throw new Error(`Bundled workflow does not contain expected node ${name}`);
  return code.slice(0,code.indexOf(stop));
}
// Run only reviewed functions from the bundled workflow, never input-provided code.
export const planMenu=new Function('cfg','rows','ledger','now',source('Balance available dishes across menu categories',"const cfg=$('Set weekly menu campaign rules')")+'\nreturn planRestaurant(cfg,rows,ledger,now);');
export const buildVideo=new Function('cfg','dishes',source('Build the selected weekly menu video','const plan=$json;')+'\nreturn buildProject(cfg,dishes);');
export const checkQuote=new Function('cfg','build','response',source('Enforce the campaign credit ceiling','const data=checkQuote(')+'\nreturn checkQuote(cfg,build,response);');
export function prepare(rows,config,ledger=[],now=new Date()){
  if(!Array.isArray(rows)||!Array.isArray(ledger))throw new Error('Menu and history must each be JSON arrays');
  if(rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Each menu row must be an object');
  if(!Number.isFinite(now.getTime()))throw new Error('Invalid campaign date');
  const plan=planMenu(config,rows,ledger,now);
  if(!plan.ready||plan.jobId)return plan;
  const built=buildVideo({...config,weekLabel:plan.weekLabel,fallbackDishPhotos:[]},plan.dishes);
  return {...plan,...built};
}
export function checkConfig(config){
  for(const key of ['pollSeconds','timeoutMinutes','maxCreditsPerVideo'])if(!Number.isFinite(config[key])||config[key]<=0)throw new Error(`${key} must be positive`);
  if(!/^https:\/\//i.test(config.sizzleVideo||''))throw new Error('sizzleVideo must be a public HTTPS video URL');
  return config;
}
export function csvRows(plan){
  const rows=(plan.posts||[]).map(p=>({CampaignKey:plan.campaignKey,VideoUrl:plan.videoUrl||'',Date:p.date,Purpose:p.purpose,Caption:p.caption,ReviewStatus:p.reviewStatus}));
  const keys=['CampaignKey','VideoUrl','Date','Purpose','Caption','ReviewStatus'];
  const cell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return [keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n')+'\r\n';
}
