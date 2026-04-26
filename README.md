# 台北捷運 × Pikmin Bloom 攻略地圖

選一站 → 查 800m 內可拿哪些 Decor 皮克敏 → AI 給散步攻略。

## 🌸 線上 Demo

**👉 [unbias38.github.io/pikmin-mrt-taipei](https://unbias38.github.io/pikmin-mrt-taipei/)**

開網頁 → 選任意捷運站（地圖點選或下拉搜尋）→ 看周邊 Decor 類別清單 → 點 ⚙️ 設定填 API Key → 點「生成攻略」讓 AI 給散步建議。

主要功能：
- 🗺️ 109 站互動地圖（彩色 OSM 底圖）
- 🌳 25 種 Decor 類別偵測（從 OSM POI 推斷）
- 📊 **稀有度排行**：點頂部「📊 排行」看哪些站獨家有特定 Decor
- 📍 **點 Decor 卡片** → 對應店家 pin 全部撒在地圖上（可疊加多種類別）
- 💬 點 pin 看店名、地址、Google Maps 連結
- 📈 **運量趨勢**：每站近 12 月進站人潮 sparkline + 5 級人潮指數（冷門好站 ↔ 熱門尖峰）
- 🚶 **路線規劃**：3 種模式
  - 直線 A→B（指定起終點）
  - 🔄 散步圈 A→B→A（去回不同路徑）
  - ⏱️ 限時模式（給時間預算 15/30/45/60 分，系統自動挑 Decor 多樣性高的中繼站）
- 🚆 沿路車站人潮分析（每站排名 + 整段平均人潮指數）
- ✨ Google Gemini / OpenAI 雙 LLM 攻略生成（API Key 自備，存 localStorage）
- 📱 **手機 RWD**：地圖 + 資訊面板自動垂直堆疊，全螢幕 modal

## 部署到 Netlify（自架版）

想自己架一份不依賴 GitHub Pages：

1. 把整個專案資料夾打包成 zip（或直接上傳資料夾）。**不需要** `node_modules`、`scripts/`、`data/_*.json`、`*.txt`、`*.log`，這些只是開發/原始素材。
2. 進 [Netlify](https://app.netlify.com/) → Sites → **Add new site** → **Deploy manually**。
3. 把 zip 拖進去，等 30 秒。會給你一個 `https://xxxx.netlify.app` 網址。
4. 開網址 → 點 **⚙️ 設定** → 填 API Key → 開玩。

或連 GitHub repo 自動部署：Netlify → New site from Git → 選 `pikmin-mrt-taipei`，build command 留空，publish dir = `/`。

部署只需要這些檔：

```
index.html
style.css
app.js
data/stations.json
data/decor-mapping.json
data/pois.json
```

## API Key

- **Google Gemini** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)（免費額度大）
- **OpenAI GPT-5** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)（要綁信用卡）

Key 只存在你的瀏覽器 `localStorage`，不會上傳任何伺服器。共用電腦記得別勾「記住」。

## 本地開發

```bash
# 任何一種靜態伺服器都可
python -m http.server 8765
# 或
npx serve
```

開 http://localhost:8765 即可。

## 重新抓 POI 資料（半年/一年一次）

OSM 資料會持續更新（新店家、新公園），但 `data/pois.json` 是預先打包的快照。要更新：

```bash
node scripts/fetch-pois.mjs
```

- 約 15-25 分鐘抓完 109 站
- 支援續傳（中斷重跑會跳過已完成的）
- 失敗的站不會寫入，下次跑會自動重試
- 會用三個 Overpass 鏡像分流避免 rate limit

抓完直接重新部署 Netlify 即可。

## 資料來源與限制

- **站點清單**：來自 OpenStreetMap (ODbL)，五大線 109 站（不含環狀線、機捷、輕軌）
- **POI 資料**：[Overpass API](https://overpass-turbo.eu/) 抓 OSM 標記，800m 半徑
- **運量資料**：臺北捷運公司公開[各站每日進出量 ODS](https://www.metro.taipei/cp.aspx?n=FF31501BEBDD0136)，每月聚合
- **Decor 對照表**：`data/decor-mapping.json`，**社群觀察推測**（Niantic 沒公開官方分類，confidence 標 low 的代表不確定）

實際遊玩可能與本表有出入，要修對照表直接編 `data/decor-mapping.json` 即可。

## 授權與聲明

- 程式碼：MIT License（見 [LICENSE](LICENSE)）
- POI / 站點資料：**OpenStreetMap (ODbL)** © OSM contributors
- 運量資料：**臺北大眾捷運股份有限公司**（公開資料）
- 底圖：**CARTO Voyager** © OpenStreetMap, © CARTO

**Pikmin Bloom 為任天堂 / Niantic 商標**。本工具為玩家社群非商業性輔助攻略，非官方產品，不附帶任何遊戲資源或檔案。Decor 對照表為社群觀察推測，可能與遊戲實際分類有差異，不代表 Niantic 官方立場。

## 技術棧

- 純前端：HTML + CSS + Vanilla JS
- 地圖：[Leaflet](https://leafletjs.com/) + CARTO 暗色底圖
- LLM：Google Gemini / OpenAI GPT-5（前端直連）
- 資料抓取：Node.js script + Overpass API

## 重新抓運量資料

`data/ridership.json` 是 12 個月各站進出量快照。半年/年更新一次：

```bash
node scripts/fetch-ridership.mjs
```

從 [metro.taipei 官方下載 ODS](https://www.metro.taipei/cp.aspx?n=FF31501BEBDD0136) 並解析。

## Roadmap

- ✅ **Phase 1**：站點 × Decor 查詢
- ✅ **Phase 2**：路線規劃（起終點 + 步行 + Decor 圖層 + LLM 導覽）
- ✅ **Phase 3**：運量整合（人潮指數 + sparkline + 路線整段運量分析）
- ✅ **Phase 4**：散步圈 + 限時模式
- ✅ 手機 RWD
- ⏳ **後續構想**：跨年度同期比較、平日 vs 假日、多途經點 A→B→C→A、Decor 圖鑑進度追蹤
