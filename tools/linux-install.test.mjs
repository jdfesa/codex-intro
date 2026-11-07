import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { desktopQuote, expandExec, integratedEntry, mainValues, parseExec } from '../extension/linux/desktop-entry.mjs';
import { install, integrationPaths, readInstallation, uninstall } from '../extension/linux/integration.mjs';
import { applicationArgs, launchInstalled } from '../extension/linux/installed-launcher.mjs';
import { detachSession } from '../extension/linux/desktop-launcher.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const original = '[Desktop Entry]\r\nType=Application\r\nName=Codex Test\r\nIcon=chatgpt\r\nExec=/usr/bin/true --ozone-platform=wayland %U\r\nMimeType=x-scheme-handler/codex;\r\nActions=NewWindow;\r\nDBusActivatable=true\r\n\r\n[Desktop Action NewWindow]\r\nName=New window\r\nExec=/usr/bin/true --new-window\r\n';

async function fixture(t, userEntry = true) {
  const home = await mkdtemp(join(tmpdir(), 'codex-install-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const paths = integrationPaths({ home, env: { XDG_DATA_DIRS: join(home, 'system-data') } });
  const desktopPath = join(paths.applications, 'chatgpt.desktop');
  await mkdir(paths.applications, { recursive: true });
  await mkdir(join(paths.dataDirs[0], 'applications'), { recursive: true });
  await writeFile(join(paths.dataDirs[0], 'applications/chatgpt.desktop'), original);
  if (userEntry) { await writeFile(desktopPath, original); await chmod(desktopPath, 0o640); }
  const profile = join(home, '.config/Codex');
  await mkdir(profile, { recursive: true });
  await writeFile(join(profile, 'session-sentinel'), 'keep-existing-sign-in');
  await writeFile(join(profile, 'customization-sentinel'), 'keep-wallpaper-settings');
  return { paths, desktopPath, profile, opts: { paths, root, refreshCache: () => {} } };
}

test('desktop commands quote paths without shell evaluation and preserve URL fields', () => {
  const path = '/tmp/my app/$cash`tick`"quote"\\path%value';
  const tokens = parseExec(`${desktopQuote(path)} --flag %U`);
  assert.deepEqual(expandExec(tokens, ['codex://callback?a=$b&c=1', '/tmp/a file.csv']),
    [path, '--flag', 'codex://callback?a=$b&c=1', '/tmp/a file.csv']);
  assert.throws(() => parseExec('app "unfinished'), /Unclosed/);
  assert.throws(() => parseExec('app --value=%Z'), /Unsupported/);
  assert.throws(() => parseExec('app %U %F'), /Only one/);
  assert.throws(() => desktopQuote('path\nExec=evil'), /newlines/);
});

test('desktop override retains identity, MIME types and actions, and disables D-Bus bypass', () => {
  const entry = integratedEntry(original, { launcher: '/tmp/mod/launch.sh', uninstaller: '/tmp/mod/uninstall.sh' });
  const values = mainValues(entry);
  assert.equal(values.Name, 'Codex Test');
  assert.equal(values.Icon, 'chatgpt');
  assert.equal(values.MimeType, 'x-scheme-handler/codex;');
  assert.equal(values.DBusActivatable, 'false');
  assert.equal(values.Terminal, 'false');
  assert.equal(values.Actions, 'NewWindow;CodexIntroUninstall;');
  assert.match(entry, /\[Desktop Action NewWindow\]/);
  assert.match(entry, /Name=Uninstall startup intro/);
});

test('install/update/uninstall restores exact user bytes and mode without touching profile', async t => {
  const { paths, desktopPath, profile, opts } = await fixture(t);
  const first = await install(opts);
  assert.equal(first.updated, false);
  const backup = (await readInstallation(paths)).originalUser;
  assert.equal(Buffer.from(backup.data, 'base64').toString(), original);
  assert.equal((await install(opts)).updated, true);
  assert.deepEqual((await readInstallation(paths)).originalUser, backup);
  for (const path of ['assets/artificial-girl-avatar.jpg', 'assets/artwork.jpg', 'extension/linux/run.mjs', 'close-codex.sh', 'uninstall.sh']) {
    await access(join(paths.installDir, path));
  }
  assert.equal((await stat(join(paths.installDir, 'installation.json'))).mode & 0o777, 0o600);
  const validated = spawnSync('desktop-file-validate', [desktopPath], { encoding: 'utf8' });
  if (!validated.error) assert.equal(validated.status, 0, validated.stdout + validated.stderr);
  assert.equal((await uninstall(opts)).changed, true);
  assert.equal(await readFile(desktopPath, 'utf8'), original);
  assert.equal((await stat(desktopPath)).mode & 0o777, 0o640);
  assert.equal(await readFile(join(profile, 'session-sentinel'), 'utf8'), 'keep-existing-sign-in');
  assert.equal(await readFile(join(profile, 'customization-sentinel'), 'utf8'), 'keep-wallpaper-settings');
  assert.equal((await uninstall(opts)).changed, false);
});

test('uninstall removes only the override when the original is system-provided', async t => {
  const { paths, desktopPath, opts } = await fixture(t, false);
  await install(opts);
  assert.equal((await readInstallation(paths)).originalUser, null);
  await install(opts); // A visual update must not turn the managed override into its own backup.
  assert.equal((await readInstallation(paths)).originalUser, null);
  await uninstall(opts);
  await assert.rejects(access(desktopPath), { code: 'ENOENT' });
  assert.equal(await readFile(join(paths.dataDirs[0], 'applications/chatgpt.desktop'), 'utf8'), original);
});

test('unrelated directories, symlinks and subsequent launcher edits are preserved', async t => {
  const { paths, desktopPath, opts } = await fixture(t);
  await mkdir(paths.installDir);
  await writeFile(join(paths.installDir, 'unrelated'), 'keep');
  await assert.rejects(install(opts), /unrecognized directory/);
  await rm(paths.installDir, { recursive: true });
  await rm(desktopPath);
  await symlink(join(paths.dataDirs[0], 'applications/chatgpt.desktop'), desktopPath);
  await assert.rejects(install(opts), /non-regular file/);
  await rm(desktopPath);
  await writeFile(desktopPath, original);
  await install(opts);
  await writeFile(desktopPath, (await readFile(desktopPath, 'utf8')) + '\n# Custom edit\n');
  await assert.rejects(install(opts), /Refusing to overwrite your edits/);
  await assert.rejects(uninstall(opts), /Your edits and backup were preserved/);
  assert.ok((await readFile(desktopPath, 'utf8')).endsWith('# Custom edit\n'));
  assert.ok(await readInstallation(paths));
});

test('missing runtime files fail before switching the desktop launcher', async t => {
  const { paths, desktopPath, opts } = await fixture(t);
  await assert.rejects(install({ ...opts, root: join(paths.dataHome, 'missing-source') }), { code: 'ENOENT' });
  assert.equal(await readFile(desktopPath, 'utf8'), original);
  assert.equal(await readInstallation(paths), null);
});

const app = { executable: '/usr/bin/chatgpt', tokens: ['chatgpt', '--ozone-platform=wayland', '%U'], values: {} };
test('installed activation forwards callback URLs to the existing app without replay', async () => {
  const calls = [];
  assert.equal(await launchInstalled(['codex://callback?private=value'], {
    state: app, isRunning: async () => true, plain: async (...args) => calls.push(args),
    intro: async () => assert.fail('Must not inject into an existing app'),
  }), 'activated');
  assert.deepEqual(calls, [[app.executable, ['--ozone-platform=wayland', 'codex://callback?private=value']]]);
});

test('installed launcher uses the same executable and forwards original arguments', async () => {
  const incoming = ['/tmp/data file.csv'];
  const state = { ...app, tokens: ['chatgpt', '--original-flag', '%F'] };
  assert.deepEqual(applicationArgs(state, incoming, { WAYLAND_DISPLAY: 'wayland-1' }),
    ['--ozone-platform=wayland', '--original-flag', '/tmp/data file.csv']);
});

test('startup failures fall back once, but quitting never restarts the app', async () => {
  let fallbacks = 0;
  const options = { state: app, isRunning: async () => false, plain: async () => { fallbacks++; } };
  assert.equal(await launchInstalled([], { ...options, intro: async () => { throw new Error('unsupported build'); } }), 'fallback');
  assert.equal(fallbacks, 1);
  assert.equal(await launchInstalled([], { ...options, intro: async (_args, hooks) => { hooks.onReady(); throw new Error('SIGTERM'); } }), 'closed');
  assert.equal(await launchInstalled([], { ...options, intro: async (_args, hooks) => { hooks.onExit(null, 'SIGTERM'); throw new Error('pipe closed'); } }), 'closed');
  assert.equal(fallbacks, 1);
});

test('desktop dispatch detaches the pipe holder and never inherits terminal pipes', async () => {
  let unreferenced = false;
  await detachSession(['codex://callback?private=value'], { spawnWorker: (executable, args, options) => {
    assert.equal(executable, process.execPath);
    assert.ok(args[0].endsWith('/installed-launcher.mjs'));
    assert.equal(args[1], 'codex://callback?private=value');
    assert.equal(options.detached, true);
    assert.deepEqual(options.stdio, ['ignore', 1, 2]);
    const child = new EventEmitter();
    child.unref = () => { unreferenced = true; };
    queueMicrotask(() => child.emit('spawn'));
    return child;
  } });
  assert.equal(unreferenced, true);
});
