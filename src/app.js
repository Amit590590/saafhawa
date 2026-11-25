'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');

const { validateLocation, validateProfile, validateChat, validateLang } = require('./validate');
const { createAirClient } = require('./openmeteo');
const { createGeminiClient } = require('./gemini');
const { SYSTEM_INSTRUCTION, PLAN_SCHEMA, CHAT_SCHEMA, buildPlanPrompt, buildChatPrompt, sanitizePlan, sanitizeChat } = require('./prompt');
const { buildFallbackPlan, fallbackChat } = require('./fallback');

/**
 * Build the Express app. Dependencies are injectable so tests can mock Gemini/Open-Meteo.
 * @param {object} opts
 * @param {Function} [opts.fetchImpl] fetch implementation used for all upstream calls
 * @param {string} [opts.apiKey] Gemini API key (defaults to env GEMINI_API_KEY)
 * @param {string} [opts.model] Gemini model (defaults to env GEMINI_MODEL or gemini-3.5-flash)
 * @param {{windowMs:number, api:number, ai:number}} [opts.limits] rate limits per IP
 * @param {Console} [opts.logger]
 */
function createApp(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const logger = opts.logger || console;
  const air = opts.airClient || createAirClient({ fetchImpl });
  const gemini =
    opts.geminiClient ||
    createGeminiClient({
      apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY,
      model: opts.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      fetchImpl,
    });
  const limits = { windowMs: 10 * 60 * 1000, api: 120, ai: 20, ...(opts.limits || {}) };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run / Render sit behind one proxy hop

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
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
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    next();
  });
  app.use(compression());

  const apiLimiter = rateLimit({ windowMs: limits.windowMs, limit: limits.api, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests, please slow down.' } });
  const aiLimiter = rateLimit({ windowMs: limits.windowMs, limit: limits.ai, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'AI request limit reached, try again in a few minutes.' } });

  app.use('/api', apiLimiter, express.json({ limit: '8kb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ---- helpers ----
  const sendError = (res, status, message) => res.status(status).json({ error: message });

  async function reportFor(locationInput, res) {
    const loc = validateLocation(locationInput);
    if (!loc.ok) {
      sendError(res, 400, loc.errors.join('; '));
      return null;
    }
    try {
      return await air.getReport(loc.value);
    } catch (err) {
      const status = err.status === 404 ? 404 : 502;
      sendError(res, status, status === 404 ? 'City not found. Try a nearby larger city.' : 'Air quality data is temporarily unavailable.');
      if (status !== 404) logger.warn('[air]', err.message);
      return null;
    }
  }

  // ---- routes ----
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, ai: gemini.available, model: gemini.model });
  });

  app.get('/api/air', async (req, res) => {
    const report = await reportFor({ city: req.query.city, lat: req.query.lat, lon: req.query.lon, label: req.query.label }, res);
    if (report) res.json(report);
  });

  app.post('/api/plan', aiLimiter, async (req, res) => {
    const profile = validateProfile(req.body?.profile);
    if (!profile.ok) return sendError(res, 400, profile.errors.join('; '));
    const lang = validateLang(req.body?.lang);
    const report = await reportFor(req.body?.location, res);
    if (!report) return undefined;

    if (gemini.available) {
      try {
        const raw = await gemini.generateJson({
          system: SYSTEM_INSTRUCTION,
          prompt: buildPlanPrompt(report, profile.value, lang),
          schema: PLAN_SCHEMA,
          temperature: 0.4,
        });
        const plan = sanitizePlan(raw);
        if (plan) return res.json({ source: 'gemini', model: gemini.model, lang, plan });
        logger.warn('[plan] Gemini output failed validation; using fallback');
      } catch (err) {
        logger.warn('[plan]', err.message);
      }
    }
    return res.json({ source: 'fallback', lang, plan: buildFallbackPlan(report, profile.value, lang) });
  });

  app.post('/api/chat', aiLimiter, async (req, res) => {
    const chat = validateChat(req.body);
    if (!chat.ok) return sendError(res, 400, chat.errors.join('; '));
    const profile = validateProfile(req.body?.profile);
    if (!profile.ok) return sendError(res, 400, profile.errors.join('; '));
    const lang = validateLang(req.body?.lang);
    const report = await reportFor(req.body?.location, res);
    if (!report) return undefined;

    if (gemini.available) {
      try {
        const raw = await gemini.generateJson({
          system: SYSTEM_INSTRUCTION,
          prompt: buildChatPrompt(report, profile.value, chat.value.history, chat.value.message, lang),
          schema: CHAT_SCHEMA,
          temperature: 0.5,
          maxOutputTokens: 800,
        });
        const reply = sanitizeChat(raw);
        if (reply) return res.json({ source: 'gemini', ...reply });
      } catch (err) {
        logger.warn('[chat]', err.message);
      }
    }
    return res.json({ source: 'fallback', ...fallbackChat(report, lang) });
  });

  app.use('/api', (req, res) => sendError(res, 404, 'Not found'));

  // ---- static frontend ----
  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // ---- error handler: never leak stack traces ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return sendError(res, 400, 'Invalid JSON body');
    if (err.type === 'entity.too.large') return sendError(res, 413, 'Request body too large');
    logger.error('[error]', err.message);
    return sendError(res, 500, 'Internal server error');
  });

  return app;
}

module.exports = { createApp };
