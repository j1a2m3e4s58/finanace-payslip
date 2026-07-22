import { useCallback, useEffect, useState } from 'react';
import { getSystemHealth } from '@/api/portalClient';

const POLL_INTERVAL_MS = 30_000;

export default function useSystemHealth() {
  const [health, setHealth] = useState({ status: 'checking', checkedAt: null, database: null, worker: null, pending: 0 });

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      setHealth((current) => ({ ...current, status: 'offline', checkedAt: Date.now() }));
      return;
    }
    try {
      const result = await getSystemHealth();
      setHealth({
        status: ['online', 'degraded'].includes(result.status) ? result.status : result.ok ? 'online' : 'offline',
        checkedAt: result.checkedAt || Date.now(),
        database: result.database?.backend || null,
        worker: result.deliveryQueue?.mode || null,
        pending: Number(result.deliveryQueue?.pending || 0),
      });
    } catch {
      setHealth((current) => ({ ...current, status: 'offline', checkedAt: Date.now() }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    const handleOnline = () => refresh();
    const handleOffline = () => setHealth((current) => ({ ...current, status: 'offline', checkedAt: Date.now() }));
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  return { ...health, refresh };
}
