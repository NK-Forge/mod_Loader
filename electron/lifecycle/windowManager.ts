/**
 * @file electron/lifecycle/windowManager.ts
 * @project Space Marine 2 Mod Loader
 * Browser window creation and management
 */

import { BrowserWindow, Menu, app } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
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
