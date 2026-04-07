import { clamp } from '../../utils/traderSuite';

/** Stable ids so fingerprints / dirty detection do not flicker on re-normalize. */
export function stableMarkerId(prefix, idx, sessionKey = 'session') {
  const key = String(sessionKey || 'session').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `${prefix}_${key}_${idx}`;
}

function sortByOrder(markers) {
  return [...markers].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

function parseR(val) {
  if (val == null) return null;
  const m = String(val).trim().match(/-?[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function outcomeBucket(outcome) {
  const o = String(outcome || '').toLowerCase();
  if (/win|profit|green/.test(o)) return 'win';
  if (/loss|lose|red/.test(o)) return 'loss';
  if (/be|breakeven|flat|scratch/.test(o)) return 'be';
  return 'unknown';
}

function chaseOrLateHeuristic(s) {
  const t = `${s.verdict || ''} ${s.insight || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /chase|late|fomo|impulse|early|front[- ]?run|poor timing|too soon/i.test(t);
}

function invalidationHeuristic(s) {
  const t = `${s.verdict || ''} ${s.whatIMissed || ''}`.toLowerCase();
  return /invalidat|broke structure|stopped out|stop hunt|breach/i.test(t);
}

function patienceHeuristic(s) {
  const p = Number(s.patience) || 0;
  return p >= 7;
}

function managementWeak(s) {
  const d = Number(s.discipline) || 0;
  const p = Number(s.patience) || 0;
  return d <= 5 || p <= 5;
}

function dataRichness(session) {
  const s = session || {};
  let n = 0;
  [
    s.symbol || s.asset,
    s.biasAtTime || s.bias,
    s.verdict,
    s.outcome,
    s.insight,
    s.lessonSummary,
    s.entry,
    s.stop || s.stopLoss,
    s.target || s.takeProfit,
    parseR(s.actualR || s.resultR || s.rResult) != null,
    s.mfe,
    s.mae,
    s.missedR,
    Number(s.entryTiming) > 0,
    s.emotionalState,
    s.ruleFollowed,
    s.keyDrivers,
    s.marketState,
    s.notes,
  ].forEach((x) => {
    if (x) n += 1;
  });
  return n;
}

function execQualityTag(s) {
  const e = Number(s.entryTiming) || 0;
  const d = Number(s.discipline) || 0;
  if (e >= 7 && d >= 7) return 'correct_execution';
  if (e <= 4 && chaseOrLateHeuristic(s)) return 'late_entry';
  if (e <= 4) return 'poor_entry';
  if (d <= 4) return 'discipline_lapse';
  if (patienceHeuristic(s)) return 'good_patience';
  if (s.keyDrivers && String(s.keyDrivers).length > 40) return 'good_structure_reading';
  return 'mixed';
}

/**
 * Rich default path when API returned no replayMarkers (legacy rows).
 * Deterministic ordering; scales with available fields; trader-focused copy.
 */
export function buildFallbackMarkersFromSession(session) {
  const sid = session.id || session.tradeRef || 'noid';
  const sym = session.asset || session.symbol || '—';
  const bias = session.biasAtTime || session.bias || '—';
  const drivers = String(session.keyDrivers || '').trim() || 'Document the structural read that justified engagement.';
  const verdict = String(session.verdict || '').trim();
  const insight = String(session.insight || '').trim();
  const lesson = String(session.lessonSummary || '').trim();
  const stop = String(session.stop || session.stopLoss || '').trim() || '—';
  const target = String(session.target || session.takeProfit || '').trim() || '—';
  const entry = String(session.entry || '').trim() || '—';
  const exitLvl = String(session.exit || '').trim();
  const market = String(session.marketState || '').trim();
  const when = session.replayDate || session.sourceDate || '—';
  const outcome = session.outcome || '—';
  const rStr = session.actualR || session.resultR || session.rResult || '—';
  const rNum = parseR(session.actualR || session.resultR || session.rResult);
  const missed = parseR(session.missedR);
  const mfe = session.mfe ? String(session.mfe) : '';
  const mae = session.mae ? String(session.mae) : '';
  const emotional = String(session.emotionalState || '').trim();
  const rule = String(session.ruleFollowed || '').trim();
  const entryN = Number(session.entryTiming) || 0;
  const discN = Number(session.discipline) || 0;
  const patN = Number(session.patience) || 0;
  const pnl = String(session.pnl || '').trim();
  const ob = outcomeBucket(session.outcome);
  const qualityTag = execQualityTag(session);

  const rich = dataRichness(session);
  const density = rich >= 10 ? 'full' : rich >= 6 ? 'medium' : 'sparse';

  const markers = [];
  let order = 0;

  const pushSparse = (def) => {
    markers.push({
      id: stableMarkerId('fb', order, sid),
      label: def.label,
      timestampLabel: def.timestampLabel ?? '—',
      type: def.type,
      title: def.title,
      body: def.body,
      lesson: def.lesson,
      confidence: def.confidence != null ? clamp(Number(def.confidence), 0, 100) : 70,
      orderIndex: order,
      scoreImpact: def.scoreImpact != null ? def.scoreImpact : 2,
      tags: def.tags || [],
      coachingTone: def.coachingTone || 'neutral',
      severity: def.severity != null ? clamp(Number(def.severity), 0, 3) : 0,
      qualityTag: def.qualityTag || qualityTag,
      reviewCategory: def.reviewCategory || 'context',
    });
    order += 1;
  };

  if (density === 'sparse') {
    pushSparse({
      label: 'Session frame',
      type: 'lesson',
      title: `${sym} · ${when}`,
      body: [market && `${market}`, bias && `Bias: ${bias}.`, drivers !== 'Document the structural read that justified engagement.' && drivers].filter(Boolean).join(' ') || `Frame ${sym}: what was the one valid reason to engage?`,
      lesson: 'Sparse record — next time log bias + invalidation before the click.',
      confidence: 62,
      scoreImpact: 2,
      tags: ['context'],
      reviewCategory: 'pre_context',
    });
    pushSparse({
      label: 'Entry & thesis',
      type: entryN <= 4 ? 'mistake' : 'entry',
      title: entryN <= 4 ? 'Timing / impulse check' : 'Planned execution',
      body: `Entry ${entry} · timing ${entryN}/10 · thesis: ${drivers.slice(0, 220)}${drivers.length > 220 ? '…' : ''}`,
      lesson: entryN <= 4 ? 'If the entry was rushed, the fix is process, not a new indicator.' : 'Good entries read dull — excitement usually means you are late.',
      confidence: clamp(55 + entryN * 4, 0, 100),
      scoreImpact: entryN <= 4 ? -2 : 2,
      tags: ['entry'],
      severity: entryN <= 4 ? 1 : 0,
      reviewCategory: 'entry',
    });
    pushSparse({
      label: 'Risk',
      type: 'risk',
      title: stop !== '—' && target !== '—' ? 'Invalidation' : 'Define risk',
      body: stop !== '—' && target !== '—' ? `Stop ${stop} · target ${target}` : 'Add explicit stop and target before grading this trade.',
      lesson: 'No line in the sand → no real position.',
      confidence: stop !== '—' && target !== '—' ? 80 : 48,
      scoreImpact: 3,
      tags: ['risk'],
      severity: stop === '—' || target === '—' ? 2 : 0,
      reviewCategory: 'risk',
    });
    pushSparse({
      label: 'Result · lesson',
      type: ob === 'loss' ? 'mistake' : 'lesson',
      title: 'Close the loop',
      body: [verdict && verdict.slice(0, 200), `Outcome ${outcome} · R ${rStr}`, lesson && `Lesson: ${lesson.slice(0, 160)}`].filter(Boolean).join(' · ') || `Outcome ${outcome} — write one behaviour to repeat or delete.`,
      lesson: insight || lesson || 'Capture a one-line lesson while memory is clean.',
      confidence: lesson || insight || verdict ? 78 : 52,
      scoreImpact: 2,
      tags: ['review'],
      reviewCategory: 'lesson',
    });
    return sortByOrder(markers);
  }

  const push = (def) => {
    markers.push({
      id: stableMarkerId('fb', order, sid),
      label: def.label,
      timestampLabel: def.timestampLabel ?? '—',
      type: def.type,
      title: def.title,
      body: def.body,
      lesson: def.lesson,
      confidence: def.confidence != null ? clamp(Number(def.confidence), 0, 100) : 70,
      orderIndex: order,
      scoreImpact: def.scoreImpact != null ? def.scoreImpact : 2,
      tags: def.tags || [],
      coachingTone: def.coachingTone || 'neutral',
      severity: def.severity != null ? clamp(Number(def.severity), 0, 3) : 0,
      qualityTag: def.qualityTag || qualityTag,
      reviewCategory: def.reviewCategory || 'context',
    });
    order += 1;
  };

  /* 1. Pre-trade context */
  push({
    label: 'Pre-trade context',
    type: 'lesson',
    title: `${sym} · ${when}`,
    body: [market && `Conditions: ${market}.`, `Recorded bias: ${bias}.`].filter(Boolean).join(' ') || `Session framing for ${sym} — state what the market owed you before entry.`,
    lesson: 'Context before candles: regime, liquidity, and the one thesis you are willing to defend.',
    confidence: 72,
    scoreImpact: 2,
    tags: ['context', 'bias'],
    coachingTone: 'informative',
    reviewCategory: 'pre_context',
  });

  if (density !== 'sparse') {
    push({
      label: 'Setup quality',
      type: 'entry',
      title: 'Thesis and structure',
      body: drivers,
      lesson: ob === 'loss' || rNum != null && rNum < 0
        ? 'Weak thesis shows up fastest in management — name the exact failure mode.'
        : 'A+ setups read boring on paper; excitement is usually a warning.',
      confidence: clamp(60 + (session.keyDrivers ? 12 : 0), 0, 100),
      scoreImpact: ob === 'loss' ? 1 : 3,
      tags: ['setup'],
      qualityTag: qualityTag === 'good_structure_reading' ? 'good_structure_reading' : 'mixed',
      reviewCategory: 'setup',
    });
  }

  /* Entry logic */
  push({
    label: 'Entry logic',
    type: entryN <= 4 ? 'mistake' : 'confirmation',
    title: entryN <= 4 ? 'Entry timing pressure' : 'Entry execution',
    body:
      `Planned entry near ${entry}. Self-rated timing ${entryN}/10 · discipline ${discN}/10.` +
      (chaseOrLateHeuristic(session) ? ' Notes suggest chase or early impulse — verify against your playbook trigger.' : ''),
    lesson:
      entryN <= 4
        ? 'Late entries pay the wrong price for the same idea — wait for the next valid shelf.'
        : 'Treat the first fill as a hypothesis, not proof — scale only after confirmation holds.',
    confidence: typeof entryN === 'number' && entryN ? clamp(entryN * 10, 0, 100) : 65,
    scoreImpact: entryN <= 4 ? -2 : 2,
    tags: ['entry', 'timing'],
    coachingTone: entryN <= 4 ? 'direct' : 'supportive',
    severity: entryN <= 4 ? 2 : 0,
    qualityTag: entryN <= 4 ? 'late_entry' : 'correct_execution',
    reviewCategory: 'entry',
  });

  if (density === 'full' || density === 'medium') {
    push({
      label: 'Confirmation quality',
      type: 'confirmation',
      title: 'Did participation agree with you?',
      body: `Bias at time: ${bias}. ${verdict ? `Verdict reference: ${verdict.slice(0, 200)}${verdict.length > 200 ? '…' : ''}` : 'Log what actually confirmed risk-on for this idea.'}`,
      lesson: 'Confirmation is time, structure, or volatility agreeing — not relief after you are already in.',
      confidence: clamp(58 + entryN * 3, 0, 95),
      scoreImpact: 2,
      tags: ['confirmation'],
      reviewCategory: 'confirmation',
    });
  }

  /* Risk */
  push({
    label: 'Risk definition',
    type: invalidationHeuristic(session) ? 'invalidation' : 'risk',
    title: stop !== '—' && target !== '—' ? 'Defined invalidation' : 'Risk clarity gap',
    body:
      stop !== '—' && target !== '—'
        ? `Stop ${stop}; target framework ${target}. Size only matches if this framework is honest.`
        : 'Stop and target are thin on record — rebuild invalidation before next live repetition.',
    lesson:
      invalidationHeuristic(session)
        ? 'If structure breaks, exits are not negotiable — honor the line you defined pre-trade.'
        : 'Undefined risk means undefined edge. Flat is a valid position.',
    confidence: stop !== '—' && target !== '—' ? 82 : 45,
    scoreImpact: invalidationHeuristic(session) ? -3 : 3,
    tags: ['risk'],
    severity: stop === '—' || target === '—' ? 2 : 0,
    qualityTag: invalidationHeuristic(session) ? 'invalidation_breach' : 'mixed',
    reviewCategory: 'risk',
  });

  /* Management */
  if (density !== 'sparse' || mfe || mae) {
    push({
      label: 'Management decision',
      type: 'management',
      title: managementWeak(session) ? 'Management leak zone' : 'Position management',
      body: `Discipline ${discN}/10 · patience ${patN}/10` +
        (mfe || mae ? ` · MFE ${mfe || '—'} vs MAE ${mae || '—'}` : '') +
        (missed != null && missed >= 0.35 ? ` · Missed R ${missed} — exits likely cut expansion.` : ''),
      lesson: managementWeak(session)
        ? 'Most expectancy bleeds after entry — journal the first deviation from plan.'
        : 'Keep management rules as explicit as entry rules; runners die from ambiguity.',
      confidence: clamp((discN + patN) * 5, 0, 100),
      scoreImpact: managementWeak(session) && missed != null && missed >= 0.5 ? -3 : 2,
      tags: ['management'],
      coachingTone: managementWeak(session) ? 'direct' : 'informative',
      severity: missed != null && missed >= 0.6 ? 2 : managementWeak(session) ? 1 : 0,
      qualityTag: missed != null && missed >= 0.45 ? 'missed_opportunity' : managementWeak(session) ? 'poor_management' : 'mixed',
      reviewCategory: 'management',
    });
  }

  /* Emotional / discipline */
  if (density === 'full' || emotional || rule || discN <= 5) {
    push({
      label: 'Discipline moment',
      type: discN <= 5 ? 'mistake' : 'lesson',
      title: discN <= 5 ? 'Discipline lapse risk' : 'Emotional control',
      body:
        [rule && `Rules / plan: ${rule.slice(0, 280)}${rule.length > 280 ? '…' : ''}`,
          emotional && `Headspace: ${emotional.slice(0, 200)}${emotional.length > 200 ? '…' : ''}`]
          .filter(Boolean)
          .join(' · ') || 'No emotional or rule notes — add one line about internal state at the hard moment.',
      lesson:
        discN <= 5
          ? 'When discipline is soft, shrink size and lengthen checklist — not the opposite.'
          : 'Elite reviews name the emotion without drama; that is how patterns break.',
      confidence: clamp(55 + discN * 4, 0, 95),
      scoreImpact: discN <= 5 ? -2 : 2,
      tags: ['discipline'],
      coachingTone: discN <= 5 ? 'direct' : 'supportive',
      severity: discN <= 4 ? 2 : 0,
      qualityTag: discN <= 5 ? 'discipline_lapse' : 'correct_execution',
      reviewCategory: 'emotion',
    });
  }

  /* Exit */
  if (density === 'full' || missed != null || exitLvl || ob !== 'unknown') {
    push({
      label: 'Exit decision',
      type: 'exit',
      title: missed != null && missed >= 0.4 ? 'Exit left edge on table' : 'How you closed risk',
      body:
        [exitLvl && `Exit / close: ${exitLvl}`,
          `Outcome: ${outcome} (${rStr})`,
          missed != null ? `Missed R ≈ ${missed}` : null]
          .filter(Boolean)
          .join(' · ') || `Outcome ${outcome} — describe whether exit matched plan or fear.`,
      lesson:
        missed != null && missed >= 0.5
          ? 'High missed R usually means management policy was vague — write the rule in Playbook.'
          : ob === 'win'
            ? 'Winning exits deserve the same scrutiny as losses — did you pay yourself for the risk?'
            : 'Losers fund data — extract the behavioural slip, not self-story.',
      confidence: 70,
      scoreImpact: missed != null && missed >= 0.55 ? -4 : 2,
      tags: ['exit'],
      severity: missed != null && missed >= 0.55 ? 2 : 0,
      qualityTag:
        missed != null && missed >= 0.45
          ? 'early_exit'
          : ob === 'be'
            ? 'avoidable_mistake'
            : 'mixed',
      reviewCategory: 'exit',
    });
  }

  /* Result review */
  push({
    label: 'Result review',
    type: ob === 'loss' ? 'mistake' : 'lesson',
    title: 'Scoreboard vs process',
    body: [
      `Book outcome: ${outcome} · R ${rStr}`,
      pnl && `PnL note: ${pnl}`,
      verdict && `Verdict: ${verdict.slice(0, 240)}${verdict.length > 240 ? '…' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ') || 'Fill verdict and result fields — the scoreboard anchors honest coaching.',
    lesson:
      rNum != null && rNum < -1
        ? 'Large negative R demands a process fix, not a mood fix.'
        : rNum != null && rNum >= 2
          ? 'Big wins still need variance control — note what was luck versus skill.'
          : 'Separate outcome noise from behaviour signal before the next session.',
    confidence: verdict ? 78 : 55,
    scoreImpact: ob === 'loss' ? -1 : 2,
    tags: ['result'],
    reviewCategory: 'result',
  });

  /* Lesson anchor */
  push({
    label: 'Lesson anchor',
    type: 'lesson',
    title: 'Takeaway to institutionalise',
    body: lesson || insight || verdict || 'One sentence: what must be true next time before you repeat this footprint?',
    lesson:
      lesson || insight
        ? 'Good lessons are behaviours, not vibes — tie them to a checklist or validator step.'
        : 'Empty lessons compound silently — capture even a small rule tweak.',
    confidence: lesson || insight ? 85 : 50,
    scoreImpact: 3,
    tags: ['lesson'],
    coachingTone: 'supportive',
    reviewCategory: 'lesson',
  });

  return sortByOrder(markers);
}

function sanitizeMarkerEntry(raw, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const typeRaw = raw.type != null ? String(raw.type).slice(0, 32) : 'lesson';
  const title = raw.title != null ? String(raw.title).slice(0, 500) : '';
  const label = raw.label != null ? String(raw.label).slice(0, 200) : '';
  const body = raw.body != null ? String(raw.body).slice(0, 8000) : '';
  const lesson = raw.lesson != null ? String(raw.lesson).slice(0, 8000) : '';
  const out = {
    id: raw.id != null ? String(raw.id).slice(0, 80) : stableMarkerId('mk', i, 'row'),
    type: typeRaw || 'lesson',
    title: title || label || `Step ${i + 1}`,
    label: label || title || `Step ${i + 1}`,
    body: body || '—',
    lesson,
    timestampLabel: raw.timestampLabel != null ? String(raw.timestampLabel).slice(0, 64) : '—',
    orderIndex: raw.orderIndex != null ? Number(raw.orderIndex) : i,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).slice(0, 48)).slice(0, 24) : [],
  };
  if (raw.coachingTone != null) out.coachingTone = String(raw.coachingTone).slice(0, 16);
  if (raw.severity != null && Number.isFinite(Number(raw.severity))) {
    out.severity = clamp(Math.round(Number(raw.severity)), 0, 3);
  }
  if (raw.qualityTag != null) out.qualityTag = String(raw.qualityTag).slice(0, 48);
  if (raw.reviewCategory != null) out.reviewCategory = String(raw.reviewCategory).slice(0, 32);
  return out;
}

export function normalizeMarkerOrder(markers) {
  if (!Array.isArray(markers)) return [];
  const cleaned = markers.map(sanitizeMarkerEntry).filter(Boolean);
  if (!cleaned.length) return [];
  const sorted = sortByOrder(
    cleaned.map((m, i) => ({
      ...m,
      orderIndex: m.orderIndex != null && Number.isFinite(Number(m.orderIndex)) ? Number(m.orderIndex) : i,
    }))
  );
  return sorted.map((m, i) => ({
    ...m,
    orderIndex: i,
    id: m.id || stableMarkerId('mk', i, 'norm'),
    confidence: m.confidence != null && Number.isFinite(Number(m.confidence)) ? clamp(Number(m.confidence), 0, 100) : null,
    scoreImpact: m.scoreImpact != null && Number.isFinite(Number(m.scoreImpact)) ? Number(m.scoreImpact) : undefined,
  }));
}

export function dayReviewShellMarkers(dateLabel) {
  const d = dateLabel || 'Session';
  const key = `day_${d}`;
  return normalizeMarkerOrder([
    {
      id: stableMarkerId('day', 0, key),
      label: 'Pre-market',
      timestampLabel: '—',
      type: 'lesson',
      title: `${d} · preparation`,
      body: 'What was the plan, levels, and risk budget before the open?',
      lesson: 'The best replays start before candle one.',
      confidence: 80,
      orderIndex: 0,
      tags: ['prep'],
    },
    {
      id: stableMarkerId('day', 1, key),
      label: 'Execution window',
      timestampLabel: '—',
      type: 'management',
      title: 'Peak decision window',
      body: 'Walk through the highest conviction trades — or the mistakes — in sequence.',
      lesson: 'Batch similar mistakes; fix the process once.',
      confidence: 72,
      orderIndex: 1,
      tags: ['execution'],
    },
    {
      id: stableMarkerId('day', 2, key),
      label: 'Close-out',
      timestampLabel: '—',
      type: 'exit',
      title: 'Day scorecard',
      body: 'Net result, emotional swings, and one concrete adjustment for tomorrow.',
      lesson: 'End every replay with a single behavior to tighten.',
      confidence: 75,
      orderIndex: 2,
      tags: ['review'],
    },
  ]);
}
