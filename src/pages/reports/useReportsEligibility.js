import { useState, useEffect, useCallback, useRef } from 'react';
import { logClassifiedError } from '../../utils/apiObservability';

const BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Loads /api/reports/eligibility for Performance & DNA and manual metrics flows.
 */
export function useReportsEligibility(token) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSeqRef = useRef(0);
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    if (!token) return;
    const requestSeq = ++requestSeqRef.current;
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError('');
    try {
      let res = await fetch(`${BASE_URL}/api/reports/eligibility`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      // Safe retry for idempotent GET only on transient server/network conditions.
      if (!res.ok && res.status >= 500) {
        res = await fetch(`${BASE_URL}/api/reports/eligibility`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      if (requestSeq !== requestSeqRef.current) return;
      setEligibility(data);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== requestSeqRef.current) return;
      logClassifiedError('reports.eligibility.fetch', err);
      setError(err.message);
    } finally {
      if (requestSeq !== requestSeqRef.current) return;
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    return () => {
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, [load]);

  return { eligibility, loading, error, reload: load };
}
