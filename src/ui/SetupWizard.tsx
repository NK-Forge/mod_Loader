/**
 * @file SetupWizard.tsx
 * @project Space Marine 2 Mod Loader
 * @phase 3A — Path Integration
 * @description
 *  First-run setup flow for platform/game paths and vault locations.
 *  - Detects common defaults (best-effort).
 *  - Allows the user to confirm/edit writable paths.
 *  - Marks setup complete via `completeSetup`, which persists config
 *    and triggers `config:changed` broadcast in the main process.
 *
 * @developer-notes
 *  - Vault paths are immutable during wizard for reliability.
 *  - Advanced migration (changing vaults) is planned for later phases.
 */

import React, { useEffect, useState } from "react";

type Paths = {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
};

type FieldOpts = {
  label: string;
  value: string;
  onPick?: () => void;              // if omitted, no Browse button
  onChange?: (v: string) => void;   // if omitted, readOnly
  hint?: string;
  readOnly?: boolean;
};

/**
 * Simple labeled input with optional Browse and hint.
 */
const Field = ({ label, value, onPick, onChange, hint, readOnly }: FieldOpts) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <label style={{ fontWeight: 600 }}>{label}</label>
      {onPick ? <button onClick={onPick}>Browse…</button> : null}
    </div>
    <input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      readOnly={readOnly || !onChange}
      style={{ width: "100%", padding: "6px 8px", opacity: readOnly ? 0.85 : 1 }}
    />
    {hint ? <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
  </div>
);

export default function SetupWizard({ onDone }: { onDone: () => void }) {
  const [paths, setPaths] = useState<Paths>({
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    modsVaultPath: "",
    modPlayVaultPath: "",
    saveDataPath: "",
  });
  const [status, setStatus] = useState<string>("Detecting default paths…");
  const [canContinue, setCanContinue] = useState(false);

  /**
   * Initial detection + load persisted config to seed the wizard.
   * Vaults are immutable during wizard for reliability.
   */
  useEffect(() => {
    (async () => {
      const det = await window.api.detectPaths();
      const cfg = await window.api.getConfig();
      setPaths({
        gameRoot: det.gameRoot || cfg.gameRoot || "",
        gameExe: det.gameExe || cfg.gameExe || "",
        activeModsPath: det.activeModsPath || cfg.activeModsPath || "",
        modsVaultPath: cfg.modsVaultPath || "",
        modPlayVaultPath: cfg.modPlayVaultPath || "",
        saveDataPath: det.saveDataPath || cfg.saveDataPath || "",
      });
      setStatus("Review detected paths. Vault locations are fixed for reliability.");
    })();
  }, []);

  /**
   * Enable Finish only once all required paths are filled in.
   */
  useEffect(() => {
    const ok =
      paths.gameExe &&
      paths.activeModsPath &&
      paths.modsVaultPath &&
      paths.modPlayVaultPath &&
      paths.saveDataPath;
    setCanContinue(!!ok);
  }, [paths]);

  /**
   * Folder picker helper for editable fields.
   */
  async function pick(key: keyof Paths) {
    const p = await window.api.browseFolder();
    if (!p) return;
    setPaths(s => ({ ...s, [key]: p }));
  }

  /**
   * Validate write access to critical directories before finishing.
   * Alerts the user if any path is not writable.
   */
  async function testAll() {
    const checks: Array<[keyof Paths, string]> = [
      ["activeModsPath", "Active Mods"],
      ["modsVaultPath", "Mods Vault"],
      ["modPlayVaultPath", "Mod Play Vault"],
      ["saveDataPath", "Save Data"],
    ];
    let all = true;
    for (const [k, label] of checks) {
      const ok = await window.api.testWrite(paths[k]);
      if (!ok) {
        all = false;
        alert(`${label}: cannot write to "${paths[k]}"`);
      }
    }
    if (all) alert("All writable ✅");
  }

  /**
   * Ensure directories exist, persist the configuration,
   * mark `setupComplete`, and hand control back to the App.
   * @fires config:changed (main broadcasts to renderer)
   */
  async function finish() {
    await window.api.ensureDirs([
      paths.activeModsPath,
      paths.modsVaultPath,
      paths.modPlayVaultPath,
    ]);

    const finalized = {
      ...paths,
      installStrategy: "hardlink" as const,
      autoDetected: true,
      setupComplete: true,
    };

    await window.api.completeSetup(finalized as any);
    onDone();
  }

  return (
    <div style={{ maxWidth: 840, margin: "28px auto", padding: "16px" }}>
      <h1>First-Run Setup</h1>
      <p style={{ opacity: 0.85 }}>{status}</p>

      <Field
        label="Game Root"
        value={paths.gameRoot}
        onPick={() => pick("gameRoot")}
        onChange={v => setPaths(s => ({ ...s, gameRoot: v }))}
        hint="Base install directory for Space Marine 2"
      />

      <Field
        label="Game EXE"
        value={paths.gameExe}
        onPick={() => pick("gameExe")}
        onChange={v => setPaths(s => ({ ...s, gameExe: v }))}
        hint="Typically: …\\steamapps\\common\\Space Marine 2\\Warhammer 40000 Space Marine 2.exe"
      />

      <Field
        label="Active Mods Path"
        value={paths.activeModsPath}
        onPick={() => pick("activeModsPath")}
        onChange={v => setPaths(s => ({ ...s, activeModsPath: v }))}
        hint="The game's real mods folder (e.g. …\\Space Marine 2\\client_pc\\root\\mods)"
      />

      {/* IMMUTABLE: Mods Vault */}
      <Field
        label="Mods Vault Path"
        value={paths.modsVaultPath}
        hint="Fixed during setup for reliability. (Changeable later via Advanced migration.)"
        readOnly
      />

      {/* IMMUTABLE: Mod Play Vault */}
      <Field
        label="Mod Play Vault Path"
        value={paths.modPlayVaultPath}
        hint="Fixed during setup for reliability. Stores your mod-play save snapshots."
        readOnly
      />

      <Field
        label="Save Data Path"
        value={paths.saveDataPath}
        onPick={() => pick("saveDataPath")}
        onChange={v => setPaths(s => ({ ...s, saveDataPath: v }))}
        hint={`SM2 default: C:\\Users\\<you>\\AppData\\Local\\Saber\\Space Marine 2\\storage\\steam\\user\\<id>\\Main\\config`}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={testAll}>Test Write Access</button>
        <div style={{ flex: 1 }} />
        <button disabled={!canContinue} onClick={finish} title={canContinue ? "" : "Set all paths first"}>
          Finish Setup
        </button>
      </div>
    </div>
  );
}
