/**
 * setInterval that only runs while the document tab is visible.
 * Clears the timer on visibility hidden; restarts when visible again.
 *
 * @param {() => void} callback
 * @param {number} ms
 * @param {{ runLeadingWhenVisible?: boolean }} [options] - if true, run callback once when tab becomes visible (before interval resumes)
 * @returns {() => void} cleanup
 */
export function subscribeVisibleInterval(callback, ms, options = {}) {
  const { runLeadingWhenVisible = false } = options;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const id = setInterval(callback, ms);
    return () => clearInterval(id);
  }

  let intervalId = null;

  const clear = () => {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const start = () => {
    clear();
    if (document.visibilityState === 'hidden') return;
    intervalId = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      callback();
    }, ms);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      clear();
    } else {
      if (runLeadingWhenVisible) {
        try {
          callback();
        } catch (e) {
          console.error(e);
        }
      }
      start();
    }
  };

  if (document.visibilityState !== 'hidden') {
    start();
  }

  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    clear();
  };
}
