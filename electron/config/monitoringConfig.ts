// electron/config/monitoringConfig.ts

export const MONITORING_CONFIG = {
  GAME_APPEAR_TIMEOUT_MS: 90_000, // 90s for a brokered launch to produce the real game process
  AUMID_APPEAR_TIMEOUT_MS: 30_000, // Shorter probe for speculative AppsFolder/AUMID activation
  POLL_INTERVAL_MS: 2_000,        // 2s between checks
  MAX_POLL_ATTEMPTS: 18_000,      // ~10 hours max (hard safety cap)
  RUNNING_STABLE_CHECKS: 2,       // 2 * 2s = ~4s stable running proof
  EXIT_STABLE_CHECKS: 10,         // 10 * 2s = ~20s; protects Gaming Services relaunch gaps
} as const;
