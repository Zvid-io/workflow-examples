import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
const plannerCode = workflow.nodes.find(n => n.name === 'Select a due approved celebration and annual key').parameters.jsCode;
const planner = new Function(plannerCode.slice(0, plannerCode.lastIndexOf('\nreturn [{json:')) + '\nreturn planCelebration;')();
const designCode = workflow.nodes.find(n => n.name === 'Build the selected private celebration video').parameters.jsCode;
const designStart = designCode.indexOf('function ordinal(');
const designEnd = designCode.indexOf('// === late-series glue ===');
const designer = new Function(designCode.slice(designStart, designEnd) + '\nreturn buildProject;')();

// Compile only the trusted checked-in workflow. Contact data is never executed.
export function planCelebration(config, rows, logs = [], now = new Date()) {
  if (!Array.isArray(rows) || !Array.isArray(logs)) throw new Error('Contacts and run log must be JSON arrays');
  if (!Number.isFinite(now.getTime())) throw new Error('Date must be a valid ISO timestamp');
  if (config.manualDemo || config.replayRenderKey) throw new Error('The CLI uses explicit contacts and --resume; leave manualDemo false and replayRenderKey empty');
  return planner(config, rows, logs, now, {mode:'cli',id:'local'});
}

export function buildProject(config, plan) {
  if (!plan.ready || plan.jobId) throw new Error('Build only a new eligible celebration');
  if (config.musicUrl) throw new Error('This companion keeps the sample silent. Clear musicUrl; use n8n for checked optional music.');
  return designer(config, plan);
}

export function checkpoint(plan) {
  const { payload, ...snapshot } = plan;
  return JSON.stringify({...snapshot, snapshotVersion:1});
}
