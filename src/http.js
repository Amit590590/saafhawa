// @ts-check
'use strict';

/**
 * Shared outbound-HTTP helper: every upstream call goes through here so it always has a
 * timeout and network failures are mapped to a typed AppError.
 */

/**
 * @typedef {(input: string, init?: RequestInit) => Promise<Response>} FetchLike
 */

/**
 * Perform a fetch with a timeout, wrapping network/abort failures in `makeError`.
 * @param {FetchLike} fetchImpl fetch implementation (injectable for tests)
 * @param {string} url
 * @param {RequestInit} init request options (a timeout signal is added)
 * @param {number} timeoutMs
 * @param {(message: string) => Error} makeError builds the error thrown on failure
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs, makeError) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : 'error';
    throw makeError(`request failed: ${name || 'error'}`);
  }
}

module.exports = { fetchWithTimeout };
