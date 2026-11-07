#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash tools/prepare-defaults.sh
bundle="dist/codex-intro.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources/web/assets" "$bundle/Contents/Resources/web/extension" .build/module-cache
swiftc -O -module-cache-path .build/module-cache native/extension.swift -o "$bundle/Contents/MacOS/codex-intro" -framework AppKit
cp index.html style.css animation.js image-settings.js "$bundle/Contents/Resources/web/"
cp assets/artwork.jpg assets/artificial-girl-avatar.jpg assets/contours.js "$bundle/Contents/Resources/web/assets/"
rm -f "$bundle/Contents/Resources/web/assets/aemeath.png" "$bundle/Contents/Resources/web/assets/avatar.png" "$bundle/Contents/Resources/web/assets/avatar.jpg" "$bundle/Contents/Resources/web/assets/codex-evil-avatar.jpg" "$bundle/Contents/Resources/web/assets/artwork.jpeg"
cp extension/*.mjs extension/wallpaper.css "$bundle/Contents/Resources/web/extension/"
# Personal launcher icon only; the original app and its identifier are untouched.
cp assets/codex-pink.icns "$bundle/Contents/Resources/codex-pink.icns"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>codex-intro</string>
<key>CFBundleIdentifier</key><string>local.aemeath.extension</string>
<key>CFBundleName</key><string>Codex</string>
<key>CFBundleDisplayName</key><string>Codex</string>
<key>CFBundleIconFile</key><string>codex-pink.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.5</string>
<key>CFBundleVersion</key><string>10</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$bundle"
printf 'Built: %s\n' "$PWD/$bundle"
