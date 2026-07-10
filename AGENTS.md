# 我的方塊世界 — 開發與審核規範

> 本檔與 `CLAUDE.md` 內容同步（本檔給 Codex 等其他代理、後者給 Claude Code）。修改任一檔請同步另一檔。
> **接手必讀：`docs/HANDOVER.md`**（架構導覽、驗證方法、踩過的坑、擴充速查、路線圖都在那）。
>
> Minecraft 風格體素沙盒。純前端、零建置、零外部依賴（連 three.js 都沒有，手寫 WebGL2）。
> 雙擊 `index.html` 離線即玩；開發用 `npx http-server -p 8127 .`。
> 線上版：https://sancola1219-collab.github.io/block-world/ （main 分支根目錄＝GitHub Pages）
> 設計文件：`docs/superpowers/specs/2026-07-10-block-world-design.md`

## 架構

- **邏輯層（node 可測，不碰瀏覽器）**：`js/noise.js`（雜湊/噪聲）→ `js/blocks.js`（方塊表）→
  `js/worldgen.js`（地形/生物群系/洞穴/礦/樹）→ `js/world.js`（區塊儲存/天光/編輯追蹤）→
  `js/mesher.js`（網格+AO）；`js/physics.js`（AABB/DDA）、`js/entities.js`（生物/掉落物/投射物）、
  `js/inventory.js`（36格+合成）、`js/save.js`（存檔編解碼）、`js/levels.js`（冒險關卡）、`js/weather.js`（天氣狀態機）。
- **瀏覽器層**：`js/textures.js`（Canvas 程序材質圖集 256×256）、`js/render.js`（WebGL2）、
  `js/audio.js`（WebAudio 合成）、`js/input.js`（鍵鼠+觸控）、`js/main.js`（狀態機/60Hz/串流/UI）。

## 鐵律（沿用 3D遊戲模板）

1. 遊戲狀態只在 60Hz 固定時步 `tick()` 內改變；rAF 只渲染。
2. 邏輯層檔案不碰 DOM/window（`typeof module` 雙載入模式，node 直接 require）。
3. **每支邏輯檔都包在 IIFE 裡**——傳統 script 頂層 `const` 共用全域詞法環境，
   不包會跨檔撞名（`B`、`CHUNK`…）整支掛掉。新檔比照辦理。
4. 隨機一律 `mulberry32` / 座標雜湊；同種子同世界。跨區塊結構（樹）必須由世界座標決定性生成。
5. 座標：x 東、z 南、y 上；yaw=0 面向 −z；`世界高 96、海平面 32、區塊 16×16`。
6. 觸控＝合成輸入（搖桿走 `touchMove`、按鈕合成 keydown/mouse），不另寫邏輯分支。

## 常數速查

- id < 100 = 方塊（可放置）、id ≥ 100 = 物品（工具/食物/材料）；對照都在 `blocks.js`。
- 貼圖 tile：裂痕 40–47、生物皮膚 48–59＋112–117、物品/工具圖示 60–111（含新武器 103–111）；圖集 16×16 格、每格 16px。
- 網格頂點格式 stride 7：`x,y,z,u,v,sky,shade`；`sky=2.0` 表示自發光（螢石/火把）。mesher 快照 `get()` y<0 回 BEDROCK（否則多建 y=0 底面）。
- 半高方塊用 `def.h`（半磚 0.5、床 0.55）：mesher 頂面用 h、物理 overlaps 用 h、isOpaque 回 false。
- 火把/螢石/南瓜燈＝shader 點光源（上限 16 盞取最近）；光源方塊在 `def.light` 打旗標，main 的 `G.lights` 註冊表，讀檔 `rebuildLights()` 從 edits 重建——增減方塊要掛 `noteLightChange`。
- 爆炸（TNT/苦力怕）走 main 的 `explode()`：炸方塊＋連鎖 TNT＋玩家/生物傷害；引信是 `G.fuses` 實體。
- 存檔 key `mineworld.save.v1`（localStorage）：種子＋方塊差異＋玩家＋物品欄＋任務＋天氣；設定 `mineworld.settings.v1`。
  **encodeSave 是欄位白名單**，加存檔欄位要一起加否則默默丟失。`SAVE_VERSION` 升版時 `KNOWN_VERSIONS` 要含舊版。
- 天氣（`weather.js`）：clear/cloudy/rain/storm，`stepWeather` 走傳入 rand；雨/雪呈現由 `biomeAt` 決定；純視覺。雨雪粒子＝相機盒內告示板 quad（位置為時間的解析函式，無狀態）；碎屑 `G.burst` 在 tick 走重力。
- 冒險關卡（`levels.js`）：`buildStructure` 決定性建築；魔王步驟讀檔要重置 `bossSpawned`（存檔不含 mobs）。

## 測試與驗證

- `node --test`：28 項（噪聲、地形、區塊、天光、網格面數＋y=0 剔除、物理、DDA、實體、投射物、工具、關卡、天氣、物品欄、存檔相容）。
- 瀏覽器自動驗證用 `window.__mw`：`{G, tick, step, chunkWork, renderFrame, doSave, newGame, loadGame, skyState, renderer}`。
  隱藏分頁 rAF 停擺：先 `cv.width=800; cv.height=450` 再手動 `renderFrame()`，用 `gl.readPixels` 取樣驗色。
- 合成 tick 一律 `mw.tick(1/60)` 迴圈驅動；輸入用 `MWInput.state`（`keys.add('KeyW')`、`mouseDown[0]`、`transient.*`）。

## 已知陷阱

- 隱藏分頁：rAF 停、setTimeout 節流 1s+。載入流程已在 `document.hidden` 時改同步跑；別拆。
- 挖掘進度以 `hardness` 秒計（石頭 2.2s＝132 tick），自動測試記得跑夠 tick。
- 出生點：地形高度可能被洞穴挖穿，`startWorld` 會掃鄰柱找未挖穿的落點（`freshSpawn` 旗標）。
- 區塊網格單塊建置約 40ms，串流時每幀最多蓋一塊（預算 7ms 是「超過就停」不是硬上限）。
- Pointer Lock：Esc 後 ~1.35s 冷卻，`requestPointerLock()` 的 Promise 要 catch（已處理，勿簡化）。

## 工作流程

- 改邏輯 → `node --test` 全綠才 commit；改視覺 → readPixels 取樣驗證。
- commit：每完成一個任務就 commit，繁中訊息。
