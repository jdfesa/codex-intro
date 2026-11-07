// Opt-in real desktop QA. Always uses a disposable, signed-out profile.
// Run: xvfb-run -a -s '-screen 0 1280x900x24' node tests/linux/desktop-smoke.mjs
// Or: node tests/linux/desktop-smoke.mjs --wayland (opens an isolated test window).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { pageTarget } from '../../shared/desktop/cdp.mjs';
import { buildInjection } from '../../shared/desktop/payload.mjs';
import { connectPipe } from '../../platforms/linux/cdp-pipe.mjs';
import { desktopArgs, installInDesktop } from '../../platforms/linux/run.mjs';

assert.equal(process.platform, 'linux', 'This smoke test requires Linux.');
const { values } = parseArgs({ options: { wayland: { type: 'boolean' }, motion: { type: 'string' } } });
const wayland = !!values.wayland;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const motion = values.motion ? 'data:video/mp4;base64,' + (await readFile(resolve(root, values.motion))).toString('base64') : undefined;
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
  async function evaluate(fn, ...args) {
    const response = await pipe.call('Runtime.evaluate', {
      expression: `(${fn.toString()})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true,
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
      titleFont: overlay.contentWindow.getComputedStyle(doc.querySelector('.boot-title')).fontFamily,
      statusFont: overlay.contentWindow.getComputedStyle(doc.querySelector('.subtitle')).fontFamily,
      loadedFonts: Array.from(doc.fonts,face=>({family:face.family,status:face.status})),
      imageFit: overlay.contentWindow.getComputedStyle(doc.querySelector('.artwork')).objectFit,
      contourFit: overlay.contentWindow.getComputedStyle(doc.querySelector('.line-art')).objectFit,
      language: doc.documentElement.lang,
      subtitle: doc.querySelector('#subtitle').textContent,
      english: !/[\u3400-\u9fff]/u.test(doc.body.textContent),
      portrait: { state: doc.querySelector('.artwork-motion').dataset.state,
        duration: doc.querySelector('.artwork-motion').duration,
        intro: Number(doc.querySelector('.window').dataset.duration) },
    };
  });
  assert.deepEqual(frame.dimensions.slice(0, 2), frame.dimensions.slice(2), 'Overlay must fill the viewport without resizing the app.');
  assert.equal(frame.title, 'ARTIFICIAL GIRL');
  assert.ok(frame.avatar.every(dimension => dimension > 0), 'The bundled avatar must load, regardless of source aspect ratio.');
  assert.equal(frame.avatarFit, 'cover');
  assert.ok(frame.titleFont.startsWith('"Special Elite"'), 'Opening title must use Special Elite.');
  assert.ok(frame.statusFont.startsWith('"OCR A"'), 'Status subtitle must use OCR A.');
  for (const family of ['Special Elite', 'OCR A']) {
    assert.ok(frame.loadedFonts.some(face=>face.family===family&&face.status==='loaded'), `${family} must load inside the iframe.`);
  }
  assert.equal(frame.imageFit, 'contain');
  assert.equal(frame.contourFit, 'contain');
  assert.equal(frame.language, 'en');
  assert.equal(frame.subtitle, 'Ready to use.');
  assert.equal(frame.english, true);
  assert.deepEqual(frame.portrait, { state: 'ready', duration: 6, intro: 14.18 }, 'The default installed payload must include the approved six-second clip.');
  const elapsed = () => evaluate(() => Number(document.getElementById('aemeath-extension-overlay')?.contentDocument.querySelector('.window')?.dataset.elapsed ?? 99));
  const codeFrames = [];
  for (const [time, name] of [[2.8, '02-identity'], [5.7, '03-contours'], [8.5, '04-artwork']]) {
    await until(async () => await elapsed() >= time, `intro at ${time}s`, 15000);
    const code = await evaluate(() => {
      const win = document.getElementById('aemeath-extension-overlay').contentWindow;
      const canvas = win.document.querySelector('.startup-code'), style = win.getComputedStyle(canvas);
      return { lines: Number(canvas.dataset.lines), motion: canvas.dataset.motion,
        opacity: Number(style.opacity), pointerEvents: style.pointerEvents,
        painted: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(value => value !== 0) };
    });
    assert.ok(code.lines > 0 && code.opacity > 0 && code.painted, 'The additive code layer must render inside the real desktop iframe.');
    assert.equal(code.motion, 'full'); assert.equal(code.pointerEvents, 'none');
    codeFrames.push(code);
    await screenshot(name);
    if (time === 5.7) {
      const deterministic = await evaluate(async () => {
        const win = document.getElementById('aemeath-extension-overlay').contentWindow, doc = win.document;
        const timeline = doc.getElementById('timeline'), canvas = doc.querySelector('.startup-code');
        const seek = value => { timeline.value = String(value); timeline.dispatchEvent(new win.Event('input')); };
        seek(5.7); const first = canvas.toDataURL();
        await new Promise(resolve => win.setTimeout(resolve, 180));
        const paused = first === canvas.toDataURL();
        seek(2.8); seek(5.7); const replayed = first === canvas.toDataURL();
        doc.getElementById('pause').click();
        return { paused, replayed };
      });
      assert.deepEqual(deterministic, { paused: true, replayed: true }, 'Pause and backwards seeking must control the code layer too.');
    }
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
  for (const [width, height] of [[1280, 720], [900, 900], [905, 990], [600, 1000], [3440, 1440], [390, 844]]) {
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
    assert.deepEqual(fit.repeat.split(',').map(value => value.trim()),
      ['no-repeat', 'no-repeat', 'repeat', 'repeat', 'repeat', 'repeat', 'no-repeat', 'no-repeat']);
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
  await pipe.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, { sessionId });
  await installInDesktop(pipe, await buildInjection(root, { motion }));
  const reducedCode = await evaluate(() => {
    const win = document.getElementById('aemeath-extension-overlay').contentWindow, doc = win.document;
    const canvas = doc.querySelector('.startup-code'), timeline = doc.getElementById('timeline');
    const seek = value => { timeline.value = String(value); timeline.dispatchEvent(new win.Event('input')); };
    seek(2); const first = canvas.toDataURL(); seek(8);
    const video = doc.querySelector('.artwork-motion');
    const result = { static: first === canvas.toDataURL(), motion: canvas.dataset.motion,
      videoDisabled: !video.getAttribute('src'), duration: Number(doc.querySelector('.window').dataset.duration) };
    doc.querySelector('.skip').click();
    return result;
  });
  assert.deepEqual(reducedCode, { static: true, motion: 'reduced', videoDisabled: true, duration: 12 });
  assert.equal(await evaluate(() => window.__aemeathExtension.status().overlay), false, 'Skip must remove the reduced-motion overlay.');
  await evaluate(() => window.__aemeathExtension.dispose());
  await pipe.call('Emulation.setEmulatedMedia', { features: [] }, { sessionId });
  let portrait = null;
  if (motion) {
    await installInDesktop(pipe, await buildInjection(root, { motion }));
    portrait = await evaluate(() => {
      const win = document.getElementById('aemeath-extension-overlay').contentWindow, doc = win.document;
      const video = doc.querySelector('.artwork-motion');
      return { state: video.dataset.state, source: video.getAttribute('src')?.startsWith('blob:'),
        duration: video.duration, intro: Number(doc.querySelector('.window').dataset.duration),
        muted: video.muted, loop: video.loop, speed: video.playbackRate, fit: win.getComputedStyle(video).objectFit };
    });
    assert.equal(portrait.state, 'ready', 'Local motion must decode without weakening the real app CSP.');
    assert.equal(portrait.source, true); assert.equal(portrait.muted, true); assert.equal(portrait.loop, false);
    assert.equal(portrait.speed, 1); assert.equal(portrait.fit, 'contain');
    assert.ok(portrait.intro >= 12 && portrait.intro < 24);
    for (const [time, name] of [[8.2, '08-motion-opening'], [10.5, '09-motion-hair'], [12.7, '10-motion-ending']]) {
      const fit = await evaluate(async time => {
        const win = document.getElementById('aemeath-extension-overlay').contentWindow, doc = win.document;
        const video = doc.querySelector('.artwork-motion'), timeline = doc.getElementById('timeline');
        await new Promise(resolve => {
          const done = () => { win.clearTimeout(timeout); video.removeEventListener('seeked', done); resolve(); };
          const timeout = win.setTimeout(done, 1000);
          video.addEventListener('seeked', done, { once: true });
          timeline.value = String(time); timeline.dispatchEvent(new win.Event('input'));
        });
        await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
        return { paused: video.paused, time: video.currentTime, opacity: Number(win.getComputedStyle(video).opacity) };
      }, time);
      assert.equal(fit.paused, true); assert.ok(fit.opacity > 0);
      await screenshot(name);
    }
    const playback = await evaluate(async () => {
      const win = document.getElementById('aemeath-extension-overlay').contentWindow, doc = win.document;
      const video = doc.querySelector('.artwork-motion'), timeline = doc.getElementById('timeline');
      timeline.value = '9'; timeline.dispatchEvent(new win.Event('input'));
      doc.getElementById('pause').click(); const before = video.currentTime;
      await new Promise(resolve => win.setTimeout(resolve, 400));
      return { advances: video.currentTime > before + .2, playing: !video.paused };
    });
    assert.deepEqual(playback, { advances: true, playing: true });
    await until(() => evaluate(() => window.__aemeathExtension.status().completed), 'optional portrait completion', 20000);
    assert.equal(await evaluate(() => !!document.querySelector('video, #aemeath-extension-overlay')), false);
    await evaluate(() => window.__aemeathExtension.dispose());
  }
  await writeFile(join(output, 'metrics.json'), JSON.stringify({ baseline, during, frame, codeFrames, reducedCode, portrait, state, responsive, stationary, restored }, null, 2));
  console.log('PASS: Additive code, pause/seek, reduced motion, full intro, native sizing, six wallpaper ratios, settings and Restore.');
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
