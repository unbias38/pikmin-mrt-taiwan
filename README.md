# 台北捷運 × Pikmin Bloom 攻略地圖

選一站 → 查 800m 內可拿哪些 Decor 皮克敏 → AI 給散步攻略。

## 線上部署（Netlify 手動上傳）

1. 把整個專案資料夾打包成 zip（或直接上傳資料夾）。**不需要** `node_modules`、`scripts/`、`data/_*.json`、`*.txt`、`*.log`，這些只是開發/原始素材。
2. 進 [Netlify](https://app.netlify.com/) → Sites → **Add new site** → **Deploy manually**。
3. 把 zip 拖進去，等 30 秒。會給你一個 `https://xxxx.netlify.app` 網址。
4. 開網址 → 點 **⚙️ 設定** → 填 API Key → 開玩。

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

- **站點清單**：來自 OpenStreetMap，五大線 109 站（不含環狀線、機捷、輕軌）
- **POI 資料**：[Overpass API](https://overpass-turbo.eu/) 抓 OSM 標記，800m 半徑
- **Decor 對照表**：`data/decor-mapping.json`，**社群觀察推測**（Niantic 沒公開官方分類，confidence 標 low 的代表不確定）

實際遊玩可能與本表有出入，要修對照表直接編 `data/decor-mapping.json` 即可。

## 技術棧

- 純前端：HTML + CSS + Vanilla JS
- 地圖：[Leaflet](https://leafletjs.com/) + CARTO 暗色底圖
- LLM：Google Gemini / OpenAI GPT-5（前端直連）
- 資料抓取：Node.js script + Overpass API

## Roadmap

- ✅ **Phase 1**：站點 × Decor 查詢（目前版本）
- ⏳ **Phase 2**：路線規劃（起終點 + 步行導航 + Decor 圖層）
- ⏳ **Phase 3**：整合捷運運量資料 → 「運量 × Pikmin 雙視角」（避開人潮 × 最大收穫）
