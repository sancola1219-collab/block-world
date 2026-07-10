// 物理與射線 — 純邏輯，node 可測。
// 座標：x 向東、z 向南、y 向上；yaw=0 面向 -z。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const BK4 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { isSolid, isLiquid, def } = BK4;

const GRAVITY = 24;
const JUMP_V = 8.4;

function createPlayer(x, y, z) {
  return {
    x, y, z,            // 腳底中心
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0,
    hw: 0.3, hh: 1.8,   // 半寬、身高
    eye: 1.62,
    onGround: false,
    inWater: false, headInWater: false,
    fly: false,
    hp: 20, maxHp: 20,
    air: 10,            // 水下氧氣（秒）
    fallV: 0,           // 落地當下的下墜速度（算摔傷）
    hurtCool: 0,
  };
}

// AABB 與世界碰撞：逐軸移動。box={x,y,z,hw,hh}（x,z 為中心、y 為底）
function moveBox(world, b, dx, dy, dz) {
  const res = { hitX: false, hitY: false, hitZ: false, onGround: false };
  const eps = 0.001;

  // 回傳 null 或 {top: 最高的方塊頂}（半高方塊 def.h 佔 [by, by+h]）
  const overlaps = (x, y, z) => {
    const x0 = Math.floor(x - b.hw), x1 = Math.floor(x + b.hw);
    const y0 = Math.floor(y), y1 = Math.floor(y + b.hh - eps);
    const z0 = Math.floor(z - b.hw), z1 = Math.floor(z + b.hw);
    let top = -Infinity;
    for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) {
      const id = world.getBlock(bx, by, bz);
      if (!isSolid(id)) continue;
      const h = def(id).h !== undefined ? def(id).h : 1;
      if (y >= by + h) continue; // box 底在方塊頂之上（半磚上方走過不算撞）
      if (by + h > top) top = by + h;
    }
    return top > -Infinity ? { top } : null;
  };

  // X
  let nx = b.x + dx;
  if (overlaps(nx, b.y, b.z)) {
    if (dx > 0) nx = Math.floor(nx + b.hw) - b.hw - eps;
    else nx = Math.floor(nx - b.hw) + 1 + b.hw + eps;
    if (overlaps(nx, b.y, b.z)) nx = b.x; // 角落夾縫保護
    res.hitX = true;
  }
  b.x = nx;
  // Z
  let nz = b.z + dz;
  if (overlaps(b.x, b.y, nz)) {
    if (dz > 0) nz = Math.floor(nz + b.hw) - b.hw - eps;
    else nz = Math.floor(nz - b.hw) + 1 + b.hw + eps;
    if (overlaps(b.x, b.y, nz)) nz = b.z;
    res.hitZ = true;
  }
  b.z = nz;
  // Y
  let ny = b.y + dy;
  const oy = overlaps(b.x, ny, b.z);
  if (oy) {
    if (dy > 0) ny = Math.floor(ny + b.hh - eps) - b.hh - eps * 2;
    else { ny = oy.top + eps; res.onGround = true; }
    if (overlaps(b.x, ny, b.z)) ny = b.y;
    res.hitY = true;
  }
  b.y = ny;
  return res;
}

// 放置方塊會不會卡到 box
function boxIntersectsBlock(b, bx, by, bz) {
  return bx + 1 > b.x - b.hw && bx < b.x + b.hw &&
         by + 1 > b.y && by < b.y + b.hh &&
         bz + 1 > b.z - b.hw && bz < b.z + b.hw;
}

// input：{mf(前後 -1..1), ms(左右 -1..1), jump, run, up, down}
// mods：英雄能力倍率 {speedMul, jumpMul}（冒險關卡用，預設 1）
function stepPlayer(p, world, input, dt, mode, mods) {
  const mm = mods || {};
  const feet = world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
  const eyeB = world.getBlock(Math.floor(p.x), Math.floor(p.y + p.eye), Math.floor(p.z));
  p.inWater = isLiquid(feet);
  p.headInWater = isLiquid(eyeB);

  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // yaw=0 面向 -z：前進 = (-sin, -cos)
  let wx = (-sin) * input.mf + cos * input.ms;
  let wz = (-cos) * input.mf - sin * input.ms;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }

  const speed = (p.fly ? 11 : (p.inWater ? 3.2 : (input.run ? 5.8 : 4.35))) * (mm.speedMul || 1);
  const accel = p.onGround || p.fly ? 60 : (p.inWater ? 25 : 18);

  p.vx += (wx * speed - p.vx) * Math.min(1, accel * dt / speed * 2);
  p.vz += (wz * speed - p.vz) * Math.min(1, accel * dt / speed * 2);
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vz) < 0.01) p.vz = 0;

  if (p.fly && mode === 'creative') {
    p.vy += ((input.up ? 9 : 0) - (input.down ? 9 : 0) - p.vy) * Math.min(1, 10 * dt);
  } else if (p.inWater) {
    p.vy -= 5 * dt;
    if (input.jump) p.vy = Math.min(p.vy + 24 * dt, 4.2);
    p.vy *= (1 - Math.min(1, 2.2 * dt));
    if (p.vy < -3) p.vy = -3;
  } else {
    p.vy -= GRAVITY * dt;
    if (input.jump && p.onGround) { p.vy = JUMP_V * (mm.jumpMul || 1); p.onGround = false; }
    if (p.vy < -50) p.vy = -50;
  }

  const wasOnGround = p.onGround;
  const preVy = p.vy;
  const r = moveBox(world, p, p.vx * dt, p.vy * dt, p.vz * dt);
  if (r.hitX) p.vx = 0;
  if (r.hitZ) p.vz = 0;
  if (r.hitY) {
    p.vy = 0;
    if (r.onGround && p.fly) p.fly = false;
  }
  p.onGround = r.hitY && r.onGround;
  // 只在「落地那一刻」記錄下墜速度（主程式據此算摔傷）
  p.fallV = (!wasOnGround && p.onGround) ? preVy : 0;
  return r;
}

// DDA 體素射線（Amanatides & Woo）
function raycast(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy : Infinity;
  let tz = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz : Infinity;
  let px = x, py = y, pz = z, dist = 0;

  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && !isLiquid(id)) {
      return { hit: true, x, y, z, px, py, pz, id, dist };
    }
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { dist = tx; x += stepX; tx += tdx; }
    else if (ty < tz) { dist = ty; y += stepY; ty += tdy; }
    else { dist = tz; z += stepZ; tz += tdz; }
    if (dist > maxDist) return { hit: false };
  }
  return { hit: false };
}

function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

const MWPhysics = { GRAVITY, JUMP_V, createPlayer, moveBox, boxIntersectsBlock, stepPlayer, raycast, lookDir };
if (typeof module !== 'undefined') module.exports = MWPhysics;
if (typeof window !== 'undefined') window.MWPhysics = MWPhysics;
})();
