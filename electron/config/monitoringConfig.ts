// electron/config/monitoringConfig.ts

export const MONITORING_CONFIG = {
  GAME_APPEAR_TIMEOUT_MS: 60_000, // 60s for game to appear
  POLL_INTERVAL_MS: 2_000,        // 2s between checks
  MAX_POLL_ATTEMPTS: 18_000,      // ~10 hours max (hard safety cap)
} as const;
