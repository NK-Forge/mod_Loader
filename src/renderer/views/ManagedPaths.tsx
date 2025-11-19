import React from "react";
import { useImmutablePaths } from "../state/config";

export default function ManagedPaths() {
  const { modsVaultPath, modPlayVaultPath } = useImmutablePaths();
  const api = (window as any).api;

  // Read-only path input style: soft grey + subtle glow
  const ro: React.CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #6b5a2a",
    background: "#262626",
    color: "#e0e0e0",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxShadow: "0 0 6px rgba(255, 220, 120, 0.25)", // subtle golden glow
  };

  const row: React.CSSProperties = { marginBottom: 16 };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 600,
    marginBottom: 4,
    color: "#f0f0f0",
  };

  const hintStyle: React.CSSProperties = {
    color: "#bdbdbd",
    fontSize: 12,
    marginTop: 4,
    display: "block",
  };

  const revealBtn: React.CSSProperties = {
    flexShrink: 0,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid #c9a24d",
    background: "linear-gradient(135deg, #3a2f18, #1f1a10)",
    color: "#f8e6a0",
    cursor: "pointer",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 0 4px rgba(255, 210, 90, 0.4)",
  };

  const handleReveal = (target?: string | null) => {
    if (!target) return;
    // uses the generic invoke exposed from preload -> ipcMain.handle('paths:reveal', ...)
    api?.invoke?.("paths:reveal", target);
  };

  return (
    <div>
      <div style={row}>
        <label style={labelStyle}>Mods Vault (managed by app)</label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={modsVaultPath || "(unset)"}
            readOnly
            style={ro}
          />
          <button
            type="button"
            style={revealBtn}
            onClick={() => handleReveal(modsVaultPath)}
            title="Reveal in Explorer"
          >
            📁
          </button>
        </div>

        <small style={hintStyle}>
          Immutable path where inactive mods are stored.
        </small>
      </div>

      <div style={row}>
        <label style={labelStyle}>Mod Play Vault (snapshots, ops)</label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={modPlayVaultPath || "(unset)"}
            readOnly
            style={ro}
          />
          <button
            type="button"
            style={revealBtn}
            onClick={() => handleReveal(modPlayVaultPath)}
            title="Reveal in Explorer"
          >
            📁
          </button>
        </div>

        <small style={hintStyle}>
          Immutable path for save/config snapshots.
        </small>
      </div>
    </div>
  );
}
