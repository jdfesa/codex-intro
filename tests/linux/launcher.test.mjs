import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { connectPipe } from '../../platforms/linux/cdp-pipe.mjs';
import { hasRunningDesktop } from '../../platforms/linux/profile.mjs';
import { desktopArgs, installInDesktop, parseLaunchArgs } from '../../platforms/linux/run.mjs';

test('wallpaper stylesheet is decorative and cannot resize host text, icons or layout', async () => {
  const css = await readFile(new URL('../../shared/desktop/wallpaper.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:font(?:-[\w-]+)?|line-height|letter-spacing|zoom|transform|width|height|min-height|padding|margin|gap|--spacing|--text-[\w-]+)\s*:/i);
});

test('Linux launcher preserves native size by default and accepts an opt-in compact scale', () => {
  assert.deepEqual(parseLaunchArgs([]), { app: undefined, uiScale: 100 });
  assert.deepEqual(parseLaunchArgs(['--ui-scale', '95', '--app', '/usr/bin/chatgpt']), {
    app: '/usr/bin/chatgpt', uiScale: 95,
  });
  for (const invalid of ['79', '101', '90.5', 'abc']) {
    assert.throws(() => parseLaunchArgs(['--ui-scale', invalid]), /from 80 to 100/);
  }
  assert.throws(() => parseLaunchArgs(['--app', 'chatgpt']), /absolute executable path/);
});

test('Linux launcher matches Wayland without changing X11 or custom executables', () => {
  assert.deepEqual(desktopArgs({ env: { WAYLAND_DISPLAY: 'wayland-1', XDG_SESSION_TYPE: 'wayland' } }),
    ['--remote-debugging-pipe', '--ozone-platform=wayland']);
  assert.deepEqual(desktopArgs({ env: { WAYLAND_DISPLAY: 'wayland-1' } }),
    ['--remote-debugging-pipe', '--ozone-platform=wayland']);
  for (const env of [{}, { DISPLAY: ':1', XDG_SESSION_TYPE: 'x11' }, { WAYLAND_DISPLAY: 'wayland-1', XDG_SESSION_TYPE: 'x11' }]) {
    assert.deepEqual(desktopArgs({ env }), ['--remote-debugging-pipe']);
  }
  assert.deepEqual(desktopArgs({ app: '/custom/desktop', env: { WAYLAND_DISPLAY: 'wayland-1' } }),
    ['--remote-debugging-pipe']);
});

test('Linux preflight requires a local ChatGPT process and a valid profile socket', {
  skip: process.platform !== 'linux',
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'codex-lock-'));
  const configHome = join(root, 'config');
  const procRoot = join(root, 'proc');
  const profile = join(configHome, 'Codex');
  const processDir = join(procRoot, '123');
  const socketPath = join(profile, 'SingletonSocket');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(profile, { recursive: true });
  await mkdir(processDir, { recursive: true });
  await symlink('test-host-123', join(profile, 'SingletonLock'));
  await symlink(join(root, 'missing-socket'), socketPath);
  const exe = join(processDir, 'exe');
  await symlink('/usr/lib/chatgpt/ChatGPT', exe);
  const opts = { configHome, procRoot, host: 'test-host' };
  assert.equal(await hasRunningDesktop(opts), false); // stale lock

  // Do not require permission to bind a Unix socket in test runners.
  opts.statPath = async path => path === socketPath ? { isSocket: () => true } : stat(path);
  await rm(exe);
  await symlink('/usr/bin/unrelated-process', exe);
  assert.equal(await hasRunningDesktop(opts), false);
  await rm(exe);
  await symlink('/usr/lib/chatgpt/ChatGPT', exe);
  assert.equal(await hasRunningDesktop({ ...opts, host: 'other-host' }), false);
  assert.equal(await hasRunningDesktop(opts), true);
});

test('CDP pipe parses split UTF-8 frames and matches out-of-order replies', async t => {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = connectPipe(input, output);
  t.after(() => client.close());

  const requests = [];
  input.on('data', chunk => requests.push(JSON.parse(chunk.toString().slice(0, -1))));
  const first = client.call('first');
  const second = client.call('second', { a: 1 }, { sessionId: 'main' });
  assert.deepEqual(requests, [
    { id: 1, method: 'first', params: {} },
    { id: 2, method: 'second', params: { a: 1 }, sessionId: 'main' },
  ]);

  const replies = Buffer.from('{"method":"event"}\0{"id":2,"result":"✓"}\0{"id":1,"result":1}\0');
  const split = replies.indexOf(Buffer.from('✓')) + 1;
  output.write(replies.subarray(0, split));
  output.write(replies.subarray(split));
  assert.deepEqual(await Promise.all([first, second]), [1, '✓']);
});

test('CDP pipe reports command errors, times out, and rejects pending work on close', async t => {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = connectPipe(input, output);
  t.after(() => client.close());

  const denied = assert.rejects(client.call('denied'), /denied/);
  output.write('{"id":1,"error":{"message":"denied"}}\0');
  await denied;
  await assert.rejects(client.call('missing', {}, { timeout: 5 }), /missing timed out/);
  const waiting = assert.rejects(client.call('pending'), /pipe closed/);
  output.end();
  await waiting;
  await assert.rejects(client.call('closed'), /pipe closed/);
});

function fakeDesktop(href, state, nextHref) {
  const commands = [];
  const rules = [];
  const context = {
    URL,
    location: { href },
    __aemeathExtension: { status: () => state },
    CSS: { supports: (property, value) => property === 'zoom' && typeof value === 'string' },
    document: {
      getElementById: id => id === 'aemeath-extension-style' ? { append: css => rules.push(css) } : null,
    },
  };
  return {
    context,
    commands,
    rules,
    async call(method, params, options) {
      commands.push(method);
      if (method === 'Target.getTargets') {
        return { targetInfos: [
          { targetId: 'site', type: 'page', url: 'https://example.com/index.html' },
          { targetId: 'quick', type: 'page', url: 'app://-/index.html?initialRoute=quick-chat' },
          { targetId: 'main', type: 'page', url: 'app://-/index.html' },
        ] };
      }
      if (method === 'Target.attachToTarget') {
        assert.deepEqual(params, { targetId: 'main', flatten: true });
        return { sessionId: 'main-session' };
      }
      if (method === 'Runtime.evaluate') {
        assert.equal(options.sessionId, 'main-session');
        const value = runInNewContext(params.expression, context);
        if (nextHref) context.location.href = nextHref;
        return { result: { value } };
      }
      assert.equal(method, 'Target.detachFromTarget');
      assert.deepEqual(params, { sessionId: 'main-session' });
    },
  };
}

const injection = '(globalThis.injected = true, {installed: true})';

test('Linux launcher installs in the main window and detaches after playback starts', async () => {
  const desktop = fakeDesktop('app://-/index.html', { ready: true, phase: 'playing' });
  assert.equal(await installInDesktop(desktop, injection), true);
  assert.equal(desktop.context.injected, true);
  assert.deepEqual(desktop.rules, []); // No zoom, typography or layout overrides.
  assert.deepEqual(desktop.commands, [
    'Target.getTargets', 'Target.attachToTarget', 'Runtime.evaluate', 'Runtime.evaluate', 'Runtime.evaluate',
    'Target.detachFromTarget',
  ]);
});

test('Linux launcher only adjusts dimensions when compact scale is explicitly requested', async () => {
  const desktop = fakeDesktop('app://-/index.html', { ready: true, phase: 'playing' });
  assert.equal(await installInDesktop(desktop, injection, { uiScale: 90 }), true);
  assert.match(desktop.rules.join(''), /:root\s*\{\s*zoom: 90%/);
  assert.match(desktop.rules.join(''), /\.zoom-adjusted-viewport\s*\{\s*width: 111\.\d+dvw; height: 111\.\d+dvh;/);
  assert.match(desktop.rules.join(''), /#aemeath-extension-overlay\s*\{\s*zoom: 1\.11/);
});

test('Linux launcher leaves native scale untouched at 100%', async () => {
  const desktop = fakeDesktop('app://-/index.html', { ready: true, phase: 'playing' });
  assert.equal(await installInDesktop(desktop, injection, { uiScale: 100 }), true);
  assert.deepEqual(desktop.rules, []);
});

test('Linux launcher keeps playback running if the stylesheet is unavailable', async () => {
  const desktop = fakeDesktop('app://-/index.html', { ready: true, phase: 'playing' });
  desktop.context.document.getElementById = () => null;
  assert.equal(await installInDesktop(desktop, injection, { uiScale: 90 }), false);
  assert.equal(desktop.context.injected, true);
  assert.equal(desktop.commands.at(-1), 'Target.detachFromTarget');
});

test('Linux launcher waits for the initial blank document to navigate', async () => {
  const desktop = fakeDesktop('about:blank', { ready: true }, 'app://-/index.html');
  await installInDesktop(desktop, injection);
  assert.equal(desktop.context.injected, true);
});

test('Linux launcher detaches without injecting if the window navigated elsewhere', async () => {
  const desktop = fakeDesktop('app://-/index.html', {}, 'https://example.com/index.html');
  await assert.rejects(installInDesktop(desktop, injection), /Could not install/);
  assert.equal(desktop.context.injected, undefined);
  assert.equal(desktop.commands.at(-1), 'Target.detachFromTarget');
});

test('Linux launcher detaches and reports a failed overlay', async () => {
  const desktop = fakeDesktop('app://-/index.html', { ready: false, phase: 'failed' });
  await assert.rejects(installInDesktop(desktop, injection), /overlay could not load/);
  assert.equal(desktop.commands.at(-1), 'Target.detachFromTarget');
});
