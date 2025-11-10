export {};

declare global {
  interface Window {
    api: {
      // keep your existing methods; we don’t list them, we’re just adding:
      revealPath: (p: string) => Promise<void>;
      getImmutablePaths: () => {
        modPlayVault: string;
        modsVault: string;
        configRoot: string;
        logsRoot: string;
      };
      onConfigChanged?: (cb: () => void) => () => void;
      listCopyEvents: (
        modPlayVault: string,
        lastDays: number
      ) => Promise<CopyEvent[]>;
    };
  }

  interface CopyEvent {
    ts: string;
    src: string;
    dest: string;
    files: number;
    bytes: number;
    ms: number;
    result: 'ok' | 'error';
  }
}
