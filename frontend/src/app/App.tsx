import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
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
        <LiveBridge />
        <ConnectionBanner />
        <RouterProvider router={router} />
      </BackendProvider>
    </QueryClientProvider>
  );
}
