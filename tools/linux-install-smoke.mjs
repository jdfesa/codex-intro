// Opt-in end-to-end desktop installation QA. Uses only a disposable app profile.
// Run: xvfb-run -a -s '-screen 0 1280x900x24' node tools/linux-install-smoke.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { install, integrationPaths, uninstall } from '../extension/linux/integration.mjs';

assert.equal(process.platform, 'linux');
assert.ok(process.env.DISPLAY, 'Run this test under Xvfb.');
const workspace = await mkdtemp(join(tmpdir(), 'codex-installed-smoke-'));
const home = join(workspace, 'home with space');
const config = join(home, '.config'), profile = join(config, 'Codex');
const env = {
  ...process.env, HOME: home, CODEX_HOME: join(home, '.codex'),
  XDG_CONFIG_HOME: config, XDG_DATA_HOME: join(home, '.local/share'),
  XDG_STATE_HOME: join(home, '.local/state'), XDG_CACHE_HOME: join(home, '.cache'),
  XDG_SESSION_TYPE: 'x11',
};
delete env.WAYLAND_DISPLAY;
const paths = integrationPaths({ home, env });
const desktopPath = join(paths.applications, 'chatgpt.desktop');
const logPath = join(paths.stateHome, 'codex-intro/launcher.log');
await mkdir(paths.applications, { recursive: true });
await mkdir(profile, { recursive: true });
const original = `[Desktop Entry]\nType=Application\nName=Codex Installation Test\nIcon=chatgpt\nExec=/usr/bin/chatgpt --ozone-platform=x11 --disable-background-networking "--user-data-dir=${profile}" %U\nTerminal=false\nStartupNotify=false\nMimeType=x-scheme-handler/codex;\n`;
await writeFile(desktopPath, original);
const sentinel = join(profile, 'sign-in-preservation-test');
await writeFile(sentinel, 'preserve-existing-profile');
let pid, passed = false;

async function until(check, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}
async function log() { try { return await readFile(logPath, 'utf8'); } catch { return ''; } }
async function profilePid() {
  try {
    const lock = await readlink(join(profile, 'SingletonLock'));
    assert.ok(lock.startsWith(hostname() + '-'));
    const candidate = Number(lock.slice(lock.lastIndexOf('-') + 1));
    if (await readlink(`/proc/${candidate}/exe`) === '/usr/lib/chatgpt/ChatGPT') return candidate;
  } catch { /* Startup and shutdown may temporarily remove the singleton. */ }
}
async function running(candidate) { try { await readlink(`/proc/${candidate}/exe`); return true; } catch { return false; } }
function openIcon() {
  // A plain desktop app can inherit GIO's stdout; do not wait for its pipe EOF.
  const result = spawnSync('gio', ['launch', desktopPath], { env, stdio: 'ignore', timeout: 10000 });
  assert.equal(result.status, 0, result.error?.message);
}
async function closeTestApp() {
  if (pid && await running(pid)) process.kill(pid, 'SIGTERM');
  await until(async () => !pid || !await running(pid), 'test app shutdown', 12000);
  await delay(500);
  assert.equal(await profilePid(), undefined, 'Shutdown must not automatically restart the app.');
  pid = undefined;
}

try {
  await install({ paths, env, refreshCache: () => {} });
  const validation = spawnSync('desktop-file-validate', [desktopPath], { encoding: 'utf8' });
  assert.equal(validation.status, 0, validation.stdout + validation.stderr);
  for (let cycle = 1; cycle <= 2; cycle++) {
    openIcon();
    await until(async () => (await log()).split('Startup animation is playing.').length - 1 >= cycle, 'installed intro playback');
    pid = await until(profilePid, 'test singleton');
    const appStat = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(') ')[1].split(' ');
    const holderPid = Number(appStat[1]);
    const holderStat = (await readFile(`/proc/${holderPid}/stat`, 'utf8')).split(') ')[1].split(' ');
    assert.equal(Number(holderStat[2]), holderPid, 'Pipe holder must own its process group.');
    assert.equal(Number(holderStat[3]), holderPid, 'Pipe holder must own its session.');
    const firstPid = pid;
    openIcon();
    await delay(800);
    assert.equal(await profilePid(), firstPid, 'A second icon click must reuse the existing app.');
    assert.equal((await log()).split('Startup animation is playing.').length - 1, cycle);
    await delay(12500);
    assert.equal(await running(pid), true, 'Desktop launcher must hold the pipe open after playback.');
    await closeTestApp();
  }
  await uninstall({ paths, refreshCache: () => {} });
  assert.equal(await readFile(desktopPath, 'utf8'), original);
  assert.equal(await readFile(sentinel, 'utf8'), 'preserve-existing-profile');
  const introLog = await log();
  openIcon();
  pid = await until(profilePid, 'normal app launch after uninstall');
  const command = await readFile(`/proc/${pid}/cmdline`, 'utf8');
  assert.ok(!command.includes('--remote-debugging-pipe'), 'Original launcher must open without debugging flags.');
  assert.equal(await log(), introLog, 'Uninstalled launch must not invoke the intro runtime.');
  await closeTestApp();
  console.log('PASS: installed icon twice, existing-instance activation, full playback, shutdown, exact uninstall and normal reopen.');
  console.log('PASS: same profile and session sentinel preserved; source checkout was not needed for launch or uninstall.');
  passed = true;
} finally {
  if (!pid) pid = await profilePid();
  if (pid && await running(pid)) {
    process.kill(pid, 'SIGTERM');
    await delay(1000);
    if (await running(pid)) process.kill(pid, 'SIGKILL');
  }
  if (!passed) console.error('Test log:', await log());
  await rm(workspace, { recursive: true, force: true });
}
