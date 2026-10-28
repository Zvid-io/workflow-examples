import { readFileSync } from 'node:fs';

export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute only the reviewed, checked-in nodes. No arbitrary workflow file is accepted.
export function execute(name, inputs, context = {}) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical code node: ${name}`);
  const wrap = value => ({ json: value });
  const lookup = key => {
    if (!(key in context)) throw new Error(`Missing node context: ${key}`);
    const values = Array.isArray(context[key]) ? context[key] : [context[key]];
    return { first: () => wrap(values[0]), all: () => values.map(wrap) };
  };
  return new Function('$', '$input', code)(lookup, {
    first: () => wrap(inputs[0]), all: () => inputs.map(wrap),
  });
}

export function checkConfig(config) {
  for (const key of ['lookbackDays', 'targetSeconds', 'pollSeconds', 'timeoutMinutes']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) throw new Error(`${key} must be positive`);
  }
  if (typeof config.dryRun !== 'boolean') throw new Error('dryRun must be true or false');
  if (!config.niche?.trim() || !config.brandName?.trim()) throw new Error('niche and brandName are required');
  execute('Plan feeds', [config]);
  return config;
}

export function buildEdition(config, edition) {
  if (!edition?.rundown || !edition.timings || !edition.upload?.url) throw new Error('Edition needs rundown, timings and upload.url');
  const built = execute('Build project JSON', [], {
    Config: config, 'Parse rundown': edition.rundown,
    'Pick story clips': { sceneMedia: edition.sceneMedia || [] },
    'Pick music': { music: edition.music || null },
    'Upload voiceover': { upload: edition.upload },
    'Voice + timings': edition.timings,
  })[0].json;
  return built;
}
