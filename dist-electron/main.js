"use strict";
const electron = require("electron");
const path = require("node:path");
const fs = require("node:fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
let win = null;
function getPreloadPath() {
  const candidates = ["preload.js", "preload.cjs"];
  for (const f of candidates) {
    const p = path__namespace.join(__dirname, f);
    if (fs__namespace.existsSync(p)) return p;
  }
  return path__namespace.join(process.cwd(), "electron", "preload.ts");
}
async function createWindow() {
  const preloadPath = getPreloadPath();
  const devURL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  console.log("[main] preload:", preloadPath);
  console.log("[main] dev URL :", devURL);
  win = new electron.BrowserWindow({
    width: 1100,
    height: 750,
    title: "Space Marine 2 Mod Manager",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    },
    show: false
    // show when ready
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[renderer] did-fail-load:", code, desc, "url:", url);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] crashed:", details);
  });
  win.webContents.on("console-message", (_e, level, message) => {
    console.log(`[renderer console ${level}]:`, message);
  });
  try {
    if (devURL) {
      await win.loadURL(devURL);
    }
  } catch (err) {
    console.error("[main] load error:", err);
  }
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
    win == null ? void 0 : win.webContents.openDevTools({ mode: "detach" });
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
