// 邏輯層單元測試：node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const N = require('../js/noise.js');
const BK = require('../js/blocks.js');
const WG = require('../js/worldgen.js');
const { World } = require('../js/world.js');
const { buildChunkMesh } = require('../js/mesher.js');
const PH = require('../js/physics.js');
const EN = require('../js/entities.js');
const INV = require('../js/inventory.js');
const SV = require('../js/save.js');

const { B } = BK;
const { CHUNK, WORLD_H, SEA, idx } = WG;

test('噪聲：決定性與範圍', () => {
  const r1 = N.mulberry32(42), r2 = N.mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const a = r1(), b = r2();
    assert.strictEqual(a, b);
    assert.ok(a >= 0 && a < 1);
  }
  assert.strictEqual(N.hash2(1, 5, 9), N.hash2(1, 5, 9));
  assert.notStrictEqual(N.hash2(1, 5, 9), N.hash2(2, 5, 9));
  for (let i = 0; i < 50; i++) {
    const v = N.fbm2(7, i * 1.3, i * 0.7, 4, 2, 0.5);
    assert.ok(v >= 0 && v <= 1, 'fbm2 超出範圍: ' + v);
  }
});

test('地形：高度決定性與界限', () => {
  for (let i = 0; i < 200; i++) {
    const h = WG.terrainHeight(123, i * 37 - 1000, i * 91 - 2000);
    assert.strictEqual(h, WG.terrainHeight(123, i * 37 - 1000, i * 91 - 2000));
    assert.ok(h >= 4 && h <= WORLD_H - 12);
  }
});

test('區塊生成：基岩、地表、水面、重生成一致', () => {
  const seed = 2026;
  const a = WG.generateChunk(seed, 0, 0);
  const b = WG.generateChunk(seed, 0, 0);
  assert.deepStrictEqual(a, b, '同種子同區塊必須相同');

  for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
    assert.strictEqual(a[idx(lx, lz, 0)], B.BEDROCK, 'y=0 必為基岩');
    const h = WG.terrainHeight(seed, lx, lz);
    // 水面：地表低於海平面時 SEA 高度處必為水
    if (h < SEA) assert.strictEqual(a[idx(lx, lz, SEA)], B.WATER);
  }
});

test('區塊生成：世界夠大——四種生物群系與樹都找得到', () => {
  const seed = 777;
  const found = new Set();
  let tree = null;
  for (let i = 0; i < 20000; i++) {
    const x = (i * 173) % 4000 - 2000, z = ((i * 389) % 4000) - 2000;
    found.add(WG.biomeAt(seed, x, z));
    if (!tree) tree = WG.treeAt(seed, x, z);
  }
  assert.ok(found.size >= 3, '至少三種生物群系，實得: ' + [...found]);
  assert.ok(tree, '掃描範圍內應該有樹');
});

test('世界：改方塊、邊界髒標記、卸載後編輯保留', () => {
  const w = new World(99);
  const h = WG.terrainHeight(99, 5, 5);
  w.setBlock(5, h + 1, 5, B.BRICK);
  assert.strictEqual(w.getBlock(5, h + 1, 5), B.BRICK);

  w.dirty.clear();
  w.setBlock(0, 10, 5, B.GLASS); // lx=0 → 鄰區塊 -1,0 也要髒
  assert.ok(w.dirty.has('0,0') && w.dirty.has('-1,0'));

  w.unloadBeyond(100, 100, 1); // 全卸載
  assert.ok(!w.hasChunk(0, 0));
  assert.strictEqual(w.getBlock(5, h + 1, 5), B.BRICK, '重生成後編輯必須還在');

  // 序列化往返
  const w2 = new World(99);
  w2.loadEdits(JSON.parse(JSON.stringify(w.serializeEdits())));
  assert.strictEqual(w2.getBlock(5, h + 1, 5), B.BRICK);
});

test('天光：地表亮、深處暗', () => {
  const w = new World(31);
  // 找一根乾地柱（高於海平面、附近沒樹，避免樹葉遮蔽）
  let cx = -1, cz = -1;
  outer:
  for (let x = 0; x < 400; x += 3) for (let z = 0; z < 400; z += 3) {
    if (WG.terrainHeight(31, x, z) <= SEA + 4) continue;
    let clear = true;
    for (let dx = -3; dx <= 3 && clear; dx++) for (let dz = -3; dz <= 3 && clear; dz++) {
      if (WG.treeAt(31, x + dx, z + dz)) clear = false;
    }
    if (clear) { cx = x; cz = z; break outer; }
  }
  assert.ok(cx >= 0, '應找得到乾地柱');
  const h = w.topAt(cx, cz);
  assert.strictEqual(w.lightAt(cx, h + 1, cz), 15);
  const deep = w.lightAt(cx, 5, cz);
  assert.ok(deep <= 3, '地下深處應昏暗，實得 ' + deep);
});

// 迷你假世界：一顆石頭浮在空中
function makeStubWorld(blocks) {
  const map = new Map();
  for (const [x, y, z, id] of blocks) map.set(x + ',' + y + ',' + z, id);
  return {
    getBlock: (x, y, z) => map.get(x + ',' + y + ',' + z) || 0,
    lightAt: () => 15,
    getChunk(cx, cz) {
      const data = new Uint8Array(CHUNK * CHUNK * WORLD_H);
      for (const [k, id] of map) {
        const [x, y, z] = k.split(',').map(Number);
        if (Math.floor(x / CHUNK) === cx && Math.floor(z / CHUNK) === cz && y >= 0 && y < WORLD_H) {
          data[(((x - cx * CHUNK) << 4) | (z - cz * CHUNK)) * WORLD_H + y] = id;
        }
      }
      return { data };
    },
  };
}

test('網格：單一方塊 6 面、相鄰面剔除、水面下陷', () => {
  const w1 = makeStubWorld([[3, 40, 3, B.STONE]]);
  const m1 = buildChunkMesh(w1, 0, 0);
  assert.strictEqual(m1.solid.count, 36, '單方塊應 6 面 36 索引');
  assert.strictEqual(m1.water.count, 0);

  const w2 = makeStubWorld([[3, 40, 3, B.STONE], [4, 40, 3, B.STONE]]);
  const m2 = buildChunkMesh(w2, 0, 0);
  assert.strictEqual(m2.solid.count, 60, '兩相鄰方塊應 10 面');

  const w3 = makeStubWorld([[3, 40, 3, B.WATER]]);
  const m3 = buildChunkMesh(w3, 0, 0);
  assert.ok(m3.water.count > 0);
  let maxY = 0;
  for (let i = 0; i < m3.water.verts.length; i += 7) maxY = Math.max(maxY, m3.water.verts[i + 1]);
  assert.ok(Math.abs(maxY - 40.86) < 1e-6, '水頂面應下陷至 40.86，實得 ' + maxY);

  const w4 = makeStubWorld([[3, 40, 3, B.FLOWER_RED]]);
  const m4 = buildChunkMesh(w4, 0, 0);
  assert.strictEqual(m4.cutout.count, 12, '十字花草應 2 面 12 索引');
});

test('物理：自由落體著地、跳躍、摔落速度紀錄', () => {
  // 平地：y<10 全是石頭
  const flat = { getBlock: (x, y, z) => (y < 10 ? B.STONE : B.AIR) };
  const p = PH.createPlayer(0.5, 20, 0.5);
  const input = { mf: 0, ms: 0, jump: false, run: false, up: false, down: false };
  let minFall = 0;
  for (let i = 0; i < 300; i++) {
    PH.stepPlayer(p, flat, input, 0.02, 'survival');
    minFall = Math.min(minFall, p.fallV);
  }
  assert.ok(p.onGround, '應該落地');
  assert.ok(Math.abs(p.y - 10) < 0.01, '腳底應貼地 y≈10，實得 ' + p.y);
  assert.ok(minFall < -10, '落地那一刻應記錄下墜速度，實得 ' + minFall);
  assert.strictEqual(p.fallV, 0, '站立時 fallV 應歸零');

  const input2 = { ...input, jump: true };
  PH.stepPlayer(p, flat, input2, 0.02, 'survival');
  assert.ok(p.vy > 0 && !p.onGround, '跳躍應離地');
});

test('物理：DDA 射線命中與放置格', () => {
  const w = makeStubWorld([[0, 5, -3, B.STONE]]);
  const hit = PH.raycast(w, 0.5, 5.5, 0.5, 0, 0, -1, 8);
  assert.ok(hit.hit);
  assert.deepStrictEqual([hit.x, hit.y, hit.z], [0, 5, -3]);
  assert.deepStrictEqual([hit.px, hit.py, hit.pz], [0, 5, -2], '放置格應在命中格前一格');
  const miss = PH.raycast(w, 0.5, 5.5, 0.5, 0, 0, 1, 8);
  assert.ok(!miss.hit);
});

test('物理：放置重疊偵測', () => {
  const p = PH.createPlayer(0.5, 10, 0.5);
  assert.ok(PH.boxIntersectsBlock(p, 0, 10, 0), '腳下格與玩家重疊');
  assert.ok(PH.boxIntersectsBlock(p, 0, 11, 0), '頭部格與玩家重疊');
  assert.ok(!PH.boxIntersectsBlock(p, 2, 10, 0), '遠處格不重疊');
});

test('實體：殭屍追擊與攻擊事件、豬漫遊', () => {
  const flat = { getBlock: (x, y, z) => (y < 10 ? B.STONE : B.AIR) };
  const rand = N.mulberry32(7);
  const player = PH.createPlayer(0.5, 10, 0.5);
  const z = EN.makeMob('zombie', 5, 10, 0.5);
  const events = [];
  for (let i = 0; i < 600; i++) EN.stepMob(z, flat, 0.02, player, rand, true, events);
  assert.ok(Math.hypot(player.x - z.x, player.z - z.z) < 2.5, '殭屍應追到玩家附近');
  assert.ok(events.some(e => e.type === 'attack'), '應該有攻擊事件');

  const pig = EN.makeMob('pig', 0.5, 10, 0.5);
  for (let i = 0; i < 600; i++) EN.stepMob(pig, flat, 0.02, player, rand, false, events);
  assert.ok(pig.hp === EN.MOB_DEFS.pig.hp && !pig.dead);
});

test('實體：苦力怕貼近點燃並爆炸', () => {
  const flat = { getBlock: (x, y, z) => (y < 10 ? B.STONE : B.AIR) };
  const rand = N.mulberry32(5);
  const player = PH.createPlayer(0.5, 10, 0.5);
  const c = EN.makeMob('creeper', 4, 10, 0.5);
  const events = [];
  for (let i = 0; i < 900 && !c.dead; i++) EN.stepMob(c, flat, 0.02, player, rand, true, events);
  assert.ok(events.some(e => e.type === 'hiss'), '應有嘶嘶聲事件');
  const ex = events.find(e => e.type === 'explode');
  assert.ok(ex, '應有爆炸事件');
  assert.ok(Math.hypot(ex.x - player.x, ex.z - player.z) < 4, '爆炸點應在玩家附近');
  assert.ok(c.dead);
});

test('工具：對的工具挖得快、劍傷害、礦石掉物品', () => {
  assert.ok(Math.abs(BK.digTime(B.STONE) - 2.2) < 1e-9);
  assert.ok(Math.abs(BK.digTime(B.STONE, B.IRON_PICK) - 0.44) < 1e-9);
  assert.ok(Math.abs(BK.digTime(B.STONE, B.IRON_AXE) - 2.2) < 1e-9);
  assert.ok(Math.abs(BK.digTime(B.LOG, B.DIAMOND_AXE) - 0.2) < 1e-9);
  assert.strictEqual(BK.digTime(B.BEDROCK, B.DIAMOND_PICK), -1);
  assert.strictEqual(BK.attackDmg(), BK.HAND_DMG);
  assert.strictEqual(BK.attackDmg(B.DIAMOND_SWORD), 8);
  assert.strictEqual(BK.dropOf(B.COAL_ORE), B.COAL);
  assert.strictEqual(BK.dropOf(B.DIAMOND_ORE), B.DIAMOND);
  assert.ok(BK.isItem(B.IRON_PICK) && !BK.isItem(B.STONE));
});

test('物理：半磚站上去是半格高', () => {
  const w = {
    getBlock: (x, y, z) => {
      if (y < 10) return B.STONE;
      if (x === 0 && y === 10 && z === 0) return B.SLAB_STONE;
      return B.AIR;
    },
  };
  const p = PH.createPlayer(0.5, 13, 0.5);
  const input = { mf: 0, ms: 0, jump: false, run: false, up: false, down: false };
  for (let i = 0; i < 200; i++) PH.stepPlayer(p, w, input, 0.02, 'survival');
  assert.ok(p.onGround);
  assert.ok(Math.abs(p.y - 10.5) < 0.01, '應站在半磚頂 y≈10.5，實得 ' + p.y);
});

test('網格：半磚頂面在 0.5、床在 0.55', () => {
  const w = makeStubWorld([[3, 40, 3, B.SLAB_STONE]]);
  const m = buildChunkMesh(w, 0, 0);
  let maxY = 0;
  for (let i = 0; i < m.solid.verts.length; i += 7) maxY = Math.max(maxY, m.solid.verts[i + 1]);
  assert.ok(Math.abs(maxY - 40.5) < 1e-6, '半磚頂應在 40.5，實得 ' + maxY);

  const w2 = makeStubWorld([[3, 40, 3, B.BED]]);
  const m2 = buildChunkMesh(w2, 0, 0);
  let maxY2 = 0;
  for (let i = 0; i < m2.solid.verts.length; i += 7) maxY2 = Math.max(maxY2, m2.solid.verts[i + 1]);
  assert.ok(Math.abs(maxY2 - 40.55) < 1e-6, '床頂應在 40.55，實得 ' + maxY2);
});

test('合成：木棒→火把→工具鏈', () => {
  const inv = INV.createInventory();
  INV.addItem(inv, B.LOG, 3);
  const find = (out) => INV.RECIPES.find(r => r.out === out);
  assert.ok(INV.craft(inv, find(B.PLANK)));           // 4 木板
  assert.ok(INV.craft(inv, find(B.STICK)));           // 4 木棒（耗 2 木板）
  INV.addItem(inv, B.COAL, 1);
  assert.ok(INV.craft(inv, find(B.TORCH)));           // 4 火把
  assert.strictEqual(INV.countOf(inv, B.TORCH), 4);
  assert.ok(INV.craft(inv, find(B.PLANK)));           // 補木板
  assert.ok(INV.craft(inv, find(B.WOOD_PICK)));       // 木鎬：3 木板＋2 木棒
  assert.strictEqual(INV.countOf(inv, B.WOOD_PICK), 1);
  INV.addItem(inv, B.GUNPOWDER, 3); INV.addItem(inv, B.SAND, 3);
  assert.ok(INV.craft(inv, find(B.TNT)));
});

test('實體：掉落物落地與拾取', () => {
  const flat = { getBlock: (x, y, z) => (y < 10 ? B.STONE : B.AIR) };
  const rand = N.mulberry32(3);
  const player = PH.createPlayer(0.5, 10, 0.5);
  const d = EN.makeDrop(0.5, 12, 0.5, B.DIRT, rand);
  let picked = null;
  for (let i = 0; i < 200 && !picked; i++) picked = EN.stepDrop(d, flat, 0.02, player);
  assert.strictEqual(picked, 'pickup', '玩家旁的掉落物應被拾取');
});

test('物品欄：疊加、移除、合成', () => {
  const inv = INV.createInventory();
  assert.strictEqual(INV.addItem(inv, B.DIRT, 70), 0);
  assert.strictEqual(INV.countOf(inv, B.DIRT), 70);
  assert.strictEqual(inv.slots[0].count, 64);
  assert.strictEqual(inv.slots[1].count, 6);

  assert.ok(!INV.removeItem(inv, B.DIRT, 71));
  assert.ok(INV.removeItem(inv, B.DIRT, 70));
  assert.strictEqual(INV.countOf(inv, B.DIRT), 0);

  INV.addItem(inv, B.LOG, 1);
  const r = INV.RECIPES.find(r => r.out === B.PLANK);
  assert.ok(INV.canCraft(inv, r));
  assert.ok(INV.craft(inv, r));
  assert.strictEqual(INV.countOf(inv, B.PLANK), 4);
  assert.strictEqual(INV.countOf(inv, B.LOG), 0);
  assert.ok(!INV.canCraft(inv, r));

  // 序列化往返
  const inv2 = INV.deserializeInv(JSON.parse(JSON.stringify(INV.serializeInv(inv))));
  assert.strictEqual(INV.countOf(inv2, B.PLANK), 4);
});

test('存檔：編解碼往返與壞檔防護', () => {
  const state = {
    seed: 12345, mode: 'survival', time: 0.3,
    player: { x: 1.5, y: 40, z: -2.5, yaw: 1, pitch: 0.2, hp: 17, air: 10, fly: false },
    inv: { sel: 2, slots: [0, [B.DIRT, 5]] },
    edits: { '0,0': [100, 3, 200, 0] },
  };
  const o = SV.decodeSave(SV.encodeSave(state));
  assert.ok(o);
  assert.strictEqual(o.seed, 12345);
  assert.strictEqual(o.player.hp, 17);
  assert.deepStrictEqual(o.edits['0,0'], [100, 3, 200, 0]);

  assert.strictEqual(SV.decodeSave('{broken'), null);
  assert.strictEqual(SV.decodeSave('{"v":999}'), null);

  // 注入式 storage
  const mem = { data: {}, setItem(k, v) { this.data[k] = v; }, getItem(k) { return this.data[k] || null; }, removeItem(k) { delete this.data[k]; } };
  assert.ok(SV.saveTo(mem, state));
  assert.strictEqual(SV.loadFrom(mem).seed, 12345);
});
