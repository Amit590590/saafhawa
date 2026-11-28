// @ts-check
'use strict';

const { OPEN_METEO } = require('./config');
const { UpstreamError } = require('./errors');
const { fetchWithTimeout } = require('./http');
const { TTLCache } = require('./cache');
const { usAqiBand, naqiFromPm25, sliceForecast, bestWorstWindows } = require('./aqi');

const GEO_URL = OPEN_METEO.geoUrl;
const AIR_URL = OPEN_METEO.airUrl;
const DEFAULT_PLACE_NAME = 'Your location';

/**
 * @typedef {object} Place
 * @property {string} name
 * @property {string} admin1
 * @property {string} country
 * @property {string} countryCode
 * @property {number} lat
 * @property {number} lon
 */

/**
 * GET a JSON document with a timeout; non-2xx and network errors become UpstreamError.
 * @param {import('./http').FetchLike} fetchImpl
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function fetchJson(fetchImpl, url, timeoutMs) {
  const res = await fetchWithTimeout(
    fetchImpl,
    url,
    { headers: { accept: 'application/json' } },
    timeoutMs,
    (msg) => new UpstreamError(`Upstream ${msg}`),
  );
  if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`);
  return res.json();
}

/**
 * Round a coordinate to 2 decimals (~1 km), which also makes cache keys stable.
 * @param {number} n
 * @returns {number}
 */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Map an Open-Meteo geocoding result to a Place.
 * @param {any} r
 * @returns {Place}
 */
function toPlace(r) {
  return {
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    countryCode: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
  };
}

/**
 * Build the report the UI and the prompts are grounded on from raw Open-Meteo data.
 * @param {Place} place
 * @param {any} data Open-Meteo air-quality response
 * @returns {object} air report
 */
function buildReport(place, data) {
  const c = data.current;
  const forecast = sliceForecast(data.hourly, c.time, OPEN_METEO.forecastHours);
  const { best, worst } = bestWorstWindows(forecast);
  const usAqi = typeof c.us_aqi === 'number' ? c.us_aqi : forecast[0]?.usAqi;
  return {
    place,
    timezone: data.timezone || 'GMT',
    current: {
      time: c.time,
      usAqi: typeof usAqi === 'number' ? Math.round(usAqi) : null,
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      no2: c.nitrogen_dioxide ?? null,
      co: c.carbon_monoxide ?? null,
      band: usAqiBand(usAqi),
      naqi: naqiFromPm25(c.pm2_5),
    },
    forecast,
    best,
    worst,
    source: OPEN_METEO.sourceLabel,
  };
}

/**
 * Open-Meteo client: geocoding + air quality, cached in memory.
 * AQI is cached for 10 min (Open-Meteo updates hourly), geocoding for 24 h.
 * @param {object} [opts]
 * @param {import('./http').FetchLike} [opts.fetchImpl]
 * @param {number} [opts.ttlMs] air-quality cache TTL
 * @param {number} [opts.timeoutMs] per-request timeout
 */
function createAirClient({ fetchImpl = fetch, ttlMs = OPEN_METEO.airTtlMs, timeoutMs = OPEN_METEO.timeoutMs } = {}) {
  const airCache = new TTLCache({ ttlMs, maxEntries: OPEN_METEO.airMaxEntries });
  const geoCache = new TTLCache({ ttlMs: OPEN_METEO.geoTtlMs, maxEntries: OPEN_METEO.geoMaxEntries });

  /**
   * Resolve a city name to coordinates.
   * @param {string} city
   * @returns {Promise<Place>}
   * @throws {UpstreamError} 404 when the city is unknown
   */
  async function geocode(city) {
    return geoCache.getOrLoad(city.toLowerCase(), async () => {
      const query = new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' });
      const data = await fetchJson(fetchImpl, `${GEO_URL}?${query}`, timeoutMs);
      const first = Array.isArray(data?.results) ? data.results[0] : null;
      if (!first) throw new UpstreamError('City not found', 404);
      return toPlace(first);
    });
  }

  /**
   * Fetch current + hourly air quality for coordinates.
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<any>} raw Open-Meteo payload
   */
  async function airQuality(lat, lon) {
    const la = round2(lat);
    const lo = round2(lon);
    return airCache.getOrLoad(`${la},${lo}`, async () => {
      const params = new URLSearchParams({
        latitude: String(la),
        longitude: String(lo),
        current: OPEN_METEO.currentFields,
        hourly: OPEN_METEO.hourlyFields,
        timezone: 'auto',
        forecast_days: OPEN_METEO.forecastDays,
      });
      const data = await fetchJson(fetchImpl, `${AIR_URL}?${params}`, timeoutMs);
      if (!data?.current || !data?.hourly) throw new UpstreamError('Malformed air quality response');
      return data;
    });
  }

  /**
   * Build the air report for a validated location.
   * @param {{city?: string, lat?: number, lon?: number, label?: string}} location
   * @returns {Promise<object>}
   */
  async function getReport(location) {
    const place = location.city
      ? await geocode(location.city)
      : {
          name: location.label || DEFAULT_PLACE_NAME,
          admin1: '',
          country: '',
          countryCode: '',
          lat: /** @type {number} */ (location.lat),
          lon: /** @type {number} */ (location.lon),
        };
    const data = await airQuality(place.lat, place.lon);
    return buildReport(place, data);
  }

  return { geocode, airQuality, getReport, _caches: { airCache, geoCache } };
}

module.exports = { createAirClient, buildReport, UpstreamError, GEO_URL, AIR_URL, DEFAULT_PLACE_NAME };
