import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Only execute the reviewed builder in this project's fixed synchronized export.
function execute(name, input, context, marker = {}) {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node?.parameters.jsCode) throw new Error(`Missing canonical node: ${name}`);
  const lookup = key => {
    if (!(key in context)) throw new Error(`Unexpected node lookup: ${key}`);
    return { first: () => ({ json: context[key] }) };
  };
  return new Function('$', '$input', '$getWorkflowStaticData', node.parameters.jsCode)(lookup, {
    first: () => ({ json: input[0] }), all: () => input.map(json => ({ json })),
  }, () => marker)[0].json;
}

export function selectProduct(input, config, marker = {}) {
  if (config.source === 'sheet') {
    const rows = Array.isArray(input) ? input : [input];
    const selected = execute('Pick next product', rows, { Config: config });
    return execute('New product?', [selected], { Config: config }, marker);
  }
  return execute('New product?', [input], { Config: config }, marker);
}

export function buildProduct(product, config, musicProbe = {}) {
  if (!product?.found) throw new Error('A selected product is required');
  return execute('Build project JSON', [musicProbe], { Config: config, 'New product?': product });
}

export function checkConfig(config) {
  if (!['sheet', 'shopify'].includes(config.source)) throw new Error('source must be sheet or shopify');
  if (typeof config.dryRun !== 'boolean') throw new Error('dryRun must be true or false');
  for (const key of ['pollSeconds', 'timeoutMinutes']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  }
  if (config.source === 'shopify' && !/^[a-z0-9][a-z0-9-]*$/i.test(config.shopDomain || '')) {
    throw new Error('shopDomain must be the store subdomain only');
  }
  if (!/^\d{4}-(01|04|07|10)$/.test(config.apiVersion)) throw new Error('apiVersion must use YYYY-MM');
  return config;
}
