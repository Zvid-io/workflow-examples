import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const workflow=JSON.parse(fs.readFileSync(new URL('../n8n/workflow.json',import.meta.url),'utf8'));
const node=name=>workflow.nodes.find(n=>n.name===name);
const selectCode=node('Select approved standard and scaled workouts').parameters.jsCode;
const selectWorkout=new Function(selectCode.slice(0,selectCode.lastIndexOf('\nreturn selectWorkout('))+'\nreturn selectWorkout;')();
const buildCode=node('Build selected workout variant scenes').parameters.jsCode;
const buildProject=new Function(buildCode.slice(buildCode.indexOf('function buildProject'),buildCode.indexOf('\nconst { payload, meta }'))+'\nreturn buildProject;')();
export const jobKey=(key,variant)=>createHash('sha256').update(key+'|'+variant).digest('hex').slice(0,24);
export function checkInputs(config,rows){
  if(!Array.isArray(rows))throw Error('Input must be a JSON array of workout rows');
  for(const field of ['pollSeconds','timeoutMinutes','maxCreditsPerVideo'])if(!Number.isFinite(config[field])||config[field]<=0)throw Error(field+' must be positive');
  for(const field of ['dryRun','fallbackToLatest'])if(typeof config[field]!=='boolean')throw Error(field+' must be true or false');
  new Intl.DateTimeFormat('en',{timeZone:config.timezone}).format(new Date());
  if(!/^https:\/\//.test(config.heroVideo||''))throw Error('heroVideo must be an HTTPS URL');
  if(config.musicUrl&&!/^https:\/\//.test(config.musicUrl))throw Error('musicUrl must be blank or an HTTPS URL');
}
export function buildPlan(config,rows,state={jobs:{}},now=new Date()){
  checkInputs(config,rows);
  const combined=rows.map(row=>{
    const copy={...row};
    for(const variant of ['Standard','Scaled']){
      const saved=state.jobs[jobKey(row.WorkoutKey,variant)];
      if(!saved)continue;
      copy[variant+'Status']=saved.state==='completed'?'completed':saved.state==='rejected'?'':saved.jobId?'rendering':'submitting';
      copy[variant+'JobId']=saved.jobId||'';
      copy[variant+'VideoUrl']=saved.videoUrl||'';
      copy[variant+'Credits']=saved.creditsQuoted||'';
      copy[variant+'Caption']=saved.caption||'';
    }
    return copy;
  });
  const selection=selectWorkout(config,combined,now);
  const tasks=selection.filter(t=>t.pendingCount>0);
  const projects=tasks.filter(t=>!t.jobId).map(task=>{
    const built=buildProject(config,task);
    return {key:jobKey(task.key,task.variant),workoutKey:task.key,variant:task.variant,dateIso:task.dateIso,...built};
  });
  return {selection,projects,resumeKeys:tasks.filter(t=>t.jobId).map(t=>jobKey(t.key,t.variant))};
}
