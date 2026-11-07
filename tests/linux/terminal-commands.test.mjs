import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { install, integrationPaths, readInstallation, resolveExecutable, uninstall } from '../../platforms/linux/integration.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'codex-command-test with space-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const paths = integrationPaths({ home, env: {} });
  await mkdir(paths.applications, { recursive: true });
  await writeFile(join(paths.applications, 'chatgpt.desktop'), '[Desktop Entry]\nType=Application\nName=Test\nExec=/usr/bin/true %U\n');
  return { paths, opts: { paths, refreshCache: () => {} } };
}

test('real gpt/chatgpt commands work from unrelated directories in sh, bash and Zsh without aliases', async t => {
  const { paths, opts } = await fixture(t);
  await install(opts);
  const args = ['a file.csv', 'codex://callback?x=$cash&quote="value"', ''];
  const probe = 'console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1)}))';
  await writeFile(join(paths.installDir, 'launch.sh'), `#!/bin/sh\nexec '${process.execPath}' -e '${probe}' -- "$@"\n`);
  const env = { ...process.env, PATH: `${paths.binDir}:/usr/bin:/bin` };
  for (const name of ['gpt', 'chatgpt']) {
    assert.equal((await stat(join(paths.binDir, name))).mode & 0o777, 0o755);
    for (const [shell, flags] of [['/bin/sh', ['-c']], ['/bin/bash', ['--noprofile', '--norc', '-c']], ['/bin/zsh', ['-f', '-c']]]) {
      const result = spawnSync(shell, [...flags, `${name} "$@"`, 'probe', ...args], { env, cwd: '/', encoding: 'utf8' });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { cwd: '/', args });
    }
  }
});

test('terminal update preserves first backups and uninstall restores exact original bytes and modes', async t => {
  const { paths, opts } = await fixture(t);
  await mkdir(paths.binDir, { recursive: true });
  const path = join(paths.binDir, 'gpt'), original = '#!/bin/sh\necho original-command\n';
  await writeFile(path, original);
  await chmod(path, 0o750);
  await install(opts);
  const backup = (await readInstallation(paths)).commandLaunchers;
  assert.equal(backup.find(command => command.name === 'chatgpt').original, null);
  await install(opts);
  assert.deepEqual((await readInstallation(paths)).commandLaunchers, backup);
  await uninstall(opts);
  assert.equal(await readFile(path, 'utf8'), original);
  assert.equal((await stat(path)).mode & 0o777, 0o750);
  await assert.rejects(readFile(join(paths.binDir, 'chatgpt')), { code: 'ENOENT' });
});

test('PATH resolution and reinstall skip the managed chatgpt wrapper instead of recursing', async t => {
  const { paths, opts } = await fixture(t);
  const native = join(paths.dataHome, 'native-bin');
  await mkdir(native, { recursive: true });
  await writeFile(join(native, 'chatgpt'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(paths.applications, 'chatgpt.desktop'), '[Desktop Entry]\nType=Application\nName=Test\nExec=chatgpt %U\n');
  const env = { PATH: `${paths.binDir}:${native}:/usr/bin:/bin` };
  await install({ ...opts, env });
  assert.equal(await resolveExecutable('chatgpt', env), join(native, 'chatgpt'));
  await install({ ...opts, env });
  assert.equal((await readInstallation(paths)).executable, join(native, 'chatgpt'));
});

test('later terminal edits block install and uninstall before changing any launcher', async t => {
  const { paths, opts } = await fixture(t);
  await install(opts);
  const desktop = await readFile(join(paths.applications, 'chatgpt.desktop'));
  const path = join(paths.binDir, 'chatgpt');
  await writeFile(path, '#!/bin/sh\necho user-edited\n');
  await assert.rejects(install(opts), /Terminal launcher changed/);
  await assert.rejects(uninstall(opts), /Terminal launcher changed/);
  assert.deepEqual(await readFile(join(paths.applications, 'chatgpt.desktop')), desktop);
  assert.equal(await readFile(path, 'utf8'), '#!/bin/sh\necho user-edited\n');
  assert.ok(await readInstallation(paths));
});

test('terminal symlinks are never overwritten and failed install leaves original desktop intact', async t => {
  const { paths, opts } = await fixture(t);
  const path = join(paths.applications, 'chatgpt.desktop');
  const desktop = await readFile(path);
  await mkdir(paths.binDir, { recursive: true });
  await symlink('/usr/bin/true', join(paths.binDir, 'gpt'));
  await assert.rejects(install(opts), /non-regular file/);
  assert.deepEqual(await readFile(path), desktop);
  assert.equal(await readInstallation(paths), null);
});
