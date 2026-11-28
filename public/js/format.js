// @ts-check
/**
 * Pure formatting helpers (no DOM access), shared by the renderers and unit-tested.
 */
import { BANDS, UNKNOWN_BAND, EMPTY, DEFAULT_PLACE_NAME } from './config.js';

/**
 * Colour + labels for an AQI band key.
 * @param {string | undefined | null} key
 * @returns {import('./config.js').BandStyle}
 */
export function bandInfo(key) {
  return (key && BANDS[key]) || UNKNOWN_BAND;
}

/**
 * Format a concentration, e.g. "131 µg/m³", or "—" when missing.
 * @param {unknown} v
 * @param {string} [unit='µg/m³']
 * @returns {string}
 */
export function formatConcentration(v, unit = 'µg/m³') {
  return typeof v === 'number' ? `${Math.round(v)} ${unit}` : EMPTY;
}

/**
 * "HH:MM" from a local ISO time "YYYY-MM-DDTHH:MM".
 * @param {string} iso
 * @returns {string}
 */
export function clockTime(iso) {
  return iso.slice(11, 16);
}

/**
 * Text for a best/worst window, e.g. "13:00–15:00 (tomorrow) · avg AQI 120".
 * @param {{label: string, tomorrow?: boolean, avgAqi: number} | null | undefined} w
 * @param {(key: string) => string} t translator
 * @returns {string}
 */
export function windowText(w, t) {
  if (!w) return EMPTY;
  return `${w.label}${w.tomorrow ? ` (${t('tomorrow')})` : ''} · ${t('avg')} ${w.avgAqi}`;
}

/**
 * Display name for a report's place.
 * @param {{name: string, admin1?: string, country?: string}} place
 * @param {string} myLocationLabel translated label for a coordinates-only location
 * @returns {string}
 */
export function placeLabel(place, myLocationLabel) {
  if (place.name === DEFAULT_PLACE_NAME) return myLocationLabel;
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

/**
 * Query string for /api/air from a location.
 * @param {{city?: string, lat?: number, lon?: number}} location
 * @returns {string}
 */
export function airQuery(location) {
  return location.city ? `city=${encodeURIComponent(location.city)}` : `lat=${location.lat}&lon=${location.lon}`;
}

/**
 * Round a coordinate to 2 decimals (~1 km) before it leaves the browser.
 * @param {number} n
 * @returns {number}
 */
export function roundCoord(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Bar height as a percentage of the chart.
 * @param {number} aqi
 * @param {number} max chart scale
 * @param {number} minPct smallest visible bar
 * @returns {number}
 */
export function barHeightPct(aqi, max, minPct) {
  return Math.max(minPct, (aqi / max) * 100);
}
