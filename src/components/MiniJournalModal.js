// MiniJournalModal.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';

const MiniJournalModal = React.memo(({ 
    isOpen, 
    onClose, 
    tasks = [], 
    notes = [], 
    selectedDate, 
    setSelectedDate, 
    calendarMonth, 
    setCalendarMonth, 
    onTaskToggle,
    loading,
    journalToday,
    restrictJournalDates = false,
}) => {
    // State
    const [closing, setClosing] = useState(false);
    const [localTasks, setLocalTasks] = useState([]);
    const [localNotes, setLocalNotes] = useState([]);
    const [isToggling, setIsToggling] = useState(false);
    const navigate = useNavigate();
    
    // Refs
    const timeoutRef = useRef(null);
    const pendingToggleRef = useRef(null);
    const tasksRef = useRef([]);
    const notesRef = useRef([]);
    
    // Update local state ONLY when tasks/notes actually change
    useEffect(() => {
        // Only update if the data has actually changed
        const tasksChanged = JSON.stringify(tasksRef.current) !== JSON.stringify(tasks);
        const notesChanged = JSON.stringify(notesRef.current) !== JSON.stringify(notes);
        
        if (tasksChanged) {
            setLocalTasks(tasks);
            tasksRef.current = tasks;
        }
        
        if (notesChanged) {
            setLocalNotes(notes);
            notesRef.current = notes;
        }
    }, [tasks, notes]);
    
    // Cleanup
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);
    
    // Calendar days - memoized
    const calendarDays = useMemo(() => {
        if (!calendarMonth) return [];
        try {
            const [year, month] = calendarMonth.split('-').map(Number);
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);
            const startPadding = (firstDay.getDay() + 6) % 7;
            
            const days = [];
            for (let i = 0; i < startPadding; i++) days.push(null);
            for (let d = 1; d <= lastDay.getDate(); d++) {
                days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }
            return days;
        } catch {
            return [];
        }
    }, [calendarMonth]);
    
    // Task dates - memoized
    const taskDates = useMemo(() => {
        return new Set(tasks.filter(t => t.date).map(t => t.date));
    }, [tasks]);
    
    // Stats - memoized
    const stats = useMemo(() => ({
        taskCount: tasks.length,
        completedCount: tasks.filter(t => t.completed).length,
        notesCount: notes.length,
        completionPct: tasks.length ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0
    }), [tasks, notes]);
    
    const todayStr = journalToday || new Date().toISOString().slice(0, 10);
    
    // Handlers
    const handleClose = useCallback(() => {
        if (closing) return;
        setClosing(true);
        
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setClosing(false);
            onClose();
        }, 150);
    }, [closing, onClose]);
    
    const handlePrevMonth = useCallback(() => {
        if (restrictJournalDates) return;
        const [y, m] = calendarMonth.split('-').map(Number);
        const newMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
        setCalendarMonth(newMonth);
    }, [calendarMonth, setCalendarMonth, restrictJournalDates]);
    
    const handleNextMonth = useCallback(() => {
        if (restrictJournalDates) return;
        const [y, m] = calendarMonth.split('-').map(Number);
        const newMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        setCalendarMonth(newMonth);
    }, [calendarMonth, setCalendarMonth, restrictJournalDates]);
    
    const handleGoToJournal = useCallback(() => {
        handleClose();
        timeoutRef.current = setTimeout(() => navigate('/journal'), 150);
    }, [handleClose, navigate]);
    
    const handleDateSelect = useCallback((date) => {
        if (restrictJournalDates && date !== todayStr) return;
        setSelectedDate(date);
    }, [setSelectedDate, restrictJournalDates, todayStr]);
    
    const handleTaskToggleOptimistic = useCallback(async (task) => {
        if (isToggling) return;
        
        setLocalTasks(prev => 
            prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t)
        );
        
        setIsToggling(true);
        pendingToggleRef.current = task.id;
        
        try {
            await onTaskToggle(task);
        } catch (error) {
            setLocalTasks(prev => 
                prev.map(t => t.id === task.id ? task : t)
            );
        } finally {
            setIsToggling(false);
            pendingToggleRef.current = null;
        }
    }, [onTaskToggle, isToggling]);
    
    // Escape key handler
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEsc = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, handleClose]);
    
    if (!isOpen && !closing) return null;
    
    return (
        <div 
            className={`journal-modal-overlay quick-journal-modal ${closing ? 'closing' : ''}`}
            onClick={handleClose}
        >
            <div 
                className="journal-modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    transform: closing ? 'scale(0.95)' : 'scale(1)',
                    opacity: closing ? 0 : 1,
                    transition: 'transform 0.15s ease, opacity 0.15s ease'
                }}
            >
                {/* Header */}
                <div className="journal-modal-header">
                    <h3>Quick Journal</h3>
                    <button className="journal-modal-close" onClick={handleClose}>×</button>
                </div>
                
                {/* Body */}
                <div className="journal-modal-body">
                    {/* Stats Bar */}
                    <div className="mini-stats-bar">
                        <div className="mini-stat-item">
                            <span className="mini-stat-label">Tasks</span>
                            <span className="mini-stat-value">
                                {stats.completedCount}/{stats.taskCount}
                            </span>
                        </div>
                        <div className="mini-stat-item">
                            <span className="mini-stat-label">Notes</span>
                            <span className="mini-stat-value">{stats.notesCount}</span>
                        </div>
                        <div className="mini-stat-item">
                            <span className="mini-stat-label">Progress</span>
                            <span className="mini-stat-value completed">
                                {stats.completionPct}%
                            </span>
                        </div>
                    </div>
                    
                    {/* Calendar */}
                    <div className="mini-calendar">
                        <div className="mini-calendar-header">
                            <button 
                                className="mini-calendar-nav-btn"
                                onClick={handlePrevMonth}
                                disabled={restrictJournalDates}
                                type="button"
                            >
                                ‹
                            </button>
                            <h4>
                                {calendarMonth ? new Date(calendarMonth + '-01').toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    year: 'numeric' 
                                }) : '—'}
                            </h4>
                            <button 
                                className="mini-calendar-nav-btn"
                                onClick={handleNextMonth}
                                disabled={restrictJournalDates}
                                type="button"
                            >
                                ›
                            </button>
                        </div>
                        
                        <div className="mini-calendar-weekdays">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                                <div key={`wd-${idx}`} className="mini-calendar-weekday">{day}</div>
                            ))}
                        </div>
                        
                        <div className="mini-calendar-grid">
                            {calendarDays.map((date, idx) => {
                                if (!date) {
                                    return <div key={`empty-${idx}`} className="mini-calendar-day empty" />;
                                }
                                const isSelected = date === selectedDate;
                                const isToday = date === todayStr;
                                const hasTasks = taskDates.has(date);
                                const isLocked = restrictJournalDates && date !== todayStr;
                                
                                return (
                                    <button
                                        key={date}
                                        disabled={isLocked}
                                        className={`mini-calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasTasks ? 'has-tasks' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => handleDateSelect(date)}
                                        type="button"
                                    >
                                        {parseInt(date.slice(-2), 10)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Tasks */}
                    <h4 className="jmodal-section-label">TODAY'S TASKS</h4>
                    <div className="tasks-container" style={{ minHeight: '140px' }}>
                        {loading && localTasks.length === 0 ? (
                            <div className="jmodal-skeleton">
                                {[1, 2, 3].map(i => (
                                    <div key={`skeleton-task-${i}`} className="skeleton-task-item">
                                        <div className="skeleton-checkbox"></div>
                                        <div className="skeleton-text"></div>
                                        <div className="skeleton-xp"></div>
                                    </div>
                                ))}
                            </div>
                        ) : localTasks.length === 0 ? (
                            <div className="jmodal-empty">No tasks for today</div>
                        ) : (
                            localTasks.slice(0, 5).map(task => (
                                <div key={task.id} className="mini-task-item">
                                    <button
                                        className={`mini-task-checkbox ${task.completed ? 'checked' : ''}`}
                                        onClick={() => handleTaskToggleOptimistic(task)}
                                        disabled={isToggling && pendingToggleRef.current === task.id}
                                        type="button"
                                    >
                                        {task.completed && <FaCheck />}
                                    </button>
                                    <span className={`mini-task-title ${task.completed ? 'completed' : ''}`}>
                                        {task.title}
                                    </span>
                                    {!task.completed && (
                                        <span className="mini-task-xp">+5</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    
                    {/* Notes */}
                    <h4 className="jmodal-section-label">RECENT NOTES</h4>
                    <div className="notes-container" style={{ minHeight: '72px' }}>
                        {loading && localNotes.length === 0 ? (
                            <div className="jmodal-skeleton">
                                {[1, 2].map(i => (
                                    <div key={`skeleton-note-${i}`} className="skeleton-note-item">
                                        <div className="skeleton-note-line"></div>
                                        <div className="skeleton-note-line-short"></div>
                                    </div>
                                ))}
                            </div>
                        ) : localNotes.length === 0 ? (
                            <div className="jmodal-empty">No notes for today</div>
                        ) : (
                            localNotes.slice(0, 3).map(note => (
                                <div key={note.id} className="mini-note-item">
                                    <p>{note.content?.length > 60 ? note.content.substring(0, 60) + '...' : note.content}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                {/* Footer */}
                <div className="journal-modal-footer">
                    <button
                        className="go-to-journal-btn"
                        onClick={handleGoToJournal}
                        type="button"
                    >
                        Go to Full Journal →
                    </button>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // ULTRA STRICT memo comparison
    if (prevProps.isOpen !== nextProps.isOpen) return false;
    if (prevProps.selectedDate !== nextProps.selectedDate) return false;
    if (prevProps.calendarMonth !== nextProps.calendarMonth) return false;
    if (prevProps.loading !== nextProps.loading) return false;
    if (prevProps.journalToday !== nextProps.journalToday) return false;
    if (prevProps.restrictJournalDates !== nextProps.restrictJournalDates) return false;
    
    // Deep compare tasks
    const prevTasks = prevProps.tasks || [];
    const nextTasks = nextProps.tasks || [];
    
    if (prevTasks.length !== nextTasks.length) return false;
    
    for (let i = 0; i < prevTasks.length; i++) {
        if (prevTasks[i].id !== nextTasks[i].id) return false;
        if (prevTasks[i].completed !== nextTasks[i].completed) return false;
    }
    
    // Compare notes IDs
    const prevNotes = prevProps.notes || [];
    const nextNotes = nextProps.notes || [];
    
    if (prevNotes.length !== nextNotes.length) return false;
    
    for (let i = 0; i < prevNotes.length; i++) {
        if (prevNotes[i].id !== nextNotes[i].id) return false;
    }
    
    return true;
});

export default MiniJournalModal;