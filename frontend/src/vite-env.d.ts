/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSE_TRACKER_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
