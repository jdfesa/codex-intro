#!/usr/bin/env sh
# Install the intro for the current Linux user. No sudo or app-profile changes.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec node "$root/integration.mjs" install "$@"
