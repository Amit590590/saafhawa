// @ts-check
/**
 * Grounded follow-up chat: message log, suggestion chips and the /api/chat call.
 */
import { HISTORY_TURNS } from './config.js';
import { $, el, setStatus } from './dom.js';
import { api } from './api.js';
import { state, t } from './state.js';

/**
 * Append a chat bubble.
 * @param {'user' | 'assistant'} role
 * @param {string} text
 * @param {string} [lang] language of the text, when known
 * @returns {void}
 */
function addMessage(role, text, lang) {
  const msg = el('div', { cls: `msg msg-${role}`, attrs: lang ? { lang } : {} }, [
    el('span', { cls: 'who', text: role === 'user' ? t('you') : t('bot') }),
    el('p', { text }),
  ]);
  $('chatLog').append(msg);
  msg.scrollIntoView({ block: 'nearest' });
}

/**
 * Replace the suggestion chips; clicking one asks that question.
 * @param {string[]} questions
 * @returns {void}
 */
function renderSuggestions(questions) {
  $('suggestions').replaceChildren(
    ...questions.map((q) => {
      const chip = el('button', { cls: 'chip', text: q, attrs: { type: 'button' } });
      chip.addEventListener('click', () => ask(q));
      return chip;
    }),
  );
}

/**
 * Clear the conversation (used when a new location is analysed).
 * @returns {void}
 */
export function resetChat() {
  state.history = [];
  $('chatLog').replaceChildren();
  $('suggestions').replaceChildren();
}

/**
 * Remember a completed exchange, keeping only the most recent turns.
 * @param {string} question
 * @param {string} answer
 * @returns {void}
 */
function remember(question, answer) {
  state.history.push({ role: 'user', text: question }, { role: 'assistant', text: answer });
  state.history = state.history.slice(-HISTORY_TURNS);
}

/**
 * Send a question and render the answer.
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function ask(message) {
  addMessage('user', message);
  const input = /** @type {HTMLInputElement} */ ($('chatInput'));
  input.value = '';
  input.disabled = true;
  setStatus(t('thinking'));
  try {
    const { location, profile, lang, history } = state;
    const res = await api('/api/chat', { location, profile, lang, message, history });
    remember(message, res.answer);
    addMessage('assistant', res.answer, state.lang);
    renderSuggestions(res.followUps || []);
    setStatus('');
  } catch (err) {
    const msg = err instanceof Error ? err.message : t('errGeneric');
    addMessage('assistant', msg);
    setStatus(msg, true);
  } finally {
    input.disabled = false;
    input.focus();
  }
}
