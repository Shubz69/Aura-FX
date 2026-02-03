/**
 * Single source-of-truth: entitlements from /api/me only.
 * Cached 60s. Guards and pages read from here; no duplicate gating logic.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const CACHE_MS = 60 * 1000;

const EntitlementsContext = createContext(null);

export const useEntitlements = () => {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementsProvider');
  return ctx;
};

export const EntitlementsProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cachedAt = useRef(0);
  const fetchInFlight = useRef(false);

  const fetchMe = useCallback(async (force = false) => {
    if (!token || !user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    const now = Date.now();
    if (!force && now - cachedAt.current < CACHE_MS) {
      setLoading(false);
      return;
    }
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const base = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${base}/api/me`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) {
        if (res.status === 401) {
          setData(null);
          setLoading(false);
          return;
        }
        throw new Error('Failed to load entitlements');
      }
      const json = await res.json();
      if (json.success && json.user && json.entitlements) {
        setData({ user: json.user, entitlements: json.entitlements });
        cachedAt.current = Date.now();
      } else {
        setData(null);
      }
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
      fetchInFlight.current = false;
    }
  }, [token, user?.id]);

  useEffect(() => {
    if (!token || !user?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    fetchMe();
  }, [token, user?.id, fetchMe]);

  const refresh = useCallback(() => {
    cachedAt.current = 0;
    return fetchMe(true);
  }, [fetchMe]);

  const value = {
    user: data?.user ?? null,
    entitlements: data?.entitlements ?? null,
    loading,
    error,
    refresh
  };

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
};

export default EntitlementsContext;
