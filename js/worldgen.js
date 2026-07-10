// 世界生成 — 純邏輯，node 可測。
// 決定性：任何 (seed, 世界座標) 永遠產生同一結果，跨區塊一致（樹會正確跨界）。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const N = (typeof module !== 'undefined') ? require('./noise.js') : window.MWNoise;
const BK = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { B } = BK;

const CHUNK = 16;      // 區塊邊長
const WORLD_H = 96;    // 世界高度
const SEA = 32;        // 海平面

function idx(x, z, y) { return ((x << 4) | z) * WORLD_H + y; } // x,z 為區塊內 0..15

// 地表高度（最上層固體方塊的 y）
function terrainHeight(seed, x, z) {
  const base = N.fbm2(seed + 1, x * 0.008, z * 0.008, 4, 2, 0.5);
  const detail = N.fbm2(seed + 2, x * 0.04, z * 0.04, 3, 2, 0.5);
  let h = 30 + (base - 0.5) * 26 + (detail - 0.5) * 6;
  const m = N.fbm2(seed + 3, x * 0.0025, z * 0.0025, 3, 2, 0.5); // 山脈因子
  if (m > 0.58) h += (m - 0.58) * 170;
  return Math.max(4, Math.min(WORLD_H - 12, Math.round(h)));
}

function biomeAt(seed, x, z) {
  const temp = N.fbm2(seed + 11, x * 0.0035, z * 0.0035, 3, 2, 0.5);
  const moist = N.fbm2(seed + 12, x * 0.0035 + 100, z * 0.0035 - 50, 3, 2, 0.5);
  if (temp < 0.42) return 'snow';
  if (temp > 0.60 && moist < 0.47) return 'desert';
  if (moist > 0.52) return 'forest';
  return 'plains';
}

// 該座標是否長樹/仙人掌（決定性，供跨區塊查詢）
function treeAt(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  if (h <= SEA + 1) return null;
  const b = biomeAt(seed, x, z);
  const r = N.hash2(seed + 41, x, z);
  const v = (r * 100000) | 0;
  if (b === 'forest' && r < 0.026) return { type: 'oak', trunk: 4 + v % 3, x, z, y: h + 1 };
  if (b === 'plains' && r < 0.0045) return { type: 'oak', trunk: 4 + v % 2, x, z, y: h + 1 };
  if (b === 'snow' && r < 0.014) return { type: 'spruce', trunk: 5 + v % 3, x, z, y: h + 1 };
  if (b === 'desert' && r < 0.007) return { type: 'cactus', trunk: 1 + v % 3, x, z, y: h + 1 };
  return null;
}

function isCave(seed, x, y, z, h) {
  if (y < 3 || y > h) return false;
  if (h < SEA + 2) return false; // 海底不挖洞，避免怪異氣穴
  const n = N.fbm3(seed + 5, x * 0.055, y * 0.075, z * 0.055, 2, 2, 0.5);
  if (y >= h - 1) return n > 0.70;           // 地表開口要更嚴格
  if (n > 0.655) return true;                 // 洞窟房間
  const t = N.fbm3(seed + 6, x * 0.03, y * 0.045, z * 0.03, 2, 2, 0.5);
  return Math.abs(t - 0.5) < 0.021;           // 帶狀隧道
}

function oreAt(seed, x, y, z, h) {
  const r = N.hash3(seed + 7, x, y, z);
  if (y < 16 && r < 0.0022) return B.DIAMOND_ORE;
  if (y < 26 && r < 0.0060) return B.GOLD_ORE;
  if (y < 44 && r < 0.0140) return B.IRON_ORE;
  if (y < h - 3 && r < 0.0240) return B.COAL_ORE;
  const g = N.valueNoise3(seed + 8, x * 0.09, y * 0.09, z * 0.09);
  if (g > 0.80) return B.GRAVEL;
  if (g < 0.17) return B.DIRT;
  return B.STONE;
}

// 生成一個區塊的原始地形（不含玩家改動）
function generateChunk(seed, cx, cz) {
  const data = new Uint8Array(CHUNK * CHUNK * WORLD_H);
  const baseX = cx * CHUNK, baseZ = cz * CHUNK;

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const wx = baseX + lx, wz = baseZ + lz;
      const h = terrainHeight(seed, wx, wz);
      const biome = biomeAt(seed, wx, wz);
      const beach = h <= SEA + 1 && biome !== 'desert';
      const mountain = h >= 58;

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0 || (y <= 2 && N.hash3(seed + 9, wx, y, wz) < 0.5)) {
          id = B.BEDROCK;
        } else if (isCave(seed, wx, y, wz, h)) {
          id = B.AIR;
        } else if (y < h - 3) {
          id = oreAt(seed, wx, y, wz, h);
        } else if (biome === 'desert' || beach) {
          id = (y > h - 3) ? B.SAND : B.SANDSTONE;
        } else if (mountain) {
          id = (y === h && h >= 68) ? B.SNOW_BLOCK : B.STONE;
        } else if (y === h) {
          id = biome === 'snow' ? B.SNOW_GRASS : B.GRASS;
        } else {
          id = B.DIRT;
        }
        data[idx(lx, lz, y)] = id;
      }
      // 水面
      for (let y = h + 1; y <= SEA; y++) data[idx(lx, lz, y)] = B.WATER;

      // 花草（地表是草地且無樹）
      if (h > SEA + 1 && !mountain && (biome === 'plains' || biome === 'forest') &&
          data[idx(lx, lz, h)] === B.GRASS && !treeAt(seed, wx, wz)) {
        const r = N.hash2(seed + 43, wx, wz);
        if (r < 0.010) data[idx(lx, lz, h + 1)] = B.FLOWER_RED;
        else if (r < 0.022) data[idx(lx, lz, h + 1)] = B.FLOWER_YELLOW;
        else if (r < 0.0235) data[idx(lx, lz, h + 1)] = B.PUMPKIN; // 野生南瓜（可做南瓜燈）
        else if (r < 0.10) data[idx(lx, lz, h + 1)] = B.TALL_GRASS;
      }
    }
  }

  // 樹木：掃描含邊界外 3 格的所有樹，蓋到本區塊內的部分
  for (let wx = baseX - 3; wx < baseX + CHUNK + 3; wx++) {
    for (let wz = baseZ - 3; wz < baseZ + CHUNK + 3; wz++) {
      const t = treeAt(seed, wx, wz);
      if (t) stampTree(seed, t, data, baseX, baseZ);
    }
  }
  return data;
}

function put(data, baseX, baseZ, wx, y, wz, id, onlyAir) {
  const lx = wx - baseX, lz = wz - baseZ;
  if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= WORLD_H) return;
  const i = idx(lx, lz, y);
  if (onlyAir && data[i] !== B.AIR) return;
  data[i] = id;
}

function stampTree(seed, t, data, baseX, baseZ) {
  if (t.type === 'cactus') {
    for (let dy = 0; dy < t.trunk; dy++) put(data, baseX, baseZ, t.x, t.y + dy, t.z, B.CACTUS, true);
    return;
  }
  const leaf = t.type === 'spruce' ? B.SPRUCE_LEAF : B.LEAF;
  if (t.type === 'oak') {
    for (let dy = t.trunk - 2; dy <= t.trunk + 1; dy++) {
      const r = dy <= t.trunk - 1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r &&
            N.hash3(seed + 45, t.x + dx, t.y + dy, t.z + dz) < 0.6) continue;
        put(data, baseX, baseZ, t.x + dx, t.y + dy, t.z + dz, leaf, true);
      }
    }
  } else { // spruce：圓錐形
    const layers = [2, 1, 2, 1, 1, 0];
    for (let dy = 0; dy < layers.length; dy++) {
      const y = t.y + t.trunk - 3 + dy;
      const r = layers[dy];
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
        put(data, baseX, baseZ, t.x + dx, y, t.z + dz, leaf, true);
      }
    }
    put(data, baseX, baseZ, t.x, t.y + t.trunk + 3, t.z, leaf, true);
  }
  for (let dy = 0; dy < t.trunk; dy++) put(data, baseX, baseZ, t.x, t.y + dy, t.z, B.LOG, false);
}

const MWWorldgen = { CHUNK, WORLD_H, SEA, idx, terrainHeight, biomeAt, treeAt, isCave, generateChunk };
if (typeof module !== 'undefined') module.exports = MWWorldgen;
if (typeof window !== 'undefined') window.MWWorldgen = MWWorldgen;
})();
