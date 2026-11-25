'use strict';

/**
 * Deterministic "impact maths" used to ground Gemini and to power the offline fallback.
 * All figures are deliberately approximate reference values and are labelled as such in the UI.
 */

/** Approximate tailpipe emission factors, kg CO2e per passenger-km (Indian urban context). */
const EMISSION_FACTORS = Object.freeze({
  car: 0.17,
  two_wheeler: 0.05,
  auto: 0.07,
  bus: 0.03,
  metro: 0.02,
  cycle: 0,
  walk: 0,
  wfh: 0,
});

/** Approximate PM2.5 reduction factors for common interventions (fraction removed). */
const REDUCTION = Object.freeze({
  n95Mask: 0.9, // well-fitted N95/FFP2 filters ~90-95% of fine particles
  clothMask: 0.3, // loose cloth / surgical masks: ~10-50%
  purifierRoom: 0.6, // HEPA purifier sized for the room, doors closed: typically 50-80% lower indoor PM2.5
  sealedRoom: 0.25, // closing windows + gap sealing during peak hours
});

const WORKDAYS_PER_YEAR = 220;

/** % lower PM2.5 dose by shifting outdoor time from the worst to the best window. */
function exposureShiftReduction(best, worst) {
  if (!best || !worst) return null;
  const b = best.avgPm25 ?? best.avgAqi;
  const w = worst.avgPm25 ?? worst.avgAqi;
  if (!(w > 0) || b >= w) return 0;
  return Math.round((1 - b / w) * 100);
}

/** Daily/annual CO2e for a round-trip commute and the saving if switching to `toMode`. */
function commuteImpact(mode, km, toMode = 'metro') {
  const f = EMISSION_FACTORS[mode] ?? 0;
  const t = EMISSION_FACTORS[toMode] ?? 0;
  const dailyKg = Math.round(f * km * 2 * 100) / 100;
  const savedDailyKg = Math.max(0, Math.round((f - t) * km * 2 * 100) / 100);
  return {
    dailyKg,
    annualKg: Math.round(dailyKg * WORKDAYS_PER_YEAR),
    savedDailyKg,
    savedAnnualKg: Math.round(savedDailyKg * WORKDAYS_PER_YEAR),
    toMode,
  };
}

/** Cleanest realistic alternative for a given commute mode. */
function greenerMode(mode, km) {
  if (['wfh', 'walk', 'cycle'].includes(mode)) return mode;
  if (km <= 3) return 'walk';
  if (km <= 8) return 'cycle';
  return 'metro';
}

/** Facts block injected into prompts so the model reasons from the same numbers the UI shows. */
function impactFacts(report, profile) {
  const shift = exposureShiftReduction(report.best, report.worst);
  const alt = greenerMode(profile.commuteMode, profile.commuteKm);
  const commute = commuteImpact(profile.commuteMode, profile.commuteKm, alt);
  return {
    exposureShiftPct: shift,
    commute,
    greenerMode: alt,
    reduction: REDUCTION,
    emissionFactors: EMISSION_FACTORS,
  };
}

module.exports = { EMISSION_FACTORS, REDUCTION, exposureShiftReduction, commuteImpact, greenerMode, impactFacts };
