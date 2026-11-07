// Detach the per-session pipe holder from a short-lived menu or terminal launcher.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function detachSession(args, { spawnWorker = spawn } = {}) {
  const worker = join(dirname(fileURLToPath(import.meta.url)), 'installed-launcher.mjs');
  const child = spawnWorker(process.execPath, [worker, ...args], {
    detached: true,
    // launch.sh already redirected these file descriptors to the private log.
    stdio: ['ignore', 1, 2],
  });
  await once(child, 'spawn');
  child.unref();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  detachSession(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
