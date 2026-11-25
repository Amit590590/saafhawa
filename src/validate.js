'use strict';

/**
 * Input validation + sanitisation. Everything coming from the client goes through
 * here before it touches an upstream API or a prompt. Unknown fields are dropped.
 */

const COMMUTE_MODES = Object.freeze(['wfh', 'walk', 'cycle', 'metro', 'bus', 'auto', 'two_wheeler', 'car']);
const COOKING_FUELS = Object.freeze(['lpg', 'png', 'induction', 'biomass', 'kerosene', 'coal']);
const LANGS = Object.freeze(['en', 'hi']);

// Letters (any script, incl. Devanagari marks), spaces and a few punctuation marks.
const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’()-]{0,79}$/u;

/** Normalise text: NFC, strip control chars and angle brackets, collapse whitespace, cap length. */
function cleanText(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function toInt(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: fallback };
  return { ok: true, value: n };
}

function toNum(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return NaN;
  return n;
}

function toBool(value) {
  return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function validateLang(value) {
  return LANGS.includes(value) ? value : 'en';
}

/** Accepts { city } or { lat, lon }. */
function validateLocation(input) {
  const src = input && typeof input === 'object' ? input : {};
  const lat = toNum(src.lat, -90, 90);
  const lon = toNum(src.lon, -180, 180);
  if (lat !== null || lon !== null) {
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat === null || lon === null) {
      return { ok: false, errors: ['lat/lon must be valid coordinates'] };
    }
    const label = cleanText(src.label, 60);
    return { ok: true, value: { lat, lon, label: label && CITY_RE.test(label) ? label : '' } };
  }
  // Validate the raw value (not a stripped copy) so markup or payloads are rejected, not silently "fixed".
  const city = typeof src.city === 'string' ? src.city.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (!city) return { ok: false, errors: ['city is required'] };
  if (city.length > 80) return { ok: false, errors: ['city is too long'] };
  if (!CITY_RE.test(city)) return { ok: false, errors: ['city contains unsupported characters'] };
  return { ok: true, value: { city } };
}

/** Lifestyle profile with safe defaults. */
function validateProfile(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = [];
  const int = (key, min, max, def) => {
    const r = toInt(src[key], min, max, def);
    if (!r.ok) errors.push(`${key} must be an integer between ${min} and ${max}`);
    return r.value;
  };
  const value = {
    adults: int('adults', 0, 20, 2),
    children: int('children', 0, 20, 0),
    elderly: int('elderly', 0, 20, 0),
    respiratory: toBool(src.respiratory),
    pregnant: toBool(src.pregnant),
    commuteMode: COMMUTE_MODES.includes(src.commuteMode) ? src.commuteMode : 'bus',
    commuteKm: int('commuteKm', 0, 200, 10),
    cookingFuel: COOKING_FUELS.includes(src.cookingFuel) ? src.cookingFuel : 'lpg',
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

/** Chat follow-up: message + short history of prior turns. */
function validateChat(input) {
  const src = input && typeof input === 'object' ? input : {};
  const message = cleanText(src.message, 500);
  if (!message) return { ok: false, errors: ['message is required'] };
  const history = Array.isArray(src.history)
    ? src.history
        .slice(-6)
        .filter((t) => t && (t.role === 'user' || t.role === 'assistant'))
        .map((t) => ({ role: t.role, text: cleanText(t.text, 800) }))
        .filter((t) => t.text)
    : [];
  return { ok: true, value: { message, history } };
}

module.exports = {
  COMMUTE_MODES,
  COOKING_FUELS,
  LANGS,
  cleanText,
  validateLang,
  validateLocation,
  validateProfile,
  validateChat,
};
