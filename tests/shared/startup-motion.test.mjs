import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildInjection } from '../../shared/desktop/payload.mjs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { create, stateAt, durationFor } = require('../../shared/web/startup-motion.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = 'data:video/mp4;base64,AA==';
class Video extends EventTarget {
  constructor({ error = false, autoplayError = false } = {}) {
    super(); Object.assign(this, { style: {}, dataset: {}, paused: true, currentTime: 0, duration: 6, error, autoplayError, plays: 0 });
  }
  removeAttribute(name) { delete this[name]; }
  load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event(this.error ? 'error' : 'loadeddata'))); }
  pause() { this.paused = true; }
  play() { this.plays++; this.paused = false; return this.autoplayError ? Promise.reject(new Error('Blocked')) : Promise.resolve(); }
}

test('motion preserves opening stages and expands only the portrait interval', () => {
  assert.equal(durationFor(0), 12000);
  assert.equal(durationFor(NaN), 12000);
  assert.equal(durationFor(90), 12000);
  assert.equal(durationFor(6), 14180);
  assert.equal(stateAt(7, 6).opacity, 0);
  assert.equal(stateAt(8, 6).opacity, 1);
  assert.equal(stateAt(13.18, 6).opacity, 0);
  assert.equal(stateAt(12, 6).local, 4.82);
});

test('local motion plays once at normal speed and pause/seek/replay follow the intro', async () => {
  const video = new Video(), motion = create(video);
  assert.equal(await motion.load(source), 6);
  assert.match(video.src, /^blob:/);
  assert.equal(video.muted, true); assert.equal(video.loop, false);
  assert.equal(video.playbackRate, 1);
  motion.render(8.18, true);
  assert.ok(Math.abs(video.currentTime - 1) < .001);
  assert.equal(video.paused, false);
  motion.pause(); assert.equal(video.paused, true);
  motion.render(10.18, false);
  assert.ok(Math.abs(video.currentTime - 3) < .001);
  assert.equal(video.paused, true);
  motion.render(14.18, true);
  assert.equal(video.style.opacity, '0'); assert.equal(video.paused, true);
  motion.render(0, false); assert.equal(video.currentTime, 0);
  assert.equal(await motion.load(null), 0);
  assert.equal(video.src, undefined);
  motion.dispose();
});

test('reduced motion, invalid sources and decoder failures leave the still usable', async () => {
  const reduced = new Video(), still = create(reduced, { reduced: true });
  assert.equal(await still.load(source), 0); assert.equal(reduced.src, undefined);
  assert.equal(reduced.dataset.state, 'reduced');
  still.dispose();
  const video = new Video({ error: true }), motion = create(video);
  assert.equal(await motion.load('https://example.com/video.mp4'), 0);
  assert.equal(await motion.load(source), 0);
  assert.equal(video.dataset.state, 'unavailable');
  assert.equal(video.src, undefined); motion.dispose();
});

test('autoplay rejection is handled without retry loops or a startup exception', async () => {
  const video = new Video({ autoplayError: true }), motion = create(video);
  await motion.load(source); motion.render(8, true);
  await Promise.resolve();
  assert.equal(video.dataset.state, 'blocked');
  assert.equal(video.style.opacity, '0');
  motion.render(9, true); assert.equal(video.plays, 1);
  motion.dispose();
});

test('bundled playback uses the exact approved media while local previews can override or disable it', async () => {
  const normal = await buildInjection(root);
  const match = normal.match(/"motion":"data:video\/mp4;base64,([^"]+)"/);
  assert.ok(match);
  assert.deepEqual(Buffer.from(match[1], 'base64'), await readFile(new URL('../../shared/web/media/intro-character.mp4', import.meta.url)));
  const still = await buildInjection(root, { motion: false });
  assert.doesNotMatch(still, /"motion":"data:video/);
  const preview = await buildInjection(root, { motion: source });
  assert.ok(preview.includes('"motion":"' + source + '"'));
  await assert.rejects(buildInjection(root, { motion: 'https://example.com/video.mp4' }), /local MP4/);
});

test('standalone playback accepts only the canonical relative clip, never arbitrary media paths', async () => {
  const video = new Video(), motion = create(video);
  assert.equal(await motion.load('media/intro-character.mp4'), 6);
  assert.equal(video.src, 'media/intro-character.mp4');
  assert.equal(await motion.load('../../tmp/intro-character.mp4'), 0);
  assert.equal(await motion.load('https://example.com/intro-character.mp4'), 0);
  assert.equal(video.src, undefined);
  motion.dispose();
});
