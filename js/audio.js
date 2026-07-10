// WebAudio 合成音效與環境配樂 — 瀏覽器層。零素材，全部程序合成。
'use strict';

(function () {
  let ctx = null, master = null, musicGain = null, musicOn = true, musicTimer = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
  }

  function blip(freq, dur, type, vol, slide) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    env(g, t, 0.005, dur, vol || 0.2);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, vol, lp) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // 依方塊材質分挖掘聲
  function digSound(kind) {
    if (kind === 'stone') { noiseBurst(0.08, 0.22, 900); }
    else if (kind === 'wood') { blip(180, 0.09, 'square', 0.12, 0.6); noiseBurst(0.05, 0.1, 700); }
    else if (kind === 'sand') { noiseBurst(0.12, 0.18, 500); }
    else if (kind === 'leaf') { noiseBurst(0.09, 0.12, 2500); }
    else { noiseBurst(0.1, 0.16, 700); } // dirt
  }

  const SFX = {
    dig: digSound,
    breakBlock(kind) { digSound(kind); blip(kind === 'stone' ? 320 : 260, 0.12, 'triangle', 0.15, 0.5); },
    place() { blip(220, 0.08, 'square', 0.14, 0.8); noiseBurst(0.04, 0.08, 900); },
    pickup() { blip(660, 0.09, 'sine', 0.18, 1.6); },
    jump() { blip(300, 0.08, 'sine', 0.06, 1.4); },
    splash() { noiseBurst(0.25, 0.22, 600); },
    hurt() { blip(160, 0.18, 'sawtooth', 0.22, 0.55); },
    die() { blip(220, 0.6, 'sawtooth', 0.25, 0.25); },
    zombie() { blip(90 + Math.random() * 40, 0.5, 'sawtooth', 0.10, 0.8); },
    pig() { blip(340 + Math.random() * 80, 0.15, 'square', 0.10, 1.3); },
    attackHit() { noiseBurst(0.06, 0.2, 1600); blip(140, 0.1, 'square', 0.12, 0.7); },
    craft() { blip(440, 0.08, 'triangle', 0.15, 1.25); blip(660, 0.1, 'triangle', 0.12, 1.2); },
    click() { blip(500, 0.04, 'square', 0.08, 1); },
    drown() { noiseBurst(0.3, 0.2, 400); },
  };

  // 環境配樂：緩慢的五聲音階琶音
  const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  function musicTick() {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime;
    if (Math.random() < 0.7) {
      const f = SCALE[(Math.random() * SCALE.length) | 0];
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f / 2;
      env(g, t, 0.6, 2.6, 0.5);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 3.4);
      if (Math.random() < 0.35) {
        const o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = f * 0.75;
        env(g2, t + 0.8, 0.6, 2.2, 0.3);
        o2.connect(g2); g2.connect(musicGain);
        o2.start(t + 0.8); o2.stop(t + 4);
      }
    }
  }

  function startMusic() {
    if (!ensure()) return;
    if (musicTimer) return;
    musicTimer = setInterval(musicTick, 2200);
  }
  function setMusic(on) {
    musicOn = on;
    if (musicGain) musicGain.gain.value = on ? 0.16 : 0;
  }

  window.MWAudio = { ensure, SFX, startMusic, setMusic, isMusicOn: () => musicOn };
})();
