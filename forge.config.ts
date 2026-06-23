import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
// import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerDMG } from "@electron-forge/maker-dmg";

// Windows code signing via Azure Trusted Signing. Only enabled when
// WINDOWS_SIGN=1 (set in CI for tagged release builds), so local and PR
// builds never try to sign. The hook signs the packaged app binaries
// (during `package`) and the Squirrel Setup.exe (during `make`).
const windowsSign = process.env.WINDOWS_SIGN === '1'
  ? { hookModulePath: require('path').resolve(__dirname, 'scripts', 'windows-sign.cjs') }
  : undefined;

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

      // chokidar is marked as external in vite.main.config.ts, so it and
      // its transitive deps must be present in node_modules at runtime.
      // The static `import * as chokidar from 'chokidar'` in main resolves
      // chokidar/index.js, which then `require()`s readdirp / anymatch /
      // glob-parent / etc. Without these copied alongside, the packaged
      // app crashes on launch with "Cannot find module 'readdirp'" (TASK-143).
      const chokidarDeps = [
        'chokidar',
        // Direct deps from chokidar's package.json:
        'anymatch',
        'braces',
        'glob-parent',
        'is-binary-path',
        'is-glob',
        'normalize-path',
        'readdirp',
        // Transitive deps required by the above:
        'binary-extensions',  // is-binary-path
        'fill-range',         // braces
        'is-extglob',         // is-glob, glob-parent
        'is-number',          // fill-range
        'picomatch',          // anymatch, readdirp
        'to-regex-range',     // fill-range
      ];
      for (const dep of chokidarDeps) {
        const depSrc = path.join(__dirname, 'node_modules', dep);
        const depDest = path.join(appDir, 'node_modules', dep);
        if (fs.existsSync(depSrc) && !fs.existsSync(depDest)) {
          await fs.copy(depSrc, depDest);
        }
      }

      // better-sqlite3 is a native addon marked external in vite.main.config.ts.
      // Without copying it, require('better-sqlite3') throws at runtime and the
      // copilot session DB silently falls back to filesystem scanning (TASK: SQLite
      // packaging gap in v1.8.0). Its runtime deps are `bindings` (used to locate
      // the .node file) and `file-uri-to-path` (transitive dep of bindings).
      const sqliteDeps = [
        'better-sqlite3',
        'bindings',
        'file-uri-to-path',
      ];
      for (const dep of sqliteDeps) {
        const depSrc = path.join(__dirname, 'node_modules', dep);
        const depDest = path.join(appDir, 'node_modules', dep);
        if (fs.existsSync(depSrc) && !fs.existsSync(depDest)) {
          await fs.copy(depSrc, depDest);
        }
      }

      // fsevents is chokidar's macOS native backend (optionalDependency). When
      // present, chokidar uses a SINGLE efficient FSEvents watcher for the whole
      // session-state tree. When absent, chokidar with `usePolling:false` falls
      // back to per-directory fs.watch — which opens one fd per watched dir. On
      // accounts with thousands of ~/.copilot session dirs that instantly
      // exhausts file descriptors ("EMFILE: too many open files, watch"),
      // saturating the main event loop so renderer startup IPC stalls and the
      // app hangs forever on "Restoring session...". Bundling fsevents restores
      // the FSEvents path. macOS-only: the module simply won't exist on Win/Linux
      // build machines, so the existsSync guard skips it there.
      const fseventsSrc = path.join(__dirname, 'node_modules', 'fsevents');
      const fseventsDest = path.join(appDir, 'node_modules', 'fsevents');
      if (fs.existsSync(fseventsSrc) && !fs.existsSync(fseventsDest)) {
        await fs.copy(fseventsSrc, fseventsDest);
      }

      // Copy the assets folder (icons, clawpilot.png, etc.) into the
      // packaged app. Main-process code resolves these via app.getAppPath()
      // + assets/<name> for notification icons and similar runtime assets.
      const assetsSrc = path.join(__dirname, 'assets');
      const assetsDest = path.join(appDir, 'assets');
      if (fs.existsSync(assetsSrc)) {
        await fs.copy(assetsSrc, assetsDest);
      }

      console.log(`Copied native/external modules to ${appDir}`);
    },
  },
  packagerConfig: {
    asar: false,
    name: "tmax",
    executableName: "tmax",
    icon: "./assets/icon",
    ...(windowsSign ? { windowsSign } : {}),
  },
  makers: [
    // Windows
    new MakerSquirrel({ authors: "tmax", description: "Powerful multi-terminal app", setupIcon: "./assets/icon.ico", iconUrl: "https://raw.githubusercontent.com/InbarR/tmax/main/assets/icon.ico", ...(windowsSign ? { windowsSign } : {}) }),
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
