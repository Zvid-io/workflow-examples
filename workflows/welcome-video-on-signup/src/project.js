import { readFileSync } from 'node:fs';

export function normalizeSignup(source) {
  const src = source && typeof source.body === 'object' && source.body !== null ? source.body : source;
  const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const data = {firstName:clean(src?.firstName,40),plan:clean(src?.plan,48),company:clean(src?.company,90),email:clean(src?.email,120)};
  if (!data.firstName) throw new Error('The signup needs at least a firstName');
  return data;
}

export function buildProject(config, input, workflowPath = new URL('../n8n/workflow.json', import.meta.url)) {
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
  const code = workflow.nodes.find(n => n.name === 'Build project JSON')?.parameters.jsCode;
  const marker = '\nconst cfg = $(\'Config\')';
  if (!code || !code.includes(marker)) throw new Error('Cannot find the checked-in workflow builder');
  // Only trusted repository code is compiled. User input is passed as data.
  const builder = new Function(code.slice(0,code.indexOf(marker))+'\nreturn buildProject;')();
  return builder(config,normalizeSignup(input));
}
