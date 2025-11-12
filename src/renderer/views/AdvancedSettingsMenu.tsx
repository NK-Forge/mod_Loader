import React from "react";
import ManagedPaths from "./ManagedPaths";
import BackupLogs from "./BackupLogs";
import { useVaultWatcher } from "../hooks/useVaultWatcher";

type Tab = "paths" | "logs";

export default function AdvancedSettingsMenu() {
  const [tab, setTab] = React.useState<Tab>("paths");
  const { lastEvent } = useVaultWatcher();

  const isDark = true; // Force dark mode style
  const colors = {
    bg: isDark ? "#1a1a1a" : "#fff",
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
      {/* Header with watcher pulse */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Advanced Settings</div>

        <div style={{ marginLeft: "auto", fontSize: 12, color: colors.subtext }}>
          <span
            title="Watcher heartbeat"
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
                lastEvent.file ? ` – ${lastEvent.file.split("/").pop()}` : ""
              }`
            : "watching mods/ & mod_play_vault/…"}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={tabStyle(tab === "paths")} onClick={() => setTab("paths")}>
          Managed Paths
        </button>
        <button style={tabStyle(tab === "logs")} onClick={() => setTab("logs")}>
          Logs
        </button>
      </div>

      {/* Panel */}
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 12,
          background: colors.panel,
          color: colors.text,
        }}
      >
        {tab === "paths" ? <ManagedPaths /> : <BackupLogs />}
      </div>

      {/* Footnote (Phase 3C mirror-only contract) */}
      <div style={{ marginTop: 10, fontSize: 12, color: colors.subtext, lineHeight: 1.4 }}>
        <strong>Mirror-only behavior:</strong> If <code>Mods/</code> is empty → Vanilla Play (we don’t touch saves).
        If populated → Mod Play: pre-launch mirrors <code>mod_play_vault → config</code> (when vault has data), and on
        exit mirrors <code>config → mod_play_vault</code>.
      </div>
    </div>
  );
}
