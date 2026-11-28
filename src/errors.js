// @ts-check
'use strict';

/**
 * One error hierarchy for the whole server. Every expected failure is an AppError carrying
 * an HTTP status; anything else is treated as an unexpected 500 by the error middleware.
 */
class AppError extends Error {
  /**
   * @param {string} message internal message (logged, never sent to clients verbatim)
   * @param {number} [status=500] HTTP status that best describes the failure
   */
  constructor(message, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

/** A third-party HTTP API (Open-Meteo) failed or returned something unusable. */
class UpstreamError extends AppError {
  /**
   * @param {string} message
   * @param {number} [status=502]
   */
  constructor(message, status = 502) {
    super(message, status);
  }
}

/** The Gemini API failed, timed out, or returned unusable output. */
class GeminiError extends AppError {
  /** @param {string} message */
  constructor(message) {
    super(message, 502);
  }
}

/**
 * Send a JSON error body `{ error }` with the given status.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 * @returns {import('express').Response}
 */
function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = { AppError, UpstreamError, GeminiError, sendError };
