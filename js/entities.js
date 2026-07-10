// 實體：掉落物、豬、殭屍 — 純邏輯，node 可測。
// 所有隨機經由呼叫端傳入的 rand()（mulberry32），保持決定性可測。
'use strict';

const PH = (typeof module !== 'undefined') ? require('./physics.js') : window.MWPhysics;
const BK5 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { moveBox } = PH;
const { isLiquid } = BK5;

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
  if (d.age > 120) { d.dead = true; return null; }

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
  pig: { hp: 10, hw: 0.35, hh: 0.9, speed: 1.4, name: '豬' },
  zombie: { hp: 20, hw: 0.3, hh: 1.85, speed: 2.3, name: '殭屍' },
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

  // 白天殭屍燃燒
  if (m.type === 'zombie' && !isNight) {
    m.burning = true;
    if (m.age % 1 < dt) { m.hp -= 3; m.hurtT = 0.3; }
  }

  const def = MOB_DEFS[m.type];
  const dx = player.x - m.x, dz = player.z - m.z;
  const dist = Math.hypot(dx, dz);
  let mvx = 0, mvz = 0;

  if (m.type === 'zombie' && dist < 24 && player.hp > 0) {
    // 追擊
    mvx = dx / (dist || 1); mvz = dz / (dist || 1);
    m.yaw = Math.atan2(-mvx, -mvz);
    const dy = Math.abs((player.y) - m.y);
    if (dist < 1.5 && dy < 2 && m.attackCool <= 0) {
      m.attackCool = 1.1;
      events.push({ type: 'attack', dmg: 2, x: m.x, z: m.z });
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

function hurtMob(m, dmg, kx, kz) {
  if (m.hp <= 0) return;
  m.hp -= dmg;
  m.hurtT = 0.4;
  const kl = Math.hypot(kx, kz) || 1;
  m.vx += kx / kl * 6; m.vz += kz / kl * 6; m.vy = 5;
}

const MWEntities = { MOB_DEFS, makeDrop, stepDrop, makeMob, stepMob, hurtMob };
if (typeof module !== 'undefined') module.exports = MWEntities;
if (typeof window !== 'undefined') window.MWEntities = MWEntities;
