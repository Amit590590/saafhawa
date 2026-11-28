// @ts-check
'use strict';

const { default: helmet } = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { CSP_DIRECTIVES, PERMISSIONS_POLICY, MESSAGES } = require('./config');
const { sendError } = require('./errors');

/** @typedef {import('express').RequestHandler} RequestHandler */
/** @typedef {import('express').ErrorRequestHandler} ErrorRequestHandler */

/**
 * Helmet with a strict CSP (no inline scripts/styles) plus a Permissions-Policy header.
 * @returns {RequestHandler[]}
 */
function securityHeaders() {
  return [
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { ...CSP_DIRECTIVES } },
      crossOriginEmbedderPolicy: false,
    }),
    (req, res, next) => {
      res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
      next();
    },
  ];
}

/**
 * Per-IP rate limiter returning a JSON error body.
 * @param {number} windowMs
 * @param {number} limit max requests per window
 * @param {string} message error message sent with the 429
 * @returns {RequestHandler}
 */
function createLimiter(windowMs, limit, message) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message } });
}

/**
 * API responses carry live data and must never be cached.
 * @type {RequestHandler}
 */
const noStore = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/**
 * JSON 404 for unknown API routes.
 * @type {RequestHandler}
 */
const apiNotFound = (req, res) => {
  sendError(res, 404, MESSAGES.notFound);
};

/**
 * Final error handler: maps body-parser errors to 400/413 and never leaks stack traces.
 * @param {Pick<Console, 'error'>} logger
 * @returns {ErrorRequestHandler}
 */
function errorHandler(logger) {
  // Express recognises error middleware by its 4-argument signature.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return sendError(res, 400, MESSAGES.invalidJson);
    if (err.type === 'entity.too.large') return sendError(res, 413, MESSAGES.bodyTooLarge);
    logger.error('[error]', err.message);
    return sendError(res, 500, MESSAGES.internal);
  };
}

module.exports = { securityHeaders, createLimiter, noStore, apiNotFound, errorHandler };
