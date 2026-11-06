import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute reviewed code from the fixed workflow shipped with this example.
function execute(name, rows, config) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical node: ${name}`);
  return new Function('$', '$input', code)(key => {
    if (key !== 'Config') throw new Error(`Unexpected node lookup: ${key}`);
    return { first: () => ({ json: config }) };
  }, { first: () => ({ json: rows[0] }), all: () => rows.map(json => ({ json })) })[0].json;
}

export function checkConfig(config) {
  for (const key of ['pollSeconds', 'timeoutMinutes']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  }
  if (!Number.isInteger(config.maxQuotes) || config.maxQuotes < 2 || config.maxQuotes > 12) throw new Error('maxQuotes must be an integer from 2 to 12');
  if (!Number.isInteger(config.minQuotes) || config.minQuotes < 2 || config.minQuotes > config.maxQuotes) throw new Error('minQuotes must be between 2 and maxQuotes');
  if (!Number.isInteger(config.maxQuoteChars) || config.maxQuoteChars < 80 || config.maxQuoteChars > 400) throw new Error('maxQuoteChars must be between 80 and 400');
  if (config.musicUrl) throw new Error('This JSON companion creates silent videos; musicUrl must be empty');
  if (!['current','previous'].includes(config.monthLabelMode)) throw new Error('monthLabelMode must be current or previous');
  if (config.logoUrl && !/^https:\/\//i.test(config.logoUrl)) throw new Error('logoUrl must be public HTTPS or empty');
  return config;
}

export function prepare(input, config) {
  checkConfig(config);
  if (!Array.isArray(input)) throw new Error('Input must be a JSON array of testimonial rows');
  const rows = input.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row ${i + 1}`);
    const rating = String(row.Rating ?? '').trim();
    if (rating && !/^[1-5]$/.test(rating)) throw new Error(`Row ${i + 1}: Rating must be empty or an integer from 1 to 5`);
    return { ...row, row_number: i + 2 };
  });
  const selected = execute("Pick this month's", rows, config);
  if (!selected.found) return { selected };
  const prepared = execute('Prepare compilation', [selected], config);
  const built = execute('Build project JSON', [{ ...prepared, musicUrl: '', musicSkippedReason: 'The JSON companion creates silent videos' }], config);
  return { selected, ...built };
}
