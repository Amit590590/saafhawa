// SaafHawa frontend – vanilla JS, no framework.
// Security: all dynamic text (including Gemini output) is rendered via textContent / DOM APIs; never innerHTML.
import { STRINGS } from './i18n.js';

const BANDS = {
  good: { en: 'Good', hi: 'अच्छा', color: '#00e400', text: '#000' },
  moderate: { en: 'Moderate', hi: 'मध्यम', color: '#ffff00', text: '#000' },
  usg: { en: 'Unhealthy for Sensitive Groups', hi: 'संवेदनशील लोगों के लिए अस्वास्थ्यकर', color: '#ff7e00', text: '#000' },
  unhealthy: { en: 'Unhealthy', hi: 'अस्वास्थ्यकर', color: '#ff0000', text: '#000' },
  very_unhealthy: { en: 'Very Unhealthy', hi: 'बहुत अस्वास्थ्यकर', color: '#8f3f97', text: '#fff' },
  hazardous: { en: 'Hazardous', hi: 'खतरनाक', color: '#7e0023', text: '#fff' },
};
const STORE_KEY = 'saafhawa:v1';

const $ = (id) => document.getElementById(id);
const state = { lang: 'en', location: null, profile: null, report: null, plans: {}, history: [] };

const t = (key) => STRINGS[state.lang][key] ?? STRINGS.en[key] ?? key;

/** Create an element with text and attributes – the only way UI is built. */
function el(tag, { text, cls, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(40000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('errGeneric'));
  return data;
}

function setStatus(msg, isError = false) {
  const s = $('status');
  s.textContent = msg || '';
  s.classList.toggle('is-error', isError);
}

// ---------- i18n ----------
function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => {
    const v = STRINGS[state.lang][n.dataset.i18n];
    if (typeof v === 'string') n.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => {
    n.placeholder = t(n.dataset.i18nPlaceholder);
  });
  const btn = $('langToggle');
  btn.setAttribute('aria-pressed', String(state.lang === 'hi'));
  btn.replaceChildren(state.lang === 'hi' ? el('span', { text: 'English', attrs: { lang: 'en' } }) : el('span', { text: 'हिन्दी', attrs: { lang: 'hi' } }));
  btn.setAttribute('aria-label', state.lang === 'hi' ? 'Switch to English' : 'हिन्दी में देखें / Switch to Hindi');
  if (state.report) renderAir(state.report);
}

// ---------- form ----------
function readProfile(form) {
  const f = new FormData(form);
  const num = (k) => Number(f.get(k) || 0);
  return {
    adults: num('adults'),
    children: num('children'),
    elderly: num('elderly'),
    commuteKm: num('commuteKm'),
    commuteMode: f.get('commuteMode'),
    cookingFuel: f.get('cookingFuel'),
    respiratory: f.has('respiratory'),
    pregnant: f.has('pregnant'),
    smokerAtHome: f.has('smokerAtHome'),
    workFromHome: f.has('workFromHome'),
    outdoorExercise: f.has('outdoorExercise'),
    hasPurifier: f.has('hasPurifier'),
    hasPlants: f.has('hasPlants'),
  };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ lang: state.lang, city: $('city').value, profile: state.profile }));
  } catch { /* storage may be disabled */ }
}

function restore(form) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved) return;
    if (saved.lang === 'hi' || saved.lang === 'en') state.lang = saved.lang;
    if (typeof saved.city === 'string') $('city').value = saved.city.slice(0, 80);
    const p = saved.profile || {};
    for (const [k, v] of Object.entries(p)) {
      const input = form.elements.namedItem(k);
      if (!input) continue;
      if (input.type === 'checkbox') input.checked = Boolean(v);
      else input.value = String(v);
    }
  } catch { /* ignore corrupt storage */ }
}

const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’()-]{0,79}$/u;

// ---------- rendering ----------
function bandInfo(key) {
  return BANDS[key] || { en: '—', hi: '—', color: '#ddd', text: '#000' };
}
const fmt = (v, unit = 'µg/m³') => (typeof v === 'number' ? `${Math.round(v)} ${unit}` : '—');

function renderAir(r) {
  $('airSection').hidden = false;
  const place = r.place.name === 'Your location' ? t('myLocation') : [r.place.name, r.place.admin1, r.place.country].filter(Boolean).join(', ');
  $('placeName').textContent = place;
  const c = r.current;
  const b = bandInfo(c.band?.key);
  const badge = $('aqiBadge');
  badge.style.backgroundColor = b.color;
  badge.style.color = b.text;
  $('aqiValue').textContent = c.usAqi ?? '—';
  $('aqiBand').textContent = b[state.lang];
  $('naqi').textContent = c.naqi ? `${t('naqi')}: ${c.naqi.index} – ${state.lang === 'hi' ? c.naqi.labelHi : c.naqi.label}` : '';
  $('pm25').textContent = fmt(c.pm25);
  $('pm10').textContent = fmt(c.pm10);
  $('no2').textContent = fmt(c.no2);
  $('updatedAt').textContent = `${String(c.time).replace('T', ' ')} (${r.timezone})`;
  const win = (w) => (w ? `${w.label}${w.tomorrow ? ` (${t('tomorrow')})` : ''} · ${t('avg')} ${w.avgAqi}` : '—');
  $('bestWindow').textContent = win(r.best);
  $('worstWindow').textContent = win(r.worst);

  // bar chart (decorative, described by summary + table)
  const chart = $('chart');
  const max = Math.max(200, ...r.forecast.map((h) => h.usAqi));
  chart.replaceChildren(
    ...r.forecast.map((h, i) => {
      const info = bandInfo(h.band);
      const bar = el('span', { cls: 'bar', attrs: { 'aria-hidden': 'true', title: `${h.time.slice(11, 16)} · AQI ${h.usAqi}` } });
      bar.style.height = `${Math.max(4, (h.usAqi / max) * 100)}%`;
      bar.style.backgroundColor = info.color;
      const col = el('span', { cls: 'bar-col' }, [bar, el('span', { cls: 'bar-label', text: i % 3 === 0 ? h.time.slice(11, 13) : '', attrs: { 'aria-hidden': 'true' } })]);
      return col;
    }),
  );
  const vals = r.forecast.map((h) => h.usAqi);
  $('chartSummary').textContent = vals.length
    ? STRINGS[state.lang].chartSummary(Math.min(...vals), Math.max(...vals), r.best?.label || '—', r.worst?.label || '—')
    : '';
  chart.setAttribute('aria-label', t('forecastTitle'));

  $('forecastBody').replaceChildren(
    ...r.forecast.map((h) =>
      el('tr', {}, [el('td', { text: h.time.slice(11, 16) }), el('td', { text: h.usAqi }), el('td', { text: bandInfo(h.band)[state.lang] }), el('td', { text: h.pm25 ?? '—' })]),
    ),
  );
}

function itemCard(item, withTime) {
  const head = el('div', { cls: 'item-head' }, [
    withTime && item.time ? el('span', { cls: 'time', text: item.time }) : null,
    el('h4', { text: item.title }),
  ]);
  return el('li', { cls: 'item' }, [
    head,
    item.detail ? el('p', { text: item.detail }) : null,
    el('p', { cls: 'impact' }, [el('strong', { text: `${t('impact')}: ` }), document.createTextNode(item.impact)]),
  ]);
}

function renderPlan(res) {
  const { plan, source, lang } = res;
  const body = $('planBody');
  body.setAttribute('lang', lang);
  $('planSource').textContent = source === 'gemini' ? `✦ ${t('srcGemini')}` : t('srcFallback');
  $('planSource').classList.toggle('pill-warn', source !== 'gemini');
  const section = (key, items, withTime) =>
    items && items.length
      ? el('section', { cls: `plan-block plan-${key}`, attrs: { 'aria-label': t(key) } }, [el('h3', { text: t(key) }), el('ul', { cls: 'items' }, items.map((i) => itemCard(i, withTime)))])
      : null;
  const alerts = plan.healthAlerts && plan.healthAlerts.length
    ? el('section', { cls: 'plan-block alerts', attrs: { role: 'note', 'aria-label': t('healthAlerts') } }, [el('h3', { text: `⚠ ${t('healthAlerts')}` }), el('ul', {}, plan.healthAlerts.map((a) => el('li', { text: a })))])
    : null;
  body.replaceChildren(
    ...[el('p', { cls: 'summary', text: plan.summary }), alerts, section('routine', plan.routine, true), section('indoorHacks', plan.indoorHacks), section('sustainableAlternatives', plan.sustainableAlternatives)].filter(Boolean),
  );
}

// ---------- flows ----------
async function loadPlan() {
  const section = $('planSection');
  section.hidden = false;
  if (state.plans[state.lang]) {
    renderPlan(state.plans[state.lang]);
    return;
  }
  section.setAttribute('aria-busy', 'true');
  $('planBody').replaceChildren(el('div', { cls: 'skeleton', attrs: { 'aria-hidden': 'true' } }), el('div', { cls: 'skeleton', attrs: { 'aria-hidden': 'true' } }));
  setStatus(t('loadingPlan'));
  try {
    const res = await api('/api/plan', { location: state.location, profile: state.profile, lang: state.lang });
    state.plans[res.lang] = res;
    renderPlan(res);
    setStatus(t('planReady'));
  } catch (err) {
    $('planBody').replaceChildren(el('p', { cls: 'error', text: err.message }));
    setStatus(err.message, true);
  } finally {
    section.setAttribute('aria-busy', 'false');
  }
}

async function analyse() {
  const btn = $('submitBtn');
  btn.disabled = true;
  setStatus(t('loadingAir'));
  try {
    const q = state.location.city
      ? `city=${encodeURIComponent(state.location.city)}`
      : `lat=${state.location.lat}&lon=${state.location.lon}`;
    state.report = await api(`/api/air?${q}`);
    state.plans = {};
    state.history = [];
    $('chatLog').replaceChildren();
    $('suggestions').replaceChildren();
    renderAir(state.report);
    $('airTitle').focus();
    $('chatSection').hidden = false;
    await loadPlan(); // lazy: AI only runs after air data is shown
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function addChat(role, text, lang) {
  const msg = el('div', { cls: `msg msg-${role}`, attrs: lang ? { lang } : {} }, [
    el('span', { cls: 'who', text: role === 'user' ? t('you') : t('bot') }),
    el('p', { text }),
  ]);
  $('chatLog').append(msg);
  msg.scrollIntoView({ block: 'nearest' });
}

async function ask(message) {
  addChat('user', message);
  const input = $('chatInput');
  input.value = '';
  input.disabled = true;
  setStatus(t('thinking'));
  try {
    const res = await api('/api/chat', { location: state.location, profile: state.profile, lang: state.lang, message, history: state.history });
    state.history.push({ role: 'user', text: message }, { role: 'assistant', text: res.answer });
    state.history = state.history.slice(-6);
    addChat('assistant', res.answer, state.lang);
    $('suggestions').replaceChildren(
      ...(res.followUps || []).map((q) => {
        const b = el('button', { cls: 'chip', text: q, attrs: { type: 'button' } });
        b.addEventListener('click', () => ask(q));
        return b;
      }),
    );
    setStatus('');
  } catch (err) {
    addChat('assistant', err.message);
    setStatus(err.message, true);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function init() {
  const form = $('profileForm');
  restore(form);
  applyLang();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const city = $('city').value.trim();
    const err = $('cityError');
    if (!CITY_RE.test(city)) {
      err.textContent = t('errCity');
      $('city').setAttribute('aria-invalid', 'true');
      $('city').focus();
      return;
    }
    err.textContent = '';
    $('city').removeAttribute('aria-invalid');
    state.location = { city };
    state.profile = readProfile(form);
    save();
    analyse();
  });

  $('geoBtn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return setStatus(t('errGeo'), true);
    setStatus(t('loadingAir'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.location = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        state.profile = readProfile(form);
        analyse();
      },
      () => setStatus(t('errGeo'), true),
      { timeout: 10000, maximumAge: 600000 },
    );
    return undefined;
  });

  $('langToggle').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'hi' : 'en';
    applyLang();
    save();
    if (state.report) loadPlan();
  });

  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = $('chatInput').value.trim().slice(0, 500);
    if (msg && state.report) ask(msg);
  });
}

init();
