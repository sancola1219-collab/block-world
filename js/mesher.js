// 區塊網格生成 — 純邏輯，node 可測。
// 頂點格式（stride 7 float）：x,y,z, u,v, sky(0..1；2.0=自發光), shade(面向陰影×AO)
// 輸出三組：solid（不透明、背面剔除）、cutout（樹葉/玻璃/十字花草、不剔除）、water（半透明）
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const WG2 = (typeof module !== 'undefined') ? require('./worldgen.js') : window.MWWorldgen;
const BK3 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { CHUNK, WORLD_H } = WG2;
const { B, def, isOpaque, isCross, isLiquid, tileOf } = BK3;

// 六面：normal、四角偏移（逆時針、由外看）、AO 用的切線軸
const FACES = [
  { n: [1, 0, 0], face: 'side', shade: 0.80, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], face: 'side', shade: 0.80, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], face: 'top', shade: 1.00, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], face: 'bottom', shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], face: 'side', shade: 0.70, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], face: 'side', shade: 0.70, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const CORNER_UV = [[0, 1], [1, 1], [1, 0], [0, 0]]; // bl,br,tr,tl（v 向下）
const AO_FACTOR = [0.45, 0.64, 0.82, 1.0];
const PAD = 0.06; // 圖集 tile 內縮（比例，防溢色）

function pushFace(out, x, y, z, f, tile, sky, shade, aoArr, yTops) {
  const base = out.verts.length / 7;
  const tu = tile % 16, tv = Math.floor(tile / 16);
  for (let i = 0; i < 4; i++) {
    const c = f.corners[i];
    let vy = y + c[1];
    if (yTops && c[1] === 1) vy = y + yTops; // 水面下陷
    const u = (tu + (CORNER_UV[i][0] === 0 ? PAD : 1 - PAD)) / 16;
    const v = (tv + (CORNER_UV[i][1] === 0 ? PAD : 1 - PAD)) / 16;
    out.verts.push(x + c[0], vy, z + c[2], u, v, sky, shade * (aoArr ? aoArr[i] : 1));
  }
  // AO 對角翻轉，避免四邊形內插異向
  if (aoArr && aoArr[0] + aoArr[2] < aoArr[1] + aoArr[3]) {
    out.inds.push(base + 1, base + 2, base + 3, base + 3, base + 0, base + 1);
  } else {
    out.inds.push(base + 0, base + 1, base + 2, base + 2, base + 3, base + 0);
  }
}

function pushCross(out, x, y, z, tile, sky) {
  const tu = tile % 16, tv = Math.floor(tile / 16);
  const u0 = (tu + PAD) / 16, u1 = (tu + 1 - PAD) / 16;
  const v0 = (tv + PAD) / 16, v1 = (tv + 1 - PAD) / 16;
  const quads = [
    [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
    [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]],
  ];
  for (const q of quads) {
    const base = out.verts.length / 7;
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    for (let i = 0; i < 4; i++) {
      out.verts.push(x + q[i][0], y + q[i][1], z + q[i][2], uvs[i][0], uvs[i][1], sky, 1);
    }
    out.inds.push(base, base + 1, base + 2, base + 2, base + 3, base);
  }
}

// 面是否可見：從 id 方塊看向鄰居 nid
function faceVisible(id, nid) {
  if (isLiquid(id)) return nid === B.AIR || isCross(def(nid).cross ? nid : B.AIR) || (!isOpaque(nid) && !isLiquid(nid));
  if (isOpaque(id)) return !isOpaque(nid);
  // cutout（樹葉/玻璃）：鄰居非不透明且非同種
  return !isOpaque(nid) && nid !== id;
}

// 快照快取（模組層重複使用，避免每塊重新配置）：
// 建網格時每個 voxel 會被鄰面/AO 取樣 10 次以上，直接查 world.getBlock 的
// Map 查找是主要成本。先把 18×18 柱（含 1 格邊界）拷進平面陣列，之後全是陣列讀取。
const SNAP_W = CHUNK + 2;
const SNAP = new Uint8Array(SNAP_W * SNAP_W * WORLD_H);
const LIGHT_SNAP = new Int16Array(SNAP_W * SNAP_W * WORLD_H); // -1 = 尚未計算（惰性）

function buildChunkMesh(world, cx, cz) {
  const solid = { verts: [], inds: [] };
  const cutout = { verts: [], inds: [] };
  const water = { verts: [], inds: [] };
  const bx = cx * CHUNK, bz = cz * CHUNK;
  const chunk = world.getChunk(cx, cz);

  // 方塊快照：逐柱用 TypedArray.set 拷貝（每柱 96 bytes）
  for (let sx = 0; sx < SNAP_W; sx++) {
    const wx = bx - 1 + sx;
    const ccx = Math.floor(wx / CHUNK), lx2 = wx - ccx * CHUNK;
    for (let sz = 0; sz < SNAP_W; sz++) {
      const wz = bz - 1 + sz;
      const ccz = Math.floor(wz / CHUNK), lz2 = wz - ccz * CHUNK;
      const src = (ccx === cx && ccz === cz) ? chunk : world.getChunk(ccx, ccz);
      const off = ((lx2 << 4) | lz2) * WORLD_H;
      SNAP.set(src.data.subarray(off, off + WORLD_H), (sx * SNAP_W + sz) * WORLD_H);
    }
  }
  LIGHT_SNAP.fill(-1);

  const get = (wx, wy, wz) => {
    // 與 world.getBlock 一致：y<0 是基岩（不透明），否則 y=0 底面會多建 256 個永不可見的面
    if (wy < 0) return B.BEDROCK;
    if (wy >= WORLD_H) return B.AIR;
    return SNAP[((wx - bx + 1) * SNAP_W + (wz - bz + 1)) * WORLD_H + wy];
  };
  const lightAt = (wx, wy, wz) => {
    if (wy < 0 || wy >= WORLD_H) return 15;
    const i = ((wx - bx + 1) * SNAP_W + (wz - bz + 1)) * WORLD_H + wy;
    let v = LIGHT_SNAP[i];
    if (v < 0) { v = world.lightAt(wx, wy, wz); LIGHT_SNAP[i] = v; }
    return v;
  };

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let y = 0; y < WORLD_H; y++) {
        const id = chunk.data[((lx << 4) | lz) * WORLD_H + y];
        if (id === B.AIR) continue;
        const wx = bx + lx, wz = bz + lz;
        const d = def(id);

        if (d.cross) {
          const sky = d.emissive ? 2.0 : lightAt(wx, y, wz) / 15;
          pushCross(cutout, wx, y, wz, tileOf(id, 'side'), sky);
          continue;
        }

        const liquid = !!d.liquid;
        const out = liquid ? water : (d.cutout ? cutout : solid);
        for (const f of FACES) {
          const nx = wx + f.n[0], ny = y + f.n[1], nz = wz + f.n[2];
          const nid = get(nx, ny, nz);
          // 半高方塊的頂面永遠可見（上方即使是實心塊也有縫）
          const forceTop = d.h !== undefined && f.n[1] === 1;
          if (!forceTop && !faceVisible(id, nid)) continue;

          const sky = d.emissive ? 2.0 : lightAt(nx, ny, nz) / 15;
          const tile = tileOf(id, f.face);
          let ao = null;
          if (!liquid && !d.cutout) {
            ao = [];
            const t1 = f.n[0] !== 0 ? 1 : 0;          // 第一切線軸（y 或 x）
            const t2 = f.n[2] !== 0 ? 1 : 2;          // 第二切線軸（y 或 z）
            for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              const s1 = [0, 0, 0], s2 = [0, 0, 0];
              s1[t1] = c[t1] === 1 ? 1 : -1;
              s2[t2] = c[t2] === 1 ? 1 : -1;
              const o1 = isOpaque(get(nx + s1[0], ny + s1[1], nz + s1[2])) ? 1 : 0;
              const o2 = isOpaque(get(nx + s2[0], ny + s2[1], nz + s2[2])) ? 1 : 0;
              const oc = isOpaque(get(nx + s1[0] + s2[0], ny + s1[1] + s2[1], nz + s1[2] + s2[2])) ? 1 : 0;
              const aoLevel = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
              ao.push(AO_FACTOR[aoLevel]);
            }
          }
          // 頂高：水面下陷 0.86；半高方塊用 def.h
          let topH = null;
          if (liquid) topH = get(wx, y + 1, wz) !== id ? 0.86 : null;
          else if (d.h !== undefined) topH = d.h;
          pushFace(out, wx, y, wz, f, tile, sky, f.shade, ao, topH);
        }
      }
    }
  }

  const pack = (o) => ({
    verts: new Float32Array(o.verts),
    inds: new Uint32Array(o.inds),
    count: o.inds.length,
  });
  return { solid: pack(solid), cutout: pack(cutout), water: pack(water) };
}

const MWMesher = { buildChunkMesh, FACES };
if (typeof module !== 'undefined') module.exports = MWMesher;
if (typeof window !== 'undefined') window.MWMesher = MWMesher;
})();
