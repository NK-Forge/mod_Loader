import React from "react";
import ManagedPaths from "./ManagedPaths";
import BackgroundPicker from "../components/BackgroundPicker";
import { useVaultWatcher } from "../hooks/useVaultWatcher";
import WatcherActivity from "./WatcherActivity";

type Tab = "paths" | "watcher";

// cross-platform basename (handles / and \)
function basename(p?: string) {
  if (!p) return "";
  return p.replace(/^.*[\\/]/, "");
}

export default function AdvancedSettingsMenu() {
  const [tab, setTab] = React.useState<Tab>("paths");
  const { lastEvent } = useVaultWatcher();

  const isDark = true;
  const colors = {
    bg: isDark ? "#1a1a1a" : "#b9b9b9ff",
    panel: isDark ? "#222" : "#fdfdfd",
    text: isDark ? "#e5e5e5" : "#222",
    subtext: isDark ? "#999" : "#555",
    border: isDark ? "#333" : "#ddd",
    active: isDark ? "#2a2a2a" : "#eee",
    accent: "#00c4b3",
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${active ? colors.accent : colors.border}`,
    background: active ? colors.active : "transparent",
    color: active ? colors.accent : colors.text,
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ color: colors.text, background: colors.bg, padding: 8 }}>
      {/* Header + watcher pulse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>Advanced Settings</div>
        <div
          style={{ marginLeft: "auto", fontSize: 12, color: colors.subtext }}
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
              background: lastEvent ? colors.accent : colors.border,
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
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 12,
          background: colors.panel,
          color: colors.text,
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
                borderTop: `1px solid ${colors.border}`,
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
                  color: colors.subtext,
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

      {/* Mirror-only footnote */}
      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          color: colors.subtext,
          lineHeight: 1.4,
        }}
      >
        <strong>Mirror-only behavior:</strong> If <code>Mods/</code> is empty →
        Vanilla Play (no save touches). If populated → Mod Play: pre-launch
        mirrors <code>mod_play_vault → config</code> (when vault has data), and
        on exit mirrors <code>config → mod_play_vault</code>.
      </div>
    </div>
  );
}
