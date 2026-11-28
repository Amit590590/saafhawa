// @ts-check
'use strict';

/**
 * Central configuration: every tunable number and string used by the server lives here,
 * so behaviour can be reviewed and changed in one place.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Default Gemini model (override with the GEMINI_MODEL env var). */
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Default HTTP port for the local server (override with the PORT env var). */
const DEFAULT_PORT = 8080;

/** Per-IP rate limits for the API. */
const RATE_LIMITS = Object.freeze({
  windowMs: 10 * MINUTE_MS,
  api: 120,
  ai: 20,
});

/** Maximum accepted JSON request body. */
const JSON_BODY_LIMIT = '8kb';

/** Cache lifetime for static assets served by Express (HTML is always revalidated). */
const STATIC_MAX_AGE = '1h';

/** Gemini request settings per endpoint. */
const GEMINI = Object.freeze({
  apiBase: 'https://generativelanguage.googleapis.com/v1beta/models',
  timeoutMs: 25000,
  defaultTemperature: 0.4,
  defaultMaxOutputTokens: 8192,
  plan: Object.freeze({ temperature: 0.4 }),
  chat: Object.freeze({ temperature: 0.5, maxOutputTokens: 4096 }),
  errorDetailChars: 300,
});

/** Open-Meteo endpoints and cache settings. */
const OPEN_METEO = Object.freeze({
  geoUrl: 'https://geocoding-api.open-meteo.com/v1/search',
  airUrl: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  timeoutMs: 8000,
  airTtlMs: 10 * MINUTE_MS,
  airMaxEntries: 300,
  geoTtlMs: 24 * HOUR_MS,
  geoMaxEntries: 1000,
  forecastHours: 24,
  forecastDays: '2',
  currentFields: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,carbon_monoxide',
  hourlyFields: 'us_aqi,pm2_5,pm10',
  sourceLabel: 'Open-Meteo Air Quality API (CAMS)',
});

/** Content-Security-Policy directives shared by Express (helmet). Mirrors vercel.json. */
const CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
});

const PERMISSIONS_POLICY = 'geolocation=(self), camera=(), microphone=()';

/** User-facing API error messages (kept generic: never leak internals). */
const MESSAGES = Object.freeze({
  tooManyRequests: 'Too many requests, please slow down.',
  aiLimit: 'AI request limit reached, try again in a few minutes.',
  cityNotFound: 'City not found. Try a nearby larger city.',
  airUnavailable: 'Air quality data is temporarily unavailable.',
  notFound: 'Not found',
  invalidJson: 'Invalid JSON body',
  bodyTooLarge: 'Request body too large',
  internal: 'Internal server error',
});

module.exports = {
  MINUTE_MS,
  HOUR_MS,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  RATE_LIMITS,
  JSON_BODY_LIMIT,
  STATIC_MAX_AGE,
  GEMINI,
  OPEN_METEO,
  CSP_DIRECTIVES,
  PERMISSIONS_POLICY,
  MESSAGES,
};
