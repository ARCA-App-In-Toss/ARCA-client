/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `<ARCA_API_BASE>`; unset until a real host exists (05 §13.2). */
  readonly VITE_ARCA_API_BASE?: string;
  /** Dev-only mock scenario name; ignored in production builds. */
  readonly VITE_ARCA_MOCK_SCENARIO?: string;
}

/** package.json version, injected by vite `define`. */
declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
