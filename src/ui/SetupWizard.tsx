// [MODIFIED] SetupWizard.tsx — Imperial Brass Version
// Matches Phase 4C styling and main window visual theme

import React, { useEffect, useState } from "react";
import { WindowTitleBar } from "./WindowTitleBar";
import defaultBg from "../renderer/assets/default_bg.jpg";

type Paths = {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
};

const brassBorder = "1px solid rgba(255, 215, 128, 0.45)";
const brassShadow = "0 0 12px rgba(255, 200, 100, 0.25)";

const Button = ({ disabled, onClick, children }: any) => (
  <button
    disabled={disabled}
    onClick={onClick}
    style={{
      padding: "6px 14px",
      borderRadius: 6,
      border: brassBorder,
      background: disabled
        ? "rgba(60,60,60,0.5)"
        : "rgba(40,40,40,0.9)",
      color: disabled ? "#777" : "#eac27f",
      cursor: disabled ? "default" : "pointer",
      boxShadow: disabled ? "" : brassShadow,
      fontWeight: 600,
    }}
  >
    {children}
  </button>
);

const Field = ({
  label,
  value,
  onPick,
  onChange,
  readOnly,
  hint,
}: {
  label: string;
  value: string;
  onPick?: () => void;
  onChange?: (v: string) => void;
  hint?: string;
  readOnly?: boolean;
}) => (
  <div style={{ marginBottom: 20 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: 4,
      }}
    >
      <label style={{ fontSize: 15, color: "#e8d7b8" }}>{label}</label>
      {onPick ? (
        <Button onClick={onPick}>Browse…</Button>
      ) : null}
    </div>

    <input
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        width: "100%",
        padding: "8px 10px",
        background: "rgba(20,20,20,0.6)",
        color: "#ffe9c4",
        border: brassBorder,
        borderRadius: 6,
      }}
    />

    {hint ? (
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          opacity: 0.8,
          color: "#d8c39a",
        }}
      >
        {hint}
      </div>
    ) : null}
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

  const [status, setStatus] = useState("Detecting default paths...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const detected = await window.api.detectPaths?.();
        const cfg = await window.api.getConfig();

        setPaths({
          gameRoot: detected?.gameRoot || "",
          gameExe: detected?.gameExe || "",
          activeModsPath: detected?.activeModsPath || "",
          modsVaultPath: cfg?.modsVaultPath || "",
          modPlayVaultPath: cfg?.modPlayVaultPath || "",
          saveDataPath: detected?.saveDataPath || "",
        });

        setStatus(
          "Review detected paths. Vault paths are fixed during initial setup."
        );
      } catch (e) {
        console.error("detectPaths failed", e);
        setStatus("Could not auto-detect. Please fill in paths manually.");
      }
    })();
  }, []);

  useEffect(() => {
    const ok = Boolean(
      paths.gameExe &&
      paths.activeModsPath &&
      paths.modsVaultPath &&
      paths.modPlayVaultPath &&
      paths.saveDataPath
    );

    setReady(ok);
  }, [paths]);


  async function pick(key: keyof Paths) {
    const p = await window.api.browseFolder();
    if (!p) return;
    setPaths((s) => ({ ...s, [key]: p }));
  }

  async function testAll() {
    const checks: Array<[keyof Paths, string]> = [
      ["activeModsPath", "Active Mods"],
      ["modsVaultPath", "Mods Vault"],
      ["modPlayVaultPath", "Mod-Play Vault"],
      ["saveDataPath", "Save Data"],
    ];

    let ok = true;
    for (const [key, label] of checks) {
      const writable = await window.api.testWrite(paths[key]);
      if (!writable) {
        ok = false;
        alert(`${label} is not writable:\n${paths[key]}`);
      }
    }

    if (ok) alert("All paths confirmed writable. ✔️");
  }

  async function finish() {
    await window.api.ensureDirs([
      paths.activeModsPath,
      paths.modsVaultPath,
      paths.modPlayVaultPath,
    ]);

    await window.api.completeSetup({
      ...paths,
      installStrategy: "hardlink",
      autoDetected: true,
      setupComplete: true,
    });

    onDone();
  }

  return (
    <div
      style={{
        backgroundImage: `url("${defaultBg}")`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        minHeight: "100vh",
      }}
    >
      <div
        className="wrap"
        style={{
          padding: 16,
          backdropFilter: "blur(2px)",
          background: "rgba(0,0,0,0.35)",
          minHeight: "100vh",
        }}
      >
        {/* Custom NK-Forge Title Bar */}
        <WindowTitleBar />

        {/* Your original wizard card — unchanged */}
        <div
          style={{
            maxWidth: 860,
            margin: "40px auto",
            padding: "20px 26px",
            border: brassBorder,
            borderRadius: 10,
            boxShadow: brassShadow,
            background: "rgba(24,24,24,0.75)",
            color: "#f4e6c8",
          }}
        >
          <h1 style={{ marginTop: 0, color: "#f6e2b8" }}>First-Run Setup</h1>
          <p style={{ opacity: 0.85, marginBottom: 25 }}>{status}</p>

          {/* Fields */}
          <Field
            label="Game Root"
            value={paths.gameRoot}
            onPick={() => pick("gameRoot")}
            onChange={(v) => setPaths((s) => ({ ...s, gameRoot: v }))}
            hint="Base installation directory of Space Marine 2"
          />

          <Field
            label="Game EXE"
            value={paths.gameExe}
            onPick={() => pick("gameExe")}
            onChange={(v) => setPaths((s) => ({ ...s, gameExe: v }))}
            hint="Example: C:\\Steam\\steamapps\\common\\Space Marine 2\\Warhammer 40000 Space Marine 2.exe"
          />

          <Field
            label="Active Mods Path"
            value={paths.activeModsPath}
            onPick={() => pick("activeModsPath")}
            onChange={(v) => setPaths((s) => ({ ...s, activeModsPath: v }))}
            hint="The game's actual mods directory."
          />

          <Field
            label="Mods Vault Path"
            value={paths.modsVaultPath}
            readOnly
            hint="Locked during setup for reliability."
          />

          <Field
            label="Mod-Play Vault Path"
            value={paths.modPlayVaultPath}
            readOnly
            hint="Stores your mod-play save snapshots."
          />

          <Field
            label="Save Data Path"
            value={paths.saveDataPath}
            onPick={() => pick("saveDataPath")}
            onChange={(v) => setPaths((s) => ({ ...s, saveDataPath: v }))}
            hint="Usually in AppData\\Local\\Saber\\Space Marine 2\\storage\\steam\\user\\<id>\\Main\\config"
          />

          {/* Footer Buttons */}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <Button onClick={testAll}>Test Write Access</Button>

            <Button onClick={finish} disabled={!ready}>
              Finish Setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
