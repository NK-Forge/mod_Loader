// src/renderer/views/WatcherActivity.tsx
import * as React from "react";
import type { WatcherEvent } from "../hooks/useVaultWatcher";
import { brassCard } from "../../ui/theme";

function formatTs(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

type WatcherProps = {
  watcher: {
    events: WatcherEvent[];
    clear: () => void;
  };
};

export default function WatcherActivity({ watcher }: WatcherProps) {
  // If a watcher instance is passed from parent, use it.
  // Otherwise, fall back to creating our own (keeps this component reusable).
  const { events, clear } = watcher;

  const zebra = (i: number): React.CSSProperties =>
    i % 2 === 0
      ? { background: "rgba(255,255,255,0.03)" }
      : { background: "rgba(0,0,0,0.25)" };

  return (
    <div style={{ ...brassCard, padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 8,
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 600 }}>Watcher Activity</div>
        <button
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 999,
            border: "1px solid #6c5b39",
            background:
              "radial-gradient(circle at 30% 0%, #78613d, #4a3a22)",
            color: "#f9e4b5",
            cursor: "pointer",
          }}
          onClick={clear}
        >
          Clear
        </button>
      </div>

      {events.length === 0 ? (
        <div
          style={{
            padding: 10,
            fontSize: 13,
            color: "#c0c0c0",
            fontStyle: "italic",
          }}
        >
          No watcher events yet. Launch Mod Play or modify files in your
          watched folders.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #3a3a3a",
            borderRadius: 6,
            overflow: "hidden",
            fontSize: 12,
          }}
        >
          {events.map((ev: WatcherEvent, i) => (
            <div
              key={`${ev.ts}:${i}:${ev.domain}:${ev.type}`}
              style={{
                ...zebra(i),
                display: "grid",
                gridTemplateColumns: "90px 80px 1fr",
                gap: 6,
                padding: "4px 8px",
              }}
            >
              <div>{formatTs(ev.ts)}</div>
              <div>[{ev.domain}]</div>
              <div>
                {ev.type}
                {ev.file && (
                  <>
                    {" – "}
                    <span title={ev.file}>
                      {ev.file.replace(/^.*[\\/]/, "")}
                    </span>
                  </>
                )}
                {ev.detail && <> – {ev.detail}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
