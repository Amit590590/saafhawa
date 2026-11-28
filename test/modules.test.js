'use strict';

/** Tests for modules extracted during the maintainability refactor (server + frontend). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const config = require('../src/config');
const { AppError, UpstreamError, GeminiError, sendError } = require('../src/errors');
const { fetchWithTimeout } = require('../src/http');
const { thinkingConfigFor, parseCandidateJson, buildRequestBody } = require('../src/gemini');
const { buildReport } = require('../src/openmeteo');
const { errorHandler } = require('../src/middleware');
const { airFixture, PUBLIC_DIR, frontendFiles } = require('./helpers');

/** Import a browser ES module from public/ (pure modules only: no DOM at import time). */
const importPublic = (rel) => import(pathToFileURL(path.join(PUBLIC_DIR, rel)).href);

/** Minimal Express-like response recorder. */
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('config is frozen and CSP matches vercel.json', () => {
  assert.ok(Object.isFrozen(config.RATE_LIMITS));
  assert.ok(Object.isFrozen(config.GEMINI));
  assert.equal(config.DEFAULT_MODEL, 'gemini-3.5-flash');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  for (const [directive, values] of Object.entries(config.CSP_DIRECTIVES)) {
    assert.ok(csp.includes(`${directive} ${values.join(' ')}`), `vercel.json CSP is missing ${directive}`);
  }
});

test('error hierarchy carries HTTP status and names', () => {
  const up = new UpstreamError('down');
  const notFound = new UpstreamError('nope', 404);
  const ai = new GeminiError('bad');
  assert.ok(up instanceof AppError && ai instanceof AppError);
  assert.equal(up.status, 502);
  assert.equal(notFound.status, 404);
  assert.equal(ai.status, 502);
  assert.equal(up.name, 'UpstreamError');
  assert.equal(ai.name, 'GeminiError');
  const res = fakeRes();
  sendError(res, 418, 'teapot');
  assert.equal(res.statusCode, 418);
  assert.deepEqual(res.body, { error: 'teapot' });
});

test('fetchWithTimeout passes a signal and maps network failures to the given error', async () => {
  let seen;
  const ok = await fetchWithTimeout(
    async (url, init) => {
      seen = init;
      return { ok: true, url };
    },
    'https://example.test',
    { method: 'GET' },
    1000,
    (m) => new UpstreamError(m),
  );
  assert.equal(ok.url, 'https://example.test');
  assert.ok(seen.signal instanceof AbortSignal);
  assert.equal(seen.method, 'GET');
  const failing = async () => {
    const e = new Error('boom');
    e.name = 'TimeoutError';
    throw e;
  };
  await assert.rejects(
    fetchWithTimeout(failing, 'x', {}, 1, (m) => new UpstreamError(`Upstream ${m}`)),
    (err) => err instanceof UpstreamError && /request failed: TimeoutError/.test(err.message),
  );
});

test('gemini helpers: thinking config per model, request body, response parsing', () => {
  assert.deepEqual(thinkingConfigFor('gemini-2.5-flash'), { thinkingConfig: { thinkingBudget: 0 } });
  assert.deepEqual(thinkingConfigFor('gemini-3.5-flash'), { thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(thinkingConfigFor('other-model'), {});
  const body = buildRequestBody('gemini-3.5-flash', { system: 's', prompt: 'p', schema: { type: 'OBJECT' } });
  assert.equal(body.generationConfig.temperature, config.GEMINI.defaultTemperature);
  assert.equal(body.generationConfig.maxOutputTokens, config.GEMINI.defaultMaxOutputTokens);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(parseCandidateJson({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }), { a: 1 });
  assert.throws(() => parseCandidateJson({}), GeminiError);
  assert.throws(() => parseCandidateJson({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), /invalid JSON/);
});

test('buildReport turns raw Open-Meteo data into the grounded report', () => {
  const place = { name: 'Bhopal', admin1: 'MP', country: 'India', countryCode: 'IN', lat: 23.25, lon: 77.4 };
  const r = buildReport(place, airFixture());
  assert.equal(r.current.usAqi, 260);
  assert.equal(r.current.band.key, 'very_unhealthy');
  assert.equal(r.forecast.length, config.OPEN_METEO.forecastHours);
  assert.ok(r.best.avgAqi < r.worst.avgAqi);
  assert.equal(r.source, config.OPEN_METEO.sourceLabel);
});

test('errorHandler maps body errors and hides internals', () => {
  const logged = [];
  const handler = errorHandler({ error: (...a) => logged.push(a) });
  const cases = [
    [{ type: 'entity.parse.failed' }, 400, config.MESSAGES.invalidJson],
    [{ type: 'entity.too.large' }, 413, config.MESSAGES.bodyTooLarge],
    [new Error('secret stack detail'), 500, config.MESSAGES.internal],
  ];
  for (const [err, status, message] of cases) {
    const res = fakeRes();
    handler(err, {}, res, () => {});
    assert.equal(res.statusCode, status);
    assert.deepEqual(res.body, { error: message });
  }
  assert.equal(logged.length, 1);
});

test('frontend format helpers (pure ES module)', async () => {
  const f = await importPublic('js/format.js');
  const t = (k) => ({ tomorrow: 'tomorrow', avg: 'avg AQI' })[k] || k;
  assert.equal(f.bandInfo('hazardous').color, '#7e0023');
  assert.equal(f.bandInfo('nope').en, '—');
  assert.equal(f.bandInfo(undefined).color, '#ddd');
  assert.equal(f.formatConcentration(130.4), '130 µg/m³');
  assert.equal(f.formatConcentration(null), '—');
  assert.equal(f.clockTime('2026-11-25T13:00'), '13:00');
  assert.equal(f.windowText({ label: '13:00–15:00', avgAqi: 120, tomorrow: true }, t), '13:00–15:00 (tomorrow) · avg AQI 120');
  assert.equal(f.windowText(null, t), '—');
  assert.equal(f.placeLabel({ name: 'Bhopal', admin1: 'MP', country: 'India' }, 'Mine'), 'Bhopal, MP, India');
  assert.equal(f.placeLabel({ name: 'Your location' }, 'Mine'), 'Mine');
  assert.equal(f.airQuery({ city: 'New Delhi' }), 'city=New%20Delhi');
  assert.equal(f.airQuery({ lat: 23.25, lon: 77.4 }), 'lat=23.25&lon=77.4');
  assert.equal(f.roundCoord(23.25678), 23.26);
  assert.equal(f.barHeightPct(100, 200, 4), 50);
  assert.equal(f.barHeightPct(1, 200, 4), 4);
});

test('frontend config mirrors server rules (city pattern, bands, history cap)', async () => {
  const c = await importPublic('js/config.js');
  const { US_BANDS } = require('../src/aqi');
  const { LIMITS } = require('../src/validate');
  for (const b of US_BANDS) {
    assert.equal(c.BANDS[b.key].color, b.color, `colour for ${b.key}`);
    assert.equal(c.BANDS[b.key].en, b.label);
  }
  assert.equal(c.HISTORY_TURNS, LIMITS.historyTurns);
  assert.equal(c.MAX_MESSAGE_LENGTH, LIMITS.message);
  assert.ok(c.CITY_RE.test('भोपाल'));
  assert.ok(!c.CITY_RE.test('<script>'));
});

test('index.html assets and every frontend import resolve to real files', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="\/([^"?#]+)/g)].map((m) => m[1]);
  assert.ok(refs.includes('app.js') && refs.includes('styles.css'));
  for (const ref of refs) assert.ok(fs.existsSync(path.join(PUBLIC_DIR, ref)), `missing ${ref}`);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'no inline scripts (CSP)');
  for (const file of frontendFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const [, spec] of src.matchAll(/from '([^']+)'/g)) {
      const target = path.resolve(path.dirname(file), spec.split('?')[0]);
      assert.ok(fs.existsSync(target), `${path.relative(PUBLIC_DIR, file)} imports missing ${spec}`);
    }
  }
});

test('no console.log in production server or frontend code', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = [...fs.readdirSync(srcDir).map((f) => path.join(srcDir, f)), ...frontendFiles()];
  for (const file of files) assert.ok(!/console\.log\(/.test(fs.readFileSync(file, 'utf8')), file);
});
