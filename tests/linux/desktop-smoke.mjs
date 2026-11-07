// Opt-in real desktop QA. Always uses a disposable, signed-out profile.
// Run: xvfb-run -a -s '-screen 0 1280x900x24' node tests/linux/desktop-smoke.mjs
// Or: node tests/linux/desktop-smoke.mjs --wayland (opens an isolated test window).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { pageTarget } from '../../shared/desktop/cdp.mjs';
import { buildInjection } from '../../shared/desktop/payload.mjs';
import { connectPipe } from '../../platforms/linux/cdp-pipe.mjs';
import { desktopArgs, installInDesktop } from '../../platforms/linux/run.mjs';

assert.equal(process.platform, 'linux', 'This smoke test requires Linux.');
assert.ok(process.argv.slice(2).every(arg => arg === '--wayland'), 'Only --wayland is supported.');
const wayland = process.argv.includes('--wayland');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, '.build', wayland ? 'linux-desktop-wayland' : 'linux-desktop-smoke');
const profile = await mkdtemp(join(tmpdir(), 'codex-intro-smoke-'));
await mkdir(output, { recursive: true });
const env = {
  ...process.env,
  HOME: profile,
  CODEX_HOME: join(profile, '.codex'),
  XDG_CONFIG_HOME: join(profile, 'config'),
  XDG_CACHE_HOME: join(profile, 'cache'),
  XDG_DATA_HOME: join(profile, 'data'),
  XDG_SESSION_TYPE: wayland ? 'wayland' : 'x11',
};
if (!wayland) delete env.WAYLAND_DISPLAY;
const args = [
  ...desktopArgs({ env }),
  ...(wayland ? [] : ['--ozone-platform=x11']),
  '--disable-background-networking',
  `--user-data-dir=${join(env.XDG_CONFIG_HOME, 'Codex')}`,
];
const child = spawn('/usr/bin/chatgpt', args, {
  env, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
});
let errors = '';
child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-64000); });
const exited = once(child, 'exit');
const pipe = connectPipe(child.stdio[3], child.stdio[4]);
child.once('error', error => pipe.close(error));
child.once('exit', () => pipe.close());

async function until(check, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  const target = await until(async () => {
    const { targetInfos } = await pipe.call('Target.getTargets');
    return targetInfos.find(pageTarget);
  }, 'main desktop target');
  const { sessionId } = await pipe.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  async function evaluate(fn) {
    const response = await pipe.call('Runtime.evaluate', {
      expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true,
    }, { sessionId });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }
  async function screenshot(name) {
    const { data } = await pipe.call('Page.captureScreenshot', { format: 'png' }, { sessionId, timeout: 10000 });
    await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
  }
  await until(() => evaluate(() => location.href.startsWith('app://-/index.html') &&
    !document.querySelector('.startup-loader') && !!document.querySelector('#root button')), 'native sign-in UI');
  await delay(500);
  const baseline = await evaluate(() => {
    window.__nativeSmokeNodes = [document.documentElement, document.body, document.getElementById('root'),
      ...Array.from(document.querySelectorAll('#root button, #root svg')).filter(node => node.getBoundingClientRect().width > 5).slice(0, 12)];
    window.__nativeSmokeMeasure = () => ({
      dpr: devicePixelRatio,
      nodes: window.__nativeSmokeNodes.map(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return { tag: node.tagName, connected: node.isConnected, fontSize: style.fontSize,
          fontFamily: style.fontFamily, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
          zoom: style.zoom, width: rect.width, height: rect.height };
      }),
    });
    return window.__nativeSmokeMeasure();
  });
  assert.ok(baseline.nodes.some(node => node.tag === 'svg'), 'Expected a real native icon to measure.');
  await screenshot('01-native');
  // Simulate saved former defaults without touching any real user settings.
  await evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('aemeath-startup-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put({
        introTitle: '\u98de\u884c\u96ea\u7ed2',
        artworkSubtitle: '\u5e7d\u7075\u6765\u5230\u2026\u4f60\u8eab\u8fb9\uff5e',
      }, 'images');
      transaction.oncomplete = () => { database.close(); resolve(true); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await installInDesktop(pipe, await buildInjection(root));
  const during = await evaluate(() => window.__nativeSmokeMeasure());
  assert.deepEqual(during, baseline, 'The intro changed native typography, icon geometry, layout or zoom.');
  const frame = await evaluate(() => {
    const overlay = document.getElementById('aemeath-extension-overlay');
    const rect = overlay.getBoundingClientRect(), doc = overlay.contentDocument;
    return {
      dimensions: [rect.width, rect.height, innerWidth, innerHeight],
      title: doc.querySelector('.boot-title').textContent,
      avatar: [doc.querySelector('.avatar').naturalWidth, doc.querySelector('.avatar').naturalHeight],
      avatarFit: overlay.contentWindow.getComputedStyle(doc.querySelector('.avatar')).objectFit,
      imageFit: overlay.contentWindow.getComputedStyle(doc.querySelector('.artwork')).objectFit,
      contourFit: overlay.contentWindow.getComputedStyle(doc.querySelector('.line-art')).objectFit,
      language: doc.documentElement.lang,
      subtitle: doc.querySelector('#subtitle').textContent,
      english: !/[\u3400-\u9fff]/u.test(doc.body.textContent),
    };
  });
  assert.deepEqual(frame.dimensions.slice(0, 2), frame.dimensions.slice(2), 'Overlay must fill the viewport without resizing the app.');
  assert.equal(frame.title, 'ARTIFICIAL GIRL');
  assert.ok(frame.avatar.every(dimension => dimension > 0), 'The bundled avatar must load, regardless of source aspect ratio.');
  assert.equal(frame.avatarFit, 'cover');
  assert.equal(frame.imageFit, 'contain');
  assert.equal(frame.contourFit, 'contain');
  assert.equal(frame.language, 'en');
  assert.equal(frame.subtitle, 'Ready to build.');
  assert.equal(frame.english, true);
  const elapsed = () => evaluate(() => Number(document.getElementById('aemeath-extension-overlay')?.contentDocument.querySelector('.window')?.dataset.elapsed ?? 99));
  for (const [time, name] of [[2.8, '02-identity'], [5.7, '03-contours'], [8.5, '04-artwork']]) {
    await until(async () => await elapsed() >= time, `intro at ${time}s`, 15000);
    await screenshot(name);
  }
  const state = await until(() => evaluate(() => {
    const state = window.__aemeathExtension?.status();
    return state?.completed ? state : false;
  }), 'full intro completion', 15000);
  assert.equal(state.phase, 'complete');
  assert.equal(state.overlay, false);
  assert.equal(state.wallpaper, true);
  assert.deepEqual(await evaluate(() => window.__nativeSmokeMeasure()), baseline, 'Wallpaper changed native sizing.');
  await screenshot('05-wallpaper');
  const responsive = [];
  for (const [width, height] of [[1280, 720], [900, 900], [600, 1000], [3440, 1440], [390, 844]]) {
    await pipe.call('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    }, { sessionId });
    await delay(100);
    const fit = await evaluate(async () => {
      const style = getComputedStyle(document.body);
      const image = new Image();
      image.src = JSON.parse(document.documentElement.style.getPropertyValue('--aemeath-wallpaper').slice(4, -1));
      await image.decode();
      const scale = Math.min(innerWidth / image.naturalWidth, innerHeight / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      return {
        viewport: [innerWidth, innerHeight], size: style.backgroundSize,
        position: style.backgroundPosition, repeat: style.backgroundRepeat,
        bounds: [(innerWidth - width) / 2, (innerHeight - height) / 2, width, height],
        rootFont: getComputedStyle(document.documentElement).fontSize,
        rootZoom: getComputedStyle(document.documentElement).zoom,
      };
    });
    assert.deepEqual(fit.viewport, [width, height]);
    assert.deepEqual(fit.size.split(',').slice(0, 2).map(value => value.trim()), ['100% 100%', 'contain']);
    assert.deepEqual(fit.position.split(',').slice(0, 2).map(value => value.trim()), ['50% 50%', '50% 50%']);
    assert.ok(fit.repeat.split(',').every(value => value.trim() === 'no-repeat'));
    assert.equal(fit.size.split(',').length, 8, 'Expected wash, photo and six stationary texture layers.');
    assert.equal(fit.rootFont, baseline.nodes[0].fontSize);
    assert.equal(fit.rootZoom, baseline.nodes[0].zoom);
    const [x, y, w, h] = fit.bounds;
    assert.ok(x >= -0.01 && y >= -0.01 && x + w <= width + 0.01 && y + h <= height + 0.01, 'Artwork must fit completely in the viewport.');
    assert.ok(Math.abs(w / h - 1.5) < 0.001, 'Artwork must retain its native aspect ratio.');
    responsive.push(fit);
    await screenshot(`responsive-${width}x${height}`);
  }
  await pipe.call('Emulation.clearDeviceMetricsOverride', {}, { sessionId });
  await delay(150);
  const stationary = await evaluate(async () => {
    const sample = () => {
      const style = getComputedStyle(document.body);
      return [style.backgroundImage, style.backgroundPosition, style.backgroundSize];
    };
    const before = sample();
    await new Promise(resolve => setTimeout(resolve, 600));
    return { unchanged: JSON.stringify(before) === JSON.stringify(sample()), animations: document.body.getAnimations().length };
  });
  assert.equal(stationary.unchanged, true, 'Letterbox texture must not change over time.');
  assert.equal(stationary.animations, 0, 'Wallpaper must not animate.');
  await evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, altKey: true, code: 'KeyB' })));
  await until(() => evaluate(() => !!document.getElementById('aemeath-extension-overlay')?.contentDocument.getElementById('settings-dialog')?.open), 'settings shortcut');
  assert.equal(await evaluate(() => document.getElementById('aemeath-extension-overlay').contentDocument.getElementById('settings-title').textContent), 'Customize your intro');
  await screenshot('07-english-settings');
  const disabled = await evaluate(() => {
    const win = document.getElementById('aemeath-extension-overlay').contentWindow;
    win.AEMEATH_SEND({ type: 'aemeath-boot', action: 'background', image: win.AEMEATH_ASSETS.artwork, strength: 0 });
    return window.__aemeathExtension.status();
  });
  assert.equal(disabled.wallpaper, false);
  assert.deepEqual(await evaluate(() => window.__nativeSmokeMeasure()), baseline, 'Disabling wallpaper changed native sizing.');
  const restored = await evaluate(() => {
    document.getElementById('aemeath-extension-overlay').contentDocument.getElementById('restore-appearance').click();
    return {
      extension: !!window.__aemeathExtension,
      style: !!document.getElementById('aemeath-extension-style'),
      overlay: !!document.getElementById('aemeath-extension-overlay'),
      skin: document.documentElement.hasAttribute('data-aemeath-skin'),
    };
  });
  assert.deepEqual(restored, { extension: false, style: false, overlay: false, skin: false });
  assert.deepEqual(await evaluate(() => window.__nativeSmokeMeasure()), baseline, 'Restore changed native sizing.');
  await screenshot('06-restored');
  await writeFile(join(output, 'metrics.json'), JSON.stringify({ baseline, during, frame, state, responsive, stationary, restored }, null, 2));
  console.log('PASS: Artificial Girl avatar, full intro, native sizing, five responsive wallpaper ratios, settings and Restore.');
  console.log('Screenshots and metrics:', output);
} finally {
  pipe.close();
  const waitForExit = milliseconds => Promise.race([
    exited.then(() => true), delay(milliseconds).then(() => false),
  ]);
  let terminated = await waitForExit(2000);
  if (!terminated) {
    child.kill('SIGTERM');
    terminated = await waitForExit(5000);
  }
  if (!terminated) {
    child.kill('SIGKILL');
    terminated = await waitForExit(5000);
  }
  child.stderr.destroy();
  await writeFile(join(output, 'desktop.log'), errors);
  assert.ok(terminated, `Test desktop did not exit; temporary profile retained at ${profile}`);
  await rm(profile, { recursive: true, force: true });
}
