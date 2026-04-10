import React from 'react';

const FIELDS = [
  {
    key: 'whatDoISee',
    label: '1. WHAT DO I SEE?',
    placeholder: 'Structure, flow, and context you observe…',
  },
  {
    key: 'whyValid',
    label: '2. WHY IS THIS VALID?',
    placeholder: 'Confluence, levels, and backing for the idea…',
  },
  {
    key: 'entryConfirmation',
    label: '3. WHAT CONFIRMS ENTRY?',
    placeholder: 'Trigger, confirmation, and invalidation…',
  },
];

/**
 * Trader Thesis — exactly three prompts + one textarea each (no other chrome inside the card).
 */
export default function TraderLabThesisBlock({ form, onFieldChange }) {
  return (
    <div className="tl-card-shell tl-card-shell--thesis">
      <h3 className="tl-card-header">TRADER THESIS</h3>
      {FIELDS.map(({ key, label, placeholder }) => (
        <div key={key} className="tl-thesis-q">
          <label className="tl-thesis-q__label" htmlFor={`tl-thesis-${key}`}>
            {label}
          </label>
          <textarea
            id={`tl-thesis-${key}`}
            className="tl-textarea tl-thesis-q__input"
            value={form[key] ?? ''}
            onChange={(e) => onFieldChange(key, e.target.value)}
            placeholder={placeholder}
            rows={2}
            spellCheck
          />
        </div>
      ))}
    </div>
  );
}
