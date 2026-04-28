import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import Api from '../services/Api';
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

function shouldSkipOsNotification(flags) {
  const { claimed, inboxDelivered, alreadyDelivered } = flags;
  if (alreadyDelivered) return true;
  if (claimed && inboxDelivered) return true;
  return false;
}

/**
 * Schedules timeouts for all stored journal reminders while the user is logged in.
 * When a timer fires, POSTs to the server so inbox + VAPID share one pipeline with cron (no duplicates).
 */
export default function JournalReminderScheduler() {
  const { user } = useAuth();
  const timersRef = useRef(new Map());

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  const deliverServer = useCallback(async (taskId) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token || !taskId) {
      return { claimed: false, inboxDelivered: false, alreadyDelivered: false };
    }
    try {
      const res = await Api.deliverJournalTaskReminder(String(taskId));
      const d = res.data || {};
      return {
        claimed: Boolean(d.claimed),
        inboxDelivered: Boolean(d.inboxDelivered),
        alreadyDelivered: Boolean(d.alreadyDelivered),
      };
    } catch {
      return { claimed: false, inboxDelivered: false, alreadyDelivered: false };
    }
  }, []);

  const processOverdue = useCallback(
    async (uid, list) => {
      const now = Date.now();
      const overdue = list.filter((r) => Number(r.fireAt) <= now);
      if (!overdue.length) return list;

      const flagsList = [];
      for (const r of overdue) {
        const flags = await deliverServer(r.taskId);
        flagsList.push(flags);
        removeReminderById(r.id);
      }

      if (overdue.length === 1) {
        const t = overdue[0].taskTitle || 'Journal task';
        toast.info(`Reminder: ${t}`, { autoClose: 9000 });
        if (!shouldSkipOsNotification(flagsList[0])) {
          showDesktopNotification('Journal reminder', `Time for: ${t}`);
        }
        if (flagsList[0].inboxDelivered && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('aura-notifications-refresh'));
        }
      } else {
        toast.info(`${overdue.length} journal reminders were due.`, { autoClose: 9000 });
        const anyOs = flagsList.some((f) => !shouldSkipOsNotification(f));
        if (anyOs) {
          showDesktopNotification(
            'Journal reminders',
            `${overdue.length} tasks were due. Open your journal to catch up.`
          );
        }
        if (flagsList.some((f) => f.inboxDelivered) && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('aura-notifications-refresh'));
        }
      }
      return loadRemindersForUser(uid);
    },
    [deliverServer]
  );

  const schedule = useCallback(
    (uid) => {
      clearTimers();
      if (!uid) return;

      void (async () => {
        let list = loadRemindersForUser(uid);
        list = await processOverdue(uid, list);

        const now = Date.now();
        const maxDelay = 1000 * 60 * 60 * 24 * 30;

        list.forEach((r) => {
          const delay = Number(r.fireAt) - now;
          if (!Number.isFinite(delay) || delay < 1000) return;
          if (delay > maxDelay) return;

          const tid = setTimeout(() => {
            timersRef.current.delete(r.id);
            void (async () => {
              const title = r.taskTitle || 'Journal task';
              const flags = await deliverServer(r.taskId);
              removeReminderById(r.id);
              toast.info(`Reminder: ${title}`, { autoClose: 9000 });
              if (!shouldSkipOsNotification(flags)) {
                showDesktopNotification('Journal reminder', `Time for: ${title}`);
              }
              if (flags.inboxDelivered && typeof window !== 'undefined') {
                window.dispatchEvent(new Event('aura-notifications-refresh'));
              }
            })();
          }, delay);
          timersRef.current.set(r.id, tid);
        });
      })();
    },
    [clearTimers, processOverdue, deliverServer]
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
