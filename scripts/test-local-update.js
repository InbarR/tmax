#!/usr/bin/env node
/**
 * Local Update Test Server
 *
 * Simulates GitHub's release API so you can test the full Squirrel update flow
 * without pushing to CI.
 *
 * Usage:
 *   1. Build the current version:  npm run build   (produces v1.4.8 installer)
 *   2. Install it via the Setup.exe
 *   3. Bump version in package.json to 1.4.9 (or higher)
 *   4. Rebuild:  npm run build
 *   5. Run this script:  node scripts/test-local-update.js
 *   6. Launch the INSTALLED (old) version with:
 *        set TMAX_UPDATE_TEST_URL=http://localhost:9999
 *        "C:\Users\<you>\AppData\Local\tmax\tmax.exe"
 *   7. Watch DevTools console (Ctrl+Shift+I) for [update] logs
 *
 * What this does:
 *   - Scans out/make/squirrel.windows/ for RELEASES + .nupkg files
 *   - Serves a fake /releases/latest JSON (mimicking GitHub API)
 *   - Serves the actual RELEASES file and nupkg for Squirrel to download
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9999;

// Find Squirrel output
function findSquirrelOutput() {
  const baseDir = path.join(__dirname, '..', 'out', 'make', 'squirrel.windows');
  if (!fs.existsSync(baseDir)) {
    console.error(`ERROR: ${baseDir} not found. Run "npm run build" first.`);
    process.exit(1);
  }

  // Find the arch subfolder (x64 or arm64)
  const archDirs = fs.readdirSync(baseDir).filter(d =>
    fs.statSync(path.join(baseDir, d)).isDirectory()
  );

  if (archDirs.length === 0) {
    console.error(`ERROR: No architecture folders found in ${baseDir}`);
    process.exit(1);
  }

  const archDir = path.join(baseDir, archDirs[0]);
  console.log(`Found Squirrel output in: ${archDir}`);

  // Find RELEASES file
  const releasesPath = fs.readdirSync(archDir).find(f => f === 'RELEASES');
  if (!releasesPath) {
    console.error(`ERROR: No RELEASES file found in ${archDir}`);
    process.exit(1);
  }

  // Find nupkg file
  const nupkgFile = fs.readdirSync(archDir).find(f => f.endsWith('.nupkg'));
  if (!nupkgFile) {
    console.error(`ERROR: No .nupkg file found in ${archDir}`);
    process.exit(1);
  }

  // Find Setup exe to determine version
  const setupFile = fs.readdirSync(archDir).find(f => f.endsWith('Setup.exe'));

  const releasesContent = fs.readFileSync(path.join(archDir, 'RELEASES'), 'utf8');
  const nupkgPath = path.join(archDir, nupkgFile);
  const nupkgSize = fs.statSync(nupkgPath).size;

  // Extract version from nupkg filename (e.g., tmax-1.4.9-full.nupkg)
  const versionMatch = nupkgFile.match(/(\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '0.0.0';

  return {
    archDir,
    releasesContent,
    nupkgFile,
    nupkgPath,
    nupkgSize,
    version,
    setupFile,
  };
}

const sq = findSquirrelOutput();
console.log(`\nServing update for version: v${sq.version}`);
console.log(`  RELEASES: ${sq.releasesContent.trim()}`);
console.log(`  nupkg: ${sq.nupkgFile} (${(sq.nupkgSize / 1024 / 1024).toFixed(1)} MB)`);

// Build the fake GitHub release JSON
const baseUrl = `http://localhost:${PORT}`;
const fakeRelease = {
  tag_name: `v${sq.version}`,
  html_url: `${baseUrl}/release`,
  body: `Test release v${sq.version} served from local build`,
  assets: [
    {
      name: 'RELEASES',
      browser_download_url: `${baseUrl}/download/RELEASES`,
    },
    {
      name: sq.nupkgFile,
      browser_download_url: `${baseUrl}/download/${sq.nupkgFile}`,
    },
  ],
};

// Rewrite RELEASES content so filenames point to our local download URLs
const rewrittenReleases = sq.releasesContent.split('\n').map(line => {
  const parts = line.trim().split(/\s+/);
  if (parts.length >= 2) {
    const filename = parts[1];
    const asset = fakeRelease.assets.find(a => a.name === filename);
    if (asset) {
      parts[1] = asset.browser_download_url;
    }
  }
  return parts.join(' ');
}).filter(Boolean).join('\n');

console.log(`\nRewritten RELEASES content:\n  ${rewrittenReleases}`);

const server = http.createServer((req, res) => {
  const url = req.url;
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  // GitHub API: /releases/latest
  if (url === '/releases/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fakeRelease));
    console.log('  -> Served fake release JSON');
    return;
  }

  // RELEASES file
  if (url === '/download/RELEASES') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(sq.releasesContent);
    console.log('  -> Served RELEASES file');
    return;
  }

  // nupkg file
  if (url === `/download/${sq.nupkgFile}`) {
    const stat = fs.statSync(sq.nupkgPath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
    });
    const stream = fs.createReadStream(sq.nupkgPath);
    stream.pipe(res);
    console.log(`  -> Streaming nupkg (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    return;
  }

  // 404 for anything else
  res.writeHead(404);
  res.end('Not found');
  console.log('  -> 404');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Update test server running on http://localhost:${PORT}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nTo test, launch the INSTALLED (older) version with:`);
  console.log(`\n  PowerShell:`);
  console.log(`    $env:TMAX_UPDATE_TEST_URL="http://localhost:${PORT}"; & "$env:LOCALAPPDATA\\tmax\\tmax.exe"`);
  console.log(`\n  CMD:`);
  console.log(`    set TMAX_UPDATE_TEST_URL=http://localhost:${PORT} && "%LOCALAPPDATA%\\tmax\\tmax.exe"`);
  console.log(`\nThen open DevTools (Ctrl+Shift+I) and watch for [update] logs.`);
  console.log(`The app should detect v${sq.version} and offer to update.\n`);
  console.log('Press Ctrl+C to stop.\n');
});
