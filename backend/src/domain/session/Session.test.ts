import type { CaptureConfig, CaptureEvent, Objective } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { DomainError, InvalidStateError } from '../errors.js';
import { Session } from './Session.js';

const objective: Objective = {
  sessionName: 'Pago con tarjeta',
  statement: 'Comprobar que un cliente pueda pagar con tarjeta.',
  testType: 'funcional',
  criteria: [{ id: 'CA1', text: 'Un pago aprobado crea un pedido pagado.' }],
  scope: { include: ['/checkout/*'], exclude: [] },
};

const capture: CaptureConfig = {
  startUrl: 'https://qa.example.test/checkout',
  environment: 'QA',
  channels: ['actions', 'network'],
  redaction: { presets: [], customPatterns: [] },
  analysisMode: 'none',
};

const t0 = new Date('2026-09-11T14:00:00.000Z');
const newSession = () => Session.create({ id: 's1', now: t0, objective, capture });

describe('Session', () => {
  it('nace en borrador y sin estadísticas', () => {
    const session = newSession();
    expect(session.status).toBe('draft');
    expect(session.stats.requests).toBe(0);
  });

  it('recorre el ciclo draft → recording → completed', () => {
    const session = newSession();
    session.start(new Date(t0.getTime() + 1000));
    session.complete(new Date(t0.getTime() + 61_000), { hasVideo: true });
    const dto = session.toDto();
    expect(dto.status).toBe('completed');
    expect(dto.hasVideo).toBe(true);
    expect(session.elapsedMs(new Date())).toBe(60_000);
  });

  it('no permite grabar dos veces', () => {
    const session = newSession();
    session.start(t0);
    expect(() => session.start(t0)).toThrow(InvalidStateError);
  });

  it('solo registra eventos mientras graba y cuenta errores', () => {
    const session = newSession();
    const error: CaptureEvent = { id: 'e1', t: 5, pageId: 'p1', kind: 'exception', message: 'boom' };
    expect(() => session.recordEvent(error)).toThrow(InvalidStateError);
    session.start(t0);
    session.recordEvent(error);
    expect(session.stats.errors).toBe(1);
  });

  it('rechaza criterios con ids repetidos', () => {
    const repeated = { ...objective, criteria: [objective.criteria[0]!, objective.criteria[0]!] };
    expect(() => Session.create({ id: 's2', now: t0, objective: repeated, capture })).toThrow(DomainError);
  });

  it('se reconstruye igual desde su DTO', () => {
    const session = newSession();
    session.start(t0);
    const restored = Session.fromDto(session.toDto());
    expect(restored.toDto()).toEqual(session.toDto());
  });
});
