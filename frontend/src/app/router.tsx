import { createHashRouter } from 'react-router';
import { AgentDetailPage } from '../features/agents-overview/AgentDetailPage';
import { AgentsOverviewPage } from '../features/agents-overview/AgentsOverviewPage';
import { FindingsOverviewPage } from '../features/findings-overview/FindingsOverviewPage';
import { NewSessionPage } from '../features/new-session/NewSessionPage';
import { SessionDetailPage } from '../features/session-detail/SessionDetailPage';
import { SessionsPage } from '../features/sessions/SessionsPage';

/** Hash router: funciona igual en el servidor de Vite y dentro de Tauri. */
export const router = createHashRouter([
  { path: '/', element: <SessionsPage /> },
  { path: '/hallazgos', element: <FindingsOverviewPage /> },
  { path: '/agentes', element: <AgentsOverviewPage /> },
  { path: '/agentes/:id', element: <AgentDetailPage /> },
  { path: '/sessions/new', element: <NewSessionPage /> },
  { path: '/sessions/:id', element: <SessionDetailPage /> },
]);
