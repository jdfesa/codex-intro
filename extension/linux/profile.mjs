import { readlink, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';

function defaultConfigHome() {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config');
}

// Owl's standard Linux package keeps its Chromium singleton in XDG_CONFIG_HOME/Codex.
// Require a live local app and a socket, not just lock metadata. Do not connect.
export async function hasRunningDesktop({
  configHome = defaultConfigHome(), procRoot = '/proc', host = hostname(), uid = process.getuid(),
  statPath = stat,
} = {}) {
  const profile = join(configHome, 'Codex');
  try {
    const lock = await readlink(join(profile, 'SingletonLock'));
    const separator = lock.lastIndexOf('-');
    const pid = lock.slice(separator + 1);
    if (separator < 0 || lock.slice(0, separator) !== host || !/^[1-9]\d*$/.test(pid)) return false;

    const processDir = join(procRoot, pid);
    const [socket, owner, executable] = await Promise.all([
      statPath(join(profile, 'SingletonSocket')),
      statPath(processDir),
      readlink(join(processDir, 'exe')),
    ]);
    return socket.isSocket() && owner.uid === uid && /^chatgpt(?: \(deleted\))?$/i.test(basename(executable));
  } catch {
    // Alternate packages, stale locks, and restricted /proc may not expose this metadata.
    return false;
  }
}
