// 方塊定義表 — 純邏輯，node 可測。
// tile: 圖集格編號（16x16 圖集，由 textures.js 依同一編號繪製）。
// 每方塊 tiles = {top, bottom, side} 或單一數字（六面同圖）。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, STONEBRICK: 5,
  BEDROCK: 6, SAND: 7, SANDSTONE: 8, LOG: 9, PLANK: 10,
  LEAF: 11, SPRUCE_LEAF: 12, GLASS: 13, BRICK: 14, SNOW_GRASS: 15,
  CACTUS: 16, WATER: 17, COAL_ORE: 18, IRON_ORE: 19, GOLD_ORE: 20,
  DIAMOND_ORE: 21, GLOWSTONE: 22, FLOWER_RED: 23, FLOWER_YELLOW: 24,
  TALL_GRASS: 25, WOOL_RED: 26, WOOL_BLUE: 27, WOOL_YELLOW: 28,
  SNOW_BLOCK: 29, GRAVEL: 30,
};

// hardness：生存模式徒手挖掘秒數；<0 不可破壞。
// drop：挖掉後掉什麼（預設掉自己）。cross：十字面片。cutout：帶鏤空 alpha。
const DEFS = {
  [B.AIR]:          { name: '空氣', solid: false, hardness: 0 },
  [B.GRASS]:        { name: '草地', solid: true, hardness: 0.7, tiles: { top: 0, bottom: 2, side: 1 }, drop: B.DIRT },
  [B.DIRT]:         { name: '泥土', solid: true, hardness: 0.6, tiles: 2 },
  [B.STONE]:        { name: '石頭', solid: true, hardness: 2.2, tiles: 3, drop: B.COBBLE },
  [B.COBBLE]:       { name: '圓石', solid: true, hardness: 2.4, tiles: 4 },
  [B.STONEBRICK]:   { name: '石磚', solid: true, hardness: 2.2, tiles: 5 },
  [B.BEDROCK]:      { name: '基岩', solid: true, hardness: -1, tiles: 6 },
  [B.SAND]:         { name: '沙子', solid: true, hardness: 0.6, tiles: 7 },
  [B.SANDSTONE]:    { name: '砂岩', solid: true, hardness: 1.8, tiles: 8 },
  [B.LOG]:          { name: '原木', solid: true, hardness: 1.6, tiles: { top: 10, bottom: 10, side: 9 } },
  [B.PLANK]:        { name: '木板', solid: true, hardness: 1.4, tiles: 11 },
  [B.LEAF]:         { name: '樹葉', solid: true, hardness: 0.3, tiles: 12, cutout: true },
  [B.SPRUCE_LEAF]:  { name: '杉樹葉', solid: true, hardness: 0.3, tiles: 13, cutout: true },
  [B.GLASS]:        { name: '玻璃', solid: true, hardness: 0.4, tiles: 14, cutout: true, drop: B.AIR },
  [B.BRICK]:        { name: '磚塊', solid: true, hardness: 2.2, tiles: 15 },
  [B.SNOW_GRASS]:   { name: '雪草地', solid: true, hardness: 0.7, tiles: { top: 16, bottom: 2, side: 17 }, drop: B.DIRT },
  [B.CACTUS]:       { name: '仙人掌', solid: true, hardness: 0.5, tiles: { top: 19, bottom: 19, side: 18 } },
  [B.WATER]:        { name: '水', solid: false, liquid: true, hardness: -1, tiles: 20 },
  [B.COAL_ORE]:     { name: '煤礦', solid: true, hardness: 3.0, tiles: 21 },
  [B.IRON_ORE]:     { name: '鐵礦', solid: true, hardness: 3.4, tiles: 22 },
  [B.GOLD_ORE]:     { name: '金礦', solid: true, hardness: 3.4, tiles: 23 },
  [B.DIAMOND_ORE]:  { name: '鑽石礦', solid: true, hardness: 4.0, tiles: 24 },
  [B.GLOWSTONE]:    { name: '螢石', solid: true, hardness: 0.5, tiles: 25, emissive: true },
  [B.FLOWER_RED]:   { name: '紅花', solid: false, hardness: 0.05, tiles: 26, cross: true },
  [B.FLOWER_YELLOW]:{ name: '黃花', solid: false, hardness: 0.05, tiles: 27, cross: true },
  [B.TALL_GRASS]:   { name: '草叢', solid: false, hardness: 0.05, tiles: 28, cross: true, drop: B.AIR },
  [B.WOOL_RED]:     { name: '紅羊毛', solid: true, hardness: 0.9, tiles: 29 },
  [B.WOOL_BLUE]:    { name: '藍羊毛', solid: true, hardness: 0.9, tiles: 30 },
  [B.WOOL_YELLOW]:  { name: '黃羊毛', solid: true, hardness: 0.9, tiles: 31 },
  [B.SNOW_BLOCK]:   { name: '雪塊', solid: true, hardness: 0.5, tiles: 32 },
  [B.GRAVEL]:       { name: '礫石', solid: true, hardness: 0.7, tiles: 33 },
};

function def(id) { return DEFS[id] || DEFS[B.AIR]; }
function isSolid(id) { return !!def(id).solid; }
function isLiquid(id) { return !!def(id).liquid; }
function isCross(id) { return !!def(id).cross; }
// 不透明：擋光、遮蔽相鄰面
function isOpaque(id) {
  const d = def(id);
  return !!d.solid && !d.cutout && !d.cross;
}
function dropOf(id) {
  const d = def(id);
  return d.drop !== undefined ? d.drop : id;
}
function tileOf(id, face) { // face: 'top' | 'bottom' | 'side'
  const t = def(id).tiles;
  if (typeof t === 'number') return t;
  if (!t) return 0;
  return t[face] !== undefined ? t[face] : t.side;
}

// 創造模式選單順序（可放置的方塊）
const CREATIVE_LIST = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.STONEBRICK, B.SAND, B.SANDSTONE,
  B.GRAVEL, B.LOG, B.PLANK, B.LEAF, B.SPRUCE_LEAF, B.GLASS, B.BRICK,
  B.SNOW_GRASS, B.SNOW_BLOCK, B.CACTUS, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE,
  B.DIAMOND_ORE, B.GLOWSTONE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW,
  B.FLOWER_RED, B.FLOWER_YELLOW, B.TALL_GRASS, B.WATER,
];

const MWBlocks = { B, DEFS, def, isSolid, isLiquid, isCross, isOpaque, dropOf, tileOf, CREATIVE_LIST };
if (typeof module !== 'undefined') module.exports = MWBlocks;
if (typeof window !== 'undefined') window.MWBlocks = MWBlocks;
})();
