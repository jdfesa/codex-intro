#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
avatar="${AVATAR_SOURCE:-}"
artwork="${ARTWORK_SOURCE:-}"

# A fresh checkout includes ready-to-use assets, but not the local image library.
# Rebuild a default only when its optional source exists.
prepare_image() {
  local source="$1" output="$2" width="$3" height="$4"
  if [ -f "$source" ]; then
    if [ ! -f "$output" ] || [ "$source" -nt "$output" ] || [ platforms/macos/prepare-defaults.swift -nt "$output" ]; then
      mkdir -p .build/macos/module-cache
      if [ ! -x .build/macos/prepare-defaults ] || [ platforms/macos/prepare-defaults.swift -nt .build/macos/prepare-defaults ]; then
        swiftc -O -module-cache-path .build/macos/module-cache platforms/macos/prepare-defaults.swift -o .build/macos/prepare-defaults
      fi
      .build/macos/prepare-defaults "$source" "$output" "$width" "$height"
    fi
  elif [ ! -f "$output" ]; then
    printf 'Missing %s. Set AVATAR_SOURCE / ARTWORK_SOURCE to your source images.\n' "$output" >&2
    exit 1
  fi
}
if [ -n "${AVATAR_SOURCE:-}" ] && [ ! -f "$avatar" ]; then
  printf 'AVATAR_SOURCE does not exist: %s\n' "$avatar" >&2; exit 1
fi
if [ -n "${ARTWORK_SOURCE:-}" ] && [ ! -f "$artwork" ]; then
  printf 'ARTWORK_SOURCE does not exist: %s\n' "$artwork" >&2; exit 1
fi
prepare_image "$avatar" shared/web/assets/artificial-girl-avatar.jpg 512 512
prepare_image "$artwork" shared/web/assets/artwork.jpg 1536 1024
# Use versioned contours for ordinary builds; checkout timestamps are not asset changes.
if [ ! -f shared/web/assets/contours.js ] || [ "${REBUILD_CONTOURS:-0}" = 1 ] || { [ -n "$artwork" ] && [ shared/web/assets/artwork.jpg -nt shared/web/assets/contours.js ]; }; then
  mkdir -p .build/macos/module-cache
  swiftc -O -module-cache-path .build/macos/module-cache platforms/macos/trace-contours.swift -o .build/macos/trace-contours -framework Vision
  .build/macos/trace-contours shared/web/assets/artwork.jpg shared/web/assets/contours.js
fi
