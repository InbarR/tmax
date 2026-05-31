---
id: TASK-183
title: Add Windows code signing via Azure Trusted Signing (OIDC) to build pipeline
status: Done
assignee: []
created_date: '2026-05-29 09:31'
updated_date: '2026-05-31 08:46'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An Azure Trusted Signing account/certificate profile is now available for tmax. Wire Windows code signing into the electron-forge build so the downloaded Setup.exe, the installed tmax.exe, and the portable .exe are all signed, removing SmartScreen/unknown-publisher warnings. Auth via GitHub OIDC federated identity (no stored secret). Windows-only; macOS still needs a separate Apple Developer cert (gatekeeper note stays). Needs from maintainer: Trusted Signing account name, certificate profile name, endpoint URI, tenant ID, app registration client ID; plus a GitHub 'release' environment + federated credential and the 'Trusted Signing Certificate Profile Signer' role on the service principal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Downloaded Windows Setup.exe is Authenticode-signed by the Trusted Signing certificate and passes SmartScreen without an unknown-publisher warning
- [x] #2 The installed tmax.exe (from the Squirrel package) and the portable-zip tmax.exe are signed
- [x] #3 CI authenticates to Azure via OIDC federated identity with no client secret stored in the repo
- [x] #4 Signing runs only on v* tag release builds; PR and main builds still succeed unsigned
- [x] #5 forge.config.ts and .github/workflows/build.yml updated; Trusted Signing identifiers stored as repo variables, not hardcoded
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Windows code signing via Azure Trusted Signing (OIDC) is live and validated.

Implementation (PR #122, merged): scripts/windows-sign.cjs (@electron/windows-sign hook calling Invoke-TrustedSigning), forge.config.ts (windowsSign on packager + MakerSquirrel, gated on WINDOWS_SIGN=1), and build.yml (id-token permission, conditional release environment, azure/login OIDC, TrustedSigning module install, WINDOWS_SIGN/TRUSTED_SIGNING_* env - all gated to win32 tag builds).

Validated on tag v1.9.2-rc1: Azure OIDC login succeeded, Trusted Signing signed tmax.exe + bundled DLLs, and the published x64 Setup.exe verifies as Authenticode Status=Valid, Signer CN=Inbar Rotem, issued by Microsoft ID Verified CS AOC CA 03, RFC-3161 timestamped. Windows only; macOS still needs an Apple Developer cert.
<!-- SECTION:FINAL_SUMMARY:END -->
