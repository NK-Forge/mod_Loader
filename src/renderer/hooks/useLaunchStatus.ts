// src/renderer/hooks/useLaunchStatus.ts
import * as React from "react";

type LaunchPhase = "idle" | "launching" | "monitoring" | "mirroring" | "done" | "error";

export interface LaunchStatusState {
  phase: LaunchPhase;
  mode: "mod" | "vanilla" | "unknown";
  message: string;
  lastUpdated: number | null;
  durationMs?: number;
}

type Api = {
  onLaunchStatus?: (
    cb: (payload: { phase: string; mode: string; message: string; timestamp: number }) => void
  ) => () => void;
  onLaunchComplete?: (
    cb: (payload: { ok: boolean; mode: string; message?: string; timestamp: number; durationMs?: number }) => void
  ) => () => void;
};

const getApi = (): Api | undefined => {
  return (window as any).api as Api | undefined;
};

/**
 * Hook that tracks launch status + completion events from main.
 * Use it to drive a status bar, toast, or footer message.
 */
export function useLaunchStatus() {
  const [status, setStatus] = React.useState<LaunchStatusState>({
    phase: "idle",
    mode: "unknown",
    message: "",
    lastUpdated: null,
  });

  React.useEffect(() => {
    const api = getApi();
    if (!api?.onLaunchStatus || !api?.onLaunchComplete) {
      console.warn("[useLaunchStatus] launch status APIs not available");
      return;
    }

    const unsubscribeStatus = api.onLaunchStatus((payload) => {
      const phaseMap: Record<string, LaunchPhase> = {
        launching: "launching",
        monitoring: "monitoring",
        mirroring: "mirroring",
      };

      const phase: LaunchPhase = phaseMap[payload.phase] ?? "idle";
      const mode = (payload.mode === "mod" || payload.mode === "vanilla"
        ? payload.mode
        : "unknown") as LaunchStatusState["mode"];

      setStatus({
        phase,
        mode,
        message: payload.message,
        lastUpdated: payload.timestamp,
      });
    });

    const unsubscribeComplete = api.onLaunchComplete((payload) => {
      const mode = (payload.mode === "mod" || payload.mode === "vanilla"
        ? payload.mode
        : "unknown") as LaunchStatusState["mode"];

      setStatus({
        phase: payload.ok ? "done" : "error",
        mode,
        message:
          payload.message ??
          (payload.ok
            ? "Game session complete."
            : "Game session ended with an error."),
        lastUpdated: payload.timestamp,
        durationMs: payload.durationMs,
      });
    });

    return () => {
      try {
        unsubscribeStatus?.();
        unsubscribeComplete?.();
      } catch (e) {
        console.warn("[useLaunchStatus] error during cleanup", e);
      }
    };
  }, []);

  return status;
}
