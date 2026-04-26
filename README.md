# 全台捷運 × Pikmin Bloom 攻略地圖

選一站 → 查 800m 內可拿哪些 Decor 皮克敏 → AI 給散步攻略。
**支援台北、台中、高雄三大捷運系統**（含高雄環狀輕軌）。

## 🌸 線上 Demo

**👉 [unbias38.github.io/pikmin-mrt-taiwan](https://unbias38.github.io/pikmin-mrt-taiwan/)**

> 此 repo 為多城市版本，由 [pikmin-mrt-taipei](https://github.com/unbias38/pikmin-mrt-taipei) v1.0 fork 而來。
> 台北專屬版（已凍結）：[v1.0 release](https://github.com/unbias38/pikmin-mrt-taipei/releases/tag/v1.0)

開網頁 → 頂部選城市 → 選任意捷運站（地圖點選或下拉搜尋）→ 看周邊 Decor 類別清單 → 點 ⚙️ 設定填 API Key → 點「生成攻略」讓 AI 給散步建議。

## 涵蓋範圍

| 城市 | 站數 | 線數 | POI | 運量資料 |
|---|---|---|---|---|
| 🏙️ 台北 | 109 | 5（BR/R/G/O/BL） | 5 MB / 48k POI | ✅ 12 個月趨勢 |
| 🌳 台中 | 18 | 1（綠線） | 0.4 MB | ❌ 暫未提供 |
| 🌊 高雄 | 74 | 3（紅 + 橘 + 環狀輕軌） | 1.2 MB | ❌ 暫未提供 |

## 主要功能

- 🗺️ **三城市互動地圖**（彩色 OSM 底圖，頂部下拉切換，記住上次選擇）
- 🌳 **25 種 Decor 類別偵測**（從 OSM POI 推斷）
- 📊 **稀有度排行**：點頂部「📊 排行」看哪些站獨家有特定 Decor
- 📍 **點 Decor 卡片** → 對應店家 pin 全部撒在地圖上（可疊加多種類別）
- 💬 點 pin 看店名、地址、營業時間、Google Maps 連結
- 📈 **運量趨勢**：每站近 12 月 sparkline + 5 級人潮指數（**僅台北**）
- 🚶 **路線規劃**：3 種模式
  - 直線 A→B（指定起終點）
  - 🔄 散步圈 A→B→A（去回不同路徑）
  - ⏱️ 限時模式（給時間預算 15/30/45/60 分，系統自動挑 Decor 多樣性高的中繼站）
- 🚆 沿路車站人潮分析（每站排名 + 整段平均，僅台北）
- ✨ **Google Gemini / OpenAI 雙 LLM** 攻略生成（API Key 自備，存 localStorage，prompt 依城市動態替換）
- 📱 **手機 RWD**：地圖 + 資訊面板自動垂直堆疊，全螢幕 modal
- 🎯 **SEO 完整**：meta description、Open Graph、Twitter Card、JSON-LD、sitemap、robots.txt

## API Key

- **Google Gemini** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)（免費額度大）
- **OpenAI GPT-5** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)（要綁信用卡）

Key 只存在你的瀏覽器 `localStorage`，不會上傳任何伺服器。共用電腦記得別勾「記住」。

## 本地開發

```bash
python -m http.server 8765
# 或
npx serve
```

開 http://localhost:8765 即可。

## 部署到 Netlify（自架）

想自己架一份不依賴 GitHub Pages：

1. 把整個專案資料夾打包成 zip。**不需要** `node_modules`、`scripts/`、`data/_*`、`*.log`。
2. 進 [Netlify](https://app.netlify.com/) → **Add new site** → **Deploy manually**。
3. 把 zip 拖進去，等 30 秒。

部署需要的檔：

```
index.html · style.css · app.js · LICENSE · googleXXX.html · sitemap.xml · robots.txt · og-image.png
data/decor-mapping.json
data/{taipei,taichung,kaohsiung}/{stations,pois}.json
data/taipei/ridership.json
```

## 重新抓資料（半年/一年一次）

OSM 持續更新（新店家、新公園），但 `data/{city}/pois.json` 是預先打包的快照。要更新：

```bash
# 抓站點（OSM Overpass）
node scripts/fetch-stations.mjs taipei
node scripts/fetch-stations.mjs taichung
node scripts/fetch-stations.mjs kaohsiung

# 抓 POI（每城市約 5-25 分鐘）
node scripts/fetch-pois.mjs taipei
node scripts/fetch-pois.mjs taichung
node scripts/fetch-pois.mjs kaohsiung

# 重新分類（更新 decor-mapping.json 後不用重抓網路）
node scripts/reclassify.mjs

# 抓台北運量（其他城市暫未支援）
node scripts/fetch-ridership.mjs
```

抓完 push 即可。

## 加新城市

要支援桃園、淡海輕軌等：

1. 在 `scripts/cities.mjs` 加 entry（bbox、networkPattern、線色）
2. `node scripts/fetch-stations.mjs <city>` + `node scripts/fetch-pois.mjs <city>`
3. 在 `index.html` 的 `<select id="citySelect">` 加 `<option>`
4. 在 `app.js` 的 `CITY_VIEWS` 加地圖中心配置

## 資料來源與限制

- **站點清單 + POI**：[OpenStreetMap (ODbL)](https://www.openstreetmap.org/copyright)，800m 半徑
- **台北運量**：[臺北捷運公司公開 ODS 月檔](https://www.metro.taipei/cp.aspx?n=FF31501BEBDD0136)
- **Decor 對照表**：`data/decor-mapping.json`，**社群觀察推測**（Niantic 沒公開官方分類，confidence 標 low 的代表不確定）

實際遊玩可能與本表有出入。要修對照表直接編 `data/decor-mapping.json` 然後 `node scripts/reclassify.mjs` 即可，不用重抓網路。

## 授權與聲明

- 程式碼：MIT License（見 [LICENSE](LICENSE)）
- POI / 站點資料：**OpenStreetMap (ODbL)** © OSM contributors
- 台北運量：**臺北大眾捷運股份有限公司**（公開資料）
- 底圖：**CARTO Voyager** © OpenStreetMap, © CARTO

**Pikmin Bloom 為任天堂 / Niantic 商標**。本工具為玩家社群非商業性輔助攻略，非官方產品，不附帶任何遊戲資源或檔案。Decor 對照表為社群觀察推測，可能與遊戲實際分類有差異，不代表 Niantic 官方立場。

## 技術棧

- 純前端：HTML + CSS + Vanilla JS（無 build step）
- 地圖：[Leaflet](https://leafletjs.com/) + CARTO Voyager 底圖
- 路線：[OSRM Demo Server](https://router.project-osrm.org/) (foot profile)
- LLM：Google Gemini / OpenAI GPT-5（前端直連）
- 資料抓取：Node.js + [Overpass API](https://overpass-turbo.eu/) + [SheetJS](https://sheetjs.com/)
- OG image 產生：[@resvg/resvg-js](https://github.com/yisibl/resvg-js)（SVG → PNG）
- 訪客計數：[abacus.jasoncameron.dev](https://abacus.jasoncameron.dev/)（免費 hit counter）

## Roadmap

### ✅ 已完成（v2.0）
- 多城市切換（台北 + 台中 + 高雄）
- 站點 × Decor 查詢、稀有度排行、Decor pin 多選疊加
- 路線規劃 3 種模式（直線 / 散步圈 / 限時）
- 台北運量整合（sparkline、人潮指數、路線車站列表、LLM 整合）
- 手機 RWD、訪客計數、SEO、Search Console 驗證

### ⏳ 後續構想
- 桃園機場捷運、淡海輕軌等其他系統
- 台中 / 高雄 運量資料整合（要寫 Excel/PDF parser）
- 跨年度同期比較
- 平日 vs 假日切換
- 多途經點 A→B→C→A
- Decor 圖鑑收集進度追蹤
