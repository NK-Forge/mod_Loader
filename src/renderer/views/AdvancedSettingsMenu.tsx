// src/renderer/views/AdvancedSettingsMenu.tsx

import React from "react";
import ManagedPaths from "./ManagedPaths";
import { WatcherEvent } from "../hooks/useVaultWatcher";
import WatcherActivity from "./WatcherActivity";
import BackupRetention from "./BackupRetention";
import { brassButton } from "../../ui/theme";

type Tab = "paths" | "watcher" | "backups" | "about";
type Watcher = {
  events: WatcherEvent[];
  lastEvent: WatcherEvent | null;
  clear: () => void;
};
type Props = {
  watcher: Watcher;
};

// cross-platform basename (handles / and \\)
function basename(p?: string) {
  if (!p) return "";
  return p.replace(/^.*[\\/]/, "");
}

// Imperial-brass themed colors for this screen
const mainTextColor = "#f4e3c0";
const subtextColor = "rgba(244, 227, 192, 0.7)";
const panelBorder = "1px solid rgba(255, 215, 128, 0.35)";
const panelBg = "rgba(0, 0, 0, 0.65)";

// Tabs reuse the global brass button look, with minor tweaks
const tabBase: React.CSSProperties = {
  ...brassButton,
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 13,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  ...tabBase,
  opacity: active ? 1 : 0.7,
  borderColor: active
    ? "rgba(255, 215, 128, 0.95)"
    : "rgba(140, 110, 60, 0.9)",
  boxShadow: active
    ? brassButton.boxShadow
    : "0 0 0 1px rgba(0,0,0,0.9) inset, 0 1px 2px rgba(0,0,0,0.7)",
});

export default function AdvancedSettingsMenu({ watcher }: Props) {
  const [tab, setTab] = React.useState<Tab>("paths");
  const [supportError, setSupportError] = React.useState("");
  const [appVersion, setAppVersion] = React.useState("");

  // Single shared watcher instance for the entire Options screen
  const { lastEvent } = watcher;

  React.useEffect(() => {
    let mounted = true;
    window.api
      .getAppVersion()
      .then((version: string) => {
        if (mounted && version) setAppVersion(version);
      })
      .catch(() => {
        // Leave the version hidden if lookup is unavailable.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const openSupportPage = async () => {
    setSupportError("");
    try {
      const result = await window.api.openSupportPage();
      if (!result?.ok) {
        setSupportError(result?.message || "Unable to open the support page.");
      }
    } catch (error: any) {
      setSupportError(error?.message || "Unable to open the support page.");
    }
  };

  const panelId =
    tab === "paths"
      ? "panel-paths"
      : tab === "watcher"
        ? "panel-watcher"
        : tab === "backups"
          ? "panel-backups"
          : "panel-about";
  const tabId =
    tab === "paths"
      ? "tab-paths"
      : tab === "watcher"
        ? "tab-watcher"
        : tab === "backups"
          ? "tab-backups"
          : "tab-about";

  return (
    // Parent card from App.tsx already provides the brass panel;
    // here we just inherit and apply brass-friendly text colors.
    <div style={{ color: mainTextColor, padding: 8 }}>
      {/* Header + watcher pulse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* DEV-ONLY WATCHER STATUS */}
        {import.meta.env.DEV && (
          <div
            style={{ marginLeft: "auto", fontSize: 12, color: subtextColor }}
            aria-live="polite"
          >
            <span
              title="Watcher heartbeat"
              aria-label={lastEvent ? "Watcher active" : "Watcher idle"}
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: lastEvent
                  ? "#ffd780"
                  : "rgba(140, 110, 60, 0.9)",
                marginRight: 8,
              }}
            />
            {lastEvent
              ? `[${lastEvent.domain}] ${lastEvent.type}${
                  lastEvent.file ? ` – ${basename(lastEvent.file)}` : ""
                }`
              : "watching mods/ & mod_play_vault/…"}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
        role="tablist"
        aria-label="Advanced Settings tabs"
      >
        <button
          role="tab"
          aria-selected={tab === "paths"}
          aria-controls="panel-paths"
          id="tab-paths"
          style={tabStyle(tab === "paths")}
          onClick={() => setTab("paths")}
        >
          Managed Paths
        </button>
        <button
          role="tab"
          aria-selected={tab === "watcher"}
          aria-controls="panel-watcher"
          id="tab-watcher"
          style={tabStyle(tab === "watcher")}
          onClick={() => setTab("watcher")}
        >
          Watcher Activity
        </button>
        <button
          role="tab"
          aria-selected={tab === "backups"}
          aria-controls="panel-backups"
          id="tab-backups"
          style={tabStyle(tab === "backups")}
          onClick={() => setTab("backups")}
        >
          Backup Retention
        </button>
        <button
          role="tab"
          aria-selected={tab === "about"}
          aria-controls="panel-about"
          id="tab-about"
          style={tabStyle(tab === "about")}
          onClick={() => setTab("about")}
        >
          About & Support
        </button>
      </div>

      {/* Panel */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        style={{
          border: panelBorder,
          borderRadius: 12,
          padding: 12,
          background: panelBg,
          color: mainTextColor,
        }}
      >
        {tab === "paths" ? (
          <ManagedPaths />
        ) : tab === "watcher" ? (
          // Pass shared watcher down so WatcherActivity uses the same events
          <WatcherActivity watcher={watcher} />
        ) : tab === "backups" ? (
          <BackupRetention />
        ) : (
          <div style={{ maxWidth: 680 }}>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>
              NK-Forge SM2 Mod Manager
            </h3>
            {appVersion && (
              <div style={{ color: subtextColor, fontSize: 13, marginBottom: 18 }}>
                Version {appVersion}
              </div>
            )}

            <p style={{ margin: "0 0 14px", lineHeight: 1.55 }}>
              The SM2 Mod Manager is built and maintained independently by NK-Forge.
              If it has made modding easier for you and you would like to support
              continued development, contributions are always appreciated and entirely
              optional.
            </p>
            <p
              style={{
                margin: "0 0 16px",
                color: subtextColor,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Support does not affect access to features, updates, or help.
            </p>

            <button
              type="button"
              style={{ ...brassButton, padding: "8px 14px" }}
              onClick={openSupportPage}
              title="Open the official NK-Forge Ko-fi page in your default browser"
            >
              ♥ Support NK-Forge
            </button>

            {supportError && (
              <div
                role="alert"
                style={{ marginTop: 12, color: "#ffb4a8", fontSize: 13 }}
              >
                {supportError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
