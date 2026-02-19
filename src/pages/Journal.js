import React, { useState, useEffect, useCallback } from 'react';
import Api from '../services/Api';
import '../styles/Journal.css';
import { FaPlus, FaTrash, FaCheck, FaCircle } from 'react-icons/fa';

function getMonthStart(d) {
  const x = new Date(d);
  x.setDate(1);
  return x.toISOString().slice(0, 10);
}

function getMonthEnd(d) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1);
  x.setDate(0);
  return x.toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const [monthTasks, setMonthTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const monthStart = getMonthStart(calendarMonth + '-01');
  const monthEnd = getMonthEnd(calendarMonth + '-01');
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = getWeekEnd(selectedDate);
  const fetchFrom = weekStart < monthStart ? weekStart : monthStart;
  const fetchTo = weekEnd > monthEnd ? weekEnd : monthEnd;

  const fetchMonthTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Api.getJournalTasks({ dateFrom: fetchFrom, dateTo: fetchTo });
      const list = res.data?.tasks ?? [];
      setMonthTasks(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Journal fetch error:', err);
      setError(err.response?.data?.message || 'Failed to load tasks.');
      setMonthTasks([]);
    } finally {
      setLoading(false);
    }
  }, [fetchFrom, fetchTo]);

  useEffect(() => {
    fetchMonthTasks();
  }, [fetchMonthTasks]);

  const dayTasks = monthTasks.filter((t) => isSameDay(t.date, selectedDate));
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
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update task.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await Api.deleteJournalTask(id);
      setMonthTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete task.');
    }
  };

  const calendarDays = (() => {
    const year = parseInt(calendarMonth.split('-')[0], 10);
    const month = parseInt(calendarMonth.split('-')[1], 10) - 1;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(year, month, d).toISOString().slice(0, 10));
    }
    return days;
  })();

  const taskCountByDate = monthTasks.reduce((acc, t) => {
    const d = String(t.date).slice(0, 10);
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  const completedCountByDate = monthTasks.reduce((acc, t) => {
    if (!t.completed) return acc;
    const d = String(t.date).slice(0, 10);
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});

  const label = isSameDay(selectedDate, today)
    ? 'Today'
    : (() => {
        const d = new Date(selectedDate + 'T12:00:00');
        return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })();

  return (
    <div className="journal-page">
      <div className="journal-layout">
        <aside className="journal-sidebar">
          <header className="journal-sidebar-header">
            <h2 className="journal-sidebar-title">Journal</h2>
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
                    <span className="journal-calendar-day-num">{new Date(dateStr).getDate()}</span>
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

          <div className="journal-stats-sidebar">
            <div className="journal-stat-mini">
              <span className="journal-stat-mini-label">Day</span>
              <span className="journal-stat-mini-value">{dayPct != null ? `${dayPct}%` : '—'}</span>
            </div>
            <div className="journal-stat-mini">
              <span className="journal-stat-mini-label">Week</span>
              <span className="journal-stat-mini-value">{weekPct != null ? `${weekPct}%` : '—'}</span>
            </div>
            <div className="journal-stat-mini">
              <span className="journal-stat-mini-label">Month</span>
              <span className="journal-stat-mini-value">{monthPct != null ? `${monthPct}%` : '—'}</span>
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
                  {dayDone}/{dayTotal} tasks · <strong>{dayPct}%</strong> done
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
              {dayTasks.length === 0 ? (
                <li className="journal-task-empty">No tasks for this day. Add one above.</li>
              ) : (
                dayTasks.map((task) => (
                  <li key={task.id} className={`journal-task-item ${task.completed ? 'journal-task-item--done' : ''}`}>
                    <button
                      type="button"
                      className="journal-task-check"
                      onClick={() => handleToggle(task)}
                      aria-label={task.completed ? 'Mark not done' : 'Mark done'}
                    >
                      {task.completed ? <FaCheck /> : <span className="journal-task-check-empty" />}
                    </button>
                    <span className="journal-task-title">{task.title}</span>
                    <button
                      type="button"
                      className="journal-task-delete"
                      onClick={() => handleDelete(task.id)}
                      aria-label="Delete task"
                    >
                      <FaTrash />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
