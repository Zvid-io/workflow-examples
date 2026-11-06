import { readFileSync } from 'node:fs';
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url),'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n=>n.name==='Config').parameters.jsonOutput);
export function execute(name, input, context={}) {
  const code=workflow.nodes.find(n=>n.name===name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing checked-in node ${name}`);
  const wrap=json=>({json});
  const lookup=key=>{if(!(key in context))throw new Error(`Missing ${key}`);return {first:()=>wrap(context[key])};};
  return new Function('$','$input',code)(lookup,{first:()=>wrap(input),all:()=>[wrap(input)]})[0].json;
}
export function build(config, input) {
  for(const k of ['introSeconds','statSeconds','outroSeconds','pollSeconds','timeoutMinutes']) if(!Number.isFinite(config[k])||config[k]<=0)throw new Error(`${k} must be positive`);
  if(!Number.isInteger(config.maxStats)||config.maxStats<1||config.maxStats>20)throw new Error('maxStats must be an integer from 1 to 20');
  if(!Number.isFinite(config.transitionSeconds)||config.transitionSeconds<0||config.transitionSeconds>=Math.min(config.introSeconds,config.statSeconds,config.outroSeconds))throw new Error('transitionSeconds must be shorter than every scene');
  if(config.sendEmail)throw new Error('This Node.js companion does not send email; use manual delivery or n8n');
  const c={...config,metricsUrl:'local-input'};
  const data=execute('Normalize metrics',input,{Config:c,'Fetch metrics':input});
  const result=execute('Build project JSON',data,{Config:c});
  return {...result,data};
}
