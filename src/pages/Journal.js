import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
import '../styles/Journal.css';
import {
  FaPlus, FaTrash, FaCheck, FaCircle, FaEdit, FaSave,
  FaCamera, FaFire, FaBolt, FaTimes, FaChevronLeft, FaChevronRight,
} from 'react-icons/fa';

const MOOD_OPTIONS = [
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'good',  label: 'Good',  emoji: '🙂' },
  { value: 'ok',    label: 'Okay',  emoji: '😐' },
  { value: 'low',   label: 'Low',   emoji: '😔' },
  { value: 'rough', label: 'Rough', emoji: '😤' },
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

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ══════════════════════════════════════════════════════════════
   PHOTO LIGHTBOX
   ══════════════════════════════════════════════════════════════ */
function PhotoLightbox({ photos, startIndex = 0, onClose }) {
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
      <button className="journal-lightbox-close" onClick={close} title="Close (Esc)" type="button">
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
        <img src={photos[current]} alt={`Proof ${current + 1}`} draggable={false} />
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
              <img src={src} alt={`thumb ${i + 1}`} draggable={false} />
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
  const { user: authUser } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate]   = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [monthTasks, setMonthTasks]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [newTaskTitle, setNewTaskTitle]   = useState('');
  const [adding, setAdding]               = useState(false);
  const [dailyNotes, setDailyNotes]       = useState('');
  const [dailyMood, setDailyMood]         = useState(null);
  const [dailySaving, setDailySaving]     = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitle, setEditTitle]         = useState('');
  const [dailyNotesList, setDailyNotesList]   = useState([]);
  const [newNoteContent, setNewNoteContent]   = useState('');
  const [addingNote, setAddingNote]           = useState(false);
  const [completionBannerDismissed, setCompletionBannerDismissed] = useState(false);
  const [journalTab, setJournalTab] = useState('mandatory');

  // Multi-photo proof: { [taskId]: string[] }
  const [proofPhotos, setProofPhotos]     = useState({});
  const proofInputRef                     = useRef(null);
  const pendingProofTaskId                = useRef(null);

  // Lightbox
  const [lightbox, setLightbox] = useState(null);

  // Note editing
  const [editingNoteId, setEditingNoteId]     = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  useEffect(() => { setCompletionBannerDismissed(false); }, [selectedDate]);

  const monthStart  = getMonthStart(calendarMonth + '-01');
  const monthEnd    = getMonthEnd(calendarMonth + '-01');
  const weekStart   = getWeekStart(selectedDate);
  const weekEnd     = getWeekEnd(selectedDate);
  const fetchFrom   = weekStart < monthStart ? weekStart : monthStart;
  const fetchTo     = weekEnd   > monthEnd   ? weekEnd   : monthEnd;

  /* ── Data fetch ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
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
      setDailyNotes(dailyRes.data?.note?.notes ?? '');
      setDailyMood(dailyRes.data?.note?.mood ?? null);
      setDailyNotesList(Array.isArray(notesRes.data?.notes) ? notesRes.data.notes : []);
    }).catch((err) => {
      if (!cancelled) {
        setError(err.response?.data?.message || 'Failed to load tasks.');
        setMonthTasks([]);
        setLoading(false);
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

  /* ── Save daily note ─────────────────────────────────── */
  const saveDailyNote = useCallback(async (overrides = {}) => {
    setDailySaving(true);
    setSavedFeedback(false);
    try {
      const res = await Api.updateJournalDaily({
        date:  selectedDate,
        notes: overrides.notes !== undefined ? overrides.notes : dailyNotes,
        mood:  overrides.mood  !== undefined ? overrides.mood  : dailyMood,
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1800);
      if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for saving notes!`, { icon: '⭐' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save notes.');
    } finally {
      setDailySaving(false);
    }
  }, [selectedDate, dailyNotes, dailyMood]);

  /* ── Derived task lists ──────────────────────────────── */
  const dayTasks           = monthTasks.filter((t) => isSameDay(t.date, selectedDate));
  const dayMandatoryTasks  = dayTasks.filter((t) => t.isMandatory);
  const dayRegularTasks    = dayTasks.filter((t) => !t.isMandatory);
  const mandatoryTabCount  = dayMandatoryTasks.length;
  const personalTabCount   = dayRegularTasks.length;
  const reflectionTabCount =
    dailyNotesList.length + (dailyNotes.trim() ? 1 : 0) + (dailyMood ? 1 : 0);
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
    if (selectedDate.slice(0, 7) !== nm) setSelectedDate(nm + '-01');
  };
  const handleNextMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const nm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    setCalendarMonth(nm);
    if (selectedDate.slice(0, 7) !== nm) setSelectedDate(nm + '-01');
  };

  /* ── Task CRUD ───────────────────────────────────────── */
  const handleAddTask = async (e) => {
    e.preventDefault();
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
      setError(err.response?.data?.message || 'Failed to add task.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task) => {
    try {
      const res = await Api.updateJournalTask(task.id, { completed: !task.completed });
      const updated = res.data?.task;
      if (updated) {
        setMonthTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for completing with proof!`, { icon: '⭐' });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update task.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await Api.deleteJournalTask(id);
      setMonthTasks((prev) => prev.filter((t) => t.id !== id));
      setProofPhotos((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete task.');
    }
  };

  const handleEditStart  = (task) => { setEditingTaskId(task.id); setEditTitle(task.title); };
  const handleEditCancel = ()     => { setEditingTaskId(null); setEditTitle(''); };
  const handleEditSave   = async () => {
    if (!editingTaskId || !editTitle.trim()) { setEditingTaskId(null); return; }
    try {
      const res = await Api.updateJournalTask(editingTaskId, { title: editTitle.trim() });
      const updated = res.data?.task;
      if (updated) setMonthTasks((prev) => prev.map((t) => (t.id === editingTaskId ? updated : t)));
      setEditingTaskId(null);
      setEditTitle('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update task.');
    }
  };

  /* ── Multi-photo proof ───────────────────────────────── */
  const handleProofClick = (taskId) => {
    pendingProofTaskId.current = taskId;
    proofInputRef.current?.click();
  };

  const handleProofFilesChange = (e) => {
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
          .catch(() => setError('Failed to attach proof.'));
        return { ...prev, [taskId]: merged };
      });
    });
  };

  const handleRemoveProofPhoto = (taskId, idx) => {
    setProofPhotos((prev) => {
      const updated = (prev[taskId] || []).filter((_, i) => i !== idx);
      Api.updateJournalTask(taskId, { proofImages: updated, proofImage: updated[0] || null }).catch(() => {});
      return { ...prev, [taskId]: updated };
    });
  };

  /* ── Notes CRUD ──────────────────────────────────────── */
  const handleAddNote = async (e) => {
    e.preventDefault();
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
      setError(err.response?.data?.message || 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      await Api.deleteJournalNote(id);
      setDailyNotesList((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete note.');
    }
  };

  const handleNoteEditStart  = (note) => { setEditingNoteId(note.id); setEditingNoteText(note.content); };
  const handleNoteEditCancel = ()      => { setEditingNoteId(null); setEditingNoteText(''); };
  const handleNoteEditSave   = async (noteId) => {
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
      ? JSON.parse(localStorage.getItem('user') || '{}').login_streak
      : 0)
    ?? 0;

  const disciplineScore = dayPct != null && weekPct != null && monthPct != null
    ? Math.min(100, Math.round((dayPct + weekPct + monthPct) / 3))
    : (dayPct ?? 0);

  const label = isSameDay(selectedDate, today)
    ? 'Today'
    : (() => { const d = new Date(selectedDate + 'T12:00:00'); return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })();

  const isMandatoryRestDay = isJournalSaturdayUTC(selectedDate);

  /* ── Proof strip renderer ────────────────────────────── */
  const renderProofStrip = (taskId) => {
    const photos = proofPhotos[taskId] || [];
    if (!photos.length) return null;
    return (
      <div className="journal-proof-strip">
        {photos.map((src, i) => (
          <div key={i} className="journal-proof-thumb"
            onClick={() => setLightbox({ photos, index: i })} title="Tap to view">
            <img src={src} alt={`Proof ${i + 1}`} loading="lazy" />
            <button type="button" className="journal-proof-thumb-remove"
              onClick={(e) => { e.stopPropagation(); handleRemoveProofPhoto(taskId, i); }} title="Remove">✕</button>
          </div>
        ))}
        <button type="button" className="journal-proof-add-more"
          onClick={() => handleProofClick(taskId)} title="Add more photos">+</button>
      </div>
    );
  };

  const renderProofBtn = (taskId) => {
    const count = (proofPhotos[taskId] || []).length;
    return (
      <button type="button" className="journal-task-proof-btn"
        onClick={() => handleProofClick(taskId)} title="Add picture proof (+25 XP)">
        <FaCamera />
        {count === 0 ? ' Proof' : ' More'}
        {count > 0 && <span className="journal-proof-count-badge">{count}</span>}
      </button>
    );
  };

  /* ── Task card renderer ──────────────────────────────── */
  const renderTaskCard = (task) => {
    const isEditing = editingTaskId === task.id;
    const isDone    = task.completed;
    const isMand    = task.isMandatory;

    return (
      <li
        key={task.id}
        className={[
          'journal-task-item',
          isDone ? 'journal-task-item--done' : '',
          isMand ? 'journal-task-item--mandatory' : '',
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
                <FaSave /> Save
              </button>
              <button type="button" className="journal-task-edit-btn journal-task-edit-btn--cancel" onClick={handleEditCancel}>
                Cancel
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
                aria-label={isDone ? 'Mark not done' : 'Mark done'}
              >
                {isDone ? <FaCheck /> : <span className="journal-task-check-empty" />}
              </button>
              {isDone && <span className="journal-task-xp">+5 XP</span>}
            </div>

            {/* ── Card body: title + optional description ── */}
            <div className="journal-task-card-body">
              <span
                className="journal-task-title"
                onClick={() => !isMand && handleEditStart(task)}
                title={isMand ? task.title : 'Click to edit'}
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
                {!isMand && (
                  <button type="button" className="journal-task-edit-icon"
                    onClick={(e) => { e.stopPropagation(); handleEditStart(task); }}
                    aria-label="Edit task">
                    <FaEdit />
                  </button>
                )}
                {!isMand && (
                  <button type="button" className="journal-task-delete"
                    onClick={() => handleDelete(task.id)}
                    aria-label="Delete task">
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
      <div className="journal-layout">

        {/* ══════════ SIDEBAR ══════════ */}
        <aside className="journal-sidebar">
          <header className="journal-sidebar-header">
            <h2 className="journal-sidebar-title">Aura Journal</h2>
            <p className="journal-sidebar-sub">Mandatory · Personal · Reflection</p>
          </header>

          {/* Calendar */}
          <div className="journal-calendar">
            <div className="journal-calendar-nav">
              <button type="button" className="journal-calendar-btn" onClick={handlePrevMonth} aria-label="Previous month">‹</button>
              <span className="journal-calendar-month">
                {MONTH_NAMES[parseInt(calendarMonth.split('-')[1], 10) - 1]}&nbsp;{calendarMonth.split('-')[0]}
              </span>
              <button type="button" className="journal-calendar-btn" onClick={handleNextMonth} aria-label="Next month">›</button>
            </div>
            <div className="journal-calendar-weekdays">
              {DAY_NAMES.map((d) => <span key={d} className="journal-calendar-wd">{d}</span>)}
            </div>
            <div className="journal-calendar-grid">
              {calendarDays.map((dateStr, i) => {
                if (!dateStr) return <div key={`e-${i}`} className="journal-calendar-day journal-calendar-day--empty" />;
                const hasTasks   = taskCountByDate[dateStr];
                const doneCount  = completedCountByDate[dateStr] || 0;
                const totalCount = taskCountByDate[dateStr]      || 0;
                const isSelected = isSameDay(dateStr, selectedDate);
                const isToday    = isSameDay(dateStr, today);
                return (
                  <button key={dateStr} type="button"
                    className={`journal-calendar-day${isSelected ? ' journal-calendar-day--selected' : ''}${isToday ? ' journal-calendar-day--today' : ''}`}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <span className="journal-calendar-day-num">{parseInt(dateStr.slice(-2), 10)}</span>
                    {hasTasks && (
                      <span className="journal-calendar-day-dot" title={`${doneCount}/${totalCount} done`}>
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
            <div className="journal-streak-title">{streak} Day Discipline Streak</div>
            <div className="journal-streak-longest">Longest Streak: <span className="journal-streak-longest-value">{streak} Days</span></div>
            <div className="journal-streak-consistency">Consistency Score: {Math.min(100, Math.round((streak / 21) * 100))}%</div>
          </div>

          {/* Circles */}
          <div className="journal-stats-circles">
            {[{ pct: dayPct, label: 'Today' }, { pct: weekPct, label: 'This Week' }, { pct: monthPct, label: 'This Month' }]
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
              ) : <span>No tasks yet</span>}
            </div>
          </div>

          {/* Progress cards */}
          <div className="journal-progress-cards">
            {[
              { label: isSameDay(selectedDate, today) ? 'Today' : 'Selected day', pct: dayPct },
              { label: 'This week',  pct: weekPct  },
              { label: 'This month', pct: monthPct },
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
            <span className="journal-discipline-label">Discipline Score: {disciplineScore}%</span>
            <div className="journal-progress-bar">
              <div className="journal-progress-fill" style={{ width: `${disciplineScore}%` }} />
            </div>
          </div>

          {/* XP info */}
          <div className="journal-xp-info">
            <strong>Earn XP:</strong> Add personal tasks (+5), save diary or notes (+5), complete tasks with picture proof (+25).
            Day / week / month completion XP (min 5 tasks) when you open the journal.
          </div>

          {/* Section tabs */}
          <nav className="journal-tabs" role="tablist" aria-label="Journal sections">
            <button
              type="button"
              role="tab"
              id="journal-tab-mandatory"
              aria-selected={journalTab === 'mandatory'}
              aria-controls="journal-panel-mandatory"
              className={`journal-tab${journalTab === 'mandatory' ? ' journal-tab--active' : ''}`}
              onClick={() => setJournalTab('mandatory')}
            >
              <span className="journal-tab-label">Mandatory Tasks</span>
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
              <span className="journal-tab-label">Personal Tasks</span>
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
              <span className="journal-tab-label">Reflection</span>
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
            <p className="journal-tab-lede">
              Set by Aura for your plan. They count toward your daily completion — same rules as your personal list (Saturday is a rest day).
            </p>
            {loading ? (
              <div className="journal-loading">Loading…</div>
            ) : isMandatoryRestDay ? (
              <div className="journal-tab-empty journal-glass-card">
                <span className="journal-tab-empty-title">Rest day</span>
                <p>No mandatory tasks on Saturday. Use Personal Tasks or Reflection if you still want to log something.</p>
              </div>
            ) : mandatoryTabCount === 0 ? (
              <div className="journal-tab-empty journal-glass-card">
                <span className="journal-tab-empty-title">Nothing scheduled</span>
                <p>Mandatory tasks for your tier will show here for this date. Try another day or check back after refresh.</p>
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
            <p className="journal-tab-lede">
              Your own tasks for {label}. Add anything you want to track — edit or delete anytime.
            </p>
            <form className="journal-add-form" onSubmit={handleAddTask}>
              <input
                type="text"
                className="journal-add-input"
                placeholder="Add a personal task…"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={adding}
              />
              <button type="submit" className="journal-add-btn" disabled={adding || !newTaskTitle.trim()}>
                <FaPlus /> Add
              </button>
            </form>
            {loading ? (
              <div className="journal-loading">Loading…</div>
            ) : (
              <ul className="journal-task-list">
                {dayRegularTasks.length === 0 ? (
                  <li className="journal-task-empty">No personal tasks yet — add one above.</li>
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
            <p className="journal-tab-lede">
              Everything here is saved per day, just for you — diary entry, mood, and short reflection notes.
            </p>

            <section className="journal-glass-card journal-diary-section">
              <h3 className="journal-subsection-title">Daily diary</h3>
              <p className="journal-diary-hint">
                Long-form space for the day: wins, frustrations, lessons, or a full journal entry. Saved for this date only.
              </p>
              <textarea
                className="journal-diary-textarea"
                value={dailyNotes}
                onChange={(e) => setDailyNotes(e.target.value)}
                placeholder="Write freely… (saved when you click Save diary)"
                maxLength={8000}
                rows={10}
                spellCheck
              />
              <div className="journal-diary-actions">
                <button
                  type="button"
                  className="journal-diary-save-btn"
                  disabled={dailySaving}
                  onClick={() => saveDailyNote()}
                >
                  {dailySaving ? 'Saving…' : 'Save diary'}
                </button>
                {savedFeedback && journalTab === 'reflection' && (
                  <span className="journal-diary-saved">Saved ✓</span>
                )}
              </div>
            </section>

            <section className="journal-glass-card journal-mood-section">
              <h3 className="journal-subsection-title">Mood today</h3>
              <p className="journal-diary-hint">Tap to set how you felt — saves automatically.</p>
              <div className="journal-mood-row">
                <div className="journal-mood-options">
                  {MOOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`journal-mood-btn${dailyMood === opt.value ? ' journal-mood-btn--active' : ''}`}
                      onClick={() => {
                        const m = dailyMood === opt.value ? null : opt.value;
                        setDailyMood(m);
                        saveDailyNote({ mood: m });
                      }}
                      title={opt.label}
                    >
                      {opt.emoji}
                    </button>
                  ))}
                </div>
              </div>
              {savedFeedback && <span className="journal-mood-saved">Saved ✓</span>}
            </section>

            <section className="journal-notes-section journal-reflection-section">
              <h3 className="journal-subsection-title">
                <FaBolt className="journal-reflection-icon" aria-hidden /> Quick notes
              </h3>
              <p className="journal-reflection-prompt">Short bullets or reminders alongside your diary.</p>
              <p className="journal-notes-hint">Add as many as you like. Edit or delete with the icons.</p>

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
                              title="Save (Ctrl+Enter)"
                            >
                              <FaSave /> Save
                            </button>
                            <button
                              type="button"
                              className="journal-note-action-btn journal-note-delete"
                              onClick={handleNoteEditCancel}
                              title="Cancel"
                            >
                              <FaTimes />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="journal-note-content">{note.content}</span>
                          <div className="journal-note-actions">
                            <button
                              type="button"
                              className="journal-note-action-btn journal-note-edit-btn"
                              onClick={() => handleNoteEditStart(note)}
                              title="Edit note"
                              aria-label="Edit note"
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className="journal-note-action-btn journal-note-delete"
                              onClick={() => handleDeleteNote(note.id)}
                              title="Delete note"
                              aria-label="Delete note"
                            >
                              <FaTrash />
                            </button>
                          </div>
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
                  placeholder="Add a quick note…"
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  disabled={addingNote}
                />
                <button
                  type="submit"
                  className="journal-add-note-btn journal-add-note-btn-gold"
                  disabled={addingNote || !newNoteContent.trim()}
                >
                  <FaPlus /> Add note
                </button>
              </form>
            </section>
          </div>

          {(journalTab === 'mandatory' || journalTab === 'personal') &&
            dayPct >= 100 &&
            dayTotal > 0 &&
            !completionBannerDismissed && (
              <div className="journal-completion-banner">
                ✦ All tasks completed for this day — outstanding work.
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