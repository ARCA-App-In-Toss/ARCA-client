import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import aitDevtools from '@apps-in-toss/devtools/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);

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

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  plugins: [aitDevtools.vite(), react(), mswDevWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
});
