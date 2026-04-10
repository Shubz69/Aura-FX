/**
 * Trader Lab — structured thesis (3 prompts) persisted as flat DB columns.
 * Columns: whatDoISee, whyValid, entryConfirmation (+ optional traderThesisUpdatedAt).
 */

export function traderThesisFromSession(session = {}) {
  return {
    whatDoISee: session.whatDoISee != null ? String(session.whatDoISee) : '',
    whyIsThisValid: session.whyValid != null ? String(session.whyValid) : '',
    whatConfirmsEntry: session.entryConfirmation != null ? String(session.entryConfirmation) : '',
    updatedAt: session.traderThesisUpdatedAt || session.updatedAt || null,
  };
}

/** Attach nested `traderThesis` for API clients; keep flat fields for forms. */
export function attachTraderThesisToSession(session) {
  if (!session || typeof session !== 'object') return session;
  return {
    ...session,
    traderThesis: traderThesisFromSession(session),
  };
}

export function thesisFieldsDirty(prev, next) {
  const a = (k) => String(prev?.[k] ?? '');
  const b = (k) => String(next?.[k] ?? '');
  return a('whatDoISee') !== b('whatDoISee') || a('whyValid') !== b('whyValid') || a('entryConfirmation') !== b('entryConfirmation');
}
