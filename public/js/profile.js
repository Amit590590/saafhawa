// @ts-check
/**
 * Reads the household/lifestyle form into the profile object the API expects.
 */

const NUMBER_FIELDS = Object.freeze(['adults', 'children', 'elderly', 'commuteKm']);
const SELECT_FIELDS = Object.freeze(['commuteMode', 'cookingFuel']);
const CHECKBOX_FIELDS = Object.freeze([
  'respiratory',
  'pregnant',
  'smokerAtHome',
  'workFromHome',
  'outdoorExercise',
  'hasPurifier',
  'hasPlants',
]);

/**
 * @param {HTMLFormElement} form
 * @returns {Record<string, number | string | boolean | null>}
 */
export function readProfile(form) {
  const f = new FormData(form);
  /** @type {Record<string, number | string | boolean | null>} */
  const profile = {};
  for (const k of NUMBER_FIELDS) profile[k] = Number(f.get(k) || 0);
  for (const k of SELECT_FIELDS) profile[k] = /** @type {string | null} */ (f.get(k));
  for (const k of CHECKBOX_FIELDS) profile[k] = f.has(k);
  return profile;
}
