import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = resolve(dirname(fileURLToPath(import.meta.url)), '../../platforms/linux/close-codex.sh');
const linuxOnly = { skip: process.platform !== 'linux' };

async function fixture(t, title, { unrelated = false, alias = false, autodetect = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'codex-close with space-'));
  const binary = join(root, 'ChatGPT');
  await copyFile('/usr/bin/sleep', binary);
  let app = binary;
  if (alias) {
    app = join(root, 'desktop-link');
    await symlink(binary, app);
  }
  const env = { ...process.env, CODEX_BIN: app };
  if (autodetect) {
    const shortcuts = join(root, 'shortcuts'), unrelatedBin = join(root, 'unrelated-bin'), nativeBin = join(root, 'native-bin');
    for (const dir of [shortcuts, unrelatedBin, nativeBin]) await mkdir(dir);
    await writeFile(join(shortcuts, 'chatgpt'), '#!/bin/sh\n# codex-intro-linux: managed terminal launcher\nexit 99\n', { mode: 0o755 });
    // Even an adjacent executable must not make our intro wrapper the native app.
    await copyFile('/usr/bin/sleep', join(shortcuts, 'ChatGPT'));
    await writeFile(join(unrelatedBin, 'chatgpt'), '#!/bin/sh\nexit 98\n', { mode: 0o755 });
    await writeFile(join(root, 'codex-launcher'), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
    await symlink(join(root, 'codex-launcher'), join(nativeBin, 'chatgpt'));
    delete env.CODEX_BIN;
    env.PATH = `${shortcuts}:${unrelatedBin}:${nativeBin}:/usr/bin:/bin`;
  }
  // Model Chromium's rewritten process title without launching a real desktop.
  const child = spawn(unrelated ? '/usr/bin/sleep' : binary, ['60'], {
    argv0: title(binary), stdio: 'ignore',
  });
  const exited = once(child, 'exit');
  await once(child, 'spawn');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    await rm(root, { recursive: true, force: true });
  });
  const close = (...args) => run('bash', [script, ...args], {
    env, timeout: 15000,
  });
  return { binary, child, close, exited };
}

test('shutdown finds a desktop with a rewritten argv[0] through its executable', linuxOnly, async t => {
  const { close, exited } = await fixture(t, bin => `${bin} --remote-debugging-pipe`);
  const result = await close('--timeout', '2');
  assert.match(result.stdout, /Codex closed successfully/);
  assert.deepEqual(await exited, [null, 'SIGTERM']);
});

test('shutdown resolves an executable symlink and supports forced shutdown', linuxOnly, async t => {
  const { close, exited } = await fixture(t, bin => bin, { alias: true });
  const result = await close('--force');
  assert.match(result.stdout, /Codex closed successfully/);
  assert.deepEqual(await exited, [null, 'SIGKILL']);
});

test('shutdown leaves Chromium subprocesses alive even with a rewritten title', linuxOnly, async t => {
  const { child, close } = await fixture(t, bin => `${bin} --type=renderer --lang=en-US`);
  const result = await close();
  assert.match(result.stdout, /Codex is not running/);
  assert.equal(child.signalCode, null);
});

test('shutdown does not trust a different executable impersonating the app title', linuxOnly, async t => {
  const { child, close } = await fixture(t, bin => bin, { unrelated: true });
  const result = await close();
  assert.match(result.stdout, /Codex is not running/);
  assert.equal(child.signalCode, null);
});

test('shutdown auto-discovery skips managed and unrelated PATH wrappers before the native launcher', linuxOnly, async t => {
  const { binary, close, exited } = await fixture(t, bin => `${bin} --remote-debugging-pipe`, { autodetect: true });
  const result = await close('--timeout', '2');
  assert.ok(result.stdout.includes(`Executable: ${binary}`), result.stdout);
  assert.match(result.stdout, /Codex closed successfully/);
  assert.deepEqual(await exited, [null, 'SIGTERM']);
});

test('shutdown dry-run resolves the native PATH target and leaves it alive', linuxOnly, async t => {
  const { binary, child, close } = await fixture(t, bin => `${bin} --remote-debugging-pipe`, { autodetect: true });
  const result = await close('--dry-run');
  assert.ok(result.stdout.includes(`Executable: ${binary}`), result.stdout);
  assert.match(result.stdout, /Dry run: would send SIGTERM/);
  assert.equal(child.signalCode, null);
  assert.equal(child.exitCode, null);
});

test('shutdown force dry-run respects explicit CODEX_BIN and sends no signal', linuxOnly, async t => {
  const { binary, child, close } = await fixture(t, bin => bin);
  const result = await close('--force', '--dry-run', '--timeout', '0');
  assert.ok(result.stdout.includes(`Executable: ${binary}`), result.stdout);
  assert.match(result.stdout, /Dry run: would send SIGKILL/);
  assert.equal(child.signalCode, null);
  assert.equal(child.exitCode, null);
});
