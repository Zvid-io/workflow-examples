import { readFileSync } from 'node:fs';
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
const configNode = 'Set reporting period and exception thresholds';
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === configNode).parameters.jsonOutput);

export function execute(name, input, context = {}, now = new Date(), rows = [input]) {
  const node = workflow.nodes.find(n => n.name === name);
  if (!node?.parameters.jsCode) throw new Error(`Missing checked-in node: ${name}`);
  const item = json => ({ json });
  const lookup = key => {
    if (!(key in context)) throw new Error(`Missing node context: ${key}`);
    return { first: () => item(context[key]) };
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  return new Function('$', '$json', '$input', 'Date', 'Buffer', node.parameters.jsCode)(
    lookup, input, { first: () => item(input), all: () => rows.map(item) }, Clock, Buffer,
  );
}

export function build(config = {}, input, now = new Date()) {
  const cfg = { ...defaults, ...config };
  for (const field of ['pollSeconds', 'timeoutMinutes', 'maxDataAgeHours', 'alertPercent']) {
    if (!Number.isFinite(cfg[field]) || cfg[field] <= 0) throw new Error(`${field} must be positive`);
  }
  if (cfg.narrate || cfg.sendSlack || cfg.musicUrl) throw new Error('This companion is silent and does not send Slack messages; use n8n for those options');
  if (!['sample', 'live'].includes(cfg.metricsSource)) throw new Error('metricsSource must be sample or live');
  const response = cfg.metricsSource === 'sample'
    ? execute('Create labeled sample metrics for testing', cfg, {}, now)[0].json
    : { statusCode: 200, body: input };
  if (cfg.metricsSource === 'live') cfg.metricsUrl = 'https://local-input.example/metrics';
  const context = { [configNode]: cfg, 'Choose the configured metrics input': response };
  const plan = execute('Calculate KPI changes target misses and owners', null, context, now, [])[0].json;
  if (!plan.ready) return { plan, response, payload: null, reviewCsv: null };
  const built = execute('Build the exception-focused KPI briefing', plan, context, now)[0].json;
  const file = execute('Download the source-specific review pack', built, context, now)[0].binary.data;
  return { ...built, plan, response, reviewCsv: Buffer.from(file.data, 'base64').toString('utf8') };
}
