import React from "react";
import { useImmutablePaths } from "../state/config";

export default function ManagedPaths({ theme = "dark" }: { theme?: "light" | "dark" }) {
  const paths = useImmutablePaths();
  const dark = theme === "dark";

  const colors = {
    text: dark ? "#e5e5e5" : "#222",
    label: dark ? "#bbb" : "#555",
    border: dark ? "#333" : "#ddd",
    bg: dark ? "#1c1c1c" : "#fff",
    btnBg: dark ? "#333" : "#f2f2f2",
    btnHover: dark ? "#444" : "#e0e0e0",
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "220px 1fr auto",
    alignItems: "center",
    gap: 8,
    padding: "10px 6px",
    borderBottom: `1px solid ${colors.border}`,
    background: colors.bg,
  };

  const btn: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.btnBg,
    color: colors.text,
    cursor: "pointer",
  };

  const onReveal = async (p: string) => {
    try {
      const api = (window as any).api;
      await api.revealPath(p);
    } catch {
      alert("Could not open folder.");
    }
  };

  const Row = ({ label, path }: { label: string; path: string }) => (
    <div style={rowStyle}>
      <div style={{ color: colors.label }}>{label}</div>
      <div
        title={path}
        style={{
          fontFamily: "monospace",
          fontSize: 13,
          color: colors.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {path || "—"}
      </div>
      <button onClick={() => onReveal(path)} style={btn}>
        Reveal
      </button>
    </div>
  );

  return (
    <div>
      <h3 style={{ margin: "4px 0 10px", fontWeight: 600, color: colors.text }}>
        Managed Paths (read-only)
      </h3>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10 }}>
        <Row label="Mod Play Vault" path={paths.modPlayVault} />
        <Row label="Mods Vault" path={paths.modsVault} />
        <Row label="Config Root" path={paths.configRoot} />
        <Row label="Logs Root" path={paths.logsRoot} />
      </div>
      <div
        style={{
          fontSize: 12,
          color: colors.label,
          marginTop: 6,
        }}
      >
        All paths are set by the setup wizard and cannot be edited here.
      </div>
    </div>
  );
}
