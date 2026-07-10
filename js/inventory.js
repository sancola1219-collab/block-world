// 物品欄與合成 — 純邏輯，node 可測。
// 36 格：0..8 快捷欄、9..35 背包。每格 null 或 {id, count}（count ≤ 64）。
'use strict';
(function () { // IIFE：避免傳統 script 頂層 const 撞名

const BK6 = (typeof module !== 'undefined') ? require('./blocks.js') : window.MWBlocks;
const { B } = BK6;

const MAX_STACK = 64;
const SLOTS = 36;

function createInventory() {
  return { slots: new Array(SLOTS).fill(null), sel: 0 };
}

// 加入物品，回傳放不下的數量
function addItem(inv, id, count) {
  if (id === B.AIR || count <= 0) return 0;
  let left = count;
  // 先疊到既有堆
  for (let i = 0; i < SLOTS && left > 0; i++) {
    const s = inv.slots[i];
    if (s && s.id === id && s.count < MAX_STACK) {
      const add = Math.min(MAX_STACK - s.count, left);
      s.count += add; left -= add;
    }
  }
  // 再開新格
  for (let i = 0; i < SLOTS && left > 0; i++) {
    if (!inv.slots[i]) {
      const add = Math.min(MAX_STACK, left);
      inv.slots[i] = { id, count: add }; left -= add;
    }
  }
  return left;
}

function countOf(inv, id) {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.count;
  return n;
}

// 移除指定數量，全數成功才移除，回傳是否成功
function removeItem(inv, id, count) {
  if (countOf(inv, id) < count) return false;
  let left = count;
  for (let i = SLOTS - 1; i >= 0 && left > 0; i--) {
    const s = inv.slots[i];
    if (s && s.id === id) {
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count === 0) inv.slots[i] = null;
    }
  }
  return true;
}

// 從指定格消耗 1 個（生存放置用），回傳消耗掉的 id 或 0
function consumeSlot(inv, i) {
  const s = inv.slots[i];
  if (!s) return 0;
  const id = s.id;
  s.count--;
  if (s.count <= 0) inv.slots[i] = null;
  return id;
}

function swapSlots(inv, a, b) {
  const t = inv.slots[a]; inv.slots[a] = inv.slots[b]; inv.slots[b] = t;
}

// ---- 合成 ----
const RECIPES = [
  { name: '木板 ×4', out: B.PLANK, outCount: 4, ins: [{ id: B.LOG, count: 1 }] },
  { name: '石磚 ×1', out: B.STONEBRICK, outCount: 1, ins: [{ id: B.COBBLE, count: 1 }] },
  { name: '石頭 ×1', out: B.STONE, outCount: 1, ins: [{ id: B.COBBLE, count: 2 }] },
  { name: '玻璃 ×1', out: B.GLASS, outCount: 1, ins: [{ id: B.SAND, count: 2 }] },
  { name: '磚塊 ×2', out: B.BRICK, outCount: 2, ins: [{ id: B.DIRT, count: 2 }, { id: B.SAND, count: 2 }] },
  { name: '螢石 ×2', out: B.GLOWSTONE, outCount: 2, ins: [{ id: B.COAL_ORE, count: 1 }, { id: B.GOLD_ORE, count: 1 }] },
  { name: '紅羊毛 ×2', out: B.WOOL_RED, outCount: 2, ins: [{ id: B.PLANK, count: 2 }, { id: B.FLOWER_RED, count: 1 }] },
  { name: '黃羊毛 ×2', out: B.WOOL_YELLOW, outCount: 2, ins: [{ id: B.PLANK, count: 2 }, { id: B.FLOWER_YELLOW, count: 1 }] },
  { name: '藍羊毛 ×2', out: B.WOOL_BLUE, outCount: 2, ins: [{ id: B.PLANK, count: 2 }, { id: B.DIAMOND_ORE, count: 1 }] },
];

function canCraft(inv, r) {
  return r.ins.every(({ id, count }) => countOf(inv, id) >= count);
}

function craft(inv, r) {
  if (!canCraft(inv, r)) return false;
  for (const { id, count } of r.ins) removeItem(inv, id, count);
  const left = addItem(inv, r.out, r.outCount);
  if (left > 0) addItem(inv, r.ins[0].id, r.ins[0].count); // 滿了退回一點材料（簡化）
  return true;
}

function serializeInv(inv) {
  return { sel: inv.sel, slots: inv.slots.map(s => s ? [s.id, s.count] : 0) };
}
function deserializeInv(obj) {
  const inv = createInventory();
  if (obj && Array.isArray(obj.slots)) {
    inv.sel = obj.sel | 0;
    for (let i = 0; i < Math.min(SLOTS, obj.slots.length); i++) {
      const s = obj.slots[i];
      if (Array.isArray(s)) inv.slots[i] = { id: s[0], count: s[1] };
    }
  }
  return inv;
}

const MWInv = { MAX_STACK, SLOTS, createInventory, addItem, countOf, removeItem, consumeSlot, swapSlots, RECIPES, canCraft, craft, serializeInv, deserializeInv };
if (typeof module !== 'undefined') module.exports = MWInv;
if (typeof window !== 'undefined') window.MWInv = MWInv;
})();
