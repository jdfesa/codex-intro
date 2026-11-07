import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { buildInjection } from '../../shared/desktop/payload.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = path => readFile(join(root, path), 'utf8');

test('default assets contain one runtime artwork and the new Artificial Girl avatar', async () => {
  for (const file of ['shared/web/assets/artificial-girl-avatar.jpg', 'shared/web/assets/artwork.jpg']) {
    const bytes = await readFile(join(root, file));
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', `${file} must be a JPEG`);
  }
  await access(join(root, 'shared/web/assets/contours.js'));
  for (const file of ['assets/avatar.jpg', 'assets/codex-evil-avatar.jpg', 'assets/artwork.jpeg']) {
    await assert.rejects(access(join(root, file)), { code: 'ENOENT' });
  }
});

test('browser, shared payload and macOS packaging share the canonical avatar', async () => {
  for (const file of ['shared/web/index.html', 'shared/web/animation.js', 'shared/desktop/payload.mjs', 'platforms/macos/prepare-defaults.sh']) {
    assert.ok((await read(file)).includes('assets/artificial-girl-avatar.jpg'), file);
  }
  for (const file of ['shared/web/index.html', 'shared/web/animation.js', 'shared/desktop/payload.mjs', 'platforms/macos/prepare-defaults.sh']) {
    assert.ok(!(await read(file)).includes('assets/avatar.jpg'), file);
  }
  assert.match(await read('shared/web/animation.js'), /fallback:'ARTIFICIAL GIRL'/);
  assert.match(await read('shared/web/index.html'), /class="boot-title">ARTIFICIAL GIRL</);
});

test('desktop injection embeds the exact new avatar and unchanged runtime artwork', async () => {
  const source = await buildInjection(root);
  assert.doesNotThrow(() => new Script(source));
  for (const [key, file] of [['avatar', 'artificial-girl-avatar.jpg'], ['artwork', 'artwork.jpg']]) {
    const match = source.match(new RegExp(`"${key}":"data:image/jpeg;base64,([^"]+)"`));
    assert.ok(match, `Missing embedded ${key}`);
    assert.deepEqual(Buffer.from(match[1], 'base64'), await readFile(join(root, 'shared/web/assets', file)));
  }
});

test('artwork stays uncropped in wallpaper, intro, contours and custom imports', async () => {
  assert.match(await read('shared/desktop/wallpaper.css'), /background-size:100% 100%,contain,/);
  assert.match(await read('shared/web/style.css'), /\.artwork,\.line-art\{object-fit:contain;object-position:center\}/);
  const animation = await read('shared/web/animation.js');
  assert.match(animation, /scale=Math\.min\(bounds.width\/1536,bounds.height\/1024\)/);
  assert.match(animation, /art.style.transform='none'/);
  assert.match(await read('shared/web/image-settings.js'), /kind==='avatar'\?Math.max:Math.min/);
});

test('letterbox glitch sits underneath the photo and has no motion or filters', async () => {
  const css = await read('shared/desktop/wallpaper.css');
  assert.match(css, /var\(--aemeath-wallpaper\),\s*linear-gradient/);
  assert.match(css, /repeating-linear-gradient\(0deg,transparent 0 5px/);
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:animation(?:-[\w-]+)?|transition(?:-[\w-]+)?|filter|backdrop-filter)\s*:|@keyframes/i);
});
