import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../workflows/', import.meta.url));
const required = ['README.md', 'src/index.js', 'package.json', 'package-lock.json', '.env.example',
  'data', 'tests', 'n8n/workflow.json', 'n8n/README.md', 'assets/workflow.png',
  'assets/sample-output.mp4', 'assets/sample-output.jpg', 'assets/sample-project.json',
  'assets/sample-output.json', 'links.json'];
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const entries = readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory());
if (!entries.length) throw new Error('No workflow examples found');
for (const { name } of entries) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`Invalid slug: ${name}`);
  const directory = path.join(root, name);
  for (const file of required) if (!existsSync(path.join(directory, file))) throw new Error(`${name}: missing ${file}`);
  if (existsSync(path.join(directory, '.git'))) throw new Error(`${name}: nested Git repository`);
  for (const folder of ['src', 'data', 'tests']) if (!readdirSync(path.join(directory, folder)).length) throw new Error(`${name}: empty ${folder}`);
  const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  for (const script of ['start', 'check', 'test']) if (!pkg.scripts?.[script]) throw new Error(`${name}: missing ${script} script`);
  const links = JSON.parse(readFileSync(path.join(directory, 'links.json'), 'utf8'));
  for (const key of ['website', 'n8n', 'code', 'youtube']) {
    if (!(key in links) || (links[key] !== null && !/^https:\/\//.test(links[key]))) throw new Error(`${name}: invalid ${key} link`);
  }
  if (links.code !== `https://github.com/Zvid-io/workflow-examples/tree/main/workflows/${name}`) throw new Error(`${name}: incorrect code URL`);
  const sample = JSON.parse(readFileSync(path.join(directory, 'assets/sample-output.json'), 'utf8'));
  if (sample.videoSha256 !== digest(path.join(directory, 'assets/sample-output.mp4'))) throw new Error(`${name}: sample video hash mismatch`);
  if (sample.workflowSha256 !== digest(path.join(directory, 'n8n/workflow.json'))) throw new Error(`${name}: synchronized workflow hash mismatch`);
  if (statSync(path.join(directory, 'assets/sample-output.mp4')).size < 1024) throw new Error(`${name}: missing real output media`);
  for (const file of ['README.md','n8n/README.md','.env.example','n8n/workflow.json','assets/sample-project.json','links.json']) {
    const text = readFileSync(path.join(directory, file), 'utf8');
    if (/zvid_[A-Za-z0-9]{20,}/.test(text)) throw new Error(`${name}: possible credential in ${file}`);
    if (/dashboard\.zvid\.io|(?<!@zvid\/)n8n-nodes-zvid|CUSTOM\./.test(text)) throw new Error(`${name}: invalid URL or node prefix in ${file}`);
  }
  console.log(`${name}: required structure, links and sample hashes verified`);
}
