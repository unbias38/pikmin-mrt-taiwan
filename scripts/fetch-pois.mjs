#!/usr/bin/env node
// 用法：node scripts/fetch-pois.mjs <city>
// 批次抓指定城市每站 800m POI → data/<city>/pois.json
// 套用 decor-mapping 過濾，只留有 Decor 對應的 POI
// 可斷可續；FORCE=1 強制重抓

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RADIUS = 800;
const SLEEP_MS = 3000;
const RETRY_BACKOFF = [5000, 10000, 20000];
const TIMEOUT_S = 60;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const cityKey = process.argv[2];
if (!cityKey) {
  console.error('用法：node scripts/fetch-pois.mjs <taipei|taichung|kaohsiung>');
  process.exit(1);
}

const allStations = JSON.parse(fs.readFileSync(path.join(ROOT, `data/${cityKey}/stations.json`), 'utf8'));
const mapping     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decor-mapping.json'), 'utf8'));

// 排序優先級：1. 轉乘站  2. 玩家熟悉的核心站  3. 其他
const PRIORITY_NAMES = [
  '中山', '台北車站', '台北101/世貿', '西門', '東門', '忠孝復興', '忠孝敦化',
  '市政府', '國父紀念館', '信義安和', '大安', '科技大樓', '南京復興',
  '松江南京', '雙連', '民權西路', '士林', '劍潭', '淡水', '北投',
  '古亭', '中正紀念堂', '公館'
];
const priorityIdx = (name) => {
  const i = PRIORITY_NAMES.indexOf(name);
  return i >= 0 ? i : 999;
};
const stations = [...allStations].sort((a, b) => {
  // 轉乘站(2 條線以上) 優先
  const aT = a.lines.length > 1 ? 0 : 1;
  const bT = b.lines.length > 1 ? 0 : 1;
  if (aT !== bT) return aT - bT;
  // 接著熱門站
  const ap = priorityIdx(a.name), bp = priorityIdx(b.name);
  if (ap !== bp) return ap - bp;
  // 其他依 ref
  return a.lines[0].ref.localeCompare(b.lines[0].ref);
});

const OUT = path.join(ROOT, `data/${cityKey}/pois.json`);
const FORCE = process.env.FORCE === '1';
let out = {};
if (fs.existsSync(OUT)) {
  out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  console.log(FORCE
    ? `已存在 ${Object.keys(out).length} 站，FORCE=1 全部重抓...`
    : `已存在 ${Object.keys(out).length} 站，續傳...`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function classify(tags) {
  for (const key of Object.keys(mapping.rules)) {
    if (tags[key] && mapping.rules[key][tags[key]]) {
      return mapping.rules[key][tags[key]];
    }
  }
  return null;
}

async function fetchStation(s, attemptIdx = 0) {
  const q = `[out:json][timeout:${TIMEOUT_S}];
(
  nwr["amenity"](around:${RADIUS},${s.lat},${s.lon});
  nwr["shop"](around:${RADIUS},${s.lat},${s.lon});
  nwr["leisure"](around:${RADIUS},${s.lat},${s.lon});
  nwr["tourism"](around:${RADIUS},${s.lat},${s.lon});
  nwr["historic"](around:${RADIUS},${s.lat},${s.lon});
  nwr["natural"](around:${RADIUS},${s.lat},${s.lon});
  nwr["railway"="station"](around:${RADIUS},${s.lat},${s.lon});
);
out center tags;`;

  const endpoint = ENDPOINTS[attemptIdx % ENDPOINTS.length];
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'pikmin-mrt-dashboard/0.1 (data-fetch script)'
    },
    body: 'data=' + encodeURIComponent(q)
  });

  if (res.status === 429 || res.status === 504 || res.status >= 500) {
    if (attemptIdx >= RETRY_BACKOFF.length) {
      throw new Error(`HTTP ${res.status} (重試耗盡)`);
    }
    const wait = RETRY_BACKOFF[attemptIdx];
    process.stdout.write(`[${res.status}, 等 ${wait/1000}s 後重試...] `);
    await sleep(wait);
    return fetchStation(s, attemptIdx + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.elements || [];
}

function buildAddress(tags) {
  if (tags['addr:full']) return tags['addr:full'];
  const parts = [
    tags['addr:city'], tags['addr:district'],
    tags['addr:street'], tags['addr:housenumber']
  ].filter(Boolean);
  return parts.join(' ');
}

function processElements(elements) {
  const pois = [];
  const summary = {};
  elements.forEach(e => {
    const tags = e.tags || {};
    const decor = classify(tags);
    if (!decor) return;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) return;
    const poi = {
      id: e.id,
      type: e.type,
      lat, lon,
      name: tags['name:zh'] || tags.name || tags['name:en'] || '',
      decor
    };
    // 選用欄位（有就存，省檔案大小）
    const addr = buildAddress(tags);
    if (addr) poi.addr = addr;
    if (tags.opening_hours) poi.hours = tags.opening_hours;
    if (tags.website || tags['contact:website']) poi.web = tags.website || tags['contact:website'];
    if (tags.phone || tags['contact:phone']) poi.phone = tags.phone || tags['contact:phone'];
    if (tags.brand) poi.brand = tags.brand;
    if (tags.cuisine) poi.cuisine = tags.cuisine;

    pois.push(poi);
    summary[decor] = (summary[decor] || 0) + 1;
  });
  return { pois, summary };
}

let done = 0, skipped = 0, failed = 0;
const total = stations.length;
const startAt = Date.now();

for (const s of stations) {
  done++;
  if (out[s.id] && !FORCE) { skipped++; continue; }

  process.stdout.write(`[${done}/${total}] ${s.name.padEnd(8)} ... `);
  try {
    const elements = await fetchStation(s);
    const { pois, summary } = processElements(elements);
    out[s.id] = { name: s.name, lat: s.lat, lon: s.lon, count: pois.length, summary, pois };
    fs.writeFileSync(OUT, JSON.stringify(out)); // 每站存檔以利續傳
    console.log(`${pois.length} POI / ${Object.keys(summary).length} 類`);
  } catch (e) {
    failed++;
    console.log(`✗ ${e.message}`);
  }
  if (done < total) await sleep(SLEEP_MS);
}

const min = ((Date.now() - startAt) / 60000).toFixed(1);
console.log(`\n完成。新抓 ${done - skipped - failed}、跳過 ${skipped}、失敗 ${failed}，耗時 ${min} 分。`);
console.log(`輸出：${OUT}`);
