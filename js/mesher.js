// 區塊網格生成 — 純邏輯，node 可測。
// 頂點格式（stride 7 float）：x,y,z, u,v, sky(0..1；2.0=自發光), shade(面向陰影×AO)
// 輸出三組：solid（不透明、背面剔除）、cutout（樹葉/玻璃/十字花草、不剔除）、water（半透明）
'use strict';

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

function buildChunkMesh(world, cx, cz) {
  const solid = { verts: [], inds: [] };
  const cutout = { verts: [], inds: [] };
  const water = { verts: [], inds: [] };
  const bx = cx * CHUNK, bz = cz * CHUNK;
  const chunk = world.getChunk(cx, cz);
  const get = (wx, wy, wz) => world.getBlock(wx, wy, wz);

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let y = 0; y < WORLD_H; y++) {
        const id = chunk.data[((lx << 4) | lz) * WORLD_H + y];
        if (id === B.AIR) continue;
        const wx = bx + lx, wz = bz + lz;
        const d = def(id);

        if (d.cross) {
          const sky = world.lightAt(wx, y, wz) / 15;
          pushCross(cutout, wx, y, wz, tileOf(id, 'side'), sky);
          continue;
        }

        const liquid = !!d.liquid;
        const out = liquid ? water : (d.cutout ? cutout : solid);
        for (const f of FACES) {
          const nx = wx + f.n[0], ny = y + f.n[1], nz = wz + f.n[2];
          const nid = get(nx, ny, nz);
          if (!faceVisible(id, nid)) continue;

          const sky = d.emissive ? 2.0 : world.lightAt(nx, ny, nz) / 15;
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
          // 水頂面下陷（上方沒有水時）
          const sink = liquid && get(wx, y + 1, wz) !== id ? 0.86 : null;
          pushFace(out, wx, y, wz, f, tile, sky, f.shade, ao, sink);
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
