/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAPTILER_KEY?: string;
  readonly VITE_MAPTILER_STYLE_ID?: string;
  readonly VITE_MAP_FALLBACK_STYLE_URL?: string;
  readonly VITE_MAP_CENTER_LAT?: string;
  readonly VITE_MAP_CENTER_LNG?: string;
  readonly VITE_MAP_INITIAL_ZOOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
