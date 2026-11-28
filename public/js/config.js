// @ts-check
/**
 * Frontend constants. Band colours mirror src/aqi.js (EPA palette with WCAG AA text colours).
 */

/** @typedef {{en: string, hi: string, color: string, text: string}} BandStyle */

/** @type {Readonly<Record<string, BandStyle>>} */
export const BANDS = Object.freeze({
  good: { en: 'Good', hi: 'अच्छा', color: '#00e400', text: '#000' },
  moderate: { en: 'Moderate', hi: 'मध्यम', color: '#ffff00', text: '#000' },
  usg: { en: 'Unhealthy for Sensitive Groups', hi: 'संवेदनशील लोगों के लिए अस्वास्थ्यकर', color: '#ff7e00', text: '#000' },
  unhealthy: { en: 'Unhealthy', hi: 'अस्वास्थ्यकर', color: '#ff0000', text: '#000' },
  very_unhealthy: { en: 'Very Unhealthy', hi: 'बहुत अस्वास्थ्यकर', color: '#8f3f97', text: '#fff' },
  hazardous: { en: 'Hazardous', hi: 'खतरनाक', color: '#7e0023', text: '#fff' },
});

/** Shown when a band key is missing or unknown. */
export const UNKNOWN_BAND = Object.freeze({ en: '—', hi: '—', color: '#ddd', text: '#000' });

/** Placeholder for missing values. */
export const EMPTY = '—';

/** localStorage key for the saved profile. */
export const STORE_KEY = 'saafhawa:v1';

/** Same allow-list as the server (src/validate.js). */
export const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’()-]{0,79}$/u;
export const MAX_CITY_LENGTH = 80;
export const MAX_MESSAGE_LENGTH = 500;

/** Chat turns kept and sent as context (matches the server cap). */
export const HISTORY_TURNS = 6;

/** Client-side request timeout (the plan can take a while on a cold start). */
export const REQUEST_TIMEOUT_MS = 40000;

/** Geolocation options. */
export const GEO_OPTIONS = Object.freeze({ timeout: 10000, maximumAge: 600000 });

/** Chart scale: bars are drawn against at least this AQI so mild days don't look alarming. */
export const CHART_MIN_SCALE = 200;
export const CHART_MIN_BAR_PCT = 4;
/** Label every Nth hour under the chart. */
export const CHART_LABEL_STEP = 3;

/** Name the server gives a coordinates-only location. */
export const DEFAULT_PLACE_NAME = 'Your location';

/** Supported languages. */
export const LANGS = Object.freeze(['en', 'hi']);
