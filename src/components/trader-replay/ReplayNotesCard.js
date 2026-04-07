import React, { useEffect, useRef } from 'react';

export default function ReplayNotesCard({
  notes,
  emotionalState,
  whatISaw,
  whatIMissed,
  improvementPlan,
  ruleFollowed,
  lessonSummary,
  autoFocus,
  onChangeField,
}) {
  const refNotes = useRef(null);

  useEffect(() => {
    if (autoFocus && refNotes.current) {
      refNotes.current.focus();
    }
  }, [autoFocus]);

  const field = (key, label, value, rows = 3, inputRef) => (
    <label className="aura-tr-note-field">
      <span>{label}</span>
      <textarea
        ref={inputRef || undefined}
        className="trader-suite-select aura-tr-textarea"
        rows={rows}
        value={value || ''}
        onChange={(e) => onChangeField(key, e.target.value)}
      />
    </label>
  );

  return (
    <section id="aura-tr-notes-anchor" className="trader-suite-panel aura-tr-notes">
      <div className="trader-suite-kicker">Reflection</div>
      <div className="aura-tr-notes-grid">
        {field('notes', 'Session notes', notes, 3, refNotes)}
        {field('whatISaw', 'What I saw', whatISaw)}
        {field('whatIMissed', 'What I missed', whatIMissed)}
        {field('emotionalState', 'Emotional state', emotionalState, 2)}
        {field('ruleFollowed', 'Rule followed / broken', ruleFollowed, 2)}
        {field('improvementPlan', 'What I would do differently', improvementPlan)}
        {field('lessonSummary', 'Lesson learned (one line)', lessonSummary, 2)}
      </div>
    </section>
  );
}
