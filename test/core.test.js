'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TTLCache } = require('../src/cache');
const { exposureShiftReduction, commuteImpact, greenerMode } = require('../src/impact');
const { buildFallbackPlan, fallbackChat } = require('../src/fallback');
const { validateProfile } = require('../src/validate');
const { createGeminiClient } = require('../src/gemini');
const { geminiResponse, jsonResponse } = require('./helpers');

test('TTLCache expires entries and evicts the oldest', () => {
  let now = 0;
  const c = new TTLCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  c.set('a', 1);
  c.set('b', 2);
  c.set('c', 3);
  assert.equal(c.get('a'), undefined);
  assert.equal(c.get('c'), 3);
  now = 150;
  assert.equal(c.get('c'), undefined);
});

test('TTLCache.getOrLoad coalesces concurrent loads and does not cache failures', async () => {
  const c = new TTLCache();
  let calls = 0;
  const loader = async () => { calls += 1; return 'v'; };
  const [a, b] = await Promise.all([c.getOrLoad('k', loader), c.getOrLoad('k', loader)]);
  assert.equal(a, 'v');
  assert.equal(b, 'v');
  assert.equal(calls, 1);
  await assert.rejects(c.getOrLoad('bad', async () => { throw new Error('x'); }));
  assert.equal(c.get('bad'), undefined);
});

test('impact maths', () => {
  assert.equal(exposureShiftReduction({ avgPm25: 50 }, { avgPm25: 100 }), 50);
  assert.equal(exposureShiftReduction({ avgPm25: 100 }, { avgPm25: 50 }), 0);
  assert.equal(exposureShiftReduction(null, null), null);
  const c = commuteImpact('car', 10, 'metro');
  assert.equal(c.dailyKg, 3.4);
  assert.equal(c.savedDailyKg, 3);
  assert.equal(c.savedAnnualKg, 660);
  assert.equal(greenerMode('car', 2), 'walk');
  assert.equal(greenerMode('car', 6), 'cycle');
  assert.equal(greenerMode('bus', 20), 'metro');
  assert.equal(greenerMode('wfh', 0), 'wfh');
});

const report = {
  current: { usAqi: 180, band: { label: 'Unhealthy', labelHi: 'अस्वास्थ्यकर' } },
  best: { label: '14:00–16:00', avgAqi: 110, avgPm25: 40 },
  worst: { label: '07:00–09:00', avgAqi: 240, avgPm25: 100 },
};

test('fallback plan is personalised and every item explains impact', () => {
  const p = validateProfile({ children: 2, respiratory: true, cookingFuel: 'biomass', commuteMode: 'car', commuteKm: 15, hasPurifier: true }).value;
  const plan = buildFallbackPlan(report, p, 'en');
  const all = [...plan.routine, ...plan.indoorHacks, ...plan.sustainableAlternatives];
  assert.ok(all.every((i) => i.title && i.impact));
  assert.match(plan.summary, /14:00–16:00/);
  assert.ok(plan.routine.some((r) => /~60% lower PM2\.5/.test(r.impact)));
  assert.ok(plan.sustainableAlternatives.some((s) => /LPG/.test(s.title)));
  assert.ok(plan.sustainableAlternatives.some((s) => /metro/.test(s.title)));
  assert.ok(plan.healthAlerts.length >= 2);
});

test('fallback plan and chat are available in Hindi', () => {
  const p = validateProfile({}).value;
  const plan = buildFallbackPlan(report, p, 'hi');
  assert.match(plan.summary, /अभी हवा/);
  assert.match(fallbackChat(report, 'hi').answer, /AQI 180/);
});

test('gemini client sends key in header, schema in config, and parses JSON', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return geminiResponse({ answer: 'hi', followUps: [] }); };
  const g = createGeminiClient({ apiKey: 'test-key', fetchImpl });
  const out = await g.generateJson({ system: 's', prompt: 'p', schema: { type: 'OBJECT' } });
  assert.deepEqual(out, { answer: 'hi', followUps: [] });
  assert.equal(seen.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!seen.url.includes('test-key'), 'key must not be in URL');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, { type: 'OBJECT' });
  assert.match(seen.url, /gemini-3\.5-flash:generateContent$/);
});

test('gemini client surfaces errors', async () => {
  await assert.rejects(createGeminiClient({ apiKey: '' }).generateJson({}), /not configured/);
  const bad = createGeminiClient({ apiKey: 'k', fetchImpl: async () => jsonResponse({}, 500) });
  await assert.rejects(bad.generateJson({ system: 's', prompt: 'p' }), /500/);
  const junk = createGeminiClient({ apiKey: 'k', fetchImpl: async () => jsonResponse({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) });
  await assert.rejects(junk.generateJson({ system: 's', prompt: 'p' }), /invalid JSON/);
});
