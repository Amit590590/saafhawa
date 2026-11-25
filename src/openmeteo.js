'use strict';

const { TTLCache } = require('./cache');
const { usAqiBand, naqiFromPm25, sliceForecast, bestWorstWindows } = require('./aqi');

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (err) {
    throw new UpstreamError(`Upstream request failed: ${err.name || 'error'}`);
  }
  if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`);
  return res.json();
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Open-Meteo client: geocoding + air quality, cached in memory.
 * AQI is cached for 10 min (Open-Meteo updates hourly), geocoding for 24 h.
 */
function createAirClient({ fetchImpl = fetch, ttlMs = 10 * 60 * 1000, timeoutMs = 8000 } = {}) {
  const airCache = new TTLCache({ ttlMs, maxEntries: 300 });
  const geoCache = new TTLCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1000 });

  async function geocode(city) {
    const key = city.toLowerCase();
    return geoCache.getOrLoad(key, async () => {
      const url = `${GEO_URL}?${new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' })}`;
      const data = await fetchJson(fetchImpl, url, timeoutMs);
      const r = data && Array.isArray(data.results) ? data.results[0] : null;
      if (!r) throw new UpstreamError('City not found', 404);
      return {
        name: r.name,
        admin1: r.admin1 || '',
        country: r.country || '',
        countryCode: r.country_code || '',
        lat: r.latitude,
        lon: r.longitude,
      };
    });
  }

  async function airQuality(lat, lon) {
    const la = round2(lat);
    const lo = round2(lon);
    return airCache.getOrLoad(`${la},${lo}`, async () => {
      const params = new URLSearchParams({
        latitude: String(la),
        longitude: String(lo),
        current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,carbon_monoxide',
        hourly: 'us_aqi,pm2_5,pm10',
        timezone: 'auto',
        forecast_days: '2',
      });
      const data = await fetchJson(fetchImpl, `${AIR_URL}?${params}`, timeoutMs);
      if (!data || !data.current || !data.hourly) throw new UpstreamError('Malformed air quality response');
      return data;
    });
  }

  /** Build the report the UI and the prompts are grounded on. */
  async function getReport(location) {
    let place;
    if (location.city) {
      place = await geocode(location.city);
    } else {
      place = { name: location.label || 'Your location', admin1: '', country: '', countryCode: '', lat: location.lat, lon: location.lon };
    }
    const data = await airQuality(place.lat, place.lon);
    const c = data.current;
    const forecast = sliceForecast(data.hourly, c.time, 24);
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
      source: 'Open-Meteo Air Quality API (CAMS)',
    };
  }

  return { geocode, airQuality, getReport, _caches: { airCache, geoCache } };
}

module.exports = { createAirClient, UpstreamError, GEO_URL, AIR_URL };
