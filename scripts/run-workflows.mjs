import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];
if (!['check', 'test'].includes(command)) throw new Error('Use check or test');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this through npm run check or npm test');
const workflows = fileURLToPath(new URL('../workflows/', import.meta.url));
for (const entry of readdirSync(workflows, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) throw new Error('Invalid workflow folder name');
  console.log(`\n${entry.name}: ${command}`);
  const result = spawnSync(process.execPath, [npmCli, 'run', command], {
    cwd: `${workflows}/${entry.name}`, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
