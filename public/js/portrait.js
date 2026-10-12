/* Portrait glue: live actors for the card in play, cheap stills for lists, and the voice switch.
 * One shared animation loop drives every live actor (at most a few are ever mounted). */
(function (LS) {
  'use strict';

  // ------------------------------------------------------------------ sound (only after the first tap)
  const snd = LS.sound = {
    enabled: LS.storage.get('ls.sound', true),
    unlocked: false,
    unlock() { snd.unlocked = true; snd.apply(); },
    set(on) { snd.enabled = !!on; LS.storage.set('ls.sound', snd.enabled); snd.apply(); },
    apply() {
      if (!window.PM || !PM.voice) return;
      try { PM.voice.mode = snd.unlocked && snd.enabled ? 'synth' : 'off'; } catch (e) { /* ignore */ }
      if (!snd.enabled || !snd.unlocked) try { PM.voice.stopAll(); } catch (e) { /* ignore */ }
    },
    stop() { try { PM.voice.stopAll(); } catch (e) { /* ignore */ } },

    // ---- effects: short ogg clips played through WebAudio so a swipe has no lag
    ctx: null, bufs: {}, loading: {},
    _load(name) {
      if (snd.bufs[name] || snd.loading[name] || !snd.ctx) return;
      snd.loading[name] = true;
      fetch('sfx/' + name + '.ogg').then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => snd.ctx.decodeAudioData(b, res, rej)))
        .then(buf => { snd.bufs[name] = buf; }).catch(() => { /* unsupported format: stay quiet */ });
    },
    /** play('click3', { vol: .6, rate: 1.1 }) */
    play(name, o = {}) {
      if (!snd.unlocked || !snd.enabled || !snd.ctx) return;
      const buf = snd.bufs[name];
      if (!buf) { snd._load(name); return; }
      try {
        const src = snd.ctx.createBufferSource(), gain = snd.ctx.createGain();
        src.buffer = buf; src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * 0.06);
        gain.gain.value = o.vol != null ? o.vol : 0.7;
        src.connect(gain); gain.connect(snd.ctx.destination); src.start();
      } catch (e) { /* ignore */ }
    },
    buzz(ms) { try { if (snd.enabled && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } },
  };
  const unlock0 = snd.unlock;
  snd.unlock = function () {
    unlock0();
    try {
      if (!snd.ctx) { snd.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (snd.ctx.state === 'suspended') snd.ctx.resume();
      for (const n of ['click', 'click2', 'click3', 'click4', 'snap', 'snap1', 'drop', 'cut', 'appear-online']) snd._load(n);
    } catch (e) { /* ignore */ }
  };

  // ------------------------------------------------------------------ live actors
  const live = new Set();
  let last = 0, running = false, acc = 0;
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000); last = t; acc += dt;
    if (acc < 1 / 30) return;
    const step = acc; acc = 0;
    if (document.hidden || LS.portrait.paused) return;
    for (const h of live) { try { h.actor.update(step); h.actor.draw(); h.sync && h.sync(); } catch (e) { console.warn('[actor]', e); } }
  }
  function ensureLoop() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  LS.portrait = {
    paused: false,

    /** Mount a live, animated portrait into `el`. Returns { actor, canvas, say(text), mood(m), act(a), destroy() }. */
    live(el, genome, o = {}) {
      const actor = new PM.Actor(genome, { width: o.width || 300 });
      actor.cv.className = 'portrait-canvas';
      el.append(actor.cv);
      actor.setExpr(o.mood || genome.expression || 'neutral');
      try { actor.draw(); } catch (e) { console.warn('[portrait]', e); }
      const h = {
        actor, canvas: actor.cv,
        say(text, speed) { if (!text) return; try { actor.say(text, speed); } catch (e) { /* ignore */ } },
        mood(m, gaze) { actor.setExpr(m, gaze); },
        act(a) { actor.act(a); },
        destroy() { live.delete(h); try { actor.destroy(); } catch (e) { /* ignore */ } actor.cv.remove(); },
      };
      live.add(h); ensureLoop();
      return h;
    },

    /** A still portrait on a fresh canvas (lists, thumbnails, the corner button). */
    still(genome, width = 120, o = {}) {
      const cv = document.createElement('canvas');
      cv.width = width; cv.height = Math.round(width * 1.25);
      cv.className = 'portrait-canvas';
      try { PM.render(cv, genome, o.render); } catch (e) { console.warn('[portrait]', e); }
      return cv;
    },
    /** Re-render an existing canvas in place. */
    paint(cv, genome, o = {}) { try { PM.render(cv, genome, o.render); } catch (e) { console.warn('[portrait]', e); } },
  };
})(window.LS = window.LS || {});
