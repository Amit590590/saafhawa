'use strict';

/**
 * Minimal Gemini REST client (no SDK dependency). Runs server-side only; the API key
 * is sent in the `x-goog-api-key` header and never leaves the server.
 * Uses structured output: responseMimeType=application/json + responseSchema.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

class GeminiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiError';
  }
}

function createGeminiClient({ apiKey, model = 'gemini-3.5-flash', fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const available = typeof apiKey === 'string' && apiKey.trim().length > 0;

  async function generateJson({ system, prompt, schema, temperature = 0.4, maxOutputTokens = 2048 }) {
    if (!available) throw new GeminiError('Gemini API key not configured');
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: schema,
        // Structured, grounded task: skip extended thinking on 2.5 Flash (when that model is used) for lower latency/cost.
        ...(model.startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new GeminiError(`Gemini request failed: ${err.name || 'error'}`);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      throw new GeminiError(`Gemini responded ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) throw new GeminiError('Gemini returned no content');
    const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new GeminiError('Gemini returned invalid JSON');
    }
  }

  return { available, model, generateJson };
}

module.exports = { createGeminiClient, GeminiError, API_BASE };
