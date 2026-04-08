import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSearchParams } from 'react-router-dom';
import TraderSuiteShell from '../components/TraderSuiteShell';
import ReplayHub from '../components/trader-replay/ReplayHub';
import ReplaySetupPanel from '../components/trader-replay/ReplaySetupPanel';
import ReplayWorkspace from '../components/trader-replay/ReplayWorkspace';
import ReplaySummaryModal from '../components/trader-replay/ReplaySummaryModal';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import Api from '../services/Api';
import { formatWelcomeEyebrow } from '../utils/welcomeUser';
import { computeReplayHabitStats } from '../lib/trader-replay/replayHabit';
import { getReplayTier, getReplayFeatureFlags } from '../lib/trader-replay/replayEntitlements';
import {
  emptySessionDraft,
  REPLAY_MODES,
  REPLAY_STATUSES,
} from '../lib/trader-replay/replayDefaults';
import {
  normalizeReplay,
  sessionFingerprint,
  computeReplayQualityScore,
  computeReviewCompletenessScore,
} from '../lib/trader-replay/replayNormalizer';
import { findContinueLastSession } from '../lib/trader-replay/replayScenarioEngine';

function toApiPayload(form) {
  return normalizeReplay(form, { forApi: true });
}

export default function TraderReplay() {
  const { user } = useAuth();
  const { tier, accessType, isAdmin } = useSubscription();
  const [searchParams, setSearchParams] = useSearchParams();
  const replayTier = useMemo(() => getReplayTier({ tier, accessType, isAdmin }), [tier, accessType, isAdmin]);
  const replayFlags = useMemo(() => getReplayFeatureFlags(replayTier), [replayTier]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState('hub');
  const [setupMode, setSetupMode] = useState(REPLAY_MODES.trade);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(() => emptySessionDraft());
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState('');
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [finishedSnapshot, setFinishedSnapshot] = useState(null);
  const saveLockRef = useRef(false);
  const finishLockRef = useRef(false);

  const habitStats = useMemo(() => computeReplayHabitStats(sessions), [sessions]);
  const [tradeLibraryExamplesOnly, setTradeLibraryExamplesOnly] = useState(false);

  const refreshSessions = useCallback(async () => {
    const res = await Api.getTraderReplaySessions();
    const rows = Array.isArray(res?.data?.sessions) ? res.data.sessions : [];
    setSessions(rows.map((r) => normalizeReplay(r)));
  }, []);

  const runInitialLoad = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      await refreshSessions();
    } catch (e) {
      setLoadError('Could not load replay sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [refreshSessions]);

  useEffect(() => {
    runInitialLoad();
  }, [runInitialLoad]);

  const continueLast = useMemo(() => findContinueLastSession(sessions), [sessions]);

  const dirty = useMemo(
    () => Boolean(activeId || form._isDemoLocal) && sessionFingerprint(form) !== lastSavedFingerprint,
    [form, lastSavedFingerprint, activeId]
  );

  useEffect(() => {
    setPlaying(false);
  }, [activeId, view, setupMode]);

  useReplayPlayback(playing, setPlaying, form.playbackSpeedMs, setForm);

  const openWorkspace = useCallback((session, id) => {
    setPlaying(false);
    const n = normalizeReplay({ ...session, id: id ?? session.id });
    setActiveId(id ?? session.id ?? null);
    const nextForm = { ...n };
    if (session._isDemoLocal) nextForm._isDemoLocal = true;
    else delete nextForm._isDemoLocal;
    setForm(nextForm);
    setLastSavedFingerprint(sessionFingerprint(n));
    setView('workspace');
  }, []);

  const openSession = useCallback(
    (session) => {
      const id = session.id;
      if (!id) {
        openWorkspace({ ...session, _isDemoLocal: true }, null);
        return;
      }
      openWorkspace(session, id);
    },
    [openWorkspace]
  );

  const openSessionWithDirtyGuard = useCallback(
    (session) => {
      if (view === 'workspace' && dirty) {
        const ok = window.confirm(
          'You have unsaved changes. Open this replay anyway? Save first if you need to keep your work.'
        );
        if (!ok) return;
      }
      openSession(session);
    },
    [view, dirty, openSession]
  );

  const persistReplayFields = useCallback(
    async (partial) => {
      const merged = normalizeReplay({ ...form, ...partial });
      setForm(merged);
      if (finishedSnapshot?.id && merged.id === finishedSnapshot.id) {
        setFinishedSnapshot(merged);
      }
      const id = activeId || merged.id;
      if (!id) {
        toast.info('Save the replay to your library first.');
        return;
      }
      try {
        const res = await Api.updateTraderReplaySession(id, toApiPayload(merged));
        const saved = normalizeReplay(res?.data?.session || merged);
        setForm(saved);
        if (summaryOpen) setFinishedSnapshot(saved);
        setLastSavedFingerprint(sessionFingerprint(saved));
        setSessions((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
        await refreshSessions();
      } catch (e) {
        console.error(e);
        toast.error('Could not sync — try Save.');
      }
    },
    [form, activeId, finishedSnapshot, summaryOpen, refreshSessions]
  );

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || loading || loadError || !sessions.length) return;
    const found = sessions.find((s) => s.id === openId);
    if (!found) return;
    openSession(found);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [loading, loadError, sessions, searchParams, setSearchParams, openSession]);

  const goHub = useCallback(() => {
    setPlaying(false);
    setView('hub');
    setActiveId(null);
    const cleared = emptySessionDraft();
    setForm(cleared);
    setLastSavedFingerprint(sessionFingerprint(normalizeReplay(cleared)));
    setTradeLibraryExamplesOnly(false);
  }, []);

  const requestHub = useCallback(() => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Leave this replay?');
      if (!ok) return;
    }
    goHub();
  }, [dirty, goHub]);

  const saveReplay = async () => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setSaving(true);
    try {
      const payload = toApiPayload(form);
      if (activeId) {
        const res = await Api.updateTraderReplaySession(activeId, payload);
        const saved = normalizeReplay(res?.data?.session || { ...form, id: activeId });
        setSessions((prev) => prev.map((item) => (item.id === activeId ? saved : item)));
        setForm(saved);
        setLastSavedFingerprint(sessionFingerprint(saved));
        toast.success('Replay saved');
      } else {
        const res = await Api.createTraderReplaySession(payload);
        const saved = normalizeReplay(res?.data?.session || payload);
        setSessions((prev) => [saved, ...prev]);
        setActiveId(saved.id);
        setForm(saved);
        setLastSavedFingerprint(sessionFingerprint(saved));
        toast.success('Replay created');
      }
      await refreshSessions();
    } catch (error) {
      console.error(error);
      toast.error('Could not save replay — your edits are still local. Try again.');
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const deleteReplay = async () => {
    if (!activeId) return;
    const title = (form.title || 'this replay').slice(0, 80);
    const ok = window.confirm(`Delete "${title}" permanently? This cannot be undone.`);
    if (!ok) return;
    setPlaying(false);
    const idToDelete = activeId;
    try {
      await Api.deleteTraderReplaySession(idToDelete);
      toast.success('Replay deleted');
      await refreshSessions();
      goHub();
    } catch (e) {
      console.error(e);
      toast.error('Delete failed — session may still exist.');
    }
  };

  const finishReplay = async () => {
    if (finishLockRef.current || saveLockRef.current) return;
    finishLockRef.current = true;
    setPlaying(false);
    const norm = normalizeReplay(form);
    const maxIdx = Math.max(0, (norm.replayMarkers?.length || 1) - 1);
    const next = normalizeReplay({
      ...form,
      replayStatus: REPLAY_STATUSES.completed,
      completedAt: new Date().toISOString(),
      replayStep: maxIdx,
    });
    setForm(next);
    setFinishedSnapshot(next);
    setSummaryOpen(true);
    setSaving(true);
    try {
      if (activeId) {
        const res = await Api.updateTraderReplaySession(activeId, toApiPayload(next));
        const saved = normalizeReplay(res?.data?.session || next);
        setForm(saved);
        setFinishedSnapshot(saved);
        setLastSavedFingerprint(sessionFingerprint(saved));
        setSessions((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      } else {
        const res = await Api.createTraderReplaySession(toApiPayload(next));
        const saved = normalizeReplay(res?.data?.session || next);
        setActiveId(saved.id);
        setForm(saved);
        setFinishedSnapshot(saved);
        setLastSavedFingerprint(sessionFingerprint(saved));
        setSessions((prev) => [saved, ...prev]);
      }
      await refreshSessions();
      toast.success('Replay marked complete');
    } catch (e) {
      console.error(e);
      toast.error('Could not sync completion — data is in the summary; try Save from workspace.');
    } finally {
      finishLockRef.current = false;
      setSaving(false);
    }
  };

  const createFromDraft = async (draft) => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    const merged = normalizeReplay({ ...emptySessionDraft(), ...draft, replayStatus: REPLAY_STATUSES.inProgress });
    setSaving(true);
    try {
      const res = await Api.createTraderReplaySession(toApiPayload(merged));
      const saved = normalizeReplay(res?.data?.session || merged);
      setSessions((prev) => [saved, ...prev]);
      openWorkspace(saved, saved.id);
      toast.success('Replay session created');
      await refreshSessions();
    } catch (e) {
      console.error(e);
      toast.error('Could not create session');
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const newReplayFlow = () => {
    if (dirty) {
      const ok = window.confirm('Discard unsaved changes and start a new replay?');
      if (!ok) return;
    }
    setPlaying(false);
    setSetupMode(REPLAY_MODES.trade);
    setView('setup');
    setActiveId(null);
    const draft = emptySessionDraft({ replayStatus: REPLAY_STATUSES.inProgress });
    setForm(draft);
    setLastSavedFingerprint(sessionFingerprint(normalizeReplay(draft)));
  };

  const tryDemo = () => {
    if (dirty) {
      const ok = window.confirm('Replace the current draft with the guided example?');
      if (!ok) return;
    }
    setPlaying(false);
    openWorkspace({ _isDemoLocal: true }, null);
  };

  const headerStats = useMemo(() => {
    const s = normalizeReplay(form);
    const markers = s.replayMarkers?.length || 1;
    const step = Math.min((s.replayStep || 0) + 1, markers);
    const verdictShort = s.verdict ? `${s.verdict.slice(0, 28)}${s.verdict.length > 28 ? '…' : ''}` : '—';
    return [
      { label: 'Mode', value: s.mode || '—' },
      { label: 'Symbol', value: s.asset || s.symbol || '—' },
      { label: 'Date', value: s.replayDate || s.sourceDate || '—' },
      { label: 'Verdict', value: verdictShort },
      { label: 'Outcome', value: s.outcome || '—' },
      {
        label: 'Progress',
        value: `${step}/${markers}`,
        tone: 'gold',
      },
      { label: 'Exec Q', value: String(computeReplayQualityScore(s).score), tone: 'gold' },
      { label: 'Review', value: `${computeReviewCompletenessScore(s).score}%`, tone: 'green' },
    ];
  }, [form]);

  const subTitle = useMemo(() => {
    if (view !== 'workspace') return null;
    if (!activeId && form._isDemoLocal) {
      return 'Local preview · not saved to your account';
    }
    if (form.updatedAt) {
      return `Last updated · ${new Date(form.updatedAt).toLocaleString()}`;
    }
    return dirty ? 'Not synced yet · save to persist' : 'Synced';
  }, [view, activeId, form._isDemoLocal, form.updatedAt, dirty]);

  return (
    <TraderSuiteShell
      variant="terminal"
      terminalPresentation="aura-dashboard"
      eyebrow={formatWelcomeEyebrow(user)}
      title="Trader Replay"
      terminalSubtitle={view === 'workspace' ? subTitle : null}
      description="Multi-mode review: scenario drills, full-day narrative, and single-trade forensics with persisted markers, reflections, and deep links across Aura."
      stats={view === 'workspace' ? headerStats : []}
      primaryAction={(
        <div className="aura-tr-header-actions">
          {view !== 'hub' ? (
            <button type="button" className="trader-suite-btn" onClick={requestHub}>Hub</button>
          ) : null}
          <button type="button" className="trader-suite-btn" onClick={newReplayFlow}>New replay</button>
          {continueLast ? (
            <button
              type="button"
              className="trader-suite-btn trader-suite-btn--primary"
              onClick={() => openSessionWithDirtyGuard(continueLast)}
            >
              Continue last
            </button>
          ) : null}
          {view === 'workspace' ? (
            <>
              <button
                type="button"
                className="trader-suite-btn"
                onClick={saveReplay}
                disabled={saving || (Boolean(activeId) && !dirty)}
                title={(activeId && !dirty) ? 'Nothing new to save' : 'Save replay to your library'}
              >
                {saving ? 'Saving…' : activeId && !dirty ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                className="trader-suite-btn trader-suite-btn--primary"
                onClick={finishReplay}
                disabled={saving}
              >
                Finish replay
              </button>
              {activeId ? (
                <button type="button" className="trader-suite-btn" onClick={deleteReplay} disabled={saving}>
                  Delete
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      )}
      secondaryActions={null}
    >
      {loading ? <div className="trader-suite-empty aura-tr-loading">Loading your replay library…</div> : null}
      {loadError ? (
        <div className="trader-suite-empty aura-tr-error">
          <p>{loadError}</p>
          <button type="button" className="trader-suite-btn trader-suite-btn--primary" onClick={runInitialLoad}>
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !loadError && view === 'hub' ? (
        <ReplayHub
          sessionsCount={sessions.length}
          continueSession={continueLast}
          habitStats={habitStats}
          replayTier={replayTier}
          replayFlags={replayFlags}
          onChooseMode={(mode) => {
            setPlaying(false);
            setSetupMode(mode);
            setView('setup');
          }}
          onOpenLibrary={() => {
            setPlaying(false);
            setSetupMode(REPLAY_MODES.trade);
            setTradeLibraryExamplesOnly(false);
            setView('setup');
          }}
          onBrowseLearningExamples={() => {
            setPlaying(false);
            setSetupMode(REPLAY_MODES.trade);
            setTradeLibraryExamplesOnly(true);
            setView('setup');
          }}
          onTryDemo={tryDemo}
          sessions={sessions}
          onOpenSession={openSessionWithDirtyGuard}
        />
      ) : null}

      {!loading && !loadError && view === 'setup' ? (
        <ReplaySetupPanel
          mode={setupMode}
          sessions={sessions}
          replayTier={replayTier}
          replayFlags={replayFlags}
          initialLearningExamplesFilter={tradeLibraryExamplesOnly}
          onConsumedLearningExamplesFilter={() => setTradeLibraryExamplesOnly(false)}
          onBack={() => {
            setPlaying(false);
            setView('hub');
            setTradeLibraryExamplesOnly(false);
          }}
          onCreateFromDraft={createFromDraft}
          onOpenSession={openSessionWithDirtyGuard}
        />
      ) : null}

      {!loading && !loadError && view === 'workspace' ? (
        <ReplayWorkspace
          form={form}
          setForm={setForm}
          activeId={activeId}
          dirty={dirty}
          playing={playing}
          setPlaying={setPlaying}
          onSave={saveReplay}
          saving={saving}
          sessions={sessions}
          habitStats={habitStats}
          replayFlags={replayFlags}
          onPersistFields={persistReplayFields}
        />
      ) : null}

      {summaryOpen && finishedSnapshot ? (
        <ReplaySummaryModal
          session={normalizeReplay(finishedSnapshot)}
          replayFlags={replayFlags}
          allSessions={sessions}
          habitStats={habitStats}
          onClose={() => { setSummaryOpen(false); }}
          onReplayAnother={() => { setSummaryOpen(false); goHub(); }}
          onApplyLearningExample={
            finishedSnapshot.id
              ? (kind) => persistReplayFields({
                  learningExample: true,
                  learningExampleKind: kind,
                })
              : undefined
          }
          onClearLearningExample={
            finishedSnapshot.id
              ? () => persistReplayFields({
                  learningExample: false,
                  learningExampleKind: null,
                })
              : undefined
          }
        />
      ) : null}
    </TraderSuiteShell>
  );
}
