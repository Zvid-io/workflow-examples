import { readFileSync } from 'node:fs';
export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const configNode = 'Set the location date and booking thresholds';
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === configNode).parameters.jsonOutput);
export function execute(name, input, context = {}, now = new Date()) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw Error(`Missing workflow Code node: ${name}`);
  const items = Array.isArray(input) ? input : [input];
  const wrap = json => ({ json });
  const lookup = key => {
    if (!(key in context)) throw Error(`Missing node input: ${key}`);
    const values = Array.isArray(context[key]) ? context[key] : [context[key]];
    return { first: () => wrap(values[0]), all: () => values.map(wrap) };
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  return new Function('$', '$json', '$input', 'Date', code)(lookup, items[0], { first: () => wrap(items[0]), all: () => items.map(wrap) }, Clock)[0];
}
export function prepare(config, bookings, now) {
  return execute('Validate the dated booking brief', bookings, { [configNode]: config }, now).json;
}
export function build(config, input, now = new Date()) {
  if (config.musicUrl) throw Error('This Node.js companion uses no music; leave musicUrl empty.');
  for (const key of ['pollSeconds', 'timeoutMinutes', 'maxCreditsPerVideo']) if (!Number.isFinite(config[key]) || config[key] <= 0) throw Error(`${key} must be positive`);
  const brief = prepare(config, input.bookings, now);
  if (!brief.ready) return { ready: false, reason: brief.reason };
  const context = {
    [configNode]: config,
    'Validate the dated booking brief': brief,
    'Require one matching city and region': { place: input.place },
    'Read Weather Briefings recovery log': [],
  };
  const plan = execute('Schedule requests around weather and confirmed bookings', input.forecast, context, now).json;
  const built = execute('Build the outdoor booking call-sheet video', plan, context, now).json;
  const calendar = execute('Download tentative booking calendar proposals', plan, {}, now).binary.data;
  const csv = execute('Download the source-specific review pack', plan, {}, now).binary.data;
  return { ...built, calendar, csv };
}
async function getJson(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Weather source returned HTTP ${response.status}`);
  return response.json();
}
export async function fetchWeather(config, bookings, now = new Date(), fetcher = fetch) {
  const brief = prepare(config, bookings, now);
  if (!brief.ready) return { bookings, place: null, forecast: null };
  const geo = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geo.search = new URLSearchParams({ name: config.cityName, count: '10', language: 'en', format: 'json' });
  const geoData = await getJson(geo, fetcher);
  const place = execute('Require one matching city and region', geoData, { [configNode]: config }, now).json.place;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, timezone: place.timezone, hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code,is_day', timeformat: 'unixtime', wind_speed_unit: 'kmh', temperature_unit: 'celsius', start_date: brief.date, end_date: brief.date });
  return { bookings, place, forecast: await getJson(url, fetcher) };
}
