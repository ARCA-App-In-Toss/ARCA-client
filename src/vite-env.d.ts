/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARCA_API_BASE?: string;
  readonly VITE_ARCA_MOCK_SCENARIO?: string;
}

declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
