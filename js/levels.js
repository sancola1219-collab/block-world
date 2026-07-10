// 冒險關卡 — 純邏輯，node 可測。
// 每關：固定種子世界＋出生點建築＋英雄能力＋任務鏈。內容為原創設計。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const BK7 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { B } = BK7;

const LEVELS = {
  wizard: {
    id: 'wizard',
    name: '關卡一：魔法學院',
    desc: '成為小巫師：魔杖、飛天掃帚、大戰黑巫師！',
    heroName: '小巫師',
    seed: 20260711,
    hero: { jumpMul: 1, speedMul: 1, dmgBonus: 0, fallResist: 1, magicDmg: 7 },
    intro: '你是魔法學院的小巫師！黑巫師帶著爪牙佔領了學院——先到中央祭壇拿回你的魔杖！',
    steps: [
      { type: 'pickup', item: B.WAND, count: 1, text: '到中央祭壇撿起魔杖（走過去就會撿起）' },
      { type: 'kill', mob: 'minion', count: 5, text: '拿魔杖按右鍵發射魔法，擊敗 5 隻黑暗爪牙', spawn: { mob: 'minion', max: 3 } },
      { type: 'pickup', item: B.BROOM, count: 1, text: '到南邊的木台撿起飛天掃帚' },
      { type: 'collect', item: B.DIAMOND, count: 3, text: '按 F 騎掃帚飛行，收集三座矮塔頂的魔法水晶（挖鑽石礦）' },
      { type: 'reach', point: 'towerTop', r: 4, text: '飛上最高的瞭望塔頂！' },
      { type: 'boss', mob: 'darkwizard', text: '黑巫師現身了——用魔法擊敗他！', spawn: { mob: 'minion', max: 1 } },
    ],
    outro: '你打敗了黑巫師，奪回了魔法學院！現在可以自由探索這個世界了。',
  },
  soldier: {
    id: 'soldier',
    name: '關卡二：超級戰士',
    desc: '成為超級戰士：回力圓盾、超級力量、擊退機器人軍團！',
    heroName: '超級戰士',
    seed: 20260712,
    hero: { jumpMul: 1.55, speedMul: 1.3, dmgBonus: 3, fallResist: 2.5, shieldDmg: 8 },
    intro: '你是實驗成功的超級戰士——跳得更高、跑得更快、拳頭更重！機器人軍團入侵基地，快到中央平台拿起圓盾！',
    steps: [
      { type: 'pickup', item: B.SHIELD, count: 1, text: '到中央平台撿起圓盾（按右鍵投擲，會飛回手上）' },
      { type: 'kill', mob: 'robot', count: 8, text: '用圓盾和拳頭擊敗 8 個機器人', spawn: { mob: 'robot', max: 4 } },
      { type: 'pickup', item: B.GLOWSTONE, count: 3, text: '奪回三個角落的能量核心' },
      { type: 'boss', mob: 'robotking', text: '機器人首領從大門殺進來了——打倒它！', spawn: { mob: 'robot', max: 2 } },
    ],
    outro: '機器人首領倒下了，基地安全了！你是真正的英雄。世界任你探索。',
  },
};

// ---- 建築 ----
function fill(blocks, x0, y0, z0, x1, y1, z1, id) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        blocks.push([x, y, z, id]);
}

function tower(blocks, cx, py, cz, h, capId) {
  // 5×5 空心塔，頂層鋪滿＋圍欄
  for (let y = 1; y <= h; y++) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      if (y === h) blocks.push([cx + dx, py + y, cz + dz, B.STONEBRICK]);
      else if (edge) blocks.push([cx + dx, py + y, cz + dz, B.STONEBRICK]);
    }
  }
  for (let dx = -2; dx <= 2; dx += 2) for (let dz = -2; dz <= 2; dz += 2) {
    blocks.push([cx + dx, py + h + 1, cz + dz, B.STONEBRICK]);
  }
  if (capId) blocks.push([cx, py + h + 1, cz, capId]);
}

function buildStructure(id, ox, py, oz) {
  const blocks = [], drops = [], points = {};

  if (id === 'wizard') {
    const S = 10;
    fill(blocks, ox - S, py - 1, oz - S, ox + S, py, oz + S, B.STONEBRICK);      // 地基
    fill(blocks, ox - S, py + 1, oz - S, ox + S, py + 18, oz + S, B.AIR);        // 淨空
    // 圍牆＋垛口
    for (let i = -S; i <= S; i++) {
      for (const [wx, wz] of [[i, -S], [i, S], [-S, i], [S, i]]) {
        fill(blocks, ox + wx, py + 1, oz + wz, ox + wx, py + 3, oz + wz, B.STONEBRICK);
        if ((wx + wz + 200) % 2 === 0) blocks.push([ox + wx, py + 4, oz + wz, B.STONEBRICK]);
      }
    }
    // 三座矮塔（頂放魔法水晶＝鑽石礦）＋一座最高瞭望塔
    const shortT = [[-S + 2, -S + 2], [S - 2, -S + 2], [-S + 2, S - 2]];
    for (const [tx, tz] of shortT) {
      tower(blocks, ox + tx, py, oz + tz, 8, B.GLOWSTONE);
      blocks.push([ox + tx + 1, py + 9, oz + tz, B.DIAMOND_ORE]);
    }
    tower(blocks, ox + S - 2, py, oz + S - 2, 15, B.GLOWSTONE);
    points.towerTop = [ox + S - 2, py + 17, oz + S - 2];
    // 中央祭壇（魔杖）
    fill(blocks, ox - 1, py + 1, oz - 1, ox + 1, py + 1, oz + 1, B.SLAB_STONE);
    blocks.push([ox - 1, py + 2, oz - 1, B.GLOWSTONE]);
    blocks.push([ox + 1, py + 2, oz + 1, B.GLOWSTONE]);
    drops.push([ox + 0.5, py + 2.5, oz + 0.5, B.WAND]);
    // 南邊木台（掃帚）
    fill(blocks, ox - 1, py + 1, oz + S - 3, ox + 1, py + 1, oz + S - 3, B.SLAB_PLANK);
    drops.push([ox + 0.5, py + 2.2, oz + S - 2.5, B.BROOM]);
    points.boss = [ox + 0.5, py + 1.1, oz - 4.5];
    points.playerSpawn = [ox + 0.5, py + 1.1, oz + 6.5];
  }

  if (id === 'soldier') {
    const S = 11;
    fill(blocks, ox - S, py - 1, oz - S, ox + S, py, oz + S, B.STONE);           // 地基
    fill(blocks, ox - S, py + 1, oz - S, ox + S, py + 10, oz + S, B.AIR);        // 淨空
    // 磚牆＋南門
    for (let i = -S; i <= S; i++) {
      for (const [wx, wz] of [[i, -S], [i, S], [-S, i], [S, i]]) {
        if (wz === S && Math.abs(wx) <= 1) continue; // 南門
        fill(blocks, ox + wx, py + 1, oz + wz, ox + wx, py + 4, oz + wz, B.BRICK);
      }
    }
    // 四角崗哨柱＋照明
    for (const [tx, tz] of [[-S + 2, -S + 2], [S - 2, -S + 2], [-S + 2, S - 2], [S - 2, S - 2]]) {
      fill(blocks, ox + tx, py + 1, oz + tz, ox + tx, py + 6, oz + tz, B.STONEBRICK);
      blocks.push([ox + tx, py + 7, oz + tz, B.GLOWSTONE]);
    }
    // 中央平台（圓盾）
    fill(blocks, ox - 1, py + 1, oz - 1, ox + 1, py + 1, oz + 1, B.SLAB_STONE);
    drops.push([ox + 0.5, py + 2.5, oz + 0.5, B.SHIELD]);
    // 三個能量核心（角落）
    drops.push([ox - S + 3.5, py + 1.5, oz - S + 3.5, B.GLOWSTONE]);
    drops.push([ox + S - 2.5, py + 1.5, oz - S + 3.5, B.GLOWSTONE]);
    drops.push([ox - S + 3.5, py + 1.5, oz + S - 2.5, B.GLOWSTONE]);
    points.boss = [ox + 0.5, py + 1.1, oz + S - 2.5];
    points.playerSpawn = [ox + 0.5, py + 1.1, oz + 6.5];
  }

  return { blocks, drops, points };
}

const MWLevels = { LEVELS, buildStructure };
if (typeof module !== 'undefined') module.exports = MWLevels;
if (typeof window !== 'undefined') window.MWLevels = MWLevels;
})();
