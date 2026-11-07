import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = resolve(dirname(fileURLToPath(import.meta.url)), '../../platforms/linux/close-codex.sh');
const linuxOnly = { skip: process.platform !== 'linux' };

async function fixture(t, title, { unrelated = false, alias = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'codex-close-'));
  const binary = join(root, 'ChatGPT');
  await copyFile('/usr/bin/sleep', binary);
  let app = binary;
  if (alias) {
    app = join(root, 'desktop-link');
    await symlink(binary, app);
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
    env: { ...process.env, CODEX_BIN: app }, timeout: 15000,
  });
  return { child, close, exited };
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
