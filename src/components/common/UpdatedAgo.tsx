import { useEffect, useState } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';

/** Seconds since `timestampMs`, re-evaluated every second; null when unknown. */
export function useSecondsAgo(timestampMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (timestampMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timestampMs]);
  return timestampMs === null ? null : Math.max(0, Math.round((now - timestampMs) / 1000));
}

export function formatUpdatedAgo(seconds: number | null): string {
  if (seconds === null) return 'chưa cập nhật';
  if (seconds < 60) return `cập nhật ${seconds} giây trước`;
  return `cập nhật ${Math.floor(seconds / 60)} phút trước`;
}

/** Small "cập nhật X giây trước" label driven by the terminal's quote auto-refresh. */
export function UpdatedAgo({ className }: { className?: string }) {
  const { lastUpdatedAt } = useTerminal();
  const seconds = useSecondsAgo(lastUpdatedAt);
  return <span className={className}>{formatUpdatedAgo(seconds)}</span>;
}
