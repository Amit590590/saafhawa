'use strict';

/**
 * Air-quality band logic.
 * - US EPA AQI bands (Open-Meteo returns `us_aqi`).
 * - India NAQI category approximated from the PM2.5 concentration (CPCB breakpoints).
 * Colours follow the official EPA palette; `text` is the foreground colour that
 * keeps WCAG AA contrast (>= 4.5:1) on that background. A text label is always shown
 * alongside the colour so meaning never depends on colour alone.
 */

const US_BANDS = Object.freeze([
  { max: 50, key: 'good', label: 'Good', labelHi: 'अच्छा', color: '#00e400', text: '#000000' },
  { max: 100, key: 'moderate', label: 'Moderate', labelHi: 'मध्यम', color: '#ffff00', text: '#000000' },
  {
    max: 150,
    key: 'usg',
    label: 'Unhealthy for Sensitive Groups',
    labelHi: 'संवेदनशील लोगों के लिए अस्वास्थ्यकर',
    color: '#ff7e00',
    text: '#000000',
  },
  { max: 200, key: 'unhealthy', label: 'Unhealthy', labelHi: 'अस्वास्थ्यकर', color: '#ff0000', text: '#000000' },
  { max: 300, key: 'very_unhealthy', label: 'Very Unhealthy', labelHi: 'बहुत अस्वास्थ्यकर', color: '#8f3f97', text: '#ffffff' },
  { max: Infinity, key: 'hazardous', label: 'Hazardous', labelHi: 'खतरनाक', color: '#7e0023', text: '#ffffff' },
]);

/** CPCB NAQI PM2.5 breakpoints: [concLo, concHi, indexLo, indexHi, key, label, labelHi] */
const NAQI_PM25 = Object.freeze([
  [0, 30, 0, 50, 'good', 'Good', 'अच्छा'],
  [31, 60, 51, 100, 'satisfactory', 'Satisfactory', 'संतोषजनक'],
  [61, 90, 101, 200, 'moderate', 'Moderately Polluted', 'मध्यम प्रदूषित'],
  [91, 120, 201, 300, 'poor', 'Poor', 'खराब'],
  [121, 250, 301, 400, 'very_poor', 'Very Poor', 'बहुत खराब'],
  [251, 500, 401, 500, 'severe', 'Severe', 'गंभीर'],
]);

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Return the US AQI band for a value, or null for invalid input. */
function usAqiBand(aqi) {
  if (!isNum(aqi) || aqi < 0) return null;
  const v = Math.round(aqi);
  const band = US_BANDS.find((b) => v <= b.max);
  const { max, ...rest } = band; // eslint-disable-line no-unused-vars
  return { ...rest, value: v, sensitiveRisk: v > 100, generalRisk: v > 150 };
}

/** Approximate India NAQI sub-index + category from PM2.5 (µg/m³). */
function naqiFromPm25(pm25) {
  if (!isNum(pm25) || pm25 < 0) return null;
  const c = Math.round(pm25);
  if (c > 500) return { index: 500, key: 'severe', label: 'Severe', labelHi: 'गंभीर' };
  const row = NAQI_PM25.find(([, hi]) => c <= hi);
  const [lo, hi, iLo, iHi, key, label, labelHi] = row;
  const index = Math.round(((iHi - iLo) / (hi - lo)) * (c - lo) + iLo);
  return { index, key, label, labelHi };
}

function hourOf(isoLocal) {
  return Number.parseInt(String(isoLocal).slice(11, 13), 10);
}

/** Add one hour to a local ISO time string "YYYY-MM-DDTHH:MM" (returns HH:MM label). */
function nextHourLabel(isoLocal) {
  const h = (hourOf(isoLocal) + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

/**
 * Turn Open-Meteo hourly arrays into the next `count` hours starting at `fromTime`.
 * Entries with a missing AQI value are dropped.
 */
function sliceForecast(hourly, fromTime, count = 24) {
  if (!hourly || !Array.isArray(hourly.time)) return [];
  const times = hourly.time;
  let start = times.findIndex((t) => t >= String(fromTime || '').slice(0, 13));
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < times.length && out.length < count; i += 1) {
    const aqi = hourly.us_aqi ? hourly.us_aqi[i] : null;
    if (!isNum(aqi)) continue;
    out.push({
      time: times[i],
      hour: hourOf(times[i]),
      usAqi: Math.round(aqi),
      pm25: isNum(hourly.pm2_5?.[i]) ? Math.round(hourly.pm2_5[i] * 10) / 10 : null,
      pm10: isNum(hourly.pm10?.[i]) ? Math.round(hourly.pm10[i] * 10) / 10 : null,
      band: usAqiBand(aqi).key,
    });
  }
  return out;
}

/**
 * Find the cleanest and dirtiest contiguous windows (default 2h) during waking hours.
 * Falls back to all hours when no waking-hour window exists.
 */
function bestWorstWindows(hours, { size = 2, startHour = 6, endHour = 22 } = {}) {
  if (!Array.isArray(hours) || hours.length === 0) return { best: null, worst: null };
  const w = Math.max(1, Math.min(size, hours.length));
  const windows = [];
  for (let i = 0; i + w <= hours.length; i += 1) {
    const slice = hours.slice(i, i + w);
    const avg = slice.reduce((s, h) => s + h.usAqi, 0) / w;
    const avgPm = slice.every((h) => isNum(h.pm25)) ? slice.reduce((s, h) => s + h.pm25, 0) / w : null;
    const waking = slice.every((h) => h.hour >= startHour && h.hour < endHour);
    windows.push({
      start: slice[0].time,
      end: slice[w - 1].time,
      label: `${slice[0].time.slice(11, 16)}–${nextHourLabel(slice[w - 1].time)}`,
      avgAqi: Math.round(avg),
      avgPm25: avgPm === null ? null : Math.round(avgPm * 10) / 10,
      waking,
    });
  }
  const today = hours[0].time.slice(0, 10);
  for (const x of windows) x.tomorrow = x.start.slice(0, 10) !== today;
  const pool = windows.some((x) => x.waking) ? windows.filter((x) => x.waking) : windows;
  let best = pool[0];
  let worst = pool[0];
  for (const x of pool) {
    if (x.avgAqi < best.avgAqi) best = x;
    if (x.avgAqi > worst.avgAqi) worst = x;
  }
  return { best, worst };
}

module.exports = { US_BANDS, NAQI_PM25, usAqiBand, naqiFromPm25, sliceForecast, bestWorstWindows, hourOf };
