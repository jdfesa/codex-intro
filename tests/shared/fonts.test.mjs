import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInjection } from '../../shared/desktop/payload.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fonts = [
  ['Special Elite', 'special-elite-regular.ttf', 'a776fcb4ceb8bdf03e2967688ebdad42680de5b91a7e62c17e718ae212d14bc4'],
  ['OCR A', 'ocr-a.ttf', 'db3a70dcfab1fcc0e32f88f9413876dccd267a0e377dd8afa7a18e4fe7cba018'],
];
test('bundled font binaries are intact and embedded without remote font URLs', async () => {
  const payload = await buildInjection(root);
  const css = await readFile(join(root, 'shared/web/fonts.css'), 'utf8');
  for (const [family, file, hash] of fonts) {
    const bytes = await readFile(join(root, 'shared/web/assets/fonts', file));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, 'Expected a TrueType sfnt font');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
    assert.ok(css.includes(`assets/fonts/${file}`));
    assert.ok(payload.includes(JSON.stringify({ family, base64: bytes.toString('base64') })));
  }
  assert.doesNotMatch(css, /https?:|@import|local\(/);
  const notices = await readFile(join(root, 'shared/web/assets/fonts/ocr-a-notice.txt'), 'utf8');
  assert.match(notices, /Richard B\. Wales/);
  assert.match(notices, /do not charge any fee/);
  assert.match(await readFile(join(root, 'shared/web/assets/fonts/special-elite-license.txt'), 'utf8'), /Apache License/);
});

test('intro typography is isolated from the host and waits before texture capture', async () => {
  const skin = await readFile(join(root, 'shared/desktop/wallpaper.css'), 'utf8');
  assert.doesNotMatch(skin, /@font-face|font-family|Special Elite|OCR A/);
  const css = await readFile(join(root, 'shared/web/style.css'), 'utf8');
  assert.match(css, /\.boot-title\{font-family:"Special Elite"/);
  assert.match(css, /\.subtitle\{[^}]*font-family:"OCR A"/);
  const renderer = await readFile(join(root, 'shared/desktop/renderer.mjs'), 'utf8');
  assert.match(renderer, /new win\.FontFace/);
  assert.match(renderer, /doc\.fonts\.add\(face\)/);
  const animation = await readFile(join(root, 'shared/web/animation.js'), 'utf8');
  assert.ok(animation.indexOf('await fonts.catch') < animation.indexOf('try{await applyImages(images)'));
});
