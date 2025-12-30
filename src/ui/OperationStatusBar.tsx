// src/ui/OperationStatusBar.tsx

import React from "react";

export type OperationStatusKind = "idle" | "info" | "success" | "error";

export interface OperationStatus {
  kind: OperationStatusKind;
  message: string;
}

interface Props {
  status: OperationStatus;
}

export function OperationStatusBar({ status }: Props) {
  if (!status.message) return null;

  const { kind, message } = status;

  const bg =
    kind === "error"
      ? "rgba(180, 0, 0, 0.45)"
      : kind === "success"
      ? "rgba(0, 120, 0, 0.45)"
      : "rgba(0, 0, 0, 0.35)";

  const border =
    kind === "error"
      ? "rgba(255, 120, 120, 0.8)"
      : kind === "success"
      ? "rgba(120, 255, 160, 0.8)"
      : "rgba(255, 255, 255, 0.25)";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        marginLeft: 12,
        padding: "6px 10px",
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        color: "#f5f5f5",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={message}
      >
        {message}
      </div>
      {(kind === "info" || kind === "success") && (
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.75)",
            borderTopColor: "transparent",
            animation: kind === "info" ? "spin 0.8s linear infinite" : "none",
          }}
        />
      )}
    </div>
  );
}
