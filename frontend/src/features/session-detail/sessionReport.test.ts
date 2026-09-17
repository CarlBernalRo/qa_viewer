import type { AgentRun, Finding, SessionAnalysis, SessionDto, SessionReview } from '@rastro/shared';
import { describe, expect, it } from 'vitest';
import { sessionToReport } from './sessionReport';

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

const review: SessionReview = {
  criteria: { CA1: { verdict: 'fail', note: 'Devuelve 500', updatedAt: '2026-09-14T10:03:00.000Z' } },
  markers: [],
};

const finding: Finding = {
  id: 'f1',
  ruleId: 'http-server-error',
  source: 'rule',
  category: 'network',
  severity: 'critical',
  title: 'El servidor falló (500) en POST /api/orders',
  detail: 'Respondió 500 1 vez.',
  recommendation: 'Revisa el log del servidor.',
  occurrences: 1,
  firstAt: 3400,
  lastAt: 3400,
  evidence: ['e1'],
  outOfScope: false,
  decision: { decision: 'confirmed', decidedAt: '2026-09-14T10:30:00.000Z' },
};

const dismissed: Finding = { ...finding, id: 'f2', title: 'Falso positivo', decision: { decision: 'dismissed', decidedAt: '2026-09-14T10:30:00.000Z' } };

const analysis: SessionAnalysis = {
  sessionId: 'ses_1',
  generatedAt: '2026-09-14T10:01:00.000Z',
  rulesRun: 20,
  skipped: [],
  findings: [finding, dismissed],
};

describe('sessionToReport', () => {
  it('arma objetivo, criterios con veredicto del QA y hallazgos confirmados (sin los descartados)', () => {
    const report = sessionToReport(session, review, analysis, undefined);
    expect(report.split('\n')[0]).toBe('# Pago con tarjeta');
    expect(report).toContain('**Historia:** QA-123');
    expect(report).toContain('- **CA1** (No cumple): Un pago aprobado crea un pedido. — _Devuelve 500_');
    expect(report).toContain('## Hallazgos confirmados (1)');
    expect(report).toContain('El servidor falló (500) en POST /api/orders');
    expect(report).not.toContain('Falso positivo');
    expect(report).toContain('Sesión ses_1');
  });

  it('sin análisis, no hay hallazgos confirmados', () => {
    const report = sessionToReport(session, review, undefined, undefined);
    expect(report).toContain('## Hallazgos confirmados (0)');
    expect(report).toContain('Ninguno todavía.');
  });

  it('con una corrida de agentes terminada, agrega su propuesta aclarando que no está aplicada', () => {
    const run: AgentRun = {
      id: 'run_1',
      sessionId: 'ses_1',
      status: 'completed',
      model: 'gemini-2.5-pro',
      startedAt: '2026-09-14T10:05:00.000Z',
      steps: [],
      summary: 'El pago falla del lado del servidor.',
      proposals: [{ criterionId: 'CA1', verdict: 'fail', confidence: 'high', rationale: 'POST /api/pay devolvió 500.', evidence: [] }],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
    const report = sessionToReport(session, review, analysis, run);
    expect(report).toContain('## Propuesta de los agentes');
    expect(report).toContain('Sin aplicar');
    expect(report).toContain('El pago falla del lado del servidor.');
    expect(report).toContain('**CA1**: No cumple — POST /api/pay devolvió 500.');
  });

  it('con una corrida que no terminó, no agrega la sección de agentes', () => {
    const run: AgentRun = {
      id: 'run_1',
      sessionId: 'ses_1',
      status: 'running',
      model: 'gemini-2.5-pro',
      startedAt: '2026-09-14T10:05:00.000Z',
      steps: [],
      proposals: [],
      findings: [],
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
    expect(sessionToReport(session, review, analysis, run)).not.toContain('Propuesta de los agentes');
  });
});
