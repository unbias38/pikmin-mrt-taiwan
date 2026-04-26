#!/usr/bin/env node
// 從 metro.taipei 抓近 12 個月各站每日進出量 ODS，聚合成月運量並輸出 data/ridership.json
// 來源：https://web.metro.taipei/RidershipPerStation/{YYYYMM}_cht.ods

import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW_DIR = path.join(ROOT, 'data/_ridership_raw');
const OUT = path.join(ROOT, 'data/ridership.json');
fs.mkdirSync(RAW_DIR, { recursive: true });

const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stations.json'), 'utf8'));
const stationNameSet = new Set(stations.map(s => s.name));

// 站名正規化：去掉 BL/Y 之類的線別前綴
function normalizeName(name) {
  return String(name || '').replace(/^(BL|BR|R|G|O|Y)\s*/, '').trim();
}

// 取得目標月份清單（最近 12 個月）
function getRecentMonths(n = 12) {
  const months = [];
  const now = new Date('2026-04-26'); // 使用當前已知日期，避免抓未發布的月份
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(ym);
  }
  return months.reverse();
}

async function downloadODS(ym) {
  const dest = path.join(RAW_DIR, `${ym}.ods`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  const url = `https://web.metro.taipei/RidershipPerStation/${ym}_cht.ods`;
  process.stdout.write(`抓 ${ym}... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`✗ HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`OK (${(buf.length/1024).toFixed(0)} KB)`);
  return dest;
}

// 解析一個 ODS：回傳 { station: { entries, exits } } 月加總
function parseODS(filepath, ym) {
  const wb = XLSX.readFile(filepath);
  const result = {};

  for (const [sheetName, key] of [['進站資料', 'entries'], ['出站資料', 'exits']]) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    if (!rows.length) continue;

    const header = rows[0]; // [車站\n日期, 松山機場, 中山國中, ...]
    // 對每個欄位（每站）求和
    for (let col = 1; col < header.length; col++) {
      const rawName = header[col];
      const norm = normalizeName(rawName);
      if (!stationNameSet.has(norm)) continue; // 不在我們 109 站內
      let sum = 0;
      for (let r = 1; r < rows.length; r++) {
        const v = rows[r][col];
        if (typeof v === 'number') sum += v;
      }
      if (!result[norm]) result[norm] = {};
      result[norm][key] = sum;
    }
  }

  return result;
}

// 主程式
const months = getRecentMonths(12);
console.log(`目標月份 (${months.length} 個):`, months.join(', '));

const ridership = {
  _meta: {
    lastUpdated: new Date().toISOString().slice(0, 10),
    source: 'https://web.metro.taipei/RidershipPerStation/',
    months: []
  },
  stations: {}
};

for (const ym of months) {
  const f = await downloadODS(ym);
  if (!f) continue;
  const data = parseODS(f, ym);
  const matched = Object.keys(data).length;
  console.log(`  ${ym}: ${matched} 站匹配`);
  if (matched < 50) {
    console.log(`  ⚠ ${ym} 匹配站數偏少，跳過`);
    continue;
  }
  ridership._meta.months.push(ym);
  for (const [name, m] of Object.entries(data)) {
    if (!ridership.stations[name]) ridership.stations[name] = {};
    ridership.stations[name][ym] = m;
  }
}

fs.writeFileSync(OUT, JSON.stringify(ridership, null, 2));
const fileSize = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`\n寫入 ${OUT} (${fileSize} KB)`);
console.log(`收錄站數:`, Object.keys(ridership.stations).length);
console.log(`月份:`, ridership._meta.months.join(', '));

// 抽幾個樣本看
const sample = ridership.stations['台北車站'];
if (sample) {
  console.log(`\n台北車站範例:`);
  Object.entries(sample).forEach(([m, d]) => {
    console.log(`  ${m}: 進站 ${(d.entries/1000000).toFixed(2)}M, 出站 ${(d.exits/1000000).toFixed(2)}M`);
  });
}
