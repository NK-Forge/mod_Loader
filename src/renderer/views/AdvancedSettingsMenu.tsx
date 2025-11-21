import React from "react";
import ManagedPaths from "./ManagedPaths";
import BackgroundPicker from "../components/BackgroundPicker";
import { useVaultWatcher } from "../hooks/useVaultWatcher";
import WatcherActivity from "./WatcherActivity";
import { brassButton } from "../../ui/theme";

type Tab = "paths" | "watcher";

// cross-platform basename (handles / and \)
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

export default function AdvancedSettingsMenu() {
  const [tab, setTab] = React.useState<Tab>("paths");
  const { lastEvent } = useVaultWatcher();

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
        <div style={{ fontSize: 16, fontWeight: 600 }}>Options</div>
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
      </div>

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
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
      </div>

      {/* Panel */}
      <div
        id={tab === "paths" ? "panel-paths" : "panel-watcher"}
        role="tabpanel"
        aria-labelledby={tab === "paths" ? "tab-paths" : "tab-watcher"}
        style={{
          border: panelBorder,
          borderRadius: 12,
          padding: 12,
          background: panelBg,
          color: mainTextColor,
        }}
      >
        {tab === "paths" ? (
          <>
            <ManagedPaths />

            {/* Background Picker section */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: panelBorder,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Main Background
              </div>
              <BackgroundPicker />
              <div
                style={{
                  fontSize: 12,
                  color: subtextColor,
                  marginTop: 6,
                }}
              >
                Accepted: .jpg, .jpeg, .png, .webp. Large images will be scaled
                to fit. Reset reverts to the default Space Marine themed image.
              </div>
            </div>
          </>
        ) : (
          <WatcherActivity />
        )}
      </div>
    </div>
  );
}
