# Development

## Module boundaries

- `shared/web/`: browser-native intro, settings, styles and visual assets. Asset URLs are relative to this directory.
- `shared/desktop/`: portable CDP helpers and appearance payload/renderer; no platform imports.
- `platforms/linux/`: Linux process detection, pipe transport, desktop-entry installation and session lifetime.
- `platforms/macos/`: native Swift entry points, app verification, loopback transport, bundle build and optional image tooling.
- `tests/`: portable contracts, platform tests and disposable-profile smoke tests.
- `tools/`: platform-neutral development entry points.

Runtime snapshots mirror source-relative directories. Linux installs shared + Linux only; macOS launcher bundles shared + macOS only. Generated Linux `launch.sh`, `uninstall.sh` and `close-codex.sh` remain stable public entry points. Platform code must not import the other platform; shared code must not depend on either.

Use English for code comments, UI and technical documentation. Source files use lowercase kebab-case; conventional uppercase documents stay at the root. Generated platform metadata such as `Info.plist` keeps its required name. Public documentation describes behavior and architecture, not session history.

## Automated tests

Node.js 22+ is sufficient; no package installation is needed:

```sh
node tools/test.mjs
```

The runner discovers root and shared `*.test.mjs` files plus Linux unit tests on Linux. It excludes opt-in `*-smoke.mjs` scripts. Coverage includes assets, target selection, platform boundaries, documentation links, shutdown, installation rollback and installed launcher behavior.

macOS packaging contracts use stub compiler/signing commands in a temporary workspace to verify resource paths, layout and metadata on Linux or macOS. They do **not** compile Swift, verify a signature or prove native runtime compatibility. Perform native builds on macOS separately.

## Browser previews

Serve the repository locally:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/shared/web/` for the standalone intro. This does not start or modify the desktop app.

The decorative startup code and cyan/violet traces share one playback clock with the avatar, contour assembly and animated portrait. They are visual effects, not live application logs. Pause, seeking, replay and skip control every layer together. Reduced-motion mode uses a static code sample without light traces or portrait footage; the persistent wallpaper remains stationary.

To generate a local mock desktop host first:

```sh
node tools/preview.mjs
```

With the same server, open `http://127.0.0.1:8765/.build/desktop-preview/`. It exercises injection, settings and restoration against `tests/fixtures/desktop-host.html`, not the actual app. Mock success alone does not establish desktop compatibility.

The default build includes the approved silent clip from `shared/web/media/intro-character.mp4`. To evaluate a different local clip without publishing it or replacing the artwork:

```sh
node tools/preview.mjs --motion tmp/intro-character-trimmed.mp4
```

The override is embedded only in this ignored preview build. Use `node tools/preview.mjs --still` to explicitly preview the still-only fallback instead. `--motion` and `--still` are mutually exclusive.

The bundled six-second clip plays once at its original speed after contour assembly, then blends back to the original still. The complete default sequence lasts 14.18 seconds, preserving the existing opening stages and closing shutter. Reduced-motion mode, custom backgrounds and unavailable media use the static 12-second sequence. No file is automatically loaded from `tmp/`, and the persistent wallpaper is never a video. Blocked or unsupported media falls back to the still without preventing startup; the host app's CSP is not modified.

## Linux desktop QA

Requires the separately installed desktop app and Xvfb. These scripts use disposable signed-out profiles and do not require access to user conversations or credentials:

```sh
xvfb-run -a -s '-screen 0 1280x900x24' node tests/linux/desktop-smoke.mjs
xvfb-run -a -s '-screen 0 1280x900x24' node tests/linux/install-smoke.mjs
```

The first checks playback, settings, restoration, responsive wallpaper and native typography. The second checks installed desktop launches, repeated cold starts, existing-instance activation, shutdown and exact uninstall. For native Wayland QA, `node tests/linux/desktop-smoke.mjs --wayland` opens an isolated test window. Artifacts go under `.build/` and are not versioned.

The desktop smoke test also accepts `--motion tmp/intro-character-trimmed.mp4` to verify a local candidate's decoding, normal-speed playback, pause/seek, reduced-motion fallback and removal after completion without changing the real user profile or the app's CSP.

## Default assets

Runtime JPEGs and contours are committed under `shared/web/assets/`; the selected six-second silent portrait is committed under `shared/web/media/`. Temporary source videos and references remain ignored. Ordinary builds do not need local source-image libraries or files from `tmp/`. Optional macOS tooling accepts explicit sources:

```sh
AVATAR_SOURCE=/absolute/path/to/avatar.png \
ARTWORK_SOURCE=/absolute/path/to/background.jpg \
  bash platforms/macos/prepare-defaults.sh
```

Image conversion and default contour regeneration use Swift/macOS frameworks. Ordinary builds keep versioned contours regardless of checkout timestamps. Use `REBUILD_CONTOURS=1 bash platforms/macos/prepare-defaults.sh` to explicitly retrace the current background. Review the resulting assets before committing. Source image collections, temporary build products and videos are ignored; only selected runtime assets and intentional documentation media should be published. See [asset rights](references.md).

The bundled motion is specific to the default artwork. A custom background imported through settings disables it. When rebuilding the default artwork itself, replace the matching clip as part of the same change rather than combining unrelated media.
