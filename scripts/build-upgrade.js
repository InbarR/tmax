/**
 * Build tmax to out-next/.
 *
 * Usage:  npm run upgrade
 *
 * After the build finishes, close tmax manually, then run the printed
 * command in a regular cmd/powershell window to swap and relaunch.
 */

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const outNext = path.join(root, 'out-next');
const outCurrent = path.join(root, 'out', 'tmax-win32-x64');

async function main() {
  if (fs.existsSync(outNext)) {
    console.log('Cleaning previous out-next/ ...');
    fs.rmSync(outNext, { recursive: true, force: true });
  }

  console.log('Packaging tmax to out-next/ ...');
  const { ForgeAPI } = require('@electron-forge/core');
  const forge = new ForgeAPI();
  await forge.package({
    dir: root,
    outDir: outNext,
    platform: 'win32',
    arch: 'x64',
  });
  console.log('Package complete.\n');

  const newExe = path.join(outNext, 'tmax-win32-x64', 'tmax.exe');
  if (!fs.existsSync(newExe)) {
    console.error('ERROR: New build not found at', newExe);
    process.exit(1);
  }

  // Write a small swap script the user can run after closing tmax
  const cmdPath = path.join(root, '_swap.cmd');
  const script = [
    '@echo off',
    'echo Swapping tmax build...',
    'taskkill /F /IM tmax.exe >nul 2>&1',
    'timeout /t 2 /nobreak >nul',
    `rmdir /S /Q "${outCurrent}"`,
    `move "${path.join(outNext, 'tmax-win32-x64')}" "${outCurrent}"`,
    `rmdir /S /Q "${outNext}" 2>nul`,
    'echo Starting tmax...',
    `start "" "${path.join(outCurrent, 'tmax.exe')}"`,
  ].join('\r\n');
  fs.writeFileSync(cmdPath, script, 'utf-8');

  console.log('=== BUILD READY ===');
  console.log('Now close tmax, then run this in a separate cmd/powershell:\n');
  console.log(`  ${cmdPath}\n`);
  console.log('Or manually: close tmax, delete out\\tmax-win32-x64, move out-next\\tmax-win32-x64 there, launch tmax.exe');
}

main().catch((err) => {
  console.error('Upgrade failed:', err);
  process.exit(1);
});
