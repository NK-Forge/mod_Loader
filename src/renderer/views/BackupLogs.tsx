// src/views/BackupLogs.tsx
// Keeping in case we want to show backup logs in the future.

import React from "react";
import { useImmutablePaths } from "../state/config";
import { BrassButton } from "../../ui/BrassButton";

type Theme = "light" | "dark";

type CopyEvent = {
  ts: string;
  src: string;
  dest: string;
  files: number;
  bytes: number;
  ms: number;
  result: "ok" | "error";
};

export default function BackupLogs({ theme = "dark" }: { theme?: Theme }) {
  const { modPlayVaultPath } = useImmutablePaths();
  const vaultRoot = modPlayVaultPath;
  const api = (window as any).api;

  const dark = theme === "dark";
  const colors = {
    text: dark ? "#e5e5e5" : "#222",
    sub: dark ? "#a6a6a6" : "#555",
    border: dark ? "#333" : "#ddd",
    panel: dark ? "#1f1f1f" : "#fff",
    head: dark ? "#2a2a2a" : "#f7f7f7",
    zebra: dark ? "rgba(255,255,255,0.04)" : "#fafafa",
    ok: dark ? "#71d18a" : "#1a7f37",
    err: dark ? "#ff8a8a" : "#b00020",
    btnBg: dark ? "#2f2f2f" : "#f2f2f2",
    btnHover: dark ? "#3a3a3a" : "#e7e7e7",
  };

  const [rows, setRows] = React.useState<CopyEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.listCopyEvents(vaultRoot, 14);
        if (alive) setRows(data);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load log");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [vaultRoot]);

  const onRevealDest = async () => {
    try {
      await api.revealPath(vaultRoot);
    } catch {}
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    background: colors.head,
    color: colors.text,
    borderBottom: `1px solid ${colors.border}`,
    fontWeight: 600,
    fontSize: 13,
  };
  const td: React.CSSProperties = {
    padding: "8px 10px",
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 13,
    color: colors.text,
  };
  const btn: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.btnBg,
    color: colors.text,
    cursor: "pointer",
  };
  const zebra = (i: number): React.CSSProperties =>
    i % 2 ? { background: colors.zebra } : {};

  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    const k = 1024;
    const units = ["KB", "MB", "GB", "TB"];
    const i = Math.min(units.length, Math.floor(Math.log(n) / Math.log(k)));
    const val = n / Math.pow(k, i);
    return `${val.toFixed(1)} ${units[i - 1]}`;
  };

  const fmtDur = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontWeight: 600, color: colors.text }}>
        Backup Logs (last 14 days)
      </h3>
      <div style={{ color: colors.sub, marginBottom: 10, fontSize: 12 }}>
        Copy events from the platform config/save folder into the Mod Play Vault after modded sessions.
      </div>

      {loading && <div style={{ color: colors.sub }}>Loading…</div>}
      {error && <div style={{ color: colors.err }}>{error}</div>}

      {!loading && !error && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            overflow: "hidden",
            background: colors.panel,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Timestamp</th>
                <th style={th}>Files</th>
                <th style={th}>Bytes</th>
                <th style={th}>Duration</th>
                <th style={th}>Result</th>
                <th style={th}>Dest</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: "center", color: colors.sub }}>
                    No entries in the last 14 days.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.ts}-${i}`} style={zebra(i)}>
                    <td style={td}>{new Date(r.ts).toLocaleString()}</td>
                    <td style={td}>{r.files}</td>
                    <td style={td}>{fmtBytes(r.bytes)}</td>
                    <td style={td}>{fmtDur(r.ms)}</td>
                    <td style={{ ...td, color: r.result === "ok" ? colors.ok : colors.err }}>
                      {r.result}
                    </td>
                    <td style={td}>
                      <BrassButton onClick={onRevealDest}>Reveal Dest</BrassButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
