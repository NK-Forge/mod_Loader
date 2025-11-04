// electron/main.ts
import { app, BrowserWindow } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";

let win: BrowserWindow | null = null;

function getPreloadPath() {
  // In dev the plugin builds to dist-electron/, and __dirname is dist-electron/
  const candidates = ["preload.js", "preload.cjs"];
  for (const f of candidates) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  // fallback to TS during packaging errors (shouldn't happen)
  return path.join(process.cwd(), "electron", "preload.ts");
}

async function createWindow() {
  const preloadPath = getPreloadPath();
  const devURL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

  console.log("[main] preload:", preloadPath);
  console.log("[main] dev URL :", devURL);

  win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "Space Marine 2 Mod Manager",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
    show: false, // show when ready
  });

  // Debug listeners
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[renderer] did-fail-load:", code, desc, "url:", url);
  });
  // 'crashed' was replaced by 'render-process-gone' in newer Electron versions
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[renderer] crashed:", details);
  });
  win.webContents.on("console-message", (_e, level, message) => {
    console.log(`[renderer console ${level}]:`, message);
  });

  // Load renderer (dev server if present, otherwise built file)
  try {
    if (devURL) {
      await win.loadURL(devURL);
    } else {
      const prodIndex = path.join(__dirname, "../dist/index.html");
      console.log("[main] loading file:", prodIndex);
      await win.loadFile(prodIndex);
    }
  } catch (err) {
    console.error("[main] load error:", err);
  }

  win.once("ready-to-show", () => {
    win?.show();
    win?.webContents.openDevTools({ mode: "detach" });
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
