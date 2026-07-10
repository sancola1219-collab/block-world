// 方塊與物品定義表 — 純邏輯，node 可測。
// id < 100 = 方塊（可放置）；id >= 100 = 物品（工具/食物/材料，不可放置）。
// tile: 圖集格編號（16x16 圖集，由 textures.js 依同一編號繪製）。
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
  WOOL_WHITE: 31, TORCH: 32, TNT: 33, BED: 34, SLAB_STONE: 35, SLAB_PLANK: 36,
  // ---- 物品 ----
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, DIAMOND: 104,
  PORKCHOP: 105, BEEF: 106, APPLE: 107, GUNPOWDER: 108,
  WOOD_PICK: 110, STONE_PICK: 111, IRON_PICK: 112, DIAMOND_PICK: 113,
  WOOD_AXE: 114, STONE_AXE: 115, IRON_AXE: 116, DIAMOND_AXE: 117,
  WOOD_SHOVEL: 118, STONE_SHOVEL: 119, IRON_SHOVEL: 120, DIAMOND_SHOVEL: 121,
  WOOD_SWORD: 122, STONE_SWORD: 123, IRON_SWORD: 124, DIAMOND_SWORD: 125,
};

// hardness：生存模式徒手挖掘秒數；<0 不可破壞。
// drop：挖掉後掉什麼（預設掉自己）。cross：十字面片。cutout：帶鏤空 alpha。
// toolKind：哪類工具挖得快（pick/axe/shovel）。h：方塊高度（半磚/床）。
const DEFS = {
  [B.AIR]:          { name: '空氣', solid: false, hardness: 0 },
  [B.GRASS]:        { name: '草地', solid: true, hardness: 0.7, tiles: { top: 0, bottom: 2, side: 1 }, drop: B.DIRT, toolKind: 'shovel' },
  [B.DIRT]:         { name: '泥土', solid: true, hardness: 0.6, tiles: 2, toolKind: 'shovel' },
  [B.STONE]:        { name: '石頭', solid: true, hardness: 2.2, tiles: 3, drop: B.COBBLE, toolKind: 'pick' },
  [B.COBBLE]:       { name: '圓石', solid: true, hardness: 2.4, tiles: 4, toolKind: 'pick' },
  [B.STONEBRICK]:   { name: '石磚', solid: true, hardness: 2.2, tiles: 5, toolKind: 'pick' },
  [B.BEDROCK]:      { name: '基岩', solid: true, hardness: -1, tiles: 6 },
  [B.SAND]:         { name: '沙子', solid: true, hardness: 0.6, tiles: 7, toolKind: 'shovel' },
  [B.SANDSTONE]:    { name: '砂岩', solid: true, hardness: 1.8, tiles: 8, toolKind: 'pick' },
  [B.LOG]:          { name: '原木', solid: true, hardness: 1.6, tiles: { top: 10, bottom: 10, side: 9 }, toolKind: 'axe' },
  [B.PLANK]:        { name: '木板', solid: true, hardness: 1.4, tiles: 11, toolKind: 'axe' },
  [B.LEAF]:         { name: '樹葉', solid: true, hardness: 0.3, tiles: 12, cutout: true },
  [B.SPRUCE_LEAF]:  { name: '杉樹葉', solid: true, hardness: 0.3, tiles: 13, cutout: true },
  [B.GLASS]:        { name: '玻璃', solid: true, hardness: 0.4, tiles: 14, cutout: true, drop: B.AIR },
  [B.BRICK]:        { name: '磚塊', solid: true, hardness: 2.2, tiles: 15, toolKind: 'pick' },
  [B.SNOW_GRASS]:   { name: '雪草地', solid: true, hardness: 0.7, tiles: { top: 16, bottom: 2, side: 17 }, drop: B.DIRT, toolKind: 'shovel' },
  [B.CACTUS]:       { name: '仙人掌', solid: true, hardness: 0.5, tiles: { top: 19, bottom: 19, side: 18 } },
  [B.WATER]:        { name: '水', solid: false, liquid: true, hardness: -1, tiles: 20 },
  [B.COAL_ORE]:     { name: '煤礦', solid: true, hardness: 3.0, tiles: 21, drop: B.COAL, toolKind: 'pick' },
  [B.IRON_ORE]:     { name: '鐵礦', solid: true, hardness: 3.4, tiles: 22, drop: B.IRON_INGOT, toolKind: 'pick' },
  [B.GOLD_ORE]:     { name: '金礦', solid: true, hardness: 3.4, tiles: 23, drop: B.GOLD_INGOT, toolKind: 'pick' },
  [B.DIAMOND_ORE]:  { name: '鑽石礦', solid: true, hardness: 4.0, tiles: 24, drop: B.DIAMOND, toolKind: 'pick' },
  [B.GLOWSTONE]:    { name: '螢石', solid: true, hardness: 0.5, tiles: 25, emissive: true },
  [B.FLOWER_RED]:   { name: '紅花', solid: false, hardness: 0.05, tiles: 26, cross: true },
  [B.FLOWER_YELLOW]:{ name: '黃花', solid: false, hardness: 0.05, tiles: 27, cross: true },
  [B.TALL_GRASS]:   { name: '草叢', solid: false, hardness: 0.05, tiles: 28, cross: true, drop: B.AIR },
  [B.WOOL_RED]:     { name: '紅羊毛', solid: true, hardness: 0.9, tiles: 29 },
  [B.WOOL_BLUE]:    { name: '藍羊毛', solid: true, hardness: 0.9, tiles: 30 },
  [B.WOOL_YELLOW]:  { name: '黃羊毛', solid: true, hardness: 0.9, tiles: 31 },
  [B.SNOW_BLOCK]:   { name: '雪塊', solid: true, hardness: 0.5, tiles: 32, toolKind: 'shovel' },
  [B.GRAVEL]:       { name: '礫石', solid: true, hardness: 0.7, tiles: 33, toolKind: 'shovel' },
  [B.WOOL_WHITE]:   { name: '白羊毛', solid: true, hardness: 0.9, tiles: 34 },
  [B.TORCH]:        { name: '火把', solid: false, hardness: 0.05, tiles: 38, cross: true, emissive: true, light: true },
  [B.TNT]:          { name: 'TNT', solid: true, hardness: 0.2, tiles: { top: 36, bottom: 36, side: 35 } },
  [B.BED]:          { name: '床', solid: true, hardness: 0.4, h: 0.55, tiles: { top: 37, bottom: 11, side: 11 }, toolKind: 'axe' },
  [B.SLAB_STONE]:   { name: '石半磚', solid: true, hardness: 2.0, h: 0.5, tiles: 3, toolKind: 'pick' },
  [B.SLAB_PLANK]:   { name: '木半磚', solid: true, hardness: 1.2, h: 0.5, tiles: 11, toolKind: 'axe' },
  // ---- 物品 ----
  [B.STICK]:        { name: '木棒', item: true, tiles: 60 },
  [B.COAL]:         { name: '煤炭', item: true, tiles: 61 },
  [B.IRON_INGOT]:   { name: '鐵錠', item: true, tiles: 62 },
  [B.GOLD_INGOT]:   { name: '金錠', item: true, tiles: 63 },
  [B.DIAMOND]:      { name: '鑽石', item: true, tiles: 64 },
  [B.PORKCHOP]:     { name: '豬排', item: true, tiles: 65, food: 4 },
  [B.BEEF]:         { name: '牛排', item: true, tiles: 66, food: 4 },
  [B.APPLE]:        { name: '蘋果', item: true, tiles: 67, food: 2 },
  [B.GUNPOWDER]:    { name: '火藥', item: true, tiles: 68 },
  [B.WOOD_PICK]:      { name: '木鎬', item: true, tiles: 70, tool: { kind: 'pick', speed: 2 } },
  [B.STONE_PICK]:     { name: '石鎬', item: true, tiles: 71, tool: { kind: 'pick', speed: 3 } },
  [B.IRON_PICK]:      { name: '鐵鎬', item: true, tiles: 72, tool: { kind: 'pick', speed: 5 } },
  [B.DIAMOND_PICK]:   { name: '鑽石鎬', item: true, tiles: 73, tool: { kind: 'pick', speed: 8 } },
  [B.WOOD_AXE]:       { name: '木斧', item: true, tiles: 74, tool: { kind: 'axe', speed: 2 } },
  [B.STONE_AXE]:      { name: '石斧', item: true, tiles: 75, tool: { kind: 'axe', speed: 3 } },
  [B.IRON_AXE]:       { name: '鐵斧', item: true, tiles: 76, tool: { kind: 'axe', speed: 5 } },
  [B.DIAMOND_AXE]:    { name: '鑽石斧', item: true, tiles: 77, tool: { kind: 'axe', speed: 8 } },
  [B.WOOD_SHOVEL]:    { name: '木鏟', item: true, tiles: 78, tool: { kind: 'shovel', speed: 2 } },
  [B.STONE_SHOVEL]:   { name: '石鏟', item: true, tiles: 79, tool: { kind: 'shovel', speed: 3 } },
  [B.IRON_SHOVEL]:    { name: '鐵鏟', item: true, tiles: 80, tool: { kind: 'shovel', speed: 5 } },
  [B.DIAMOND_SHOVEL]: { name: '鑽石鏟', item: true, tiles: 81, tool: { kind: 'shovel', speed: 8 } },
  [B.WOOD_SWORD]:     { name: '木劍', item: true, tiles: 82, dmg: 5 },
  [B.STONE_SWORD]:    { name: '石劍', item: true, tiles: 83, dmg: 6 },
  [B.IRON_SWORD]:     { name: '鐵劍', item: true, tiles: 84, dmg: 7 },
  [B.DIAMOND_SWORD]:  { name: '鑽石劍', item: true, tiles: 85, dmg: 8 },
};

const HAND_DMG = 2;

function def(id) { return DEFS[id] || DEFS[B.AIR]; }
function isSolid(id) { return !!def(id).solid; }
function isLiquid(id) { return !!def(id).liquid; }
function isCross(id) { return !!def(id).cross; }
function isItem(id) { return !!def(id).item; }
// 不透明：擋光、遮蔽相鄰面（半高方塊不遮）
function isOpaque(id) {
  const d = def(id);
  return !!d.solid && !d.cutout && !d.cross && d.h === undefined;
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
// 挖掘秒數（考慮手上工具）
function digTime(blockId, heldId) {
  const d = def(blockId);
  if (d.hardness < 0) return -1;
  let t = d.hardness;
  const tool = heldId !== undefined ? def(heldId).tool : null;
  if (tool && d.toolKind === tool.kind) t /= tool.speed;
  return Math.max(0.15, t);
}
function attackDmg(heldId) {
  const d = heldId !== undefined ? def(heldId) : null;
  return (d && d.dmg) || HAND_DMG;
}

// 創造模式選單順序（可放置的方塊）
const CREATIVE_LIST = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.STONEBRICK, B.SLAB_STONE, B.SAND, B.SANDSTONE,
  B.GRAVEL, B.LOG, B.PLANK, B.SLAB_PLANK, B.LEAF, B.SPRUCE_LEAF, B.GLASS, B.BRICK,
  B.SNOW_GRASS, B.SNOW_BLOCK, B.CACTUS, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE,
  B.DIAMOND_ORE, B.GLOWSTONE, B.TORCH, B.TNT, B.BED,
  B.WOOL_WHITE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_YELLOW,
  B.FLOWER_RED, B.FLOWER_YELLOW, B.TALL_GRASS, B.WATER,
];

const MWBlocks = { B, DEFS, HAND_DMG, def, isSolid, isLiquid, isCross, isItem, isOpaque, dropOf, tileOf, digTime, attackDmg, CREATIVE_LIST };
if (typeof module !== 'undefined') module.exports = MWBlocks;
if (typeof window !== 'undefined') window.MWBlocks = MWBlocks;
})();
