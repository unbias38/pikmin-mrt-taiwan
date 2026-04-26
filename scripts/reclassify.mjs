#!/usr/bin/env node
// 用更新後的 decor-mapping.json 重新分類現有 pois.json
// 不重抓網路，只用已存的 cuisine/brand 等欄位做更精細分類

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decor-mapping.json'), 'utf8'));
const pois    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pois.json'), 'utf8'));

// cuisine 細分對照（cuisine 值含這些字 → 該 Decor）
const CUISINE_KEYWORDS = [
  ['sushi',      'sushi'],
  ['ramen',      'ramen'],
  ['noodle',     'ramen'],
  ['pizza',      'pizza'],
  ['burger',     'burger'],
  ['ice_cream',  'sweets'],
  ['dessert',    'sweets'],
  ['cake',       'sweets'],
  ['donut',      'sweets'],
  ['coffee',     'cafe'],
  ['bubble_tea', 'cafe'],
  ['tea',        'cafe']
];

function refine(poi) {
  if (!poi.cuisine) return poi.decor;
  const cs = poi.cuisine.toLowerCase();
  for (const [kw, decor] of CUISINE_KEYWORDS) {
    if (cs.includes(kw)) return decor;
  }
  return poi.decor;
}

let changed = 0;
const decorChanges = {};

for (const id of Object.keys(pois)) {
  const station = pois[id];
  const newSummary = {};
  station.pois.forEach(p => {
    const oldDecor = p.decor;
    const newDecor = refine(p);
    if (newDecor !== oldDecor) {
      changed++;
      const k = `${oldDecor}→${newDecor}`;
      decorChanges[k] = (decorChanges[k] || 0) + 1;
      p.decor = newDecor;
    }
    newSummary[p.decor] = (newSummary[p.decor] || 0) + 1;
  });
  station.summary = newSummary;
}

fs.writeFileSync(path.join(ROOT, 'data/pois.json'), JSON.stringify(pois));

console.log('重分類完成');
console.log('變動 POI 數:', changed);
console.log('變動分布:');
Object.entries(decorChanges).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
  console.log(`  ${k}: ${c}`);
});
