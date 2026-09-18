/** 83_400 ms → "01:23.4" (o "1:01:23" si pasa la hora). */
export function formatClock(ms: number, withTenths = true): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  const base = `${pad(minutes)}:${pad(seconds)}`;
  return withTenths ? `${base}.${Math.floor((safe % 1000) / 100)}` : base;
}

/** Duración legible: "4 min 12 s", "850 ms". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

const dateFormatter = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function sessionDurationMs(startedAt?: string, endedAt?: string, now = Date.now()): number {
  if (!startedAt) return 0;
  const end = endedAt ? new Date(endedAt).getTime() : now;
  return Math.max(0, end - new Date(startedAt).getTime());
}

/** 1_536_000 → "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}
