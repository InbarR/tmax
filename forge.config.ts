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
    name: "TermMight",
    executableName: "termmight",
  },
  makers: [
    // Windows
    new MakerSquirrel({ authors: "TermMight", description: "Powerful multi-terminal app" }),
    // macOS
    new MakerDMG({ format: "ULFO" }),
    // Linux
    new MakerDeb({
      options: {
        name: "termmight",
        productName: "TermMight",
        maintainer: "TermMight",
        homepage: "https://github.com/InbarR/TermMight",
        description: "Powerful multi-terminal app with tiling and floating panels",
        categories: ["Utility", "TerminalEmulator"],
      },
    }),
    new MakerRpm({
      options: {
        name: "termmight",
        productName: "TermMight",
        homepage: "https://github.com/InbarR/TermMight",
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
