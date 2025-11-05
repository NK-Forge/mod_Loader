// src/ui/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import SetupWizard from "./SetupWizard";

type InstallStrategy = "hardlink" | "symlink" | "copy";
type AppConfig = {
  setupComplete: boolean;
  autoDetected: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
};

type ModInfo = { name: string; inMods: boolean; inVault: boolean };

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const enabledList = useMemo(
    () => Object.keys(checked).filter((k) => checked[k]),
    [checked]
  );

  const refreshMods = async () => {
    const items = await window.api.modsScan();
    setMods(items);
    setChecked(Object.fromEntries(items.map(m => [m.name, !!m.inMods])));
  };

  useEffect(() => {
    (async () => {
      const c = await window.api.getConfig();
      setCfg(c);
      if (c?.setupComplete) await refreshMods();
    })();
  }, []);

  if (!cfg) return <div style={{ padding: 16 }}>Loading…</div>;

  if (!cfg.setupComplete) {
    return (
      <SetupWizard
        onDone={async () => {
          const c = await window.api.getConfig();
          setCfg(c);
          await refreshMods();
        }}
      />
    );
  }

  // --- UI handlers ---
  const browseInto = async (field: keyof AppConfig) => {
    const p = await window.api.browseFolder();
    if (!p) return;
    setCfg(prev => (prev ? { ...prev, [field]: p } : prev));
  };

  const saveConfig = async () => {
    if (!cfg) return;
    await window.api.setConfig(cfg);
    await refreshMods();
    alert("Config saved.");
  };

  const toggle = async (name: string) => {
    const next = !checked[name];
    setChecked(prev => ({ ...prev, [name]: next })); // optimistic
    try {
      if (next) {
        // enabling requires mod to be in vault; installs into mods
        await window.api.enableMod(name);
      } else {
        // disabling: ensure vault copy, then remove from mods
        await window.api.disableMod(name);
      }
    } catch (err: any) {
      alert(err?.message ?? String(err));
      setChecked(prev => ({ ...prev, [name]: !next })); // revert
    } finally {
      await refreshMods();
    }
  };

  const markAll = async (val: boolean) => {
    // Bulk enable/disable using per-mod rules
    for (const m of mods) {
      const want = val;
      const have = !!checked[m.name];
      if (want && !have) {
        try { await window.api.enableMod(m.name); } catch {}
      } else if (!want && have) {
        try { await window.api.disableMod(m.name); } catch {}
      }
    }
    await refreshMods();
  };

  const deleteEverywhere = async (name: string) => {
    if (!confirm(`Delete "${name}" from BOTH the game mods folder and the vault? This cannot be undone.`)) return;
    await window.api.deleteMod(name);
    await refreshMods();
  };

  const apply = async () => {
    await window.api.applyMods(enabledList);
    alert("Applied selected mods to the game's mods folder.");
  };

  const launchTracked = async () => {
    const ok = await window.api.launchWithModsTracked(enabledList);
    if (ok) alert("Game closed — live save backed up to mod_play_vault.");
  };

  const pathsOk =
    !!cfg.gameExe &&
    !!cfg.activeModsPath &&
    !!cfg.modsVaultPath &&
    !!cfg.modPlayVaultPath &&
    !!cfg.saveDataPath;

  // --- Render ---
  return (
    <div className="wrap" style={{ padding: 16 }}>
      <h1>WH40K Mod Manager</h1>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="hint">
              {cfg.autoDetected ? (
                <span className="ok">Auto-detected defaults where possible.</span>
              ) : (
                <span className="warn">No auto-detection captured.</span>
              )}
            </div>
            <div className="hint">
              {pathsOk ? (
                <span className="ok">Ready: All key paths are set.</span>
              ) : (
                <span className="err">Set all folders below before using “Launch (Tracked)”.</span>
              )}
            </div>
          </div>
          <div className="toolbar">
            <button onClick={saveConfig}>Save Config</button>
            <button onClick={refreshMods} title="Re-scan mods & vault">Refresh</button>
          </div>
        </div>
      </div>

      <h2>Configuration</h2>
      <div className="card col">
        <div className="grid2" title="Game install root (auto for SM2).">
          <label>Game Root</label>
          <div className="row">
            <input value={cfg.gameRoot} onChange={e => setCfg({ ...cfg, gameRoot: e.target.value })} />
            <button onClick={() => browseInto("gameRoot")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Game executable to launch.">
          <label>Game EXE</label>
          <div className="row">
            <input value={cfg.gameExe} onChange={e => setCfg({ ...cfg, gameExe: e.target.value })} />
            <button onClick={() => browseInto("gameExe")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="The game's real mods folder (e.g. …\\Space Marine 2\\client_pc\\root\\mods).">
          <label>Active Mods Path</label>
          <div className="row">
            <input value={cfg.activeModsPath} onChange={e => setCfg({ ...cfg, activeModsPath: e.target.value })} />
            <button onClick={() => browseInto("activeModsPath")}>Browse…</button>
          </div>
        </div>

        {/* IMMUTABLE: Mods Vault Path */}
        <div className="grid2" title="Your library of mods; each mod is its own subfolder.">
          <label>Mod Vault Path</label>
          <div className="row">
            <input value={cfg.modsVaultPath} readOnly />
            {/* no Browse button (immutable) */}
          </div>
          <div className="hint">Fixed for reliability. Changeable later via Advanced migration.</div>
        </div>

        {/* IMMUTABLE: Mod Play Vault Path */}
        <div className="grid2" title="Backups of your mod-play save snapshots.">
          <label>Mod Play Vault Path</label>
          <div className="row">
            <input value={cfg.modPlayVaultPath} readOnly />
            {/* no Browse button (immutable) */}
          </div>
          <div className="hint">Fixed for reliability. Changeable later via Advanced migration.</div>
        </div>

        <div className="grid2" title="Live game save folder — SM2: …\\Saber\\Space Marine 2\\storage\\steam\\user\\<id>\\Main\\config">
          <label>Save Data Path</label>
          <div className="row">
            <input value={cfg.saveDataPath} onChange={e => setCfg({ ...cfg, saveDataPath: e.target.value })} />
            <button onClick={() => browseInto("saveDataPath")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Preferred method for placing files into the mods folder.">
          <label>Install Strategy</label>
          <div className="row">
            <select
              value={cfg.installStrategy}
              onChange={e => setCfg({ ...cfg, installStrategy: e.target.value as InstallStrategy })}
            >
              <option value="hardlink">hardlink (fast, default)</option>
              <option value="symlink">symlink (may require permission)</option>
              <option value="copy">copy (slowest, safest)</option>
            </select>
          </div>
        </div>
      </div>

      <h2>Mods</h2>
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button onClick={() => markAll(true)}>All On</button>
          <button onClick={() => markAll(false)}>All Off</button>
          <span className="hint">Checked = in game mods; Unchecked + “🗃️ in vault” = installed not in use</span>
        </div>

        <div className="mods">
          {mods.length === 0 ? (
            <div className="hint">
              No mods found.<br />
              Mods folder: <b>{cfg.activeModsPath || "(unset)"}</b><br />
              Vault: <b>{cfg.modsVaultPath || "(unset)"}</b>
            </div>
          ) : (
            mods.map((m) => (
              <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px" }}>
                <input
                  type="checkbox"
                  checked={!!checked[m.name]}
                  onChange={() => toggle(m.name)}
                  title={
                    m.inMods
                      ? "Installed (in use) — uncheck to deactivate"
                      : m.inVault
                      ? "Installed (not in use) — check to enable"
                      : "Not installed — import to vault first, then enable"
                  }
                />
                <span style={{ flex: 1 }}>{m.name}</span>
                <span className="hint">
                  {m.inMods ? "✅ in mods" : m.inVault ? "🗃️ in vault" : "⚠️ nowhere"}
                </span>
                <button onClick={() => deleteEverywhere(m.name)} title="Delete from mods and vault">🗑️</button>
              </div>
            ))
          )}
        </div>
      </div>

      <h2>Actions</h2>
      <div className="card toolbar">
        <button onClick={apply} title="Mirror selected mods into the game's mods folder (no launch).">
          Apply (no launch)
        </button>
        <button
          onClick={launchTracked}
          disabled={!pathsOk}
          title={
            pathsOk
              ? "Restore latest mod-play save → apply selected mods → launch → on exit back up live save."
              : "Set all key paths first."
          }
        >
          Launch (Tracked)
        </button>
      </div>
    </div>
  );
}
