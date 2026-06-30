// SetupWizard.tsx — Imperial Brass Version

import React, { useEffect, useMemo, useState } from "react";
import { WindowTitleBar } from "./WindowTitleBar";
import defaultBg from "../renderer/assets/default_bg.jpg";

type Platform = "steam" | "epic" | "xbox" | "unknown";
type StorefrontStatus = "installed" | "launcher_only" | "not_found";
type StorefrontConfidence = "high" | "medium" | "low" | "none";

type StorefrontCandidate = {
  id: string;
  platform: Platform;
  label: string;
  status: StorefrontStatus;
  confidence: StorefrontConfidence;
  source: string;
  canLaunch: boolean;
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  saveDataPath: string;
  launchUri: string;
  notes: string[];
  steamAppId?: string;
  storeProductId?: string;
  epic?: {
    appName?: string;
    namespaceId?: string;
    itemId?: string;
    artifactId?: string;
    installLocation?: string;
    manifestLocation?: string;
  };
  xbox?: {
    aumid?: string;
    packageFamilyName?: string;
    packageFullName?: string;
    appId?: string;
    installLocation?: string;
    xboxAppAumid?: string;
  };
};

type Paths = {
  gameRoot: string;
  gameExe: string;
  activeModsPath: string;
  modsVaultPath: string;
  modPlayVaultPath: string;
  saveDataPath: string;
  platform: Platform;
  launchUri?: string;
  steamAppId?: string;
  epicAppName?: string;
  epicNamespaceId?: string;
  epicItemId?: string;
  epicArtifactId?: string;
  epicLaunchUri?: string;
  xboxAumid?: string;
  xboxLaunchUri?: string;
  xboxStoreProductId?: string;
  selectedStorefrontId?: string;
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
      background: disabled ? "rgba(60,60,60,0.5)" : "rgba(40,40,40,0.9)",
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
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <label style={{ fontSize: 15, color: "#e8d7b8" }}>{label}</label>
      {onPick ? <Button onClick={onPick}>Browse…</Button> : null}
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
      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, color: "#d8c39a" }}>
        {hint}
      </div>
    ) : null}
  </div>
);

function platformLabel(platform: Platform): string {
  if (platform === "steam") return "Steam";
  if (platform === "epic") return "Epic Games";
  if (platform === "xbox") return "Xbox / PC Game Pass / Microsoft Store";
  return "Unknown";
}

function statusText(candidate: StorefrontCandidate): string {
  if (candidate.status === "installed") return `Installed · ${candidate.confidence} confidence`;
  if (candidate.status === "launcher_only") return "Launcher found · game not installed";
  return "Not found";
}

function applyCandidateToPaths(candidate: StorefrontCandidate, current: Paths): Paths {
  return {
    ...current,
    gameRoot: candidate.gameRoot || current.gameRoot || "",
    gameExe: candidate.gameExe || current.gameExe || "",
    activeModsPath: candidate.activeModsPath || current.activeModsPath || "",
    saveDataPath: candidate.saveDataPath || current.saveDataPath || "",
    platform: candidate.platform,
    launchUri: candidate.launchUri || "",
    steamAppId: candidate.steamAppId || current.steamAppId,
    epicAppName: candidate.epic?.appName || "",
    epicNamespaceId: candidate.epic?.namespaceId || "",
    epicItemId: candidate.epic?.itemId || "",
    epicArtifactId: candidate.epic?.artifactId || "",
    epicLaunchUri: candidate.platform === "epic" ? candidate.launchUri : "",
    xboxAumid: candidate.xbox?.aumid || "",
    xboxLaunchUri: candidate.platform === "xbox" ? candidate.launchUri : "",
    xboxStoreProductId: candidate.storeProductId || current.xboxStoreProductId || "",
    selectedStorefrontId: candidate.id,
  };
}

export default function SetupWizard({ onDone }: { onDone: () => void }) {
  const [paths, setPaths] = useState<Paths>({
    gameRoot: "",
    gameExe: "",
    activeModsPath: "",
    modsVaultPath: "",
    modPlayVaultPath: "",
    saveDataPath: "",
    platform: "unknown",
    launchUri: "",
    steamAppId: "2183900",
    epicAppName: "",
    epicNamespaceId: "",
    epicItemId: "",
    epicArtifactId: "",
    epicLaunchUri: "",
    xboxAumid: "",
    xboxLaunchUri: "",
    xboxStoreProductId: "9N9PCZWHVP2L",
    selectedStorefrontId: "",
  });

  const [storefronts, setStorefronts] = useState<StorefrontCandidate[]>([]);
  const [status, setStatus] = useState("Scanning installed storefronts...");
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function runDetection() {
    setScanning(true);
    setStatus("Scanning Steam, Epic, Xbox/Game Pass, and Microsoft Store app records...");

    try {
      const res = await window.api.detectPaths?.();
      const cfg = await window.api.getConfig();

      let detected: any = res;
      if (detected && typeof detected.ok === "boolean") {
        if (!detected.ok) throw new Error(detected.message || "Path detection failed");
        detected = detected.detected;
      }

      const checks = Array.isArray(detected?.storefronts) ? detected.storefronts : [];
      setStorefronts(checks);

      const selected =
        checks.find((candidate: StorefrontCandidate) => candidate.id === detected?.selectedStorefrontId) ||
        checks.find((candidate: StorefrontCandidate) => candidate.status === "installed");

      const base: Paths = {
        gameRoot: detected?.gameRoot || "",
        gameExe: detected?.gameExe || "",
        activeModsPath: detected?.activeModsPath || "",
        modsVaultPath: cfg?.modsVaultPath || "",
        modPlayVaultPath: cfg?.modPlayVaultPath || "",
        saveDataPath: detected?.saveDataPath || "",
        platform: detected?.platform || "unknown",
        launchUri: detected?.launchUri || "",
        steamAppId: detected?.steamAppId || "2183900",
        epicAppName: detected?.epicAppName || "",
        epicNamespaceId: detected?.epicNamespaceId || "",
        epicItemId: detected?.epicItemId || "",
        epicArtifactId: detected?.epicArtifactId || "",
        epicLaunchUri: detected?.epicLaunchUri || "",
        xboxAumid: detected?.xboxAumid || "",
        xboxLaunchUri: detected?.xboxLaunchUri || "",
        xboxStoreProductId: detected?.xboxStoreProductId || "9N9PCZWHVP2L",
        selectedStorefrontId: detected?.selectedStorefrontId || selected?.id || "",
      };

      setPaths(selected ? applyCandidateToPaths(selected, base) : base);

      const installedCount = checks.filter((candidate: StorefrontCandidate) => candidate.status === "installed").length;
      if (installedCount > 1) {
        setStatus("Multiple Space Marine 2 installs were found. Choose the storefront this mod loader should use.");
      } else if (installedCount === 1) {
        setStatus("Space Marine 2 was detected. Review the selected storefront and paths before finishing setup.");
      } else {
        setStatus("No installed Space Marine 2 storefront build was detected. You can rescan or fill paths manually if this is a custom install.");
      }
    } catch (e) {
      console.error("detectPaths failed", e);
      setStatus("Could not auto-detect. You can rescan or fill in paths manually.");
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void runDetection();
  }, []);

  useEffect(() => {
    const root = (paths.gameRoot || "").trim().replace(/\//g, "\\").replace(/[\\]+$/g, "");

    if (!root) return;

    setPaths((s) => {
      const nextExe = `${root}\\Warhammer 40000 Space Marine 2.exe`;
      const nextMods = `${root}\\client_pc\\root\\mods`;
      return {
        ...s,
        gameExe: s.gameExe || nextExe,
        activeModsPath: s.activeModsPath || nextMods,
      };
    });
  }, [paths.gameRoot]);

  useEffect(() => {
    const hasInstalledSelection = storefronts.some(
      (candidate) => candidate.id === paths.selectedStorefrontId && candidate.status === "installed"
    );
    const manualRootLooksValid = (paths.gameRoot || "").toLowerCase().includes("space marine 2");
    const canLaunchSelected = Boolean(paths.launchUri || paths.platform === "steam");

    const ok = Boolean(
      (hasInstalledSelection || manualRootLooksValid) &&
        canLaunchSelected &&
        paths.activeModsPath &&
        paths.modsVaultPath &&
        paths.modPlayVaultPath
    );

    setReady(ok);
  }, [paths, storefronts]);

  async function pick(key: keyof Paths) {
    try {
      const p = await window.api.browseFolder();
      if (!p) return;
      setPaths((s) => ({ ...s, [key]: p }));
    } catch (e) {
      console.error("Browse failed:", e);
      alert("Browse dialog failed to open. Please check install integrity or run as admin.");
    }
  }

  function selectStorefront(candidate: StorefrontCandidate) {
    if (candidate.status !== "installed") return;
    setPaths((current) => applyCandidateToPaths(candidate, current));
  }

  async function finish() {
    await window.api.ensureDirs([
      paths.activeModsPath,
      paths.modsVaultPath,
      paths.modPlayVaultPath,
    ]);

    await window.api.completeSetup({
      gameRoot: paths.gameRoot,
      gameExe: paths.gameExe,
      activeModsPath: paths.activeModsPath,
      modsVaultPath: paths.modsVaultPath,
      modPlayVaultPath: paths.modPlayVaultPath,
      saveDataPath: paths.saveDataPath,
      platform: paths.platform,
      launchUri: paths.launchUri,
      steamAppId: paths.steamAppId,
      epicAppName: paths.epicAppName,
      epicNamespaceId: paths.epicNamespaceId,
      epicItemId: paths.epicItemId,
      epicArtifactId: paths.epicArtifactId,
      epicLaunchUri: paths.epicLaunchUri,
      xboxAumid: paths.xboxAumid,
      xboxLaunchUri: paths.xboxLaunchUri,
      xboxStoreProductId: paths.xboxStoreProductId,
      selectedStorefrontId: paths.selectedStorefrontId,
      installStrategy: "hardlink",
      autoDetected: Boolean(paths.selectedStorefrontId),
      setupComplete: true,
    });

    onDone();
  }

  const selectedStorefront = useMemo(
    () => storefronts.find((candidate) => candidate.id === paths.selectedStorefrontId),
    [storefronts, paths.selectedStorefrontId]
  );

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
        <WindowTitleBar />

        <div
          style={{
            maxWidth: 940,
            margin: "40px auto",
            padding: "20px 26px",
            border: brassBorder,
            borderRadius: 10,
            boxShadow: brassShadow,
            background: "rgba(24,24,24,0.75)",
            color: "#f4e6c8",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 style={{ marginTop: 0, color: "#f6e2b8" }}>First-Run Setup</h1>
              <p style={{ opacity: 0.85, marginBottom: 20 }}>{status}</p>
            </div>
            <div style={{ paddingTop: 8 }}>
              <Button disabled={scanning} onClick={runDetection}>
                {scanning ? "Scanning..." : "Rescan"}
              </Button>
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 18, color: "#f6e2b8", marginBottom: 10 }}>
              Storefront Detection
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {storefronts.map((candidate) => {
                const selected = candidate.id === paths.selectedStorefrontId;
                const installed = candidate.status === "installed";

                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={!installed}
                    onClick={() => selectStorefront(candidate)}
                    style={{
                      textAlign: "left",
                      border: selected ? "1px solid rgba(117, 218, 161, 0.9)" : brassBorder,
                      borderRadius: 8,
                      padding: "10px 12px",
                      background: selected
                        ? "rgba(35, 80, 55, 0.55)"
                        : installed
                          ? "rgba(20,20,20,0.55)"
                          : "rgba(20,20,20,0.3)",
                      color: installed ? "#ffe9c4" : "rgba(255, 233, 196, 0.62)",
                      cursor: installed ? "pointer" : "default",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{candidate.label}</strong>
                      <span style={{ color: installed ? "#9fe1b6" : "#d7b16c" }}>
                        {statusText(candidate)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                      Source: {candidate.source || "scan"}
                    </div>
                    {candidate.launchUri ? (
                      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                        Launch: {candidate.launchUri}
                      </div>
                    ) : null}
                    {candidate.notes?.length ? (
                      <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12, opacity: 0.78 }}>
                        {candidate.notes.map((note, index) => (
                          <li key={`${candidate.id}-note-${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
              {!storefronts.length ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  No storefront scan results were returned yet.
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 15, color: "#e8d7b8", marginBottom: 4 }}>
              Selected Platform
            </label>
            <select
              value={paths.platform}
              onChange={(e) => {
                const nextPlatform = e.target.value as Platform;
                const fallbackLaunch =
                  nextPlatform === "steam"
                    ? `steam://run/${paths.steamAppId || "2183900"}`
                    : nextPlatform === "epic"
                      ? paths.epicLaunchUri || ""
                      : nextPlatform === "xbox"
                        ? paths.xboxLaunchUri || ""
                        : "";

                setPaths((s) => ({
                  ...s,
                  platform: nextPlatform,
                  launchUri: fallbackLaunch,
                  selectedStorefrontId: "",
                }));
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "rgba(20,20,20,0.6)",
                color: "#ffe9c4",
                border: brassBorder,
                borderRadius: 6,
              }}
            >
              <option value="unknown">Unknown / manual</option>
              <option value="steam">Steam</option>
              <option value="epic">Epic Games</option>
              <option value="xbox">Xbox / PC Game Pass / Microsoft Store</option>
            </select>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, color: "#d8c39a" }}>
              {selectedStorefront
                ? "Chosen from the storefront scan above. Manual override clears the scan selection."
                : "Manual fallback is available after automated scan fails. Steam can use its known App ID; Epic/Xbox still need detected launch metadata."}
            </div>
          </div>

          <Field
            label="Launch Target"
            value={paths.launchUri || ""}
            readOnly
            hint="URI/AUMID launch target built internally by the setup wizard."
          />

          <Field
            label="Game Root"
            value={paths.gameRoot}
            onPick={() => pick("gameRoot")}
            onChange={(v) => setPaths((s) => ({ ...s, gameRoot: v, selectedStorefrontId: "" }))}
            hint="Base installation directory of Space Marine 2. Manual fallback only if automated scan cannot see the install."
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
            hint={
              paths.platform === "xbox"
                ? "Usually in AppData\\Local\\Packages\\<PackageFamilyName>\\SystemAppData\\wgs. Leave blank only if saves have not been created yet."
                : "Usually in AppData\\Local\\Saber\\Space Marine 2\\storage\\<store>\\...\\Main\\config."
            }
          />

          <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75, alignSelf: "center" }}>
              {ready
                ? "Ready to finish."
                : "Finish unlocks after an installed storefront or valid manual path has a launch target and mod paths."}
            </div>
            <Button onClick={finish} disabled={!ready}>
              Finish Setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
