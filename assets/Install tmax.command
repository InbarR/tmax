#!/bin/bash
#
# tmax installer — double-click this to install tmax cleanly.
#
# tmax is not signed with a paid Apple Developer certificate, so macOS Gatekeeper
# quarantines it when you download the DMG and blocks the first launch. This
# installer copies tmax into /Applications and clears that quarantine flag for
# you, so the app opens normally. (Future updates are handled automatically by
# tmax's built-in updater — you only need this the first time.)
#
set -u

# The DMG this script lives in is mounted read-only; the app sits next to us.
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/tmax.app"
DEST="/Applications/tmax.app"

echo "──────────────────────────────────────────────"
echo " tmax installer"
echo "──────────────────────────────────────────────"
echo

if [ ! -d "$SRC" ]; then
  echo "Error: could not find tmax.app next to this installer."
  echo "Make sure you ran this from inside the tmax disk image."
  echo
  read -r -p "Press Return to close." _
  exit 1
fi

# If tmax is already running, ask it to quit so we can replace it.
if pgrep -f "/Applications/tmax.app/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting the running copy of tmax..."
  osascript -e 'quit app "tmax"' 2>/dev/null || true
  sleep 2
  pkill -f "/Applications/tmax.app/Contents/MacOS/" 2>/dev/null || true
  sleep 1
fi

echo "Installing tmax to /Applications ..."
# Stage on the same volume, then swap by rename so a failure never leaves
# /Applications/tmax.app missing.
STAGE="/Applications/.tmax-install-new"
BACKUP="/Applications/.tmax-install-old"
rm -rf "$STAGE" "$BACKUP"

if ! cp -R "$SRC" "$STAGE" 2>/dev/null; then
  echo "Copy to /Applications failed — retrying with administrator rights..."
  # Fall back to an authenticated copy if /Applications needs admin.
  osascript -e "do shell script \"rm -rf '$STAGE' '$BACKUP'; cp -R '$SRC' '$STAGE'\" with administrator privileges" || {
    echo "Install failed. You can drag tmax.app to /Applications manually,"
    echo "then run:  xattr -cr /Applications/tmax.app"
    echo
    read -r -p "Press Return to close." _
    exit 1
  }
fi

# Swap the new bundle into place, keeping a backup until it succeeds.
if [ -d "$DEST" ]; then
  mv "$DEST" "$BACKUP" 2>/dev/null || sudo mv "$DEST" "$BACKUP" 2>/dev/null || true
fi
if ! mv "$STAGE" "$DEST" 2>/dev/null; then
  # restore on failure so tmax is never left missing
  [ -d "$BACKUP" ] && mv "$BACKUP" "$DEST" 2>/dev/null || true
  rm -rf "$STAGE"
  echo "Install failed while replacing the app; your previous tmax was restored."
  echo
  read -r -p "Press Return to close." _
  exit 1
fi
rm -rf "$BACKUP"

# Clear the download quarantine so Gatekeeper lets it launch.
echo "Clearing quarantine ..."
xattr -cr "$DEST" 2>/dev/null || true

echo "Launching tmax ..."
open "$DEST"

echo
echo "Done! tmax is installed in /Applications and starting up."
echo "You can close this window."
sleep 1
