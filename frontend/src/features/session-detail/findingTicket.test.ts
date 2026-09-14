import type { Finding, SessionDto } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { findingToTicket } from './findingTicket';

const session: SessionDto = {
  id: 'ses_1',
  createdAt: '2026-09-14T10:00:00.000Z',
  status: 'completed',
  objective: {
    sessionName: 'Pago con tarjeta',
    statement: 'Comprobar que un cliente pueda pagar con tarjeta.',
    testType: 'funcional',
    criteria: [{ id: 'CA1', text: 'Un pago aprobado crea un pedido.' }],
    scope: { include: [], exclude: [] },
    linkedIssue: 'QA-123',
  },
  capture: {
    startUrl: 'https://qa.mercadito.test/checkout',
    environment: 'QA',
    channels: ['network'],
    redaction: { presets: [], customPatterns: [] },
    analysisMode: 'none',
  },
  stats: { actions: 1, requests: 1, wsFrames: 0, consoleLogs: 0, errors: 1 },
  hasVideo: false,
};

const finding: Finding = {
  id: 'http-server-error:abc',
  ruleId: 'http-server-error',
  source: 'rule',
  category: 'network',
  severity: 'critical',
  title: 'El servidor falló (500) en POST /api/orders',
  subject: 'POST /api/orders',
  detail: 'Respondió 500 1 vez.',
  recommendation: 'Revisa el log del servidor.',
  occurrences: 1,
  firstAt: 3400,
  lastAt: 3400,
  evidence: ['e1'],
  afterAction: { eventId: 'a1', label: 'Click en «Pagar»', t: 3000 },
  outOfScope: false,
  decision: { decision: 'confirmed', decidedAt: '2026-09-14T10:30:00.000Z', note: 'Se repite siempre.' },
};

describe('findingToTicket', () => {
  it('arma un ticket con contexto, pasos para reproducir y evidencia', () => {
    const ticket = findingToTicket(finding, session);
    expect(ticket.split('\n')[0]).toBe('## [Crítico] El servidor falló (500) en POST /api/orders');
    expect(ticket).toContain('**Historia:** QA-123');
    expect(ticket).toContain('**Cuándo:** 00:03.4 de la grabación, después de: Click en «Pagar»');
    expect(ticket).toContain(
      '1. Abrir https://qa.mercadito.test/checkout\n2. Click en «Pagar»\n3. Observar: El servidor falló (500) en POST /api/orders',
    );
    expect(ticket).toContain('### Nota del QA\nSe repite siempre.');
    expect(ticket).toContain('regla «Errores del servidor (5xx)»');
  });

  it('sin acción previa, los pasos se numeran igual de seguido', () => {
    const withoutAction: Finding = { ...finding };
    delete withoutAction.afterAction;
    expect(findingToTicket(withoutAction, session)).toContain('2. Observar:');
  });
});
