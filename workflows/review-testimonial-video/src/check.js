import { readFileSync } from 'node:fs';
import { defaults, checkConfig, prepare } from './workflow.js';
const config = checkConfig({ ...defaults, ...JSON.parse(readFileSync('config.json', 'utf8')) });
const built = prepare(JSON.parse(readFileSync('data/reviews.json', 'utf8')), config);
if (!built.payload || built.meta.starsFilled !== 5 || built.payload.scenes.length !== 3) throw new Error('Sample did not produce the expected project');
console.log(`Sample: ${built.meta.reviewer}, ${built.meta.starsFilled} stars, ${built.meta.totalSeconds}s, ${built.payload.scenes.length} scenes; no network calls`);
