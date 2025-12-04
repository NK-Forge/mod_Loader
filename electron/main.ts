/**
 * @file electron/main.ts
 * @project Space Marine 2 Mod Loader
 * Main entry point - refactored for modularity
 */

import { app } from "electron";
import { initializeApp, setupAppLifecycle } from "./lifecycle/appInitializer";
import { registerAllIpcHandlers } from "./ipc/ipcRegistry";
import { getMainWindow } from "./lifecycle/windowManager";

// Import side-effect modules
import "../src/main/ipc/paths";

// Initialize app when ready
app.whenReady().then(async () => {
  await initializeApp();
  registerAllIpcHandlers(getMainWindow());
});

// Setup lifecycle event handlers
setupAppLifecycle();