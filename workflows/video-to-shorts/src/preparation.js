import { writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { prepareLive } from './workflow.js';

const saveJson = (file, value) => { writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${file}.tmp`, file); };

export async function prepareWithJournal({ directory, prepare = prepareLive, ...args }) {
  const marker = path.join(directory, 'preparation-status.json');
  const status = { state: 'preparing', startedAt: new Date().toISOString(), phase: 'started' };
  try {
    // Exclusive creation survives a process crash and makes a paid rerun explicit.
    writeFileSync(marker, JSON.stringify(status, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('This output folder already records a preparation attempt. Inspect preparation-status.json and saved responses. Use a new --out only after deciding to repeat paid preparation.');
    throw error;
  }
  // Existence, not a parsed state value, is the repeat guard. Even an interrupted
  // status write keeps that guard intact, including on Windows.
  const saveStatus = () => writeFileSync(marker, JSON.stringify(status, null, 2) + '\n');
  const checkpoint = (phase, value) => {
    saveJson(path.join(directory, `${phase}.json`), value);
    status.phase = phase; saveStatus();
  };
  try {
    const prepared = await prepare({ ...args, checkpoint });
    saveJson(path.join(directory, 'prepared.json'), prepared);
    status.state = 'prepared'; status.phase = 'prepared'; saveStatus();
    return prepared;
  } catch (error) {
    status.state = 'interrupted'; saveStatus();
    throw error;
  }
}
