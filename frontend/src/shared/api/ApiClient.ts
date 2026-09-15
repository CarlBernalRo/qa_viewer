import {
  agentRunListSchema,
  agentRunSchema,
  agentStatusSchema,
  API_ROUTES,
  apiErrorSchema,
  healthSchema,
  sessionAnalysisSchema,
  sessionReportSchema,
  sessionReviewSchema,
  sessionSchema,
  type AddMarkerInput,
  type AgentRun,
  type AgentStatus,
  type CaptureEvent,
  type CreateSessionInput,
  type FindingDecisionValue,
  type Health,
  type SessionAnalysis,
  type SessionDto,
  type SessionReportDto,
  type SessionReview,
  type SetCriterionVerdictInput,
} from '@rastro/shared';
import { z } from 'zod';
import type { BackendConfig } from '../config/backendConfig';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const sessionListSchema = z.array(sessionSchema);

/** Cliente HTTP del backend. Toda llamada lleva el token y valida la respuesta. */
export class ApiClient {
  constructor(private readonly config: BackendConfig) {}

  health(): Promise<Health> {
    return this.request(API_ROUTES.health, { method: 'GET' }, healthSchema);
  }

  listSessions(): Promise<SessionDto[]> {
    return this.request(API_ROUTES.sessions, { method: 'GET' }, sessionListSchema);
  }

  getSession(id: string): Promise<SessionDto> {
    return this.request(API_ROUTES.session(id), { method: 'GET' }, sessionSchema);
  }

  createSession(input: CreateSessionInput): Promise<SessionDto> {
    return this.request(
      API_ROUTES.sessions,
      { method: 'POST', body: JSON.stringify(input) },
      sessionSchema,
    );
  }

  async deleteSession(id: string): Promise<void> {
    await this.request(API_ROUTES.session(id), { method: 'DELETE' });
  }

  /** Los eventos vienen del backend local ya validados al grabarse; no se revalidan uno a uno. */
  getEvents(id: string): Promise<CaptureEvent[]> {
    return this.request(API_ROUTES.sessionEvents(id), { method: 'GET' });
  }

  getFindings(id: string): Promise<SessionAnalysis> {
    return this.request(API_ROUTES.sessionFindings(id), { method: 'GET' }, sessionAnalysisSchema);
  }

  getAgentStatus(): Promise<AgentStatus> {
    return this.request(API_ROUTES.agentStatus, { method: 'GET' }, agentStatusSchema);
  }

  async getAgentRuns(id: string): Promise<AgentRun[]> {
    return (await this.request(API_ROUTES.sessionAgents(id), { method: 'GET' }, agentRunListSchema)).runs;
  }

  /** Lanza los agentes; responde enseguida con la corrida "en curso". */
  startAgentRun(id: string): Promise<AgentRun> {
    return this.request(API_ROUTES.sessionAgents(id), { method: 'POST' }, agentRunSchema);
  }

  /** Retoma un análisis fallido: solo se consulta a los agentes que faltan. */
  retryAgentRun(id: string, runId: string): Promise<AgentRun> {
    return this.request(API_ROUTES.agentRunRetry(id, runId), { method: 'POST' }, agentRunSchema);
  }

  getReview(id: string): Promise<SessionReview> {
    return this.request(API_ROUTES.sessionReview(id), { method: 'GET' }, sessionReviewSchema);
  }

  addMarker(id: string, input: AddMarkerInput): Promise<SessionReview> {
    return this.request(API_ROUTES.sessionMarkers(id), { method: 'POST', body: JSON.stringify(input) }, sessionReviewSchema);
  }

  removeMarker(id: string, markerId: string): Promise<SessionReview> {
    return this.request(API_ROUTES.sessionMarker(id, markerId), { method: 'DELETE' }, sessionReviewSchema);
  }

  setCriterionVerdict(id: string, criterionId: string, input: SetCriterionVerdictInput): Promise<SessionReview> {
    return this.request(
      API_ROUTES.criterionVerdict(id, criterionId),
      { method: 'PUT', body: JSON.stringify(input) },
      sessionReviewSchema,
    );
  }

  /** Genera el informe PDF en el backend; devuelve dónde quedó guardado. */
  exportReport(id: string): Promise<SessionReportDto> {
    return this.request(API_ROUTES.sessionReport(id), { method: 'POST' }, sessionReportSchema);
  }

  /** Abre el último informe exportado o, con `reveal`, lo muestra en su carpeta. */
  async openReport(id: string, reveal: boolean): Promise<void> {
    await this.request(API_ROUTES.sessionReportOpen(id), { method: 'POST', body: JSON.stringify({ reveal }) });
  }

  /** `decision: null` limpia una decisión anterior. Devuelve el análisis completo, ya actualizado. */
  setFindingDecision(
    sessionId: string,
    findingId: string,
    decision: FindingDecisionValue | null,
    note?: string,
  ): Promise<SessionAnalysis> {
    return this.request(
      API_ROUTES.findingDecision(sessionId, findingId),
      { method: 'PUT', body: JSON.stringify({ decision, ...(note ? { note } : {}) }) },
      sessionAnalysisSchema,
    );
  }

  startRecording(id: string): Promise<SessionDto> {
    return this.request(API_ROUTES.startRecording(id), { method: 'POST' }, sessionSchema);
  }

  stopRecording(id: string): Promise<SessionDto> {
    return this.request(API_ROUTES.stopRecording(id), { method: 'POST' }, sessionSchema);
  }

  /** El elemento <video> no puede enviar headers: el token va por query (solo en esta ruta). */
  videoUrl(id: string): string {
    return `${this.config.url}${API_ROUTES.sessionVideo(id)}?token=${encodeURIComponent(this.config.token)}`;
  }

  liveUrl(): string {
    const wsBase = this.config.url.replace(/^http/, 'ws');
    return `${wsBase}${API_ROUTES.live}?token=${encodeURIComponent(this.config.token)}`;
  }

  private async request<T>(path: string, init: RequestInit, schema?: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'No hay conexión con el motor de captura.');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(payload);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiRequestError(response.status, code, message, details);
      }
      throw new ApiRequestError(response.status, 'HTTP_ERROR', `El backend respondió ${response.status}.`);
    }
    return schema ? schema.parse(payload) : (payload as T);
  }
}
