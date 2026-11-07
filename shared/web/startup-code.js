/* Decorative source text and light traces. The intro owns the only playback clock. */
(function (scope) {
  'use strict';
  const lines = [
    '// local visual sequence',
    'const surface = await renderer.attach();',
    'const identity = await avatar.decode();',
    'await identity.align(surface.center);',
    'const signal = resonance.sample();',
    'signal.phase = "initializing";',
    'await contours.prepare(artwork);',
    'const fragments = identity.release();',
    'fragments.preserve("source");',
    '// scattered light / retained memory',
    'const field = signal.scatter(fragments);',
    'field.palette = ["cyan", "violet"];',
    'await field.resolve(contours);',
    'const paths = contours.trace();',
    'paths.order("left-to-right");',
    'await paths.assemble({ gently: true });',
    '// every edge belongs to the image',
    'const portrait = artwork.reveal();',
    'portrait.fit = "contain";',
    'portrait.camera = "locked";',
    'await light.follow(paths);',
    'const pulse = signal.synchronize();',
    'pulse.tint = "soft-copper";',
    'await surface.blend(portrait);',
    '// a quiet workspace follows',
    'const workspace = surface.prepare();',
    'workspace.keep("native-layout");',
    'workspace.keep("your-settings");',
    'await signal.settle();',
    'const handoff = workspace.ready();',
    'handoff.preserve(portrait);',
    'await surface.release();',
    '// ready when you are',
    'return workspace;',
  ];
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const palette = { plain: '#a8b2c1', comment: '#778995', keyword: '#c09bbd', string: '#8dc5cb', number: '#c8baa1' };
  function tokenize(line) {
    const tokens = [], pattern = /\/\/.*$|"[^"]*"|\b(?:const|await|return|true|false)\b|\b\d+(?:\.\d+)?\b/g;
    let offset = 0;
    for (const match of line.matchAll(pattern)) {
      if (match.index > offset) tokens.push({ text: line.slice(offset, match.index), offset, color: palette.plain });
      const text = match[0], color = text.startsWith('//') ? palette.comment : text.startsWith('"') ? palette.string : /^\d/.test(text) ? palette.number : palette.keyword;
      tokens.push({ text, offset: match.index, color }); offset = match.index + text.length;
    }
    if (offset < line.length) tokens.push({ text: line.slice(offset), offset, color: palette.plain });
    return tokens;
  }
  const source = lines.map(text => ({ text, tokens: tokenize(text) }));
  function stateAt(seconds, reduced = false) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const clock = reduced ? 4.8 : Math.max(0, time - .8);
    const written = Math.min(source.length, clock * 3.5), count = Math.floor(written);
    const strength = .48 + .38 * smooth((time - 4.1) / .8) - .22 * smooth((time - 7.2) / .5);
    const opacity = reduced ? (time >= 1.4 && time < 10.8 ? .32 : 0)
      : smooth((time - .7) / .8) * (1 - smooth((time - 10.1) / .7)) * strength;
    return { time, count, fraction: reduced ? 0 : written - count, opacity, trails: !reduced && opacity > 0 };
  }
  function create(canvas, { reduced = false } = {}) {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return { render() {}, dispose() {} };
    let width = 0, height = 0, font = 0, cell = 0, lastStamp = '', lastTime = 0, disposed = false;
    function resize() {
      if (disposed) return;
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width); height = Math.max(1, box.height);
      const ratio = Math.max(1, Math.min(2, scope.devicePixelRatio || 1));
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      font = Math.max(7, Math.min(11, width / 110));
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      cell = ctx.measureText('M').width;
      lastStamp = ''; render(lastTime);
    }
    function lightTraces(state) {
      const t = state.time, colors = ['#80d0dc', '#ae8fcd', '#cb7eab', '#80d0dc', '#b09dc5'];
      ctx.lineWidth = .7;
      for (let i = 0; i < 5; i++) {
        const x = width * (.085 + i * .067) + Math.sin(t * .32 + i) * width * .008;
        const y = height * (.15 + ((t * .065 + i * .173) % .62)), length = height * (.09 + (i % 3) * .035);
        const gradient = ctx.createLinearGradient(x, y - length, x, y);
        gradient.addColorStop(0, 'transparent'); gradient.addColorStop(.85, colors[i]); gradient.addColorStop(1, '#e3e5ef');
        ctx.strokeStyle = gradient; ctx.globalAlpha = .48;
        ctx.beginPath(); ctx.moveTo(x, y - length); ctx.lineTo(x + Math.sin(t * .6 + i) * 2, y); ctx.stroke();
      }
      // Broad curves only accompany contour assembly; the portrait stays quiet.
      const assembly = smooth((t - 3.9) / .8) * (1 - smooth((t - 7.1) / .5));
      if (assembly > 0) {
        ctx.globalAlpha = assembly * .21; ctx.strokeStyle = '#a3b8ce';
        for (let i = 0; i < 2; i++) {
          const y = height * (.43 + i * .16 + Math.sin(t * .35 + i) * .025);
          ctx.beginPath(); ctx.moveTo(width * .035, y);
          ctx.bezierCurveTo(width * .25, y - height * .17, width * .58, y + height * .21, width * .88, y - height * .09);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    function render(seconds) {
      if (disposed) return;
      lastTime = seconds;
      const state = stateAt(seconds, reduced), stamp = `${width}:${height}:${reduced ? state.opacity : Math.floor(state.time * 30)}`;
      if (stamp === lastStamp) return; lastStamp = stamp;
      canvas.style.opacity = String(state.opacity);
      ctx.clearRect(0, 0, width, height);
      canvas.dataset.lines = String(state.count); canvas.dataset.motion = reduced ? 'reduced' : 'full';
      if (!state.opacity) return;
      if (state.trails) lightTraces(state);
      const x = width * .045, top = height * .21, bottom = height * .79;
      const column = Math.min(width * .30, 365), leading = font * 1.8;
      const rows = Math.max(1, Math.min(24, Math.floor((bottom - top) / leading)));
      const maxChars = Math.max(1, Math.floor(column / cell)), first = Math.max(0, state.count - rows + 1);
      const scroll = state.count >= rows ? state.fraction * leading : 0;
      ctx.save(); ctx.beginPath(); ctx.rect(x, top - leading, column, bottom - top + leading); ctx.clip();
      for (let index = first; index <= Math.min(state.count, source.length - 1); index++) {
        const y = top + (index - first + 1) * leading - scroll;
        const available = Math.min(maxChars, index === state.count ? Math.floor(state.fraction * source[index].text.length) : source[index].text.length);
        const edge = Math.min(1, Math.max(0, (y - top) / leading), Math.max(0, (bottom - y) / leading));
        ctx.globalAlpha = edge * (index === state.count ? .95 : .52);
        for (const token of source[index].tokens) {
          const length = Math.min(token.text.length, available - token.offset);
          if (length <= 0) break;
          ctx.fillStyle = token.color;
          ctx.fillText(length === token.text.length ? token.text : token.text.slice(0, length), x + token.offset * cell, y);
        }
        if (!reduced && index === state.count && available < maxChars) {
          ctx.fillStyle = '#b3d4db'; ctx.fillRect(x + available * cell + 2, y - font * .8, 1, font);
        }
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const observer = scope.ResizeObserver ? new scope.ResizeObserver(resize) : null;
    function dispose() {
      disposed = true; observer?.disconnect();
      scope.removeEventListener?.('resize', resize); scope.removeEventListener?.('pagehide', dispose);
    }
    observer?.observe(canvas);
    if (!observer) scope.addEventListener?.('resize', resize);
    scope.addEventListener?.('pagehide', dispose, { once: true });
    resize();
    return { render, dispose };
  }
  const api = { create, stateAt };
  if (typeof module !== 'undefined') module.exports = api;
  else scope.startupCode = api;
})(typeof window === 'undefined' ? {} : window);
