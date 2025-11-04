import React, { useEffect, useMemo, useState } from "react";

type InstallStrategy = "hardlink" | "symlink" | "copy";

type AppConfig = {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  installStrategy: InstallStrategy;
  autoDetected: boolean;
};

export default function App() {
  const [cfg, setCfg] = useState<AppConfig>({
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    modsVaultPath: "",
    modPlayVaultPath: "",
    saveDataPath: "",
    installStrategy: "hardlink",
    autoDetected: false,
  });

  const [mods, setMods] = useState<string[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const enabledList = useMemo(() => Object.keys(checked).filter(k => checked[k]), [checked]);

  // Load config + mods at startup
  useEffect(() => {
    (async () => {
      const c = await window.api.getConfig();
      setCfg(c);
      const list = await window.api.listMods();
      setMods(list);
      // initialize checkbox state (all off)
      setChecked(Object.fromEntries(list.map(m => [m, false])));
    })();
  }, []);

  // Helpers
  const markAll = (val: boolean) => {
    setChecked(Object.fromEntries(mods.map(m => [m, val])));
  };
  const toggle = (m: string) => {
    setChecked(prev => ({ ...prev, [m]: !prev[m] }));
  };

  // Save config
  const saveConfig = async () => {
    await window.api.setConfig(cfg);
    const list = await window.api.listMods();
    setMods(list);
    // keep existing check states where possible
    setChecked(prev => {
      const next = { ...prev };
      for (const m of list) if (!(m in next)) next[m] = false;
      for (const k of Object.keys(next)) if (!list.includes(k)) delete next[k];
      return next;
    });
    alert("Config saved.");
  };

  // Browse helpers
  const browseInto = async (field: keyof AppConfig) => {
    const selected = await window.api.browseFolder();
    if (!selected) return;
    setCfg(prev => ({ ...prev, [field]: selected }));
  };

  const apply = async () => {
    await window.api.applyMods(enabledList);
    alert("Mods applied to active folder.");
  };

  const launchTracked = async () => {
    // This restores the latest snapshot from mod_play_vault -> live save,
    // applies mods fresh, launches game, and on exit backs up live save to mod_play_vault/<timestamp>.
    const ok = await window.api.launchWithModsTracked(enabledList);
    if (ok) alert("Game closed — live save backed up to mod_play_vault.");
  };

  // Status checks
  const pathsOk =
    !!cfg.gameExe &&
    !!cfg.activeModsPath &&
    !!cfg.modsVaultPath &&
    !!cfg.modPlayVaultPath &&
    !!cfg.saveDataPath;

  return (
    <div className="wrap">
      <h1>WH Mod Toggler</h1>

      {/* Status */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="hint">
              {cfg.autoDetected ? (
                <span className="ok">Auto-detected default paths where possible.</span>
              ) : (
                <span className="warn">No auto-detection yet.</span>
              )}
            </div>
            <div className="hint">
              {pathsOk ? (
                <span className="ok">Ready: All key paths are set.</span>
              ) : (
                <span className="err">Incomplete: Set all folders below before using “Launch (Tracked)”.</span>
              )}
            </div>
          </div>
          <div className="toolbar">
            <button onClick={saveConfig} title="Save the configuration and refresh mod list.">Save Config</button>
          </div>
        </div>
      </div>

      {/* Config */}
      <h2>Configuration</h2>
      <div className="card col">
        <div className="grid2" title="Game install root (auto for SM2).">
          <label>Game Root</label>
          <div className="row">
            <input type="text" value={cfg.gameRoot} onChange={e => setCfg({ ...cfg, gameRoot: e.target.value })} />
            <button onClick={() => browseInto("gameRoot")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Game executable to launch.">
          <label>Game EXE</label>
          <div className="row">
            <input type="text" value={cfg.gameExe} onChange={e => setCfg({ ...cfg, gameExe: e.target.value })} />
            <button onClick={() => browseInto("gameExe")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Folder the game actually reads mods from. We mirror selected mods here before launch.">
          <label>Active Mods Path</label>
          <div className="row">
            <input type="text" value={cfg.activeModsPath} onChange={e => setCfg({ ...cfg, activeModsPath: e.target.value })} />
            <button onClick={() => browseInto("activeModsPath")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Where your unpacked downloaded mods live (source of truth). Each mod should be a subfolder here.">
          <label>Mod Vault Path</label>
          <div className="row">
            <input type="text" value={cfg.modsVaultPath} onChange={e => setCfg({ ...cfg, modsVaultPath: e.target.value })} />
            <button onClick={() => browseInto("modsVaultPath")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Backups of your mod-play save snapshots. We'll restore from here before launch and back up here on exit.">
          <label>Mod Play Vault Path</label>
          <div className="row">
            <input type="text" value={cfg.modPlayVaultPath} onChange={e => setCfg({ ...cfg, modPlayVaultPath: e.target.value })} />
            <button onClick={() => browseInto("modPlayVaultPath")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Live game save folder. For SM2: C:\Users\<you>\AppData\Local\Saber\Space Marine 2\storage\steam\user\<id>\Main\config">
          <label>Save Data Path</label>
          <div className="row">
            <input type="text" value={cfg.saveDataPath} onChange={e => setCfg({ ...cfg, saveDataPath: e.target.value })} />
            <button onClick={() => browseInto("saveDataPath")}>Browse…</button>
          </div>
        </div>

        <div className="grid2" title="Preferred method for placing files into Active Mods Path. Hardlink is fast and safe on Windows.">
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

      {/* Mods */}
      <h2>Mods in Vault</h2>
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button onClick={() => markAll(true)} title="Enable all mods.">All On</button>
          <button onClick={() => markAll(false)} title="Disable all mods.">All Off</button>
          <button
            onClick={async () => {
              const list = await window.api.listMods();
              setMods(list);
              setChecked(prev => {
                const next = { ...prev };
                for (const m of list) if (!(m in next)) next[m] = false;
                for (const k of Object.keys(next)) if (!list.includes(k)) delete next[k];
                return next;
              });
            }}
            title="Re-read the Mod Vault folder for changes."
          >
            Refresh
          </button>
        </div>

        <div className="mods">
          {mods.length === 0 ? (
            <div className="hint">
              No mod folders found in <b>{cfg.modsVaultPath || "(unset)"}</b>.<br />
              Put each mod in its own subfolder inside the Mod Vault Path.
            </div>
          ) : (
            mods.map((m) => (
              <label key={m} style={{ display: "block", padding: "4px 2px" }} title={m}>
                <input
                  type="checkbox"
                  checked={!!checked[m]}
                  onChange={() => toggle(m)}
                  style={{ marginRight: 8 }}
                />
                {m}
              </label>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <h2>Actions</h2>
      <div className="card toolbar">
        <button onClick={apply} title="Mirror selected mods into Active Mods Path without launching.">
          Apply (no launch)
        </button>
        <button
          onClick={launchTracked}
          disabled={!pathsOk}
          title={
            pathsOk
              ? "Restore latest mod-play save → apply mods → launch game → on exit back up save."
              : "Set all key paths first."
          }
        >
          Launch (Tracked)
        </button>
      </div>
    </div>
  );
}
