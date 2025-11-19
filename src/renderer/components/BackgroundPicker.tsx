import * as React from "react";

export default function BackgroundPicker() {
  const api = (window as any).api; // ← relax typing just for this component
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");

  async function chooseAndSet() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const pick = await api.bgChoose();
      if (!pick?.ok || pick?.canceled) return;
      const res = await api.bgSet(pick.path);
      if (!res?.ok) setMsg(res?.message || "Failed to set background");
      else setMsg("✅ Background updated.");
    } catch (err: any) {
      setMsg(err?.message || "Error selecting image");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await api.bgReset();
      if (!res?.ok) setMsg(res?.message || "Failed to reset background");
      else setMsg("↩️ Background reset to default.");
    } catch (err: any) {
      setMsg(err?.message || "Error resetting background");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        onClick={chooseAndSet}
        disabled={busy}
        aria-label="Choose custom background image"
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #666",
          background: busy ? "#333" : "#444",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Working…" : "Choose Image…"}
      </button>
      <button
        onClick={reset}
        disabled={busy}
        title="Revert to built-in default background"
        aria-label="Reset background to default"
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid #666",
          background: busy ? "#333" : "#444",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
        }}
      >
        Reset
      </button>
      {msg && (
        <span
          style={{
            fontSize: 12,
            opacity: 0.8,
            color: msg.startsWith("✅") ? "#7bd17b" : "#ccc",
          }}
          aria-live="polite"
        >
          {msg}
        </span>
      )}
    </div>
  );
}
