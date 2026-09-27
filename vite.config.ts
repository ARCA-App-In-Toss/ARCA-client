import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import aitDevtools from '@apps-in-toss/devtools/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);

/** Serves the MSW worker from node_modules in dev only, so no mock file is ever copied into dist. */
function mswDevWorker(): Plugin {
  return {
    name: 'arca-msw-dev-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(readFileSync(require.resolve('msw/mockServiceWorker.js')));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [aitDevtools.vite(), react(), mswDevWorker()],
});
