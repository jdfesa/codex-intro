import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function files(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}

test('shared modules and platform launchers respect dependency boundaries', async () => {
  for (const directory of ['shared', 'platforms/linux', 'platforms/macos']) {
    for (const file of await files(directory)) {
      if (!/\.(?:mjs|js)$/.test(file)) continue;
      const source = await readFile(join(root, file), 'utf8');
      for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        if (!specifier.startsWith('.')) continue;
        const destination = resolve(root, dirname(file), specifier);
        await access(destination);
        if (directory === 'shared') assert.ok(!destination.startsWith(join(root, 'platforms')), file);
        else {
          const other = directory.endsWith('linux') ? 'macos' : 'linux';
          assert.ok(!destination.startsWith(join(root, 'platforms', other)), file);
        }
      }
    }
  }
});

test('public documentation links resolve and README delegates detailed guides', async () => {
  const documents = ['README.md', 'TROUBLESHOOTING.md', ...await files('docs')].filter(file => file.endsWith('.md'));
  for (const file of documents) {
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:[a-z]+:|#)/i.test(href)) continue;
      const [path, anchor] = href.split('#');
      const destination = resolve(root, dirname(file), decodeURIComponent(path));
      await access(destination);
      if (anchor && destination.endsWith('.md')) {
        const headings = [...(await readFile(destination, 'utf8')).matchAll(/^#+ (.+)$/gm)]
          .map(heading => heading[1].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'));
        assert.ok(headings.includes(anchor), `Broken anchor in ${file}: ${href}`);
      }
    }
  }
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.ok(readme.split('\n').length <= 90, 'Keep the entry point concise');
  assert.doesNotMatch(readme, /^## Troubleshooting\s*$/m);
  assert.match(readme, /\]\(TROUBLESHOOTING\.md\)/);
  for (const directory of ['linux', 'macos', 'desktop', 'web', 'fixtures', 'tools', 'docs']) {
    assert.ok(readme.includes(`${directory}/`), `Missing layout entry: ${directory}`);
  }
});

test('README presents a centered GitHub video attachment with a local download', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.match(readme, /^# Codex Intro\n/);
  assert.match(readme, /<div align="center">\n\nhttps:\/\/github\.com\/user-attachments\/assets\/[a-f0-9-]+\n\n<\/div>/);
  assert.match(readme, /\[Download the demo\]\(docs\/media\/codex-intro-demo\.mp4\)/);
  assert.doesNotMatch(readme, /intro-preview\.png/);
  // GitHub must generate the player itself rather than strip a raw video tag.
  assert.doesNotMatch(readme, /<video\b/i);
});

test('standalone web resources resolve relative to the shared entry point', async () => {
  const html = await readFile(join(root, 'shared/web/index.html'), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^(?:[a-z]+:|#)/i.test(match[1])) continue;
    await access(resolve(root, 'shared/web', match[1]));
  }
});
