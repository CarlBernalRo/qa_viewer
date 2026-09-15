/** Claves de React Query centralizadas para invalidar sin strings sueltos. */
export const queryKeys = {
  sessions: ['sessions'] as const,
  session: (id: string) => ['session', id] as const,
  sessionEvents: (id: string) => ['session-events', id] as const,
  sessionFindings: (id: string) => ['session-findings', id] as const,
  sessionReview: (id: string) => ['session-review', id] as const,
  agentStatus: ['agent-status'] as const,
  sessionAgents: (id: string) => ['session-agents', id] as const,
  liveStats: (id: string) => ['live-stats', id] as const,
  /** true/false según el WebSocket en vivo esté conectado; null antes del primer intento. */
  liveConnection: ['live-connection'] as const,
};
