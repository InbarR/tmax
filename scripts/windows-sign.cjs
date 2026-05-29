// @electron/windows-sign hook for Azure Trusted Signing.
//
// electron-forge calls this once per file it wants to sign: the packaged
// app binaries during `package`, and the Squirrel Setup.exe during `make`.
// We sign each via the official `TrustedSigning` PowerShell module
// (Invoke-TrustedSigning), which wraps signtool + the Azure.CodeSigning
// dlib and authenticates with the ambient Azure credential established by
// `azure/login` (OIDC) in CI.
//
// Configuration comes from the environment so nothing sensitive lives in
// the repo:
//   TRUSTED_SIGNING_ENDPOINT  e.g. https://weu.codesigning.azure.net/
//   TRUSTED_SIGNING_ACCOUNT   the code signing account name
//   TRUSTED_SIGNING_PROFILE   the certificate profile name
//
// This hook is only wired up when WINDOWS_SIGN=1 (see forge.config.ts), so
// local/dev builds never attempt to sign.
const { execFileSync } = require('node:child_process');

module.exports = async function windowsSign(filePath) {
  const endpoint = process.env.TRUSTED_SIGNING_ENDPOINT;
  const account = process.env.TRUSTED_SIGNING_ACCOUNT;
  const profile = process.env.TRUSTED_SIGNING_PROFILE;

  if (!endpoint || !account || !profile) {
    throw new Error(
      'Trusted Signing not configured: set TRUSTED_SIGNING_ENDPOINT, ' +
      'TRUSTED_SIGNING_ACCOUNT and TRUSTED_SIGNING_PROFILE.',
    );
  }

  // Build the Invoke-TrustedSigning call. Single-quote the file path so
  // PowerShell treats it literally (paths can contain spaces).
  const psCommand = [
    'Invoke-TrustedSigning',
    `-Endpoint '${endpoint}'`,
    `-CodeSigningAccountName '${account}'`,
    `-CertificateProfileName '${profile}'`,
    `-Files '${filePath.replace(/'/g, "''")}'`,
    '-FileDigest SHA256',
    "-TimestampRfc3161 'http://timestamp.acs.microsoft.com'",
    '-TimestampDigest SHA256',
  ].join(' ');

  console.log(`[windows-sign] Signing ${filePath}`);
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
    stdio: 'inherit',
  });
};
