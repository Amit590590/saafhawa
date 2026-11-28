// @ts-check
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

/** US AQI above which sensitive groups are at risk. */
const SENSITIVE_RISK_AQI = 100;
/** US AQI above which everyone is at risk. */
const GENERAL_RISK_AQI = 150;
/** Upper end of the NAQI PM2.5 scale (µg/m³ and index). */
const NAQI_MAX = 500;
/** Waking hours used when picking best/worst windows. */
const WAKING_HOURS = Object.freeze({ start: 6, end: 22 });
/** Length of the best/worst window, in hours. */
const WINDOW_HOURS = 2;

/**
 * @param {unknown} v
 * @returns {v is number} true for finite numbers
 */
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Round to one decimal place.
 * @param {number} n
 * @returns {number}
 */
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Return the US AQI band for a value, or null for invalid input.
 * @param {unknown} aqi
 * @returns {{key: string, label: string, labelHi: string, color: string, text: string, value: number, sensitiveRisk: boolean, generalRisk: boolean} | null}
 */
function usAqiBand(aqi) {
  if (!isNum(aqi) || aqi < 0) return null;
  const v = Math.round(aqi);
  const band = US_BANDS.find((b) => v <= b.max) || US_BANDS[US_BANDS.length - 1];
  const { key, label, labelHi, color, text } = band;
  return { key, label, labelHi, color, text, value: v, sensitiveRisk: v > SENSITIVE_RISK_AQI, generalRisk: v > GENERAL_RISK_AQI };
}

/**
 * Approximate India NAQI sub-index + category from PM2.5 (µg/m³).
 * @param {unknown} pm25
 * @returns {{index: number, key: string, label: string, labelHi: string} | null}
 */
function naqiFromPm25(pm25) {
  if (!isNum(pm25) || pm25 < 0) return null;
  const c = Math.round(pm25);
  if (c > NAQI_MAX) return { index: NAQI_MAX, key: 'severe', label: 'Severe', labelHi: 'गंभीर' };
  const row = /** @type {(typeof NAQI_PM25)[number]} */ (NAQI_PM25.find(([, hi]) => c <= /** @type {number} */ (hi)));
  const [lo, hi, iLo, iHi, key, label, labelHi] = /** @type {[number, number, number, number, string, string, string]} */ (row);
  const index = Math.round(((iHi - iLo) / (hi - lo)) * (c - lo) + iLo);
  return { index, key, label, labelHi };
}

/**
 * Hour of day (0-23) from a local ISO time "YYYY-MM-DDTHH:MM".
 * @param {string} isoLocal
 * @returns {number}
 */
function hourOf(isoLocal) {
  return Number.parseInt(String(isoLocal).slice(11, 13), 10);
}

/**
 * Add one hour to a local ISO time string "YYYY-MM-DDTHH:MM".
 * @param {string} isoLocal
 * @returns {string} "HH:00" label
 */
function nextHourLabel(isoLocal) {
  const h = (hourOf(isoLocal) + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

/**
 * Turn Open-Meteo hourly arrays into the next `count` hours starting at `fromTime`.
 * Entries with a missing AQI value are dropped.
 * @param {{time?: string[], us_aqi?: (number|null)[], pm2_5?: (number|null)[], pm10?: (number|null)[]} | null | undefined} hourly
 * @param {string} [fromTime] local ISO time to start from
 * @param {number} [count=24]
 * @returns {{time: string, hour: number, usAqi: number, pm25: number|null, pm10: number|null, band: string}[]}
 */
function sliceForecast(hourly, fromTime, count = 24) {
  if (!hourly || !Array.isArray(hourly.time)) return [];
  const times = hourly.time;
  let start = times.findIndex((t) => t >= String(fromTime || '').slice(0, 13));
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < times.length && out.length < count; i += 1) {
    const aqi = hourly.us_aqi?.[i];
    if (!isNum(aqi)) continue;
    const pm25 = hourly.pm2_5?.[i];
    const pm10 = hourly.pm10?.[i];
    out.push({
      time: times[i],
      hour: hourOf(times[i]),
      usAqi: Math.round(aqi),
      pm25: isNum(pm25) ? round1(pm25) : null,
      pm10: isNum(pm10) ? round1(pm10) : null,
      band: /** @type {{key: string}} */ (usAqiBand(aqi)).key,
    });
  }
  return out;
}

/**
 * @typedef {object} AqiWindow
 * @property {string} start local ISO time of the first hour
 * @property {string} end local ISO time of the last hour
 * @property {string} label "HH:MM–HH:MM"
 * @property {number} avgAqi
 * @property {number|null} avgPm25
 * @property {boolean} waking whole window falls in waking hours
 * @property {boolean} tomorrow window starts on the next calendar day
 */

/**
 * Find the cleanest and dirtiest contiguous windows (default 2h) during waking hours.
 * Falls back to all hours when no waking-hour window exists.
 * @param {ReturnType<typeof sliceForecast>} hours
 * @param {{size?: number, startHour?: number, endHour?: number}} [opts]
 * @returns {{best: AqiWindow | null, worst: AqiWindow | null}}
 */
function bestWorstWindows(hours, { size = WINDOW_HOURS, startHour = WAKING_HOURS.start, endHour = WAKING_HOURS.end } = {}) {
  if (!Array.isArray(hours) || hours.length === 0) return { best: null, worst: null };
  const w = Math.max(1, Math.min(size, hours.length));
  /** @type {AqiWindow[]} */
  const windows = [];
  for (let i = 0; i + w <= hours.length; i += 1) {
    const slice = hours.slice(i, i + w);
    const avg = slice.reduce((s, h) => s + h.usAqi, 0) / w;
    const avgPm = slice.every((h) => isNum(h.pm25)) ? slice.reduce((s, h) => s + /** @type {number} */ (h.pm25), 0) / w : null;
    const waking = slice.every((h) => h.hour >= startHour && h.hour < endHour);
    windows.push({
      start: slice[0].time,
      end: slice[w - 1].time,
      label: `${slice[0].time.slice(11, 16)}–${nextHourLabel(slice[w - 1].time)}`,
      avgAqi: Math.round(avg),
      avgPm25: avgPm === null ? null : round1(avgPm),
      waking,
      tomorrow: false,
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
