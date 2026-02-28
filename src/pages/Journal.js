import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import Api from '../services/Api';
import { useAuth } from '../context/AuthContext';
/* Current: modern vibrant design. To use Design 1 (original): import '../styles/Journal.design1.css' */
import '../styles/Journal.css';
import { FaPlus, FaTrash, FaCheck, FaCircle, FaEdit, FaSave, FaCamera, FaFire, FaBolt } from 'react-icons/fa';

const MOOD_OPTIONS = [
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'ok', label: 'Okay', emoji: '😐' },
  { value: 'low', label: 'Low', emoji: '😔' },
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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Journal() {
  const { user: authUser } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [monthTasks, setMonthTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [dailyNotes, setDailyNotes] = useState('');
  const [dailyMood, setDailyMood] = useState(null);
  const [dailySaving, setDailySaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [proofTaskId, setProofTaskId] = useState(null);
  const [dailyNotesList, setDailyNotesList] = useState([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [completionBannerDismissed, setCompletionBannerDismissed] = useState(false);

  useEffect(() => {
    setCompletionBannerDismissed(false);
  }, [selectedDate]);

  const monthStart = getMonthStart(calendarMonth + '-01');
  const monthEnd = getMonthEnd(calendarMonth + '-01');
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = getWeekEnd(selectedDate);
  const fetchFrom = weekStart < monthStart ? weekStart : monthStart;
  const fetchTo = weekEnd > monthEnd ? weekEnd : monthEnd;

  /* Load tasks first so they appear immediately when changing month; daily/notes update in parallel */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tasksPromise = Api.getJournalTasks({ dateFrom: fetchFrom, dateTo: fetchTo });
    const dailyPromise = Api.getJournalDaily(selectedDate);
    const notesPromise = Api.getJournalNotes(selectedDate);

    tasksPromise
      .then((tasksRes) => {
        if (cancelled) return;
        setMonthTasks(Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : []);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Journal tasks fetch error:', err);
          setError(err.response?.data?.message || 'Failed to load tasks.');
          setMonthTasks([]);
          setLoading(false);
        }
      });

    dailyPromise
      .then((res) => {
        if (cancelled) return;
        setDailyNotes(res.data?.note?.notes ?? '');
        setDailyMood(res.data?.note?.mood ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setDailyNotes('');
          setDailyMood(null);
        }
      });

    notesPromise
      .then((res) => {
        if (cancelled) return;
        setDailyNotesList(Array.isArray(res.data?.notes) ? res.data.notes : []);
      })
      .catch(() => {
        if (!cancelled) setDailyNotesList([]);
      });

    return () => { cancelled = true; };
  }, [fetchFrom, fetchTo, selectedDate]);

  /* XP check after load (non-blocking, avoids extra UI glitch) */
  useEffect(() => {
    if (loading || !selectedDate) return;
    Api.getJournalXpCheck(selectedDate)
      .then((res) => {
        const awarded = res.data?.awarded || [];
        awarded.forEach(({ type, xp }) => {
          const label = type === 'day' ? 'day' : type === 'week' ? 'week' : 'month';
          toast.success(`+${xp} XP for ${label} completion!`, { icon: '⭐' });
        });
      })
      .catch(() => {});
  }, [loading, selectedDate]);

  const saveDailyNote = useCallback(async (overrides = {}) => {
    setDailySaving(true);
    setSavedFeedback(false);
    try {
      const res = await Api.updateJournalDaily({
        date: selectedDate,
        notes: overrides.notes !== undefined ? overrides.notes : dailyNotes,
        mood: overrides.mood !== undefined ? overrides.mood : dailyMood,
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

  const dayTasks = monthTasks.filter((t) => isSameDay(t.date, selectedDate));
  const dayMandatoryTasks = dayTasks.filter((t) => t.isMandatory);
  const dayRegularTasks = dayTasks.filter((t) => !t.isMandatory);
  const weekTasks = monthTasks.filter((t) => t.date >= weekStart && t.date <= weekEnd);
  const monthTasksForMonth = monthTasks.filter((t) => t.date >= monthStart && t.date <= monthEnd);

  const dayTotal = dayTasks.length;
  const dayDone = dayTasks.filter((t) => t.completed).length;
  const dayPct = dayTotal ? Math.round((dayDone / dayTotal) * 100) : null;

  const weekTotal = weekTasks.length;
  const weekDone = weekTasks.filter((t) => t.completed).length;
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : null;

  const monthTotal = monthTasksForMonth.length;
  const monthDone = monthTasksForMonth.filter((t) => t.completed).length;
  const monthPct = monthTotal ? Math.round((monthDone / monthTotal) * 100) : null;

  const handlePrevMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const newMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    setCalendarMonth(newMonth);
    if (selectedDate.slice(0, 7) !== newMonth) {
      setSelectedDate(newMonth + '-01');
    }
  };

  const handleNextMonth = () => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const newMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    setCalendarMonth(newMonth);
    if (selectedDate.slice(0, 7) !== newMonth) {
      setSelectedDate(newMonth + '-01');
    }
  };

  const handleSelectDate = (dateStr) => {
    setSelectedDate(dateStr);
  };

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

  const proofInputRef = useRef(null);
  const handleProofClick = (taskId) => {
    setProofTaskId(taskId);
    proofInputRef.current?.click();
  };
  const handleAddProof = (e) => {
    const file = e?.target?.files?.[0];
    const taskId = proofTaskId;
    setProofTaskId(null);
    e.target.value = '';
    if (!taskId || !file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      Api.updateJournalTask(taskId, { proofImage: dataUrl })
        .then((res) => {
          const updated = res.data?.task;
          if (updated) setMonthTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
          if (res.data?.xpAwarded) toast.success(`+${res.data.xpAwarded} XP for proof!`, { icon: '⭐' });
        })
        .catch(() => setError('Failed to attach proof.'));
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id) => {
    try {
      await Api.deleteJournalTask(id);
      setMonthTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete task.');
    }
  };

  const handleEditStart = (task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
  };

  const handleEditSave = async () => {
    if (!editingTaskId || !editTitle.trim()) {
      setEditingTaskId(null);
      return;
    }
    try {
      const res = await Api.updateJournalTask(editingTaskId, { title: editTitle.trim() });
      const updated = res.data?.task;
      if (updated) {
        setMonthTasks((prev) => prev.map((t) => (t.id === editingTaskId ? updated : t)));
      }
      setEditingTaskId(null);
      setEditTitle('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update task.');
    }
  };

  const handleEditCancel = () => {
    setEditingTaskId(null);
    setEditTitle('');
  };

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

  const calendarDays = useMemo(() => {
    const parts = String(calendarMonth).split('-');
    const year = Math.max(1, parseInt(parts[0], 10) || new Date().getFullYear());
    const month1Based = Math.max(1, Math.min(12, parseInt(parts[1], 10) || 1));
    const month0Based = month1Based - 1;
    const first = new Date(year, month0Based, 1);
    const last = new Date(year, month0Based + 1, 0);
    const daysInMonth = last.getDate();
    const startPad = (first.getDay() + 6) % 7;
    const yyyy = String(first.getFullYear());
    const mm = String(first.getMonth() + 1).padStart(2, '0');
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${yyyy}-${mm}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, [calendarMonth]);

  const taskCountByDate = useMemo(() => {
    return monthTasks.reduce((acc, t) => {
      const d = String(t.date).slice(0, 10);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
  }, [monthTasks]);

  const completedCountByDate = useMemo(() => {
    return monthTasks.reduce((acc, t) => {
      if (!t.completed) return acc;
      const d = String(t.date).slice(0, 10);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
  }, [monthTasks]);

  const label = isSameDay(selectedDate, today)
    ? 'Today'
    : (() => {
        const d = new Date(selectedDate + 'T12:00:00');
        return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })();

  return (
    <div className="journal-page" id="journal-top">
      <div className="journal-layout">
        <aside className="journal-sidebar">
          <header className="journal-sidebar-header">
            <h2 className="journal-sidebar-title">Aura Journal</h2>
            <p className="journal-sidebar-sub">Tasks & progress</p>
          </header>

          <div className="journal-calendar">
            <div className="journal-calendar-nav">
              <button type="button" className="journal-calendar-btn" onClick={handlePrevMonth} aria-label="Previous month">
                ‹
              </button>
              <span className="journal-calendar-month">
                {MONTH_NAMES[parseInt(calendarMonth.split('-')[1], 10) - 1]} {calendarMonth.split('-')[0]}
              </span>
              <button type="button" className="journal-calendar-btn" onClick={handleNextMonth} aria-label="Next month">
                ›
              </button>
            </div>
            <div className="journal-calendar-weekdays">
              {DAY_NAMES.map((d) => (
                <span key={d} className="journal-calendar-wd">{d}</span>
              ))}
            </div>
            <div className="journal-calendar-grid">
              {calendarDays.map((dateStr, i) => {
                if (!dateStr) {
                  return <div key={`empty-${i}`} className="journal-calendar-day journal-calendar-day--empty" />;
                }
                const hasTasks = taskCountByDate[dateStr];
                const doneCount = completedCountByDate[dateStr] || 0;
                const totalCount = taskCountByDate[dateStr] || 0;
                const isSelected = isSameDay(dateStr, selectedDate);
                const isToday = isSameDay(dateStr, today);
                return (
                  <button
                    key={dateStr}
                    type="button"
                    className={`journal-calendar-day ${isSelected ? 'journal-calendar-day--selected' : ''} ${isToday ? 'journal-calendar-day--today' : ''}`}
                    onClick={() => handleSelectDate(dateStr)}
                  >
                    <span className="journal-calendar-day-num">{parseInt(dateStr.slice(-2), 10)}</span>
                    {hasTasks && (
                      <span className="journal-calendar-day-dot" title={`${doneCount}/${totalCount} done`}>
                        {totalCount === doneCount && totalCount > 0 ? (
                          <FaCheck className="journal-dot-done" />
                        ) : (
                          <FaCircle className="journal-dot-pending" />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7 Day Discipline Streak card – matches reference image */}
          <div className="journal-streak-card">
            <div className="journal-streak-flame">
              <FaFire />
            </div>
            <div className="journal-streak-title">
              {(() => {
                const streak = authUser?.login_streak ?? (typeof localStorage !== 'undefined' ? (JSON.parse(localStorage.getItem('user') || '{}').login_streak) : 0) ?? 0;
                return `${streak} Day Discipline Streak`;
              })()}
            </div>
            <div className="journal-streak-longest">
              Longest Streak: <span className="journal-streak-longest-value">
                {(() => {
                  const streak = authUser?.login_streak ?? (typeof localStorage !== 'undefined' ? (JSON.parse(localStorage.getItem('user') || '{}').login_streak) : 0) ?? 0;
                  return `${streak} Days`;
                })()}
              </span>
            </div>
            <div className="journal-streak-consistency">
              Consistency Score: {(() => {
                const streak = authUser?.login_streak ?? (typeof localStorage !== 'undefined' ? (JSON.parse(localStorage.getItem('user') || '{}').login_streak) : 0) ?? 0;
                return Math.min(100, Math.round((streak / 21) * 100));
              })()}%
            </div>
          </div>

          <div className="journal-stats-sidebar journal-stats-circles">
            <div className="journal-stat-circle">
              <div className="journal-stat-circle-ring" style={{ '--pct': dayPct != null ? dayPct : 0 }}>
                <span className="journal-stat-circle-value">{dayPct != null ? `${dayPct}%` : '—'}</span>
              </div>
              <span className="journal-stat-circle-label">Today</span>
            </div>
            <div className="journal-stat-circle">
              <div className="journal-stat-circle-ring" style={{ '--pct': weekPct != null ? weekPct : 0 }}>
                <span className="journal-stat-circle-value">{weekPct != null ? `${weekPct}%` : '—'}</span>
              </div>
              <span className="journal-stat-circle-label">This week</span>
            </div>
            <div className="journal-stat-circle">
              <div className="journal-stat-circle-ring" style={{ '--pct': monthPct != null ? monthPct : 0 }}>
                <span className="journal-stat-circle-value">{monthPct != null ? `${monthPct}%` : '—'}</span>
              </div>
              <span className="journal-stat-circle-label">This month</span>
            </div>
          </div>
        </aside>

        <main className="journal-main">
          {error && (
            <div className="journal-error" role="alert">
              {error}
            </div>
          )}

          <div className="journal-main-header">
            <h1 className="journal-main-title">{label}</h1>
            <div className="journal-main-meta">
              {dayTotal > 0 ? (
                <span className="journal-main-percent">
                  {dayDone}/{dayTotal} tasks{dayPct != null ? (dayPct >= 100 ? (
                    <>: <strong className="journal-percent-done">{dayPct}% done</strong></>
                  ) : (
                    <>: <strong>{dayPct}%</strong> done</>
                  )) : ''}
                </span>
              ) : (
                <span className="journal-main-percent">No tasks yet</span>
              )}
            </div>
          </div>

          <div className="journal-progress-cards">
            <div className="journal-progress-card">
              <span className="journal-progress-card-label">{isSameDay(selectedDate, today) ? 'Today' : 'Selected day'}</span>
              <span className="journal-progress-card-value">{dayPct != null ? `${dayPct}%` : '—'}</span>
              <div className="journal-progress-bar">
                <div className="journal-progress-fill" style={{ width: `${dayPct ?? 0}%` }} />
              </div>
            </div>
            <div className="journal-progress-card">
              <span className="journal-progress-card-label">This week</span>
              <span className="journal-progress-card-value">{weekPct != null ? `${weekPct}%` : '—'}</span>
              <div className="journal-progress-bar">
                <div className="journal-progress-fill" style={{ width: `${weekPct ?? 0}%` }} />
              </div>
            </div>
            <div className="journal-progress-card">
              <span className="journal-progress-card-label">This month</span>
              <span className="journal-progress-card-value">{monthPct != null ? `${monthPct}%` : '—'}</span>
              <div className="journal-progress-bar">
                <div className="journal-progress-fill" style={{ width: `${monthPct ?? 0}%` }} />
              </div>
            </div>
          </div>

          {/* Discipline Score bar – matches reference */}
          <div className="journal-discipline-score">
            <span className="journal-discipline-label">Discipline Score: {dayPct != null && weekPct != null && monthPct != null ? Math.round((dayPct + weekPct + monthPct) / 3) : (dayPct ?? 0)}%</span>
            <div className="journal-progress-bar">
              <div
                className="journal-progress-fill"
                style={{ width: `${dayPct != null && weekPct != null && monthPct != null ? Math.min(100, Math.round((dayPct + weekPct + monthPct) / 3)) : (dayPct ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="journal-xp-info">
            <strong>Earn XP:</strong> Add tasks (+5), save notes (+5), complete tasks with picture proof (+25). Day/Week/Month % XP (min 5 tasks) when you view the journal.
          </div>

          {dayMandatoryTasks.length > 0 && (
            <>
              <h3 className="journal-section-title">Mandatory Tasks</h3>
              <p className="journal-mandatory-hint">Daily tasks for your subscription tier (every day except Saturday—rest day). Same percentage system—complete these and your own tasks to hit 100%.</p>
              <ul className="journal-task-list journal-task-list-mandatory">
                {dayMandatoryTasks.map((task) => (
                  <li key={task.id} className={`journal-task-item ${task.completed ? 'journal-task-item--done' : ''} journal-task-item--mandatory`}>
                    <button
                      type="button"
                      className="journal-task-check"
                      onClick={() => handleToggle(task)}
                      aria-label={task.completed ? 'Mark not done' : 'Mark done'}
                    >
                      {task.completed ? <FaCheck /> : <span className="journal-task-check-empty" />}
                    </button>
                    <div className="journal-task-mandatory-content">
                      <span className="journal-task-title">{task.title}</span>
                      {task.description && (
                        <p className="journal-task-description">{task.description}</p>
                      )}
                      {task.completed && <span className="journal-task-xp">+5 XP</span>}
                      {task.proofImage ? (
                        <span className="journal-task-proof-thumb" title="Proof attached">
                          <img src={task.proofImage} alt="Proof" loading="lazy" />
                        </span>
                      ) : null}
                      <div className="journal-task-actions">
                        <button type="button" className="journal-task-proof-btn" onClick={() => handleProofClick(task.id)} title="Add picture proof to earn +25 XP when complete">
                          <FaCamera /> Proof
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="journal-section-title">Tasks</h3>
          <form className="journal-add-form" onSubmit={handleAddTask}>
            <input
              type="text"
              className="journal-add-input"
              placeholder="Add a task..."
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
                <li className="journal-task-empty">No tasks for this day. Add one above.</li>
              ) : (
                dayRegularTasks.map((task) => (
                  <li key={task.id} className={`journal-task-item ${task.completed ? 'journal-task-item--done' : ''}`}>
                    <button
                      type="button"
                      className="journal-task-check"
                      onClick={() => handleToggle(task)}
                      aria-label={task.completed ? 'Mark not done' : 'Mark done'}
                    >
                      {task.completed ? <FaCheck /> : <span className="journal-task-check-empty" />}
                    </button>
                    {editingTaskId === task.id ? (
                      <div className="journal-task-edit-wrap">
                        <input
                          type="text"
                          className="journal-task-edit-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); if (e.key === 'Escape') handleEditCancel(); }}
                          autoFocus
                        />
                        <button type="button" className="journal-task-edit-btn" onClick={handleEditSave} aria-label="Save"><FaSave /></button>
                        <button type="button" className="journal-task-edit-btn journal-task-edit-btn--cancel" onClick={handleEditCancel} aria-label="Cancel">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <span className="journal-task-title" onClick={() => handleEditStart(task)} title="Click to edit">{task.title}</span>
                        {task.completed && <span className="journal-task-xp">+5 XP</span>}
                        {task.proofImage ? (
                          <span className="journal-task-proof-thumb" title="Proof attached">
                            <img src={task.proofImage} alt="Proof" loading="lazy" />
                          </span>
                        ) : null}
                        <div className="journal-task-actions">
                          <button type="button" className="journal-task-proof-btn" onClick={() => handleProofClick(task.id)} title="Add picture proof to earn +25 XP when complete">
                            <FaCamera /> Proof
                          </button>
                          <button type="button" className="journal-task-edit-icon" onClick={(e) => { e.stopPropagation(); handleEditStart(task); }} aria-label="Edit task"><FaEdit /></button>
                          <button type="button" className="journal-task-delete" onClick={() => handleDelete(task.id)} aria-label="Delete task"><FaTrash /></button>
                        </div>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}

          {dayPct >= 100 && dayTotal > 0 && !completionBannerDismissed && (
            <div className="journal-completion-banner">
              All tasks completed! Great job. <button type="button" className="journal-completion-dismiss" aria-label="Dismiss" onClick={() => setCompletionBannerDismissed(true)}>✕</button>
            </div>
          )}

          <section className="journal-notes-section journal-reflection-section">
            <h3 className="journal-section-title">
              <FaBolt className="journal-reflection-icon" /> Reflection
            </h3>
            <p className="journal-reflection-prompt">What did you improve today?</p>
            <p className="journal-notes-hint">Save multiple notes for this day. They appear here under your tasks.</p>
            {dailyNotesList.length > 0 && (
              <ul className="journal-notes-list">
                {dailyNotesList.map((note) => (
                  <li key={note.id} className="journal-note-item">
                    <span className="journal-note-content">{note.content}</span>
                    <button type="button" className="journal-note-delete" onClick={() => handleDeleteNote(note.id)} aria-label="Delete note">
                      <FaTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="journal-add-note-form" onSubmit={handleAddNote}>
              <input
                type="text"
                className="journal-add-note-input"
                placeholder="Add a note..."
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                disabled={addingNote}
              />
              <button type="submit" className="journal-add-note-btn journal-add-note-btn-purple" disabled={addingNote || !newNoteContent.trim()}>
                <FaPlus /> Add Note
              </button>
            </form>
          </section>

          <section className="journal-daily-section">
            <h3 className="journal-section-title">Mood</h3>
            <div className="journal-mood-row">
              <div className="journal-mood-options">
                {MOOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`journal-mood-btn ${dailyMood === opt.value ? 'journal-mood-btn--active' : ''}`}
                    onClick={() => {
                      const newMood = dailyMood === opt.value ? null : opt.value;
                      setDailyMood(newMood);
                      saveDailyNote({ mood: newMood });
                    }}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>
            {savedFeedback && <span className="journal-mood-saved">Saved!</span>}
          </section>

          <input
            type="file"
            ref={proofInputRef}
            accept="image/*"
            className="journal-proof-input-hidden"
            onChange={handleAddProof}
          />
        </main>
      </div>
    </div>
  );
}
