import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute only the reviewed, checked-in mapper and builder. No arbitrary workflow path is accepted.
function execute(name, inputs, context) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical node: ${name}`);
  const lookup = key => {
    if (!(key in context)) throw new Error(`Unexpected node lookup: ${key}`);
    return { first: () => ({ json: context[key] }) };
  };
  return new Function('$', '$input', code)(lookup, {
    first: () => ({ json: inputs[0] }), all: () => inputs.map(json => ({ json })),
  });
}

export function buildCatalog(catalog, config) {
  if (!Array.isArray(catalog?.data?.products?.nodes)) throw new Error('Catalog must contain data.products.nodes');
  const products = catalog.data.products.nodes;
  const filtered = [];
  const eligible = products.filter(product => {
    const price = product.variants?.nodes?.[0]?.price;
    const reason = product.status !== 'ACTIVE' ? 'not active'
      : product.tags?.includes(config.processedTag) ? 'already tagged as processed'
      : !/^gid:\/\/shopify\/Product\/\d+$/.test(product.id || '') ? 'missing product GID'
      : price != null && (String(price).trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0) ? 'invalid price' : null;
    if (reason) filtered.push({ productId: product.id, product: product.title, reason });
    return !reason;
  });
  const seen = new Set();
  for (const product of eligible) {
    if (seen.has(product.id)) throw new Error('Duplicate product GID in catalog');
    seen.add(product.id);
  }
  const response = { statusCode: 200, body: { ...catalog, data: {
    ...catalog.data, products: { ...catalog.data.products, nodes: eligible },
  } } };
  const selection = execute('Rows needing videos', [response], { Config: config })[0].json;
  selection.skipped.push(...filtered);
  selection.totalRowsRead = products.length;
  if (!selection.found) return { selection, built: null };
  const built = execute('Build project JSON', [selection], {
    Config: config, 'Rows needing videos': selection,
  })[0].json;
  return { selection, built };
}

export function checkConfig(config) {
  for (const key of ['scanLimit', 'maxProducts']) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > 250) throw new Error(`${key} must be an integer from 1 to 250`);
  }
  for (const key of ['pollSeconds', 'timeoutMinutes']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  }
  for (const key of ['dryRun', 'publishToShopify']) {
    if (typeof config[key] !== 'boolean') throw new Error(`${key} must be true or false`);
  }
  if (typeof config.processedTag !== 'string' || !config.processedTag.trim()) throw new Error('processedTag cannot be empty');
  return config;
}
