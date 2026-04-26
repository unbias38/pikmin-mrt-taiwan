// 台北捷運 × Pikmin Bloom 攻略地圖
// Pure vanilla JS — no build step needed.

const STORAGE_KEY = 'pikmin-mrt-settings';

const MODELS = {
  gemini: [
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview（快、便宜）' },
    { value: 'gemini-3-pro-preview',   label: 'gemini-3-pro-preview（深度分析）' }
  ],
  openai: [
    { value: 'gpt-5-mini', label: 'gpt-5-mini（推薦）' },
    { value: 'gpt-5',      label: 'gpt-5（最強）' },
    { value: 'gpt-5-nano', label: 'gpt-5-nano（最快）' }
  ]
};

const KEY_LINKS = {
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys'
};

// ─────────── 全域狀態 ───────────
const state = {
  stations: [],
  mapping: null,
  pois: null,
  poisAvailable: false,
  selectedStation: null,
  map: null,
  markers: new Map(), // stationId → marker
  settings: loadSettings()
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultSettings();
  } catch { return defaultSettings(); }
}
function defaultSettings() {
  return { provider: 'gemini', model: 'gemini-3-flash-preview', apiKey: '', remember: true };
}
function saveSettings() {
  if (state.settings.remember) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ─────────── 初始化 ───────────
async function init() {
  await loadData();
  initMap();
  initStationPicker();
  initSettings();
  initAi();
}

async function loadData() {
  const status = document.getElementById('dataStatus');
  status.textContent = '載入中...';

  state.stations = await fetch('data/stations.json').then(r => r.json());
  state.mapping  = await fetch('data/decor-mapping.json').then(r => r.json());

  await refreshPois();
  startPoisPolling();
}

async function refreshPois() {
  try {
    const fresh = await fetch('data/pois.json?t=' + Date.now()).then(r => {
      if (!r.ok) throw new Error('POI 檔尚未生成');
      return r.json();
    });
    const before = Object.keys(state.pois || {}).length;
    state.pois = fresh;
    state.poisAvailable = true;
    updateDataStatus();
    // 新站抓進來 + 使用者選的站剛好是新抓的 → 重畫
    const after = Object.keys(fresh).length;
    if (after > before && state.selectedStation && fresh[state.selectedStation.id]) {
      renderStationInfo(state.selectedStation);
      renderDecorList(state.selectedStation);
    }
  } catch (e) {
    state.pois = state.pois || {};
    state.poisAvailable = false;
    updateDataStatus();
  }
}

function updateDataStatus() {
  const status = document.getElementById('dataStatus');
  const total = state.stations.length;
  const done = Object.keys(state.pois || {}).length;
  if (done === 0) {
    status.textContent = `⏳ POI 資料抓取中... 剛開始，請稍候`;
  } else if (done < total) {
    const pct = Math.round(done / total * 100);
    const remainMin = Math.ceil((total - done) * 6 / 60);  // ~6s/站
    status.textContent = `⏳ POI 抓取中 ${done}/${total}（${pct}%）剩約 ${remainMin} 分鐘`;
  } else {
    status.textContent = `✅ ${total} 站、${done} 站 POI 全部就緒`;
    stopPoisPolling();
  }
}

let pollingTimer = null;
function startPoisPolling() {
  if (pollingTimer) return;
  pollingTimer = setInterval(refreshPois, 15000);
}
function stopPoisPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}

// ─────────── 地圖 ───────────
function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView([25.0478, 121.5170], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    maxZoom: 19
  }).addTo(state.map);

  state.stations.forEach(s => {
    const color = s.lines[0].color;
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 6,
      fillColor: color,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    });
    marker.bindTooltip(`${s.name} (${s.lines.map(l => l.ref).join('/')})`, { direction: 'top' });
    marker.on('click', () => selectStation(s));
    marker.addTo(state.map);
    state.markers.set(s.id, marker);
  });
}

// ─────────── 站點選擇器 ───────────
function initStationPicker() {
  const datalist = document.getElementById('stationList');
  state.stations.forEach(s => {
    const opt = document.createElement('option');
    opt.value = `${s.name} (${s.lines.map(l => l.ref).join('/')})`;
    opt.dataset.id = s.id;
    datalist.appendChild(opt);
  });

  const input = document.getElementById('stationSelect');
  const tryMatch = (v) => {
    return state.stations.find(x =>
      v === `${x.name} (${x.lines.map(l => l.ref).join('/')})` || v === x.name
    );
  };
  input.addEventListener('input', (e) => {
    const s = tryMatch(e.target.value);
    if (s) { selectStation(s); input.blur(); }
  });
  input.addEventListener('focus', (e) => e.target.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); }
  });
}

function selectStation(s) {
  state.selectedStation = s;
  document.getElementById('stationSelect').value = `${s.name} (${s.lines.map(l => l.ref).join('/')})`;

  // 高亮地圖
  state.markers.forEach(m => m.setStyle({ radius: 6, weight: 2 }));
  const m = state.markers.get(s.id);
  m.setStyle({ radius: 11, weight: 3 });
  state.map.flyTo([s.lat, s.lon], 15, { duration: 0.5 });

  renderStationInfo(s);
  renderDecorList(s);
  resetAiOutput();
}

function renderStationInfo(s) {
  const el = document.getElementById('stationInfo');
  el.classList.remove('hidden');
  document.getElementById('stationName').textContent = s.name;

  const lines = document.getElementById('stationLines');
  lines.innerHTML = s.lines.map(l =>
    `<span class="line-badge" style="--line-color:${l.color}">${l.ref}</span>`
  ).join('');

  const poiData = state.pois[s.id];
  document.getElementById('poiCount').textContent  = poiData?.count ?? '—';
  document.getElementById('decorCount').textContent = poiData ? Object.keys(poiData.summary).length : '—';
}

function renderDecorList(s) {
  const el = document.getElementById('decorList');
  const poiData = state.pois[s.id];

  if (!poiData) {
    const total = state.stations.length;
    const done = Object.keys(state.pois || {}).length;
    const remainMin = Math.ceil((total - done) * 6 / 60);
    el.innerHTML = `
      <div style="grid-column:1/-1;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:18px;text-align:center;">
        <div style="font-size:32px;margin-bottom:10px;">⏳</div>
        <div style="font-size:14px;color:var(--text-1);font-weight:600;margin-bottom:6px;">${s.name}站的 POI 還在抓</div>
        <div style="font-size:12px;color:var(--text-2);line-height:1.6;">
          目前進度 ${done}/${total} 站，預估剩 ${remainMin} 分鐘<br>
          抓到後會自動顯示，先試試已抓好的站
        </div>
      </div>`;
    document.getElementById('aiPanel').classList.add('hidden');
    return;
  }

  // 加入站本身的 station decor（捷運站本來就會給 station Decor）
  const summary = { station: 1, ...poiData.summary };

  // 排序：高 confidence 優先 + POI 多優先
  const items = Object.entries(summary)
    .map(([decor, count]) => ({ decor, count, meta: state.mapping.decorTypes[decor] }))
    .filter(x => x.meta)
    .sort((a, b) => {
      const conf = { high: 0, medium: 1, low: 2 };
      const c = conf[a.meta.confidence] - conf[b.meta.confidence];
      return c !== 0 ? c : b.count - a.count;
    });

  el.innerHTML = items.map(({ decor, count, meta }) => `
    <div class="decor-card confidence-${meta.confidence}" data-conf="${meta.confidence}" data-decor="${decor}" title="${meta.note || ''}（點擊在地圖上顯示）">
      <span class="decor-emoji">${meta.emoji}</span>
      <div class="decor-info">
        <div class="decor-name">${meta.zh}</div>
        <div class="decor-count">${count} 個 POI</div>
      </div>
    </div>
  `).join('');

  // 點 card 在地圖上顯示該類別 POI
  el.querySelectorAll('.decor-card').forEach(card => {
    card.addEventListener('click', () => togglePoiLayer(card.dataset.decor));
  });

  document.getElementById('aiPanel').classList.remove('hidden');
  clearPoiLayer();
}

function clearPoiLayer() {
  state.activeLayers?.forEach(layer => state.map.removeLayer(layer));
  state.activeLayers = new Map();
  document.querySelectorAll('.decor-card.active').forEach(c => c.classList.remove('active'));
}

function togglePoiLayer(decor) {
  if (!state.activeLayers) state.activeLayers = new Map();

  if (state.activeLayers.has(decor)) {
    state.map.removeLayer(state.activeLayers.get(decor));
    state.activeLayers.delete(decor);
    document.querySelector(`.decor-card[data-decor="${decor}"]`)?.classList.remove('active');
    return;
  }

  const poiData = state.pois[state.selectedStation.id];
  if (!poiData) return;
  const meta = state.mapping.decorTypes[decor];
  const list = poiData.pois.filter(p => p.decor === decor);
  if (!list.length) return;

  const markers = list.map(p =>
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        html: `<div class="poi-pin"><span>${meta.emoji}</span></div>`,
        className: 'poi-pin-wrap',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      })
    }).bindTooltip(p.name || '(無名稱)', { direction: 'top', offset: [0, -20] })
  );
  const layer = L.layerGroup(markers).addTo(state.map);
  state.activeLayers.set(decor, layer);
  document.querySelector(`.decor-card[data-decor="${decor}"]`)?.classList.add('active');
}

function resetAiOutput() {
  document.getElementById('aiOutput').innerHTML =
    '<p class="hint">點「生成攻略」讓 AI 推薦這站的散步路線、推薦時段、Decor 收集重點。</p>';
}

// ─────────── 設定 Modal ───────────
function initSettings() {
  document.getElementById('settingsBtn').onclick = openSettings;
  document.getElementById('closeSettings').onclick = closeSettings;
  document.getElementById('saveSettings').onclick = saveSettingsHandler;
  document.getElementById('clearKey').onclick = clearKeyHandler;

  document.getElementById('providerSelect').onchange = (e) => {
    populateModels(e.target.value);
    document.getElementById('getKeyLink').href = KEY_LINKS[e.target.value];
  };
}

function openSettings() {
  const { provider, model, apiKey, remember } = state.settings;
  document.getElementById('providerSelect').value = provider;
  populateModels(provider, model);
  document.getElementById('apiKeyInput').value = apiKey;
  document.getElementById('rememberKey').checked = remember;
  document.getElementById('getKeyLink').href = KEY_LINKS[provider];
  document.getElementById('settingsModal').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}
function populateModels(provider, currentModel) {
  const sel = document.getElementById('modelSelect');
  sel.innerHTML = MODELS[provider].map(m =>
    `<option value="${m.value}" ${m.value === currentModel ? 'selected' : ''}>${m.label}</option>`
  ).join('');
}
function saveSettingsHandler() {
  state.settings = {
    provider: document.getElementById('providerSelect').value,
    model:    document.getElementById('modelSelect').value,
    apiKey:   document.getElementById('apiKeyInput').value.trim(),
    remember: document.getElementById('rememberKey').checked
  };
  saveSettings();
  closeSettings();
}
function clearKeyHandler() {
  localStorage.removeItem(STORAGE_KEY);
  state.settings = defaultSettings();
  openSettings();
}

// ─────────── AI 攻略 ───────────
function initAi() {
  document.getElementById('generateBtn').onclick = generateInsight;
}

async function generateInsight() {
  const s = state.selectedStation;
  if (!s) return;
  const poiData = state.pois[s.id];
  if (!poiData) return;

  const { apiKey, provider, model } = state.settings;
  if (!apiKey) {
    alert('請先到「⚙️ 設定」填入 API Key');
    openSettings();
    return;
  }

  const btn = document.getElementById('generateBtn');
  const out = document.getElementById('aiOutput');
  btn.disabled = true;
  out.innerHTML = '<span class="spinner"></span> 分析中...';

  try {
    const prompt = buildPrompt(s, poiData);
    const text = await callLLM(provider, model, apiKey, prompt);
    out.textContent = text;
  } catch (e) {
    out.innerHTML = `<p style="color:var(--pikmin-red)">❌ ${e.message}</p>
      <p class="hint">檢查 API Key 是否正確，或網路是否通。</p>`;
  } finally {
    btn.disabled = false;
  }
}

function buildPrompt(s, poiData) {
  const summary = { station: 1, ...poiData.summary };
  const decorList = Object.entries(summary)
    .map(([d, c]) => {
      const m = state.mapping.decorTypes[d];
      return m ? `${m.emoji} ${m.zh}：${c} 個` : null;
    })
    .filter(Boolean)
    .join('\n');

  return `你是 Pikmin Bloom（皮克敏 Bloom）的散步達人，幫玩家規劃在台北捷運站附近散步的攻略。

【目標站】${s.name}站（${s.lines.map(l => l.name + ' ' + l.ref).join('、')}）
【範圍】800m 內
【可拿 Decor 類別與對應 POI 數】
${decorList}

請用繁體中文，給出簡潔有用的攻略，包含：

## 一、本站亮點
（這站值不值得專程來？最稀有 / 最有特色的 Decor 是哪幾種？）

## 二、推薦散步路線
（建議 30 分鐘內可以走完的路線方向，例如「往北走可拿到較多咖啡，往南偏餐廳」）

## 三、最佳時段
（早上/中午/晚上各有什麼適合的目標）

## 四、注意事項
（避開人潮的建議、或需要特別注意的事）

風格要像一個熟識台北街頭的玩家朋友，不要太正經。控制在 400 字內。`;
}

async function callLLM(provider, model, key, prompt) {
  if (provider === 'gemini') return callGemini(model, key, prompt);
  if (provider === 'openai') return callOpenAI(model, key, prompt);
  throw new Error('未知 provider: ' + provider);
}

async function callGemini(model, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 回傳空白');
  return text;
}

async function callOpenAI(model, key, prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 1200
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 回傳空白');
  return text;
}

// ─────────── 排行 Modal ───────────
function buildRankings() {
  // rankings[decor] = [{ stationId, name, count, lines }, ...] desc
  const rankings = {};
  state.stations.forEach(station => {
    const poiData = state.pois[station.id];
    if (!poiData) return;
    Object.entries(poiData.summary).forEach(([decor, count]) => {
      if (!rankings[decor]) rankings[decor] = [];
      rankings[decor].push({ stationId: station.id, name: station.name, count, lines: station.lines });
    });
  });
  Object.values(rankings).forEach(arr => arr.sort((a, b) => b.count - a.count));
  return rankings;
}

function openRankingModal() {
  if (!state.rankings) state.rankings = buildRankings();

  const list = document.getElementById('rankingDecorList');
  const decorTypes = state.mapping.decorTypes;

  // 排序：稀有度（站數少）優先，相同站數比 confidence
  const rows = Object.keys(decorTypes)
    .map(d => ({
      decor: d,
      meta: decorTypes[d],
      stationCount: state.rankings[d]?.length || 0,
      total: state.rankings[d]?.reduce((s, x) => s + x.count, 0) || 0
    }))
    .sort((a, b) => {
      // 0 站排到最後
      if (a.stationCount === 0 && b.stationCount > 0) return 1;
      if (b.stationCount === 0 && a.stationCount > 0) return -1;
      return a.stationCount - b.stationCount || b.total - a.total;
    });

  list.innerHTML = rows.map(r => {
    const cls = r.stationCount === 0 ? 'no-data' :
                r.stationCount === 1 ? 'exclusive' :
                r.stationCount <= 5 ? 'rare' : '';
    return `<div class="ranking-decor-row ${cls}" data-decor="${r.decor}">
      <span class="emoji">${r.meta.emoji}</span>
      <span class="name">${r.meta.zh}</span>
      <span class="station-count">${r.stationCount} 站</span>
    </div>`;
  }).join('');

  list.querySelectorAll('.ranking-decor-row').forEach(row => {
    row.onclick = () => showRankingFor(row.dataset.decor);
  });

  document.getElementById('rankingModal').classList.remove('hidden');
}

function showRankingFor(decor) {
  const meta = state.mapping.decorTypes[decor];
  const list = state.rankings[decor] || [];
  document.querySelectorAll('.ranking-decor-row').forEach(r =>
    r.classList.toggle('active', r.dataset.decor === decor));

  const right = document.getElementById('rankingStationList');
  if (!list.length) {
    right.innerHTML = `<h3>${meta.emoji} ${meta.zh}</h3>
      <div class="summary-line">沒有任何站在 800m 內偵測到此類別</div>`;
    return;
  }

  const totalPoi = list.reduce((s, x) => s + x.count, 0);
  const summaryNote = list.length === 1 ? `🔥 全網獨家！只有 1 站有` :
                      list.length <= 5 ? `稀有：全網僅 ${list.length} 站有` :
                      `共 ${list.length} 站有，總計 ${totalPoi} 個 POI`;

  right.innerHTML = `<h3>${meta.emoji} ${meta.zh}</h3>
    <div class="summary-line">${summaryNote}${meta.confidence !== 'high' ? ` · ⚠ 推測對應` : ''}</div>
    <div>${list.slice(0, 25).map((s, i) => {
      const rankCls = i === 0 ? 'top1' : i < 3 ? 'top3' : '';
      const lines = s.lines.map(l => `<span class="line-badge" style="--line-color:${l.color}">${l.ref}</span>`).join('');
      return `<div class="station-rank-row" data-id="${s.stationId}">
        <span class="rank ${rankCls}">${i + 1}.</span>
        <span class="station-name">${s.name}</span>
        <span class="lines">${lines}</span>
        <span class="count">${s.count}</span>
      </div>`;
    }).join('')}</div>`;

  right.querySelectorAll('.station-rank-row').forEach(row => {
    row.onclick = () => {
      const station = state.stations.find(s => s.id === row.dataset.id);
      if (station) {
        document.getElementById('rankingModal').classList.add('hidden');
        selectStation(station);
      }
    };
  });
}

function initRanking() {
  document.getElementById('rankingBtn').onclick = openRankingModal;
  document.getElementById('closeRanking').onclick = () =>
    document.getElementById('rankingModal').classList.add('hidden');
}

// ─────────── 啟動 ───────────
init().then(initRanking);
