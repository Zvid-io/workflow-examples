import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute reviewed code from the bundled canonical workflow, never input-supplied code.
function execute(name, rows, context) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical node: ${name}`);
  const lookup = key => {
    if (!(key in context)) throw new Error(`Unexpected node lookup: ${key}`);
    return { first: () => ({ json: context[key] }) };
  };
  return new Function('$', '$input', code)(lookup, {
    first: () => ({ json: rows[0] }), all: () => rows.map(json => ({ json })),
  })[0].json;
}

export function prepare(input, config) {
  if (!Array.isArray(input)) throw new Error('Input must be a JSON array of listing rows');
  const rows = input.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row ${i + 1}`);
    return { ...row, row_number: i + 2 };
  });
  const selected = execute('Pick next listing', rows, { Config: config });
  if (!selected.found) return { selected };
  const listing = execute('Normalize listing', [selected], { Config: config });
  for (const url of [...listing.photos, listing.agentPhotoUrl].filter(Boolean)) {
    if (!/^https:\/\//i.test(url)) throw new Error('This companion requires public HTTPS photo URLs');
  }
  const built = execute('Build project JSON', [{ ...listing, musicUrl: '', musicSkippedReason: 'The JSON companion produces silent videos' }], { Config: config });
  return { selected, ...built };
}

export function checkPollingConfig(config) {
  for (const key of ['pollSeconds', 'timeoutMinutes']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
}

export function checkConfig(config) {
  checkPollingConfig(config);
  if (config.musicUrl) throw new Error('This companion produces silent videos; musicUrl must be empty');
  if (config.source !== 'sheet') throw new Error('This companion accepts a local JSON array using the sheet field names; source must be sheet');
  return config;
}
