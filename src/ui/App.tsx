/**
 * @file App.tsx
 * @project Space Marine 2 Mod Loader
 * UI wiring: Apply, Delete (hard), Launch (Mod Play / Vanilla)
 */

import React, { useEffect, useState } from "react";
import AdvancedSettingsMenu from "../renderer/views/AdvancedSettingsMenu";
import defaultBg from "../renderer/assets/default_bg.jpg";
import { OperationStatusBar, OperationStatus } from "./OperationStatusBar";
import { WindowTitleBar } from "./WindowTitleBar";

type InstallStrategy = "hardlink" | "symlink" | "copy";
type AppConfig = {
  setupComplete: boolean;
  autoDetected: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
  backgroundImagePath?: string;
};

type ModRow = { name: string; enabled: boolean; inVault: boolean };

export default function App() {
  const api = (window as any).api;

  const [cfg, setCfg] = useState<AppConfig>({
    setupComplete: false,
    autoDetected: false,
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    modsVaultPath: "",
    modPlayVaultPath: "",
    saveDataPath: "",
    installStrategy: "hardlink",
  });

  const [mods, setMods] = useState<ModRow[]>([]);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [launching, setLaunching] = useState(false);
  const [hasAppliedMods, setHasAppliedMods] = useState(false);

  const refreshConfig = async () => {
    const next = await api.getConfig();
    setCfg(next);
  };

  const refreshMods = async () => {
    try {
      const r = await api.listMods(); // aligned with preload/main
      const rows: ModRow[] =
        r?.ok && Array.isArray(r.mods)
          ? r.mods.map((m: any) => ({
              name: String(m?.name ?? ""),
              enabled: !!m?.enabled,
              inVault: !!m?.inVault,
            }))
          : [];
      setMods(rows);
      setHasAppliedMods(rows.some((m) => m.enabled));
    } catch (err) {
      console.warn("mods refresh failed:", err);
      setMods([]);
      setHasAppliedMods(false);
    }
  };

  // ---------- Status Bar ----------
  const [status, setStatus] = React.useState<OperationStatus>({
    kind: "idle",
    message: "",
  });

  function setTempStatus(next: OperationStatus, ttlMs = 5000) {
    setStatus(next);
    if (ttlMs > 0) {
      window.setTimeout(() => {
        setStatus((prev) =>
          prev === next ? { kind: "idle", message: "" } : prev
        );
      }, ttlMs);
    }
  }
  // ---------- End Status Bar ----------

  // ---------- Background handling ----------
  const [bgUrl, setBgUrl] = useState<string>(defaultBg);
  const refreshBg = async () => {
    try {
      const r = await api.bgGet?.();
      setBgUrl(r?.fileUrl || defaultBg);
    } catch {
      setBgUrl(defaultBg);
    }
  };

  useEffect(() => {
    let offConfig: (() => void) | undefined;
    let offMods: (() => void) | undefined;

    (async () => {
      await refreshConfig();
      await refreshMods();
      await refreshBg(); // initial bg fetch on mount

      // watchers arrive in 3C
      offConfig = api.onConfigChanged?.((nextCfg: AppConfig) => {
        setCfg(nextCfg);
        refreshMods();
        refreshBg(); // update background when config changes (e.g., bg set/reset)
      });
      // optional; only fires if main emits mods:changed (safe if undefined)
      offMods = api.onModsChanged?.(() => refreshMods());
    })();

    return () => {
      try {
        offConfig && offConfig();
        offMods && offMods();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshMods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.activeModsPath, cfg.modsVaultPath, cfg.modPlayVaultPath]);

  const pathsOk =
    !!cfg.gameRoot &&
    !!cfg.gameExe &&
    !!cfg.activeModsPath &&
    !!cfg.modsVaultPath &&
    !!cfg.modPlayVaultPath &&
    !!cfg.saveDataPath;

  const canLaunchMod = pathsOk && hasAppliedMods;
  const canLaunchVan = pathsOk && !hasAppliedMods;

  const markAll = (on: boolean) =>
    setMods((m) => m.map((r) => ({ ...r, enabled: on })));

  const toggle = (name: string) =>
    setMods((rows) =>
      rows.map((r) => (r.name === name ? { ...r, enabled: !r.enabled } : r))
    );

  // ---------- Handlers wired to status bar ----------

  const applyMods = async () => {
    try {
      setTempStatus({ kind: "info", message: "Applying mod selection…" }, 0);

      const desired = (mods ?? [])
        .filter((m) => m.enabled)
        .map((m) => m.name);

      const res = await api.reconcileMods(desired); // aligned with preload/main

      if (!res?.ok) {
        setTempStatus({
          kind: "error",
          message: res?.message || "Apply failed.",
        });
      } else {
        setTempStatus({
          kind: "success",
          message: "Mods applied successfully.",
        });
      }

      await refreshMods();
    } catch (e: any) {
      setTempStatus({
        kind: "error",
        message: e?.message || "Unexpected error applying mods.",
      });
    }
  };

  const deleteOne = async (name: string) => {
    const yes = confirm(
      `Permanently delete "${name}" from your computer?\nThis cannot be undone.`
    );
    if (!yes) return;
    const res = await api.deleteMod(name);
    if (!res?.ok) {
      alert(res?.message || "Delete failed - make sure the game is closed.");
    } else {
      await refreshMods();
    }
  };

  const launchModPlay = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      setTempStatus(
        { kind: "info", message: "Preparing Mod Play (mirroring saves…)" },
        0
      );

      const res = await api.launchModPlay();
      if (!res?.ok) {
        setTempStatus({
          kind: "error",
          message: res?.message || "Launch (Mod Play) failed.",
        });
      } else {
        setTempStatus({
          kind: "success",
          message: "Launched Mod Play; saves will mirror back on exit.",
        });
      }
    } catch (e: any) {
      setTempStatus({
        kind: "error",
        message: e?.message || "Unexpected error launching Mod Play.",
      });
    } finally {
      setLaunching(false);
    }
  };

  const launchVanillaPlay = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      setTempStatus(
        { kind: "info", message: "Launching Vanilla Play…" },
        0
      );

      const res = await api.launchVanillaPlay();
      if (!res?.ok) {
        setTempStatus({
          kind: "error",
          message: res?.message || "Launch (Vanilla Play) failed.",
        });
      } else {
        setTempStatus({
          kind: "success",
          message: "Launched Vanilla Play.",
        });
      }
    } catch (e: any) {
      setTempStatus({
        kind: "error",
        message: e?.message || "Unexpected error launching Vanilla Play.",
      });
    } finally {
      setLaunching(false);
    }
  };

  const manualGameDataSave = async () => {
    const ok = confirm(
      "Overwrite Mod Play Vault with current Steam save/config files?\n" +
        "This will REPLACE everything in your Mod Play Vault."
    );
    if (!ok) return;

    try {
      setTempStatus(
        { kind: "info", message: "Saving game data to Mod Play Vault…" },
        0
      );

      const ev = await api.manualGameDataSave();
      if (ev?.error) {
        setTempStatus({
          kind: "error",
          message: `Save failed: ${ev.error}`,
        });
        return;
      }

      const mb = (
        (((ev.bytes ?? 0) / 1024 / 1024) || 0) as number
      ).toFixed(1);

      setTempStatus({
        kind: "success",
        message: `Saved ${ev.files ?? 0} files (${mb} MB) into Mod Play Vault.`,
      });
    } catch (e: any) {
      setTempStatus({
        kind: "error",
        message: e?.message || "Unexpected error saving game data.",
      });
    }
  };

  // ---------- styles ----------
  const card: React.CSSProperties = {
    border: "1px solid #333",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    background: "rgba(0,0,0,0.3)",
  };
  const toolbar: React.CSSProperties = {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    marginBottom: 8,
  };
  const btn: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #666",
    background: "#444",
    color: "#fff",
    cursor: "pointer",
  };
  const zebra = (i: number): React.CSSProperties =>
    i % 2 ? { background: "rgba(255,255,255,0.04)" } : {};
  const launchBtnStyle = (enabled: boolean): React.CSSProperties => ({
    ...btn,
    opacity: enabled ? 1 : 0.35,
    cursor: enabled ? "pointer" : "default",
    background: enabled ? "#444" : "#222",
    borderColor: enabled ? "#666" : "#333",
  });

  // ---------- background wrapper styles ----------
  const appBg: React.CSSProperties = {
    backgroundImage: `url("${bgUrl}")`,
    backgroundSize: "cover", // cover for large images, contain for small
    backgroundPosition: "center center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    minHeight: "100vh",
  };
  const contentLayer: React.CSSProperties = {
    backdropFilter: "blur(2px)",
    background: "rgba(0,0,0,0.35)",
    minHeight: "100vh",
  };

  // ---------- ADVANCED VIEW: full-screen page ----------
  if (showAdvanced) {
    return (
      <div style={appBg}>
        <div className="wrap" style={{ padding: 16, ...contentLayer }}>
          <WindowTitleBar />

          <div
            style={{
              ...card,
              maxWidth: 960,
              marginLeft: "auto",
              marginRight: "auto",
              background: "rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h2 style={{ margin: 0, color: "#fff" }}>Advanced Settings</h2>
              <button
                style={btn}
                onClick={() => setShowAdvanced(false)}
                title="Back to main mod manager"
              >
                ← Back to Mod Manager
              </button>
            </div>

            {AdvancedSettingsMenu ? (
              <AdvancedSettingsMenu />
            ) : (
              <div style={{ color: "#ccc" }}>
                Advanced Settings component not found.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- MAIN VIEW ----------
  return (
    <div style={appBg}>
      <div className="wrap" style={{ padding: 16, ...contentLayer }}>
        <WindowTitleBar />

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: "#7bd17b", marginBottom: 4 }}>
                {cfg.autoDetected
                  ? "Auto-detected defaults where possible."
                  : "No auto-detection captured."}
              </div>
              <div
                style={{
                  color: pathsOk ? "#7bd17b" : "#ff9f9f",
                  marginBottom: 8,
                }}
              >
                {pathsOk
                  ? "Ready: All key paths are set."
                  : "Set all key paths in Advanced Settings before launching."}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.8,
                lineHeight: 1.4,
                marginBottom: 8,
              }}
            >
              <div>
                <strong>Active Mods:</strong>{" "}
                {cfg.activeModsPath || "(not set)"}
              </div>
              <div>
                <strong>Mods Vault:</strong>{" "}
                {cfg.modsVaultPath || "(not set)"}
              </div>
            </div>

            <div style={toolbar}>
              <button
                style={btn}
                onClick={manualGameDataSave}
                title="Copy platform config/save into mod_play_vault now"
              >
                Manual game data save
              </button>
              <button style={btn} onClick={refreshMods} title="Re-scan">
                Refresh
              </button>
              <button style={btn} onClick={() => setShowAdvanced(true)}>
                Advanced Settings
              </button>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #444",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                padding: 8,
                background: "rgba(255,255,255,0.06)",
                borderBottom: "1px solid #3a3a3a",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn} onClick={() => markAll(true)}>
                  All On
                </button>
                <button style={btn} onClick={() => markAll(false)}>
                  All Off
                </button>
              </div>
              <div style={{ color: "#bdbdbd", alignSelf: "center" }}>
                Checked = in game mods; Unchecked + “🗃️ in vault” = installed
                not in use
              </div>
              <div />
            </div>

            {Array.isArray(mods) && mods.length === 0 ? (
              <div style={{ padding: 10, color: "#bdbdbd" }}>
                No mods found. Refresh after adding mods to your Mods Vault or
                Active Mods folder.
              </div>
            ) : (
              (mods ?? []).map((m, i) => (
                <div
                  key={`${m.name}:${m.inVault ? "vault" : "active"}`}
                  style={{
                    ...zebra(i),
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 10px",
                    borderBottom: "1px solid #2f2f2f",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!m.enabled}
                    onChange={() => toggle(m.name)}
                  />
                  <div>{m.name}</div>
                  <div
                    style={{
                      textAlign: "right",
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    {!m.enabled && m.inVault && (
                      <span title="Installed in vault">🗃️ in vault</span>
                    )}
                    <button
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                      title="Delete mod"
                      onClick={() => deleteOne(m.name)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Buttons + status bar in a single row */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 8,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={launchBtnStyle(pathsOk)}
                onClick={applyMods}
                disabled={!pathsOk}
              >
                Apply (no launch)
              </button>
              <button
                style={launchBtnStyle(canLaunchMod)}
                onClick={launchModPlay}
                disabled={!canLaunchMod}
              >
                Launch (Mod Play)
              </button>
              <button
                style={launchBtnStyle(canLaunchVan)}
                onClick={launchVanillaPlay}
                disabled={!canLaunchVan}
              >
                Launch (Vanilla Play)
              </button>
            </div>

            <OperationStatusBar status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
