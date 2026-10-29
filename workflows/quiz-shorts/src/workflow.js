import {readFileSync} from 'node:fs';
export const workflow=JSON.parse(readFileSync(new URL('../n8n/workflow.json',import.meta.url),'utf8'));
const node=name=>{const n=workflow.nodes.find(n=>n.name===name);if(!n)throw new Error('Missing workflow node: '+name);return n.parameters.jsCode;};
const planCode=node('Select an easy medium and hard question');
const planQuiz=new Function(planCode.slice(0,planCode.lastIndexOf('return [{json:planQuiz'))+';return planQuiz;')();
const buildCode=node('Build the three-round quiz episode');
const buildProject=new Function(buildCode.split('// === late-series glue ===')[0]+';return buildProject;')();
export function buildEpisode(config,rows,logs=[],now=new Date()){
  if(!Array.isArray(rows)||!Array.isArray(logs))throw new Error('Questions and history must be arrays');
  if(config.musicUrl)throw new Error('This companion uses silent output; leave musicUrl empty');
  for(const key of ['maxCreditsPerVideo','pollSeconds','timeoutMinutes'])if(!Number.isFinite(config[key])||config[key]<=0)throw new Error(key+' must be positive');
  if(!Number.isInteger(config.episodeRevision)||config.episodeRevision<1)throw new Error('episodeRevision must be a positive integer');
  if(!Number.isFinite(now.getTime()))throw new Error('Invalid run date');
  const plan=planQuiz(config,rows,logs,now);
  if(!plan.ready||plan.jobId)return plan;
  const parts=plan.questions.map(q=>buildProject({...config,musicUrl:''},{...q,music:{ok:false}}));
  const scenes=parts.flatMap((p,i)=>p.payload.scenes.map(s=>({...s,id:'round-'+(i+1)+'-'+s.id,...(s.transitionId?{transitionId:'round-'+(i+1)+'-'+s.transitionId}:{})})));
  return {...plan,payload:{...parts[0].payload,name:'quiz-'+plan.date,scenes,audios:[]},meta:{rounds:parts.map(p=>p.meta)}};
}
export function reviewCsv(rows){
  const columns=Object.keys(rows[0]||{});
  const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return [columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
}
