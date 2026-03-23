import { useState, useEffect, useCallback } from 'react';

const BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Loads /api/reports/eligibility for Performance & DNA and manual metrics flows.
 */
export function useReportsEligibility(token) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/reports/eligibility`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');
      setEligibility(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { eligibility, loading, error, reload: load };
}
