// 世界（區塊儲存、方塊存取、天光、玩家改動追蹤）— 純邏輯，node 可測。
'use strict';

const WG = (typeof module !== 'undefined') ? require('./worldgen.js') : window.MWWorldgen;
const BK2 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { CHUNK, WORLD_H, idx } = WG;
const { B, isOpaque, isLiquid } = BK2;

class World {
  constructor(seed) {
    this.seed = seed | 0;
    this.chunks = new Map();   // "cx,cz" -> {cx, cz, data, tops}
    this.edits = new Map();    // "cx,cz" -> Map(idx -> id)
    this.dirty = new Set();    // 需要重建網格的區塊 key
  }

  key(cx, cz) { return cx + ',' + cz; }
  hasChunk(cx, cz) { return this.chunks.has(this.key(cx, cz)); }

  getChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      const data = WG.generateChunk(this.seed, cx, cz);
      const ed = this.edits.get(k);
      if (ed) for (const [i, id] of ed) data[i] = id;
      c = { cx, cz, data, tops: new Uint8Array(CHUNK * CHUNK) };
      this.recomputeTops(c);
      this.chunks.set(k, c);
    }
    return c;
  }

  recomputeTops(c) {
    for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) this.recomputeTop(c, lx, lz);
  }
  recomputeTop(c, lx, lz) {
    let y = WORLD_H - 1;
    while (y > 0 && !isOpaque(c.data[idx(lx, lz, y)])) y--;
    c.tops[(lx << 4) | lz] = y;
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= WORLD_H) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.getChunk(cx, cz);
    return c.data[idx(x - cx * CHUNK, z - cz * CHUNK, y)];
  }

  setBlock(x, y, z, id) {
    if (y < 1 || y >= WORLD_H) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const i = idx(lx, lz, y);
    if (c.data[i] === id) return false;
    c.data[i] = id;
    this.recomputeTop(c, lx, lz);
    const k = this.key(cx, cz);
    let ed = this.edits.get(k);
    if (!ed) { ed = new Map(); this.edits.set(k, ed); }
    ed.set(i, id);
    // 標記自己與（在邊界時）鄰區塊為髒
    this.dirty.add(k);
    if (lx === 0) this.dirty.add(this.key(cx - 1, cz));
    if (lx === CHUNK - 1) this.dirty.add(this.key(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.key(cx, cz - 1));
    if (lz === CHUNK - 1) this.dirty.add(this.key(cx, cz + 1));
    return true;
  }

  // 該柱最高不透明方塊的 y
  topAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.getChunk(cx, cz);
    return c.tops[((x - cx * CHUNK) << 4) | (z - cz * CHUNK)];
  }

  // 天光 0..15：柱掃描＋鄰柱取樣（洞口附近有漸層），水中隨深度變暗
  lightAt(x, y, z) {
    let best = 0;
    const t0 = this.topAt(x, z);
    best = y >= t0 ? 15 : 15 - (t0 - y) * 4;
    if (best < 15) {
      const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) {
        const t = this.topAt(x + NB[i][0], z + NB[i][1]);
        const v = (y >= t ? 15 : 15 - (t - y) * 4) - 4;
        if (v > best) best = v;
      }
    }
    if (isLiquid(this.getBlock(x, y, z))) {
      best -= Math.max(0, WG.SEA - y) * 1.2 + 2;
    }
    return Math.max(0, Math.min(15, best));
  }

  // 卸載遠處區塊（保留玩家改動於 edits）
  unloadBeyond(pcx, pcz, radius) {
    const removed = [];
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > radius || Math.abs(c.cz - pcz) > radius) {
        this.chunks.delete(k);
        removed.push(k);
      }
    }
    return removed;
  }

  serializeEdits() {
    const out = {};
    for (const [k, ed] of this.edits) {
      const arr = [];
      for (const [i, id] of ed) { arr.push(i, id); }
      out[k] = arr;
    }
    return out;
  }

  loadEdits(obj) {
    this.edits.clear();
    this.chunks.clear();
    for (const k in obj) {
      const arr = obj[k];
      const ed = new Map();
      for (let i = 0; i < arr.length; i += 2) ed.set(arr[i], arr[i + 1]);
      this.edits.set(k, ed);
    }
  }
}

const MWWorld = { World };
if (typeof module !== 'undefined') module.exports = MWWorld;
if (typeof window !== 'undefined') window.MWWorld = MWWorld;
