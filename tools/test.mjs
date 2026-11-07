// Run portable tests everywhere and platform-specific tests only on their host.
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function tests(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map(entry => join(directory, entry.name)).sort();
}
const files = [...await tests('tests'), ...await tests('tests/shared')];
if (process.platform === 'linux') files.push(...await tests('tests/linux'));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
