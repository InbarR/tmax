import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
// import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";

const config: ForgeConfig = {
  hooks: {
    postPackage: async (_config, options) => {
      // Copy node-pty native module into packaged app
      const path = require('path');
      const fs = require('fs-extra');
      const appDir = path.join(options.outputPaths[0], 'resources', 'app');
      const src = path.join(__dirname, 'node_modules', 'node-pty');
      const dest = path.join(appDir, 'node_modules', 'node-pty');
      await fs.copy(src, dest);
      // Also copy node-addon-api (node-pty dependency)
      const napiSrc = path.join(__dirname, 'node_modules', 'node-addon-api');
      const napiDest = path.join(appDir, 'node_modules', 'node-addon-api');
      if (fs.existsSync(napiSrc)) await fs.copy(napiSrc, napiDest);
      console.log('Copied node-pty to packaged app');
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
        homepage: "https://github.com/InbarR/tmax",
        description: "Powerful multi-terminal app with tiling and floating panels",
        categories: ["Utility", "TerminalEmulator"],
      },
    }),
    // All platforms
    new MakerZIP({}),
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
