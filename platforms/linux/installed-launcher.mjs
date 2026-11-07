// Normal desktop launches use the same application, environment and user profile.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInstallation } from './integration.mjs';
import { expandExec } from './desktop-entry.mjs';
import { hasRunningDesktop } from './profile.mjs';
import { desktopArgs, runLauncher } from './run.mjs';

export function applicationArgs(state, incoming, env = process.env) {
  const args = expandExec(state.tokens.slice(1), incoming, state.values);
  if (!args.some(arg => arg.startsWith('--ozone-platform='))) args.unshift(...desktopArgs({ env }).filter(arg => arg !== '--remote-debugging-pipe'));
  return args;
}

async function openPlain(executable, args) {
  const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
  await once(child, 'spawn');
  child.unref();
}

export async function launchInstalled(incoming, {
  state, env = process.env, isRunning = hasRunningDesktop, plain = openPlain, intro = runLauncher,
} = {}) {
  if (!state) throw new Error('Missing installation manifest. Reinstall Codex Intro.');
  const args = applicationArgs(state, incoming, env);
  // A second menu click or sign-in callback must activate the existing app.
  if (await isRunning()) { await plain(state.executable, args); return 'activated'; }
  let ready = false, stopped = false;
  try {
    await intro(['--app', state.executable], {
      appArgs: args, onReady: () => { ready = true; },
      onExit: (_code, signal) => { stopped = ['SIGTERM', 'SIGINT', 'SIGKILL'].includes(signal); },
    });
    return 'intro';
  } catch (error) {
    if (ready || stopped) {
      // A normal SIGTERM from platforms/linux/close-codex.sh must never trigger an automatic restart.
      console.log('Desktop session ended.');
      return 'closed';
    }
    console.error('Intro unavailable; opening the original app without decoration.');
    // Do not log incoming URLs or file names: sign-in callbacks may contain secrets.
    await plain(state.executable, args);
    return 'fallback';
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  readInstallation({ installDir }).then(state => launchInstalled(process.argv.slice(2), { state })).catch(error => {
    console.error(error.message); process.exitCode = 1;
  });
}
