import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'arca',
  brand: {
    // Mirrors 02 `color.brand.primary`; the platform config cannot read CSS variables.
    primaryColor: '#2457E6',
  },
  permissions: [],
  webBundleDir: 'dist',
});
