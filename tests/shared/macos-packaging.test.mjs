// Portable layout contracts only: no Swift compilation or real signing occurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildInjection } from '../../shared/desktop/payload.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
test('macOS targets package canonical shared resources with stable identities', { skip: process.platform === 'win32' }, async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'codex-macos-package-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await cp(join(root, 'shared'), join(workspace, 'shared'), { recursive: true });
  await cp(join(root, 'platforms/macos'), join(workspace, 'platforms/macos'), { recursive: true });
  const bin = join(workspace, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'swiftc'), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = -o ]; then shift; printf "#!/bin/sh\\nexit 0\\n" > "$1"; chmod +x "$1"; exit 0; fi\n  shift\ndone\nexit 2\n');
  await writeFile(join(bin, 'codesign'), '#!/bin/sh\nexit 0\n');
  for (const name of ['swiftc', 'codesign']) await chmod(join(bin, name), 0o755);
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH };
  delete env.AVATAR_SOURCE; delete env.ARTWORK_SOURCE; delete env.REBUILD_CONTOURS;
  for (const target of ['launcher', 'preview']) {
    const build = () => {
      const result = spawnSync('bash', ['platforms/macos/build.sh', target], { cwd: workspace, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    build();
    const name = target === 'launcher' ? 'codex-intro' : 'codex-intro-preview';
    const bundle = join(workspace, 'dist/macos', name + '.app/Contents');
    const runtime = join(bundle, 'Resources/runtime');
    const plist = await readFile(join(bundle, 'Info.plist'), 'utf8');
    assert.ok(plist.includes(target === 'launcher' ? 'local.aemeath.extension' : 'local.aemeath.startup'));
    await access(join(bundle, 'MacOS', name));
    for (const file of ['index.html', 'style.css', 'fonts.css', 'animation.js', 'image-settings.js', 'assets/artificial-girl-avatar.jpg', 'assets/artwork.jpg', 'assets/contours.js', 'assets/fonts/special-elite-regular.ttf', 'assets/fonts/ocr-a.ttf', 'assets/fonts/special-elite-license.txt', 'assets/fonts/ocr-a-notice.txt']) {
      assert.deepEqual(await readFile(join(runtime, 'shared/web', file)), await readFile(join(root, 'shared/web', file)));
    }
    await assert.rejects(access(join(runtime, 'platforms/linux')), { code: 'ENOENT' });
    if (target === 'launcher') {
      await access(join(runtime, 'platforms/macos/run.mjs'));
      await access(join(bundle, 'Resources/codex-pink.icns'));
      assert.equal(await buildInjection(runtime), await buildInjection(root));
      const native = await readFile(join(root, 'platforms/macos/launcher.swift'), 'utf8');
      assert.match(native, /runtime\/platforms\/macos\/run\.mjs/);
    } else {
      await assert.rejects(access(join(runtime, 'shared/desktop')), { code: 'ENOENT' });
      const native = await readFile(join(root, 'platforms/macos/player.swift'), 'utf8');
      assert.match(native, /runtime\/shared\/web\/index\.html/);
    }
    await writeFile(join(runtime, 'stale-file'), 'remove on rebuild');
    build();
    await assert.rejects(access(join(runtime, 'stale-file')), { code: 'ENOENT' });
  }
});
