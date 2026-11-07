# Linux

[Overview](../README.md) · [Troubleshooting](../TROUBLESHOOTING.md)

## Requirements and compatibility

- Linux, Node.js 22 or newer, and a separately installed Codex / ChatGPT desktop app.
- A working desktop entry named `chatgpt.desktop`, or another filename selected with `--desktop-id`.
- A desktop runtime supporting Chromium's `--remote-debugging-pipe` and the expected main-window structure.

Runtime QA has covered Arch Linux `chatgpt-bin` 26.1029.61003-1 with its Owl/Chromium runtime, isolated signed-out profiles under Xvfb, and native Wayland. Other package formats, including sandboxed packages, are not verified. The `codex` CLI is not a substitute for the desktop app.

## Install and update

From the repository root:

```sh
./platforms/linux/install.sh
# For another desktop-entry filename:
./platforms/linux/install.sh --desktop-id com.example.Codex.desktop
```

Save work, fully quit the app, then open its normal icon. No terminal needs to remain open. Installation does not close a running app. Updates use the same command after updating the checkout; when using a custom desktop ID, pass it again.

Installation requires no `sudo`. It copies only shared and Linux runtime files into a per-user directory and installs a desktop-entry override. Name, icon, original flags, existing desktop actions and MIME/URL handlers are retained. The first original user entry is backed up byte-for-byte, including its mode; a system-only entry remains untouched. Updates, including updates from the earlier repository layout, retain that original backup.

The runtime snapshot does not depend on the source checkout. Moving, editing or deleting the checkout does not change the installed copy until installation is run again. Keep the Node.js executable available; reinstall if its path changes.

```sh
node platforms/linux/integration.mjs status
node platforms/linux/integration.mjs status --json
```

## Installed files

| Default path | Purpose |
| --- | --- |
| `~/.local/share/codex-intro/` | Self-contained runtime snapshot |
| `~/.local/share/codex-intro/launch.sh` | Stable desktop/shortcut entry point |
| `~/.local/share/codex-intro/uninstall.sh` | Stable uninstaller, independent of checkout |
| `~/.local/share/codex-intro/close-codex.sh` | Stable shutdown-helper entry point |
| `~/.local/share/codex-intro/installation.json` | Private launcher backup and installation manifest |
| `~/.local/share/applications/chatgpt.desktop` | Per-user override for the selected desktop ID |
| `~/.local/state/codex-intro/launcher.log` | Diagnostics, retained after removal |

Absolute `XDG_DATA_HOME`, `XDG_DATA_DIRS` and `XDG_STATE_HOME` settings are honored. Relative values are ignored in favor of defaults. No autostart entry, service, replacement application binary or TCP debugging listener is installed. A detached helper holds the private debugging pipe only for the associated app session.

App profile paths, credentials, conversations and sign-in are not modified by installation or removal. Launches inherit the normal environment and do not substitute HOME or add a separate profile directory.

## Uninstall

Use **Uninstall startup intro** in the app icon's context menu where desktop actions are supported, or run:

```sh
./platforms/linux/uninstall.sh
# Without the checkout, using the default XDG data path:
~/.local/share/codex-intro/uninstall.sh
```

Fully quit and reopen the app afterward. Uninstall restores the first original user launcher exactly, or removes the override to reveal the system entry. Saved mod customization remains local. Later user edits are preserved rather than overwritten; see [recovery](../TROUBLESHOOTING.md#uninstall-or-update-refuses-to-overwrite-a-launcher).

## Manual one-session launch

Fully quit the app and run from a separate terminal:

```sh
node platforms/linux/run.mjs
# Optional trusted executable:
node platforms/linux/run.mjs --app /absolute/path/to/chatgpt
```

Keep the terminal open until the app quits. Manual launch does not change the normal icon. The standard executable is `chatgpt`; on Wayland the standard launcher selects the native Wayland backend. Custom executables control their own backend flags.

The default UI scale is 100, preserving native sizing. An explicit `--ui-scale 95` or `--ui-scale 90` enables a temporary compact UI; this does not write app preferences. The supported range is 80–100.

## Shutdown

Use the app's Quit menu, or save work and run `./platforms/linux/close-codex.sh` from a separate terminal. See `--help` for timeout and force options. A normal shutdown never triggers the installed launcher's startup fallback.
