import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const workflow=JSON.parse(readFileSync(new URL('../n8n/workflow.json',import.meta.url),'utf8'));
export function execute(name,inputs,context={},store={}) {
  const code=workflow.nodes.find(n=>n.name===name)?.parameters.jsCode;
  if(!code)throw new Error(`Missing checked-in node: ${name}`);
  const wrap=json=>({json});
  const lookup=key=>({first:()=>wrap(context[key]),all:()=>[wrap(context[key])]});
  return new Function('$','$input','$getWorkflowStaticData',code)(lookup,{first:()=>wrap(inputs[0]),all:()=>inputs.map(wrap)},()=>store).map(x=>x.json);
}
export function checkInputs(config,events) {
  if(config.source!=='sheet')throw new Error('This Node.js companion accepts local event rows only; use n8n for Sheets or Eventbrite connections');
  for(const key of ['maxRendersPerRun','firstReminderDays','pollSeconds','timeoutMinutes'])if(!Number.isFinite(config[key])||config[key]<=0)throw new Error(`${key} must be positive`);
  if(!Number.isInteger(config.maxRendersPerRun)||!Number.isInteger(config.firstReminderDays)||config.firstReminderDays<2)throw new Error('Render limit and reminder days must be integers; reminder days must be at least 2');
  if(!Number.isFinite(config.timezoneOffsetHours)||Math.abs(config.timezoneOffsetHours)>14)throw new Error('timezoneOffsetHours must be between -14 and 14');
  if(config.musicUrl)throw new Error('This companion uses silent output; leave musicUrl empty');
  if(!Array.isArray(events))throw new Error('Input must be an array of event rows');
  const seen=new Set();
  const validDate=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/.exec(value);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3];};
  if(config.todayOverride&&!/^\d{4}-\d{2}-\d{2}$/.test(config.todayOverride))throw new Error('todayOverride must be YYYY-MM-DD or empty');
  if(config.todayOverride&&!validDate(config.todayOverride))throw new Error('todayOverride must be a real calendar date');
  for(const row of events){
    if(!row?.EventName?.trim()||!validDate(row.DateISO))throw new Error('Each event needs EventName and a real DateISO in YYYY-MM-DD or YYYY-MM-DDTHH:mm form');
    const key=eventKey(row);if(seen.has(key))throw new Error('Duplicate event name and date in input');seen.add(key);
    for(const field of ['ImageUrl','TicketUrl'])if(row[field]&&!/^https:\/\//.test(row[field]))throw new Error(`${field} must use HTTPS`);
  }
}
export const eventKey=row=>String(row.EventName).replace(/\s+/g,' ').trim()+'|'+String(row.DateISO).trim();
export const jobKey=(key,kind)=>createHash('sha256').update(key+'|'+kind).digest('hex').slice(0,20);
export function buildDue(config,events,state={jobs:{}}) {
  checkInputs(config,events);
  const rows=events.map((event,i)=>{
    const row={...event,row_number:i+2};
    for(const job of Object.values(state.jobs||{}))if(job.eventKey===eventKey(event)&&job.state==='completed'){
      row.Status=config.statusValue||'promoted';row[{promo:'PromoUrl','7day':'Video7d','1day':'Video1d'}[job.kind]]=job.videoUrl;
    }
    return row;
  });
  const selection=execute('Which renders today?',rows,{Config:config});
  if(!selection[0]?.due)return {selection,projects:[]};
  const projects=execute('Build project JSON',selection,{Config:config,'Music guard':{musicUrl:'',musicNote:'Silent sample'}});
  return {selection,projects:projects.map(project=>({...project,key:jobKey(project.meta.eventKey,project.meta.kind)}))};
}
