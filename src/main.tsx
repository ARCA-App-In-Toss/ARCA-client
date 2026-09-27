import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './app/App.tsx';
import { type AppServices, createAppServices } from './app/composition.ts';
import { routes } from './app/routes.tsx';
import { createAppsInTossPlatform } from './platform/appsInTossPlatform.ts';
import './ui/tokens.css';
import './ui/ui.css';

async function createServices(): Promise<AppServices> {
  // Dev-only mock world; `import.meta.env.DEV` is statically false in production builds, so the
  // mock module, scenario selection and synthetic passenger never ship (07 §2.4, 06 §12).
  if (import.meta.env.DEV && import.meta.env.VITE_ARCA_MOCK_SCENARIO) {
    const { startDevMock } = await import('./mocks/dev.ts');
    return startDevMock(import.meta.env.VITE_ARCA_MOCK_SCENARIO);
  }
  return createAppServices({ platform: createAppsInTossPlatform(), apiBase: import.meta.env.VITE_ARCA_API_BASE });
}

async function main() {
  const container = document.getElementById('root');
  if (!container) throw new Error('root container missing');

  const services = await createServices();
  void services.start();

  createRoot(container).render(
    <StrictMode>
      <App services={services} router={createBrowserRouter(routes)} />
    </StrictMode>,
  );
}

void main();
