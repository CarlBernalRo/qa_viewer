import type { SessionReportDto } from '@rastro/shared';
import { InvalidStateError, NotFoundError } from '../../domain/errors.js';
import type {
  AgentRunStore,
  Clock,
  EventStore,
  FileOpener,
  ReportRenderer,
  ReportStore,
  SessionRepository,
  SessionReviewStore,
} from '../../domain/ports.js';
import { generateK6Script } from '../reports/k6Script.js';
import type { AnalyzeSession } from './analysis.js';

/**
 * "Pago con tarjeta · v2.14.0" → "pago-con-tarjeta-v2-14-0-1a2b3c4d.pdf". Es estable por
 * sesión: al volver a exportar se reemplaza el informe anterior en vez de acumular copias.
 */
export function reportFileName(sessionId: string, sessionName: string): string {
  const slug = sessionName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const short = sessionId.replace(/^ses_/, '').slice(0, 8);
  return `${slug || 'sesion'}-${short}.pdf`;
}

/** Genera el informe PDF de una sesión grabada (objetivo, hallazgos y cobertura) y lo guarda. */
export class ExportSessionReport {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly analyze: AnalyzeSession,
    private readonly reviews: SessionReviewStore,
    private readonly renderer: ReportRenderer,
    private readonly store: ReportStore,
    private readonly clock: Clock,
    private readonly agentRuns: AgentRunStore,
  ) {}

  async execute(id: string): Promise<SessionReportDto> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    // Una sesión en borrador no tiene nada que informar: el análisis responde 409.
    const analysis = await this.analyze.execute(id);
    const review = await this.reviews.read(id);
    const runs = await this.agentRuns.list(id);
    const latestAgentRun = runs.find((run) => run.status === 'completed') ?? null;
    const generatedAt = this.clock.now();
    const pdf = await this.renderer.renderPdf({ session: session.toDto(), analysis, review, generatedAt, latestAgentRun });
    const fileName = reportFileName(id, session.objective.sessionName);
    const path = await this.store.save(fileName, pdf);
    return {
      fileName,
      path,
      generatedAt: generatedAt.toISOString(),
      findings: analysis.findings.filter((finding) => finding.decision?.decision !== 'dismissed').length,
    };
  }
}

/** Genera el script k6 (agente Carga): determinístico, sin IA, a partir del tráfico real de la sesión. */
export class GenerateLoadScript {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly events: EventStore,
  ) {}

  async execute(id: string): Promise<{ fileName: string; script: string }> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    if (session.status !== 'completed') throw new InvalidStateError('La sesión todavía no terminó de grabarse.');
    const events = await this.events.read(id);
    const script = generateK6Script(session.toDto(), events);
    const fileName = reportFileName(id, session.objective.sessionName).replace(/\.pdf$/, '.k6.js');
    return { fileName, script };
  }
}

/** Abre el último informe exportado de la sesión, o lo muestra en su carpeta. */
export class OpenSessionReport {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly store: ReportStore,
    private readonly opener: FileOpener,
  ) {}

  async execute(id: string, reveal: boolean): Promise<void> {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundError('una sesión', id);
    const path = await this.store.find(reportFileName(id, session.objective.sessionName));
    if (!path) throw new NotFoundError('un informe exportado para la sesión', id);
    await (reveal ? this.opener.reveal(path) : this.opener.open(path));
  }
}
