// @ts-check
/**
 * Renders the live air card: AQI badge, pollutants, best/worst windows, chart and hourly table.
 */
import { EMPTY } from './config.js';
import { $, el } from './dom.js';
import { state, t } from './state.js';
import { bandInfo, formatConcentration, windowText, placeLabel, clockTime } from './format.js';
import { renderChart } from './chart.js';

/**
 * Colour the AQI badge and show the band label.
 * @param {any} current report.current
 * @returns {void}
 */
function renderBadge(current) {
  const b = bandInfo(current.band?.key);
  const badge = $('aqiBadge');
  badge.style.backgroundColor = b.color;
  badge.style.color = b.text;
  $('aqiValue').textContent = current.usAqi ?? EMPTY;
  $('aqiBand').textContent = b[state.lang];
}

/**
 * Pollutant values, India NAQI and update time.
 * @param {any} r air report
 * @returns {void}
 */
function renderDetails(r) {
  const c = r.current;
  const naqiLabel = c.naqi && (state.lang === 'hi' ? c.naqi.labelHi : c.naqi.label);
  $('naqi').textContent = c.naqi ? `${t('naqi')}: ${c.naqi.index} – ${naqiLabel}` : '';
  $('pm25').textContent = formatConcentration(c.pm25);
  $('pm10').textContent = formatConcentration(c.pm10);
  $('no2').textContent = formatConcentration(c.no2);
  $('updatedAt').textContent = `${String(c.time).replace('T', ' ')} (${r.timezone})`;
  $('bestWindow').textContent = windowText(r.best, t);
  $('worstWindow').textContent = windowText(r.worst, t);
}

/**
 * Accessible hourly table that mirrors the chart.
 * @param {import('./chart.js').ForecastHour[]} forecast
 * @returns {void}
 */
function renderTable(forecast) {
  $('forecastBody').replaceChildren(
    ...forecast.map((h) =>
      el('tr', {}, [
        el('td', { text: clockTime(h.time) }),
        el('td', { text: h.usAqi }),
        el('td', { text: bandInfo(h.band)[state.lang] }),
        el('td', { text: h.pm25 ?? EMPTY }),
      ]),
    ),
  );
}

/**
 * Render the whole air section for a report.
 * @param {any} r /api/air response
 * @returns {void}
 */
export function renderAir(r) {
  $('airSection').hidden = false;
  $('placeName').textContent = placeLabel(r.place, t('myLocation'));
  renderBadge(r.current);
  renderDetails(r);
  renderChart(r);
  renderTable(r.forecast);
}
