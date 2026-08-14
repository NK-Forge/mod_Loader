import { ipcMain, shell } from "electron";
import { getConfig } from "../state/configStore";

type ConfiguredPathKey = "activeMods" | "modsVault" | "modPlayVault";

function resolveConfiguredPath(key: ConfiguredPathKey): string {
  const cfg = getConfig();
  switch (key) {
    case "activeMods":
      return cfg?.activeModsPath ?? "";
    case "modsVault":
      return cfg?.modsVaultPath ?? "";
    case "modPlayVault":
      return cfg?.modPlayVaultPath ?? "";
  }
}

ipcMain.handle(
  "paths:revealConfigured",
  async (_ev, key: ConfiguredPathKey): Promise<{ ok: boolean; message?: string }> => {
    if (key !== "activeMods" && key !== "modsVault" && key !== "modPlayVault") {
      return { ok: false, message: "Unknown configured path." };
    }

    const target = resolveConfiguredPath(key);
    if (!target) {
      return { ok: false, message: "Configured path is not available." };
    }

    const errorMessage = await shell.openPath(target);
    if (errorMessage) {
      return { ok: false, message: errorMessage };
    }

    return { ok: true };
  }
);

ipcMain.handle("paths:immutable:get", async () => {
  const cfg = getConfig();
  return {
    ok: true,
    modsVaultPath: cfg?.modsVaultPath ?? "",
    modPlayVaultPath: cfg?.modPlayVaultPath ?? "",
    activeModsPath: cfg?.activeModsPath ?? "",
  };
});
