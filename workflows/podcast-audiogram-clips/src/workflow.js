import { readFileSync } from 'node:fs';

export const workflow = JSON.parse(readFileSync(new URL('../n8n/workflow.json', import.meta.url), 'utf8'));
export const defaults = JSON.parse(workflow.nodes.find(n => n.name === 'Config').parameters.jsonOutput);

// Execute only the reviewed code in this committed workflow, never a user-supplied export.
export function execute(name, inputs, context = {}) {
  const code = workflow.nodes.find(n => n.name === name)?.parameters.jsCode;
  if (!code) throw new Error(`Missing canonical node: ${name}`);
  const wrap = value => ({ json: value });
  const lookup = key => {
    if (!(key in context)) throw new Error(`Missing node context: ${key}`);
    const values = Array.isArray(context[key]) ? context[key] : [context[key]];
    return {first:()=>wrap(values[0]),all:()=>values.map(wrap)};
  };
  return new Function('$','$input',code)(lookup,{first:()=>wrap(inputs[0]),all:()=>inputs.map(wrap)});
}

export function checkConfig(config) {
  for (const name of ['clipCount','clipSeconds','minClipSeconds','clipWindowSeconds','maxTranscribeMB','maxAudioBytes','pollSeconds','timeoutMinutes']) {
    if (!Number.isFinite(config[name]) || config[name] <= 0) throw new Error(`${name} must be positive`);
  }
  if (!Number.isInteger(config.clipCount) || config.clipCount > 3) throw new Error('clipCount must be an integer from 1 to 3');
  if (config.clipSeconds < 10 || config.clipSeconds > 90) throw new Error('clipSeconds must be from 10 to 90');
  if (config.minClipSeconds > config.clipSeconds) throw new Error('minClipSeconds cannot exceed clipSeconds');
  if (!Number.isFinite(config.skipIntroSeconds) || config.skipIntroSeconds < 0) throw new Error('skipIntroSeconds must be nonnegative');
  if (typeof config.dryRun !== 'boolean') throw new Error('dryRun must be true or false');
  return config;
}

export function buildClips(prepared) {
  const config = checkConfig({...defaults,...prepared.config});
  if (!/^https:\/\//.test(prepared.audioUrl || '')) throw new Error('Prepared audio needs a public HTTPS URL');
  const transcript = execute('Read transcript',[prepared.transcript],{Config:config,'Fetch episode audio':{}})[0].json;
  const clips = execute('Prepare clips',[prepared.selection || {}],{Config:config,'Read transcript':transcript}).map(x=>x.json);
  return execute('Build project JSON',clips,{Config:config,'Pick latest episode':prepared.episode,'Upload episode audio':{upload:{url:prepared.audioUrl}}}).map(x=>x.json);
}
