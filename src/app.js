// @ts-check
'use strict';

const path = require('node:path');
const express = require('express');
const compression = require('compression');

const { DEFAULT_MODEL, RATE_LIMITS, JSON_BODY_LIMIT, STATIC_MAX_AGE, GEMINI, MESSAGES } = require('./config');
const { sendError } = require('./errors');
const { securityHeaders, createLimiter, noStore, apiNotFound, errorHandler } = require('./middleware');
const { validateLocation, validateProfile, validateChat, validateLang } = require('./validate');
const { createAirClient } = require('./openmeteo');
const { createGeminiClient } = require('./gemini');
const { SYSTEM_INSTRUCTION, PLAN_SCHEMA, CHAT_SCHEMA, buildPlanPrompt, buildChatPrompt, sanitizePlan, sanitizeChat } = require('./prompt');
const { buildFallbackPlan, fallbackChat } = require('./fallback');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * @typedef {object} AppOptions
 * @property {import('./http').FetchLike} [fetchImpl] fetch implementation used for all upstream calls
 * @property {string} [apiKey] Gemini API key (defaults to env GEMINI_API_KEY)
 * @property {string} [model] Gemini model (defaults to env GEMINI_MODEL or DEFAULT_MODEL)
 * @property {Partial<typeof RATE_LIMITS>} [limits] rate limits per IP
 * @property {Pick<Console, 'warn' | 'error'>} [logger]
 * @property {ReturnType<typeof createAirClient>} [airClient] injectable Open-Meteo client
 * @property {import('./gemini').GeminiClient} [geminiClient] injectable Gemini client
 */

/**
 * Build the Express app. Dependencies are injectable so tests can mock Gemini/Open-Meteo.
 * @param {AppOptions} [opts]
 * @returns {import('express').Express}
 */
function createApp(opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const logger = opts.logger || console;
  const air = opts.airClient || createAirClient({ fetchImpl });
  const gemini =
    opts.geminiClient ||
    createGeminiClient({
      apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY,
      model: opts.model || process.env.GEMINI_MODEL || DEFAULT_MODEL,
      fetchImpl,
    });
  const limits = { ...RATE_LIMITS, ...(opts.limits || {}) };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Vercel's edge sits one proxy hop in front of the function

  for (const middleware of securityHeaders()) app.use(middleware);
  app.use(compression());

  const apiLimiter = createLimiter(limits.windowMs, limits.api, MESSAGES.tooManyRequests);
  const aiLimiter = createLimiter(limits.windowMs, limits.ai, MESSAGES.aiLimit);
  app.use('/api', apiLimiter, express.json({ limit: JSON_BODY_LIMIT }), noStore);

  /**
   * Validate a location and load its air report. On failure the error response is sent
   * and null is returned, so route handlers can simply stop.
   * @param {unknown} locationInput
   * @param {import('express').Response} res
   * @returns {Promise<object | null>}
   */
  async function reportFor(locationInput, res) {
    const loc = validateLocation(locationInput);
    if (!loc.ok) {
      sendError(res, 400, loc.errors.join('; '));
      return null;
    }
    try {
      return await air.getReport(loc.value);
    } catch (err) {
      if (err.status === 404) {
        sendError(res, 404, MESSAGES.cityNotFound);
      } else {
        sendError(res, 502, MESSAGES.airUnavailable);
        logger.warn('[air]', err.message);
      }
      return null;
    }
  }

  /**
   * Ask Gemini for structured JSON and sanitise it; returns null (and logs) when Gemini is
   * unavailable, fails, or its output does not validate, so the caller can fall back.
   * @template T
   * @param {string} tag log tag
   * @param {import('./gemini').GenerateOptions} request
   * @param {(raw: any) => T | null} sanitize
   * @returns {Promise<T | null>}
   */
  async function tryGemini(tag, request, sanitize) {
    if (!gemini.available) return null;
    try {
      const result = sanitize(await gemini.generateJson(request));
      if (!result) logger.warn(`[${tag}] Gemini output failed validation; using fallback`);
      return result;
    } catch (err) {
      logger.warn(`[${tag}]`, err.message);
      return null;
    }
  }

  // ---- routes ----
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, ai: gemini.available, model: gemini.model });
  });

  app.get('/api/air', async (req, res) => {
    const { city, lat, lon, label } = req.query;
    const report = await reportFor({ city, lat, lon, label }, res);
    if (report) res.json(report);
  });

  app.post('/api/plan', aiLimiter, async (req, res) => {
    const profile = validateProfile(req.body?.profile);
    if (!profile.ok) return sendError(res, 400, profile.errors.join('; '));
    const lang = validateLang(req.body?.lang);
    const report = await reportFor(req.body?.location, res);
    if (!report) return undefined;

    const plan = await tryGemini(
      'plan',
      { system: SYSTEM_INSTRUCTION, prompt: buildPlanPrompt(report, profile.value, lang), schema: PLAN_SCHEMA, ...GEMINI.plan },
      sanitizePlan,
    );
    if (plan) return res.json({ source: 'gemini', model: gemini.model, lang, plan });
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

    const { history, message } = chat.value;
    const reply = await tryGemini(
      'chat',
      {
        system: SYSTEM_INSTRUCTION,
        prompt: buildChatPrompt(report, profile.value, history, message, lang),
        schema: CHAT_SCHEMA,
        ...GEMINI.chat,
      },
      sanitizeChat,
    );
    if (reply) return res.json({ source: 'gemini', ...reply });
    return res.json({ source: 'fallback', ...fallbackChat(report, lang) });
  });

  app.use('/api', apiNotFound);

  // ---- static frontend (local server; on Vercel `public/` is served by the CDN) ----
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: STATIC_MAX_AGE,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.use(errorHandler(logger));
  return app;
}

module.exports = { createApp };
