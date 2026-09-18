import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDuration, sessionDurationMs } from './format';

describe('formatClock', () => {
  it('muestra minutos, segundos y décimas', () => {
    expect(formatClock(151_400)).toBe('02:31.4');
    expect(formatClock(151_400, false)).toBe('02:31');
  });

  it('usa horas cuando corresponde', () => {
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });
});

describe('formatDuration', () => {
  it('elige la unidad según el largo', () => {
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(252_000)).toBe('4 min 12 s');
    expect(formatDuration(120_000)).toBe('2 min');
  });
});

describe('formatBytes', () => {
  it('elige la unidad según el tamaño', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB');
  });

  it('sin decimales de 10 en adelante', () => {
    expect(formatBytes(15 * 1024)).toBe('15 KB');
  });
});

describe('sessionDurationMs', () => {
  it('es cero si la sesión no empezó', () => {
    expect(sessionDurationMs(undefined, undefined)).toBe(0);
  });

  it('usa el fin si existe', () => {
    expect(sessionDurationMs('2026-09-14T10:00:00Z', '2026-09-14T10:04:12Z')).toBe(252_000);
  });
});
