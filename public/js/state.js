// @ts-check
/**
 * Single mutable app state plus the translator bound to the current language.
 */
import { STRINGS } from '../i18n.js';

/**
 * @typedef {object} AppState
 * @property {'en' | 'hi'} lang
 * @property {{city?: string, lat?: number, lon?: number} | null} location
 * @property {Record<string, unknown> | null} profile
 * @property {any} report latest /api/air response
 * @property {Record<string, any>} plans plan responses cached per language
 * @property {{role: 'user' | 'assistant', text: string}[]} history chat turns
 */

/** @type {AppState} */
export const state = { lang: 'en', location: null, profile: null, report: null, plans: {}, history: [] };

/**
 * Strings for the current language.
 * @returns {Record<string, any>}
 */
export const strings = () => STRINGS[state.lang];

/**
 * Translate a key in the current language, falling back to English, then the key itself.
 * @param {string} key
 * @returns {string}
 */
export const t = (key) => STRINGS[state.lang][key] ?? STRINGS.en[key] ?? key;
