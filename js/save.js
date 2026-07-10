// 存檔編解碼 — 純邏輯，node 可測（storage 由呼叫端注入，瀏覽器用 localStorage）。
'use strict';

const SAVE_VERSION = 1;
const SAVE_KEY = 'mineworld.save.v1';

function encodeSave(state) {
  return JSON.stringify({
    v: SAVE_VERSION,
    seed: state.seed,
    mode: state.mode,
    time: state.time,
    player: state.player,   // {x,y,z,yaw,pitch,hp,air,fly}
    inv: state.inv,         // serializeInv 的結果
    edits: state.edits,     // world.serializeEdits 的結果
  });
}

function decodeSave(json) {
  try {
    const o = JSON.parse(json);
    if (!o || o.v !== SAVE_VERSION || typeof o.seed !== 'number') return null;
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
