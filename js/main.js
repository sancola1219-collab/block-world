// 主程式：狀態機、60Hz 固定時步、區塊串流、互動、HUD 與選單 — 瀏覽器層。
'use strict';

(function () {
  const { B, def, isSolid, isLiquid, isItem, dropOf, tileOf, digTime, attackDmg, CREATIVE_LIST, ITEM_LIST } = MWBlocks;
  const { LEVELS, buildStructure } = MWLevels;
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
    drops: [], mobs: [], fuses: [], lights: new Map(), projectiles: [],
    burst: [],               // 純視覺碎屑粒子（挖掘/爆炸）
    weather: null,           // MWWeather 狀態
    sleeping: 0,
    levelId: null, quest: null, hero: null, points: null,
    castCool: 0, shieldOut: false,
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

  function newGame(mode, seed, levelId) {
    G.mode = mode;
    G.levelId = mode === 'adventure' ? levelId : null;
    const lvl = G.levelId ? LEVELS[G.levelId] : null;
    G.seed = lvl ? lvl.seed : seed;
    G.hero = lvl ? lvl.hero : null;
    G.quest = lvl ? { step: 0, kills: 0, done: false, bossSpawned: false } : null;
    G.world = new MWWorld.World(G.seed);
    G.spawn = findSpawn(G.world);
    G.player = PH.createPlayer(G.spawn.x, G.spawn.y, G.spawn.z);
    G.inv = INV.createInventory();
    G.time = 0.30;
    G.drops = []; G.mobs = []; G.fuses = []; G.sleeping = 0;
    G.projectiles = []; G.shieldOut = false; G.points = null;
    G.burst = []; G.weather = MWWeather.createWeather(G.rand);
    G.meshed.clear();
    G.playedT = 0;
    G.freshSpawn = true;
    rebuildLights();
    if (mode === 'creative') {
      const starter = [B.GRASS, B.DIRT, B.STONE, B.PLANK, B.LOG, B.GLASS, B.BRICK, B.GLOWSTONE, B.WOOL_RED];
      starter.forEach((id, i) => { G.inv.slots[i] = { id, count: 1 }; });
      G.player.fly = true;
    }
  }

  // 把關卡建築蓋進世界；drops 為任務物品（不會消失）
  function stampLevel(placeDrops) {
    const lvl = LEVELS[G.levelId];
    if (!lvl) return;
    const ox = Math.floor(G.spawn.x), oz = Math.floor(G.spawn.z);
    const py = G.world.topAt(ox, oz);
    const st = buildStructure(G.levelId, ox, py, oz);
    for (const [x, y, z, id] of st.blocks) G.world.setBlock(x, y, z, id);
    G.points = st.points;
    G.origin = [ox, py, oz];
    if (placeDrops) {
      for (const [x, y, z, id] of st.drops) {
        const d = EN.makeDrop(x, y, z, id, G.rand);
        d.persistent = true; d.vx = 0; d.vy = 0; d.vz = 0;
        G.drops.push(d);
      }
    }
    // 出生點移到關卡指定位置
    if (st.points.playerSpawn) {
      const [sx, sy, sz] = st.points.playerSpawn;
      G.player.x = sx; G.player.y = sy; G.player.z = sz;
      G.spawn = { x: sx, y: sy, z: sz };
    }
    rebuildLights(); // 建築裡的螢石入光源表
  }

  function loadGame(o) {
    G.mode = ['survival', 'creative', 'adventure'].includes(o.mode) ? o.mode : 'creative';
    G.levelId = G.mode === 'adventure' ? o.level : null;
    const lvl = G.levelId ? LEVELS[G.levelId] : null;
    G.hero = lvl ? lvl.hero : null;
    G.quest = lvl ? (o.quest || { step: 0, kills: 0, done: false, bossSpawned: false }) : null;
    // 存檔不含 mobs：若讀檔時卡在魔王步驟，重置旗標讓魔王重新登場（否則永久卡關）
    if (G.quest && !G.quest.done && lvl) {
      const st = lvl.steps[G.quest.step];
      if (st && st.type === 'boss') { G.quest.bossSpawned = false; G.quest.bossKilled = false; }
    }
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
    G.drops = []; G.mobs = []; G.fuses = []; G.sleeping = 0;
    G.projectiles = []; G.shieldOut = false; G.points = null;
    G.burst = []; G.weather = o.weather || MWWeather.createWeather(G.rand);
    // 任務掉落物還原（魔杖/掃帚/核心等還沒撿的）
    if (Array.isArray(o.pdrops)) {
      for (const [x, y, z, id] of o.pdrops) {
        const d = EN.makeDrop(x, y, z, id, G.rand);
        d.persistent = true; d.vx = 0; d.vy = 0; d.vz = 0;
        G.drops.push(d);
      }
    }
    G.meshed.clear();
    G.playedT = 0;
    G.freshSpawn = false;
    G.origin = o.origin || null;
    if (lvl && G.origin) {
      G.points = buildStructure(G.levelId, G.origin[0], G.origin[1], G.origin[2]).points;
    }
    rebuildLights();
    MWInput.state.yaw = G.player.yaw;
    MWInput.state.pitch = G.player.pitch;
  }

  function doSave(silent) {
    if (!G.world) return false;
    const ok = MWSave.saveTo(localStorage, {
      seed: G.seed, mode: G.mode, time: G.time, weather: G.weather,
      level: G.levelId, quest: G.quest, origin: G.origin || null,
      pdrops: G.drops.filter(d => d.persistent && !d.dead).map(d => [d.x, d.y, d.z, d.blockId]),
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

  // ---------- 光源註冊（火把/螢石 → shader 點光源） ----------
  function lightKey(x, y, z) { return x + ',' + y + ',' + z; }
  function rebuildLights() {
    G.lights = new Map();
    if (!G.world) return;
    for (const [key, ed] of G.world.edits) {
      const [cx, cz] = key.split(',').map(Number);
      for (const [i, id] of ed) {
        if (def(id).light) { // 火把/螢石/南瓜燈…凡 def 有 light 旗標皆入表
          const y = i % WORLD_H, col = (i - y) / WORLD_H;
          const lx = col >> 4, lz = col & 15;
          const wx = cx * CHUNK + lx, wz = cz * CHUNK + lz;
          G.lights.set(lightKey(wx, y, wz), [wx + 0.5, y + 0.6, wz + 0.5]);
        }
      }
    }
  }
  function noteLightChange(x, y, z, newId, oldId) {
    if (oldId !== undefined && def(oldId).light) G.lights.delete(lightKey(x, y, z));
    if (def(newId).light) G.lights.set(lightKey(x, y, z), [x + 0.5, y + 0.6, z + 0.5]);
  }

  // ---------- TNT 與爆炸 ----------
  function igniteTNT(x, y, z, fuseT, silent) {
    G.world.setBlock(x, y, z, B.AIR);
    G.fuses.push({ x: x + 0.5, y, z: z + 0.5, t: fuseT });
    if (!silent) { SFX.hiss(); showHint('TNT 點燃了，快跑！', 1500); }
  }

  function explode(x, y, z, r, dmg) {
    SFX.explosion();
    spawnBurst(x, y, z, 33, 26, 9); // TNT 側貼圖碎屑，大範圍噴飛
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const wx = Math.floor(x) + dx, wy = Math.floor(y) + dy, wz = Math.floor(z) + dz;
      const id = G.world.getBlock(wx, wy, wz);
      if (id === B.AIR || id === B.BEDROCK || id === B.WATER) continue;
      if (id === B.TNT) { igniteTNT(wx, wy, wz, 0.3 + G.rand() * 0.5, true); continue; } // 連鎖
      if (G.mode !== 'creative' && G.rand() < 0.25) {
        const drop = dropOf(id);
        if (drop !== B.AIR) G.drops.push(EN.makeDrop(wx + 0.5, wy + 0.5, wz + 0.5, drop, G.rand));
      }
      noteLightChange(wx, wy, wz, B.AIR, id);
      G.world.setBlock(wx, wy, wz, B.AIR);
    }
    const p = G.player;
    const pd = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
    if (pd < r * 2.2) damagePlayer(Math.max(1, Math.round(dmg * (1 - pd / (r * 2.2)))), { x, z });
    for (const m of G.mobs) {
      const md = Math.hypot(m.x - x, m.y + 0.5 - y, m.z - z);
      if (md < r * 2.2) EN.hurtMob(m, Math.round(dmg * (1 - md / (r * 2.2))), m.x - x, m.z - z);
    }
  }

  // ---------- 施法與投擲 ----------
  function castItem(held, dir) {
    if (G.castCool > 0) return;
    const p = G.player;
    const d = def(held.id);
    if (d.cast === 'magic') {
      const dmg = (G.hero && G.hero.magicDmg) || 6;
      G.projectiles.push(EN.makeProjectile('magic', p.x, p.y + p.eye - 0.1, p.z, dir[0], dir[1], dir[2], dmg));
      G.castCool = 0.45;
      SFX.magic();
    } else if (d.cast === 'shield') {
      if (G.shieldOut) return;
      const dmg = (G.hero && G.hero.shieldDmg) || 7;
      G.projectiles.push(EN.makeProjectile('shield', p.x, p.y + p.eye - 0.2, p.z, dir[0], dir[1], dir[2], dmg));
      G.shieldOut = true;
      G.castCool = 0.3;
      SFX.throwWhoosh();
    } else if (d.cast === 'proj') {
      // 弓 / 手裡劍 / 烈焰弓：依 def.proj 參數發射
      G.projectiles.push(EN.makeProjectile(d.proj.type, p.x, p.y + p.eye - 0.1, p.z, dir[0], dir[1], dir[2], d.proj.dmg));
      G.castCool = d.proj.cool;
      if (d.proj.type === 'firearrow') SFX.magic(); else SFX.throwWhoosh();
    } else if (d.cast === 'blink') {
      // 煙霧彈：往視線方向瞬身最多 8 格（撞牆就停在前一格）
      let tx = p.x, ty = p.y, tz = p.z;
      for (let s = 0.5; s <= 8; s += 0.5) {
        const nx = p.x + dir[0] * s, ny = p.y + dir[1] * s + 0.9, nz = p.z + dir[2] * s;
        const yy = Math.max(1, Math.min(WORLD_H - 3, ny - 0.9));
        if (isSolid(G.world.getBlock(Math.floor(nx), Math.floor(yy), Math.floor(nz))) ||
            isSolid(G.world.getBlock(Math.floor(nx), Math.floor(yy + 1), Math.floor(nz)))) break;
        tx = nx; ty = yy; tz = nz;
      }
      p.x = tx; p.y = ty; p.z = tz;
      p.vx = 0; p.vy = 0; p.vz = 0; p.fallV = 0;
      G.castCool = 1.2;
      SFX.throwWhoosh();
    }
  }

  // ---------- 任務系統 ----------
  function questTick() {
    const lvl = LEVELS[G.levelId], q = G.quest;
    const st = lvl.steps[q.step];
    if (!st) { q.done = true; return; }
    let done = false;
    if (st.type === 'pickup' || st.type === 'collect') {
      done = INV.countOf(G.inv, st.item) >= st.count;
    } else if (st.type === 'kill') {
      done = q.kills >= st.count;
    } else if (st.type === 'reach') {
      if (G.points && G.points[st.point]) {
        const [tx, ty, tz] = G.points[st.point];
        done = Math.hypot(G.player.x - tx, G.player.z - tz) < st.r && G.player.y >= ty - 2;
      }
    } else if (st.type === 'boss') {
      if (!q.bossSpawned && G.points && G.points.boss) {
        const [bx, by, bz] = G.points.boss;
        G.mobs.push(EN.makeMob(st.mob, bx, by, bz));
        q.bossSpawned = true;
        SFX.zombie();
        showHint('⚔ ' + st.text, 5000);
      }
      done = q.bossKilled === true;
    }
    if (done) {
      q.step++;
      q.kills = 0;
      SFX.craft();
      if (q.step >= lvl.steps.length) {
        q.done = true;
        onVictory(lvl);
      } else {
        showHint('✅ 任務完成！下一個：' + lvl.steps[q.step].text, 7000);
      }
    }
  }

  function spawnLevelEnemies() {
    const st = LEVELS[G.levelId].steps[G.quest.step];
    const cfg = st && st.spawn;
    if (!cfg) return;
    if (G.mobs.filter(m => m.type === cfg.mob).length >= cfg.max) return;
    if (G.rand() >= 0.025) return;
    const a = G.rand() * Math.PI * 2, r = 9 + G.rand() * 8;
    const x = Math.floor(G.player.x + Math.cos(a) * r), z = Math.floor(G.player.z + Math.sin(a) * r);
    const top = G.world.topAt(x, z);
    if (top > SEA && top < WORLD_H - 4) G.mobs.push(EN.makeMob(cfg.mob, x + 0.5, top + 1.1, z + 0.5));
  }

  function onVictory(lvl) {
    G.state = 'victory';
    MWInput.releaseLock();
    $('victory-title').textContent = '🏆 ' + lvl.name + '　完成！';
    $('victory-text').textContent = lvl.outro;
    $('victory').style.display = 'flex';
    doSave(true);
    SFX.victory();
  }

  // ---------- 吃東西與睡覺 ----------
  function tryEat(held) {
    if (G.mode === 'creative') return;
    const p = G.player;
    if (p.hp >= p.maxHp) { showHint('肚子不餓（血量已滿）', 1500); return; }
    p.hp = Math.min(p.maxHp, p.hp + def(held.id).food);
    INV.consumeSlot(G.inv, G.inv.sel);
    SFX.eat();
    refreshHotbar();
  }

  function trySleep() {
    if (G.sleeping > 0) return;
    if (!skyState().isNight) { showHint('現在還不睏，晚上才能睡覺', 2000); return; }
    G.sleeping = 0.0001;
    SFX.sleep();
  }

  // ---------- 天色 ----------
  // 玩家頭頂是否見天（洞穴/室內不下雨）
  function playerExposed() {
    const p = G.player;
    if (!p) return false;
    return G.world.lightAt(Math.floor(p.x), Math.floor(p.y + p.eye + 1), Math.floor(p.z)) >= 14;
  }
  // 玩家所在是否為雪地群系（降水以雪呈現）
  function biomeSnowy() {
    const p = G.player;
    return WG.biomeAt(G.seed, Math.floor(p.x), Math.floor(p.z)) === 'snow';
  }
  // 生成碎屑粒子（挖掘/爆炸）；純視覺，用 Math.random 不擾動世界 RNG
  function spawnBurst(x, y, z, tile, n, spread) {
    const s = spread || 3;
    for (let i = 0; i < n; i++) {
      G.burst.push({
        x, y, z, tile,
        vx: (Math.random() - 0.5) * s, vy: Math.random() * s * 0.9 + 1, vz: (Math.random() - 0.5) * s,
        size: 0.10 + Math.random() * 0.08,
        life: 0.5 + Math.random() * 0.5,
      });
    }
  }

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

    // 天氣（純視覺，但狀態機在此推進；打閃時延遲播雷聲）
    if (G.weather) {
      const struck = MWWeather.stepWeather(G.weather, dt, G.rand);
      if (struck && playerExposed()) {
        const delay = 400 + G.rand() * 2200; // 光比聲快
        setTimeout(() => { if (G.state === 'playing') SFX.thunder(); }, delay);
      }
    }

    // 碎屑粒子（挖掘/爆炸的純視覺，重力落下、限時消失）
    if (G.burst.length) {
      for (const b of G.burst) {
        b.life -= dt;
        b.vy -= 22 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (isSolid(w.getBlock(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z)))) { b.vy = 0; b.vx *= 0.5; b.vz *= 0.5; }
      }
      G.burst = G.burst.filter(b => b.life > 0);
    }

    // 移動（冒險模式套用英雄能力倍率）
    p.yaw = inp.yaw; p.pitch = inp.pitch;
    const axes = MWInput.moveAxes();
    const wasInWater = p.inWater;
    PH.stepPlayer(p, w, {
      mf: axes.mf, ms: axes.ms, run: axes.run && !p.fly,
      jump: inp.keys.has('Space'),
      up: inp.keys.has('Space'),
      down: inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight'),
    }, dt, G.mode, G.hero ? { speedMul: G.hero.speedMul, jumpMul: G.hero.jumpMul } : undefined);
    if (!wasInWater && p.inWater && p.vy < -3) SFX.splash();

    // 摔傷、溺水、虛空
    if (G.mode !== 'creative') {
      const fallLimit = 12.5 * (G.hero ? G.hero.fallResist : 1);
      if (p.fallV < -fallLimit && !p.inWater) {
        damagePlayer(Math.round((-p.fallV - fallLimit) * 0.9), null);
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
    if (p.hp <= 0 && G.mode !== 'creative') { onDeath(); return; }
    if (G.mode === 'creative') p.hp = 20;

    // 準星目標
    const eye = [p.x, p.y + p.eye, p.z];
    const dir = PH.lookDir(p.yaw, p.pitch);
    const ray = PH.raycast(w, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 5.5);

    const held = G.inv.slots[G.inv.sel];

    // 攻擊生物（點擊瞬間優先於挖掘；劍傷害較高、英雄有加成）
    if (inp.transient.leftClick) {
      const mob = pickMob(eye, dir);
      if (mob) {
        EN.hurtMob(mob, attackDmg(held ? held.id : undefined) + (G.hero ? G.hero.dmgBonus : 0), mob.x - p.x, mob.z - p.z);
        SFX.attackHit();
        if (mob.type === 'pig') SFX.pig();
        if (mob.type === 'sheep') SFX.sheep();
        if (mob.type === 'cow') SFX.cow();
        inp.transient.leftClick = false;
      } else if (ray.hit && ray.id === B.TNT) {
        // 點一下 TNT ＝ 點燃
        igniteTNT(ray.x, ray.y, ray.z, 2);
        inp.transient.leftClick = false;
      }
    }

    // 挖掘（TNT 不能挖，只能點燃）
    if (inp.mouseDown[0] && ray.hit && ray.id !== B.TNT) {
      const time = digTime(ray.id, held ? held.id : undefined);
      if (time >= 0) {
        if (G.mode === 'creative') {
          if (G.digCool <= 0) {
            breakBlock(ray.x, ray.y, ray.z, ray.id, false);
            G.digCool = 0.22;
          }
        } else {
          const sameTarget = G.digTarget && G.digTarget.x === ray.x && G.digTarget.y === ray.y && G.digTarget.z === ray.z;
          if (!sameTarget) { G.digTarget = { x: ray.x, y: ray.y, z: ray.z }; G.digProgress = 0; }
          G.digProgress += dt / time;
          if ((G.playedT % 0.28) < dt) SFX.dig(soundKind(ray.id));
          if (G.digProgress >= 1) {
            breakBlock(ray.x, ray.y, ray.z, ray.id, true);
            G.digTarget = null; G.digProgress = 0;
          }
        }
      }
    } else { G.digTarget = null; G.digProgress = 0; }

    // 放置 / 睡覺 / 施法投擲 / 吃東西
    const wantPlace = inp.transient.rightClick || (inp.mouseDown[2] && G.placeCool <= 0);
    if (wantPlace) {
      if (ray.hit && ray.id === B.BED) trySleep();
      else if (held && def(held.id).cast) castItem(held, dir);
      else if (held && def(held.id).food) tryEat(held);
      else if (ray.hit && held && !isItem(held.id)) placeBlock(ray);
      G.placeCool = 0.25;
    }

    // 投射物（魔法彈、回力圓盾）
    if (G.castCool > 0) G.castCool -= dt;
    if (G.projectiles.length) {
      const pev = [];
      for (const pr of G.projectiles) EN.stepProjectile(pr, w, dt, p, G.mobs, pev);
      for (const e of pev) {
        if (e.type === 'projhit') {
          EN.hurtMob(e.mob, e.dmg, e.kx, e.kz);
          SFX.attackHit();
        } else if (e.type === 'projhitplayer') {
          damagePlayer(e.dmg, e);
        }
      }
      G.projectiles = G.projectiles.filter(pr => {
        if (pr.dead && pr.type === 'shield') G.shieldOut = false;
        return !pr.dead;
      });
    }

    // TNT 引信
    for (const f of G.fuses) f.t -= dt;
    const boom = G.fuses.filter(f => f.t <= 0);
    G.fuses = G.fuses.filter(f => f.t > 0);
    for (const f of boom) explode(f.x, f.y + 0.5, f.z, 2.6, 16);

    // 睡覺流程（黑幕 → 調到清晨）
    if (G.sleeping > 0) {
      G.sleeping += dt;
      if (G.sleeping >= 0.9 && G.sleeping < 0.9 + dt) {
        G.time = 0.02;
        p.hp = Math.min(p.maxHp, p.hp + 4);
        showHint('天亮了！');
      }
      if (G.sleeping > 1.8) G.sleeping = 0;
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
    const AMBIENT = { pig: SFX.pig, sheep: SFX.sheep, cow: SFX.cow, zombie: SFX.zombie };
    for (const m of G.mobs) {
      EN.stepMob(m, w, dt, p, G.rand, sky.isNight, events);
      const dist = Math.hypot(m.x - p.x, m.z - p.z);
      if (dist > 70) m.dead = true;
      if (dist < 14 && G.rand() < dt * 0.08 && AMBIENT[m.type]) AMBIENT[m.type]();
    }
    const MOB_DROPS = {
      pig: [B.PORKCHOP, 1, 2], sheep: [B.WOOL_WHITE, 1, 2],
      cow: [B.BEEF, 1, 2], creeper: [B.GUNPOWDER, 2, 2],
      minion: [B.APPLE, 0, 1], robot: [B.IRON_INGOT, 0, 1],
    };
    for (const e of events) {
      if (e.type === 'attack' && G.mode !== 'creative') damagePlayer(e.dmg, e);
      else if (e.type === 'explode') explode(e.x, e.y, e.z, e.r, e.dmg);
      else if (e.type === 'hiss') SFX.hiss();
      else if (e.type === 'poof') SFX.throwWhoosh(); // 暗影大師瞬移
      else if (e.type === 'dragonfire') {
        // 火龍朝玩家吐火球（敵方投射物）
        const fx = p.x - e.x, fy = (p.y + 0.9) - e.y, fz = p.z - e.z;
        const fl = Math.hypot(fx, fy, fz) || 1;
        G.projectiles.push(EN.makeProjectile('fireball', e.x, e.y, e.z, fx / fl, fy / fl, fz / fl, 6, true));
        SFX.roar();
      }
      else if (e.type === 'mobdie') {
        if (G.mode !== 'creative') {
          const d = MOB_DROPS[e.mob.type];
          if (d) {
            const n = d[1] + ((G.rand() * (d[2] - d[1] + 1)) | 0);
            for (let i = 0; i < n; i++) G.drops.push(EN.makeDrop(e.mob.x, e.mob.y + 0.5, e.mob.z, d[0], G.rand));
          }
        }
        // 任務擊殺計數
        if (G.quest && !G.quest.done) {
          const st = LEVELS[G.levelId].steps[G.quest.step];
          if (st && st.mob === e.mob.type) {
            if (st.type === 'kill') G.quest.kills++;
            if (st.type === 'boss') G.quest.bossKilled = true;
          }
        }
      }
    }
    G.mobs = G.mobs.filter(m => !m.dead);
    if (G.mode === 'adventure' && G.quest && !G.quest.done) {
      spawnLevelEnemies();
      questTick();
    } else {
      spawnMobs(sky);
    }

    MWInput.clearTransient();
    updateHud();
  }

  function damagePlayer(dmg, src) {
    const p = G.player;
    if (G.mode === 'creative' || p.hurtCool > 0 || dmg <= 0) return;
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
    noteLightChange(x, y, z, B.AIR, id);
    SFX.breakBlock(soundKind(id));
    spawnBurst(x + 0.5, y + 0.5, z + 0.5, tileOf(id, 'side'), 8, 3.2); // 挖掉冒碎屑
    if (withDrop) {
      const drop = dropOf(id);
      if (drop !== B.AIR) G.drops.push(EN.makeDrop(x + 0.5, y + 0.3, z + 0.5, drop, G.rand));
      // 打樹葉有機率掉蘋果
      if ((id === B.LEAF || id === B.SPRUCE_LEAF) && G.rand() < 0.08) {
        G.drops.push(EN.makeDrop(x + 0.5, y + 0.3, z + 0.5, B.APPLE, G.rand));
      }
    }
    // 頂上的花草/火把跟著掉
    const above = G.world.getBlock(x, y + 1, z);
    if (def(above).cross) {
      G.world.setBlock(x, y + 1, z, B.AIR);
      noteLightChange(x, y + 1, z, B.AIR, above);
      if (withDrop && dropOf(above) !== B.AIR) G.drops.push(EN.makeDrop(x + 0.5, y + 1.3, z + 0.5, dropOf(above), G.rand));
    }
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
    if (id === B.TORCH && !isSolid(G.world.getBlock(tx, ty - 1, tz))) {
      showHint('火把要放在方塊上面', 1500);
      return;
    }
    if (G.mode !== 'creative') INV.consumeSlot(G.inv, G.inv.sel);
    G.world.setBlock(tx, ty, tz, id);
    noteLightChange(tx, ty, tz, id, cur);
    SFX.place();
    refreshHotbar();
  }

  function spawnMobs(sky) {
    const p = G.player, w = G.world;
    const count = (t) => G.mobs.filter(m => m.type === t).length;
    const passive = count('pig') + count('sheep') + count('cow');

    if (!sky.isNight && passive < 8 && G.rand() < 0.010) {
      const a = G.rand() * Math.PI * 2, r = 16 + G.rand() * 18;
      const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
      const top = w.topAt(x, z);
      const ground = w.getBlock(x, top, z);
      if ((ground === B.GRASS || ground === B.SNOW_GRASS) && top > SEA) {
        const type = ['pig', 'sheep', 'cow'][(G.rand() * 3) | 0];
        G.mobs.push(EN.makeMob(type, x + 0.5, top + 1.1, z + 0.5));
      }
    }
    if (sky.isNight && G.rand() < 0.02) {
      const type = G.rand() < 0.3 ? 'creeper' : 'zombie';
      if ((type === 'creeper' && count('creeper') < 3) || (type === 'zombie' && count('zombie') < 6)) {
        const a = G.rand() * Math.PI * 2, r = 20 + G.rand() * 16;
        const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
        const top = w.topAt(x, z);
        if (top > SEA && top < WORLD_H - 4 && !isLiquid(w.getBlock(x, top + 1, z))) {
          G.mobs.push(EN.makeMob(type, x + 0.5, top + 1.1, z + 0.5));
        }
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

    // 天氣：陰暗、灰濛、閃電、雨中視野縮短
    const wthr = G.weather || { precip: 0, cloud: 0.25, gloom: 0, flash: 0, type: 'clear' };
    const gloom = wthr.gloom, flash = wthr.flash;
    const exposed = playerExposed();
    const precip = exposed ? wthr.precip : 0;
    const snowy = biomeSnowy();
    const darken = (c, k) => c.map(v => v * (1 - gloom * k));
    const lerpTo = (c, t, k) => c.map((v, i) => v + (t[i] - v) * k);
    let skyTop = lerpTo(darken(sky.top, 0.55), [0.28, 0.30, 0.34], gloom * 0.5);
    let skyHor = lerpTo(darken(sky.hor, 0.45), [0.34, 0.36, 0.40], gloom * 0.55);
    if (flash > 0) { // 閃電照亮天空
      const f = flash * 0.7;
      skyTop = skyTop.map(v => Math.min(1, v + f));
      skyHor = skyHor.map(v => Math.min(1, v + f));
    }
    const dayW = Math.min(1, sky.day * (1 - gloom * 0.5) + flash * 0.5);
    const fogFar = underwater ? 20 : (92 - precip * 32);
    const fogNear = underwater ? 4 : (62 - precip * 18);
    const fogColor = underwater ? [0.05, 0.18, 0.38] : skyHor.slice();
    $('overlay-flash').style.opacity = flash > 0 ? Math.min(0.6, flash * 0.55) : 0;

    // 火把/螢石點光源：取離玩家最近 16 盞
    const near = [];
    for (const v of G.lights.values()) {
      const d = (v[0] - p.x) * (v[0] - p.x) + (v[2] - p.z) * (v[2] - p.z);
      if (d < 3600) near.push([d, v]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const lc = Math.min(16, near.length);
    const lights = new Float32Array(48);
    for (let i = 0; i < lc; i++) {
      lights[i * 3] = near[i][1][0]; lights[i * 3 + 1] = near[i][1][1]; lights[i * 3 + 2] = near[i][1][2];
    }
    const torchAt = (x, y, z) => {
      let t = 0;
      for (let i = 0; i < lc; i++) {
        const d = Math.hypot(near[i][1][0] - x, near[i][1][1] - y, near[i][1][2] - z);
        t = Math.max(t, 1 - d / 7);
      }
      return t;
    };
    const sl = (x, y, z) => Math.min(1, G.world.lightAt(Math.floor(x), Math.floor(y), Math.floor(z)) / 15 + torchAt(x, y, z));

    // 掉落物＋引爆中的 TNT＋投射物
    const dropScene = G.drops.map(d => ({ x: d.x, y: d.y, z: d.z, spin: d.spin, tile: tileOf(d.blockId, 'side'), light: sl(d.x, d.y + 0.5, d.z) }));
    for (const f of G.fuses) {
      dropScene.push({ x: f.x, y: f.y, z: f.z, spin: 0, tile: 35, light: 1, flash: 0.35 + 0.35 * Math.sin(f.t * 22), scale: 0.98 });
    }
    const PROJ_VIEW = {
      magic: { tile: 89, scale: 0.3, flash: 0.3 },
      shield: { tile: 88, scale: 0.5 },
      arrow: { tile: 110, scale: 0.34 },
      shuriken: { tile: 106, scale: 0.36 },
      firearrow: { tile: 111, scale: 0.34, flash: 0.35 },
      fireball: { tile: 111, scale: 0.62, flash: 0.4 },
    };
    for (const pr of G.projectiles) {
      const v = PROJ_VIEW[pr.type];
      if (v.flash !== undefined) {
        dropScene.push({ x: pr.x, y: pr.y - v.scale / 2, z: pr.z, spin: 0, tile: v.tile, light: 1, flash: v.flash, scale: v.scale });
      } else {
        dropScene.push({ x: pr.x, y: pr.y - 0.3, z: pr.z, spin: pr.spin, tile: v.tile, light: 1, scale: v.scale });
      }
    }
    // 碎屑粒子（小方塊）
    for (const b of G.burst) {
      dropScene.push({ x: b.x, y: b.y, z: b.z, spin: 0, tile: b.tile, flash: 0, scale: b.size, light: sl(b.x, b.y, b.z) });
    }

    renderer.render({
      cam: { x: p.x, y: p.y + p.eye, z: p.z, yaw: p.yaw, pitch: p.pitch },
      fovY: (MWInput.state.keys.has('ShiftLeft') && !p.fly && p.onGround === false ? 1.28 : 1.22),
      day: dayW,
      skyTop, skyHorizon: skyHor,
      fogColor, fogNear, fogFar,
      starAlpha: sky.starAlpha * (1 - gloom),
      underwater,
      glow: 0.85,
      cloudOffset: G.playedT * 1.2,
      weather: { precip, snow: snowy, cloud: wthr.cloud, time: G.playedT, flash },
      billboards: [
        { dir: norm3(sky.sunDir), size: 34, color: [1, 0.97, 0.85, 1] },
        { dir: norm3([-sky.sunDir[0], -sky.sunDir[1], -sky.sunDir[2]]), size: 22, color: [0.92, 0.94, 1, 0.9] },
      ],
      sel: (G.state === 'playing' || G.state === 'inv') && currentSel() || null,
      crack: G.digTarget ? { ...G.digTarget, stage: Math.floor(G.digProgress * 8) } : null,
      lights, lightCount: lc,
      drops: dropScene,
      mobs: G.mobs.map(m => ({
        type: m.type, x: m.x, y: m.y, z: m.z, yaw: m.yaw, anim: m.anim,
        hurtT: m.hurtT, burning: m.burning, deathT: m.deathT, fuse: m.fuse,
        scale: EN.MOB_DEFS[m.type].scale || 1,
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
    if (G.mode !== 'creative') {
      const full = Math.max(0, Math.ceil(p.hp / 2));
      $('hearts').innerHTML = '<span style="color:#e04040">' + '❤'.repeat(full) + '</span><span style="color:#444">' + '❤'.repeat(10 - full) + '</span>';
      $('bubbles').textContent = p.headInWater ? '💧'.repeat(Math.ceil(p.air)) : '';
    } else {
      $('hearts').textContent = ''; $('bubbles').textContent = '';
    }
    // 任務橫幅
    if (G.quest && !G.quest.done) {
      const lvl = LEVELS[G.levelId];
      const st = lvl.steps[G.quest.step];
      if (st) {
        let prog = '';
        if (st.type === 'kill') prog = `（${G.quest.kills}/${st.count}）`;
        else if (st.type === 'pickup' || st.type === 'collect') prog = `（${Math.min(INV.countOf(G.inv, st.item), st.count)}/${st.count}）`;
        $('quest').textContent = `📜 ${st.text}${prog}`;
        $('quest').style.display = 'block';
      }
    } else {
      $('quest').style.display = 'none';
    }
    const biome = WG.biomeAt(G.seed, Math.floor(p.x), Math.floor(p.z));
    const bname = { plains: '草原', forest: '森林', desert: '沙漠', snow: '雪原' }[biome] || biome;
    $('coords').textContent = `x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}  z ${p.z.toFixed(0)}　${bname}${p.fly ? '　✈ 飛行' : ''}`;
    const hour = (G.time * 24 + 6) % 24;
    const sky = skyState();
    const wlabel = G.weather && G.weather.type !== 'clear' ? '　' + MWWeather.weatherLabel(G.weather) : '';
    $('daynight').textContent = `${sky.isNight ? '🌙' : '☀️'} ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}${wlabel}`;
    G.hurtFlash > 0 ? $('overlay-hurt').style.opacity = 1 : $('overlay-hurt').style.opacity = 0;
    $('overlay-water').style.opacity = p.headInWater ? 1 : 0;
    $('overlay-sleep').style.opacity = (G.sleeping > 0 && G.sleeping < 1.2) ? 1 : 0;
  }

  // 2D 方塊圖示（假等角投影）
  function drawIcon(ctx, id, dx, dy, s) {
    const d = def(id);
    const src = (t) => [(t % 16) * 16, Math.floor(t / 16) * 16];
    if (d.cross || d.liquid || d.item) {
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
      // 方塊＋全部物品（工具/食物/裝備），創造模式直接拿
      for (const id of [...CREATIVE_LIST, ...ITEM_LIST]) {
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
    const modeName = save && (save.mode === 'adventure'
      ? (LEVELS[save.level] ? LEVELS[save.level].name : '冒險')
      : (save.mode === 'survival' ? '生存模式' : '創造模式'));
    $('title-tip').textContent = save ? `已有存檔：${modeName}（種子 ${save.seed}）` : '還沒有存檔，開一個新世界吧！';
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
    // 冒險關卡：蓋出關卡建築與任務物品
    if (G.freshSpawn && G.mode === 'adventure') stampLevel(true);
    $('loading').style.display = 'none';
    G.state = 'playing';
    refreshHotbar();
    if (G.mode === 'adventure' && G.quest && !G.quest.done) {
      showHint('🧙 ' + LEVELS[G.levelId].intro, 10000);
    } else {
      showHint(MWInput.isTouch ? '左搖桿移動，右邊滑動看四周！' : '點擊畫面鎖定滑鼠．WASD 移動．E 物品欄');
    }
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
  document.querySelectorAll('.btn-level').forEach(btn => {
    btn.addEventListener('click', () => {
      MWAudio.ensure();
      newGame('adventure', 0, btn.dataset.level);
      startWorld();
    });
  });
  $('btn-victory-continue').addEventListener('click', () => {
    $('victory').style.display = 'none';
    G.state = 'playing';
    MWInput.requestLock();
    showHint('世界任你探索！蓋東西、挖礦、看看遠方吧', 5000);
  });
  $('btn-victory-title').addEventListener('click', () => {
    doSave(true);
    $('victory').style.display = 'none';
    showTitle();
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
      const canFly = G.mode === 'creative' ||
        (G.mode === 'adventure' && INV.countOf(G.inv, B.BROOM) > 0);
      if (code === 'KeyF') {
        if (canFly) {
          G.player.fly = !G.player.fly;
          showHint(G.player.fly ? (G.mode === 'adventure' ? '🧹 掃帚飛行：開（空白鍵上升、Shift 下降）' : '飛行：開（空白鍵上升、Shift 下降）') : '飛行：關', 2000);
        } else if (G.mode === 'adventure') {
          showHint('要先拿到飛天掃帚才能飛！', 2000);
        }
      }
      if (code === 'Space' && canFly) {
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
