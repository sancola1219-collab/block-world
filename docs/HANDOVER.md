# 交接導覽（HANDOVER）— 我的方塊世界

> 給接手的 AI 代理（Codex / Claude Code / 其他）與未來的自己。
> 讀完本檔＋根目錄 `CLAUDE.md`（Codex 讀 `AGENTS.md`，內容相同）就能安全動手。
> 最後更新：2026-07-10，版本 v1.1.0。

## 這是什麼、現在到哪裡

Minecraft 風格 3D 體素沙盒，繁體中文，目標玩家是小朋友（介面簡單、不設挫折機制、無恐怖元素）。

- **零依賴**：沒有 three.js、沒有 npm 套件、沒有建置步驟。3D 是手寫 WebGL2，音效是 WebAudio 合成，材質是 Canvas 程序生成。雙擊 `index.html` 用 file:// 就能玩。
- **線上版**：https://sancola1219-collab.github.io/block-world/
- **Repo**：github.com/sancola1219-collab/block-world（main 分支根目錄 = GitHub Pages）
- **已完成**（v1.1.0）：無限地形（五生物群系/洞穴/礦脈/樹）、創造+生存、日夜循環、
  四階工具 16 種、火把點光源、TNT 爆炸、床（睡覺跳夜）、半磚、食物回血、
  豬/羊/牛/殭屍/苦力怕、31 種合成、掉落物拾取、localStorage 存檔、觸控支援、19 項單元測試。

## 十分鐘看懂架構

**兩層分離（鐵律）**：邏輯層純 JS 可在 node 跑測試；瀏覽器層才碰 DOM/WebGL。

```
邏輯層（node --test 直接 require）           瀏覽器層
─────────────────────────────            ─────────────────────
noise.js    雜湊/值噪聲/fBm/mulberry32     textures.js  Canvas 程序材質圖集 256×256
blocks.js   方塊+物品定義表（單一真相源）    render.js    WebGL2：區塊/實體/天空/點光源
worldgen.js 地形/群系/洞穴/礦/樹(跨區塊)    audio.js     WebAudio 合成音效+配樂
world.js    區塊 Map/getBlock/天光/edits   input.js     鍵鼠+PointerLock+觸控搖桿
mesher.js   方塊資料→三角形（AO/半高/水）   main.js      狀態機/60Hz tick/串流/UI/所有玩法接線
physics.js  AABB 逐軸碰撞/DDA 射線
entities.js 豬羊牛殭屍苦力怕 AI/掉落物
inventory.js 36格/堆疊/31配方
save.js     存檔編解碼（storage 注入式）
```

**資料流**：`main.tick()`（60Hz 固定時步）改狀態 → `renderFrame()`（rAF）只畫。
區塊串流：玩家移動 → `chunkWork(預算ms)` 依螺旋序生成/建網格 → `renderer.setChunkMesh`。
玩家改方塊 → `world.setBlock` 記入 `edits` 並標髒 → 下一幀自動重建網格。存檔只存 edits 差異。

**關鍵慣例**（違反會壞）：
1. 每支邏輯檔都包 IIFE ＋ `typeof module` 雙出口（node require / window 全域）。
   傳統 script 頂層 `const` 共用全域詞法環境，不包 IIFE 會跨檔撞名（`B`、`CHUNK`）整支掛掉。
2. 隨機一律 `mulberry32`/座標雜湊。同種子必同世界；樹等跨區塊結構必須由世界座標決定性生成。
3. 座標：x 東、z 南、y 上；yaw=0 面向 −z。世界高 96、海平面 32、區塊 16×16。
4. 觸控＝合成輸入（搖桿走 `state.touchMove`、按鈕合成 keydown/mousedown），不寫觸控專用邏輯分支。
5. id < 100 = 方塊、id ≥ 100 = 物品。新方塊/物品只改 `blocks.js` 定義＋`textures.js` 畫 tile，
   其餘系統（挖掘、掉落、圖示、合成）自動跟上。

## 接手工作流程（照做就對）

1. **動手前**：`node --test` 確認 19 項全綠（基準線）。
2. **改邏輯**：先寫/改 `tests/logic.test.js` 的測試 → 實作 → 全綠。
3. **改視覺/玩法**：起 `npx http-server -p 8127 .`，用瀏覽器 console 的 `window.__mw` 驗證：
   ```js
   // 隱藏分頁 rAF 會停擺，一律同步驅動：
   const mw = window.__mw, g = mw.G;
   document.getElementById('btn-new').click();
   document.querySelector('.btn-mode[data-mode="survival"]').click(); // 隱藏分頁下同步跑完
   for (let i = 0; i < 120; i++) mw.tick(1/60);      // 跑遊戲邏輯
   MWInput.state.mouseDown[0] = true;                 // 合成輸入
   MWInput.state.transient.rightClick = true;         // 單發輸入
   // 驗畫面：強制尺寸再 readPixels 取樣，不要用截圖
   const cv = document.getElementById('game'); cv.width = 800; cv.height = 450;
   mw.renderFrame();
   const gl = cv.getContext('webgl2'); // gl.readPixels(...) 驗色、gl.getError() 必須是 0
   ```
4. **發佈前**：bump `index.html` 所有 `?v=N` 與 `#buildtag`（Pages CDN 快取 10 分鐘，
   使用者靠版本徽章判斷有沒有拿到新版）。清掉自己測試寫入的 localStorage
   （`mineworld.save.v1`、`mineworld.settings.v1`），別把測試世界留給使用者。
5. **commit**：繁中訊息、每完成一件事就 commit；`git push` 即自動部署 Pages（1-10 分鐘生效）。
6. **驗上線**：`Invoke-WebRequest https://sancola1219-collab.github.io/block-world/ 內容含新 buildtag`。

## 已踩過的坑（付過學費，別再踩）

- **全域撞名**：見慣例 1。新增 js 檔照抄現有檔頭尾的 IIFE 模式。
- **隱藏分頁**：rAF 停、setTimeout 節流 1s+。載入流程已在 `document.hidden` 時走同步路徑（main.js
  `startWorld`），別拆；自動測試永遠用 `mw.tick`/`mw.chunkWork`/`mw.renderFrame` 同步驅動。
- **挖掘以秒計**：石頭 2.2s = 132 tick。測試迴圈跑不夠 tick 會誤判「挖不掉」。
- **出生點會掉進洞穴**：地形高度函式不知道洞穴。`startWorld` 的 `freshSpawn` 掃鄰柱找未挖穿的落點，別刪。
- **光源註冊表**：火把/螢石的點光源存在 `main.js` 的 `G.lights`，讀檔時 `rebuildLights()` 從
  world.edits 重建。任何會增減方塊的新路徑（爆炸、活塞…）都要呼叫 `noteLightChange()`，漏了會出現幽靈光。
- **beforeunload 會自動存檔**：清測試存檔要在回到標題（state='title'）後再清，否則 reload 又存回去。
- **區塊建網格約 40ms/塊**：`chunkWork` 的預算是「超過就停」不是硬上限，走進新地形時偶有掉幀屬正常。
  若要優化：greedy meshing 或把 `world.lightAt` 的鄰柱取樣快取。
- **Pointer Lock**：Esc 後 ~1.35s 冷卻、Promise 要 catch（input.js 已處理，勿簡化）。
- **PowerShell 5.1**：無 `&&`、原生 exe 的 stderr 會被包成錯誤（git push 的進度輸出看起來像失敗，
  看實際 push 結果行）。寫 UTF-8 檔用 `[IO.File]::WriteAllText(..., UTF8Encoding($false))`。

## 擴充速查（下一個功能怎麼加）

- **新方塊**：`blocks.js` 加 id+DEFS（記得 hardness/toolKind/tiles）→ `textures.js` 畫 tile →
  加進 `CREATIVE_LIST`。要能合成就加 `inventory.js` RECIPES。發光→ emissive + main 的 noteLightChange 名單。
- **新物品/工具/食物**：`blocks.js` id≥100，`tool:{kind,speed}` 或 `food:n` 或 `dmg:n`，
  `textures.js` 畫圖示，`inventory.js` 加配方。挖速/傷害/吃東西的邏輯自動生效。
- **新生物**：`entities.js` MOB_DEFS+stepMob 加 AI 分支（純邏輯，寫測試）→ `textures.js` 皮膚 tile →
  `render.js` MODELS 加盒狀部件 → `main.js` 的 spawnMobs/AMBIENT/MOB_DROPS 各加一行。
- **新機制事件**：stepMob 推 events（如 `{type:'explode',...}`），main 的事件迴圈接。邏輯層不碰 main。

## 建議路線圖（使用者已知悉的候選）

1. **弓箭＋骷髏**：需要投射物實體（拋物線+DDA 碰撞，可重用 physics.raycast 思路）。骷髏 AI＝保持距離射箭。
2. **農田**：鋤頭+耕地方塊+小麥（cross 方塊 4 生長階段，用 tick 隨機生長）→ 麵包。
3. **熔爐**：把「礦石直接掉錠」改回「掉礦石+熔爐燒製」（會動到 dropOf 與既有配方，注意存檔相容）。
4. **結構生成**：村莊/地牢。跨區塊決定性生成照 `worldgen.js` 樹的作法（世界座標雜湊＋掃邊界外 N 格）。
5. **效能**：greedy meshing、Web Worker 生成區塊（要把 worldgen 隔離出 postMessage 介面）。

## 冒險關卡系統（v1.2.0 新增）

- `js/levels.js`：關卡資料（原創內容）＋`buildStructure()` 建築生成（確定性，測試有驗）。
  任務步驟型別：`pickup / collect / kill / reach / boss`；每步可帶 `spawn:{mob,max}` 敵人配置。
- 模式 `adventure`：生存規則＋英雄能力（`LEVELS[id].hero` 的 speedMul/jumpMul/dmgBonus/fallResist）。
- 投射物在 `entities.js`（`makeProjectile/stepProjectile`）：魔法彈直飛、圓盾自動折返回手。
- 任務進度存於 `G.quest`，建築原點 `G.origin` 存檔後用來重算 `points`（**不要**讀檔時重蓋建築，會蓋掉玩家的改動）。
- **教訓**：`save.js encodeSave` 是欄位白名單——加新存檔欄位時，doSave 給了還不夠，encodeSave 也要加，否則默默丟失（曾漏掉 quest/level/origin/pdrops/spawn）。
- 命名原則：關卡內容全原創（魔法學院/超級戰士），不用註冊商標詞彙（公開 Pages 的鐵律）。

## v1.3.0 補充

- **mesher 快照優化**：模組層 `SNAP`/`LIGHT_SNAP`（18×18×96，含 1 格邊界）重複使用；
  方塊逐柱 `TypedArray.set` 拷貝、光照惰性快取。建塊 40ms → 10-15ms。建網格是單執行緒序列呼叫，
  共用 scratch 陣列安全；若未來搬進 Web Worker 要改成每 worker 一份。
- **投射物瞄準輔助**：玩家投射物在 45° 錐角內朝最近敵人微幅轉向（`stepProjectile`）。
  沒有它，繞飛的火龍打不中——改平衡前先想想這條。命中半徑依體型（`max(0.8+scale*0.25, hw*2)`）。
- **敵方投射物**：`makeProjectile(..., hostile=true)` 打玩家（火龍 fireball）；事件 `projhitplayer`。
- **飛行魔王**：dragon 不走 moveBox（環繞玩家的目標點漂移），死亡才落地；瞬移魔王 shadowmaster 用 `teleports` 旗標。
- 光源方塊統一 `def(id).light` 旗標（火把/螢石/南瓜燈），main 的 noteLightChange/rebuildLights 都吃這個。

## 天氣與特效（v1.3.0）

- `js/weather.js`：純邏輯天氣狀態機（node 可測）。type ∈ clear/cloudy/rain/storm；
  `stepWeather(w, dt, rand)` 平滑推進 precip/cloud/gloom，回傳 true 表示這刻打雷。**降水以雨或雪呈現由呼叫端依生物群系決定**（`biomeAt==='snow'` → 雪）。
- 天氣在 `main.js tick` 內推進（隨機走 `G.rand`），純視覺不影響玩法。雷聲延遲 0.4–2.6s 播（光比聲快）。
- 渲染（`render.js`）：雨/雪是相機周圍盒內的告示板小 quad，**位置為時間的解析函式（無狀態、無逐幀積分）**，落下並在盒內環繞包覆；重用 `progFlat`。全雨滿載約 +1.5ms/幀。
- `main.js renderFrame`：gloom 調暗天空/白晝/縮短霧、flash（閃電）提亮天空並拉 `#overlay-flash` 白幕。
- **洞穴/室內不下雨**：`playerExposed()` 用天光判斷（skylight ≥ 14）；不見天則 precip 視覺歸零。
- 碎屑粒子 `G.burst`（挖掘/爆炸）：純視覺、在 tick 內走重力、`spawnBurst()` 用 `Math.random`（不擾動世界 RNG）。
- 天氣進 存檔（`weather` 欄位，encodeSave 白名單已含）。

### 本版修掉的坑（審查抓到）
- **mesher 快照 `get()` y<0 要回 BEDROCK**（非 AIR），否則每塊多建 256 個 y=0 底面（看不見卻吃效能）。有測試鎖住。
- **魔王戰中途存檔→讀檔永久卡關**：存檔不含 mobs，`loadGame` 若停在 boss 步驟必須重置 `bossSpawned/bossKilled`，否則魔王不再出現、任務無法完成。
- **投射物瞄準輔助只吸向 hostile**：否則箭/手裡劍會轉向豬羊牛。
- **SAVE_VERSION 升到 2**：舊版（Pages CDN 快取的舊 JS）遇到 v2 存檔會安全拒讀（回「無存檔」）而非把新方塊誤判成空氣；新版仍讀得懂 v1 舊檔（`KNOWN_VERSIONS`）。

## 版本紀錄

- **v1.0.0**（2026-07-10）：核心引擎＋雙模式＋基礎生物＋存檔。commit 0ad0827 / b02c5b6。
- **v1.0.2**：設定記憶（音樂開關）、資源 `?v=` 快取參數、GitHub Pages 上線。commit 7699185 / eb9657d。
- **v1.1.0**：工具/火把/TNT/床/半磚/食物/羊牛苦力怕/合成擴充。commit f5728ca。
- **v1.2.0**：冒險關卡（魔法學院/超級戰士）、投射物、英雄能力、任務鏈、勝利畫面；創造模式全物品直接拿。22 項測試。
- **v1.3.0**：忍者/屠龍兩關（飛天火龍、瞬移魔王、敵方火球）、8 種新方塊、弓/手裡劍/煙霧彈/聖劍/烈焰弓/金蘋果/藥水、mesher 快照優化（40→10-15ms）、天氣系統與雨雪雷電/碎屑特效；修 4 個審查確認的坑。28 項測試。
- 設計文件：`docs/superpowers/specs/2026-07-10-block-world-design.md`
