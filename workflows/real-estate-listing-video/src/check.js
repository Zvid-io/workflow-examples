import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { defaults, checkConfig, prepare } from './workflow.js';
const config = checkConfig({ ...defaults, ...JSON.parse(readFileSync('config.json', 'utf8')) });
const built = prepare(JSON.parse(readFileSync('data/listings.json', 'utf8')), config);
const retained = JSON.parse(readFileSync('assets/sample-project.json', 'utf8'));
assert.deepEqual(built.payload, retained, 'Current builder must reproduce the actual historical sample project');
console.log(`Sample: ${built.meta.address}, ${built.meta.photoCount} photos, ${built.meta.totalSeconds}s, ${built.payload.scenes.length} scenes; retained project matches; no network calls`);
