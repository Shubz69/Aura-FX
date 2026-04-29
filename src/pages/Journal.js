import React, { useState, useEffect, useCallback, useRef, useMemo, useReducer } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
import { getStoredUser } from '../utils/storage';
import { isAdmin } from '../utils/roles';
import { getJournalTodayForUser } from '../utils/journalDate';
import CosmicBackground from '../components/CosmicBackground';

import {
  getReminderForTask,
  upsertReminder,
  removeReminderByTask,
  JOURNAL_REMINDERS_CHANGED,
} from '../utils/journalTaskReminders';
import '../styles/Journal.css';
import {
  FaPlus, FaTrash, FaCheck, FaCircle, FaEdit, FaSave,
  FaCamera, FaFire, FaBolt, FaTimes, FaChevronLeft, FaChevronRight, FaBell,
} from 'react-icons/fa';
import {
  buildJournalDraftFromSearchParams,
  readReplayDateFromWindow,
  stripReplayHandoffParams,
  TR_HANDOFF,
} from '../lib/trader-replay/replayToolHandoff';

const MOOD_OPTIONS = [
  { value: 'great', labelKey: 'journal.mood.great', emoji: '😊' },
  { value: 'good', labelKey: 'journal.mood.good', emoji: '🙂' },
  { value: 'ok', labelKey: 'journal.mood.ok', emoji: '😐' },
  { value: 'low', labelKey: 'journal.mood.low', emoji: '😔' },
  { value: 'rough', labelKey: 'journal.mood.rough', emoji: '😤' },
];

function getMonthStart(d) {
  const [y, m] = d.slice(0, 10).split('-').map(Number);
  const x = new Date(y, m - 1, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`;
}
function getMonthEnd(d) {
  const [y, m] = d.slice(0, 10).split('-').map(Number);
  const last = new Date(y, m, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}
function getWeekStart(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  return x.toISOString().slice(0, 10);
}
function getWeekEnd(d) {
  const start = new Date(getWeekStart(d));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}
function isSameDay(a, b) {
  return a && b && String(a).slice(0, 10) === String(b).slice(0, 10);
}

/** Saturday = rest day for mandatory tasks (matches API / UTC). */
function isJournalSaturdayUTC(dateStr) {
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

function isCanceledError(err) {
  return Boolean(err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError'));
}

const REMINDER_MAX_MS = 1000 * 60 * 60 * 24 * 30;
const JOURNAL_DAY_IMAGES_MAX = 8;

function formatReminderRelative(fireAt, t) {
  const ms = Number(fireAt) - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms < 45_000) return t('journal.inAMoment');
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return t('journal.inMin', { count: mins });
  const hrs = Math.round(ms / 3_600_000);
  if (hrs < 48) return t('journal.inHoursApprox', { count: hrs });
  const days = Math.round(ms / 86_400_000);
  return t('journal.inDaysApprox', { count: days });
}

function tomorrowAtNineLocalMs() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

async function ensureNotificationPermission(t) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') {
    toast.info(t('journal.turnOnNotifications'), { autoClose: 6000 });
    return;
  }
  try {
    await Notification.requestPermission();
  } catch {
    // Ignore prompt issues; in-app toast reminders still work.
  }
}

/* ══════════════════════════════════════════════════════════════
   PHOTO LIGHTBOX
   ══════════════════════════════════════════════════════════════ */
function PhotoLightbox({ photos, startIndex = 0, onClose }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(startIndex);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(c + 1, photos.length - 1));
      if (e.key === 'ArrowLeft')  setCurrent((c) => Math.max(c - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, photos.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className={`journal-lightbox${closing ? ' journal-lightbox--closing' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <button className="journal-lightbox-close" onClick={close} title={t('journal.closeEsc')} type="button">
        <FaTimes />
      </button>
      <button
        className="journal-lightbox-arrow journal-lightbox-arrow--prev"
        onClick={() => setCurrent((c) => c - 1)}
        disabled={current === 0}
        type="button"
      >
        <FaChevronLeft />
      </button>
      <div className="journal-lightbox-img-wrap" key={current}>
        <img src={photos[current]} alt={t('journal.proofN', { n: current + 1 })} draggable={false} />
      </div>
      <button
        className="journal-lightbox-arrow journal-lightbox-arrow--next"
        onClick={() => setCurrent((c) => c + 1)}
        disabled={current === photos.length - 1}
        type="button"
      >
        <FaChevronRight />
      </button>
      {photos.length > 1 && (
        <div className="journal-lightbox-counter">{current + 1} / {photos.length}</div>
      )}
      {photos.length > 1 && (
        <div className="journal-lightbox-thumbs">
          {photos.map((src, i) => (
            <div
              key={i}
              className={`journal-lightbox-thumb${i === current ? ' journal-lightbox-thumb--active' : ''}`}
              onClick={() => setCurrent(i)}
            >
              <img src={src} alt={t('journal.thumbN', { n: i + 1 })} draggable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN JOURNAL COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function Journal() {
  const { t, i18n } = useTranslation();
  const { user: authUser } = useAuth();
  const userAdmin = useMemo(() => isAdmin(authUser), [authUser]);

  const [journalToday, setJournalToday] = useState(() => getJournalTodayForUser(null));
  const [selectedDate, setSelectedDate]   = useState(() => readReplayDateFromWindow() || getJournalTodayForUser(null));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const base = readReplayDateFromWindow() || getJournalTodayForUser(null);
    return base.slice(0, 7);
  });
  const [monthTasks, setMonthTasks]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [newTaskTitle, setNewTaskTitle]   = useState('');
  const [adding, setAdding]               = useState(false);
  const [dailyNotes, setDailyNotes]       = useState('');
  const [dailyMood, setDailyMood]         = useState(null);
  const [dailySaving, setDailySaving]     = useState(false);
  /** 'idle' | 'saving' | 'saved' | 'error' — diary line status for non-admins */
  const [diarySaveStatus, setDiarySaveStatus] = useState('idle');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitle, setEditTitle]         = useState('');
  const [dailyNotesList, setDailyNotesList]   = useState([]);
  const [newNoteContent, setNewNoteContent]   = useState('');
  const [addingNote, setAddingNote]           = useState(false);
  const [completionBannerDismissed, setCompletionBannerDismissed] = useState(false);
  const [journalTab, setJournalTab] = useState('mandatory');
  const [searchParams, setSearchParams] = useSearchParams();
  const [replayReturnHref, setReplayReturnHref] = useState(null);
  const replayHandoffConsumedRef = useRef(false);

  // Multi-photo proof: { [taskId]: string[] }
  const [proofPhotos, setProofPhotos]     = useState({});
  const proofInputRef                     = useRef(null);
  const pendingProofTaskId                = useRef(null);
  /** Per-day reflection screenshots (same persistence pattern as task proof images). */
  const [dayImages, setDayImages]         = useState([]);
  const dayImagesInputRef                 = useRef(null);

  // Lightbox
  const [lightbox, setLightbox] = useState(null);

  const journalUserId = authUser?.id;
  const [reminderMenuTaskId, setReminderMenuTaskId] = useState(null);
  const [reminderCustomDt, setReminderCustomDt] = useState('');
  const reminderWrapRef = useRef(null);
  const [, bumpReminders] = useReducer((n) => n + 1, 0);
  const reminderNavSyncedRef = useRef(false);
  const reminderScrollDoneRef = useRef(false);

  // Note editing
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const lastSavedDiaryRef = useRef('');
  const skipDiaryAutosaveRef = useRef(true);
  const diaryDebounceTimerRef = useRef(null);
  const diaryAbortRef = useRef(null);
  const dailyNotesRef = useRef(dailyNotes);
  dailyNotesRef.current = dailyNotes;
  const dailyMoodRef = useRef(dailyMood);
  dailyMoodRef.current = dailyMood;

  const canEditJournal = true;

  useEffect(() => { setCompletionBannerDismissed(false); }, [selectedDate]);

  useEffect(() => {
    const sync = () => bumpReminders();
    window.addEventListener(JOURNAL_REMINDERS_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(JOURNAL_REMINDERS_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  /** Notification / push deep link: /journal?reminderTask=&reminderDate= */
  useEffect(() => {
    const tid = searchParams.get('reminderTask');
    if (!tid) {
      reminderNavSyncedRef.current = false;
      reminderScrollDoneRef.current = false;
      return;
    }
    const tdate = searchParams.get('reminderDate');
    if (tdate && /^\d{4}-\d{2}-\d{2}$/.test(tdate) && !reminderNavSyncedRef.current) {
      reminderNavSyncedRef.current = true;
      setSelectedDate(tdate.slice(0, 10));
      setCalendarMonth(tdate.slice(0, 7));
    }
  }, [searchParams]);

  useEffect(() => {
    const tid = searchParams.get('reminderTask');
    if (!tid || loading) return;
    const inList = monthTasks.some((t) => String(t.id) === String(tid));
    if (!inList || reminderScrollDoneRef.current) return;
    reminderScrollDoneRef.current = true;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      const el = document.getElementById(`journal-task-${tid}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const next = new URLSearchParams(searchParams);
      next.delete('reminderTask');
      next.delete('reminderDate');
      setSearchParams(next, { replace: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [loading, monthTasks, searchParams, setSearchParams]);

  useEffect(() => {
    if (!reminderMenuTaskId) return;
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setReminderCustomDt(d.toISOString().slice(0, 16));
  }, [reminderMenuTaskId]);

  useEffect(() => {
    if (!reminderMenuTaskId) return;
    const el = reminderWrapRef.current;
    if (!el) return;
    const onDown = (e) => {
      if (!el.contains(e.target)) setReminderMenuTaskId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [reminderMenuTaskId]);

  useEffect(() => {
    setJournalToday(getJournalTodayForUser(authUser));
  }, [authUser]);

  useEffect(() => {
    const tick = () => setJournalToday(getJournalTodayForUser(authUser));
    const id = setInterval(tick, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [authUser]);

  const monthStart  = getMonthStart(calendarMonth + '-01');
  const monthEnd    = getMonthEnd(calendarMonth + '-01');
  const weekStart   = getWeekStart(selectedDate);
  const weekEnd     = getWeekEnd(selectedDate);
  const fetchFrom   = weekStart < monthStart ? weekStart : monthStart;
  const fetchTo     = weekEnd   > monthEnd   ? weekEnd   : monthEnd;

  /* ── Data fetch ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    skipDiaryAutosaveRef.current = true;
    setLoading(true);
    setError(null);

    Promise.all([
      Api.getJournalTasks({ dateFrom: fetchFrom, dateTo: fetchTo }),
      Api.getJournalDaily(selectedDate),
      Api.getJournalNotes(selectedDate),
    ]).then(([tasksRes, dailyRes, notesRes]) => {
      if (cancelled) return;
      const tasks = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
      setMonthTasks(tasks);
      const restoredPhotos = {};
      tasks.forEach((t) => {
        if (Array.isArray(t.proofImages) && t.proofImages.length > 0) {
          restoredPhotos[t.id] = t.proofImages;
        } else if (t.proofImage) {
          restoredPhotos[t.id] = [t.proofImage];
        }
      });
      setProofPhotos(restoredPhotos);
      setLoading(false);
      const noteText = dailyRes.data?.note?.notes ?? '';
      setDailyNotes(noteText);
      lastSavedDiaryRef.current = noteText;
      setDailyMood(dailyRes.data?.note?.mood ?? null);
      const di = dailyRes.data?.note?.dayImages;
      setDayImages(Array.isArray(di) ? di.filter((x) => typeof x === 'string' && x.trim()) : []);
      setDailyNotesList(Array.isArray(notesRes.data?.notes) ? notesRes.data.notes : []);
      setDiarySaveStatus('idle');
      skipDiaryAutosaveRef.current = false;
    }).catch((err) => {
      if (!cancelled) {
        setError(err.response?.data?.message || t('journal.failedLoadTasks'));
        setMonthTasks([]);
        setLoading(false);
        skipDiaryAutosaveRef.current = false;
      }
    });

    return () => { cancelled = true; };
  }, [fetchFrom, fetchTo, selectedDate]);

  /* ── XP check ────────────────────────────────────────── */
  useEffect(() => {
    if (loading || !selectedDate) return;
    Api.getJournalXpCheck(selectedDate)
      .then((res) => {
        (res.data?.awarded || []).forEach(({ type, xp }) => {
          const lbl = type === 'day' ? 'day' : type === 'week' ? 'week' : 'month';
          toast.success(`+${xp} XP for ${lbl} completion!`, { icon: '⭐' });
        });
      })
      .catch(() => {});
  }, [loading, selectedDate]);

  /* ── Trader Replay handoff (prefill diary + reflection tab) ─────────────── */
  useEffect(() => {
    if (loading || replayHandoffConsumedRef.current) return;
    if (!searchParams.get(TR_HANDOFF.origin) && !searchParams.get('replaySessionId')) return;
    const ret = searchParams.get(TR_HANDOFF.returnToReplay);
    if (ret) setReplayReturnHref(ret);
    const draft = buildJournalDraftFromSearchParams(searchParams);
    const marker = `[tr-replay:${searchParams.get('replaySessionId') || 'session'}]`;
    if (draft.trim()) {
      setDailyNotes((prev) => {
        if (prev.includes(marker)) return prev;
        return (prev.trim() ? `${prev}\n\n` : '') + `---\n${draft}\n${marker}`;
      });
    }
    setJournalTab('reflection');
    replayHandoffConsumedRef.current = true;
    const next = stripReplayHandoffParams(searchParams);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [loading, searchParams, setSearchParams]);

  /* ── Save daily note (immediate; clears pending debounced save) ───────── */
  const saveDailyNote = useCallback(async (overrides = {}) => {
    if (!canEditJournal) return;
    if (diaryDebounceTimerRef.current) {
      clearTimeout(diaryDebounceTimerRef.current);
      diaryDebounceTimerRef.current = null;
    }
    diaryAbortRef.current?.abort();
    const ac = new AbortController();
    diaryAbortRef.current = ac;

    const notes = overrides.notes !== undefined ? overrides.notes : dailyNotes;
    const mood = overrides.mood !== undefined ? overrides.mood : dailyMood;

    setDailySaving(true);
    setDiarySaveStatus('saving');
    try {
      const res = await Api.updateJournalDaily(
        { date: selectedDate, notes, mood },
        { signal: ac.signal }
      );
      const saved = res.data?.note?.notes ?? notes;
      lastSavedDiaryRef.current = saved;
      if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for saving notes!`, { icon: '⭐' });
      setDiarySaveStatus('saved');
      setTimeout(() => setDiarySaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2200);
    } catch (err) {
      if (isCanceledError(err)) return;
      setDiarySaveStatus('error');
      setError(err.response?.data?.message || t('journal.failedSaveNotes'));
    } finally {
      setDailySaving(false);
    }
  }, [canEditJournal, selectedDate, dailyNotes, dailyMood]);

  /* Debounced autosave for diary text (non-admins only) */
  useEffect(() => {
    if (userAdmin || loading) return;
    if (skipDiaryAutosaveRef.current) return;
    const cur = dailyNotesRef.current;
    if (cur === lastSavedDiaryRef.current) return;

    if (diaryDebounceTimerRef.current) clearTimeout(diaryDebounceTimerRef.current);
    diaryDebounceTimerRef.current = setTimeout(() => {
      diaryDebounceTimerRef.current = null;
      const notes = dailyNotesRef.current;
      if (notes === lastSavedDiaryRef.current) return;

      diaryAbortRef.current?.abort();
      const ac = new AbortController();
      diaryAbortRef.current = ac;
      setDiarySaveStatus('saving');
      Api.updateJournalDaily(
        { date: selectedDate, notes, mood: dailyMoodRef.current },
        { signal: ac.signal }
      )
        .then((res) => {
          lastSavedDiaryRef.current = res.data?.note?.notes ?? notes;
          if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for saving notes!`, { icon: '⭐' });
          setDiarySaveStatus('saved');
          setTimeout(() => setDiarySaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2200);
        })
        .catch((err) => {
          if (isCanceledError(err)) return;
          setDiarySaveStatus('error');
          setError(err.response?.data?.message || t('journal.failedSaveNotes'));
        });
    }, 700);

    return () => {
      if (diaryDebounceTimerRef.current) {
        clearTimeout(diaryDebounceTimerRef.current);
        diaryDebounceTimerRef.current = null;
      }
    };
  }, [dailyNotes, userAdmin, loading, selectedDate]);

  /* ── Derived task lists ──────────────────────────────── */
  const dayTasks           = monthTasks.filter((t) => isSameDay(t.date, selectedDate));
  const dayMandatoryTasks  = dayTasks.filter((t) => t.isMandatory);
  const dayRegularTasks    = dayTasks.filter((t) => !t.isMandatory);
  const mandatoryTabCount  = dayMandatoryTasks.length;
  const personalTabCount   = dayRegularTasks.length;
  const reflectionTabCount =
    dailyNotesList.length
    + (dailyNotes.trim() ? 1 : 0)
    + (dailyMood ? 1 : 0)
    + dayImages.length;
  const weekTasks          = monthTasks.filter((t) => t.date >= weekStart && t.date <= weekEnd);
  const monthTasksForMonth = monthTasks.filter((t) => t.date >= monthStart && t.date <= monthEnd);

  const dayTotal   = dayTasks.length;
  const dayDone    = dayTasks.filter((t) => t.completed).length;
  const dayPct     = dayTotal  ? Math.round((dayDone  / dayTotal)  * 100) : null;
  const weekTotal  = weekTasks.length;
  const weekDone   = weekTasks.filter((t) => t.completed).length;
  const weekPct    = weekTotal ? Math.round((weekDone / weekTotal) * 100) : null;
  const monthTotal = monthTasksForMonth.length;
  const monthDone  = monthTasksForMonth.filter((t) => t.completed).length;
  const monthPct   = monthTotal ? Math.round((monthDone / monthTotal) * 100) : null;

  /* ── Calendar navigation ─────────────────────────────── */
  const handlePrevMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const nm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    setCalendarMonth(nm);
    if (selectedDate.slice(0, 7) !== nm) setSelectedDate(`${nm}-01`);
  };
  const handleNextMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    setCalendarMonth(nm);
    if (selectedDate.slice(0, 7) !== nm) setSelectedDate(`${nm}-01`);
  };

  /* ── Task CRUD ───────────────────────────────────────── */
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!canEditJournal) return;
    const title = newTaskTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const res = await Api.createJournalTask({ date: selectedDate, title });
      const task = res.data?.task;
      if (task) {
        setMonthTasks((prev) => [...prev, task]);
        setNewTaskTitle('');
        if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for adding a task!`, { icon: '⭐' });
      }
    } catch (err) {
      setError(err.response?.data?.message || t('journal.failedAddTask'));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task) => {
    if (!canEditJournal) return;
    const prevCompleted = task.completed;
    const nextCompleted = !prevCompleted;
    setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
    try {
      const res = await Api.updateJournalTask(task.id, { completed: nextCompleted });
      const updated = res.data?.task;
      if (updated) {
        setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for completing with proof!`, { icon: '⭐' });
      }
    } catch (err) {
      setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: prevCompleted } : t)));
      setError(err.response?.data?.message || t('journal.failedUpdateTask'));
    }
  };

  const handleDelete = async (id) => {
    if (!canEditJournal) return;
    try {
      await Api.deleteJournalTask(id);
      if (journalUserId) removeReminderByTask(journalUserId, id);
      setMonthTasks((prev) => prev.filter((t) => t.id !== id));
      setProofPhotos((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      setError(err.response?.data?.message || t('journal.failedDeleteTask'));
    }
  };

  const applyJournalReminder = useCallback(async (task, fireAtMs) => {
    if (!journalUserId) {
      toast.error(t('journal.signInForReminders'));
      return;
    }
    const fireTs = Number(fireAtMs);
    if (!Number.isFinite(fireTs) || fireTs <= Date.now()) {
      toast.error(t('journal.chooseFutureTime'));
      return;
    }
    if (fireTs - Date.now() > REMINDER_MAX_MS) {
      toast.error(t('journal.remindersMax30Days'));
      return;
    }
    await ensureNotificationPermission(t);
    upsertReminder({
      userId: journalUserId,
      taskId: task.id,
      taskTitle: task.title,
      fireAtMs: fireTs,
    });
    try {
      await Api.updateJournalTask(task.id, { reminderAt: new Date(fireTs).toISOString() });
    } catch (e) {
      // Keep local reminder fallback even if server sync fails.
      console.warn('Server reminder sync failed:', e?.response?.data?.message || e?.message);
    }
    toast.success(t('journal.reminderSet', { when: formatReminderRelative(fireTs, t) }));
    setReminderMenuTaskId(null);
  }, [journalUserId, t]);

  const applyCustomReminder = useCallback((task) => {
    const t = new Date(reminderCustomDt).getTime();
    applyJournalReminder(task, t);
  }, [reminderCustomDt, applyJournalReminder]);

  const handleEditStart  = (task) => { setEditingTaskId(task.id); setEditTitle(task.title); };
  const handleEditCancel = ()     => { setEditingTaskId(null); setEditTitle(''); };
  const handleEditSave   = async () => {
    if (!canEditJournal) return;
    if (!editingTaskId || !editTitle.trim()) { setEditingTaskId(null); return; }
    try {
      const res = await Api.updateJournalTask(editingTaskId, { title: editTitle.trim() });
      const updated = res.data?.task;
      if (updated) setMonthTasks((prev) => prev.map((t) => (t.id === editingTaskId ? updated : t)));
      setEditingTaskId(null);
      setEditTitle('');
    } catch (err) {
      setError(err.response?.data?.message || t('journal.failedUpdateTask'));
    }
  };

  /* ── Multi-photo proof ───────────────────────────────── */
  const handleProofClick = (taskId) => {
    if (!canEditJournal) return;
    pendingProofTaskId.current = taskId;
    proofInputRef.current?.click();
  };

  const handleProofFilesChange = (e) => {
    if (!canEditJournal) return;
    const files  = Array.from(e.target.files || []);
    const taskId = pendingProofTaskId.current;
    pendingProofTaskId.current = null;
    e.target.value = '';
    if (!taskId || !files.length) return;
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (!valid.length) return;

    Promise.all(
      valid.map((file) => new Promise((res) => {
        const r = new FileReader();
        r.onload = (ev) => res(ev.target.result);
        r.readAsDataURL(file);
      }))
    ).then((newUrls) => {
      setProofPhotos((prev) => {
        const merged = [...(prev[taskId] || []), ...newUrls];
        Api.updateJournalTask(taskId, { proofImages: merged, proofImage: merged[0] })
          .then((res) => {
            const updated = res.data?.task;
            if (updated) setMonthTasks((p) => p.map((t) => (t.id === taskId ? updated : t)));
            if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for proof!`, { icon: '⭐' });
          })
          .catch(() => setError(t('journal.failedAttachProof')));
        return { ...prev, [taskId]: merged };
      });
    });
  };

  const handleRemoveProofPhoto = (taskId, idx) => {
    if (!canEditJournal) return;
    setProofPhotos((prev) => {
      const updated = (prev[taskId] || []).filter((_, i) => i !== idx);
      Api.updateJournalTask(taskId, { proofImages: updated, proofImage: updated[0] || null }).catch(() => {});
      return { ...prev, [taskId]: updated };
    });
  };

  const handleDayImagesClick = () => {
    if (!canEditJournal) return;
    dayImagesInputRef.current?.click();
  };

  const handleDayImagesFilesChange = (e) => {
    if (!canEditJournal) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (!valid.length) return;

    Promise.all(
      valid.map(
        (file) =>
          new Promise((resolve) => {
            const r = new FileReader();
            r.onload = (ev) => resolve(ev.target.result);
            r.readAsDataURL(file);
          })
      )
    ).then((newUrls) => {
      setDayImages((prev) => {
        const room = JOURNAL_DAY_IMAGES_MAX - prev.length;
        if (room <= 0) {
          toast.info(`At most ${JOURNAL_DAY_IMAGES_MAX} screenshots per day.`);
          return prev;
        }
        const capped = newUrls.slice(0, room);
        const merged = [...prev, ...capped];
        const snapshot = prev;
        Api.updateJournalDaily({ date: selectedDate, dayImages: merged })
          .then((res) => {
            const saved = res.data?.note?.dayImages;
            if (Array.isArray(saved)) setDayImages(saved.filter((x) => typeof x === 'string'));
          })
          .catch(() => {
            setError(t('journal.failedSaveDayScreenshots'));
            setDayImages(snapshot);
          });
        return merged;
      });
    });
  };

  const handleRemoveDayImage = (idx) => {
    if (!canEditJournal) return;
    setDayImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      const snapshot = prev;
      Api.updateJournalDaily({ date: selectedDate, dayImages: next })
        .then((res) => {
          const saved = res.data?.note?.dayImages;
          if (Array.isArray(saved)) setDayImages(saved.filter((x) => typeof x === 'string'));
        })
        .catch(() => {
          setError(t('journal.failedRemoveScreenshot'));
          setDayImages(snapshot);
        });
      return next;
    });
  };

  /* ── Notes CRUD ──────────────────────────────────────── */
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!canEditJournal) return;
    const content = newNoteContent.trim();
    if (!content || addingNote) return;
    setAddingNote(true);
    try {
      const res = await Api.addJournalNote(selectedDate, content);
      const note = res.data?.note;
      if (note) {
        setDailyNotesList((prev) => [...prev, note]);
        setNewNoteContent('');
        if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for saving a note!`, { icon: '⭐' });
      }
    } catch (err) {
      setError(err.response?.data?.message || t('journal.failedAddNote'));
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (id) => {
    if (!canEditJournal) return;
    try {
      await Api.deleteJournalNote(id);
      setDailyNotesList((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || t('journal.failedDeleteNote'));
    }
  };

  const handleNoteEditStart  = (note) => { setEditingNoteId(note.id); setEditingNoteText(note.content); };
  const handleNoteEditCancel = ()      => { setEditingNoteId(null); setEditingNoteText(''); };
  const handleNoteEditSave   = async (noteId) => {
    if (!canEditJournal) return;
    const text = editingNoteText.trim();
    if (!text) { handleNoteEditCancel(); return; }
    try {
      const res = await Api.updateJournalNote(noteId, text);
      const updated = res.data?.note;
      setDailyNotesList((prev) =>
        prev.map((n) => (n.id === noteId ? (updated || { ...n, content: text }) : n))
      );
    } catch {
      setDailyNotesList((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, content: text } : n))
      );
    } finally {
      setEditingNoteId(null);
      setEditingNoteText('');
    }
  };

  /* ── Calendar grid ───────────────────────────────────── */
  const calendarDays = useMemo(() => {
    const parts    = String(calendarMonth).split('-');
    const year     = Math.max(1, parseInt(parts[0], 10) || new Date().getFullYear());
    const month1   = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
    const first    = new Date(year, month1 - 1, 1);
    const last     = new Date(year, month1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const yyyy     = String(first.getFullYear());
    const mm       = String(first.getMonth() + 1).padStart(2, '0');
    const days     = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(`${yyyy}-${mm}-${String(d).padStart(2, '0')}`);
    return days;
  }, [calendarMonth]);

  const taskCountByDate = useMemo(() =>
    monthTasks.reduce((acc, t) => {
      const d = String(t.date).slice(0, 10); acc[d] = (acc[d] || 0) + 1; return acc;
    }, {}), [monthTasks]);

  const completedCountByDate = useMemo(() =>
    monthTasks.reduce((acc, t) => {
      if (!t.completed) return acc;
      const d = String(t.date).slice(0, 10); acc[d] = (acc[d] || 0) + 1; return acc;
    }, {}), [monthTasks]);

  /* ── Streak / score ──────────────────────────────────── */
  const streak = authUser?.login_streak
    ?? (typeof localStorage !== 'undefined'
      ? getStoredUser().login_streak
      : 0)
    ?? 0;

  const disciplineScore = dayPct != null && weekPct != null && monthPct != null
    ? Math.min(100, Math.round((dayPct + weekPct + monthPct) / 3))
    : (dayPct ?? 0);

  const label = isSameDay(selectedDate, journalToday)
    ? t('journal.today')
    : (() =>
        new Date(`${selectedDate}T12:00:00`).toLocaleDateString(i18n.language || undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }))();
  const monthHeaderLabel = useMemo(() => {
    const [yy, mm] = calendarMonth.split('-').map(Number);
    const d = new Date(yy, (mm || 1) - 1, 1);
    return d.toLocaleDateString(i18n.language || undefined, { month: 'long', year: 'numeric' });
  }, [calendarMonth, i18n.language]);
  const dayNames = useMemo(() => {
    const base = new Date(Date.UTC(2024, 0, 1)); // Monday
    return [...Array(7)].map((_, idx) =>
      new Date(base.getTime() + idx * 24 * 60 * 60 * 1000).toLocaleDateString(i18n.language || undefined, {
        weekday: 'short',
      }),
    );
  }, [i18n.language]);

  const isMandatoryRestDay = isJournalSaturdayUTC(selectedDate);

  /* ── Proof strip renderer ────────────────────────────── */
  const renderDayImagesStrip = () => {
    if (!dayImages.length && !canEditJournal) return null;
    return (
      <div className="journal-proof-strip journal-day-images-strip">
        {dayImages.map((src, i) => (
          <div
            key={i}
            className="journal-proof-thumb"
            onClick={() => setLightbox({ photos: dayImages, index: i })}
            title={t('journal.tapToView')}
            role="presentation"
          >
            <img src={src} alt={t('journal.dayScreenshotN', { n: i + 1 })} loading="lazy" />
            {canEditJournal && (
              <button
                type="button"
                className="journal-proof-thumb-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveDayImage(i);
                }}
                title={t('common.remove')}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canEditJournal && dayImages.length < JOURNAL_DAY_IMAGES_MAX && (
          <button
            type="button"
            className="journal-proof-add-more"
            onClick={handleDayImagesClick}
            title={t('journal.addScreenshot')}
          >
            +
          </button>
        )}
      </div>
    );
  };

  const renderProofStrip = (taskId) => {
    const photos = proofPhotos[taskId] || [];
    if (!photos.length) return null;
    return (
      <div className="journal-proof-strip">
        {photos.map((src, i) => (
          <div key={i} className="journal-proof-thumb"
            onClick={() => setLightbox({ photos, index: i })} title={t('journal.tapToView')}>
            <img src={src} alt={t('journal.proofN', { n: i + 1 })} loading="lazy" />
            {canEditJournal && (
              <button type="button" className="journal-proof-thumb-remove"
                onClick={(e) => { e.stopPropagation(); handleRemoveProofPhoto(taskId, i); }} title={t('common.remove')}>✕</button>
            )}
          </div>
        ))}
        {canEditJournal && (
          <button type="button" className="journal-proof-add-more"
            onClick={() => handleProofClick(taskId)} title={t('journal.addMorePhotos')}>+</button>
        )}
      </div>
    );
  };

  const renderProofBtn = (taskId) => {
    if (!canEditJournal) return null;
    const count = (proofPhotos[taskId] || []).length;
    return (
      <button type="button" className="journal-task-proof-btn"
        onClick={() => handleProofClick(taskId)} title={t('journal.addPictureProof')}>
        <FaCamera />
        {count === 0 ? ` ${t('journal.proof')}` : ` ${t('journal.more')}`}
        {count > 0 && <span className="journal-proof-count-badge">{count}</span>}
      </button>
    );
  };

  /* ── Task card renderer ──────────────────────────────── */
  const renderTaskCard = (task) => {
    const isEditing = canEditJournal && editingTaskId === task.id;
    const isDone    = task.completed;
    const isMand    = task.isMandatory;
    const existingReminder = journalUserId ? getReminderForTask(journalUserId, task.id) : null;

    return (
      <li
        id={`journal-task-${task.id}`}
        key={task.id}
        className={[
          'journal-task-item',
          isDone ? 'journal-task-item--done' : '',
          isMand ? 'journal-task-item--mandatory' : '',
          reminderMenuTaskId === task.id ? 'journal-task-item--reminder-open' : '',
          !canEditJournal ? 'journal-task-item--readonly' : '',
        ].filter(Boolean).join(' ')}
      >
        {isEditing ? (
          /* ── Inline edit mode ── */
          <div className="journal-task-edit-wrap">
            <input
              type="text"
              className="journal-task-edit-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter')  handleEditSave();
                if (e.key === 'Escape') handleEditCancel();
              }}
              autoFocus
            />
            <div className="journal-task-edit-actions">
              <button type="button" className="journal-task-edit-btn" onClick={handleEditSave}>
                <FaSave /> {t('common.save')}
              </button>
              <button type="button" className="journal-task-edit-btn journal-task-edit-btn--cancel" onClick={handleEditCancel}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Card top: checkbox + XP badge ── */}
            <div className="journal-task-card-top">
              <button
                type="button"
                className="journal-task-check"
                onClick={() => handleToggle(task)}
                disabled={!canEditJournal}
                aria-label={isDone ? t('journal.markNotDone') : t('journal.markDone')}
              >
                {isDone ? <FaCheck /> : <span className="journal-task-check-empty" />}
              </button>
              {isDone && <span className="journal-task-xp">+5 XP</span>}
            </div>

            {/* ── Card body: title + optional description ── */}
            <div className="journal-task-card-body">
              <span
                className="journal-task-title"
                onClick={() => canEditJournal && !isMand && handleEditStart(task)}
                title={isMand ? task.title : (canEditJournal ? t('journal.clickToEdit') : task.title)}
              >
                {task.title}
              </span>
              {task.description && (
                <p className="journal-task-description">{task.description}</p>
              )}
            </div>

            {/* ── Card footer: actions ── */}
            <div className="journal-task-card-footer">
              <div className="journal-task-actions">
                {renderProofBtn(task.id)}
                {journalUserId && (
                  <div
                    className="journal-reminder-wrap"
                    ref={reminderMenuTaskId === task.id ? reminderWrapRef : null}
                  >
                    <button
                      type="button"
                      className={[
                        'journal-task-remind-btn',
                        existingReminder ? 'journal-task-remind-btn--active' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setReminderMenuTaskId(reminderMenuTaskId === task.id ? null : task.id)}
                      title={t('journal.setReminder')}
                      aria-label={t('journal.setReminder')}
                    >
                      <FaBell />
                    </button>
                    {reminderMenuTaskId === task.id && (
                      <div className="journal-reminder-popover" role="dialog" aria-label={t('journal.taskReminder')}>
                        <div className="journal-reminder-popover-title">{t('journal.remindMe')}</div>
                        {existingReminder && (
                          <p className="journal-reminder-scheduled">
                            {t('journal.scheduled')} {formatReminderRelative(existingReminder.fireAt)}
                          </p>
                        )}
                        <div className="journal-reminder-presets">
                          {[
                            { label: t('journal.reminder1Hour'), ms: 60 * 60 * 1000 },
                            { label: t('journal.reminder3Hours'), ms: 3 * 60 * 60 * 1000 },
                            { label: t('journal.reminder6Hours'), ms: 6 * 60 * 60 * 1000 },
                            { label: t('journal.reminder1Day'), ms: 24 * 60 * 60 * 1000 },
                            { label: t('journal.reminder2Days'), ms: 2 * 24 * 60 * 60 * 1000 },
                          ].map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              className="journal-reminder-preset"
                              onClick={() => applyJournalReminder(task, Date.now() + p.ms)}
                            >
                              {p.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="journal-reminder-preset"
                            onClick={() => applyJournalReminder(task, tomorrowAtNineLocalMs())}
                          >
                            {t('journal.tomorrowNine')}
                          </button>
                        </div>
                        <div className="journal-reminder-custom">
                          <label className="journal-reminder-custom-label" htmlFor={`journal-reminder-dt-${task.id}`}>
                            {t('journal.customTime')}
                          </label>
                          <input
                            id={`journal-reminder-dt-${task.id}`}
                            type="datetime-local"
                            className="journal-reminder-datetime"
                            value={reminderCustomDt}
                            onChange={(e) => setReminderCustomDt(e.target.value)}
                          />
                          <button
                            type="button"
                            className="journal-reminder-apply"
                            onClick={() => applyCustomReminder(task)}
                          >
                            {t('journal.set')}
                          </button>
                        </div>
                        {existingReminder && (
                          <button
                            type="button"
                            className="journal-reminder-clear"
                            onClick={async () => {
                              removeReminderByTask(journalUserId, task.id);
                              try {
                                await Api.updateJournalTask(task.id, { reminderAt: null });
                              } catch (e) {
                                console.warn('Server reminder clear failed:', e?.response?.data?.message || e?.message);
                              }
                              toast.success(t('journal.reminderRemoved'));
                              setReminderMenuTaskId(null);
                            }}
                          >
                            {t('journal.clearReminder')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {canEditJournal && !isMand && (
                  <button type="button" className="journal-task-edit-icon"
                    onClick={(e) => { e.stopPropagation(); handleEditStart(task); }}
                    aria-label={t('journal.editTask')}>
                    <FaEdit />
                  </button>
                )}
                {canEditJournal && !isMand && (
                  <button type="button" className="journal-task-delete"
                    onClick={() => handleDelete(task.id)}
                    aria-label={t('journal.deleteTask')}>
                    <FaTrash />
                  </button>
                )}
              </div>
            </div>

            {/* ── Proof photo strip ── */}
            {renderProofStrip(task.id)}
          </>
        )}
      </li>
    );
  };

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */
  return (
    <div className="journal-page" id="journal-top">
        {/* ── Cosmic Background ── */}
      <CosmicBackground />
      <div className="journal-layout">

        {/* ══════════ SIDEBAR ══════════ */}
        <aside className="journal-sidebar">
          <header className="journal-sidebar-header">
            <h2 className="journal-sidebar-title">{t('journal.title')}</h2>
            <p className="journal-sidebar-sub">{t('journal.sidebarSub')}</p>
          </header>

          {/* Calendar */}
          <div className="journal-calendar">
            <div className="journal-calendar-nav">
              <button type="button" className="journal-calendar-btn" onClick={handlePrevMonth} aria-label={t('journal.previousMonth')}>‹</button>
              <span className="journal-calendar-month">{monthHeaderLabel}</span>
              <button type="button" className="journal-calendar-btn" onClick={handleNextMonth} aria-label={t('journal.nextMonth')}>›</button>
            </div>
            <div className="journal-calendar-weekdays">
              {dayNames.map((d, idx) => <span key={`wd-${idx}`} className="journal-calendar-wd">{d}</span>)}
            </div>
            <div className="journal-calendar-grid">
              {calendarDays.map((dateStr, i) => {
                if (!dateStr) return <div key={`e-${i}`} className="journal-calendar-day journal-calendar-day--empty" />;
                const hasTasks   = taskCountByDate[dateStr];
                const doneCount  = completedCountByDate[dateStr] || 0;
                const totalCount = taskCountByDate[dateStr]      || 0;
                const isSelected = isSameDay(dateStr, selectedDate);
                const isToday    = isSameDay(dateStr, journalToday);
                return (
                  <button key={dateStr} type="button"
                    className={`journal-calendar-day${isSelected ? ' journal-calendar-day--selected' : ''}${isToday ? ' journal-calendar-day--today' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <span className="journal-calendar-day-num">{parseInt(dateStr.slice(-2), 10)}</span>
                    {hasTasks && (
                      <span className="journal-calendar-day-dot" title={t('journal.doneCount', { done: doneCount, total: totalCount })}>
                        {totalCount === doneCount && totalCount > 0
                          ? <FaCheck className="journal-dot-done" />
                          : <FaCircle className="journal-dot-pending" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Streak */}
          <div className="journal-streak-card">
            <span className="journal-streak-flame"><FaFire /></span>
            <div className="journal-streak-title">{t('journal.dayDisciplineStreak', { streak })}</div>
            <div className="journal-streak-longest">{t('journal.longestStreak')}: <span className="journal-streak-longest-value">{t('journal.daysCount', { count: streak })}</span></div>
            <div className="journal-streak-consistency">{t('journal.consistencyScore')}: {Math.min(100, Math.round((streak / 21) * 100))}%</div>
          </div>

          {/* Circles */}
          <div className="journal-stats-circles">
            {[{ pct: dayPct, label: t('journal.today') }, { pct: weekPct, label: t('journal.thisWeek') }, { pct: monthPct, label: t('journal.thisMonth') }]
              .map(({ pct, label: lbl }) => (
                <div key={lbl} className="journal-stat-circle">
                  <div className="journal-stat-circle-ring" style={{ '--pct': pct ?? 0 }}>
                    <span className="journal-stat-circle-value">{pct != null ? `${pct}%` : '—'}</span>
                  </div>
                  <span className="journal-stat-circle-label">{lbl}</span>
                </div>
              ))}
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <main className="journal-main">
              
          {error && <div className="journal-error" role="alert">{error}</div>}

          {/* Header */}
          <div className="journal-main-header">
            <h1 className="journal-main-title">{label}</h1>
            <div className="journal-main-meta">
              {dayTotal > 0 ? (
                <span className="journal-main-percent">
                  {dayDone}/{dayTotal} tasks
                  {dayPct != null && (<>{': '}{dayPct >= 100
                    ? <strong className="journal-percent-done">{dayPct}% complete</strong>
                    : <strong>{dayPct}%</strong>}{' '}done</>)}
                </span>
              ) : <span>{t('journal.noTasksYet')}</span>}
            </div>
          </div>

          {/* Progress cards */}
          <div className="journal-progress-cards">
            {[
              { label: isSameDay(selectedDate, journalToday) ? t('journal.today') : t('journal.selectedDay'), pct: dayPct },
              { label: t('journal.thisWeek'),  pct: weekPct  },
              { label: t('journal.thisMonth'), pct: monthPct },
            ].map(({ label: lbl, pct }) => (
              <div key={lbl} className="journal-progress-card">
                <span className="journal-progress-card-label">{lbl}</span>
                <span className="journal-progress-card-value">{pct != null ? `${pct}%` : '—'}</span>
                <div className="journal-progress-bar">
                  <div className="journal-progress-fill" style={{ width: `${pct ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Discipline score */}
          <div className="journal-discipline-score">
            <span className="journal-discipline-label">{t('journal.disciplineScore')}: {disciplineScore}%</span>
            <div className="journal-progress-bar">
              <div className="journal-progress-fill" style={{ width: `${disciplineScore}%` }} />
            </div>
          </div>

          {/* XP info */}
          <div className="journal-xp-info">
            <strong>{t('journal.earnXp')}:</strong> {t('journal.earnXpBody')}
          </div>

          {/* Section tabs */}
          <nav className="journal-tabs" role="tablist" aria-label={t('journal.sections')}>
            <button
              type="button"
              role="tab"
              id="journal-tab-mandatory"
              aria-selected={journalTab === 'mandatory'}
              aria-controls="journal-panel-mandatory"
              className={`journal-tab${journalTab === 'mandatory' ? ' journal-tab--active' : ''}`}
              onClick={() => setJournalTab('mandatory')}
            >
              <span className="journal-tab-label">{t('journal.mandatoryTasks')}</span>
              {mandatoryTabCount > 0 && (
                <span className="journal-tab-badge">{mandatoryTabCount}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              id="journal-tab-personal"
              aria-selected={journalTab === 'personal'}
              aria-controls="journal-panel-personal"
              className={`journal-tab${journalTab === 'personal' ? ' journal-tab--active' : ''}`}
              onClick={() => setJournalTab('personal')}
            >
              <span className="journal-tab-label">{t('journal.personalTasks')}</span>
              {personalTabCount > 0 && (
                <span className="journal-tab-badge">{personalTabCount}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              id="journal-tab-reflection"
              aria-selected={journalTab === 'reflection'}
              aria-controls="journal-panel-reflection"
              className={`journal-tab${journalTab === 'reflection' ? ' journal-tab--active' : ''}`}
              onClick={() => setJournalTab('reflection')}
            >
              <span className="journal-tab-label">{t('journal.reflection')}</span>
              {reflectionTabCount > 0 && (
                <span className="journal-tab-badge journal-tab-badge--soft">{reflectionTabCount}</span>
              )}
            </button>
          </nav>

          {/* ── Tab: Mandatory (tier / platform tasks) ── */}
          <div
            id="journal-panel-mandatory"
            role="tabpanel"
            aria-labelledby="journal-tab-mandatory"
            hidden={journalTab !== 'mandatory'}
            className="journal-tab-panel"
          >
            <p className="journal-tab-lede">{t('journal.mandatoryLede')}</p>
            {loading ? (
              <div className="journal-loading">{t('common.loading')}…</div>
            ) : isMandatoryRestDay ? (
              <div className="journal-tab-empty journal-glass-card">
                <span className="journal-tab-empty-title">{t('journal.restDay')}</span>
                <p>{t('journal.restDayHint')}</p>
              </div>
            ) : mandatoryTabCount === 0 ? (
              <div className="journal-tab-empty journal-glass-card">
                <span className="journal-tab-empty-title">{t('journal.nothingScheduled')}</span>
                <p>{t('journal.nothingScheduledHint')}</p>
              </div>
            ) : (
              <ul className="journal-task-list journal-task-list-mandatory">
                {dayMandatoryTasks.map(renderTaskCard)}
              </ul>
            )}
          </div>

          {/* ── Tab: Personal ── */}
          <div
            id="journal-panel-personal"
            role="tabpanel"
            aria-labelledby="journal-tab-personal"
            hidden={journalTab !== 'personal'}
            className="journal-tab-panel"
          >
            <p className="journal-tab-lede">{t('journal.personalLede', { label })}</p>
            <form className="journal-add-form" onSubmit={handleAddTask}>
              <input
                type="text"
                className="journal-add-input"
                placeholder={t('journal.addPersonalTask')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={adding || !canEditJournal}
              />
              <button type="submit" className="journal-add-btn" disabled={adding || !newTaskTitle.trim() || !canEditJournal}>
                <FaPlus /> {t('common.add')}
              </button>
            </form>
            {loading ? (
              <div className="journal-loading">{t('common.loading')}…</div>
            ) : (
              <ul className="journal-task-list">
                {dayRegularTasks.length === 0 ? (
                  <li className="journal-task-empty">{t('journal.noPersonalTasksYet')}</li>
                ) : (
                  dayRegularTasks.map(renderTaskCard)
                )}
              </ul>
            )}
          </div>

          {/* ── Tab: Reflection (diary, mood, quick notes) ── */}
          <div
            id="journal-panel-reflection"
            role="tabpanel"
            aria-labelledby="journal-tab-reflection"
            hidden={journalTab !== 'reflection'}
            className="journal-tab-panel"
          >
            <p className="journal-tab-lede">{t('journal.reflectionLede')}</p>
            {replayReturnHref ? (
              <div className="journal-replay-handoff">
                <span className="journal-replay-chip">{t('journal.fromTraderReplay')}</span>
                <Link to={replayReturnHref} className="journal-replay-back">
                  {t('journal.backToReplay')}
                </Link>
              </div>
            ) : null}

            <section className="journal-glass-card journal-diary-section">
              <h3 className="journal-subsection-title">{t('journal.dailyDiary')}</h3>
              <p className="journal-diary-hint">
                {t('journal.dailyDiaryHint')}
              </p>
              <textarea
                className="journal-diary-textarea"
                value={dailyNotes}
                onChange={(e) => setDailyNotes(e.target.value)}
                readOnly={!canEditJournal}
                placeholder={
                  !canEditJournal
                    ? t('journal.dayReadOnly')
                    : userAdmin
                      ? t('journal.writeFreelyAdmin')
                      : t('journal.writeFreelyAuto')
                }
                maxLength={8000}
                rows={10}
                spellCheck
              />
              <div className="journal-diary-actions">
                {!userAdmin && canEditJournal && (
                  <span className="journal-diary-autosave-status" aria-live="polite">
                    {diarySaveStatus === 'saving' && t('journal.saving')}
                    {diarySaveStatus === 'saved' && t('journal.saved')}
                    {diarySaveStatus === 'error' && t('journal.couldNotSave')}
                  </span>
                )}
                {userAdmin && canEditJournal && (
                  <button
                    type="button"
                    className="journal-diary-save-btn"
                    disabled={dailySaving}
                    onClick={() => saveDailyNote()}
                  >
                    {dailySaving ? t('journal.saving') : t('journal.saveDiary')}
                  </button>
                )}
              </div>
            </section>

            <section className="journal-glass-card journal-day-images-section">
              <h3 className="journal-subsection-title">
                <FaCamera className="journal-reflection-icon" aria-hidden /> {t('journal.dayScreenshots')}
              </h3>
              <p className="journal-diary-hint">
                {t('journal.dayScreenshotsHintPrefix')}{' '}
                {JOURNAL_DAY_IMAGES_MAX}).
              </p>
              {renderDayImagesStrip()}
              {canEditJournal && dayImages.length === 0 && (
                <button type="button" className="journal-task-proof-btn" onClick={handleDayImagesClick}>
                  <FaCamera /> {t('journal.addScreenshot')}
                </button>
              )}
              <input
                ref={dayImagesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="journal-proof-input-hidden"
                onChange={handleDayImagesFilesChange}
              />
            </section>

            <section className="journal-glass-card journal-mood-section">
              <h3 className="journal-subsection-title">{t('journal.moodToday')}</h3>
              <p className="journal-diary-hint">
                {canEditJournal
                  ? t('journal.tapMoodSaveAuto')
                  : t('journal.moodReadOnlyPastDays')}
              </p>
              <div className="journal-mood-row">
                <div className="journal-mood-options">
                  {MOOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!canEditJournal}
                      className={`journal-mood-btn${dailyMood === opt.value ? ' journal-mood-btn--active' : ''}`}
                      onClick={() => {
                        if (!canEditJournal) return;
                        const m = dailyMood === opt.value ? null : opt.value;
                        setDailyMood(m);
                        saveDailyNote({ mood: m });
                      }}
                      title={t(opt.labelKey)}
                    >
                      {opt.emoji}
                    </button>
                  ))}
                </div>
              </div>
              {canEditJournal && diarySaveStatus === 'saved' && journalTab === 'reflection' && (
                <span className="journal-mood-saved">{t('journal.saved')}</span>
              )}
            </section>

            <section className="journal-notes-section journal-reflection-section">
              <h3 className="journal-subsection-title">
                <FaBolt className="journal-reflection-icon" aria-hidden /> {t('journal.quickNotes')}
              </h3>
              <p className="journal-reflection-prompt">{t('journal.quickNotesPrompt')}</p>
              <p className="journal-notes-hint">{t('journal.quickNotesHint')}</p>

              {dailyNotesList.length > 0 && (
                <ul className="journal-notes-list">
                  {dailyNotesList.map((note) => (
                    <li key={note.id} className="journal-note-item">
                      {editingNoteId === note.id ? (
                        <>
                          <textarea
                            className="journal-note-edit-input"
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleNoteEditSave(note.id);
                              if (e.key === 'Escape') handleNoteEditCancel();
                            }}
                          />
                          <div className="journal-note-actions">
                            <button
                              type="button"
                              className="journal-note-save-btn"
                              onClick={() => handleNoteEditSave(note.id)}
                              disabled={!editingNoteText.trim()}
                              title={t('journal.saveCtrlEnter')}
                            >
                              <FaSave /> {t('common.save')}
                            </button>
                            <button
                              type="button"
                              className="journal-note-action-btn journal-note-delete"
                              onClick={handleNoteEditCancel}
                              title={t('common.cancel')}
                            >
                              <FaTimes />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="journal-note-content">{note.content}</span>
                          {canEditJournal && (
                            <div className="journal-note-actions">
                              <button
                                type="button"
                                className="journal-note-action-btn journal-note-edit-btn"
                                onClick={() => handleNoteEditStart(note)}
                                title={t('journal.editNote')}
                                aria-label={t('journal.editNote')}
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                className="journal-note-action-btn journal-note-delete"
                                onClick={() => handleDeleteNote(note.id)}
                                title={t('journal.deleteNote')}
                                aria-label={t('journal.deleteNote')}
                              >
                                <FaTrash />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form className="journal-add-note-form" onSubmit={handleAddNote}>
                <input
                  type="text"
                  className="journal-add-note-input"
                  placeholder={t('journal.addQuickNote')}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  disabled={addingNote || !canEditJournal}
                />
                <button
                  type="submit"
                  className="journal-add-note-btn journal-add-note-btn-gold"
                  disabled={addingNote || !newNoteContent.trim() || !canEditJournal}
                >
                  <FaPlus /> {t('journal.addNote')}
                </button>
              </form>
            </section>
          </div>

          {(journalTab === 'mandatory' || journalTab === 'personal') &&
            dayPct >= 100 &&
            dayTotal > 0 &&
            !completionBannerDismissed && (
              <div className="journal-completion-banner">
                {t('journal.allTasksCompleted')}
                <button
                  type="button"
                  className="journal-completion-dismiss"
                  onClick={() => setCompletionBannerDismissed(true)}
                >
                  ✕
                </button>
              </div>
            )}

          {/* Hidden multi-file proof input */}
          <input type="file" ref={proofInputRef} accept="image/*" multiple
            className="journal-proof-input-hidden" onChange={handleProofFilesChange} />
        </main>
      </div>

      {/* Global photo lightbox */}
      {lightbox && (
        <PhotoLightbox photos={lightbox.photos} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}