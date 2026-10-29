import { readFileSync } from 'node:fs';
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const configNode = 'Set the league and editorial render limits';
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === configNode).parameters.jsonOutput);
export function execute(name, input, context = {}) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing checked-in workflow node: ${name}`);
  const items = value => (Array.isArray(value) ? value : [value]).map(json => ({ json }));
  const lookup = key => {
    if (!(key in context)) throw new Error(`Missing node context: ${key}`);
    return { first: () => items(context[key])[0], all: () => items(context[key]) };
  };
  return new Function('$', '$input', '$json', code)(lookup, { first: () => items(input)[0], all: () => items(input) }, input)[0].json;
}
export function review(config, input) {
  if (!input?.request || !input?.response || !Array.isArray(input.history)) throw new Error('Input needs request, response and history');
  if (config.musicUrl) throw new Error('This companion omits optional music checks; leave musicUrl empty or use n8n');
  for (const k of ['pollSeconds', 'timeoutMinutes', 'maxCreditsPerVideo']) if (!Number.isFinite(config[k]) || config[k] <= 0) throw new Error(`${k} must be positive`);
  return execute('Compare final facts approval and previous video editions', input.response, {
    [configNode]: config,
    'Select the least recently checked enabled event': { request: input.request },
    'Read Sports Recaps recovery log': input.history
  });
}
export function project(config, plan) {
  if (!plan.ready) throw new Error(`No approved work: ${plan.status}`);
  return execute('Build the approved original or corrected match report', plan, { [configNode]: config }).payload;
}
