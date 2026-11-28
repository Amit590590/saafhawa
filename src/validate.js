// @ts-check
'use strict';

/**
 * Input validation + sanitisation. Everything coming from the client goes through
 * here before it touches an upstream API or a prompt. Unknown fields are dropped.
 */

const COMMUTE_MODES = Object.freeze(['wfh', 'walk', 'cycle', 'metro', 'bus', 'auto', 'two_wheeler', 'car']);
const COOKING_FUELS = Object.freeze(['lpg', 'png', 'induction', 'biomass', 'kerosene', 'coal']);
const LANGS = Object.freeze(['en', 'hi']);

/** Length caps for free text. */
const LIMITS = Object.freeze({
  city: 80,
  label: 60,
  message: 500,
  historyText: 800,
  historyTurns: 6,
  maxMembers: 20,
  maxCommuteKm: 200,
});

/** Defaults used when a profile field is omitted. */
const PROFILE_DEFAULTS = Object.freeze({
  adults: 2,
  children: 0,
  elderly: 0,
  commuteMode: 'bus',
  commuteKm: 10,
  cookingFuel: 'lpg',
});

const TRUTHY = Object.freeze([true, 'true', 'on', 1, '1']);

/**
 * @template T
 * @typedef {{ok: boolean, value?: T, errors?: string[]}} Result  ok=true carries value; ok=false carries errors
 */

// Letters (any script, incl. Devanagari marks), spaces and a few punctuation marks.
const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’()-]{0,79}$/u;

// Control characters plus characters that could form markup.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_RE = /[\u0000-\u001f\u007f-\u009f<>`]/g;

/**
 * True for undefined, null or ''.
 * @param {unknown} value
 * @returns {boolean}
 */
const isBlank = (value) => value === undefined || value === null || value === '';

/**
 * Normalise text: NFC, strip control chars and angle brackets, collapse whitespace, cap length.
 * @param {unknown} value
 * @param {number} [max]
 * @returns {string}
 */
function cleanText(value, max = LIMITS.message) {
  if (value === undefined || value === null) return '';
  return String(value).normalize('NFC').replace(UNSAFE_CHARS_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Parse an optional integer in [min, max]; blank input yields the fallback.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {{ok: boolean, value: number}}
 */
function toInt(value, min, max, fallback) {
  if (isBlank(value)) return { ok: true, value: fallback };
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: fallback };
  return { ok: true, value: n };
}

/**
 * Parse an optional number in [min, max].
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null} null when blank, NaN when invalid
 */
function toNum(value, min, max) {
  if (isBlank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return n;
}

/**
 * Lenient boolean parsing for form-style values.
 * @param {unknown} value
 * @returns {boolean}
 */
function toBool(value) {
  return TRUTHY.includes(/** @type {any} */ (value));
}

/**
 * Treat anything that is not a non-null object as an empty object.
 * @param {unknown} input
 * @returns {Record<string, any>}
 */
function asObject(input) {
  return input && typeof input === 'object' ? /** @type {Record<string, any>} */ (input) : {};
}

/**
 * Pick a value from an allow-list, or the fallback.
 * @param {readonly string[]} allowed
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function oneOf(allowed, value, fallback) {
  return allowed.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : fallback;
}

/**
 * Supported UI/output language, defaulting to English.
 * @param {unknown} value
 * @returns {'en' | 'hi'}
 */
function validateLang(value) {
  return /** @type {'en' | 'hi'} */ (oneOf(LANGS, value, 'en'));
}

/**
 * Accepts { city } or { lat, lon[, label] }.
 * @param {unknown} input
 * @returns {Result<{city: string} | {lat: number, lon: number, label: string}>}
 */
function validateLocation(input) {
  const src = asObject(input);
  const lat = toNum(src.lat, -90, 90);
  const lon = toNum(src.lon, -180, 180);
  if (lat !== null || lon !== null) {
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat === null || lon === null) {
      return { ok: false, errors: ['lat/lon must be valid coordinates'] };
    }
    const label = cleanText(src.label, LIMITS.label);
    return { ok: true, value: { lat, lon, label: label && CITY_RE.test(label) ? label : '' } };
  }
  // Validate the raw value (not a stripped copy) so markup or payloads are rejected, not silently "fixed".
  const city = typeof src.city === 'string' ? src.city.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (!city) return { ok: false, errors: ['city is required'] };
  if (city.length > LIMITS.city) return { ok: false, errors: ['city is too long'] };
  if (!CITY_RE.test(city)) return { ok: false, errors: ['city contains unsupported characters'] };
  return { ok: true, value: { city } };
}

/**
 * Lifestyle profile with safe defaults. Unknown fields are dropped.
 * @param {unknown} input
 * @returns {Result<Profile>}
 */
function validateProfile(input) {
  const src = asObject(input);
  const errors = [];
  /** @type {(key: string, min: number, max: number, def: number) => number} */
  const int = (key, min, max, def) => {
    const r = toInt(src[key], min, max, def);
    if (!r.ok) errors.push(`${key} must be an integer between ${min} and ${max}`);
    return r.value;
  };
  /** @type {Profile} */
  const value = {
    adults: int('adults', 0, LIMITS.maxMembers, PROFILE_DEFAULTS.adults),
    children: int('children', 0, LIMITS.maxMembers, PROFILE_DEFAULTS.children),
    elderly: int('elderly', 0, LIMITS.maxMembers, PROFILE_DEFAULTS.elderly),
    respiratory: toBool(src.respiratory),
    pregnant: toBool(src.pregnant),
    commuteMode: oneOf(COMMUTE_MODES, src.commuteMode, PROFILE_DEFAULTS.commuteMode),
    commuteKm: int('commuteKm', 0, LIMITS.maxCommuteKm, PROFILE_DEFAULTS.commuteKm),
    cookingFuel: oneOf(COOKING_FUELS, src.cookingFuel, PROFILE_DEFAULTS.cookingFuel),
    hasPurifier: toBool(src.hasPurifier),
    hasPlants: toBool(src.hasPlants),
    workFromHome: toBool(src.workFromHome),
    smokerAtHome: toBool(src.smokerAtHome),
    outdoorExercise: toBool(src.outdoorExercise),
  };
  if (src.commuteMode !== undefined && !COMMUTE_MODES.includes(src.commuteMode)) errors.push('commuteMode is invalid');
  if (src.cookingFuel !== undefined && !COOKING_FUELS.includes(src.cookingFuel)) errors.push('cookingFuel is invalid');
  if (value.adults + value.children + value.elderly === 0) errors.push('household must have at least one member');
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * Chat follow-up: message + short history of prior turns.
 * @param {unknown} input
 * @returns {Result<{message: string, history: {role: 'user' | 'assistant', text: string}[]}>}
 */
function validateChat(input) {
  const src = asObject(input);
  const message = cleanText(src.message, LIMITS.message);
  if (!message) return { ok: false, errors: ['message is required'] };
  const history = Array.isArray(src.history)
    ? src.history
        .slice(-LIMITS.historyTurns)
        .filter((t) => t && (t.role === 'user' || t.role === 'assistant'))
        .map((t) => ({ role: t.role, text: cleanText(t.text, LIMITS.historyText) }))
        .filter((t) => t.text)
    : [];
  return { ok: true, value: { message, history } };
}

/**
 * @typedef {object} Profile
 * @property {number} adults
 * @property {number} children
 * @property {number} elderly
 * @property {boolean} respiratory
 * @property {boolean} pregnant
 * @property {string} commuteMode
 * @property {number} commuteKm
 * @property {string} cookingFuel
 * @property {boolean} hasPurifier
 * @property {boolean} hasPlants
 * @property {boolean} workFromHome
 * @property {boolean} smokerAtHome
 * @property {boolean} outdoorExercise
 */

module.exports = {
  LIMITS,
  PROFILE_DEFAULTS,
  COMMUTE_MODES,
  COOKING_FUELS,
  LANGS,
  cleanText,
  validateLang,
  validateLocation,
  validateProfile,
  validateChat,
};
