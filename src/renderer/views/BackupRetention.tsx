import React from "react";

const DEFAULT_RETENTION = 3;
const MIN_RETENTION = 1;
const MAX_RETENTION = 10;

const mainTextColor = "#f4e3c0";
const subtextColor = "rgba(244, 227, 192, 0.7)";

function clampRetention(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_RETENTION;
  return Math.min(MAX_RETENTION, Math.max(MIN_RETENTION, Math.trunc(numeric)));
}

export default function BackupRetention() {
  const [retention, setRetention] = React.useState(DEFAULT_RETENTION);
  const [savedRetention, setSavedRetention] = React.useState(DEFAULT_RETENTION);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let mounted = true;

    window.api
      .getConfig()
      .then((config) => {
        if (!mounted) return;
        const value = clampRetention(config.maxPreReconcileBackups);
        setRetention(value);
        setSavedRetention(value);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err?.message || "Unable to load backup retention setting.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateRetention = async (nextValue: number) => {
    const next = clampRetention(nextValue);
    setRetention(next);
    setError("");

    try {
      const result = await window.api.setConfig({
        maxPreReconcileBackups: next,
      });

      if (!result?.ok) {
        throw new Error(result?.message || "Unable to save backup retention setting.");
      }

      setSavedRetention(next);
    } catch (err: any) {
      setRetention(savedRetention);
      setError(err?.message || "Unable to save backup retention setting.");
    }
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Pre-Reconcile Backups</h3>

      <p style={{ margin: "0 0 16px", lineHeight: 1.55 }}>
        Choose how many automatic snapshots the Mod Manager keeps before reconciling
        your active mods. Older generated snapshots are removed after a successful
        new backup is created.
      </p>

      <div
        style={{
          border: "1px solid rgba(255, 215, 128, 0.22)",
          borderRadius: 10,
          padding: "14px 16px",
          background: "rgba(255, 215, 128, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <label htmlFor="backup-retention-slider" style={{ fontWeight: 600 }}>
            Backups to keep
          </label>
          <strong
            style={{
              color: mainTextColor,
              fontSize: 18,
              minWidth: 24,
              textAlign: "right",
            }}
          >
            {retention}
          </strong>
        </div>

        <input
          id="backup-retention-slider"
          type="range"
          min={MIN_RETENTION}
          max={MAX_RETENTION}
          step={1}
          value={retention}
          disabled={loading}
          onChange={(event) => updateRetention(Number(event.target.value))}
          aria-valuemin={MIN_RETENTION}
          aria-valuemax={MAX_RETENTION}
          aria-valuenow={retention}
          aria-label="Number of pre-reconcile backups to keep"
          style={{
            width: "100%",
            cursor: loading ? "wait" : "pointer",
            accentColor: "#c9a24d",
          }}
        />

        <div
          aria-hidden="true"
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: subtextColor,
            fontSize: 12,
            marginTop: 4,
          }}
        >
          <span>{MIN_RETENTION}</span>
          <span>{MAX_RETENTION}</span>
        </div>

        <p
          style={{
            margin: "12px 0 0",
            color: subtextColor,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Each snapshot may consume several GB depending on your active mod data.
          Higher values provide more rollback points but can use significant disk
          space. The default is {DEFAULT_RETENTION}.
        </p>

        {error && (
          <div
            role="alert"
            style={{ marginTop: 10, color: "#ffb4a8", fontSize: 13 }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
