import React from "react";
import { useImmutablePaths } from "../state/config";

export default function ManagedPaths() {
  const { modsVaultPath, modPlayVaultPath } = useImmutablePaths();

  const ro: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #ccc",
    background: "#f5f5f5",
    color: "#222",
  };

  const row: React.CSSProperties = { marginBottom: 12 };

  return (
    <div>
      <div style={row}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Mods Vault (managed by app)
        </label>
        <input value={modsVaultPath || "(unset)"} readOnly style={ro} />
        <small>
          Immutable path where inactive mods are stored.
        </small>
      </div>

      <div style={row}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Mod Play Vault (snapshots, ops)
        </label>
        <input value={modPlayVaultPath || "(unset)"} readOnly style={ro} />
        <small>
          Immutable path for save/config snapshots.
        </small>
      </div>
    </div>
  );
}
