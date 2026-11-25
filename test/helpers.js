'use strict';

/** Shared fixtures + a URL-routed fetch mock for Open-Meteo and Gemini. */

function airFixture() {
  const time = [];
  const us_aqi = [];
  const pm2_5 = [];
  const pm10 = [];
  for (let d = 25; d <= 26; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      time.push(`2026-11-${d}T${String(h).padStart(2, '0')}:00`);
      // smoggy mornings/nights, cleaner afternoons
      const aqi = h >= 13 && h <= 16 ? 120 : h >= 6 && h <= 9 ? 260 : 190;
      us_aqi.push(aqi);
      pm2_5.push(aqi / 2);
      pm10.push(aqi);
    }
  }
  return {
    latitude: 23.25,
    longitude: 77.41,
    timezone: 'Asia/Kolkata',
    current: { time: '2026-11-25T09:00', us_aqi: 260, pm2_5: 130.4, pm10: 210.2, nitrogen_dioxide: 40.1, carbon_monoxide: 900 },
    hourly: { time, us_aqi, pm2_5, pm10 },
  };
}

const geoFixture = {
  results: [{ name: 'Bhopal', admin1: 'Madhya Pradesh', country: 'India', country_code: 'IN', latitude: 23.25, longitude: 77.40 }],
};

const planFixture = {
  summary: 'Very unhealthy air this morning; go out between 13:00 and 15:00.',
  routine: [{ time: '13:00', title: 'Walk', detail: 'Short walk in the cleanest window.', impact: '~54% lower PM2.5 dose (approx.)' }],
  indoorHacks: [{ title: 'Seal windows', detail: 'Use wet towels.', impact: '~25% lower indoor PM2.5' }],
  sustainableAlternatives: [{ title: 'Take metro', detail: '3 days/week', impact: '~3 kg CO2e/day saved' }],
  healthAlerts: ['Kids should wear N95 outside.'],
};

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function geminiResponse(obj) {
  return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
}

/**
 * @param {object} opts
 * @param {Function|object} [opts.gemini] object to return or function(body)->Response
 */
function makeFetch(opts = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith('https://geocoding-api.open-meteo.com')) {
      if (opts.geoEmpty) return jsonResponse({});
      return jsonResponse(geoFixture);
    }
    if (u.startsWith('https://air-quality-api.open-meteo.com')) {
      if (opts.airFail) return jsonResponse({ error: true }, 500);
      return jsonResponse(airFixture());
    }
    if (u.startsWith('https://generativelanguage.googleapis.com')) {
      if (opts.geminiFail) return jsonResponse({ error: { message: 'quota' } }, 429);
      if (typeof opts.gemini === 'function') return opts.gemini(JSON.parse(init.body));
      return geminiResponse(opts.gemini || planFixture);
    }
    throw new Error(`Unexpected fetch ${u}`);
  };
  fn.calls = calls;
  return fn;
}

const silentLogger = { warn() {}, error() {}, log() {} };

module.exports = { airFixture, geoFixture, planFixture, makeFetch, jsonResponse, geminiResponse, silentLogger };
