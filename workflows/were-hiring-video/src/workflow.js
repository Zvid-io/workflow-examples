import { readFileSync } from 'node:fs';

// Execute the checked-in n8n planner and designer so both routes retain the same rules.
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
const wrap = json => ({ json });
export function execute(name, inputs, context, now = new Date()) {
  const code = workflow.nodes.find(node => node.name === name)?.parameters.jsCode;
  if (!code) throw new Error('Missing checked-in node: ' + name);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  const lookup = key => ({ isExecuted: Object.hasOwn(context, key), first: () => wrap(context[key]?.[0]), all: () => (context[key] || []).map(wrap) });
  return new Function('$', '$json', '$input', 'Date', code)(lookup, inputs[0], { all: () => inputs.map(wrap), first: () => wrap(inputs[0]) }, Clock).map(item => item.json);
}

export function buildCampaign(config, rows, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error('The job catalog must be an array');
  if (!config.companyName?.trim()) throw new Error('Set companyName');
  if (![config.pollSeconds, config.timeoutMinutes, config.maxCreditsPerVideo].every(x => Number.isFinite(x) && x > 0)) throw new Error('Polling, timeout and credit limits must be positive numbers');
  const context = { 'Set recruitment campaign defaults': [config], 'Read approved job catalog': rows };
  const plan = execute('Match the hiring brief to open roles', [], context, now)[0];
  if (!plan.ready) return plan;
  return execute(plan.mode === 'spotlight' ? 'Build the single-role spotlight with benefits' : 'Build the multi-role recruitment roundup', [plan], context, now)[0];
}

export function handoffCsv(plan, videoUrl = '') {
  const quote = value => {
    let s = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const headers = ['CampaignKey', 'JobKey', 'Role', 'ApplyUrl', 'VideoUrl', 'Caption', 'ReferralMessage'];
  return [headers, ...plan.roles.map(role => [plan.campaignKey, role.jobKey, role.role, role.applyUrl, videoUrl, plan.caption, plan.referralMessage])].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
