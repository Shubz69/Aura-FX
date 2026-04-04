import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import {
  loadRemindersForUser,
  removeReminderById,
  removeRemindersByIds,
  JOURNAL_REMINDERS_CHANGED,
} from '../utils/journalTaskReminders';

function showDesktopNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: `${window.location.origin}/icons/icon-192.png`,
      tag: `journal-reminder-${Date.now()}`,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Schedules timeouts for all stored journal reminders while the user is logged in.
 * Works on any route (not only /journal). Re-syncs on storage / custom event / minute tick.
 */
export default function JournalReminderScheduler() {
  const { user } = useAuth();
  const timersRef = useRef(new Map());

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  const processOverdue = useCallback((uid, list) => {
    const now = Date.now();
    const overdue = list.filter((r) => Number(r.fireAt) <= now);
    if (!overdue.length) return list;

    removeRemindersByIds(overdue.map((r) => r.id));
    if (overdue.length === 1) {
      const t = overdue[0].taskTitle || 'Journal task';
      showDesktopNotification('Journal reminder', `Time for: ${t}`);
      toast.info(`Reminder: ${t}`, { autoClose: 9000 });
    } else {
      showDesktopNotification('Journal reminders', `${overdue.length} tasks were due. Open your journal to catch up.`);
      toast.info(`${overdue.length} journal reminders were due.`, { autoClose: 9000 });
    }
    return loadRemindersForUser(uid);
  }, []);

  const schedule = useCallback(
    (uid) => {
      clearTimers();
      if (!uid) return;

      let list = loadRemindersForUser(uid);
      list = processOverdue(uid, list);

      const now = Date.now();
      const maxDelay = 1000 * 60 * 60 * 24 * 30;

      list.forEach((r) => {
        const delay = Number(r.fireAt) - now;
        if (!Number.isFinite(delay) || delay < 1000) return;
        if (delay > maxDelay) return;

        const tid = setTimeout(() => {
          timersRef.current.delete(r.id);
          const title = r.taskTitle || 'Journal task';
          showDesktopNotification('Journal reminder', `Time for: ${title}`);
          toast.info(`Reminder: ${title}`, { autoClose: 9000 });
          removeReminderById(r.id);
        }, delay);
        timersRef.current.set(r.id, tid);
      });
    },
    [clearTimers, processOverdue]
  );

  useEffect(() => {
    if (!user?.id) {
      clearTimers();
      return undefined;
    }
    const uid = user.id;
    schedule(uid);

    const onSync = () => schedule(uid);
    window.addEventListener(JOURNAL_REMINDERS_CHANGED, onSync);
    window.addEventListener('storage', onSync);
    const minute = setInterval(() => schedule(uid), 60_000);

    return () => {
      clearTimers();
      window.removeEventListener(JOURNAL_REMINDERS_CHANGED, onSync);
      window.removeEventListener('storage', onSync);
      clearInterval(minute);
    };
  }, [user?.id, schedule, clearTimers]);

  return null;
}
