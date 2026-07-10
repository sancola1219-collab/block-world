// 實體：掉落物、豬、殭屍 — 純邏輯，node 可測。
// 所有隨機經由呼叫端傳入的 rand()（mulberry32），保持決定性可測。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const PH = (typeof module !== 'undefined') ? require('./physics.js') : window.MWPhysics;
const BK5 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { moveBox } = PH;
const { isLiquid, isSolid } = BK5;

// ---- 掉落物 ----
function makeDrop(x, y, z, blockId, rand) {
  return {
    kind: 'drop', blockId,
    x, y, z, hw: 0.12, hh: 0.24,
    vx: (rand() - 0.5) * 2, vy: 3.5, vz: (rand() - 0.5) * 2,
    age: 0, spin: rand() * Math.PI * 2,
    dead: false,
  };
}

// 回傳 'pickup' | null
function stepDrop(d, world, dt, player) {
  d.age += dt;
  d.spin += dt * 2;
  if (d.age > 120 && !d.persistent) { d.dead = true; return null; }

  const px = player.x - d.x, py = (player.y + 0.9) - (d.y + 0.1), pz = player.z - d.z;
  const dist = Math.hypot(px, py, pz);
  if (d.age > 0.5) {
    if (dist < 0.9) { d.dead = true; return 'pickup'; }
    if (dist < 2.2) { // 磁吸
      const s = 6 / Math.max(dist, 0.3);
      d.vx += px * s * dt * 4; d.vy += py * s * dt * 4; d.vz += pz * s * dt * 4;
    }
  }
  const inWater = isLiquid(world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)));
  d.vy -= (inWater ? 2 : 20) * dt;
  if (inWater && d.vy < -0.5) d.vy = -0.5;
  d.vx *= 1 - Math.min(1, (inWater ? 3 : 1.5) * dt);
  d.vz *= 1 - Math.min(1, (inWater ? 3 : 1.5) * dt);
  const r = moveBox(world, d, d.vx * dt, d.vy * dt, d.vz * dt);
  if (r.hitY) { d.vy = 0; d.vx *= 0.6; d.vz *= 0.6; }
  if (r.hitX) d.vx = 0;
  if (r.hitZ) d.vz = 0;
  return null;
}

// ---- 生物 ----
const MOB_DEFS = {
  pig: { hp: 8, hw: 0.35, hh: 0.9, speed: 1.4, name: '豬' },
  sheep: { hp: 8, hw: 0.4, hh: 1.15, speed: 1.2, name: '羊' },
  cow: { hp: 10, hw: 0.45, hh: 1.3, speed: 1.1, name: '牛' },
  zombie: { hp: 16, hw: 0.3, hh: 1.85, speed: 2.3, name: '殭屍', hostile: true, dmg: 2, burns: true },
  creeper: { hp: 12, hw: 0.3, hh: 1.6, speed: 1.9, name: '苦力怕' },
  // 冒險關卡敵人
  minion: { hp: 10, hw: 0.3, hh: 1.85, speed: 2.2, name: '黑暗爪牙', hostile: true, dmg: 2 },
  darkwizard: { hp: 60, hw: 0.38, hh: 2.3, speed: 2.6, name: '黑巫師', hostile: true, dmg: 4, scale: 1.25, aggro: 40, boss: true },
  robot: { hp: 14, hw: 0.3, hh: 1.85, speed: 2.0, name: '機器人', hostile: true, dmg: 3 },
  robotking: { hp: 80, hw: 0.48, hh: 2.95, speed: 2.2, name: '機器人首領', hostile: true, dmg: 5, scale: 1.6, aggro: 40, boss: true },
  shadowblade: { hp: 8, hw: 0.28, hh: 1.7, speed: 3.2, name: '影武士', hostile: true, dmg: 2, scale: 0.92 },
  shadowmaster: { hp: 70, hw: 0.36, hh: 2.2, speed: 2.4, name: '暗影大師', hostile: true, dmg: 4, scale: 1.3, aggro: 40, boss: true, teleports: true },
  lizard: { hp: 16, hw: 0.32, hh: 1.85, speed: 2.2, name: '蜥蜴戰士', hostile: true, dmg: 3 },
  dragon: { hp: 150, hw: 1.1, hh: 1.8, speed: 3.0, name: '火龍', hostile: true, dmg: 6, scale: 1.5, aggro: 60, boss: true, fly: true },
};

function makeMob(type, x, y, z) {
  const d = MOB_DEFS[type];
  return {
    kind: 'mob', type,
    x, y, z, hw: d.hw, hh: d.hh,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, hp: d.hp,
    wanderT: 0, wx: 0, wz: 0,      // 漫遊方向與計時
    attackCool: 0, hurtT: 0,
    onGround: false, anim: 0,
    dead: false, deathT: 0, burning: false,
    fuse: 0, exploded: false,
    age: 0,
  };
}

// events: 陣列，會推入 {type:'attack', dmg} / {type:'mobdie', mob}
function stepMob(m, world, dt, player, rand, isNight, events) {
  m.age += dt;
  if (m.hurtT > 0) m.hurtT -= dt;
  if (m.attackCool > 0) m.attackCool -= dt;

  if (m.hp <= 0) {
    m.deathT += dt;
    if (m.deathT === dt) events.push({ type: 'mobdie', mob: m });
    if (m.deathT > 0.7) m.dead = true;
    m.vx *= 0.9; m.vz *= 0.9;
    m.vy -= 20 * dt;
    moveBox(world, m, m.vx * dt, m.vy * dt, m.vz * dt);
    return;
  }

  const def = MOB_DEFS[m.type];

  // 白天燃燒（殭屍類）
  if (def.burns && !isNight) {
    m.burning = true;
    if (m.age % 1 < dt) { m.hp -= 3; m.hurtT = 0.3; }
  }

  const dx = player.x - m.x, dz = player.z - m.z;
  const dist = Math.hypot(dx, dz);
  let mvx = 0, mvz = 0;

  // 火龍：環繞玩家飛行（不受重力），定時噴火球，貼近咬人
  if (def.fly) {
    m.orbitA = (m.orbitA || 0) + dt * 0.55;
    m.fireCool = (m.fireCool || 2) - dt;
    const tx = player.x + Math.cos(m.orbitA) * 11;
    const ty = player.y + 7 + Math.sin(m.age * 0.7) * 2;
    const tz = player.z + Math.sin(m.orbitA) * 11;
    const ddx = tx - m.x, ddy = ty - m.y, ddz = tz - m.z;
    const dd = Math.hypot(ddx, ddy, ddz) || 1;
    const sp = Math.min(def.speed * 3, dd * 2);
    m.vx = ddx / dd * sp; m.vy = ddy / dd * sp; m.vz = ddz / dd * sp;
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    m.yaw = Math.atan2(-(dx / (dist || 1)), -(dz / (dist || 1)));
    m.anim += dt * 7; // 拍翅
    if (m.fireCool <= 0 && player.hp > 0 && dist < 45) {
      m.fireCool = 2.4;
      events.push({ type: 'dragonfire', x: m.x, y: m.y + 0.6, z: m.z });
    }
    if (dist < 3 && Math.abs(player.y - m.y) < 3.5 && m.attackCool <= 0) {
      m.attackCool = 1.2;
      events.push({ type: 'attack', dmg: def.dmg, x: m.x, z: m.z });
    }
    return;
  }

  if (def.hostile && dist < (def.aggro || 24) && player.hp > 0) {
    // 暗影大師：距離拉開就瞬移到玩家身邊
    if (def.teleports) {
      m.tpCool = (m.tpCool === undefined ? 1.5 : m.tpCool) - dt;
      if (m.tpCool <= 0 && dist > 5) {
        const a = rand() * Math.PI * 2;
        m.x = player.x + Math.sin(a) * 2.5;
        m.z = player.z + Math.cos(a) * 2.5;
        m.y = player.y + 0.1;
        m.vx = 0; m.vy = 0; m.vz = 0;
        m.tpCool = 2.8;
        events.push({ type: 'poof', x: m.x, z: m.z });
      }
    }
    // 追擊（貼身就停下，不鑽進玩家身體）
    const reach = 1.1 + (def.scale ? (def.scale - 1) * 0.6 : 0);
    if (dist > reach) { mvx = dx / (dist || 1); mvz = dz / (dist || 1); }
    m.yaw = Math.atan2(-(dx / (dist || 1)), -(dz / (dist || 1)));
    const dy = Math.abs((player.y) - m.y);
    if (dist < reach + 0.5 && dy < 2.5 && m.attackCool <= 0) {
      m.attackCool = 1.1;
      events.push({ type: 'attack', dmg: def.dmg || 2, x: m.x, z: m.z });
    }
  } else if (m.type === 'creeper' && dist < 9 && player.hp > 0) {
    // 逼近；貼近時點燃引信，跑遠就熄
    m.yaw = Math.atan2(-(dx / (dist || 1)), -(dz / (dist || 1)));
    if (dist < 2.6) {
      if (m.fuse === 0) events.push({ type: 'hiss', x: m.x, z: m.z });
      m.fuse += dt;
      if (m.fuse >= 1.5 && !m.exploded) {
        m.exploded = true; m.dead = true;
        events.push({ type: 'explode', x: m.x, y: m.y + 0.8, z: m.z, r: 2.4, dmg: 14 });
      }
    } else {
      m.fuse = Math.max(0, m.fuse - dt * 2);
      mvx = dx / (dist || 1); mvz = dz / (dist || 1);
    }
  } else {
    // 漫遊
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 2 + rand() * 4;
      if (rand() < 0.55) { m.wx = 0; m.wz = 0; }
      else { const a = rand() * Math.PI * 2; m.wx = Math.sin(a); m.wz = Math.cos(a); }
    }
    mvx = m.wx; mvz = m.wz;
    if (mvx || mvz) m.yaw = Math.atan2(-mvx, -mvz);
  }

  const speed = def.speed * (m.type === 'zombie' && dist >= 24 ? 0.5 : 1);
  m.vx += (mvx * speed - m.vx) * Math.min(1, 8 * dt);
  m.vz += (mvz * speed - m.vz) * Math.min(1, 8 * dt);

  const inWater = isLiquid(world.getBlock(Math.floor(m.x), Math.floor(m.y + 0.2), Math.floor(m.z)));
  if (inWater) {
    m.vy += (2.5 - m.vy) * Math.min(1, 3 * dt); // 上浮
  } else {
    m.vy -= 24 * dt;
  }
  const r = moveBox(world, m, m.vx * dt, m.vy * dt, m.vz * dt);
  m.onGround = r.hitY && r.onGround;
  if (r.hitY) m.vy = 0;
  // 撞牆跳
  if ((r.hitX || r.hitZ) && m.onGround && (mvx || mvz)) m.vy = 8;

  m.anim += dt * Math.hypot(m.vx, m.vz) * 3;
}

// ---- 投射物 ----
// 玩家用：magic 魔法彈、shield 回力圓盾、arrow 箭、shuriken 手裡劍、firearrow 火焰箭
// 敵人用：fireball 火龍吐息（hostile=true，打玩家）
const PROJ_DEFS = {
  magic: { speed: 26, life: 1.2 },
  shield: { speed: 22, life: 0.55 }, // 飛 0.55s 後折返
  arrow: { speed: 30, life: 1.4 },
  shuriken: { speed: 32, life: 0.9 },
  firearrow: { speed: 28, life: 1.5 },
  fireball: { speed: 13, life: 3.5 },
};

function makeProjectile(type, x, y, z, dx, dy, dz, dmg, hostile) {
  const pd = PROJ_DEFS[type];
  return {
    kind: 'proj', type, dmg, hostile: !!hostile,
    x, y, z,
    vx: dx * pd.speed, vy: dy * pd.speed, vz: dz * pd.speed,
    life: pd.life,
    returning: false, spin: 0,
    dead: false,
  };
}

// events 推入 {type:'projhit', mob, dmg, kx, kz}（打中生物）
// 或 {type:'projhitplayer', dmg, x, z}（敵方投射物打中玩家）
// 圓盾回到玩家手上時 dead 且 caught=true
function stepProjectile(pr, world, dt, player, mobs, events) {
  pr.spin += dt * 18;
  if (pr.returning) {
    const tx = player.x - pr.x, ty = player.y + 1.2 - pr.y, tz = player.z - pr.z;
    const d = Math.hypot(tx, ty, tz);
    if (d < 1.0) { pr.dead = true; pr.caught = true; return; }
    const s = 24 / (d || 1);
    pr.vx = tx * s; pr.vy = ty * s; pr.vz = tz * s;
  } else {
    pr.life -= dt;
    if (pr.life <= 0) {
      if (pr.type === 'shield') pr.returning = true;
      else pr.dead = true;
    }
  }
  // 瞄準輔助：玩家投射物往「前方錐角內最近的敵人」微幅轉向。
  // 沒有它，繞飛的火龍幾乎打不中（射到的時候牠已經飛走了）。
  if (!pr.hostile && pr.type !== 'shield' && !pr.returning) {
    let best = null, bestD = 14;
    for (const m of mobs) {
      if (m.hp <= 0 || !MOB_DEFS[m.type].hostile) continue; // 不吸向豬羊牛等友善生物
      const d = Math.hypot(m.x - pr.x, m.y + m.hh / 2 - pr.y, m.z - pr.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) {
      const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
      const tx = best.x - pr.x, ty = best.y + best.hh / 2 - pr.y, tz = best.z - pr.z;
      const tl = Math.hypot(tx, ty, tz) || 1;
      const dot = (pr.vx * tx + pr.vy * ty + pr.vz * tz) / (sp * tl);
      if (dot > 0.7) { // 約 45° 錐角內才修正，射反方向不會迴轉
        const k = Math.min(1, 7 * dt);
        pr.vx += (tx / tl * sp - pr.vx) * k;
        pr.vy += (ty / tl * sp - pr.vy) * k;
        pr.vz += (tz / tl * sp - pr.vz) * k;
        const ns = Math.hypot(pr.vx, pr.vy, pr.vz) || 1;
        pr.vx *= sp / ns; pr.vy *= sp / ns; pr.vz *= sp / ns;
      }
    }
  }

  pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;

  if (pr.hostile) {
    // 敵方投射物：打玩家
    const dy = pr.y - (player.y + 0.9);
    if (Math.hypot(pr.x - player.x, dy, pr.z - player.z) < 1.0) {
      events.push({ type: 'projhitplayer', dmg: pr.dmg, x: pr.x, z: pr.z });
      pr.dead = true;
      return;
    }
  } else {
    // 撞生物（命中半徑跟著體型走，大隻的比較好打）
    for (const m of mobs) {
      if (m.hp <= 0 || (pr.hitSet && pr.hitSet.has(m))) continue;
      const md = MOB_DEFS[m.type];
      const hitR = Math.max(0.8 + (md.scale || 1) * 0.25, md.hw * 2);
      const dy = pr.y - (m.y + m.hh / 2);
      if (Math.hypot(pr.x - m.x, dy, pr.z - m.z) < hitR) {
        events.push({ type: 'projhit', mob: m, dmg: pr.dmg, kx: m.x - player.x, kz: m.z - player.z });
        if (pr.type === 'shield') {
          pr.returning = true;
          (pr.hitSet || (pr.hitSet = new Set())).add(m); // 回程不重複打同一隻
        } else pr.dead = true;
        return;
      }
    }
  }
  // 撞方塊
  if (isSolid(world.getBlock(Math.floor(pr.x), Math.floor(pr.y), Math.floor(pr.z)))) {
    if (pr.type === 'shield') pr.returning = true;
    else pr.dead = true;
  }
}

function hurtMob(m, dmg, kx, kz) {
  if (m.hp <= 0) return;
  m.hp -= dmg;
  m.hurtT = 0.4;
  const kl = Math.hypot(kx, kz) || 1;
  m.vx += kx / kl * 6; m.vz += kz / kl * 6; m.vy = 5;
}

const MWEntities = { MOB_DEFS, makeDrop, stepDrop, makeMob, stepMob, hurtMob, makeProjectile, stepProjectile };
if (typeof module !== 'undefined') module.exports = MWEntities;
if (typeof window !== 'undefined') window.MWEntities = MWEntities;
})();
