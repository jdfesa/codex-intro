#!/usr/bin/env sh
# Restore the original desktop launcher without removing app data or sign-in.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$root/extension/linux/integration.mjs" uninstall "$@"
