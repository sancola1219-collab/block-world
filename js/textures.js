// 程序材質圖集 — 瀏覽器層。256×256（16×16 個 16px tile），全部用 Canvas 畫。
// tile 編號與 blocks.js 對應；40..47 = 挖掘裂痕八階；48+ = 生物皮膚。
'use strict';

(function () {
  const T = 16; // tile 尺寸

  function makeAtlas() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const rand = MWNoise.mulberry32(20260710);

    function tilePos(t) { return [(t % 16) * T, Math.floor(t / 16) * T]; }

    // 基底＋每像素抖動
    function noiseTile(t, r, g, b, jitter, alpha) {
      const [ox, oy] = tilePos(t);
      const img = ctx.createImageData(T, T);
      for (let i = 0; i < T * T; i++) {
        const j = (rand() - 0.5) * 2 * jitter;
        img.data[i * 4] = Math.max(0, Math.min(255, r + j));
        img.data[i * 4 + 1] = Math.max(0, Math.min(255, g + j));
        img.data[i * 4 + 2] = Math.max(0, Math.min(255, b + j));
        img.data[i * 4 + 3] = alpha === undefined ? 255 : alpha;
      }
      ctx.putImageData(img, ox, oy);
    }
    function px(t, x, y, style) {
      const [ox, oy] = tilePos(t);
      ctx.fillStyle = style;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    function rect(t, x, y, w, h, style) {
      const [ox, oy] = tilePos(t);
      ctx.fillStyle = style;
      ctx.fillRect(ox + x, oy + y, w, h);
    }
    function speckle(t, n, style) {
      for (let i = 0; i < n; i++) px(t, (rand() * T) | 0, (rand() * T) | 0, style);
    }
    function clearTile(t) {
      const [ox, oy] = tilePos(t);
      ctx.clearRect(ox, oy, T, T);
    }
    // 礦石：石底＋礦點簇
    function oreTile(t, color, hi) {
      noiseTile(t, 128, 128, 128, 22);
      for (let c = 0; c < 4; c++) {
        const cx = 2 + ((rand() * 11) | 0), cy = 2 + ((rand() * 11) | 0);
        rect(t, cx, cy, 2, 2, color);
        px(t, cx, cy, hi);
        if (rand() < 0.6) px(t, cx + ((rand() * 3) | 0) - 1, cy + ((rand() * 3) | 0) - 1, color);
      }
    }

    noiseTile(0, 106, 170, 70, 26);                      // 0 草地頂
    noiseTile(1, 134, 96, 67, 20);                       // 1 草地側（下泥上草）
    rect(1, 0, 0, 16, 3, '#6faa46');
    for (let x = 0; x < T; x++) if (rand() < 0.6) px(1, x, 3, '#6faa46');
    for (let x = 0; x < T; x++) if (rand() < 0.3) px(1, x, 4, '#5f9440');
    noiseTile(2, 134, 96, 67, 24);                       // 2 泥土
    noiseTile(3, 128, 128, 128, 18);                     // 3 石頭
    noiseTile(4, 110, 110, 112, 26);                     // 4 圓石：碎石塊
    for (let i = 0; i < 6; i++) {
      const cx = (rand() * 12) | 0, cy = (rand() * 12) | 0, s = 3 + ((rand() * 3) | 0);
      rect(4, cx, cy, s, s, `rgb(${96 + (rand() * 50 | 0)},${96 + (rand() * 50 | 0)},${100 + (rand() * 40 | 0)})`);
    }
    noiseTile(5, 122, 122, 124, 12);                     // 5 石磚
    ctx.strokeStyle = '#55555a';
    for (const [x, y, w, h] of [[0, 0, 16, 8], [0, 8, 8, 8], [8, 8, 8, 8]]) {
      const [ox, oy] = tilePos(5);
      ctx.strokeRect(ox + x + 0.5, oy + y + 0.5, w - 1, h - 1);
    }
    noiseTile(6, 60, 60, 64, 30);                        // 6 基岩
    noiseTile(7, 219, 207, 163, 16);                     // 7 沙
    noiseTile(8, 216, 203, 155, 10);                     // 8 砂岩
    rect(8, 0, 0, 16, 1, '#cabb8f'); rect(8, 0, 15, 16, 1, '#b8a97c');
    noiseTile(9, 104, 82, 50, 16);                       // 9 原木側：直紋
    for (let x = 1; x < T; x += 3) rect(9, x, 0, 1, 16, 'rgba(70,52,28,0.55)');
    noiseTile(10, 168, 136, 92, 12);                     // 10 原木頂：年輪
    { const [ox, oy] = tilePos(10);
      ctx.strokeStyle = '#8a6a40';
      for (let r = 2; r <= 7; r += 2) { ctx.beginPath(); ctx.arc(ox + 8, oy + 8, r, 0, 7); ctx.stroke(); } }
    noiseTile(11, 176, 143, 92, 10);                     // 11 木板
    for (let y = 3; y < T; y += 4) rect(11, 0, y, 16, 1, 'rgba(90,64,34,0.5)');
    // 12/13 樹葉（鏤空）
    noiseTile(12, 58, 122, 44, 24);
    noiseTile(13, 44, 92, 58, 22);
    for (const t of [12, 13]) {
      const [ox, oy] = tilePos(t);
      const img = ctx.getImageData(ox, oy, T, T);
      for (let i = 0; i < T * T; i++) if (rand() < 0.16) img.data[i * 4 + 3] = 0;
      ctx.putImageData(img, ox, oy);
    }
    clearTile(14);                                       // 14 玻璃
    rect(14, 0, 0, 16, 1, 'rgba(210,235,240,0.9)'); rect(14, 0, 15, 16, 1, 'rgba(210,235,240,0.9)');
    rect(14, 0, 0, 1, 16, 'rgba(210,235,240,0.9)'); rect(14, 15, 0, 1, 16, 'rgba(210,235,240,0.9)');
    rect(14, 3, 2, 1, 5, 'rgba(255,255,255,0.85)'); rect(14, 5, 4, 1, 4, 'rgba(255,255,255,0.6)');
    noiseTile(15, 146, 74, 62, 12);                      // 15 磚
    ctx.fillStyle = '#d8cfc4';
    { const [ox, oy] = tilePos(15);
      for (let y = 0; y < T; y += 4) ctx.fillRect(ox, oy + y + 3, 16, 1);
      for (let y = 0, k = 0; y < T; y += 4, k++) for (let x = (k % 2) * 4; x < T; x += 8) ctx.fillRect(ox + x, oy + y, 1, 4); }
    noiseTile(16, 235, 240, 245, 10);                    // 16 雪草地頂
    noiseTile(17, 134, 96, 67, 20);                      // 17 雪草地側
    rect(17, 0, 0, 16, 4, '#eef2f6');
    noiseTile(18, 58, 122, 60, 18);                      // 18 仙人掌側
    rect(18, 0, 0, 1, 16, '#2f6b33'); rect(18, 15, 0, 1, 16, '#2f6b33');
    for (let y = 1; y < T; y += 3) { px(18, 4, y, '#204d24'); px(18, 11, y + 1, '#204d24'); }
    noiseTile(19, 84, 150, 82, 12);                      // 19 仙人掌頂
    noiseTile(20, 52, 110, 200, 14, 200);                // 20 水（半透明）
    for (let i = 0; i < 5; i++) rect(20, (rand() * 12) | 0, (rand() * 15) | 0, 3 + (rand() * 3 | 0), 1, 'rgba(200,225,255,0.35)');
    oreTile(21, '#2c2c2c', '#4a4a4a');                   // 21 煤
    oreTile(22, '#c8a382', '#e8cdb0');                   // 22 鐵
    oreTile(23, '#e8c93e', '#fdf0a0');                   // 23 金
    oreTile(24, '#4de0e0', '#b8ffff');                   // 24 鑽石
    noiseTile(25, 245, 210, 120, 30);                    // 25 螢石
    speckle(25, 30, '#fff2c0');
    // 26/27 花、28 草叢（鏤空十字）
    clearTile(26);
    rect(26, 7, 8, 2, 8, '#3e7a34');
    rect(26, 5, 3, 6, 5, '#d43a3a'); rect(26, 6, 2, 4, 7, '#d43a3a'); rect(26, 7, 4, 2, 2, '#ffd24a');
    clearTile(27);
    rect(27, 7, 8, 2, 8, '#3e7a34');
    rect(27, 5, 3, 6, 5, '#f0c832'); rect(27, 6, 2, 4, 7, '#f0c832'); px(27, 7, 5, '#a8741a'); px(27, 8, 5, '#a8741a');
    clearTile(28);
    for (let i = 0; i < 9; i++) {
      const x = 1 + ((rand() * 14) | 0), h = 5 + ((rand() * 9) | 0);
      rect(28, x, 16 - h, 1, h, rand() < 0.5 ? '#5f9c3f' : '#4e8834');
    }
    noiseTile(29, 196, 60, 56, 14);                      // 29-31 羊毛
    noiseTile(30, 58, 90, 190, 14);
    noiseTile(31, 224, 190, 62, 14);
    for (const t of [29, 30, 31]) speckle(t, 20, 'rgba(255,255,255,0.25)');
    noiseTile(32, 238, 243, 248, 8);                     // 32 雪塊
    noiseTile(33, 136, 126, 120, 30);                    // 33 礫石
    for (let i = 0; i < 8; i++) {
      const cx = (rand() * 13) | 0, cy = (rand() * 13) | 0;
      rect(33, cx, cy, 2 + (rand() * 2 | 0), 2, `rgb(${100 + (rand() * 70 | 0)},${95 + (rand() * 60 | 0)},${90 + (rand() * 55 | 0)})`);
    }

    noiseTile(34, 244, 244, 244, 10);                    // 34 白羊毛
    speckle(34, 20, 'rgba(210,210,210,0.5)');
    noiseTile(35, 190, 48, 40, 14);                      // 35 TNT 側：紅底白帶
    rect(35, 0, 6, 16, 4, '#e8e0d0');
    ctx.fillStyle = '#1a1a1a';
    { const [ox, oy] = tilePos(35);
      ctx.fillRect(ox + 2, oy + 7, 2, 2); ctx.fillRect(ox + 7, oy + 7, 2, 2); ctx.fillRect(ox + 12, oy + 7, 2, 2); }
    noiseTile(36, 190, 48, 40, 14);                      // 36 TNT 頂：中心引信
    rect(36, 6, 6, 4, 4, '#e8e0d0'); rect(36, 7, 7, 2, 2, '#3a2a1a');
    noiseTile(37, 196, 60, 56, 10);                      // 37 床頂：紅毯＋白枕
    rect(37, 0, 0, 16, 5, '#eef0f4'); rect(37, 0, 5, 16, 1, '#a83030');
    clearTile(38);                                       // 38 火把（十字）
    rect(38, 7, 6, 2, 9, '#8a6a40'); rect(38, 7, 4, 2, 2, '#ffd24a'); rect(38, 7, 3, 2, 1, '#ff9030');

    // 40..47 裂痕八階（黑色細裂縫，其餘透明）
    for (let s = 0; s < 8; s++) {
      const t = 40 + s;
      clearTile(t);
      const cracks = 2 + s * 2;
      const r2 = MWNoise.mulberry32(900 + s);
      for (let c = 0; c < cracks; c++) {
        let x = 8 + ((r2() - 0.5) * 6) | 0, y = 8 + ((r2() - 0.5) * 6) | 0;
        const steps = 3 + s;
        for (let k = 0; k < steps; k++) {
          px(t, Math.max(0, Math.min(15, x)), Math.max(0, Math.min(15, y)), 'rgba(20,16,12,0.85)');
          x += r2() < 0.5 ? 1 : -1; y += r2() < 0.5 ? 1 : (r2() < 0.5 ? -1 : 0);
        }
      }
    }

    // 48+ 生物皮膚
    noiseTile(48, 238, 154, 162, 14);                    // 48 豬皮
    noiseTile(49, 238, 154, 162, 10);                    // 49 豬臉
    rect(49, 4, 6, 8, 5, '#f7b8bf'); rect(49, 5, 8, 2, 2, '#8e4448'); rect(49, 9, 8, 2, 2, '#8e4448');
    px(49, 4, 3, '#1a1a1a'); px(49, 11, 3, '#1a1a1a');
    noiseTile(50, 96, 150, 84, 16);                      // 50 殭屍皮
    noiseTile(51, 96, 150, 84, 10);                      // 51 殭屍臉
    rect(51, 3, 4, 3, 3, '#151515'); rect(51, 10, 4, 3, 3, '#151515'); rect(51, 5, 10, 6, 2, '#3a2020');
    noiseTile(52, 62, 118, 150, 16);                     // 52 殭屍衣
    noiseTile(53, 52, 62, 120, 14);                      // 53 殭屍褲
    noiseTile(54, 240, 238, 232, 12);                    // 54 羊毛皮
    speckle(54, 24, 'rgba(214,210,200,0.6)');
    noiseTile(55, 238, 226, 218, 8);                     // 55 羊臉
    rect(55, 4, 5, 8, 7, '#e8c8b8'); px(55, 5, 6, '#1a1a1a'); px(55, 10, 6, '#1a1a1a');
    rect(55, 6, 10, 4, 2, '#c89888');
    noiseTile(56, 108, 74, 50, 16);                      // 56 牛皮（棕＋白斑）
    for (let i = 0; i < 4; i++) rect(56, (rand() * 11) | 0, (rand() * 11) | 0, 3 + (rand() * 3 | 0), 3, '#e8e2d8');
    noiseTile(57, 108, 74, 50, 10);                      // 57 牛臉
    rect(57, 4, 9, 8, 5, '#d8c8b8'); px(57, 5, 11, '#604030'); px(57, 10, 11, '#604030');
    px(57, 4, 5, '#1a1a1a'); px(57, 11, 5, '#1a1a1a');
    rect(57, 2, 2, 2, 3, '#c8c0b0'); rect(57, 12, 2, 2, 3, '#c8c0b0'); // 角
    noiseTile(58, 88, 176, 72, 22);                      // 58 苦力怕皮
    for (let i = 0; i < 6; i++) px(58, (rand() * 16) | 0, (rand() * 16) | 0, '#4a9440');
    noiseTile(59, 88, 176, 72, 12);                      // 59 苦力怕臉（招牌哭臉）
    rect(59, 3, 4, 3, 3, '#101010'); rect(59, 10, 4, 3, 3, '#101010');
    rect(59, 6, 7, 4, 3, '#101010'); rect(59, 5, 9, 2, 4, '#101010'); rect(59, 9, 9, 2, 4, '#101010');

    // 60.. 物品圖示（透明底）
    clearTile(60); // 木棒
    for (let i = 0; i < 9; i++) rect(60, 4 + i, 12 - i, 2, 2, i % 2 ? '#8a6a40' : '#7a5a34');
    clearTile(61); // 煤炭
    rect(61, 4, 5, 8, 7, '#252525'); rect(61, 6, 3, 5, 3, '#1c1c1c'); px(61, 6, 6, '#4a4a4a'); px(61, 9, 8, '#3a3a3a');
    function ingot(t, c1, c2) {
      clearTile(t);
      rect(t, 3, 8, 10, 5, c1); rect(t, 5, 6, 10, 2, c1); rect(t, 4, 7, 10, 2, c2); px(t, 5, 9, c2);
    }
    ingot(62, '#d8d8dd', '#f4f4f8'); // 鐵錠
    ingot(63, '#e8c93e', '#fdf0a0'); // 金錠
    clearTile(64); // 鑽石
    rect(64, 5, 4, 6, 2, '#9df2f2'); rect(64, 4, 6, 8, 2, '#4de0e0'); rect(64, 5, 8, 6, 2, '#3cc8cc');
    rect(64, 6, 10, 4, 1, '#2ba8b0'); rect(64, 7, 11, 2, 1, '#2ba8b0');
    clearTile(65); // 豬排
    rect(65, 4, 4, 8, 9, '#e88890'); rect(65, 5, 5, 6, 7, '#d86870'); rect(65, 6, 11, 4, 3, '#f0e8dc');
    clearTile(66); // 牛排
    rect(66, 4, 4, 9, 9, '#a83828'); rect(66, 5, 5, 7, 7, '#8a2c20'); rect(66, 6, 7, 4, 2, '#c05848');
    clearTile(67); // 蘋果
    rect(67, 5, 6, 7, 7, '#d43a3a'); rect(67, 4, 7, 9, 4, '#d43a3a'); px(67, 6, 7, '#f08080');
    rect(67, 8, 3, 1, 3, '#6a4a2a'); px(67, 9, 4, '#4e8834');
    clearTile(68); // 火藥
    for (let i = 0; i < 22; i++) px(68, 3 + ((rand() * 10) | 0), 6 + ((rand() * 7) | 0), rand() < 0.5 ? '#5a5a5a' : '#787878');

    // 70..85 工具：柄＋各類頭；材質色 [木, 石, 鐵, 鑽]
    const TIER = ['#8a6a40', '#909090', '#e0e0e6', '#4de0e0'];
    const TIER2 = ['#6a4e2c', '#6e6e6e', '#b8b8c0', '#2ba8b0'];
    function handle(t) { for (let i = 0; i < 8; i++) rect(t, 4 + i, 12 - i, 2, 2, i % 2 ? '#8a6a40' : '#7a5a34'); }
    for (let k = 0; k < 4; k++) {
      const pk = 70 + k, ax = 74 + k, sh = 78 + k, sw = 82 + k;
      clearTile(pk); handle(pk); // 鎬：頂端橫弧
      rect(pk, 3, 3, 10, 2, TIER[k]); rect(pk, 2, 4, 2, 3, TIER2[k]); rect(pk, 12, 4, 2, 3, TIER2[k]);
      clearTile(ax); handle(ax); // 斧：側刃
      rect(ax, 8, 2, 5, 5, TIER[k]); rect(ax, 6, 3, 3, 4, TIER[k]); rect(ax, 8, 6, 3, 2, TIER2[k]);
      clearTile(sh); handle(sh); // 鏟：頂端鏟頭
      rect(sh, 10, 2, 4, 5, TIER[k]); rect(sh, 11, 1, 2, 1, TIER2[k]);
      clearTile(sw); // 劍：長刃＋短柄
      for (let i = 0; i < 9; i++) rect(sw, 5 + i, 11 - i, 2, 2, i < 2 ? '#6a4e2c' : TIER[k]);
      for (let i = 2; i < 9; i++) px(sw, 5 + i, 12 - i, TIER2[k]);
      rect(sw, 4, 10, 4, 1, '#555');
    }

    return cv;
  }

  // 雲朵透明貼圖（獨立 128×128）
  function makeClouds() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = MWNoise.fbm2(555, x * 0.18, y * 0.18, 3, 2, 0.5);
      if (n > 0.55) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.9, (n - 0.55) * 5) + ')';
        ctx.fillRect(x * 4, y * 4, 4, 4);
      }
    }
    return cv;
  }

  window.MWTextures = { makeAtlas, makeClouds, TILE: T };
})();
