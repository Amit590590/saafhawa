// @ts-check
/**
 * SaafHawa frontend entry – vanilla ES modules, no framework.
 * Wires the form, geolocation, language toggle and chat to the render/API modules.
 * Security: all dynamic text (including Gemini output) is rendered via textContent / DOM APIs.
 */
import { CITY_RE, GEO_OPTIONS, MAX_MESSAGE_LENGTH } from './js/config.js';
import { $, setStatus } from './js/dom.js';
import { api } from './js/api.js';
import { state, t } from './js/state.js';
import { airQuery, roundCoord } from './js/format.js';
import { applyLang } from './js/i18n-ui.js';
import { readProfile } from './js/profile.js';
import { save, restore } from './js/storage.js';
import { renderAir } from './js/render-air.js';
import { renderPlan, renderPlanLoading, renderPlanError } from './js/render-plan.js';
import { ask, resetChat } from './js/chat.js';

/**
 * Message from an unknown thrown value.
 * @param {unknown} err
 * @returns {string}
 */
const errorMessage = (err) => (err instanceof Error ? err.message : t('errGeneric'));

/**
 * Apply the language to static text and re-render the air card if one is shown.
 * @returns {void}
 */
function refreshLanguage() {
  applyLang();
  if (state.report) renderAir(state.report);
}

/**
 * Show the plan for the current language, generating it only if not cached.
 * @returns {Promise<void>}
 */
async function loadPlan() {
  const section = $('planSection');
  section.hidden = false;
  const cached = state.plans[state.lang];
  if (cached) {
    renderPlan(cached);
    return;
  }
  section.setAttribute('aria-busy', 'true');
  renderPlanLoading();
  setStatus(t('loadingPlan'));
  try {
    const { location, profile, lang } = state;
    const res = await api('/api/plan', { location, profile, lang });
    state.plans[res.lang] = res;
    renderPlan(res);
    setStatus(t('planReady'));
  } catch (err) {
    renderPlanError(errorMessage(err));
    setStatus(errorMessage(err), true);
  } finally {
    section.setAttribute('aria-busy', 'false');
  }
}

/**
 * Fetch air data for state.location, render it, then (lazily) the AI plan.
 * @returns {Promise<void>}
 */
async function analyse() {
  const btn = /** @type {HTMLButtonElement} */ ($('submitBtn'));
  btn.disabled = true;
  setStatus(t('loadingAir'));
  try {
    state.report = await api(`/api/air?${airQuery(state.location || {})}`);
    state.plans = {};
    resetChat();
    renderAir(state.report);
    $('airTitle').focus();
    $('chatSection').hidden = false;
    await loadPlan(); // lazy: AI only runs after air data is shown
  } catch (err) {
    setStatus(errorMessage(err), true);
  } finally {
    btn.disabled = false;
  }
}

/**
 * Validate the city field, showing an inline error when invalid.
 * @returns {string | null} the trimmed city, or null when invalid
 */
function validCity() {
  const input = /** @type {HTMLInputElement} */ ($('city'));
  const city = input.value.trim();
  const err = $('cityError');
  if (!CITY_RE.test(city)) {
    err.textContent = t('errCity');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return null;
  }
  err.textContent = '';
  input.removeAttribute('aria-invalid');
  return city;
}

/**
 * @param {HTMLFormElement} form
 * @returns {void}
 */
function onProfileSubmit(form) {
  const city = validCity();
  if (!city) return;
  state.location = { city };
  state.profile = readProfile(form);
  save();
  analyse();
}

/**
 * Use the browser's location (rounded to ~1 km) instead of a city.
 * @param {HTMLFormElement} form
 * @returns {void}
 */
function onUseLocation(form) {
  if (!('geolocation' in navigator)) {
    setStatus(t('errGeo'), true);
    return;
  }
  setStatus(t('loadingAir'));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) };
      state.profile = readProfile(form);
      analyse();
    },
    () => setStatus(t('errGeo'), true),
    GEO_OPTIONS,
  );
}

/** @returns {void} */
function onToggleLanguage() {
  state.lang = state.lang === 'en' ? 'hi' : 'en';
  refreshLanguage();
  save();
  if (state.report) loadPlan();
}

/** @returns {void} */
function onChatSubmit() {
  const input = /** @type {HTMLInputElement} */ ($('chatInput'));
  const msg = input.value.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (msg && state.report) ask(msg);
}

/**
 * Restore saved state and attach event listeners.
 * @returns {void}
 */
function init() {
  const form = /** @type {HTMLFormElement} */ ($('profileForm'));
  restore(form);
  refreshLanguage();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onProfileSubmit(form);
  });
  $('geoBtn').addEventListener('click', () => onUseLocation(form));
  $('langToggle').addEventListener('click', onToggleLanguage);
  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    onChatSubmit();
  });
}

init();
