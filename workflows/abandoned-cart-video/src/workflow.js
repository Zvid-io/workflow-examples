import { readFileSync } from 'node:fs';
const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);
function execute(name, input, context) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing fixed workflow code: ${name}`);
  const lookup = key => { if (!(key in context)) throw new Error(`No node ${key}`); return { first: () => ({ json: context[key] }) }; };
  return new Function('$', '$input', code)(lookup, { first: () => ({ json: input[0] }), all: () => input.map(json => ({ json })) })[0].json;
}
export function build(rows, config, probe = {}) {
  if (config.source !== 'sheet') throw new Error('This companion accepts sheet-shaped JSON only; use n8n for Shopify polling');
  if (typeof config.dryRun !== 'boolean') throw new Error('dryRun must be true or false');
  for (const key of ['pollSeconds', 'timeoutMinutes']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  const cart = execute('Pick next cart', Array.isArray(rows) ? rows : [rows], { Config: config });
  if (!cart.found) return { cart, payload: null };
  const guarded = execute('Music guard', [probe], { Config: config, 'Pick next cart': cart });
  return { ...execute('Build project JSON', [guarded], { Config: config }), cart };
}
