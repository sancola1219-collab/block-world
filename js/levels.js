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
  ninja: {
    id: 'ninja',
    name: '關卡三：忍者試煉',
    desc: '成為忍者：手裡劍連發、煙霧瞬身、暗影大師的挑戰！',
    heroName: '見習忍者',
    seed: 20260713,
    hero: { jumpMul: 1.35, speedMul: 1.5, dmgBonus: 2, fallResist: 2.2 },
    intro: '歡迎來到忍者道場！影之一族入侵了寶塔。你身輕如燕、落地無聲——先到練功台拿起手裡劍！',
    steps: [
      { type: 'pickup', item: B.SHURIKEN, count: 1, text: '到中央練功台撿起手裡劍（右鍵快速連發）' },
      { type: 'kill', mob: 'shadowblade', count: 6, text: '用手裡劍擊敗 6 名影武士（他們速度很快！）', spawn: { mob: 'shadowblade', max: 3 } },
      { type: 'pickup', item: B.SMOKE_BOMB, count: 1, text: '到寶塔一樓撿起煙霧彈（右鍵往前瞬身 8 格）' },
      { type: 'reach', point: 'towerTop', r: 4, text: '用瞬身和忍者跳登上寶塔頂！' },
      { type: 'boss', mob: 'shadowmaster', text: '暗影大師現身——小心他會瞬移到你身後！', spawn: { mob: 'shadowblade', max: 1 } },
    ],
    outro: '暗影大師敗退，寶塔恢復了寧靜。你已是真正的忍者高手！',
  },
  dragonknight: {
    id: 'dragonknight',
    name: '關卡四：屠龍勇士',
    desc: '成為勇者：聖劍與烈焰弓，討伐天空中的火龍！',
    heroName: '屠龍勇士',
    seed: 20260714,
    hero: { jumpMul: 1.2, speedMul: 1.15, dmgBonus: 2, fallResist: 1.6 },
    intro: '火龍摧毀了古老要塞，蜥蜴戰士四處作亂！勇者啊，先到石台拔出勇者聖劍吧！',
    steps: [
      { type: 'pickup', item: B.HERO_SWORD, count: 1, text: '到中央石台拔出勇者聖劍（近戰超痛！）' },
      { type: 'kill', mob: 'lizard', count: 6, text: '用聖劍擊敗 6 名蜥蜴戰士', spawn: { mob: 'lizard', max: 3 } },
      { type: 'pickup', item: B.FIRE_BOW, count: 1, text: '到瞭望塔頂取得烈焰弓（右鍵射火焰箭）' },
      { type: 'pickup', item: B.GOLD_INGOT, count: 3, text: '找回散落在要塞角落的 3 塊黃金' },
      { type: 'boss', mob: 'dragon', text: '火龍來了！牠會繞著你飛、噴火球——用烈焰弓射下牠！', spawn: { mob: 'lizard', max: 1 } },
    ],
    outro: '火龍墜落，要塞的寶藏與和平都回來了。吟遊詩人會傳唱你的名字！',
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

  if (id === 'ninja') {
    const S = 10;
    fill(blocks, ox - S, py - 1, oz - S, ox + S, py, oz + S, B.STONEBRICK);      // 石庭院
    fill(blocks, ox - S, py + 1, oz - S, ox + S, py + 20, oz + S, B.AIR);        // 淨空
    // 低圍牆＋四角南瓜燈
    for (let i = -S; i <= S; i++) {
      for (const [wx, wz] of [[i, -S], [i, S], [-S, i], [S, i]]) {
        fill(blocks, ox + wx, py + 1, oz + wz, ox + wx, py + 2, oz + wz, B.PLANK);
      }
    }
    for (const [cx2, cz2] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
      blocks.push([ox + cx2, py + 3, oz + cz2, B.JACKLANTERN]);
    }
    // 三層紅寶塔（北側）：磚牆、木半磚屋簷、逐層縮小
    const pz = oz - 4;
    const tiers = [[4, 1], [3, 6], [2, 11]]; // [半徑, 起始高度]
    for (const [r, y0] of tiers) {
      for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
        const edge = Math.abs(x) === r || Math.abs(z) === r;
        for (let y = y0; y < y0 + 4; y++) {
          if (edge && !(z === r && Math.abs(x) <= 1 && y <= y0 + 1)) { // 南面留門
            blocks.push([ox + x, py + y, pz + z, B.BRICK]);
          }
        }
        blocks.push([ox + x, py + y0 + 4, pz + z, B.PLANK]);           // 樓板
      }
      for (let x = -r - 1; x <= r + 1; x++) for (const z of [-r - 1, r + 1]) {
        blocks.push([ox + x, py + y0 + 4, pz + z, B.SLAB_PLANK]);      // 屋簷
        blocks.push([ox + z, py + y0 + 4, pz + x, B.SLAB_PLANK]);
      }
    }
    blocks.push([ox, py + 16, pz, B.GLOWSTONE]);                        // 塔尖
    points.towerTop = [ox, py + 16, pz];
    // 中央練功台（手裡劍）＋一樓煙霧彈
    fill(blocks, ox - 1, py + 1, oz + 2, ox + 1, py + 1, oz + 4, B.SLAB_PLANK);
    drops.push([ox + 0.5, py + 2.5, oz + 3.5, B.SHURIKEN]);
    drops.push([ox + 0.5, py + 2.2, pz + 0.5, B.SMOKE_BOMB]);
    points.boss = [ox + 0.5, py + 1.1, oz + 6.5];
    points.playerSpawn = [ox - 6.5, py + 1.1, oz + 6.5];
  }

  if (id === 'dragonknight') {
    const S = 12;
    fill(blocks, ox - S, py - 1, oz - S, ox + S, py, oz + S, B.STONE);           // 地基
    fill(blocks, ox - S, py + 1, oz - S, ox + S, py + 22, oz + S, B.AIR);        // 淨空
    // 殘破石磚圍牆（每隔幾格留缺口，像被龍打壞）
    for (let i = -S; i <= S; i++) {
      for (const [wx, wz] of [[i, -S], [i, S], [-S, i], [S, i]]) {
        if ((wx * 7 + wz * 13 + 100) % 9 < 2) continue; // 決定性缺口
        fill(blocks, ox + wx, py + 1, oz + wz, ox + wx, py + 3, oz + wz, B.STONEBRICK);
      }
    }
    // 中央石台（聖劍）＋黑曜石龍巢瞭望塔（烈焰弓在塔頂）
    fill(blocks, ox - 1, py + 1, oz - 1, ox + 1, py + 1, oz + 1, B.SLAB_STONE);
    drops.push([ox + 0.5, py + 2.5, oz + 0.5, B.HERO_SWORD]);
    const tx = ox - S + 4, tz = oz - S + 4;
    fill(blocks, tx - 1, py + 1, tz - 1, tx + 1, py + 8, tz + 1, B.OBSIDIAN);
    fill(blocks, tx - 2, py + 9, tz - 2, tx + 2, py + 9, tz + 2, B.STONEBRICK);  // 塔頂平台
    blocks.push([tx, py + 10, tz, B.GLOWSTONE]);
    drops.push([tx + 0.5, py + 10.5, tz + 1.5, B.FIRE_BOW]);
    // 樓梯（半磚階梯上塔）
    for (let s = 0; s < 9; s++) blocks.push([tx + 2 + Math.floor(s / 2), py + 8 - s, tz, s % 2 ? B.SLAB_STONE : B.STONE]);
    // 三塊黃金（要塞角落廢墟）
    drops.push([ox + S - 2.5, py + 1.5, oz - S + 2.5, B.GOLD_INGOT]);
    drops.push([ox + S - 2.5, py + 1.5, oz + S - 2.5, B.GOLD_INGOT]);
    drops.push([ox - S + 2.5, py + 1.5, oz + S - 2.5, B.GOLD_INGOT]);
    points.boss = [ox + 0.5, py + 14, oz + 0.5]; // 火龍從天而降
    points.playerSpawn = [ox + 0.5, py + 1.1, oz + 8.5];
  }

  return { blocks, drops, points };
}

const MWLevels = { LEVELS, buildStructure };
if (typeof module !== 'undefined') module.exports = MWLevels;
if (typeof window !== 'undefined') window.MWLevels = MWLevels;
})();
