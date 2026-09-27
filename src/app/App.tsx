import { QueryClientProvider } from '@tanstack/react-query';
import { type DataRouter, RouterProvider } from 'react-router';
import { AppServicesProvider } from './AppServices.tsx';
import type { AppServices } from './composition.ts';

export function App({ services, router }: { services: AppServices; router: DataRouter }) {
  return (
    <AppServicesProvider services={services}>
      <QueryClientProvider client={services.queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppServicesProvider>
  );
}
