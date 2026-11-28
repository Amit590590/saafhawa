// @ts-check
/**
 * Thin JSON client for the SaafHawa API. Errors surface the server's generic message.
 */
import { REQUEST_TIMEOUT_MS } from './config.js';
import { t } from './state.js';

/**
 * GET (no body) or POST (JSON body) to an API path.
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>} parsed JSON response
 * @throws {Error} with a user-facing message on non-2xx responses
 */
export async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('errGeneric'));
  return data;
}
