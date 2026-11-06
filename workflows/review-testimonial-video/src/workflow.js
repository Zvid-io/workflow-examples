import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute only reviewed code from the fixed, synchronized workflow included here.
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
  if (!Array.isArray(input)) throw new Error('Input must be a JSON array of review rows');
  const rows = input.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row ${i + 1}`);
    const rating = Number(row.Rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new Error(`Row ${i + 1}: Rating must be between 1 and 5`);
    if (row.ImageUrl && !/^https:\/\//i.test(row.ImageUrl)) throw new Error(`Row ${i + 1}: ImageUrl must be public HTTPS or empty`);
    return { ...row, row_number: i + 2 };
  });
  const selected = execute('Pick next review', rows, { Config: config });
  if (!selected.found) return { selected };
  const clean = execute('Clean review text', [selected], { Config: config });
  const trimmed = execute('Trim quote', [clean], { Config: config });
  const built = execute('Build project JSON', [{ ...trimmed, musicUrl: '', musicSkippedReason: 'The JSON companion produces silent videos' }], { Config: config });
  return { selected, ...built };
}

export function checkConfig(config) {
  if (!Number.isFinite(config.minRating) || config.minRating < 1 || config.minRating > 5) throw new Error('minRating must be between 1 and 5');
  for (const key of ['pollSeconds', 'timeoutMinutes']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  if (config.useLlm) throw new Error('This companion uses rule-based trimming; useLlm must be false');
  return config;
}
