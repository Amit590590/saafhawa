'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { makeFetch, planFixture, geminiResponse, silentLogger } = require('./helpers');

/** Start the app on an ephemeral port with mocked upstreams; returns base URL + helpers. */
async function start(opts = {}) {
  const fetchImpl = makeFetch(opts.mock);
  const app = createApp({ fetchImpl, apiKey: 'apiKey' in opts ? opts.apiKey : 'fake-test-key', logger: silentLogger, limits: opts.limits });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { base, post, fetchImpl, close: () => new Promise((r) => server.close(r)) };
}

const body = { location: { city: 'Bhopal' }, profile: { adults: 2, children: 1, respiratory: true }, lang: 'en' };

test('GET /api/health reports AI availability without leaking the key', async (t) => {
  const s = await start();
  t.after(s.close);
  const res = await fetch(`${s.base}/api/health`);
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ai, true);
  assert.ok(!JSON.stringify(json).includes('fake-test-key'));
});

test('GET /api/air returns banded AQI, 24h forecast and best/worst windows', async (t) => {
  const s = await start();
  t.after(s.close);
  const res = await fetch(`${s.base}/api/air?city=Bhopal`);
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.equal(r.place.name, 'Bhopal');
  assert.equal(r.current.usAqi, 260);
  assert.equal(r.current.band.key, 'very_unhealthy');
  assert.equal(r.current.naqi.key, 'very_poor');
  assert.equal(r.forecast.length, 24);
  assert.equal(r.best.label, '13:00–15:00');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('AQI and geocoding responses are cached in memory', async (t) => {
  const s = await start();
  t.after(s.close);
  await fetch(`${s.base}/api/air?city=Bhopal`);
  await fetch(`${s.base}/api/air?city=bhopal`);
  await fetch(`${s.base}/api/air?lat=23.25&lon=77.4`);
  const air = s.fetchImpl.calls.filter((c) => c.url.includes('air-quality-api'));
  const geo = s.fetchImpl.calls.filter((c) => c.url.includes('geocoding-api'));
  assert.equal(geo.length, 1);
  assert.equal(air.length, 1, 'same rounded coordinates should hit the cache');
});

test('GET /api/air validates input and maps upstream errors', async (t) => {
  const s = await start();
  t.after(s.close);
  assert.equal((await fetch(`${s.base}/api/air?city=%3Cscript%3E`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/air`)).status, 400);
  assert.equal((await fetch(`${s.base}/api/air?lat=999&lon=0`)).status, 400);
  const nf = await start({ mock: { geoEmpty: true } });
  t.after(nf.close);
  assert.equal((await fetch(`${nf.base}/api/air?city=Nowhereville`)).status, 404);
  const down = await start({ mock: { airFail: true } });
  t.after(down.close);
  const res = await fetch(`${down.base}/api/air?city=Bhopal`);
  assert.equal(res.status, 502);
  assert.deepEqual(Object.keys(await res.json()), ['error']);
});

test('POST /api/plan returns the Gemini structured plan, grounded on live AQI', async (t) => {
  let sentPrompt;
  const s = await start({
    mock: {
      gemini: (b) => {
        sentPrompt = b;
        return geminiResponse(planFixture);
      },
    },
  });
  t.after(s.close);
  const res = await s.post('/api/plan', body);
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.source, 'gemini');
  assert.deepEqual(json.plan, planFixture);
  const promptText = sentPrompt.contents[0].parts[0].text;
  assert.match(promptText, /US AQI 260/);
  assert.match(promptText, /Respiratory condition .*: yes/);
  assert.equal(sentPrompt.generationConfig.responseMimeType, 'application/json');
  const geminiCall = s.fetchImpl.calls.find((c) => c.url.includes('generativelanguage'));
  assert.equal(geminiCall.init.headers['x-goog-api-key'], 'fake-test-key');
});

test('POST /api/plan falls back to rule-based plan when Gemini fails', async (t) => {
  const s = await start({ mock: { geminiFail: true } });
  t.after(s.close);
  const json = await (await s.post('/api/plan', body)).json();
  assert.equal(json.source, 'fallback');
  assert.ok(json.plan.routine.length > 0);
  assert.ok(json.plan.routine.every((r) => r.impact));
});

test('POST /api/plan falls back when Gemini output fails validation or no key is set', async (t) => {
  const bad = await start({ mock: { gemini: { summary: 'only a summary' } } });
  t.after(bad.close);
  assert.equal((await (await bad.post('/api/plan', body)).json()).source, 'fallback');
  const nokey = await start({ apiKey: '' });
  t.after(nokey.close);
  const json = await (await nokey.post('/api/plan', { ...body, lang: 'hi' })).json();
  assert.equal(json.source, 'fallback');
  assert.equal(json.lang, 'hi');
  assert.ok(!nokey.fetchImpl.calls.some((c) => c.url.includes('generativelanguage')));
});

test('POST /api/plan rejects invalid profiles and malformed JSON', async (t) => {
  const s = await start();
  t.after(s.close);
  assert.equal((await s.post('/api/plan', { ...body, profile: { adults: 99 } })).status, 400);
  assert.equal((await s.post('/api/plan', { ...body, location: { city: '' } })).status, 400);
  const res = await fetch(`${s.base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  const big = await s.post('/api/plan', { ...body, pad: 'x'.repeat(20000) });
  assert.equal(big.status, 413);
});

test('POST /api/chat answers with grounded context and fences the question', async (t) => {
  let sent;
  const s = await start({
    mock: {
      gemini: (b) => {
        sent = b;
        return geminiResponse({ answer: 'Go out at 13:00.', followUps: ['What mask?'] });
      },
    },
  });
  t.after(s.close);
  const res = await s.post('/api/chat', { ...body, message: 'When can kids play outside?', history: [{ role: 'user', text: 'hello' }] });
  const json = await res.json();
  assert.equal(json.source, 'gemini');
  assert.equal(json.answer, 'Go out at 13:00.');
  assert.match(sent.contents[0].parts[0].text, /<USER_QUESTION>\nWhen can kids play outside\?\n<\/USER_QUESTION>/);
  assert.equal((await s.post('/api/chat', { ...body, message: '' })).status, 400);
});

test('POST /api/chat degrades gracefully when Gemini is down', async (t) => {
  const s = await start({ mock: { geminiFail: true } });
  t.after(s.close);
  const json = await (await s.post('/api/chat', { ...body, message: 'Is it safe?' })).json();
  assert.equal(json.source, 'fallback');
  assert.match(json.answer, /AQI is 260/);
});

test('security headers, CSP and static frontend are served', async (t) => {
  const s = await start();
  t.after(s.close);
  const res = await fetch(`${s.base}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /<html lang="en">/);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal((await fetch(`${s.base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${s.base}/app.js`)).status, 200);
});

test('AI endpoints are rate limited per IP', async (t) => {
  const s = await start({ limits: { ai: 2 } });
  t.after(s.close);
  assert.equal((await s.post('/api/plan', body)).status, 200);
  assert.equal((await s.post('/api/plan', body)).status, 200);
  const res = await s.post('/api/plan', body);
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /limit/i);
});

test('frontend never uses innerHTML for dynamic content (all modules)', async () => {
  const { frontendFiles } = require('./helpers');
  const fs = require('node:fs');
  const files = frontendFiles();
  assert.ok(files.length >= 5, 'expected the split frontend modules');
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/.test(src), file);
  }
});
