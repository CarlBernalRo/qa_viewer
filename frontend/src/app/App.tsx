import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AgentCatalogProvider } from '../features/agents-overview/AgentCatalogContext';
import { ConnectionBanner } from './ConnectionBanner';
import { LiveBridge } from './LiveBridge';
import { BackendProvider } from './providers/BackendProvider';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BackendProvider>
        <AgentCatalogProvider>
          <LiveBridge />
          <ConnectionBanner />
          <RouterProvider router={router} />
        </AgentCatalogProvider>
      </BackendProvider>
    </QueryClientProvider>
  );
}
