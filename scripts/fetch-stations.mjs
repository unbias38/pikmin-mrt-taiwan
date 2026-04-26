#!/usr/bin/env node
// 用法：node scripts/fetch-stations.mjs <city>
// 從 OSM Overpass 抓指定城市的捷運站，過濾 + 解析 + 輸出 data/<city>/stations.json

import fs from 'fs';
import path from 'path';
import { getCity } from './cities.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const cityKey = process.argv[2];
if (!cityKey) {
  console.error('用法：node scripts/fetch-stations.mjs <taipei|taichung|kaohsiung>');
  process.exit(1);
}
const city = getCity(cityKey);
const [s, w, n, e] = city.bbox;

console.log(`抓 ${city.name} 站點 bbox=[${s},${w},${n},${e}]...`);

const query = `[out:json][timeout:60];
(
  node["station"="subway"](${s},${w},${n},${e});
  node["railway"="station"]["subway"="yes"](${s},${w},${n},${e});
  node["railway"="station"]["station"="light_rail"](${s},${w},${n},${e});
  node["railway"="tram_stop"](${s},${w},${n},${e});
);
out body;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': 'pikmin-mrt-dashboard/0.1 (data-fetch)'
  },
  body: 'data=' + encodeURIComponent(query)
});
if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
const data = await res.json();

console.log(`原始回傳 ${data.elements.length} 筆`);

const filtered = data.elements.filter(el => {
  const t = el.tags || {};
  const network = t.network || '';
  return city.networkPatterns.some(p => network.includes(p));
});
console.log(`過濾後（network 符合）${filtered.length} 筆`);

const out = [];
filtered.forEach(el => {
  const t = el.tags;
  const refs = (t.ref || '').split(';').map(r => r.trim()).filter(Boolean);
  if (!refs.length) return;
  const cityCodes = Object.keys(city.lineColors);
  const lines = refs.map(r => {
    let code = r.match(/^[A-Z]+/)?.[0] || '';
    let num = code ? r.replace(/^[A-Z]+/, '') : r;
    // 純數字 ref：若城市只有一條線，自動套用該線代碼
    if (!code && cityCodes.length === 1) {
      code = cityCodes[0];
    }
    if (city.excludeLines.includes(code)) return null;
    if (!city.lineColors[code]) return null;
    return {
      code, num, ref: code === r ? r : (cityCodes.length === 1 && !r.match(/^[A-Z]/) ? code + r : r),
      color: city.lineColors[code],
      name: city.lineNames[code] || ''
    };
  }).filter(Boolean);
  if (!lines.length) return;

  out.push({
    osmId: el.id,
    name: t['name:zh'] || t.name,
    nameEn: t['name:en'] || '',
    aliases: [t.name, t['name:zh-Hant']].filter(n => n && n !== (t['name:zh'] || t.name)),
    lat: el.lat,
    lon: el.lon,
    lines
  });
});

out.sort((a, b) => a.lines[0].ref.localeCompare(b.lines[0].ref));
out.forEach((s, i) => { s.id = String(i + 1).padStart(3, '0'); });

const lineCount = {};
out.forEach(s => s.lines.forEach(l => lineCount[l.code] = (lineCount[l.code] || 0) + 1));
console.log('總站數:', out.length);
console.log('轉乘站:', out.filter(s => s.lines.length > 1).length);
console.log('各線分布:', lineCount);

const dir = path.join(ROOT, `data/${cityKey}`);
fs.mkdirSync(dir, { recursive: true });
const outPath = path.join(dir, 'stations.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`寫入 ${outPath}`);
