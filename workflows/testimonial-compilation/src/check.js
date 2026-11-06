import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, prepare } from './workflow.js';
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const built = prepare(read('data/testimonials.json'), { ...defaults, ...read('config.json') });
assert.deepEqual(built.payload, read('assets/sample-project.json'));
assert.equal(built.meta.quoteCount, 2);
assert.equal(built.meta.totalSeconds, 19.91);
console.log('Sample matches the retained rendered project: 2 fictional quotes, 4 resolved scenes, 19.91 seconds. No network calls.');
