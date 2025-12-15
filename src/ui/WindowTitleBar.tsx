import React from "react";

export function WindowTitleBar() {
  const api = (window as any).api;

  const handleMinimize = () => {
    api?.windowMinimize?.();
  };

  const handleToggleMaximize = () => {
    api?.windowToggleMaximize?.();
  };

  const handleClose = () => {
    api?.windowClose?.();
  };

  return (
    <div
      style={
        {
          height: 32,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          WebkitAppRegion: "drag", // whole bar draggable...
          userSelect: "none",
          marginBottom: 8,
        } as React.CSSProperties
      }
    >
      {/* ===== Centered title ===== */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 14,
          fontWeight: 600,
          color: "#e3e3e3",
          pointerEvents: "none", // title must not block dragging
        }}
      >
        NK-Forge SM2 Mod Manager
      </div>

      {/* Right-side window controls */}
      <div
        style={
          {
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
    </div>
      {/* Right-side controls (Windows order, Mac colors) */}
      <div
        style={
          {
            display: "flex",
            gap: 8,
            WebkitAppRegion: "no-drag", // buttons must NOT be draggable
          } as React.CSSProperties
        }
      >
        {/* Minimize (yellow) with "v" */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "1px solid #7a5b1a",
            background: "#febc2e",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontSize: 10,
              lineHeight: 1,
              color: "#5a3d00",
              fontWeight: 700,
            }}
          >
            v
          </span>
        </button>

        {/* Maximize (green) with "^" */}
        <button
          onClick={handleToggleMaximize}
          title="Maximize / Restore"
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "1px solid #1f6b2d",
            background: "#28c840",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontSize: 10,
              lineHeight: 1,
              color: "#0b3b12",
              fontWeight: 700,
            }}
          >
            ^
          </span>
        </button>

        {/* Close (red) with skull */}
        <button
          onClick={handleClose}
          title="Close"
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: "1px solid #7a2520",
            background: "#ff5f57",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontSize: 11,
              lineHeight: 1,
              color: "#3b0000",
            }}
          >
            💀
          </span>
        </button>
      </div>
    </div>
  );
}
