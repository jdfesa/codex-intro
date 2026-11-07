/* Bundled portrait footage, with local preview overrides. The still is always the wallpaper. */
(function (scope) {
  'use strict';
  const start = 7.18;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  function durationFor(length) {
    return Number.isFinite(length) && length > 0 && length <= 12
      ? Math.max(12000, Math.round((start + length + 1) * 1000)) : 12000;
  }
  function stateAt(seconds, length) {
    const local = Math.max(0, Math.min(length, seconds - start));
    const visible = length > 0 && seconds >= start && seconds < start + length;
    const opacity = visible ? smooth((seconds - start) / .24) * (1 - smooth((local - length + .35) / .35)) : 0;
    return { local, visible, opacity };
  }
  function create(video, { reduced = false } = {}) {
    let url = null, source = null, length = 0, blocked = false, disposed = false, cancelLoad = null;
    video.muted = true; video.defaultMuted = true; video.loop = false; video.playsInline = true;
    video.playbackRate = 1; video.defaultPlaybackRate = 1;
    function pause() { if (!video.paused) video.pause(); }
    function reset() {
      pause(); length = 0; blocked = false; video.style.opacity = '0';
      video.removeAttribute('src'); video.load();
      if (url) scope.URL.revokeObjectURL(url); url = null;
    }
    async function load(next) {
      if (disposed) return 0;
      if (next === source && length) return length;
      cancelLoad?.(); reset(); source = next;
      video.dataset.state = reduced ? 'reduced' : 'disabled';
      if (reduced || !next) return 0;
      const bundled = next === 'media/intro-character.mp4';
      if (!bundled && (!/^data:video\/mp4;base64,[a-zA-Z0-9+/=]+$/.test(next) || next.length > 20 * 1024 * 1024)) return 0;
      try {
        if (!bundled) {
          const binary = scope.atob(next.slice(next.indexOf(',') + 1));
          const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
          url = scope.URL.createObjectURL(new scope.Blob([bytes], { type: 'video/mp4' }));
        }
      } catch { video.dataset.state = 'unavailable'; return 0; }
      return new Promise(resolve => {
        let settled = false;
        function finish(ok) {
          if (settled) return; settled = true;
          scope.clearTimeout(timeout); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); cancelLoad = null;
          if (ok && Number.isFinite(video.duration) && video.duration > 0 && video.duration <= 12) {
            length = video.duration; video.dataset.state = 'ready';
          } else { reset(); video.dataset.state = 'unavailable'; }
          resolve(length);
        }
        const ready = () => finish(true), failed = () => finish(false);
        const timeout = scope.setTimeout(failed, 2500);
        cancelLoad = failed;
        video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', failed, { once: true });
        video.src = url || next; video.load();
      });
    }
    function render(seconds, playing) {
      if (disposed || !length || blocked) return;
      const state = stateAt(seconds, length);
      video.style.opacity = String(state.opacity);
      if (Math.abs(video.currentTime - state.local) > (playing ? .18 : .015)) video.currentTime = state.local;
      if (playing && state.visible && video.paused) {
        video.play()?.catch(() => { blocked = true; pause(); video.style.opacity = '0'; video.dataset.state = 'blocked'; });
      } else if (!playing || !state.visible) pause();
    }
    function dispose() { cancelLoad?.(); reset(); disposed = true; scope.removeEventListener?.('pagehide', dispose); }
    scope.addEventListener?.('pagehide', dispose, { once: true });
    return { load, render, pause, dispose };
  }
  const api = { create, durationFor, stateAt };
  if (typeof module !== 'undefined') module.exports = api;
  else scope.startupMotion = api;
})(typeof window === 'undefined' ? globalThis : window);
