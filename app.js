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
  try {
    state.ridership = await fetch('data/ridership.json').then(r => r.json());
    computeRidershipStats();
  } catch (e) {
    state.ridership = null;
  }

  await refreshPois();
  startPoisPolling();
}

// 計算全網運量分布（用最近月份），排序後算 percentile
function computeRidershipStats() {
  if (!state.ridership) return;
  const months = state.ridership._meta.months;
  const latest = months[months.length - 1];
  const all = [];
  Object.entries(state.ridership.stations).forEach(([name, m]) => {
    const monthly = m[latest];
    if (monthly?.entries) all.push({ name, entries: monthly.entries });
  });
  all.sort((a, b) => b.entries - a.entries);
  const ranks = new Map();
  all.forEach((s, i) => ranks.set(s.name, { rank: i + 1, percentile: (i + 1) / all.length }));
  state.ridershipStats = {
    latest,
    ranks,
    total: all.length,
    avgEntries: all.reduce((s, x) => s + x.entries, 0) / all.length
  };
}

// 5 級人潮指數
function crowdLevel(percentile) {
  if (percentile <= 0.20) return { level: 5, label: '🔥 熱門尖峰', color: '#ef4444' };
  if (percentile <= 0.40) return { level: 4, label: '🔥 人潮較多', color: '#f59e0b' };
  if (percentile <= 0.60) return { level: 3, label: '⚖️ 人潮中等', color: '#94a3b8' };
  if (percentile <= 0.80) return { level: 2, label: '🌿 人潮偏少', color: '#10b981' };
  return                       { level: 1, label: '💎 冷門好站', color: '#22d3ee' };
}

// Sparkline SVG（不依賴函式庫）
function renderSparkline(values, w = 200, h = 36, color = '#10b981') {
  if (!values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = h - ((last - min) / range) * (h - 4) - 2;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${color}"/>
  </svg>`;
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

  // 800m 範圍圈
  if (state.rangeCircle) state.map.removeLayer(state.rangeCircle);
  state.rangeCircle = L.circle([s.lat, s.lon], {
    radius: 800,
    color: '#10b981',
    weight: 2,
    opacity: 0.7,
    fillColor: '#10b981',
    fillOpacity: 0.05,
    dashArray: '6 4',
    interactive: false
  }).addTo(state.map);

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

  renderRidershipBlock(s);
}

function renderRidershipBlock(s) {
  const el = document.getElementById('ridershipBlock');
  if (!el) return;
  const stat = state.ridership?.stations?.[s.name];
  const meta = state.ridership?._meta;
  if (!stat || !meta) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const months = meta.months;
  const monthly = months.map(m => stat[m]?.entries || 0);
  const latest = monthly[monthly.length - 1];
  const avg = monthly.reduce((s, v) => s + v, 0) / monthly.length;
  const rankInfo = state.ridershipStats?.ranks.get(s.name);
  const crowd = rankInfo ? crowdLevel(rankInfo.percentile) : null;

  el.innerHTML = `
    <div class="ridership-header">
      <span class="ridership-title">📈 月運量趨勢（近 ${months.length} 個月）</span>
      ${crowd ? `<span class="crowd-badge" style="background:${crowd.color}20;color:${crowd.color}">${crowd.label}</span>` : ''}
    </div>
    <div class="ridership-stats">
      <div><span class="r-num">${(latest / 1000000).toFixed(2)}</span><span class="r-unit">M 進站（${months[months.length-1].slice(0,4)}/${months[months.length-1].slice(4)}）</span></div>
      <div><span class="r-num">${(avg / 1000000).toFixed(2)}</span><span class="r-unit">M 月平均</span></div>
      ${rankInfo ? `<div><span class="r-num">#${rankInfo.rank}</span><span class="r-unit">/ ${state.ridershipStats.total} 站排名</span></div>` : ''}
    </div>
    <div class="ridership-spark" title="${months.map((m,i)=>`${m.slice(0,4)}/${m.slice(4)}: ${(monthly[i]/1000000).toFixed(2)}M`).join('\n')}">
      ${renderSparkline(monthly, 280, 40, crowd?.color || '#10b981')}
    </div>
  `;
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

  const markers = list.map(p => {
    const name = p.name || '(無名稱地點)';
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + p.lat + ',' + p.lon)}`;
    const osmUrl = `https://www.openstreetmap.org/${p.type}/${p.id}`;
    const detailRows = [
      p.addr   ? `<div class="poi-popup-row">🏠 ${escapeHtml(p.addr)}</div>` : '',
      p.brand  ? `<div class="poi-popup-row">🏷️ ${escapeHtml(p.brand)}</div>` : '',
      p.cuisine? `<div class="poi-popup-row">🍽️ ${escapeHtml(p.cuisine)}</div>` : '',
      p.hours  ? `<div class="poi-popup-row">🕐 ${escapeHtml(p.hours)}</div>` : '',
      p.phone  ? `<div class="poi-popup-row">📞 <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a></div>` : '',
      p.web    ? `<div class="poi-popup-row">🌐 <a href="${escapeHtml(p.web)}" target="_blank" rel="noopener">官網</a></div>` : ''
    ].filter(Boolean).join('');
    const popupHtml = `
      <div class="poi-popup">
        <div class="poi-popup-header">
          <span class="poi-popup-emoji">${meta.emoji}</span>
          <div>
            <div class="poi-popup-name">${escapeHtml(name)}</div>
            <div class="poi-popup-decor">${meta.zh} Decor</div>
          </div>
        </div>
        ${detailRows ? `<div class="poi-popup-details">${detailRows}</div>` : ''}
        <div class="poi-popup-coord">📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
        <div class="poi-popup-actions">
          <a href="${gmapsUrl}" target="_blank" rel="noopener" class="poi-popup-btn primary">在 Google Maps 開啟</a>
          <a href="${osmUrl}" target="_blank" rel="noopener" class="poi-popup-btn">OSM 原始資料</a>
        </div>
      </div>`;
    return L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        html: `<div class="poi-pin"><span>${meta.emoji}</span></div>`,
        className: 'poi-pin-wrap',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      })
    })
    .bindTooltip(name, { direction: 'top', offset: [0, -22] })
    .bindPopup(popupHtml, { className: 'poi-popup-wrap', maxWidth: 280 });
  });
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
    out.innerHTML = renderMarkdown(text);
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

  // 運量資訊
  let ridershipInfo = '';
  const rstat = state.ridership?.stations?.[s.name];
  const rmeta = state.ridership?._meta;
  const rankInfo = state.ridershipStats?.ranks.get(s.name);
  if (rstat && rmeta && rankInfo) {
    const months = rmeta.months;
    const latest = months[months.length - 1];
    const monthly = months.map(m => rstat[m]?.entries || 0);
    const latestVal = monthly[monthly.length - 1];
    const avg = monthly.reduce((s, v) => s + v, 0) / monthly.length;
    const crowd = crowdLevel(rankInfo.percentile);
    ridershipInfo = `
【人潮資訊】
- 最近月份（${latest.slice(0,4)}/${latest.slice(4)}）進站 ${(latestVal/1000000).toFixed(2)}M 人次
- 近 ${months.length} 個月平均 ${(avg/1000000).toFixed(2)}M 人次
- 全網運量排名 #${rankInfo.rank} / ${state.ridershipStats.total}（${crowd.label.replace(/^[^\\u4e00-\\u9fa5]+/, '')}）
`;
  }

  return `你是 Pikmin Bloom（皮克敏 Bloom）的散步達人，幫玩家規劃在台北捷運站附近散步的攻略。

【目標站】${s.name}站（${s.lines.map(l => l.name + ' ' + l.ref).join('、')}）
【範圍】800m 內
【可拿 Decor 類別與對應 POI 數】
${decorList}
${ridershipInfo}

請用繁體中文，給出簡潔有用的攻略，包含：

## 一、本站亮點
（這站值不值得專程來？最稀有 / 最有特色的 Decor 是哪幾種？人潮特性如何？）

## 二、推薦散步路線
（建議 30 分鐘內可以走完的路線方向，例如「往北走可拿到較多咖啡，往南偏餐廳」）

## 三、最佳時段
（基於人潮資訊：早上/中午/晚上哪個時段最舒服？要避開尖峰嗎？）

## 四、注意事項
（避開人潮的具體建議、或需要特別注意的事）

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
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
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
      max_completion_tokens: 8000
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 回傳空白');
  return text;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 簡易 Markdown → HTML（支援標題、粗體、斜體、清單、段落）
function renderMarkdown(text) {
  let html = escapeHtml(text);
  // 標題
  html = html.replace(/^####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
  // 粗體 / 斜體
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // 清單：連續 - 或 * 起首的行包成 <ul>
  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.+)$/);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
    }
  }
  if (inList) out.push('</ul>');
  // 把連續空行視為段落分隔，其它換行保留
  return out.join('\n')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<p>(\s*<(h[2-6]|ul)>)/g, '$1')
    .replace(/(<\/(h[2-6]|ul)>\s*)<\/p>/g, '$1');
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

// ─────────── 路線規劃模式 ───────────
const ROUTE_BUFFER_M = 400;

function initModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });
}

function switchMode(mode) {
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('stationMode').classList.toggle('hidden', mode !== 'station');
  document.getElementById('routeMode').classList.toggle('hidden', mode !== 'route');
  state.mode = mode;
  // 切到路線模式時清掉單站圈圈、Decor pin
  if (mode === 'route') {
    if (state.rangeCircle) { state.map.removeLayer(state.rangeCircle); state.rangeCircle = null; }
    clearPoiLayer();
  } else {
    clearRoute();
    if (state.selectedStation) selectStation(state.selectedStation);
  }
}

function initRoutePicker() {
  const tryMatchRoute = (v) => state.stations.find(x =>
    v === `${x.name} (${x.lines.map(l => l.ref).join('/')})` || v === x.name);
  ['routeOrigin', 'routeDest'].forEach(id => {
    const inp = document.getElementById(id);
    inp.addEventListener('focus', e => e.target.select());
  });
  document.getElementById('planRouteBtn').onclick = planRoute;
}

async function planRoute() {
  const tryMatch = v => state.stations.find(x =>
    v === `${x.name} (${x.lines.map(l => l.ref).join('/')})` || v === x.name);
  const origin = tryMatch(document.getElementById('routeOrigin').value);
  const dest   = tryMatch(document.getElementById('routeDest').value);
  if (!origin || !dest) { alert('請選擇有效的起點與終點'); return; }
  if (origin.id === dest.id) { alert('起點與終點不能相同'); return; }

  const btn = document.getElementById('planRouteBtn');
  btn.disabled = true;
  btn.textContent = '計算中...';
  try {
    const route = await fetchOSRMRoute(origin, dest);
    state.route = { origin, dest, ...route };
    state.route.buffered = filterPoisInBuffer(route.geometry, ROUTE_BUFFER_M);
    renderRoute();
  } catch (e) {
    alert('路線計算失敗：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '規劃步行路線';
  }
}

async function fetchOSRMRoute(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/foot/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error(data.message || '找不到路徑');
  const r = data.routes[0];
  // OSRM demo server foot profile 給的時間其實是車速，自己用 1.4 m/s ≈ 5km/h 換算
  const walkingDuration = r.distance / 1.4;
  return { geometry: r.geometry, distance: r.distance, duration: walkingDuration };
}

// 取得去重後的全網 POI 清單（cache）
function getAllPois() {
  if (state._allPoisCache) return state._allPoisCache;
  const seen = new Set();
  const all = [];
  Object.values(state.pois).forEach(s => {
    s.pois.forEach(p => {
      const key = `${p.type}-${p.id}`;
      if (!seen.has(key)) { seen.add(key); all.push(p); }
    });
  });
  state._allPoisCache = all;
  return all;
}

// Haversine 距離（公尺）
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 對 GeoJSON LineString，取每點到 POI 最小距離
function minDistanceToLine(poi, coords) {
  let min = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i];
    const d = haversineM(poi.lat, poi.lon, lat, lon);
    if (d < min) min = d;
    if (min < 50) return min; // 早結束
  }
  return min;
}

function filterPoisInBuffer(geometry, bufferM) {
  const coords = geometry.coordinates; // [[lon,lat], ...]
  // 先用 bbox 粗篩
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  coords.forEach(([lon, lat]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });
  // 緯度 1 度 ≈ 111km，bufferM 換算
  const dLat = bufferM / 111000;
  const dLon = bufferM / (111000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180));
  minLat -= dLat; maxLat += dLat; minLon -= dLon; maxLon += dLon;

  const all = getAllPois();
  const inBox = all.filter(p =>
    p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon);

  const inBuffer = inBox.filter(p => minDistanceToLine(p, coords) <= bufferM);
  const summary = {};
  inBuffer.forEach(p => { summary[p.decor] = (summary[p.decor] || 0) + 1; });
  return { pois: inBuffer, summary };
}

function clearRoute() {
  if (state.routeLayer) { state.map.removeLayer(state.routeLayer); state.routeLayer = null; }
  if (state.routeMarkersLayer) { state.map.removeLayer(state.routeMarkersLayer); state.routeMarkersLayer = null; }
  state.routeActiveLayers?.forEach(l => state.map.removeLayer(l));
  state.routeActiveLayers = new Map();
  document.getElementById('routeStats').classList.add('hidden');
  document.getElementById('routeAiPanel').classList.add('hidden');
  document.getElementById('routeDecorList').innerHTML = '';
  document.getElementById('routeAiOutput').innerHTML = '<p class="hint">規劃路線後，點「生成攻略」讓 AI 寫沿路導覽、必停的稀有 Decor、推薦時段。</p>';
}

function renderRoute() {
  clearRoute();
  const { geometry, distance, duration, buffered, origin, dest } = state.route;

  // 路線線條
  state.routeLayer = L.geoJSON(geometry, {
    style: { color: '#10b981', weight: 5, opacity: 0.85 }
  }).addTo(state.map);

  // 端點 marker
  const endpointStyle = (color) => L.circleMarker([0,0], {
    radius: 9, fillColor: color, color: '#fff', weight: 3, fillOpacity: 1
  });
  state.routeMarkersLayer = L.layerGroup([
    L.circleMarker([origin.lat, origin.lon], { radius: 9, fillColor: '#34d399', color: '#fff', weight: 3, fillOpacity: 1 })
      .bindTooltip(`起點：${origin.name}`, { direction: 'top' }),
    L.circleMarker([dest.lat, dest.lon], { radius: 9, fillColor: '#ef4444', color: '#fff', weight: 3, fillOpacity: 1 })
      .bindTooltip(`終點：${dest.name}`, { direction: 'top' })
  ]).addTo(state.map);

  // 縮放到路線範圍
  state.map.fitBounds(state.routeLayer.getBounds(), { padding: [50, 50] });

  // 統計數字
  const km   = (distance / 1000).toFixed(2);
  const min  = Math.round(duration / 60);
  const steps = Math.round(distance * 1.3);
  document.getElementById('routeDistance').textContent = km;
  document.getElementById('routeDuration').textContent = min;
  document.getElementById('routeSteps').textContent = steps.toLocaleString();
  document.getElementById('routeDecorTypes').textContent = Object.keys(buffered.summary).length;
  document.getElementById('routeStats').classList.remove('hidden');

  renderRouteDecorList(buffered.summary);
  document.getElementById('routeAiPanel').classList.remove('hidden');
}

function renderRouteDecorList(summary) {
  const el = document.getElementById('routeDecorList');
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

  el.querySelectorAll('.decor-card').forEach(card => {
    card.addEventListener('click', () => toggleRoutePoiLayer(card.dataset.decor));
  });
}

function toggleRoutePoiLayer(decor) {
  if (!state.routeActiveLayers) state.routeActiveLayers = new Map();
  if (state.routeActiveLayers.has(decor)) {
    state.map.removeLayer(state.routeActiveLayers.get(decor));
    state.routeActiveLayers.delete(decor);
    document.querySelector(`#routeDecorList .decor-card[data-decor="${decor}"]`)?.classList.remove('active');
    return;
  }
  const meta = state.mapping.decorTypes[decor];
  const list = state.route.buffered.pois.filter(p => p.decor === decor);
  if (!list.length) return;

  const markers = list.map(p => {
    const name = p.name || '(無名稱地點)';
    const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + p.lat + ',' + p.lon)}`;
    const osmUrl = `https://www.openstreetmap.org/${p.type}/${p.id}`;
    const detailRows = [
      p.addr   ? `<div class="poi-popup-row">🏠 ${escapeHtml(p.addr)}</div>` : '',
      p.brand  ? `<div class="poi-popup-row">🏷️ ${escapeHtml(p.brand)}</div>` : '',
      p.cuisine? `<div class="poi-popup-row">🍽️ ${escapeHtml(p.cuisine)}</div>` : '',
      p.hours  ? `<div class="poi-popup-row">🕐 ${escapeHtml(p.hours)}</div>` : '',
      p.phone  ? `<div class="poi-popup-row">📞 <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a></div>` : '',
      p.web    ? `<div class="poi-popup-row">🌐 <a href="${escapeHtml(p.web)}" target="_blank" rel="noopener">官網</a></div>` : ''
    ].filter(Boolean).join('');
    const popupHtml = `
      <div class="poi-popup">
        <div class="poi-popup-header">
          <span class="poi-popup-emoji">${meta.emoji}</span>
          <div>
            <div class="poi-popup-name">${escapeHtml(name)}</div>
            <div class="poi-popup-decor">${meta.zh} Decor</div>
          </div>
        </div>
        ${detailRows ? `<div class="poi-popup-details">${detailRows}</div>` : ''}
        <div class="poi-popup-coord">📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
        <div class="poi-popup-actions">
          <a href="${gmapsUrl}" target="_blank" rel="noopener" class="poi-popup-btn primary">在 Google Maps 開啟</a>
          <a href="${osmUrl}" target="_blank" rel="noopener" class="poi-popup-btn">OSM 原始資料</a>
        </div>
      </div>`;
    return L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        html: `<div class="poi-pin"><span>${meta.emoji}</span></div>`,
        className: 'poi-pin-wrap',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      })
    })
    .bindTooltip(name, { direction: 'top', offset: [0, -22] })
    .bindPopup(popupHtml, { className: 'poi-popup-wrap', maxWidth: 280 });
  });
  const layer = L.layerGroup(markers).addTo(state.map);
  state.routeActiveLayers.set(decor, layer);
  document.querySelector(`#routeDecorList .decor-card[data-decor="${decor}"]`)?.classList.add('active');
}

// ─────────── 路線 AI 攻略 ───────────
function initRouteAi() {
  document.getElementById('generateRouteBtn').onclick = generateRouteInsight;
}

async function generateRouteInsight() {
  if (!state.route) return;
  const { apiKey, provider, model } = state.settings;
  if (!apiKey) { alert('請先到「⚙️ 設定」填入 API Key'); openSettings(); return; }

  const btn = document.getElementById('generateRouteBtn');
  const out = document.getElementById('routeAiOutput');
  btn.disabled = true;
  out.innerHTML = '<span class="spinner"></span> 分析中...';
  try {
    const prompt = buildRoutePrompt();
    const text = await callLLM(provider, model, apiKey, prompt);
    out.innerHTML = renderMarkdown(text);
  } catch (e) {
    out.innerHTML = `<p style="color:var(--pikmin-red)">❌ ${e.message}</p>`;
  } finally { btn.disabled = false; }
}

function buildRoutePrompt() {
  const { origin, dest, distance, duration, buffered } = state.route;
  const km = (distance / 1000).toFixed(2);
  const min = Math.round(duration / 60);
  const steps = Math.round(distance * 1.3);

  const decorList = Object.entries(buffered.summary)
    .sort((a, b) => b[1] - a[1])
    .map(([d, c]) => {
      const m = state.mapping.decorTypes[d];
      return m ? `${m.emoji} ${m.zh}：${c} 個` : null;
    })
    .filter(Boolean).join('\n');

  return `你是 Pikmin Bloom（皮克敏 Bloom）的散步達人，幫玩家規劃台北捷運站之間的步行散步攻略。

【路線】從 ${origin.name}站 走到 ${dest.name}站
【距離】${km} km，預計 ${min} 分鐘步行，約 ${steps.toLocaleString()} 步
【沿路 ${ROUTE_BUFFER_M}m 範圍內可拿到的 Decor】
${decorList}

請用繁體中文，給出有條理的散步攻略：

## 一、推薦走法
（路線該怎麼走最好玩？哪段建議彎進巷子、哪段直走？沿路有什麼值得關注的地段？）

## 二、必停亮點
（沿路最稀有 / 最有特色的 Decor 在哪一段？哪幾種值得專程繞一下拿到？）

## 三、最佳時段
（早上/中午/晚上各自適合走嗎？避開人潮的建議）

## 四、步數小目標
（${steps.toLocaleString()} 步適合搭配什麼 Pikmin 任務？）

風格：像熟識台北街頭的玩家朋友，不要太正經，務實。控制在 500 字內。`;
}

// ─────────── 啟動 ───────────
init().then(() => {
  initRanking();
  initModeTabs();
  initRoutePicker();
  initRouteAi();
});
