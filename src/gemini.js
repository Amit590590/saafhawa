// @ts-check
'use strict';

/**
 * Minimal Gemini REST client (no SDK dependency). Runs server-side only; the API key
 * is sent in the `x-goog-api-key` header and never leaves the server.
 * Uses structured output: responseMimeType=application/json + responseSchema.
 */

const { DEFAULT_MODEL, GEMINI } = require('./config');
const { GeminiError } = require('./errors');
const { fetchWithTimeout } = require('./http');

const API_BASE = GEMINI.apiBase;

const SAFETY_SETTINGS = Object.freeze([
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
]);

/**
 * @typedef {object} GenerateOptions
 * @property {string} system system instruction
 * @property {string} prompt user prompt
 * @property {object} schema Gemini responseSchema
 * @property {number} [temperature]
 * @property {number} [maxOutputTokens]
 */

/**
 * @typedef {object} GeminiClient
 * @property {boolean} available true when an API key is configured
 * @property {string} model model id used for requests
 * @property {(opts: GenerateOptions) => Promise<any>} generateJson
 */

/**
 * Model-specific thinking settings: structured, grounded tasks need little reasoning,
 * and on Gemini 3.x light thinking keeps the JSON from being truncated.
 * @param {string} model
 * @returns {object} partial generationConfig
 */
function thinkingConfigFor(model) {
  if (model.startsWith('gemini-2.5-flash')) return { thinkingConfig: { thinkingBudget: 0 } };
  if (/^gemini-3/.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  return {};
}

/**
 * Build the generateContent request body.
 * @param {string} model
 * @param {GenerateOptions} opts
 * @returns {object}
 */
function buildRequestBody(model, { system, prompt, schema, temperature, maxOutputTokens }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: temperature ?? GEMINI.defaultTemperature,
      maxOutputTokens: maxOutputTokens ?? GEMINI.defaultMaxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
      ...thinkingConfigFor(model),
    },
    safetySettings: SAFETY_SETTINGS,
  };
}

/**
 * Extract and parse the JSON text from a generateContent response payload.
 * @param {any} data parsed response body
 * @returns {any} the model's JSON output
 * @throws {GeminiError} when there is no content or it is not valid JSON
 */
function parseCandidateJson(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new GeminiError('Gemini returned no content');
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
}

/**
 * Read a short error detail from a failed response without ever throwing.
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function readErrorDetail(res) {
  try {
    return (await res.text()).slice(0, GEMINI.errorDetailChars);
  } catch {
    return '';
  }
}

/**
 * Create a Gemini client.
 * @param {object} [opts]
 * @param {string} [opts.apiKey] Gemini API key; the client is unavailable without one
 * @param {string} [opts.model]
 * @param {import('./http').FetchLike} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @returns {GeminiClient}
 */
function createGeminiClient({ apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, timeoutMs = GEMINI.timeoutMs } = {}) {
  const available = typeof apiKey === 'string' && apiKey.trim().length > 0;

  /** @type {GeminiClient['generateJson']} */
  async function generateJson(opts) {
    if (!available) throw new GeminiError('Gemini API key not configured');
    const res = await fetchWithTimeout(
      fetchImpl,
      `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': /** @type {string} */ (apiKey) },
        body: JSON.stringify(buildRequestBody(model, opts)),
      },
      timeoutMs,
      (msg) => new GeminiError(`Gemini ${msg}`),
    );
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      throw new GeminiError(`Gemini responded ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return parseCandidateJson(await res.json());
  }

  return { available, model, generateJson };
}

module.exports = { createGeminiClient, GeminiError, API_BASE, buildRequestBody, parseCandidateJson, thinkingConfigFor };
