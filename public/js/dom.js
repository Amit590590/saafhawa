// @ts-check
/**
 * DOM helpers. Security: all dynamic text (including Gemini output) is set via
 * textContent / DOM APIs; HTML strings are never parsed.
 */

/**
 * Look up an element by id.
 * @param {string} id
 * @returns {HTMLElement}
 */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @typedef {object} ElOptions
 * @property {unknown} [text] text content (always set as text, never HTML)
 * @property {string} [cls] class name(s)
 * @property {Record<string, string>} [attrs] attributes
 */

/**
 * Create an element with text and attributes – the only way UI is built.
 * @param {string} tag
 * @param {ElOptions} [opts]
 * @param {(Node | string | null | undefined | false)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, { text, cls, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

/**
 * Update the live status region.
 * @param {string} msg
 * @param {boolean} [isError=false]
 * @returns {void}
 */
export function setStatus(msg, isError = false) {
  const s = $('status');
  s.textContent = msg || '';
  s.classList.toggle('is-error', isError);
}
