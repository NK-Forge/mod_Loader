/**
 * @file electron/lifecycle/windowManager.ts
 * @project Space Marine 2 Mod Loader
 * Browser window creation and management
 */

import { BrowserWindow, Menu, app } from "electron";
import path from "path";
import { fileURLToPath } from "url";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/** Allow renderer navigation only within the expected dev or packaged origin. */
function isAllowedNavigationTarget(targetUrl: string): boolean {
  try {
    if (app.isPackaged) {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "file:") return false;

      const rendererRoot = path.resolve(__dirname, "../dist");
      const targetPath = path.resolve(fileURLToPath(parsed));
      return isPathInside(rendererRoot, targetPath);
    }

    return new URL(targetUrl).origin === "http://localhost:5173";
  } catch {
    return false;
  }
}

export async function createWindow(): Promise<void> {
  // Disable default application menu
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: "hiddenInset",

    webPreferences: {
      /**
       * IMPORTANT:
       * In dev, Electron runs the compiled main file from dist-electron,
       * so __dirname points at dist-electron/.
       * preload.js is emitted next to main.js, so this resolves to:
       *   <project>/dist-electron/preload.js
       */
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep Chromium's same-origin and mixed-content protections enabled
      // in both development and packaged builds.
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // The app opens approved external destinations through main-process IPC.
  // Renderer-created windows are never needed.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.warn("[WINDOW] Blocked renderer window open:", url);
    return { action: "deny" };
  });

  // Prevent renderer content from navigating the main window away from the
  // expected Vite origin or packaged renderer files.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigationTarget(url)) return;
    console.warn("[WINDOW] Blocked renderer navigation:", url);
    event.preventDefault();
  });

  if (app.isPackaged) {
    // Production: load built renderer HTML
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    // Development: load Vite dev server
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

export async function waitForWindowReady(
  window: BrowserWindow
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (window.webContents.isLoading()) {
      window.webContents.once("did-finish-load", () => resolve());
    } else {
      resolve();
    }
  });
}
