// 城市配置：用於 fetch-stations / fetch-pois 等抓取腳本
// 加新城市時只要新增一個 entry

export const CITIES = {
  taipei: {
    name: '台北',
    nameEn: 'Taipei',
    nameZh: '台北捷運',
    bbox: [24.9, 121.4, 25.2, 121.7],          // [南緯, 西經, 北緯, 東經]
    networkPatterns: ['臺北捷運'],
    lineColors: { BR:'#C48C31', R:'#E3002C', G:'#008659', O:'#F8B61C', BL:'#0070BD' },
    lineNames:  { BR:'文湖線', R:'淡水信義線', G:'松山新店線', O:'中和新蘆線', BL:'板南線' },
    excludeLines: ['Y', 'A']
  },
  taichung: {
    name: '台中',
    nameEn: 'Taichung',
    nameZh: '台中捷運',
    bbox: [24.05, 120.55, 24.30, 120.80],
    networkPatterns: ['臺中捷運', '台中捷運', '中捷'],
    lineColors: { G:'#008659' },
    lineNames:  { G:'綠線' },
    excludeLines: []
  },
  kaohsiung: {
    name: '高雄',
    nameEn: 'Kaohsiung',
    nameZh: '高雄捷運',
    bbox: [22.55, 120.20, 22.80, 120.45],
    networkPatterns: ['高雄捷運', '高雄輕軌', 'KRTC'],
    lineColors: { R:'#E3002C', O:'#F8B61C', C:'#84C341' },
    lineNames:  { R:'紅線', O:'橘線', C:'環狀輕軌' },
    excludeLines: []
  }
};

export function getCity(name) {
  if (!CITIES[name]) {
    throw new Error(`Unknown city: ${name}. Available: ${Object.keys(CITIES).join(', ')}`);
  }
  return CITIES[name];
}
