// vite.config.ts

import { defineConfig, type UserConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig(async (): Promise<UserConfig> => {
  // `simple` returns Promise<Plugin[]>, so we must await it and spread
  const electronPlugins = await electron({
    main: { entry: "electron/main.ts" },
    preload: { input: "electron/preload.ts" },
  });

  const plugins: PluginOption[] = [
    react(),
    ...electronPlugins,
    renderer(),
  ];

  return { plugins };
});
