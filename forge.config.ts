import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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
    new AutoUnpackNativesPlugin({}),
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
