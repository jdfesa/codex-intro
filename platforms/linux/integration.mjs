import { constants } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { integratedEntry, mainValues, parseExec } from './desktop-entry.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const marker = 'codex-intro-linux';
const commandMarker = '# codex-intro-linux: managed terminal launcher';
const commandNames = ['gpt', 'chatgpt'];
const runtimeFiles = [
  'shared/web/index.html', 'shared/web/style.css', 'shared/web/animation.js', 'shared/web/image-settings.js', 'shared/web/startup-code.js', 'shared/web/startup-motion.js', 'platforms/linux/close-codex.sh',
  'shared/web/assets/artificial-girl-avatar.jpg', 'shared/web/assets/artwork.jpg', 'shared/web/assets/contours.js',
  'shared/web/media/intro-character.mp4',
  'shared/web/fonts.css', 'shared/web/assets/fonts/special-elite-regular.ttf', 'shared/web/assets/fonts/ocr-a.ttf',
  'shared/web/assets/fonts/special-elite-license.txt', 'shared/web/assets/fonts/ocr-a-notice.txt',
  'shared/desktop/cdp.mjs', 'shared/desktop/payload.mjs', 'shared/desktop/renderer.mjs', 'shared/desktop/wallpaper.css',
  'platforms/linux/run.mjs', 'platforms/linux/profile.mjs', 'platforms/linux/cdp-pipe.mjs',
  'platforms/linux/desktop-entry.mjs', 'platforms/linux/integration.mjs', 'platforms/linux/installed-launcher.mjs',
  'platforms/linux/desktop-launcher.mjs',
];
const hash = data => createHash('sha256').update(data).digest('hex');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function integrationPaths({ env = process.env, home = homedir() } = {}) {
  const dataHome = env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : join(home, '.local/share');
  const stateHome = env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(home, '.local/state');
  const dataDirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(delimiter).filter(isAbsolute);
  return { dataHome, stateHome, dataDirs, binDir: join(home, '.local/bin'), installDir: join(dataHome, 'codex-intro'), applications: join(dataHome, 'applications') };
}

async function regularFile(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Refusing to modify a non-regular file: ${path}`);
    return { data: await readFile(path), mode: info.mode & 0o777 };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function readInstallation(paths) {
  try {
    const info = await lstat(paths.installDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Installation path is not a regular directory.');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let state;
  try { state = JSON.parse((await regularFile(join(paths.installDir, 'installation.json'))).data); }
  catch { throw new Error(`Refusing to replace an unrecognized directory: ${paths.installDir}`); }
  if (state.application !== marker || state.version !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.desktop$/.test(state.desktopId)) {
    throw new Error('Unrecognized installation manifest.');
  }
  return state;
}

async function atomicWrite(path, data, mode) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, data, { flag: 'wx', mode });
    await chmod(temporary, mode);
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

async function locked(paths, action) {
  await mkdir(paths.dataHome, { recursive: true });
  const lock = paths.installDir + '.lock';
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another installation operation is active. If none is running, remove the stale lock directory: ${lock}`);
    throw error;
  }
  try { return await action(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}

export async function resolveExecutable(command, env = process.env) {
  const candidates = isAbsolute(command) ? [command] : (env.PATH || '/usr/bin:/bin').split(delimiter).map(dir => join(dir, command));
  if (!isAbsolute(command) && command.includes('/')) throw new Error('Relative executable paths in desktop Exec are not supported.');
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const info = await stat(candidate);
      if (!info.isFile()) continue;
      // PATH now contains our chatgpt command. Never resolve it as the native app,
      // including on updates and manual launches, or the launcher would recurse.
      if (info.size < 8192 && (await readFile(candidate, 'utf8')).includes(commandMarker)) continue;
      return resolve(candidate);
    } catch { /* Try the next PATH directory. */ }
  }
  throw new Error(`Desktop executable not found: ${command}`);
}

async function commandPlan(paths, existing) {
  const data = Buffer.from(`#!/bin/sh\n${commandMarker}\nexec ${shellQuote(join(paths.installDir, 'launch.sh'))} "$@"\n`);
  const commands = [];
  for (const name of commandNames) {
    const path = join(paths.binDir, name);
    const current = await regularFile(path);
    const previous = existing?.commandLaunchers?.find(command => command.name === name);
    if (previous && current && hash(current.data) !== previous.installedHash) {
      throw new Error(`Terminal launcher changed after installation. Refusing to overwrite your edits: ${path}`);
    }
    const original = previous ? previous.original : (current ? { data: current.data.toString('base64'), mode: current.mode } : null);
    commands.push({ path, current, data, manifest: { name, original, installedHash: hash(data) } });
  }
  return commands;
}

async function restoreFile(path, original) {
  if (original) await atomicWrite(path, original.data, original.mode);
  else await rm(path, { force: true });
}

function refresh(applications) {
  const result = spawnSync('update-desktop-database', [applications], { stdio: 'ignore' });
  // The cache helper is optional; the override itself does not depend on it.
  return !result.error && result.status === 0;
}

export async function install({ paths = integrationPaths(), root = sourceRoot, node = process.execPath, env = process.env, desktopId = 'chatgpt.desktop', refreshCache = refresh } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.desktop$/.test(desktopId)) throw new Error('Invalid --desktop-id. Use a desktop filename, not a path.');
  return locked(paths, async () => {
    const existing = await readInstallation(paths);
    if (existing && existing.desktopId !== desktopId) throw new Error(`Uninstall the existing ${existing.desktopId} integration first.`);
    const desktopPath = join(paths.applications, desktopId);
    const current = await regularFile(desktopPath);
    if (existing && (!current || hash(current.data) !== existing.installedDesktopHash)) throw new Error('Desktop launcher changed after installation. Refusing to overwrite your edits.');
    // Null means the original was system-provided; do not back up our override on update.
    const original = existing ? existing.originalUser : (current ? { data: current.data.toString('base64'), mode: current.mode } : null);
    let template;
    if (existing) template = existing.template;
    else if (current) template = current.data.toString();
    else {
      for (const dataDir of paths.dataDirs) {
        const candidate = await regularFile(join(dataDir, 'applications', desktopId));
        if (candidate) { template = candidate.data.toString(); break; }
      }
    }
    if (!template) throw new Error(`Cannot find ${desktopId}. Install the desktop app first or use --desktop-id.`);
    const values = mainValues(template);
    const tokens = parseExec(values.Exec);
    const executable = await resolveExecutable(tokens[0].replaceAll('%%', '%'), env);
    const commands = await commandPlan(paths, existing);
    const entry = integratedEntry(template, {
      launcher: join(paths.installDir, 'launch.sh'), uninstaller: join(paths.installDir, 'uninstall.sh'),
    });
    const manifest = {
      application: marker, version: 1, desktopId, originalUser: original, template,
      executable, tokens, values: { Name: values.Name, Icon: values.Icon, desktopPath },
      installedDesktopHash: hash(entry), node, commandLaunchers: commands.map(command => command.manifest),
    };
    const staging = await mkdtemp(join(paths.dataHome, '.codex-intro-stage-'));
    const rollback = paths.installDir + '.rollback-' + randomUUID();
    let swapped = false, movedOld = false;
    try {
      for (const file of runtimeFiles) {
        const destination = join(staging, file);
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(join(root, file), destination);
      }
      await writeFile(join(staging, 'installation.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
      const logDirectory = join(paths.stateHome, 'codex-intro');
      const launch = `#!/bin/sh\n# Start a detached pipe holder for this app session, not a permanent service.\numask 077\nmkdir -p -- ${shellQuote(logDirectory)} || exit 1\nexec ${shellQuote(node)} ${shellQuote(join(paths.installDir, 'platforms/linux/desktop-launcher.mjs'))} "$@" >> ${shellQuote(join(logDirectory, 'launcher.log'))} 2>&1\n`;
      const uninstall = `#!/bin/sh\n# Restore the original launcher; never remove the desktop app profile.\nexec ${shellQuote(node)} ${shellQuote(join(paths.installDir, 'platforms/linux/integration.mjs'))} uninstall --notify "$@"\n`;
      const close = `#!/bin/sh\n# Keep the installed helper path stable across source-layout changes.\nexec /bin/bash ${shellQuote(join(paths.installDir, 'platforms/linux/close-codex.sh'))} "$@"\n`;
      await writeFile(join(staging, 'launch.sh'), launch, { mode: 0o700 });
      await writeFile(join(staging, 'uninstall.sh'), uninstall, { mode: 0o700 });
      await writeFile(join(staging, 'close-codex.sh'), close, { mode: 0o700 });
      await mkdir(paths.applications, { recursive: true });
      if (existing) { await rename(paths.installDir, rollback); movedOld = true; }
      await rename(staging, paths.installDir); swapped = true;
      const writtenCommands = [];
      let desktopWritten = false;
      try {
        await atomicWrite(desktopPath, entry, current?.mode ?? 0o644);
        desktopWritten = true;
        await mkdir(paths.binDir, { recursive: true });
        for (const command of commands) {
          await atomicWrite(command.path, command.data, 0o755);
          writtenCommands.push(command);
        }
      }
      catch (error) {
        for (const command of writtenCommands.reverse()) await restoreFile(command.path, command.current);
        if (desktopWritten) await restoreFile(desktopPath, current);
        await rm(paths.installDir, { recursive: true, force: true }); swapped = false;
        if (movedOld) { await rename(rollback, paths.installDir); movedOld = false; }
        throw error;
      }
      if (movedOld) await rm(rollback, { recursive: true, force: true });
      refreshCache(paths.applications);
      return { installed: true, updated: !!existing, installDir: paths.installDir, desktopPath, commands: commands.map(command => command.path) };
    } finally {
      if (!swapped) await rm(staging, { recursive: true, force: true });
      // Keep a rollback folder if an unexpected filesystem failure prevented recovery.
      if (movedOld && !swapped) await rename(rollback, paths.installDir);
    }
  });
}

export async function uninstall({ paths = integrationPaths(), refreshCache = refresh } = {}) {
  return locked(paths, async () => {
    const state = await readInstallation(paths);
    if (!state) return { installed: false, changed: false };
    const desktopPath = join(paths.applications, state.desktopId);
    const current = await regularFile(desktopPath);
    if (current && hash(current.data) !== state.installedDesktopHash) {
      throw new Error('Desktop launcher changed after installation. Your edits and backup were preserved; restore or move the edited launcher before uninstalling.');
    }
    const commands = [];
    for (const command of state.commandLaunchers ?? []) {
      if (!commandNames.includes(command.name)) throw new Error('Unrecognized terminal launcher in installation manifest.');
      const path = join(paths.binDir, command.name);
      const currentCommand = await regularFile(path);
      if (currentCommand && hash(currentCommand.data) !== command.installedHash) {
        throw new Error(`Terminal launcher changed after installation. Your edits and backup were preserved: ${path}`);
      }
      commands.push({ path, original: command.original });
    }
    for (const command of commands) {
      await restoreFile(command.path, command.original ? { data: Buffer.from(command.original.data, 'base64'), mode: command.original.mode } : null);
    }
    if (state.originalUser) await atomicWrite(desktopPath, Buffer.from(state.originalUser.data, 'base64'), state.originalUser.mode);
    else await rm(desktopPath, { force: true });
    await rm(paths.installDir, { recursive: true, force: true });
    // Logs are deliberately outside the runtime directory and can be inspected after removal.
    refreshCache(paths.applications);
    return { installed: false, changed: true, desktopPath };
  });
}

async function cli(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node platforms/linux/integration.mjs <install|uninstall|status> [--desktop-id chatgpt.desktop] [--json]');
    return;
  }
  if (process.platform !== 'linux') throw new Error('Persistent desktop installation is currently supported on Linux only.');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'desktop-id': { type: 'string', default: 'chatgpt.desktop' }, json: { type: 'boolean' }, notify: { type: 'boolean' },
  } });
  if (positionals.length !== 1 || !['install', 'uninstall', 'status'].includes(positionals[0])) throw new Error('Choose install, uninstall or status. Use --help for usage.');
  const paths = integrationPaths();
  let result;
  if (positionals[0] === 'status') {
    const state = await readInstallation(paths);
    result = { installed: !!state, installDir: paths.installDir, desktopPath: state ? join(paths.applications, state.desktopId) : null,
      commands: (state?.commandLaunchers ?? []).map(command => join(paths.binDir, command.name)) };
  } else if (positionals[0] === 'install') result = await install({ paths, desktopId: values['desktop-id'] });
  else result = await uninstall({ paths });
  const message = result.installed ? `Codex Intro is installed. Open your normal app icon, or run gpt / chatgpt.\nCommands: ${(result.commands ?? []).join(', ') || 'not installed; rerun install'}\nKeep ${paths.binDir} before the system directories in PATH.\nRuntime: ${paths.installDir}\nUninstall: ${join(paths.installDir, 'uninstall.sh')}` : 'Codex Intro is not installed. The original launcher is active.';
  console.log(values.json ? JSON.stringify(result) : message + '\nApp profile, conversations and sign-in are unchanged. Fully quit and reopen to switch appearance.');
  if (values.notify) spawnSync('notify-send', ['Codex Intro', message.split('\n')[0]], { stdio: 'ignore' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    if (process.argv.includes('--notify')) spawnSync('notify-send', ['Codex Intro', error.message], { stdio: 'ignore' });
    process.exitCode = 1;
  });
}
