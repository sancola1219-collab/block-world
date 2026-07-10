// 輸入：鍵盤、滑鼠（Pointer Lock）、觸控（搖桿＋按鈕＝合成輸入）— 瀏覽器層。
// 觸控一律走與鍵鼠相同的通道（setTouchMove / 合成按鍵），不另開邏輯分支。
'use strict';

(function () {
  const state = {
    keys: new Set(),
    mouseDown: [false, false, false],
    yaw: 0, pitch: 0,
    touchMove: { x: 0, y: 0 },     // 類比移動（-1..1）；推滿 > 0.85 = 奔跑
    locked: false,
    lockCooldown: 0,               // Esc 後 ~1.25s 內重鎖會失敗
    wheelDelta: 0,
    transient: { leftClick: false, rightClick: false, midClick: false },
    dragLook: false,
  };

  const listeners = { lock: [], key: [] };
  let canvas = null;
  const isTouch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (navigator.maxTouchPoints || 0) > 0;

  function attach(cv) {
    canvas = cv;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F5' && false) e.preventDefault();
      if (!e.repeat) {
        state.keys.add(e.code);
        for (const fn of listeners.key) fn(e.code, true, e);
      }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      state.keys.delete(e.code);
      for (const fn of listeners.key) fn(e.code, false, e);
    });
    window.addEventListener('blur', () => state.keys.clear());

    cv.addEventListener('mousedown', (e) => {
      state.mouseDown[e.button] = true;
      if (state.locked) {
        if (e.button === 0) state.transient.leftClick = true;
        if (e.button === 1) { state.transient.midClick = true; e.preventDefault(); }
        if (e.button === 2) state.transient.rightClick = true;
      }
    });
    window.addEventListener('mouseup', (e) => { state.mouseDown[e.button] = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { state.wheelDelta += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      state.locked = document.pointerLockElement === cv;
      if (!state.locked) state.lockCooldown = performance.now() + 1350;
      for (const fn of listeners.lock) fn(state.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      state.lockCooldown = performance.now() + 1350;
    });
    document.addEventListener('mousemove', (e) => {
      if (!state.locked) return;
      const s = 0.0024;
      state.yaw -= e.movementX * s;
      state.pitch -= e.movementY * s;
      const lim = Math.PI / 2 - 0.01;
      if (state.pitch > lim) state.pitch = lim;
      if (state.pitch < -lim) state.pitch = -lim;
    });

    if (isTouch) setupTouch();
  }

  function requestLock() {
    if (!canvas || state.locked || isTouch) return;
    if (performance.now() < state.lockCooldown) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { state.lockCooldown = performance.now() + 1350; });
    } catch (e) { /* 舊瀏覽器 */ }
  }
  function releaseLock() {
    if (state.locked && document.exitPointerLock) document.exitPointerLock();
  }

  // ---- 觸控 ----
  function setupTouch() {
    document.body.classList.add('is-touch');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const lookZone = document.getElementById('look-zone');
    let stickId = -1, stickCx = 0, stickCy = 0;
    let lookId = -1, lookX = 0, lookY = 0, lookMoved = 0, lookT0 = 0;

    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      stickCx = r.left + r.width / 2; stickCy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });

    const stickMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        const dx = (t.clientX - stickCx) / 45, dy = (t.clientY - stickCy) / 45;
        const l = Math.hypot(dx, dy), cl = Math.min(1, l);
        state.touchMove.x = l > 0 ? dx / l * cl : 0;
        state.touchMove.y = l > 0 ? dy / l * cl : 0;
        knob.style.transform = `translate(${state.touchMove.x * 34}px, ${state.touchMove.y * 34}px)`;
        e.preventDefault();
      }
    };
    stick.addEventListener('touchmove', stickMove, { passive: false });
    const stickEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = -1;
        state.touchMove.x = 0; state.touchMove.y = 0;
        knob.style.transform = '';
      }
    };
    stick.addEventListener('touchend', stickEnd);
    stick.addEventListener('touchcancel', stickEnd);

    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (lookId !== -1) return;
      lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
      lookMoved = 0; lookT0 = performance.now();
      e.preventDefault();
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const s = 0.006;
        state.yaw -= (t.clientX - lookX) * s;
        state.pitch -= (t.clientY - lookY) * s;
        lookMoved += Math.abs(t.clientX - lookX) + Math.abs(t.clientY - lookY);
        const lim = Math.PI / 2 - 0.01;
        state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
        lookX = t.clientX; lookY = t.clientY;
        e.preventDefault();
      }
    }, { passive: false });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        lookId = -1;
        // 快速輕點 = 挖掘一下（合成左鍵）
        if (lookMoved < 12 && performance.now() - lookT0 < 250) state.transient.leftClick = true;
      }
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    // 觸控按鈕：data-code 合成按鍵、data-mouse 合成滑鼠
    document.querySelectorAll('.tbtn').forEach((btn) => {
      const code = btn.dataset.code, mouse = btn.dataset.mouse;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        if (code) { state.keys.add(code); for (const fn of listeners.key) fn(code, true, e); }
        if (mouse === '0') { state.mouseDown[0] = true; state.transient.leftClick = true; }
        if (mouse === '2') { state.mouseDown[2] = true; state.transient.rightClick = true; }
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        if (code) { state.keys.delete(code); for (const fn of listeners.key) fn(code, false, e); }
        if (mouse === '0') state.mouseDown[0] = false;
        if (mouse === '2') state.mouseDown[2] = false;
      };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
    });
  }

  // 每 tick 由 main 取樣的移動軸
  function moveAxes() {
    let mf = 0, ms = 0, run = false;
    if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) mf += 1;
    if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) mf -= 1;
    if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) ms += 1;
    if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) ms -= 1;
    run = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
    const tl = Math.hypot(state.touchMove.x, state.touchMove.y);
    if (tl > 0.05) {
      mf = -state.touchMove.y; ms = state.touchMove.x;
      if (tl > 0.85) run = true;
    }
    return { mf, ms, run };
  }

  function clearTransient() {
    state.transient.leftClick = false;
    state.transient.rightClick = false;
    state.transient.midClick = false;
    state.wheelDelta = 0;
  }

  function onLockChange(fn) { listeners.lock.push(fn); }
  function onKey(fn) { listeners.key.push(fn); }

  window.MWInput = { state, attach, requestLock, releaseLock, moveAxes, clearTransient, onLockChange, onKey, isTouch };
})();
