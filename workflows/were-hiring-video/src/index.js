import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ZvidClient } from '@zvid/sdk';
import { buildCampaign, handoffCsv } from './workflow.js';
import { validateCampaign, submitCampaign, waitForCampaign } from './run.js';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { const temporary = file + '.' + randomUUID() + '.tmp'; writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n'); renameSync(temporary, file); };
async function main() {
  const { values: options } = parseArgs({ options: { input: { type: 'string', default: 'data/jobs.json' }, config: { type: 'string', default: 'config.json' }, out: { type: 'string', default: 'out' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, resume: { type: 'boolean' }, 'as-of': { type: 'string' }, 'max-credits': { type: 'string' }, help: { type: 'boolean' } } });
  if (options.help) { console.log('npm run offline | npm run sample | npm start -- --max-credits 20 | npm start -- --resume\nUse --input file --config file --out folder for your own catalog and persistent campaign state.'); return; }
  if ([options.offline, options['dry-run'], options.resume].filter(Boolean).length > 1) throw new Error('Use only one of --offline, --dry-run or --resume');
  if (options['as-of'] && (!/^\d{4}-\d{2}-\d{2}$/.test(options['as-of']) || new Date(options['as-of']).toISOString().slice(0, 10) !== options['as-of'])) throw new Error('--as-of must be a real YYYY-MM-DD date');
  if (options['as-of'] && !options.offline && !options['dry-run']) throw new Error('--as-of is for offline preparation or validation only. Paid renders use current job eligibility.');
  const config = read(options.config), key = config.manualBrief?.CampaignKey;
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(key || '')) throw new Error('Set a valid manualBrief.CampaignKey in config.json');
  mkdirSync(options.out, { recursive: true });
  const lockFile = path.join(options.out, '.run.lock');
  let lock;
  try { lock = openSync(lockFile, 'wx'); } catch { throw new Error('Output directory is locked. Confirm the previous process has stopped before removing .run.lock.'); }
  try {
    const stateFile = path.join(options.out, 'state.json');
    const state = existsSync(stateFile) ? read(stateFile) : { campaigns: {} };
    const save = async () => write(stateFile, state);
    const plan = options.resume ? state.campaigns[key]?.plan : buildCampaign(config, read(options.input), options['as-of'] ? new Date(options['as-of'] + 'T12:00:00Z') : new Date());
    if (!plan) throw new Error('No saved campaign to resume in this output directory.');
    if (!options.resume) {
      write(path.join(options.out, 'plan.json'), plan);
      if (!plan.ready) { console.log(plan.reason); return; }
      write(path.join(options.out, 'project.json'), plan.payload);
      writeFileSync(path.join(options.out, 'handoff-preview.csv'), handoffCsv(plan));
    }
    if (options.offline) { console.log('Prepared project, plan and handoff preview. No API call was made.'); return; }
    if (!process.env.ZVID_API_KEY) throw new Error('Set ZVID_API_KEY in .env');
    const client = new ZvidClient({ apiKey: process.env.ZVID_API_KEY, baseUrl: process.env.ZVID_API_URL || 'https://api.zvid.io', maxRetries: 0 });
    if (!options.resume && (options['dry-run'] || config.dryRun === true)) {
      const validation = await validateCampaign(client, plan, config.maxCreditsPerVideo);
      write(path.join(options.out, 'validation.json'), validation); console.log(`Validated at ${validation.creditsQuoted} credits. No paid render or campaign-state change.`); return;
    }
    let saved;
    if (options.resume) saved = state.campaigns[key];
    else {
      const limit = Number(options['max-credits']);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('Set a positive --max-credits limit before rendering');
      saved = await submitCampaign(client, plan, state, { maxCredits: Math.min(limit, config.maxCreditsPerVideo), save });
    }
    await waitForCampaign(client, saved, { save, pollMs: config.pollSeconds * 1000, timeoutMs: config.timeoutMinutes * 60000 });
    const output = path.join(options.out, key + '.mp4');
    if (!existsSync(output) || !saved.downloaded) {
      const response = await fetch(saved.videoUrl, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('Video download failed. Use --resume to retry download without another render.');
      const bytes = Buffer.from(await response.arrayBuffer()), length = response.headers.get('content-length');
      if (bytes.length < 32 || bytes.subarray(4, 8).toString() !== 'ftyp' || (length && Number(length) !== bytes.length)) throw new Error('Incomplete or invalid MP4. Use --resume to retry download.');
      const temporary = output + '.' + randomUUID() + '.tmp'; writeFileSync(temporary, bytes); renameSync(temporary, output); saved.downloaded = true; await save();
    }
    writeFileSync(path.join(options.out, key + '.csv'), handoffCsv(saved.plan, saved.videoUrl));
    console.log(`Saved ${output} and the matching recruiter handoff CSV. Review before sharing.`);
  } finally { closeSync(lock); unlinkSync(lockFile); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
