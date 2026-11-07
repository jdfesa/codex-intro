import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildInjection } from '../../shared/desktop/payload.mjs';

const require = createRequire(import.meta.url);
const { create, stateAt } = require('../../shared/web/startup-code.js');
const rootURL = new URL('../../', import.meta.url), root = fileURLToPath(rootURL);

function surface(width = 1000, height = 660) {
  const draws = [], gradients = [];
  const ctx = {
    setTransform() {}, clearRect() { draws.length = 0; },
    measureText() { return { width: 6 }; },
    beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {},
    save() {}, restore() {}, rect() {}, clip() {}, fillRect() {},
    createLinearGradient() { const stops = []; gradients.push(stops); return { addColorStop(...stop) { stops.push(stop); } }; },
    fillText(text, x, y) { draws.push({ text, x, y }); },
  };
  return { style: {}, dataset: {}, getContext: () => ctx, getBoundingClientRect: () => ({ width, height }), draws, gradients };
}

test('startup code is a pure, bounded function of the existing 12-second timeline', () => {
  assert.equal(stateAt(0).opacity, 0);
  assert.ok(stateAt(5).opacity > stateAt(2).opacity);
  assert.ok(stateAt(7).count > stateAt(3).count);
  for (const seconds of [-4, 0, .4, 2, 5, 8, 10.5, 12, 100000, NaN]) {
    const state = stateAt(seconds);
    assert.ok(Number.isFinite(state.opacity) && state.opacity >= 0 && state.opacity <= 1);
    assert.ok(state.count >= 0 && state.count <= 34);
  }
  assert.equal(stateAt(10.8).opacity, 0);
  assert.equal(stateAt(12).opacity, 0);
  assert.deepEqual(stateAt(5.25), stateAt(5.25));
});

test('reduced motion keeps one static source sample and omits all light traces', () => {
  const early = stateAt(2, true), late = stateAt(8, true);
  for (const key of ['count', 'fraction', 'opacity', 'trails']) assert.equal(early[key], late[key]);
  assert.equal(early.trails, false);
  assert.equal(early.fraction, 0);
  const canvas = surface(), code = create(canvas, { reduced: true });
  code.render(2); const first = [...canvas.draws];
  code.render(8);
  assert.deepEqual(canvas.draws, first);
  assert.equal(canvas.gradients.length, 0);
  assert.equal(canvas.dataset.motion, 'reduced');
});

test('seeking backwards and replaying rebuild the same text without timers or accumulated state', () => {
  const canvas = surface(), code = create(canvas);
  code.render(5.25); const first = [...canvas.draws];
  assert.ok(first.length > 0 && first.length < 140);
  code.render(2); code.render(5.25);
  assert.deepEqual(canvas.draws, first);
  code.render(12);
  assert.equal(canvas.style.opacity, '0');
  assert.equal(canvas.draws.length, 0);
  code.render(5.25);
  assert.deepEqual(canvas.draws, first);
  code.dispose(); code.render(8);
  assert.deepEqual(canvas.draws, first);
});

test('drawing stays bounded at mobile and desktop sizes and a missing context is harmless', () => {
  for (const [width, height] of [[390, 700], [1000, 660], [1920, 1080]]) {
    const canvas = surface(width, height), code = create(canvas);
    code.render(9);
    assert.ok(canvas.draws.length > 0 && canvas.draws.length < 140);
    assert.ok(canvas.draws.every(({ x, y }) => x >= 0 && x < width * .35 && y >= 0 && y < height));
    assert.ok(canvas.width <= width * 2 && canvas.height <= height * 2);
  }
  assert.doesNotThrow(() => create({ getContext: () => null }).render(5));
});

test('browser and desktop mount the additive helper without a second clock or host changes', async () => {
  const read = file => readFile(new URL(file, rootURL), 'utf8');
  const helper = await read('shared/web/startup-code.js');
  assert.doesNotMatch(helper, /requestAnimationFrame|setInterval|setTimeout|fetch\(|innerHTML/);
  const html = await read('shared/web/index.html');
  assert.ok(html.indexOf('src="startup-code.js"') < html.indexOf('src="animation.js"'));
  assert.match(html, /class="startup-code" aria-hidden="true"/);
  for (const layer of ['artwork', 'line-art', 'hud', 'intro', 'boot-logs']) assert.ok(html.includes(`class="${layer}"`));
  const animation = await read('shared/web/animation.js');
  assert.match(animation, /const duration = 12000/);
  assert.match(animation, /startupCode\.render\(s<=7\.43\?s:/);
  const injection = await buildInjection(root);
  assert.ok(injection.includes(helper));
  assert.ok(injection.indexOf(helper) < injection.indexOf('const startupCode = window.startupCode.create'));
});
