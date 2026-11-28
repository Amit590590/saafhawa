// @ts-check
/**
 * Applies the current language to static markup ([data-i18n], placeholders, <html lang>).
 */
import { $, el } from './dom.js';
import { state, strings, t } from './state.js';

/**
 * Update the language toggle button to offer the other language.
 * @returns {void}
 */
function updateLangToggle() {
  const btn = $('langToggle');
  const isHindi = state.lang === 'hi';
  btn.setAttribute('aria-pressed', String(isHindi));
  btn.replaceChildren(
    isHindi ? el('span', { text: 'English', attrs: { lang: 'en' } }) : el('span', { text: 'हिन्दी', attrs: { lang: 'hi' } }),
  );
  btn.setAttribute('aria-label', isHindi ? 'Switch to English' : 'हिन्दी में देखें / Switch to Hindi');
}

/**
 * Translate every static string on the page.
 * @returns {void}
 */
export function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => {
    const v = strings()[/** @type {HTMLElement} */ (n).dataset.i18n || ''];
    if (typeof v === 'string') n.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => {
    const input = /** @type {HTMLInputElement} */ (n);
    input.placeholder = t(input.dataset.i18nPlaceholder || '');
  });
  updateLangToggle();
}
