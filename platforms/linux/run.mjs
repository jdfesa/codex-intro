import { spawn } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { pageTarget } from '../../shared/desktop/cdp.mjs';
import { connectPipe } from './cdp-pipe.mjs';
import { hasRunningDesktop } from './profile.mjs';
import { buildInjection } from '../../shared/desktop/payload.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const usage = 'Usage: node platforms/linux/run.mjs [--app /absolute/path/to/chatgpt] [--ui-scale 80-100]';
// Appearance is decorative by default: preserve the app's own typography and zoom.
const defaultUiScale = 100;

export function desktopArgs({ app, env = process.env } = {}) {
  const args = ['--remote-debugging-pipe'];
  // Match the native Wayland desktop launcher instead of using XWayland scaling.
  // Custom executables retain control of their own platform flags.
  if (!app && env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE !== 'x11') {
    args.push('--ozone-platform=wayland');
  }
  return args;
}

export function parseLaunchArgs(args) {
  const { values } = parseArgs({
    args,
    options: {
      app: { type: 'string' },
      'ui-scale': { type: 'string', default: String(defaultUiScale) },
    },
  });
  if (values.app !== undefined && !isAbsolute(values.app)) throw new Error('--app needs an absolute executable path.');
  if (!/^(8\d|9\d|100)$/.test(values['ui-scale'])) throw new Error('--ui-scale needs a whole percentage from 80 to 100.');
  return { app: values.app, uiScale: Number(values['ui-scale']) };
}

function applyDesktopScale(percent) {
  const style = document.getElementById('aemeath-extension-style');
  if (!style || !CSS.supports('zoom', percent + '%')) return false;
  // Reuse the skin stylesheet so Restore removes the scale too, even with wallpaper disabled.
  const inverse = 100 / percent;
  const viewport = 100 * inverse;
  style.append(`
:root { zoom: ${percent}%; }
/* CSS zoom also shrinks viewport units. Keep the app shell at the window edges. */
html, body, #root { min-height: ${viewport}dvh; }
#root .zoom-adjusted-viewport { width: ${viewport}dvw; height: ${viewport}dvh; }
#aemeath-extension-overlay { zoom: ${inverse}; }
`);
  return true;
}

export async function installInDesktop(pipe, source, { uiScale = defaultUiScale } = {}) {
  const targetDeadline = Date.now() + 30000;
  let target;
  while (Date.now() < targetDeadline) {
    const { targetInfos } = await pipe.call('Target.getTargets');
    const pages = targetInfos.filter(pageTarget);
    if (pages.length === 1) {
      [target] = pages;
      break;
    }
    await delay(150);
  }
  if (!target) throw new Error('Could not identify a single ChatGPT/Codex main window.');

  const { sessionId } = await pipe.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  async function evaluate(expression) {
    const reply = await pipe.call('Runtime.evaluate', { expression, returnByValue: true }, { sessionId });
    if (reply.exceptionDetails) throw new Error('The appearance script failed in the desktop window.');
    return reply.result.value;
  }
  try {
    // CDP can report the target URL before its document commits. Wait on the
    // initial blank page, then recheck the URL in the same call as the install.
    const guard = `(${pageTarget.toString()})({type:'page',url:location.href})`;
    let installed;
    while (Date.now() < targetDeadline) {
      const page = await evaluate(`${guard} ? 'main' : location.href === 'about:blank' ? 'pending' : 'other'`);
      if (page === 'main') {
        installed = await evaluate(`${guard} ? (${source}) : null`);
        break;
      }
      if (page !== 'pending') break;
      await delay(150);
    }
    if (installed?.installed !== true) throw new Error('Could not install the animation in the main window.');

    const playbackDeadline = Date.now() + 27000;
    while (Date.now() < playbackDeadline) {
      const state = await evaluate('globalThis.__aemeathExtension?.status()');
      if (!state || ['failed', 'timeout'].includes(state.phase)) {
        throw new Error('The animation overlay could not load.');
      }
      if (state.ready) {
        if (uiScale === 100) return true;
        // A cosmetic adjustment should not abort an otherwise successful launch.
        return await evaluate(`${guard} && (${applyDesktopScale.toString()})(${uiScale})`).catch(() => false);
      }
      await delay(150);
    }
    throw new Error('The animation did not become ready.');
  } finally {
    await pipe.call('Target.detachFromTarget', { sessionId }, { timeout: 750 }).catch(() => {});
  }
}

export async function runLauncher(args, { appArgs = [], onReady = () => {}, onExit = () => {} } = {}) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (process.platform !== 'linux') throw new Error('This launcher is for Linux. See the README for macOS.');
  const { app, uiScale } = parseLaunchArgs(args);

  // A custom executable may use a different profile. Let it manage its own singleton.
  if (!app && await hasRunningDesktop()) {
    throw new Error('ChatGPT/Codex is already running. Use Quit in the app menu, not just Close Window, then run this command again from a separate terminal.');
  }
  const executable = app ?? 'chatgpt';
  const source = await buildInjection(root);
  const child = spawn(executable, [...desktopArgs({ app }), ...appArgs], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  });
  const pipe = connectPipe(child.stdio[3], child.stdio[4]);
  child.once('error', error => pipe.close(new Error(`Could not start ${executable}: ${error.message}`)));
  const appExited = new Promise(resolveExit => {
    child.once('exit', (code, signal) => {
      onExit(code, signal);
      pipe.close(new Error('The launched desktop process exited.'));
      resolveExit(signal ?? code);
    });
  });
  let started = false;
  try {
    try {
      const scaleApplied = await installInDesktop(pipe, source, { uiScale });
      if (!scaleApplied) console.warn('The compact UI scale could not be applied. The animation will still play.');
    } catch (error) {
      throw new Error(`${error.message}\nIf a plain ChatGPT/Codex window opened, the app may already be running. Use Quit in its app menu, then retry from a separate terminal.`);
    }
    console.log('Startup animation is playing. Press Ctrl+Alt+B in the app for settings.');
    started = true;
    onReady();
    // Owl shuts down on pipe EOF. The renderer session is detached, but the
    // launcher must hold the transport open until the desktop app quits.
    const result = await appExited;
    if (result !== 0) throw new Error(`The desktop app exited (${result}).`);
  } finally {
    pipe.close();
    // Let a failed startup release its singleton before the installed fallback.
    if (!started) await Promise.race([appExited, delay(1500)]);
    child.unref(); // A build that ignores the pipe can remain open after a failed launch.
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runLauncher(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
