// 主程式：狀態機、60Hz 固定時步、區塊串流、互動、HUD 與選單 — 瀏覽器層。
'use strict';

(function () {
  const { B, def, isSolid, isLiquid, dropOf, tileOf, CREATIVE_LIST } = MWBlocks;
  const WG = MWWorldgen;
  const { CHUNK, WORLD_H, SEA } = WG;
  const PH = MWPhysics;
  const EN = MWEntities;
  const INV = MWInv;
  const SFX = MWAudio.SFX;

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const renderer = MWRender.createRenderer(canvas);
  if (!renderer) {
    $('loading').style.display = 'none';
    $('error').style.display = 'flex';
    return;
  }
  MWInput.attach(canvas);
  const atlasCv = MWTextures.makeAtlas(); // 2D 圖示用

  // 設定記憶（音樂開關等，與世界存檔分開）
  const SETTINGS_KEY = 'mineworld.settings.v1';
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveSettings(patch) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), patch)));
    } catch (e) { /* 空間不足就算了 */ }
  }

  // ---------- 遊戲狀態 ----------
  const VIEW_R = 6;          // 顯示半徑（區塊）
  const GEN_R = VIEW_R + 1;  // 生成半徑
  const DAY_LEN = 600;       // 一天秒數
  const G = {
    state: 'title',          // title | playing | pause | inv | death
    world: null, mode: 'creative', seed: 0,
    player: null, inv: null,
    time: 0.30, playedT: 0,
    drops: [], mobs: [],
    spawn: { x: 0.5, y: 50, z: 0.5 },
    digTarget: null, digProgress: 0, digCool: 0, placeCool: 0,
    meshed: new Set(), unloadT: 0, autosaveT: 0,
    hurtFlash: 0, drownT: 0, swapSrc: null,
    rand: MWNoise.mulberry32((Math.random() * 1e9) | 0),
  };

  // 依距離排序的區塊偏移（串流順序）
  const SPIRAL = [];
  for (let dx = -GEN_R; dx <= GEN_R; dx++) for (let dz = -GEN_R; dz <= GEN_R; dz++) SPIRAL.push([dx, dz]);
  SPIRAL.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));

  // ---------- 世界建立 ----------
  function findSpawn(world) {
    for (let r = 0; r < 40; r++) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a) * r * 8), z = Math.round(Math.sin(a) * r * 8);
        const h = WG.terrainHeight(world.seed, x, z);
        if (h > SEA + 1 && !WG.treeAt(world.seed, x, z)) return { x: x + 0.5, y: h + 1.05, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 70, z: 0.5 };
  }

  function newGame(mode, seed) {
    G.mode = mode;
    G.seed = seed;
    G.world = new MWWorld.World(seed);
    G.spawn = findSpawn(G.world);
    G.player = PH.createPlayer(G.spawn.x, G.spawn.y, G.spawn.z);
    G.inv = INV.createInventory();
    G.time = 0.30;
    G.drops = []; G.mobs = [];
    G.meshed.clear();
    G.playedT = 0;
    G.freshSpawn = true;
    if (mode === 'creative') {
      const starter = [B.GRASS, B.DIRT, B.STONE, B.PLANK, B.LOG, B.GLASS, B.BRICK, B.GLOWSTONE, B.WOOL_RED];
      starter.forEach((id, i) => { G.inv.slots[i] = { id, count: 1 }; });
      G.player.fly = true;
    }
  }

  function loadGame(o) {
    G.mode = o.mode === 'survival' ? 'survival' : 'creative';
    G.seed = o.seed;
    G.world = new MWWorld.World(o.seed);
    G.world.loadEdits(o.edits || {});
    G.spawn = o.spawn || findSpawn(G.world);
    G.player = PH.createPlayer(o.player.x, o.player.y, o.player.z);
    G.player.yaw = o.player.yaw || 0;
    G.player.pitch = o.player.pitch || 0;
    G.player.hp = o.player.hp !== undefined ? o.player.hp : 20;
    G.player.fly = !!o.player.fly;
    G.inv = INV.deserializeInv(o.inv);
    G.time = o.time || 0.3;
    G.drops = []; G.mobs = [];
    G.meshed.clear();
    G.playedT = 0;
    G.freshSpawn = false;
    MWInput.state.yaw = G.player.yaw;
    MWInput.state.pitch = G.player.pitch;
  }

  function doSave(silent) {
    if (!G.world) return false;
    const ok = MWSave.saveTo(localStorage, {
      seed: G.seed, mode: G.mode, time: G.time,
      player: {
        x: G.player.x, y: G.player.y, z: G.player.z,
        yaw: MWInput.state.yaw, pitch: MWInput.state.pitch,
        hp: G.player.hp, fly: G.player.fly,
      },
      spawn: G.spawn,
      inv: INV.serializeInv(G.inv),
      edits: G.world.serializeEdits(),
    });
    if (!silent) {
      $('save-msg').textContent = ok ? '已儲存！' : '儲存失敗（空間不足？）';
      setTimeout(() => { $('save-msg').textContent = ''; }, 2000);
    }
    return ok;
  }

  // ---------- 區塊串流（每幀時間預算） ----------
  function chunkWork(budgetMs) {
    const t0 = performance.now();
    const w = G.world;
    const pcx = Math.floor(G.player.x / CHUNK), pcz = Math.floor(G.player.z / CHUNK);

    // 先重刷髒區塊
    for (const key of w.dirty) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) <= VIEW_R && Math.abs(cz - pcz) <= VIEW_R) {
        renderer.setChunkMesh(key, cx, cz, MWMesher.buildChunkMesh(w, cx, cz));
        G.meshed.add(key);
      }
      w.dirty.delete(key);
      if (performance.now() - t0 > budgetMs) return;
    }

    for (const [dx, dz] of SPIRAL) {
      const cx = pcx + dx, cz = pcz + dz;
      const key = w.key(cx, cz);
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (!w.hasChunk(cx, cz)) {
        w.getChunk(cx, cz);
        if (performance.now() - t0 > budgetMs) return;
        continue;
      }
      if (d <= VIEW_R && !G.meshed.has(key)) {
        if (w.hasChunk(cx - 1, cz) && w.hasChunk(cx + 1, cz) && w.hasChunk(cx, cz - 1) && w.hasChunk(cx, cz + 1)) {
          renderer.setChunkMesh(key, cx, cz, MWMesher.buildChunkMesh(w, cx, cz));
          G.meshed.add(key);
          if (performance.now() - t0 > budgetMs) return;
        }
      }
    }
  }

  function unloadFar() {
    const pcx = Math.floor(G.player.x / CHUNK), pcz = Math.floor(G.player.z / CHUNK);
    const removed = G.world.unloadBeyond(pcx, pcz, GEN_R + 2);
    for (const key of removed) {
      renderer.deleteChunkMesh(key);
      G.meshed.delete(key);
    }
  }

  // ---------- 天色 ----------
  function skyState() {
    const th = G.time * Math.PI * 2;
    const sunY = Math.sin(th), sunX = Math.cos(th);
    const day = Math.max(0.04, Math.min(1, (sunY + 0.12) * 3));
    const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    let top = lerp([0.012, 0.02, 0.06], [0.32, 0.60, 0.95], day);
    let hor = lerp([0.04, 0.07, 0.14], [0.70, 0.83, 0.95], day);
    const sf = Math.max(0, 1 - Math.abs(sunY) * 4.5) * Math.min(1, day * 3);
    hor = lerp(hor, [0.95, 0.52, 0.28], sf * 0.75);
    return {
      day, sunY,
      sunDir: [sunX, sunY, 0.18],
      top, hor,
      starAlpha: Math.max(0, Math.min(0.9, -sunY * 2.5)),
      isNight: sunY < -0.06,
    };
  }

  // ---------- 遊戲主邏輯（60Hz） ----------
  function tick(dt) {
    if (G.state !== 'playing') return;
    const p = G.player, w = G.world, inp = MWInput.state;

    G.time = (G.time + dt / DAY_LEN) % 1;
    G.playedT += dt;
    G.autosaveT += dt;
    if (G.autosaveT > 30) { G.autosaveT = 0; doSave(true); }
    G.unloadT += dt;
    if (G.unloadT > 5) { G.unloadT = 0; unloadFar(); }
    if (G.hurtFlash > 0) G.hurtFlash -= dt;
    if (p.hurtCool > 0) p.hurtCool -= dt;
    if (G.digCool > 0) G.digCool -= dt;
    if (G.placeCool > 0) G.placeCool -= dt;

    // 移動
    p.yaw = inp.yaw; p.pitch = inp.pitch;
    const axes = MWInput.moveAxes();
    const wasInWater = p.inWater;
    PH.stepPlayer(p, w, {
      mf: axes.mf, ms: axes.ms, run: axes.run && !p.fly,
      jump: inp.keys.has('Space'),
      up: inp.keys.has('Space'),
      down: inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight'),
    }, dt, G.mode);
    if (!wasInWater && p.inWater && p.vy < -3) SFX.splash();

    // 摔傷、溺水、虛空
    if (G.mode === 'survival') {
      if (p.fallV < -12.5 && !p.inWater) {
        damagePlayer(Math.round((-p.fallV - 12.5) * 0.9), null);
      }
      if (p.headInWater) {
        p.air -= dt;
        if (p.air <= 0) {
          p.air = 0;
          G.drownT += dt;
          if (G.drownT >= 1) { G.drownT = 0; damagePlayer(2, null); SFX.drown(); }
        }
      } else { p.air = Math.min(10, p.air + dt * 3); G.drownT = 0; }
    }
    if (p.y < -12) { p.hp = 0; }
    if (p.hp <= 0 && G.mode === 'survival') { onDeath(); return; }
    if (G.mode === 'creative') p.hp = 20;

    // 準星目標
    const eye = [p.x, p.y + p.eye, p.z];
    const dir = PH.lookDir(p.yaw, p.pitch);
    const ray = PH.raycast(w, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 5.5);

    // 攻擊生物（點擊瞬間優先於挖掘）
    if (inp.transient.leftClick) {
      const mob = pickMob(eye, dir);
      if (mob) {
        EN.hurtMob(mob, 4, mob.x - p.x, mob.z - p.z);
        SFX.attackHit();
        if (mob.type === 'pig') SFX.pig();
        inp.transient.leftClick = false;
      }
    }

    // 挖掘
    if (inp.mouseDown[0] && ray.hit) {
      const hard = def(ray.id).hardness;
      if (hard >= 0) {
        if (G.mode === 'creative') {
          if (G.digCool <= 0) {
            breakBlock(ray.x, ray.y, ray.z, ray.id, false);
            G.digCool = 0.22;
          }
        } else {
          const sameTarget = G.digTarget && G.digTarget.x === ray.x && G.digTarget.y === ray.y && G.digTarget.z === ray.z;
          if (!sameTarget) { G.digTarget = { x: ray.x, y: ray.y, z: ray.z }; G.digProgress = 0; }
          G.digProgress += dt / Math.max(0.15, hard);
          if ((G.playedT % 0.28) < dt) SFX.dig(soundKind(ray.id));
          if (G.digProgress >= 1) {
            breakBlock(ray.x, ray.y, ray.z, ray.id, true);
            G.digTarget = null; G.digProgress = 0;
          }
        }
      }
    } else { G.digTarget = null; G.digProgress = 0; }

    // 放置
    const wantPlace = inp.transient.rightClick || (inp.mouseDown[2] && G.placeCool <= 0);
    if (wantPlace && ray.hit) {
      placeBlock(ray);
      G.placeCool = 0.25;
    }
    // 滴管（中鍵）
    if (inp.transient.midClick && ray.hit) {
      const slot = G.inv.slots[G.inv.sel];
      if (G.mode === 'creative') { G.inv.slots[G.inv.sel] = { id: ray.id, count: 1 }; refreshHotbar(); }
    }

    // 滾輪換格
    if (inp.wheelDelta) {
      G.inv.sel = ((G.inv.sel + inp.wheelDelta) % 9 + 9) % 9;
      refreshHotbar();
    }

    // 掉落物
    for (const d of G.drops) {
      if (EN.stepDrop(d, w, dt, p) === 'pickup') {
        INV.addItem(G.inv, d.blockId, 1);
        SFX.pickup();
        refreshHotbar();
      }
    }
    G.drops = G.drops.filter(d => !d.dead);

    // 生物
    const sky = skyState();
    const events = [];
    for (const m of G.mobs) {
      EN.stepMob(m, w, dt, p, G.rand, sky.isNight, events);
      const dist = Math.hypot(m.x - p.x, m.z - p.z);
      if (dist > 70) m.dead = true;
      if (dist < 14 && G.rand() < dt * 0.08) (m.type === 'pig' ? SFX.pig : SFX.zombie)();
    }
    for (const e of events) {
      if (e.type === 'attack' && G.mode === 'survival') {
        damagePlayer(e.dmg, e);
      }
    }
    G.mobs = G.mobs.filter(m => !m.dead);
    spawnMobs(sky);

    MWInput.clearTransient();
    updateHud();
  }

  function damagePlayer(dmg, src) {
    const p = G.player;
    if (G.mode !== 'survival' || p.hurtCool > 0 || dmg <= 0) return;
    p.hp -= dmg;
    p.hurtCool = 0.6;
    G.hurtFlash = 0.35;
    SFX.hurt();
    if (src) { // 擊退
      const dx = p.x - src.x, dz = p.z - src.z, l = Math.hypot(dx, dz) || 1;
      p.vx += dx / l * 7; p.vz += dz / l * 7; p.vy = 5;
    }
    if (p.hp <= 0) SFX.die();
  }

  function onDeath() {
    G.state = 'death';
    MWInput.releaseLock();
    $('death').style.display = 'flex';
  }

  function respawn() {
    const p = G.player;
    p.x = G.spawn.x; p.y = G.spawn.y; p.z = G.spawn.z;
    p.vx = p.vy = p.vz = 0;
    p.hp = 20; p.air = 10;
    $('death').style.display = 'none';
    G.state = 'playing';
    MWInput.requestLock();
  }

  function pickMob(eye, dir) {
    let best = null, bestT = 4;
    for (const m of G.mobs) {
      if (m.hp <= 0) continue;
      const cx = m.x - eye[0], cy = m.y + m.hh / 2 - eye[1], cz = m.z - eye[2];
      const t = cx * dir[0] + cy * dir[1] + cz * dir[2];
      if (t < 0 || t > bestT) continue;
      const px = cx - dir[0] * t, py = cy - dir[1] * t, pz = cz - dir[2] * t;
      if (Math.hypot(px, py, pz) < 0.75) { best = m; bestT = t; }
    }
    return best;
  }

  function soundKind(id) {
    if ([B.STONE, B.COBBLE, B.STONEBRICK, B.BEDROCK, B.SANDSTONE, B.BRICK, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.GLOWSTONE].includes(id)) return 'stone';
    if ([B.LOG, B.PLANK].includes(id)) return 'wood';
    if ([B.SAND, B.GRAVEL].includes(id)) return 'sand';
    if ([B.LEAF, B.SPRUCE_LEAF, B.FLOWER_RED, B.FLOWER_YELLOW, B.TALL_GRASS, B.CACTUS].includes(id)) return 'leaf';
    return 'dirt';
  }

  function breakBlock(x, y, z, id, withDrop) {
    G.world.setBlock(x, y, z, B.AIR);
    SFX.breakBlock(soundKind(id));
    if (withDrop) {
      const drop = dropOf(id);
      if (drop !== B.AIR) G.drops.push(EN.makeDrop(x + 0.5, y + 0.3, z + 0.5, drop, G.rand));
    }
    // 頂上的花草跟著掉
    const above = G.world.getBlock(x, y + 1, z);
    if (def(above).cross) G.world.setBlock(x, y + 1, z, B.AIR);
  }

  function placeBlock(ray) {
    const slot = G.inv.slots[G.inv.sel];
    if (!slot) return;
    const id = slot.id;
    const tx = ray.px, ty = ray.py, tz = ray.pz;
    const cur = G.world.getBlock(tx, ty, tz);
    const replaceable = cur === B.AIR || isLiquid(cur) || def(cur).cross;
    if (!replaceable) return;
    if (def(id).solid && PH.boxIntersectsBlock(G.player, tx, ty, tz)) return;
    for (const m of G.mobs) if (def(id).solid && PH.boxIntersectsBlock(m, tx, ty, tz)) return;
    if (ty < 1 || ty >= WORLD_H) return;
    if (G.mode === 'survival') INV.consumeSlot(G.inv, G.inv.sel);
    G.world.setBlock(tx, ty, tz, id);
    SFX.place();
    refreshHotbar();
  }

  function spawnMobs(sky) {
    const p = G.player, w = G.world;
    const pigs = G.mobs.filter(m => m.type === 'pig').length;
    const zombies = G.mobs.filter(m => m.type === 'zombie').length;

    if (!sky.isNight && pigs < 5 && G.rand() < 0.008) {
      const a = G.rand() * Math.PI * 2, r = 16 + G.rand() * 18;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      const top = w.topAt(x, z);
      const ground = w.getBlock(x, top, z);
      if ((ground === B.GRASS || ground === B.SNOW_GRASS) && top > SEA) {
        G.mobs.push(EN.makeMob('pig', x + 0.5, top + 1.1, z + 0.5));
      }
    }
    if (sky.isNight && zombies < 7 && G.rand() < 0.02) {
      const a = G.rand() * Math.PI * 2, r = 20 + G.rand() * 16;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      const top = w.topAt(x, z);
      if (top > SEA && top < WORLD_H - 4 && !isLiquid(w.getBlock(x, top + 1, z))) {
        G.mobs.push(EN.makeMob('zombie', x + 0.5, top + 1.1, z + 0.5));
      }
    }
  }

  // ---------- 渲染 ----------
  function renderFrame() {
    if (!G.world) return;
    chunkWork(G.meshed.size < 20 ? 50 : 7);

    const p = G.player;
    const sky = skyState();
    const underwater = p.headInWater;
    const fogFar = underwater ? 20 : 92;
    const fogNear = underwater ? 4 : 62;
    const fogColor = underwater ? [0.05, 0.18, 0.38] : sky.hor;

    const sl = (x, y, z) => G.world.lightAt(Math.floor(x), Math.floor(y), Math.floor(z)) / 15;

    renderer.render({
      cam: { x: p.x, y: p.y + p.eye, z: p.z, yaw: p.yaw, pitch: p.pitch },
      fovY: (MWInput.state.keys.has('ShiftLeft') && !p.fly && p.onGround === false ? 1.28 : 1.22),
      day: sky.day,
      skyTop: sky.top, skyHorizon: sky.hor,
      fogColor, fogNear, fogFar,
      starAlpha: sky.starAlpha,
      underwater,
      glow: 0.85,
      cloudOffset: G.playedT * 1.2,
      billboards: [
        { dir: norm3(sky.sunDir), size: 34, color: [1, 0.97, 0.85, 1] },
        { dir: norm3([-sky.sunDir[0], -sky.sunDir[1], -sky.sunDir[2]]), size: 22, color: [0.92, 0.94, 1, 0.9] },
      ],
      sel: (G.state === 'playing' || G.state === 'inv') && currentSel() || null,
      crack: G.digTarget ? { ...G.digTarget, stage: Math.floor(G.digProgress * 8) } : null,
      drops: G.drops.map(d => ({ x: d.x, y: d.y, z: d.z, spin: d.spin, tile: tileOf(d.blockId, 'side'), light: sl(d.x, d.y + 0.5, d.z) })),
      mobs: G.mobs.map(m => ({
        type: m.type, x: m.x, y: m.y, z: m.z, yaw: m.yaw, anim: m.anim,
        hurtT: m.hurtT, burning: m.burning, deathT: m.deathT,
        light: sl(m.x, m.y + 1, m.z),
      })),
    });
  }

  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  let lastSel = null;
  function currentSel() {
    const p = G.player;
    const dir = PH.lookDir(p.yaw, p.pitch);
    const ray = PH.raycast(G.world, p.x, p.y + p.eye, p.z, dir[0], dir[1], dir[2], 5.5);
    lastSel = ray.hit ? { x: ray.x, y: ray.y, z: ray.z } : null;
    return lastSel;
  }

  // ---------- HUD ----------
  let hudT = 0;
  function updateHud() {
    const p = G.player;
    hudT++;
    if (hudT % 6 !== 0) return;
    if (G.mode === 'survival') {
      const full = Math.max(0, Math.ceil(p.hp / 2));
      $('hearts').innerHTML = '<span style="color:#e04040">' + '❤'.repeat(full) + '</span><span style="color:#444">' + '❤'.repeat(10 - full) + '</span>';
      $('bubbles').textContent = p.headInWater ? '💧'.repeat(Math.ceil(p.air)) : '';
    } else {
      $('hearts').textContent = ''; $('bubbles').textContent = '';
    }
    const biome = WG.biomeAt(G.seed, Math.floor(p.x), Math.floor(p.z));
    const bname = { plains: '草原', forest: '森林', desert: '沙漠', snow: '雪原' }[biome] || biome;
    $('coords').textContent = `x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}  z ${p.z.toFixed(0)}　${bname}${p.fly ? '　✈ 飛行' : ''}`;
    const hour = (G.time * 24 + 6) % 24;
    const sky = skyState();
    $('daynight').textContent = `${sky.isNight ? '🌙' : '☀️'} ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}`;
    G.hurtFlash > 0 ? $('overlay-hurt').style.opacity = 1 : $('overlay-hurt').style.opacity = 0;
    $('overlay-water').style.opacity = p.headInWater ? 1 : 0;
  }

  // 2D 方塊圖示（假等角投影）
  function drawIcon(ctx, id, dx, dy, s) {
    const d = def(id);
    const src = (t) => [(t % 16) * 16, Math.floor(t / 16) * 16];
    if (d.cross || d.liquid) {
      const [sx, sy] = src(tileOf(id, 'side'));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlasCv, sx, sy, 16, 16, dx + s * 0.08, dy + s * 0.08, s * 0.84, s * 0.84);
      return;
    }
    const half = s / 2, q = s / 4, k = 1 / 16;
    ctx.imageSmoothingEnabled = false;
    // 頂
    let [sx, sy] = src(tileOf(id, 'top'));
    ctx.setTransform(half * k, q * k, -half * k, q * k, dx + half, dy);
    ctx.drawImage(atlasCv, sx, sy, 16, 16, 0, 0, 16, 16);
    // 左
    [sx, sy] = src(tileOf(id, 'side'));
    ctx.setTransform(half * k, q * k, 0, half * k, dx, dy + q);
    ctx.drawImage(atlasCv, sx, sy, 16, 16, 0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, 16, 16);
    // 右
    ctx.setTransform(half * k, -q * k, 0, half * k, dx + half, dy + half);
    ctx.drawImage(atlasCv, sx, sy, 16, 16, 0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(0, 0, 16, 16);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function refreshHotbar() {
    const cv = $('hotbar-canvas'), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 9; i++) {
      const x = i * 52;
      ctx.fillStyle = 'rgba(10,12,18,0.62)';
      ctx.fillRect(x, 2, 50, 50);
      ctx.strokeStyle = i === G.inv.sel ? '#ffd24a' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = i === G.inv.sel ? 3 : 1.5;
      ctx.strokeRect(x + 1.5, 3.5, 47, 47);
      const s = G.inv.slots[i];
      if (s) {
        drawIcon(ctx, s.id, x + 8, 8, 34);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (G.mode === 'survival') {
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'right';
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
          ctx.strokeText(s.count, x + 46, 48);
          ctx.fillText(s.count, x + 46, 48);
        }
      }
    }
  }

  // ---------- 物品欄面板 ----------
  function buildSlotDiv(idx, item, cls) {
    const div = document.createElement('div');
    div.className = 'slot' + (cls || '');
    if (item) {
      const c = document.createElement('canvas');
      c.width = 38; c.height = 38;
      drawIcon(c.getContext('2d'), item.id, 3, 3, 30);
      div.appendChild(c);
      if (G.mode === 'survival' && item.count > 1) {
        const n = document.createElement('span');
        n.className = 'cnt'; n.textContent = item.count;
        div.appendChild(n);
      }
      div.title = def(item.id).name;
    }
    return div;
  }

  function openInv() {
    G.state = 'inv';
    MWInput.releaseLock();
    $('inv').style.display = 'flex';
    $('palette-wrap').style.display = G.mode === 'creative' ? 'block' : 'none';
    $('craft-wrap').style.display = G.mode === 'survival' ? 'block' : 'none';
    $('inv-title').textContent = G.mode === 'creative' ? '方塊選單' : '物品欄與合成';
    G.swapSrc = null;
    refreshInvPanel();
  }
  function closeInv() {
    $('inv').style.display = 'none';
    G.state = 'playing';
    MWInput.requestLock();
    refreshHotbar();
  }

  function refreshInvPanel() {
    const grid = $('inv-grid'), hot = $('inv-hotbar'), pal = $('palette'), rec = $('recipes');
    grid.innerHTML = ''; hot.innerHTML = '';
    for (let i = 9; i < 36; i++) grid.appendChild(slotWithClick(i));
    for (let i = 0; i < 9; i++) hot.appendChild(slotWithClick(i));

    if (G.mode === 'creative') {
      pal.innerHTML = '';
      for (const id of CREATIVE_LIST) {
        const div = buildSlotDiv(-1, { id, count: 1 });
        div.addEventListener('click', () => {
          G.inv.slots[G.inv.sel] = { id, count: 64 };
          SFX.click();
          refreshInvPanel(); refreshHotbar();
        });
        pal.appendChild(div);
      }
    } else {
      rec.innerHTML = '';
      for (const r of INV.RECIPES) {
        const row = document.createElement('div');
        row.className = 'recipe';
        const ins = r.ins.map(i => `${def(i.id).name}×${i.count}`).join('＋');
        row.innerHTML = `<span class="rname">${r.name}</span><span class="rin">${ins}</span>`;
        const btn = document.createElement('button');
        btn.textContent = '合成';
        btn.disabled = !INV.canCraft(G.inv, r);
        btn.addEventListener('click', () => {
          if (INV.craft(G.inv, r)) { SFX.craft(); refreshInvPanel(); refreshHotbar(); }
        });
        row.appendChild(btn);
        rec.appendChild(row);
      }
    }
  }

  function slotWithClick(i) {
    const div = buildSlotDiv(i, G.inv.slots[i], (i === G.inv.sel && i < 9 ? ' selected' : '') + (G.swapSrc === i ? ' swap-src' : ''));
    div.addEventListener('click', () => {
      SFX.click();
      if (G.swapSrc === null) {
        if (G.inv.slots[i] || G.mode === 'creative') G.swapSrc = i;
        if (i < 9) G.inv.sel = i;
      } else {
        INV.swapSlots(G.inv, G.swapSrc, i);
        G.swapSrc = null;
      }
      refreshInvPanel();
    });
    div.addEventListener('dblclick', () => {
      if (G.mode === 'creative') { G.inv.slots[i] = null; G.swapSrc = null; refreshInvPanel(); }
    });
    return div;
  }

  // ---------- 選單流程 ----------
  function showTitle() {
    G.state = 'title';
    MWInput.releaseLock();
    for (const id of ['pause', 'inv', 'death', 'help', 'newworld', 'loading']) $(id).style.display = 'none';
    $('title').style.display = 'flex';
    const save = MWSave.loadFrom(localStorage);
    $('btn-continue').disabled = !save;
    $('title-tip').textContent = save ? `已有存檔：${save.mode === 'survival' ? '生存' : '創造'}模式（種子 ${save.seed}）` : '還沒有存檔，開一個新世界吧！';
  }

  async function startWorld() {
    $('title').style.display = 'none';
    $('newworld').style.display = 'none';
    $('loading').style.display = 'flex';
    $('loading-tip').textContent = '世界生成中…';
    // 分幀生成初始區塊，避免凍結
    const pcx = Math.floor(G.player.x / CHUNK), pcz = Math.floor(G.player.z / CHUNK);
    const jobs = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) jobs.push([pcx + dx, pcz + dz]);
    jobs.sort((a, b) => (Math.abs(a[0] - pcx) + Math.abs(a[1] - pcz)) - (Math.abs(b[0] - pcx) + Math.abs(b[1] - pcz)));
    for (let i = 0; i < jobs.length; i++) {
      G.world.getChunk(jobs[i][0], jobs[i][1]);
      $('loadbar-fill').style.width = ((i + 1) / jobs.length * 100) + '%';
      // 隱藏分頁時 setTimeout 會被節流到 1s+，改為同步跑完
      if (i % 3 === 2 && !document.hidden) await new Promise(r => setTimeout(r, 0));
    }
    // 出生點貼齊實際地表；柱子被洞穴挖穿（實際頂遠低於地形高度）就換鄰柱
    if (G.freshSpawn) {
      const p = G.player;
      let bx = Math.floor(p.x), bz = Math.floor(p.z), by = G.world.topAt(bx, bz);
      outer:
      for (let r = 0; r <= 12; r += 2) {
        for (let dx = -r; dx <= r; dx += 2) for (let dz = -r; dz <= r; dz += 2) {
          const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
          const top = G.world.topAt(x, z);
          const h = WG.terrainHeight(G.seed, x, z);
          if (top > SEA && top >= h - 2) { bx = x; bz = z; by = top; break outer; }
        }
      }
      p.x = bx + 0.5; p.z = bz + 0.5; p.y = by + 1.05;
      G.spawn = { x: p.x, y: p.y, z: p.z };
    }
    $('loading').style.display = 'none';
    G.state = 'playing';
    refreshHotbar();
    showHint(MWInput.isTouch ? '左搖桿移動，右邊滑動看四周！' : '點擊畫面鎖定滑鼠．WASD 移動．E 物品欄');
    MWAudio.startMusic();
    if (!MWInput.isTouch) MWInput.requestLock();
  }

  let hintTimer = 0;
  function showHint(msg, dur) {
    $('hint').textContent = msg;
    $('hint').classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => $('hint').classList.remove('show'), dur || 5000);
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'pause';
    MWInput.releaseLock();
    $('pause').style.display = 'flex';
    doSave(true);
  }
  function resumeGame() {
    $('pause').style.display = 'none';
    G.state = 'playing';
    MWInput.requestLock();
  }

  // ---------- 事件接線 ----------
  $('btn-new').addEventListener('click', () => {
    $('title').style.display = 'none';
    $('newworld').style.display = 'flex';
  });
  $('btn-new-back').addEventListener('click', () => {
    $('newworld').style.display = 'none';
    $('title').style.display = 'flex';
  });
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      MWAudio.ensure();
      const txt = $('seed-input').value.trim();
      let seed = parseInt(txt, 10);
      if (!Number.isFinite(seed)) seed = (Math.random() * 2147483647) | 0;
      newGame(btn.dataset.mode, seed);
      startWorld();
    });
  });
  $('btn-continue').addEventListener('click', () => {
    MWAudio.ensure();
    const o = MWSave.loadFrom(localStorage);
    if (!o) return;
    loadGame(o);
    startWorld();
  });
  $('btn-help').addEventListener('click', () => {
    $('title').style.display = 'none';
    $('help').style.display = 'flex';
  });
  $('btn-help-back').addEventListener('click', () => {
    $('help').style.display = 'none';
    $('title').style.display = 'flex';
  });
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-save').addEventListener('click', () => doSave(false));
  $('btn-quit').addEventListener('click', () => { doSave(true); showTitle(); });
  $('btn-respawn').addEventListener('click', respawn);
  $('btn-music').addEventListener('click', () => {
    MWAudio.setMusic(!MWAudio.isMusicOn());
    $('btn-music').textContent = '音樂：' + (MWAudio.isMusicOn() ? '開' : '關');
    saveSettings({ music: MWAudio.isMusicOn() });
  });
  if (loadSettings().music === false) {
    MWAudio.setMusic(false);
    $('btn-music').textContent = '音樂：關';
  }

  canvas.addEventListener('click', () => {
    if (G.state === 'playing' && !MWInput.state.locked) MWInput.requestLock();
  });
  MWInput.onLockChange((locked) => {
    if (!locked && G.state === 'playing' && !MWInput.isTouch) pauseGame();
  });

  let lastSpace = 0;
  MWInput.onKey((code, down) => {
    if (!down) return;
    if (code === 'Escape') {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'pause') resumeGame();
      else if (G.state === 'inv') closeInv();
      return;
    }
    if (G.state === 'playing') {
      if (code === 'KeyE' || code === 'Tab') openInv();
      if (code === 'KeyF' && G.mode === 'creative') {
        G.player.fly = !G.player.fly;
        showHint(G.player.fly ? '飛行：開（空白鍵上升、Shift 下降）' : '飛行：關', 2000);
      }
      if (code === 'Space' && G.mode === 'creative') {
        const now = performance.now();
        if (now - lastSpace < 280) G.player.fly = !G.player.fly;
        lastSpace = now;
      }
      if (code.startsWith('Digit')) {
        const n = +code.slice(5);
        if (n >= 1 && n <= 9) { G.inv.sel = n - 1; refreshHotbar(); }
      }
    } else if (G.state === 'inv' && (code === 'KeyE' || code === 'Tab')) {
      closeInv();
    } else if (G.state === 'death' && code === 'Enter') {
      respawn();
    }
  });

  window.addEventListener('beforeunload', () => { if (G.world && G.state !== 'title') doSave(true); });

  // ---------- 迴圈：固定時步 + 隱藏分頁備援 ----------
  const TICK_MS = 1000 / 60;
  let acc = 0, last = performance.now(), hiddenTimer = 0;
  function step(now) {
    acc += Math.min(now - last, 250);
    last = now;
    let n = 0;
    while (acc >= TICK_MS && n < 8) { tick(1 / 60); acc -= TICK_MS; n++; }
    if (n === 8) acc = 0;
  }
  function frame(now) {
    step(now);
    renderFrame();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenTimer = setInterval(() => step(performance.now()), 50);
    } else {
      clearInterval(hiddenTimer);
      last = performance.now();
    }
  });

  // 測試掛鉤（隱藏分頁時 rAF 停擺，自動驗證用這些同步驅動）
  window.__mw = { G, tick, doSave, newGame, loadGame, renderer, step, chunkWork, renderFrame, skyState };

  // 啟動
  showTitle();
  requestAnimationFrame(frame);
})();
