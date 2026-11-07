#!/bin/bash
# Build a native macOS bundle with the same shared-module layout as the repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
target="${1:-launcher}"
case "$target" in
  -h|--help)
    printf 'Usage: bash platforms/macos/build.sh [launcher|preview]\n'
    exit 0
    ;;
  launcher)
    name="codex-intro" source="launcher.swift" identifier="local.aemeath.extension"
    display_name="Codex Intro" version="0.3.5" revision="10"
    frameworks=(-framework AppKit)
    ;;
  preview)
    name="codex-intro-preview" source="player.swift" identifier="local.aemeath.startup"
    display_name="Codex Intro Preview" version="0.1.0" revision="1"
    frameworks=(-framework AppKit -framework WebKit)
    ;;
  *) printf 'Unknown build target: %s\n' "$target" >&2; exit 2 ;;
esac

bash platforms/macos/prepare-defaults.sh
mkdir -p .build/macos/module-cache dist/macos
staging="$(mktemp -d "$PWD/.build/macos/bundle-XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
bundle="$staging/$name.app"
output="dist/macos/$name.app"
runtime="$bundle/Contents/Resources/runtime"
mkdir -p "$bundle/Contents/MacOS" "$runtime/shared"
swiftc -O -module-cache-path .build/macos/module-cache "platforms/macos/$source" \
  -o "$bundle/Contents/MacOS/$name" "${frameworks[@]}"
cp -R shared/web "$runtime/shared/"
extra=""
if [ "$target" = launcher ]; then
  mkdir -p "$runtime/platforms/macos"
  cp -R shared/desktop "$runtime/shared/"
  cp platforms/macos/run.mjs "$runtime/platforms/macos/"
  cp platforms/macos/assets/codex-pink.icns "$bundle/Contents/Resources/codex-pink.icns"
  extra='<key>CFBundleIconFile</key><string>codex-pink.icns</string><key>LSUIElement</key><true/>'
fi
cat > "$bundle/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>$name</string>
<key>CFBundleIdentifier</key><string>$identifier</string>
<key>CFBundleName</key><string>$display_name</string>
<key>CFBundleDisplayName</key><string>$display_name</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$revision</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
$extra
</dict></plist>
PLIST
codesign --force --sign - "$bundle"
# Replace only the selected generated bundle after compilation and signing succeed.
rm -rf -- "$output"
mv -- "$bundle" "$output"
printf 'Built: %s\n' "$PWD/$output"
