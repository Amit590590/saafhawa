// @ts-check
/**
 * 24-hour AQI bar chart. Decorative (aria-hidden bars); described by a text summary and the table.
 */
import { CHART_MIN_SCALE, CHART_MIN_BAR_PCT, CHART_LABEL_STEP, EMPTY } from './config.js';
import { $, el } from './dom.js';
import { strings, t } from './state.js';
import { bandInfo, clockTime, barHeightPct } from './format.js';

/** @typedef {{time: string, usAqi: number, band: string, pm25: number | null}} ForecastHour */

/**
 * One bar column with its hour label.
 * @param {ForecastHour} h
 * @param {number} i index in the forecast
 * @param {number} max chart scale
 * @returns {HTMLElement}
 */
function barColumn(h, i, max) {
  const bar = el('span', { cls: 'bar', attrs: { 'aria-hidden': 'true', title: `${clockTime(h.time)} · AQI ${h.usAqi}` } });
  bar.style.height = `${barHeightPct(h.usAqi, max, CHART_MIN_BAR_PCT)}%`;
  bar.style.backgroundColor = bandInfo(h.band).color;
  const label = el('span', {
    cls: 'bar-label',
    text: i % CHART_LABEL_STEP === 0 ? h.time.slice(11, 13) : '',
    attrs: { 'aria-hidden': 'true' },
  });
  return el('span', { cls: 'bar-col' }, [bar, label]);
}

/**
 * Render the chart and its screen-reader summary.
 * @param {{forecast: ForecastHour[], best?: {label: string} | null, worst?: {label: string} | null}} report
 * @returns {void}
 */
export function renderChart(report) {
  const chart = $('chart');
  const vals = report.forecast.map((h) => h.usAqi);
  const max = Math.max(CHART_MIN_SCALE, ...vals);
  chart.replaceChildren(...report.forecast.map((h, i) => barColumn(h, i, max)));
  $('chartSummary').textContent = vals.length
    ? strings().chartSummary(Math.min(...vals), Math.max(...vals), report.best?.label || EMPTY, report.worst?.label || EMPTY)
    : '';
  chart.setAttribute('aria-label', t('forecastTitle'));
}
