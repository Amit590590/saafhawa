// @ts-check
/**
 * Renders the clean-air plan as cards. Model output is only ever set as text.
 */
import { $, el } from './dom.js';
import { t } from './state.js';

/** @typedef {{time?: string, title: string, detail?: string, impact: string}} PlanItem */

/**
 * One plan card with its "Impact" line.
 * @param {PlanItem} item
 * @param {boolean} [withTime=false] show the clock time (routine items)
 * @returns {HTMLElement}
 */
export function itemCard(item, withTime = false) {
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

/**
 * A titled list of plan cards, or null when empty.
 * @param {string} key i18n key and CSS suffix
 * @param {PlanItem[] | undefined} items
 * @param {boolean} [withTime=false]
 * @returns {HTMLElement | null}
 */
function planSection(key, items, withTime = false) {
  if (!items || !items.length) return null;
  return el('section', { cls: `plan-block plan-${key}`, attrs: { 'aria-label': t(key) } }, [
    el('h3', { text: t(key) }),
    el(
      'ul',
      { cls: 'items' },
      items.map((i) => itemCard(i, withTime)),
    ),
  ]);
}

/**
 * Health alerts block, or null when there are none.
 * @param {string[] | undefined} alerts
 * @returns {HTMLElement | null}
 */
function alertsSection(alerts) {
  if (!alerts || !alerts.length) return null;
  return el('section', { cls: 'plan-block alerts', attrs: { role: 'note', 'aria-label': t('healthAlerts') } }, [
    el('h3', { text: `⚠ ${t('healthAlerts')}` }),
    el(
      'ul',
      {},
      alerts.map((a) => el('li', { text: a })),
    ),
  ]);
}

/**
 * Render a /api/plan response.
 * @param {{plan: any, source: string, lang: string}} res
 * @returns {void}
 */
export function renderPlan({ plan, source, lang }) {
  const body = $('planBody');
  body.setAttribute('lang', lang);
  const pill = $('planSource');
  pill.textContent = source === 'gemini' ? `✦ ${t('srcGemini')}` : t('srcFallback');
  pill.classList.toggle('pill-warn', source !== 'gemini');
  const blocks = [
    el('p', { cls: 'summary', text: plan.summary }),
    alertsSection(plan.healthAlerts),
    planSection('routine', plan.routine, true),
    planSection('indoorHacks', plan.indoorHacks),
    planSection('sustainableAlternatives', plan.sustainableAlternatives),
  ];
  body.replaceChildren(.../** @type {HTMLElement[]} */ (blocks.filter(Boolean)));
}

/**
 * Loading skeleton while the plan generates.
 * @returns {void}
 */
export function renderPlanLoading() {
  const skeleton = () => el('div', { cls: 'skeleton', attrs: { 'aria-hidden': 'true' } });
  $('planBody').replaceChildren(skeleton(), skeleton());
}

/**
 * Show an error in place of the plan.
 * @param {string} message
 * @returns {void}
 */
export function renderPlanError(message) {
  $('planBody').replaceChildren(el('p', { cls: 'error', text: message }));
}
