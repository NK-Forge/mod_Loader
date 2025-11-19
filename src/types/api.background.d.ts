export {};

declare global {
  interface Window {
    api: {
      bgGet: () => Promise<{ ok: boolean; path: string; fileUrl: string }>;
      bgChoose: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      bgSet: (p: string) => Promise<{ ok: boolean; path?: string; fileUrl?: string; message?: string }>;
      bgReset: () => Promise<{ ok: boolean }>;
    } & Window["api"]; // keep existing members
  }
}
