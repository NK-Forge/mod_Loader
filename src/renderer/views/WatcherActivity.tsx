import React from "react";

type ActivityItem = {
  id: number;
  timestamp: string;
  message: string;
  kind: "info" | "warning" | "error";
};

const container: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid #333",
  background: "rgba(0,0,0,0.55)",
  padding: 12,
  color: "#e0e0e0",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const headerTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
};

const pill: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.18)",
};

const list: React.CSSProperties = {
  maxHeight: 260,
  overflowY: "auto",
  paddingRight: 4,
  marginTop: 4,
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px 1fr",
  columnGap: 8,
  padding: "4px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  fontSize: 12,
};

const emptyState: React.CSSProperties = {
  padding: "8px 4px",
  fontSize: 12,
  color: "#bdbdbd",
  fontStyle: "italic",
};

export default function WatcherActivity() {
  // For now this is static placeholder data; Phase 5 can wire real events in.
  const [items] = React.useState<ActivityItem[]>([
    {
      id: 1,
      timestamp: "—",
      message:
        "Watcher is idle. When mods or snapshot folders change, events will appear here.",
      kind: "info",
    },
  ]);

  return (
    <div style={container}>
      <div style={headerRow}>
        <div style={headerTitle}>Watcher Activity</div>
        <div style={pill}>watching mods/ &amp; mod_play_vault/ …</div>
      </div>

      <div style={list}>
        {items.length === 0 ? (
          <div style={emptyState}>
            No watcher events yet. Launch Mod Play or change files in your
            managed folders to see activity.
          </div>
        ) : (
          items.map((it) => (
            <div key={it.id} style={row}>
              <div style={{ opacity: 0.75 }}>{it.timestamp}</div>
              <div>{it.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
