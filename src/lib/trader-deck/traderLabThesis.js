/**
 * Trader Lab — structured thesis (3 prompts) persisted as flat DB columns.
 * Columns: whatDoISee, whyValid, entryConfirmation (+ optional traderThesisUpdatedAt).
 */

export function traderThesisFromSession(session = {}) {
  return {
    whatDoISee: session.whatDoISee != null ? String(session.whatDoISee) : '',
    whyIsThisValid:
      session.whyIsThisValid != null
        ? String(session.whyIsThisValid)
        : session.whyValid != null
          ? String(session.whyValid)
          : '',
    whatConfirmsEntry:
      session.whatConfirmsEntry != null
        ? String(session.whatConfirmsEntry)
        : session.entryConfirmation != null
          ? String(session.entryConfirmation)
          : '',
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
  const why = (s) => String(s?.whyIsThisValid ?? s?.whyValid ?? '');
  const entry = (s) => String(s?.whatConfirmsEntry ?? s?.entryConfirmation ?? '');
  return (
    String(prev?.whatDoISee ?? '') !== String(next?.whatDoISee ?? '') ||
    why(prev) !== why(next) ||
    entry(prev) !== entry(next)
  );
}
