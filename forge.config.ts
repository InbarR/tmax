import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
// import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";

const config: ForgeConfig = {
  outDir: process.env.FORGE_OUT_DIR || 'out',
  hooks: {
    postPackage: async (_config, options) => {
      const path = require('path');
      const fs = require('fs-extra');
      const outDir = options.outputPaths[0];

      // On macOS, outputPaths[0] is the directory containing the .app bundle
      // (e.g. out/tmax-darwin-arm64), not the .app itself.
      const macApp = fs.readdirSync(outDir).find((f: string) => f.endsWith('.app'));
      const appDir = macApp
        ? path.join(outDir, macApp, 'Contents', 'Resources', 'app')
        : path.join(outDir, 'resources', 'app');

      const src = path.join(__dirname, 'node_modules', 'node-pty');
      const dest = path.join(appDir, 'node_modules', 'node-pty');
      await fs.copy(src, dest);

      // Ensure all binaries are executable (NTFS doesn't preserve Unix perms)
      const prebuildsDir = path.join(dest, 'prebuilds');
      if (fs.existsSync(prebuildsDir)) {
        for (const platform of fs.readdirSync(prebuildsDir)) {
          const platformDir = path.join(prebuildsDir, platform);
          for (const file of fs.readdirSync(platformDir)) {
            fs.chmodSync(path.join(platformDir, file), 0o755);
          }
        }
      }

      const napiSrc = path.join(__dirname, 'node_modules', 'node-addon-api');
      const napiDest = path.join(appDir, 'node_modules', 'node-addon-api');
      if (fs.existsSync(napiSrc)) await fs.copy(napiSrc, napiDest);

      // chokidar is marked as external in vite.main.config.ts (native ESM),
      // so it must be present in node_modules at runtime
      const chokidarSrc = path.join(__dirname, 'node_modules', 'chokidar');
      const chokidarDest = path.join(appDir, 'node_modules', 'chokidar');
      if (fs.existsSync(chokidarSrc)) await fs.copy(chokidarSrc, chokidarDest);

      console.log(`Copied native/external modules to ${appDir}`);
    },
  },
  packagerConfig: {
    asar: false,
    name: "tmax",
    executableName: "tmax",
    icon: "./assets/icon",
  },
  makers: [
    // Windows
    new MakerSquirrel({ authors: "tmax", description: "Powerful multi-terminal app", setupIcon: "./assets/icon.ico", iconUrl: "https://raw.githubusercontent.com/InbarR/tmax/main/assets/icon.ico" }),
    // macOS
    new MakerDMG({ format: "ULFO" }),
    // Linux
    new MakerDeb({
      options: {
        name: "tmax",
        productName: "tmax",
        maintainer: "tmax",
        homepage: "https://github.com/InbarR/tmax",
        description: "Powerful multi-terminal app with tiling and floating panels",
        categories: ["Utility", "TerminalEmulator"],
      },
    }),
    new MakerRpm({
      options: {
        name: "tmax",
        productName: "tmax",
        license: "MIT",
        homepage: "https://github.com/InbarR/tmax",
        description: "Powerful multi-terminal app with tiling and floating panels",
        categories: ["Utility", "TerminalEmulator"],
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
