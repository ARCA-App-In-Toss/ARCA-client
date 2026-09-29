import { QueryClientProvider } from '@tanstack/react-query';
import { type DataRouter, RouterProvider } from 'react-router';
import type { AppServices } from './composition.ts';
import { AppServicesProvider } from './services.tsx';

export function App({ services, router }: { services: AppServices; router: DataRouter }) {
  return (
    <AppServicesProvider services={services}>
      <QueryClientProvider client={services.queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppServicesProvider>
  );
}
