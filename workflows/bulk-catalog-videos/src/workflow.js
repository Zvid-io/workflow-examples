import { readFileSync } from 'node:fs';
const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);
function execute(name, inputs, context) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical node: ${name}`);
  return new Function('$', '$input', code)(key => {
    if (!(key in context)) throw new Error(`Unexpected node lookup: ${key}`);
    return { first: () => ({ json: context[key] }) };
  }, { first: () => ({ json: inputs[0] }), all: () => inputs.map(json => ({ json })) });
}
export function buildCatalog(catalog, config) {
  if (!Array.isArray(catalog)) throw new Error('Catalog must be a JSON array of product rows');
  if (!Number.isInteger(config.maxProducts) || config.maxProducts < 1 || config.maxProducts > 500) throw new Error('maxProducts must be an integer from 1 to 500');
  for (const key of ['pollSeconds','timeoutMinutes']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  const selection = execute('Rows needing videos', catalog, { Config: config })[0].json;
  const built = selection.rows.length ? execute('Build project JSON', [selection], { Config: config, 'Rows needing videos': selection })[0].json : null;
  return { selection, built };
}
