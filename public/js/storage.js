// @ts-check
/**
 * Profile persistence in localStorage (the profile never leaves the browser except in API calls).
 */
import { STORE_KEY, MAX_CITY_LENGTH, LANGS } from './config.js';
import { $ } from './dom.js';
import { state } from './state.js';

/**
 * Save language, city and profile.
 * @returns {void}
 */
export function save() {
  try {
    const city = /** @type {HTMLInputElement} */ ($('city')).value;
    localStorage.setItem(STORE_KEY, JSON.stringify({ lang: state.lang, city, profile: state.profile }));
  } catch {
    /* storage may be disabled */
  }
}

/**
 * Write saved profile values back into the form controls.
 * @param {HTMLFormElement} form
 * @param {Record<string, unknown>} profile
 * @returns {void}
 */
function fillForm(form, profile) {
  for (const [k, v] of Object.entries(profile)) {
    const input = /** @type {HTMLInputElement | null} */ (form.elements.namedItem(k));
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(v);
    else input.value = String(v);
  }
}

/**
 * Restore language, city and profile from a previous visit.
 * @param {HTMLFormElement} form
 * @returns {void}
 */
export function restore(form) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    if (LANGS.includes(saved.lang)) state.lang = saved.lang;
    if (typeof saved.city === 'string') /** @type {HTMLInputElement} */ ($('city')).value = saved.city.slice(0, MAX_CITY_LENGTH);
    fillForm(form, saved.profile || {});
  } catch {
    /* ignore corrupt storage */
  }
}
