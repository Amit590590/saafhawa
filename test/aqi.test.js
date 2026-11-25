'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { usAqiBand, naqiFromPm25, sliceForecast, bestWorstWindows, US_BANDS } = require('../src/aqi');
const { airFixture } = require('./helpers');

test('usAqiBand maps EPA boundaries correctly', () => {
  const cases = [
    [0, 'good'], [50, 'good'], [51, 'moderate'], [100, 'moderate'], [101, 'usg'], [150, 'usg'],
    [151, 'unhealthy'], [200, 'unhealthy'], [201, 'very_unhealthy'], [300, 'very_unhealthy'], [301, 'hazardous'], [999, 'hazardous'],
  ];
  for (const [v, key] of cases) assert.equal(usAqiBand(v).key, key, `AQI ${v}`);
});

test('usAqiBand rounds, flags risk and rejects bad input', () => {
  assert.equal(usAqiBand(50.4).key, 'good');
  assert.equal(usAqiBand(50.6).key, 'moderate');
  assert.equal(usAqiBand(120).sensitiveRisk, true);
  assert.equal(usAqiBand(120).generalRisk, false);
  assert.equal(usAqiBand(-1), null);
  assert.equal(usAqiBand(NaN), null);
  assert.equal(usAqiBand('100'), null);
  assert.equal(usAqiBand(null), null);
});

test('every band has a Hindi label and a contrast-safe text colour', () => {
  const lum = (hex) => {
    const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const b of US_BANDS) {
    assert.ok(b.labelHi && b.label);
    const [l1, l2] = [lum(b.color), lum(b.text)].sort((a, z) => z - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    assert.ok(ratio >= 4.5, `${b.key} contrast ${ratio.toFixed(2)} < 4.5`);
  }
});

test('naqiFromPm25 follows CPCB PM2.5 breakpoints', () => {
  assert.deepEqual(naqiFromPm25(0), { index: 0, key: 'good', label: 'Good', labelHi: 'अच्छा' });
  assert.equal(naqiFromPm25(30).index, 50);
  assert.equal(naqiFromPm25(60).key, 'satisfactory');
  assert.equal(naqiFromPm25(90).index, 200);
  assert.equal(naqiFromPm25(130).key, 'very_poor');
  assert.equal(naqiFromPm25(300).key, 'severe');
  assert.equal(naqiFromPm25(800).index, 500);
  assert.equal(naqiFromPm25(-5), null);
});

test('sliceForecast starts at the current hour and returns 24 entries', () => {
  const data = airFixture();
  const f = sliceForecast(data.hourly, data.current.time, 24);
  assert.equal(f.length, 24);
  assert.equal(f[0].time, '2026-11-25T09:00');
  assert.equal(f[0].band, 'very_unhealthy');
  assert.equal(f[23].time, '2026-11-26T08:00');
});

test('sliceForecast skips null AQI values and handles bad input', () => {
  const hourly = { time: ['2026-01-01T00:00', '2026-01-01T01:00'], us_aqi: [null, 80], pm2_5: [1, 2], pm10: [1, 2] };
  assert.equal(sliceForecast(hourly, '2026-01-01T00:00').length, 1);
  assert.deepEqual(sliceForecast(null, 'x'), []);
});

test('bestWorstWindows picks the cleanest and dirtiest waking-hour windows', () => {
  const data = airFixture();
  const f = sliceForecast(data.hourly, data.current.time, 24);
  const { best, worst } = bestWorstWindows(f);
  assert.equal(best.avgAqi, 120);
  assert.equal(best.label, '13:00–15:00');
  assert.equal(worst.avgAqi, 260);
  assert.ok(worst.waking);
  assert.equal(best.tomorrow, false);
  assert.equal(worst.tomorrow, true);
  assert.deepEqual(bestWorstWindows([]), { best: null, worst: null });
});
