# Codex Intro

An unofficial startup-animation mod for the Codex / ChatGPT desktop app. It plays a skippable 12-second intro, then leaves an optional translucent wallpaper. Native font sizes, icons, spacing and saved zoom are preserved.

The mod does not patch the installed app, change its CSP, replace its profile, or manage account credentials.

## Linux installation

Requirements:

- Linux and a compatible Codex / ChatGPT desktop app, installed separately.
- Node.js 22 or newer. The `codex` terminal CLI alone is not the desktop app.
- A desktop entry named `chatgpt.desktop`, or its filename supplied with `--desktop-id`.

From the project root:

```sh
./install.sh
```

Fully quit Codex, then open its **normal app icon**. The intro is now included on each cold start. No terminal needs to remain open. Closing with `./close-codex.sh` and reopening the normal icon also works.

Installation is per-user and requires no `sudo`. It copies a self-contained runtime to `~/.local/share/codex-intro/` and overrides the existing desktop entry under `~/.local/share/applications/`. The previous user entry is backed up exactly. App names, icons, original arguments and MIME/URL handlers are retained.

Your existing profile, sign-in, conversations and appearance customizations are not deleted or replaced. Installing or uninstalling does not terminate the running app; fully quit and reopen to switch the active appearance.

For a differently named desktop entry:

```sh
./install.sh --desktop-id com.example.Codex.desktop
```

### Uninstall

Either right-click the app icon and choose **Uninstall startup intro** where desktop actions are supported, or run:

```sh
./uninstall.sh
```

If the source checkout is no longer available:

```sh
~/.local/share/codex-intro/uninstall.sh
```

Then fully quit and open the normal icon. The original launcher is restored byte-for-byte, or the user override is removed if the original came from the system. The installed desktop app, account session, conversations and saved mod customizations are retained. Removal does not require signing in again because it does not reset the app profile.

If the desktop entry was edited after installation, uninstall stops instead of overwriting those changes. Move the edited entry aside and rerun uninstall; the original backup remains in `installation.json` until restoration succeeds.

### Update and status

Rerun `./install.sh` after updating this checkout. The installed copy is refreshed without replacing the original backup. Editing or moving the source checkout does not affect the installed runtime until it is reinstalled.

```sh
node extension/linux/integration.mjs status
```

The installer honors absolute `XDG_DATA_HOME`, `XDG_DATA_DIRS` and `XDG_STATE_HOME` values. Logs are retained at `~/.local/state/codex-intro/launcher.log` for diagnostics. No autostart entry, system service or permanent debugging TCP port is installed.

## Manual launch without installation

Save your work and fully quit the desktop app. Run from a separate terminal:

```sh
node extension/linux/run.mjs
```

Keep that terminal open: the app's private debugging pipe must stay open until Quit. This is a one-session launch and does not change the normal app icon.

The default executable is `chatgpt`. A trusted custom executable can be selected explicitly:

```sh
node extension/linux/run.mjs --app /absolute/path/to/chatgpt
```

On Wayland, the standard launcher uses native Wayland rather than XWayland. An optional `--ui-scale 95` or `--ui-scale 90` deliberately enables a more compact interface; omit it to preserve the app's native sizing.

## Appearance settings

Use **Ctrl+Alt+B** on Linux or **Cmd+Option+B** on macOS. Press **Esc** or click **Skip** to end playback. Reduced-motion preferences are respected.

| Control | Behavior |
| --- | --- |
| Avatar | PNG, JPEG or WebP; square 512 × 512 crop |
| Background | Fits the full image into a 1536 × 1024 canvas, then generates contours |
| Opening title and caption | Editable text; blank fields hide the corresponding label |
| Artwork subtitle | Editable text shown during the artwork stage |
| Wallpaper strength | 0–75%; 0 disables wallpaper; default 42% |
| Save and preview | Saves local changes and replays the intro |
| Close / Esc in settings | Discards unsaved changes |
| Use defaults | Selects the bundled images and English text; save to apply |
| Restore Codex appearance | Removes the current appearance layer and shortcut, without deleting saved settings or uninstalling the launcher |

Images and settings are stored locally in IndexedDB and are not uploaded. Individual image files can be up to 30 MB. Desktop integration and standalone previews use separate storage.

Wallpaper, intro artwork and contours use centered **contain** sizing. The entire runtime image remains visible without stretching. Different window aspect ratios produce dark margins rather than cropping. Only backgrounds and transparency change in the host app.

The opening avatar uses the **Artificial Girl** concept: an original cybernetic anime portrait with baked-in analog glitch. Wallpaper margins contain sparse, low-contrast static signal fragments and scanlines. The texture sits behind the opaque photograph, so it never overlays or crops the image. It has no animation, blur, shader or background frame loop, and disappears when wallpaper is disabled or the original appearance is restored.

## Troubleshooting

- **Already running:** a second installed-icon click activates the existing app without replaying the intro. Fully quit for a new intro.
- **A custom keyboard shortcut bypasses the intro:** shortcuts that invoke the `chatgpt` binary directly are unchanged. Point them at `~/.local/share/codex-intro/launch.sh` or the desktop entry instead.
- **No window to quit:** save any pending work, then run `./close-codex.sh` from a separate terminal. It sends SIGTERM and forces shutdown after 10 seconds if necessary. Do not delete profile lock files.
- **Intro fails after an app update:** the installed launcher attempts a plain launch on startup failure. Uninstall the mod if the build is incompatible.
- **Appearance disappears after reload or a new window:** there is no automatic reinjection. Fully quit and relaunch to apply the intro again.
- **Old customized text:** choose Use defaults and Save and preview. Only known former built-in text defaults are automatically normalized to English; custom text remains untouched.

Linux runtime testing covers Arch Linux `chatgpt-bin` 26.1029.61003-1 with its Owl/Chromium runtime, using isolated signed-out profiles under Xvfb and native Wayland. Other package formats are not verified. The app must support `--remote-debugging-pipe`.

## macOS

Requires macOS 13+, Xcode Command Line Tools and the desktop app with bundle ID `com.openai.codex`.

```sh
bash tools/build-extension.sh
bash tools/build-macos.sh
```

| Output | Purpose |
| --- | --- |
| `dist/codex-intro.app` | Desktop intro launcher |
| `dist/codex-intro-preview.app` | Standalone native preview |

Quit the desktop app with Cmd+Q, then open `dist/codex-intro.app` or `launch-codex.command`. The preview is available through `preview-animation.command`. The macOS launcher uses Node bundled with the installed app; its original integration target is desktop version 26.924.22138. Native app identifiers are retained so existing preview storage remains available.

Linux install/uninstall commands do not modify macOS applications. To remove a macOS launcher, remove its generated bundle and continue using the original desktop app.

## Browser preview

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the local preview](http://127.0.0.1:8765/index.html). This does not start or modify the desktop app. Windows desktop integration is not implemented.

## Development

```sh
node --test tools/*.test.mjs
```

Real desktop QA requires the desktop app and Xvfb:

```sh
xvfb-run -a -s '-screen 0 1280x900x24' node tools/linux-desktop-smoke.mjs
xvfb-run -a -s '-screen 0 1280x900x24' node tools/linux-install-smoke.mjs
```

These use disposable signed-out profiles. The first verifies playback, responsive wallpaper, settings, restoration and native typography. The second verifies installed desktop launches, repeated cold starts, activation and uninstall. To test native Wayland playback, run `node tools/linux-desktop-smoke.mjs --wayland`; it opens an isolated test window. QA artifacts are written under `.build/`.

For a mock host:

```sh
node tools/extension-preview.mjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the mock host](http://127.0.0.1:8765/.build/extension-preview/). Mock-host success alone does not establish real-app compatibility.

## Project structure

| Path | Purpose |
| --- | --- |
| `install.sh`, `uninstall.sh` | Per-user Linux installation and rollback |
| `close-codex.sh` | Linux desktop shutdown helper |
| `extension/` | Shared appearance payload and platform launchers |
| `native/` | macOS launchers and native preview |
| `assets/` | Runtime avatar, background, contours and macOS launcher icon |
| `tools/` | Tests, builds and asset preparation |
| `docs/` | Technical implementation and asset references |

See [desktop integration](docs/desktop-integration.md), [asset references](docs/references.md) and [the avatar specification](docs/artificial-girl-avatar.md). Internal storage and bridge identifiers are compatibility keys, not user-facing branding. Source filenames use lowercase kebab-case; conventional uppercase documents stay at the project root. Platform-required bundle metadata such as `Info.plist` retains its standard name.

This project is not affiliated with OpenAI. No project code license has been specified. Third-party artwork and logos retain their separate rights.
