import React from "react";
import ManagedPaths from "./ManagedPaths";
import BackupLogs from "./BackupLogs";

type Tab = "paths" | "logs";

export default function AdvancedSettingsMenu() {
  const [tab, setTab] = React.useState<Tab>("paths");

  const isDark = true; // Force dark mode style
  const colors = {
    bg: isDark ? "#1a1a1a" : "#fff",
    panel: isDark ? "#222" : "#fdfdfd",
    text: isDark ? "#e5e5e5" : "#222",
    subtext: isDark ? "#999" : "#555",
    border: isDark ? "#333" : "#ddd",
    active: isDark ? "#2a2a2a" : "#eee",
    accent: "#00c4b3", // NK Forge teal/cyan tone
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
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={tabStyle(tab === "paths")} onClick={() => setTab("paths")}>
          Managed Paths
        </button>
        <button style={tabStyle(tab === "logs")} onClick={() => setTab("logs")}>
          Backup Logs
        </button>
      </div>

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 12,
          background: colors.panel,
          color: colors.text,
        }}
      >
        {tab === "paths" ? <ManagedPaths theme="dark" /> : <BackupLogs theme="dark" />}
      </div>
    </div>
  );
}
