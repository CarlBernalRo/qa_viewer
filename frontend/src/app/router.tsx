import { createHashRouter } from 'react-router';
import { NewSessionPage } from '../features/new-session/NewSessionPage';
import { SessionDetailPage } from '../features/session-detail/SessionDetailPage';
import { SessionsPage } from '../features/sessions/SessionsPage';

/** Hash router: funciona igual en el servidor de Vite y dentro de Tauri. */
export const router = createHashRouter([
  { path: '/', element: <SessionsPage /> },
  { path: '/sessions/new', element: <NewSessionPage /> },
  { path: '/sessions/:id', element: <SessionDetailPage /> },
]);
