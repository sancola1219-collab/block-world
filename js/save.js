// 存檔編解碼 — 純邏輯，node 可測（storage 由呼叫端注入，瀏覽器用 localStorage）。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

// v2：新增關卡(ninja/dragonknight)、方塊 id 37-44、weather。舊版客戶端(v1)會拒讀 v2
// 存檔（回傳「無存檔」而非把新方塊誤判成空氣），避免 Pages CDN 快取舊 JS 時靜默劣化。
const SAVE_VERSION = 2;
const KNOWN_VERSIONS = [1, 2]; // 本版可讀的存檔版本（新版讀得懂舊存檔）
const SAVE_KEY = 'mineworld.save.v1';

function encodeSave(state) {
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: state.seed,
    mode: state.mode,
    time: state.time,
    player: state.player,   // {x,y,z,yaw,pitch,hp,air,fly}
    spawn: state.spawn,     // 重生點
    inv: state.inv,         // serializeInv 的結果
    edits: state.edits,     // world.serializeEdits 的結果
    // 冒險關卡進度
    level: state.level !== undefined ? state.level : null,
    quest: state.quest !== undefined ? state.quest : null,
    origin: state.origin !== undefined ? state.origin : null,
    pdrops: state.pdrops || [],
    weather: state.weather || null,
  });
}

function decodeSave(json) {
  try {
    const o = JSON.parse(json);
    if (!o || !KNOWN_VERSIONS.includes(o.v) || typeof o.seed !== 'number') return null;
    if (!o.player || typeof o.player.x !== 'number') return null;
    return o;
  } catch (e) {
    return null;
  }
}

function saveTo(storage, state) {
  try { storage.setItem(SAVE_KEY, encodeSave(state)); return true; }
  catch (e) { return false; }
}

function loadFrom(storage) {
  try {
    const json = storage.getItem(SAVE_KEY);
    return json ? decodeSave(json) : null;
  } catch (e) { return null; }
}

function clearSave(storage) {
  try { storage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
}

const MWSave = { SAVE_VERSION, SAVE_KEY, encodeSave, decodeSave, saveTo, loadFrom, clearSave };
if (typeof module !== 'undefined') module.exports = MWSave;
if (typeof window !== 'undefined') window.MWSave = MWSave;
})();
