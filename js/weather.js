// 天氣系統 — 純邏輯，node 可測。
// 天氣是純視覺狀態（不影響玩法規則），但狀態機在 tick 內推進、隨機一律經傳入的 rand。
// type: clear 晴 / cloudy 多雲 / rain 下雨 / storm 雷暴。雨/雪由呼叫端依生物群系決定呈現。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

// precip：降水強度目標；cloud：雲量目標；dark：天空變暗目標；minT/maxT：這種天氣持續秒數範圍
const TYPES = {
  clear:  { precip: 0.0, cloud: 0.25, dark: 0.00, minT: 70, maxT: 150 },
  cloudy: { precip: 0.0, cloud: 0.95, dark: 0.16, minT: 50, maxT: 110 },
  rain:   { precip: 0.7, cloud: 1.00, dark: 0.42, minT: 35, maxT: 80 },
  storm:  { precip: 1.0, cloud: 1.00, dark: 0.66, minT: 25, maxT: 55 },
};

// 轉移權重（偏好晴/多雲，雷暴稀有）
const NEXT = {
  clear:  [['cloudy', 0.62], ['rain', 0.30], ['storm', 0.08]],
  cloudy: [['clear', 0.50], ['rain', 0.38], ['storm', 0.12]],
  rain:   [['cloudy', 0.55], ['clear', 0.28], ['storm', 0.17]],
  storm:  [['rain', 0.70], ['cloudy', 0.30]],
};

function pick(list, r) {
  const total = list.reduce((s, x) => s + x[1], 0);
  const t = r * total;
  let acc = 0;
  for (const [k, w] of list) { acc += w; if (t <= acc) return k; }
  return list[list.length - 1][0];
}

function createWeather(rand) {
  const r = rand || (() => 0.5);
  return {
    type: 'clear',
    precip: 0, cloud: 0.25, gloom: 0, // 平滑過渡中的當前值
    timer: 40 + r() * 40,
    flash: 0, thunderCool: 4 + r() * 8,
    struck: false,
  };
}

// 推進一個時步。回傳 true 表示這一刻打了新的閃電（呼叫端播雷聲）。
function stepWeather(w, dt, rand) {
  w.struck = false;
  const def = TYPES[w.type] || TYPES.clear;

  // 平滑過渡：約 2.5 秒到位，避免天氣瞬變
  const rate = 0.4 * dt;
  const approach = (cur, tgt) => cur + Math.max(-rate, Math.min(rate, tgt - cur));
  w.precip = approach(w.precip, def.precip);
  w.cloud = approach(w.cloud, def.cloud);
  w.gloom = approach(w.gloom, def.dark);

  // 閃電：flash 衰減；雷暴且雨勢夠大時定時打閃
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.6);
  if (w.type === 'storm' && w.precip > 0.5) {
    w.thunderCool -= dt;
    if (w.thunderCool <= 0) {
      w.thunderCool = 4 + rand() * 9;
      w.flash = 1;
      w.struck = true;
    }
  }

  // 換天氣
  w.timer -= dt;
  if (w.timer <= 0) {
    w.type = pick(NEXT[w.type] || NEXT.clear, rand());
    const nd = TYPES[w.type];
    w.timer = nd.minT + rand() * (nd.maxT - nd.minT);
  }
  return w.struck;
}

function weatherLabel(w) {
  return { clear: '☀ 晴', cloudy: '⛅ 多雲', rain: '🌧 下雨', storm: '⛈ 雷暴' }[w.type] || '';
}

const MWWeather = { TYPES, createWeather, stepWeather, weatherLabel };
if (typeof module !== 'undefined') module.exports = MWWeather;
if (typeof window !== 'undefined') window.MWWeather = MWWeather;
})();
