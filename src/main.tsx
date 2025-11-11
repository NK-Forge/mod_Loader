/**
 * @file src/main.tsx
 * @project Space Marine 2 Mod Loader
 * @phase 3A/3B — Entry Wiring
 * @description
 *  Renderer entry. Chooses Setup Wizard or App based on persisted config.
 */

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App";
import SetupWizard from "./ui/SetupWizard";

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

function needsWizard(cfg: AppConfig | null): boolean {
  if (!cfg) return true;
  if (!cfg.setupComplete) return true;
  const required = [
    cfg.gameExe,
    cfg.activeModsPath,
    cfg.modsVaultPath,
    cfg.modPlayVaultPath,
    cfg.saveDataPath,
  ];
  return required.some((p) => !p || p.trim().length === 0);
}

function Root() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);

  useEffect(() => {
    (async () => {
      const c = await window.api.getConfig();
      setCfg(c);
    })();
  }, []);

  if (!cfg) return null; // (optional) show a tiny spinner here

  const handleDone = async () => {
    const c = await window.api.getConfig();
    setCfg({ ...c, setupComplete: true });
  };

  return needsWizard(cfg) ? <SetupWizard onDone={handleDone} /> : <App />;
}

const el = document.getElementById("root")!;
createRoot(el).render(<Root />);
