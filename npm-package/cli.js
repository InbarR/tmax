#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const INSTALL_DIR = path.join(__dirname, "app");

function findExecutable() {
  if (!fs.existsSync(INSTALL_DIR)) {
    console.error("tmax is not installed. Run: npm rebuild tmax-terminal");
    process.exit(1);
  }

  const entries = fs.readdirSync(INSTALL_DIR);
  const platform = process.platform;

  if (platform === "win32") {
    // Look for tmax.exe in the extracted directory
    for (const entry of entries) {
      const exe = path.join(INSTALL_DIR, entry, "tmax.exe");
      if (fs.existsSync(exe)) return exe;
    }
    const flat = path.join(INSTALL_DIR, "tmax.exe");
    if (fs.existsSync(flat)) return flat;
  }

  if (platform === "darwin") {
    // Return the .app BUNDLE path (not the inner Mach-O). Launching the inner
    // binary directly often fails to surface a window on macOS; we open the
    // bundle via LaunchServices instead (see the launch code below).
    for (const entry of entries) {
      const app = path.join(INSTALL_DIR, entry, "tmax.app");
      if (fs.existsSync(app)) return app;
    }
    const flatApp = path.join(INSTALL_DIR, "tmax.app");
    if (fs.existsSync(flatApp)) return flatApp;
  }

  if (platform === "linux") {
    for (const entry of entries) {
      const bin = path.join(INSTALL_DIR, entry, "tmax");
      if (fs.existsSync(bin)) return bin;
    }
    const flat = path.join(INSTALL_DIR, "tmax");
    if (fs.existsSync(flat)) return flat;
  }

  console.error("Could not find tmax executable. Try reinstalling: npm rebuild tmax-terminal");
  process.exit(1);
}

const exe = findExecutable();
const args = process.argv.slice(2);

// Launch detached so the terminal is freed.
let child;
if (process.platform === "darwin") {
  // `open -a <bundle> --args ...` hands off to LaunchServices, which reliably
  // brings the window to the foreground. Spawning Contents/MacOS/tmax directly
  // starts the process but often leaves no visible window.
  child = spawn("open", ["-a", exe, "--args", ...args], {
    detached: true,
    stdio: "ignore",
  });
} else {
  child = spawn(exe, args, {
    detached: true,
    stdio: "ignore",
  });
}
child.unref();
