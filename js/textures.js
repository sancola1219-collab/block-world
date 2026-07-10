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

    noiseTile(94, 160, 205, 235, 10);                    // 94 冰塊
    rect(94, 2, 3, 5, 1, '#cfeaf7'); rect(94, 9, 9, 4, 1, '#cfeaf7'); px(94, 5, 11, '#9cc8e0');
    noiseTile(95, 24, 18, 34, 8);                        // 95 黑曜石
    for (let i = 0; i < 5; i++) px(95, (rand() * 16) | 0, (rand() * 16) | 0, '#5a4a7a');
    noiseTile(96, 214, 214, 220, 8);                     // 96 鐵塊
    rect(96, 1, 1, 14, 1, '#f2f2f6'); rect(96, 1, 14, 14, 1, '#a8a8b0');
    noiseTile(97, 232, 200, 60, 10);                     // 97 金塊
    rect(97, 1, 1, 14, 1, '#f8e8a0'); rect(97, 1, 14, 14, 1, '#b08820');
    noiseTile(98, 90, 220, 220, 10);                     // 98 鑽石塊
    rect(98, 1, 1, 14, 1, '#c8f6f6'); rect(98, 1, 14, 14, 1, '#3aa8ac');
    noiseTile(99, 150, 110, 64, 8);                      // 99 書櫃側：三排彩色書
    for (let row = 0; row < 3; row++) {
      for (let x = 1; x < 15; x += 2) {
        const cols = ['#a03030', '#3050a0', '#3a7a30', '#a08030', '#6a3a8a'];
        rect(99, x, 1 + row * 5, 2, 4, cols[((x + row * 3) / 2 | 0) % 5]);
      }
    }
    noiseTile(100, 214, 120, 40, 14);                    // 100 南瓜側：直條紋
    for (let x = 2; x < 16; x += 4) rect(100, x, 0, 1, 16, '#b86a1e');
    noiseTile(101, 190, 105, 34, 10);                    // 101 南瓜頂：藤蒂
    rect(101, 7, 6, 2, 3, '#4e6a28');
    noiseTile(102, 214, 120, 40, 14);                    // 102 南瓜燈臉（發光）
    for (let x = 2; x < 16; x += 4) rect(102, x, 0, 1, 16, '#b86a1e');
    rect(102, 3, 4, 3, 3, '#ffe680'); rect(102, 10, 4, 3, 3, '#ffe680');
    rect(102, 5, 10, 6, 2, '#ffe680'); rect(102, 4, 9, 2, 1, '#ffe680'); rect(102, 10, 9, 2, 1, '#ffe680');

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

    // 86..88 英雄裝備
    clearTile(86); // 魔杖：深色杖身＋星光杖尖
    for (let i = 0; i < 9; i++) rect(86, 4 + i, 12 - i, 2, 2, i % 2 ? '#3a2a4a' : '#2c2038');
    rect(86, 12, 2, 2, 2, '#ffe680'); px(86, 11, 2, '#fff6c0'); px(86, 13, 4, '#fff6c0'); px(86, 12, 1, '#fff6c0');
    clearTile(87); // 飛天掃帚：長柄＋稻草頭
    for (let i = 0; i < 9; i++) rect(87, 3 + i, 11 - i, 2, 2, i % 2 ? '#8a6a40' : '#7a5a34');
    for (let i = 0; i < 5; i++) rect(87, 1 + i, 15 - i, 2, 1, '#d8b060');
    rect(87, 1, 12, 4, 3, '#c89840'); px(87, 2, 15, '#a87828');
    clearTile(88); // 圓盾：同心圓環
    { const [ox, oy] = tilePos(88);
      ctx.fillStyle = '#c03030'; ctx.beginPath(); ctx.arc(ox + 8, oy + 8, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.arc(ox + 8, oy + 8, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#c03030'; ctx.beginPath(); ctx.arc(ox + 8, oy + 8, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#3050b0'; ctx.beginPath(); ctx.arc(ox + 8, oy + 8, 1.8, 0, 7); ctx.fill(); }
    clearTile(89); // 魔法彈：發光紫青光球
    rect(89, 6, 6, 4, 4, '#c0f0ff'); rect(89, 5, 5, 6, 6, 'rgba(140,120,255,0.55)');
    px(89, 4, 8, 'rgba(140,120,255,0.4)'); px(89, 11, 7, 'rgba(140,120,255,0.4)');
    px(89, 8, 3, 'rgba(140,120,255,0.4)'); px(89, 7, 12, 'rgba(140,120,255,0.4)');
    noiseTile(90, 150, 155, 165, 14);                    // 90 機器人裝甲
    for (let y = 3; y < 16; y += 4) for (let x = 1; x < 16; x += 5) px(90, x, y, '#6a7078'); // 鉚釘
    noiseTile(91, 150, 155, 165, 8);                     // 91 機器人臉：紅色眼縫
    rect(91, 3, 5, 10, 2, '#e03030'); rect(91, 5, 10, 6, 1, '#4a4f58');
    noiseTile(92, 58, 42, 84, 16);                       // 92 黑巫師袍（暗紫）
    for (let i = 0; i < 6; i++) px(92, (rand() * 16) | 0, (rand() * 16) | 0, '#7a5aa8');
    noiseTile(93, 58, 42, 84, 8);                        // 93 黑巫師臉：白眼發光
    rect(93, 4, 5, 3, 2, '#f0f0ff'); rect(93, 9, 5, 3, 2, '#f0f0ff'); rect(93, 6, 10, 4, 1, '#2a1a3a');

    // 103.. 新武器與消耗品圖示
    clearTile(103); // 弓：弧＋弦
    { const [ox, oy] = tilePos(103);
      ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(ox + 5, oy + 8, 6, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#e8e8ee'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(ox + 7, oy + 2.5); ctx.lineTo(ox + 7, oy + 13.5); ctx.stroke(); }
    clearTile(104); // 金蘋果
    rect(104, 5, 6, 7, 7, '#f2c832'); rect(104, 4, 7, 9, 4, '#f2c832'); px(104, 6, 7, '#fdf0a0');
    rect(104, 8, 3, 1, 3, '#6a4a2a'); px(104, 9, 4, '#4e8834');
    clearTile(105); // 治療藥水：圓瓶紅液
    rect(105, 6, 3, 4, 2, '#c8c8d0'); rect(105, 5, 5, 6, 8, '#d43a4a');
    rect(105, 4, 7, 8, 5, '#d43a4a'); px(105, 6, 7, '#f08090'); rect(105, 7, 2, 2, 1, '#8a8a94');
    clearTile(106); // 手裡劍：四角星
    rect(106, 7, 2, 2, 12, '#c8ccd4'); rect(106, 2, 7, 12, 2, '#c8ccd4');
    rect(106, 6, 6, 4, 4, '#5a5f68'); px(106, 7, 7, '#2a2d33'); px(106, 8, 8, '#2a2d33');
    clearTile(107); // 煙霧彈：黑球＋引線
    rect(107, 5, 7, 7, 7, '#2a2d33'); rect(107, 4, 8, 9, 5, '#2a2d33'); px(107, 7, 9, '#4a4f58');
    rect(107, 8, 4, 1, 3, '#8a6a40'); px(107, 9, 3, '#ff9030');
    clearTile(108); // 勇者聖劍：金柄藍刃
    for (let i = 0; i < 10; i++) rect(108, 4 + i, 12 - i, 2, 2, i < 2 ? '#c8a030' : '#9adcf0');
    for (let i = 2; i < 10; i++) px(108, 4 + i, 13 - i, '#4aa8cc');
    rect(108, 3, 11, 5, 1, '#e8c93e'); px(108, 5, 13, '#a06a20');
    clearTile(109); // 烈焰弓：火色
    { const [ox, oy] = tilePos(109);
      ctx.strokeStyle = '#c04020'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(ox + 5, oy + 8, 6, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(ox + 7, oy + 2.5); ctx.lineTo(ox + 7, oy + 13.5); ctx.stroke(); }
    px(109, 11, 4, '#ff9030'); px(109, 12, 8, '#ff9030'); px(109, 11, 12, '#ff9030');
    clearTile(110); // 箭（投射物）
    for (let i = 0; i < 10; i++) px(110, 3 + i, 12 - i, '#c8ccd4');
    px(110, 12, 2, '#e8e8ee'); px(110, 13, 3, '#e8e8ee'); px(110, 3, 13, '#d8b060'); px(110, 4, 12, '#d8b060');
    clearTile(111); // 火焰箭/火球
    rect(111, 5, 5, 6, 6, '#ff9030'); rect(111, 6, 6, 4, 4, '#ffd24a'); px(111, 7, 7, '#fff6c0');
    px(111, 4, 8, 'rgba(255,144,48,0.5)'); px(111, 11, 7, 'rgba(255,144,48,0.5)');

    // 112.. 新敵人皮膚
    noiseTile(112, 40, 40, 52, 10);                      // 112 影武士（近黑）
    for (let i = 0; i < 4; i++) px(112, (rand() * 16) | 0, (rand() * 16) | 0, '#6a6a80');
    noiseTile(113, 40, 40, 52, 6);                       // 113 影武士臉：紅眼縫
    rect(113, 3, 6, 4, 1, '#e03030'); rect(113, 9, 6, 4, 1, '#e03030');
    noiseTile(114, 70, 130, 60, 16);                     // 114 蜥蜴戰士（綠鱗）
    for (let y = 1; y < 16; y += 3) for (let x = ((y / 3) | 0) % 2; x < 16; x += 3) px(114, x, y, '#4a9440');
    noiseTile(115, 70, 130, 60, 10);                     // 115 蜥蜴臉：黃眼＋吻
    rect(115, 3, 4, 3, 2, '#f2c832'); rect(115, 10, 4, 3, 2, '#f2c832');
    px(115, 4, 5, '#1a1a1a'); px(115, 11, 5, '#1a1a1a');
    rect(115, 5, 9, 6, 4, '#3a7a30'); rect(115, 6, 11, 4, 1, '#2a5a20');
    noiseTile(116, 150, 40, 40, 18);                     // 116 火龍鱗（暗紅）
    for (let y = 0; y < 16; y += 3) for (let x = (y / 3 | 0) % 2; x < 16; x += 3) px(116, x, y, '#8a2020');
    noiseTile(117, 150, 40, 40, 10);                     // 117 火龍臉：金眼＋鼻孔
    rect(117, 2, 4, 4, 3, '#f2c832'); rect(117, 10, 4, 4, 3, '#f2c832');
    rect(117, 3, 5, 2, 1, '#1a1a1a'); rect(117, 11, 5, 2, 1, '#1a1a1a');
    px(117, 5, 12, '#3a1010'); px(117, 10, 12, '#3a1010'); rect(117, 6, 14, 4, 1, '#ffd24a');

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
