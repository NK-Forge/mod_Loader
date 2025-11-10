/**
 * @file App.tsx
 * @project Space Marine 2 Mod Loader
 * @phase 3A — Path Integration
 * @description
 *  Renderer root for the main application UI.
 *  - Loads configuration from main via preload bridge.
 *  - Subscribes to `config:changed` and `mods:changed` to keep UI in sync.
 *  - Merges and displays a list of mods from Active + Vault.
 *  - Provides basic Apply/Launch/Manual Save actions (Phase 3A-safe).
 *
 * @developer-notes
 *  - All main-process interactions go through `window.api` (preload).
 *  - This component is resilient to partial/invalid data from IPC:
 *      • `refreshMods` coerces non-array responses into an empty array.
 *      • Row keys are stable across renders: `${name}:${inVault?'vault':'active'}`.
 */

import React, { useEffect, useState } from "react";
import AdvancedSettingsMenu from "../renderer/views/AdvancedSettingsMenu";

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
};

type ModRow = { name: string; enabled: boolean; inVault: boolean };

export default function App() {
  const api = (window as any).api;

  /** ------------------------------
   *  Local state
   * ------------------------------ */
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

  /** ------------------------------
   *  Config handling
   * ------------------------------ */

  /**
   * Fetch the latest config snapshot from main.
   */
  const refreshConfig = async () => {
    const next = await api.getConfig();
    setCfg(next);
  };

  /** ------------------------------
   *  Mods handling
   * ------------------------------ */

  /**
   * Refresh mod rows from main (merged Active + Vault).
   * Coerces unexpected IPC results to a safe empty array.
   */
  const refreshMods = async () => {
    try {
      const r = await api.listModsBoth();
      const rows: ModRow[] = Array.isArray(r)
        ? r.map((m) => ({
            name: String(m?.name ?? ""),
            enabled: !!m?.enabled,
            inVault: !!m?.inVault,
          }))
        : [];
      setMods(rows);
    } catch (err) {
      console.warn("mods refresh failed:", err);
      setMods([]);
    }
  };

  /**
   * Subscribe to config + mods change events.
   * Starts a lightweight watcher (Phase 3A) and cleans up on unmount.
   */
  useEffect(() => {
    let offConfig: (() => void) | undefined;
    let offMods: (() => void) | undefined;

    (async () => {
      await refreshConfig();
      await refreshMods();
      await api.startModsWatch?.();

      offConfig = api.onConfigChanged?.((nextCfg: AppConfig) => {
        setCfg(nextCfg);
        // Paths change → ensure we rescan immediately
        refreshMods();
      });

      offMods = api.onModsChanged?.(() => {
        // Debounced in main; safe to rescan directly
        refreshMods();
      });
    })();

    return () => {
      try {
        offConfig && offConfig();
        offMods && offMods();
        api.stopModsWatch?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * If either path changes (wizard/migration), rescan.
   * This covers initial load and any subsequent path edits.
   */
  useEffect(() => {
    refreshMods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.activeModsPath, cfg.modsVaultPath]);

  /** ------------------------------
   *  Derived flags
   * ------------------------------ */
  const pathsOk =
    !!cfg.gameRoot &&
    !!cfg.gameExe &&
    !!cfg.activeModsPath &&
    !!cfg.modsVaultPath &&
    !!cfg.modPlayVaultPath &&
    !!cfg.saveDataPath;

  /** ------------------------------
   *  UI actions
   * ------------------------------ */
  const markAll = (on: boolean) =>
    setMods((m) => m.map((r) => ({ ...r, enabled: on })));

  const toggle = (name: string) =>
    setMods((rows) =>
      rows.map((r) => (r.name === name ? { ...r, enabled: !r.enabled } : r))
    );

  const applyMods = async () => {
    const enabled = mods.filter((m) => m.enabled).map((m) => m.name);
    await api.applyMods(enabled);
    await refreshMods();
  };

  const launchTracked = async () => {
    const enabled = mods.filter((m) => m.enabled).map((m) => m.name);
    await api.launchWithModsTracked(enabled);
    await refreshMods();
  };

  const manualGameDataSave = async () => {
    const ev = await api.manualGameDataSave();
    alert(
      `Saved ${ev.files} files (${(ev.bytes / 1024 / 1024).toFixed(
        1
      )} MB) to mod_play_vault.`
    );
  };

  /** ------------------------------
   *  Inline styles (keep minimal)
   * ------------------------------ */
  const card: React.CSSProperties = {
    border: "1px solid #333",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
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

  /** ------------------------------
   *  Render
   * ------------------------------ */
  return (
    <div className="wrap" style={{ padding: 16 }}>
      <h1>WH40K Mod Manager</h1>

      {/* TOP CARD — Mods list with watchers + merged scan */}
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

          <div style={toolbar}>
            <button
              style={btn}
              onClick={manualGameDataSave}
              title="Copy platform config/save into mod_play_vault now"
            >
              Manual game data save
            </button>
            <button
              style={btn}
              onClick={refreshMods}
              title="Re-scan Active Mods + Mods Vault"
            >
              Refresh
            </button>
            <button style={btn} onClick={() => setShowAdvanced(true)}>
              Advanced Settings
            </button>
          </div>
        </div>

        {/* Mods table (zebra rows) */}
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
              Checked = in game mods; Unchecked + “🗃️ in vault” = installed not
              in use
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
                <div style={{ textAlign: "right" }}>
                  {!m.enabled && m.inVault && (
                    <span title="Installed in vault">🗃️ in vault</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={btn} onClick={applyMods} disabled={!pathsOk}>
            Apply (no launch)
          </button>
          <button style={btn} onClick={launchTracked} disabled={!pathsOk}>
            Launch (Tracked)
          </button>
        </div>
      </div>

      {/* Advanced Settings modal */}
      {showAdvanced && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowAdvanced(false)}
        >
          <div
            style={{
              width: "90vw",
              maxWidth: 900,
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <h2 style={{ margin: 0, color: "#111" }}>Advanced Settings</h2>
              <button onClick={() => setShowAdvanced(false)}>Close</button>
            </div>
            <AdvancedSettingsMenu />
          </div>
        </div>
      )}
    </div>
  );
}
