// @ts-check
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
/** A commute is counted both ways. */
const TRIPS_PER_DAY = 2;
/** Distances (km) up to which walking / cycling are realistic alternatives. */
const WALKABLE_KM = 3;
const CYCLABLE_KM = 8;
const ZERO_EMISSION_MODES = Object.freeze(['wfh', 'walk', 'cycle']);

/**
 * Round to two decimals.
 * @param {number} n
 * @returns {number}
 */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * % lower PM2.5 dose by shifting outdoor time from the worst to the best window.
 * Uses PM2.5 averages when available, otherwise AQI averages.
 * @param {{avgPm25?: number|null, avgAqi: number} | null | undefined} best
 * @param {{avgPm25?: number|null, avgAqi: number} | null | undefined} worst
 * @returns {number | null} percentage (0-100), or null without both windows
 */
function exposureShiftReduction(best, worst) {
  if (!best || !worst) return null;
  const b = best.avgPm25 ?? best.avgAqi;
  const w = worst.avgPm25 ?? worst.avgAqi;
  if (!(w > 0) || b >= w) return 0;
  return Math.round((1 - b / w) * 100);
}

/**
 * Emission factor for a mode (0 for unknown modes).
 * @param {string} mode
 * @returns {number}
 */
function emissionFactor(mode) {
  return EMISSION_FACTORS[/** @type {keyof typeof EMISSION_FACTORS} */ (mode)] ?? 0;
}

/**
 * Daily/annual CO2e for a round-trip commute and the saving if switching to `toMode`.
 * @param {string} mode current commute mode
 * @param {number} km one-way distance
 * @param {string} [toMode='metro'] alternative mode
 * @returns {{dailyKg: number, annualKg: number, savedDailyKg: number, savedAnnualKg: number, toMode: string}}
 */
function commuteImpact(mode, km, toMode = 'metro') {
  const f = emissionFactor(mode);
  const t = emissionFactor(toMode);
  const dailyKg = round2(f * km * TRIPS_PER_DAY);
  const savedDailyKg = Math.max(0, round2((f - t) * km * TRIPS_PER_DAY));
  return {
    dailyKg,
    annualKg: Math.round(dailyKg * WORKDAYS_PER_YEAR),
    savedDailyKg,
    savedAnnualKg: Math.round(savedDailyKg * WORKDAYS_PER_YEAR),
    toMode,
  };
}

/**
 * Cleanest realistic alternative for a given commute mode.
 * @param {string} mode
 * @param {number} km one-way distance
 * @returns {string}
 */
function greenerMode(mode, km) {
  if (ZERO_EMISSION_MODES.includes(mode)) return mode;
  if (km <= WALKABLE_KM) return 'walk';
  if (km <= CYCLABLE_KM) return 'cycle';
  return 'metro';
}

/**
 * Facts block injected into prompts so the model reasons from the same numbers the UI shows.
 * @param {{best: any, worst: any}} report
 * @param {{commuteMode: string, commuteKm: number}} profile
 * @returns {{exposureShiftPct: number|null, commute: ReturnType<typeof commuteImpact>, greenerMode: string, reduction: typeof REDUCTION, emissionFactors: typeof EMISSION_FACTORS}}
 */
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
