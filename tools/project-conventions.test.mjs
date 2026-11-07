import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('project filenames are English kebab-case and conventional uppercase docs stay at root', async () => {
  async function walk(directory, depth = 0) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'dist') continue;
      const path = join(directory, item.name);
      const conventional = /^(README|TODO|CHANGELOG|LICENSE|AGENTS)\.md$/.test(item.name);
      if (conventional) assert.equal(depth, 0, `${path} must be at the root`);
      else assert.match(item.name, /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.test)?(?:\.[a-z0-9]+)?$/, path);
      if (item.isDirectory()) await walk(path, depth + 1);
      else if (/\.(?:md|js|mjs|html|css|swift|sh|command)$/.test(item.name)) {
        assert.doesNotMatch(await readFile(path, 'utf8'), /[\u3400-\u9fff]/u, `Untranslated text in ${path}`);
      }
    }
  }
  await walk(root);
});
