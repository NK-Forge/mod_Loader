// vite.config.ts

import {
  defineConfig,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import renderer from "vite-plugin-electron-renderer";

const COMMON_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

const PRODUCTION_CSP = [
  ...COMMON_CSP,
  "script-src 'self'",
  "connect-src 'self' https://api.nexusmods.com",
].join("; ");

const DEVELOPMENT_CSP = [
  ...COMMON_CSP,
  // React Fast Refresh injects a small inline bootstrap in development.
  // unsafe-eval remains disallowed.
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://localhost:5173 ws://localhost:5173 https://api.nexusmods.com",
].join("; ");

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: "nkforge-content-security-policy",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const policy = ctx.server ? DEVELOPMENT_CSP : PRODUCTION_CSP;

        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: policy,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default defineConfig(async (): Promise<UserConfig> => {
  // `simple` returns Promise<Plugin[]>, so we must await it and spread
  const electronPlugins = await electron({
    main: { entry: "electron/main.ts" },
    preload: { input: "electron/preload.ts" },
  });

  const plugins: PluginOption[] = [
    react(),
    contentSecurityPolicyPlugin(),
    ...electronPlugins,
    renderer(),
  ];

  return { plugins };
});
