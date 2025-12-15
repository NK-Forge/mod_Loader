// src/renderer/ui/theme.ts
import type React from "react";

export const brassGradient =
  "linear-gradient(135deg, #634521 0%, #3f2a13 45%, #22130a 100%)";

export const brassCard: React.CSSProperties = {
  border: "1px solid rgba(255, 215, 128, 0.35)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "rgba(6, 4, 2, 0.88)",
  boxShadow:
    "0 0 28px rgba(0,0,0,0.9), 0 0 18px rgba(255,215,128,0.16)",
};

export const brassButton: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255, 215, 128, 0.7)",
  background: brassGradient,
  color: "#f7e2b5",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9) inset, 0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(255,215,128,0.28)",
  textShadow: "0 1px 1px #000",
  transition:
    "transform 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out, opacity 120ms ease-out",
};

export const brassButtonBase: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  // 🔽 use explicit border pieces instead of `border`
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255, 215, 128, 0.7)",
  background: brassGradient,
  color: "#f7e2b5",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9) inset, 0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(255,215,128,0.28)",
  textShadow: "0 1px 1px #000",
  transition:
    "transform 120ms ease-out, box-shadow 120ms ease-out, border-color 120ms ease-out, opacity 120ms ease-out",
};

export const brassButtonActive: React.CSSProperties = {
  transform: "translateY(1px)",
  opacity: 0.85,
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.9) inset, 0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(255,215,128,0.18)",
  // 🔽 only override the color, consistent with base
  borderColor: "rgba(255, 215, 128, 0.45)",
};


export const brassLaunchButton = (
  enabled: boolean
): React.CSSProperties => ({
  ...brassButton,
  opacity: enabled ? 1 : 0.45,
  cursor: enabled ? "pointer" : "default",
  background: enabled
    ? brassGradient
    : "linear-gradient(135deg, #3b2a16 0%, #26180e 45%, #140b06 100%)",
  borderColor: enabled
    ? "rgba(255, 215, 128, 0.9)"
    : "rgba(140, 110, 60, 0.8)",
  boxShadow: enabled
    ? brassButton.boxShadow
    : "0 0 0 1px rgba(0,0,0,0.9) inset, 0 1px 2px rgba(0,0,0,0.8)",
});

export const zebraRow = (i: number): React.CSSProperties =>
  i % 2
    ? { background: "rgba(255, 215, 128, 0.03)" }
    : { background: "rgba(0, 0, 0, 0.20)" };

// Optional helpers for labels/inner sections if you want them elsewhere
export const brassInnerSection: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255, 215, 128, 0.25)",
  padding: 12,
  background: "rgba(0,0,0,0.6)",
  marginTop: 12,
};

export const brassLabel: React.CSSProperties = {
  fontSize: 13,
  color: "#f4e3c0",
  marginBottom: 4,
};
