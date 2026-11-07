# macOS

[Overview](../README.md) · [Troubleshooting](../TROUBLESHOOTING.md)

## Requirements and compatibility

- macOS 13 or newer with Xcode Command Line Tools (`swiftc` and `codesign`).
- The desktop app with bundle ID `com.openai.codex` and its bundled Node runtime.
- A compatible app build allowing the local debugging launch used by this integration.

The original integration target is desktop version 26.924.22138. Native builds and runtime behavior must be validated on macOS; Linux packaging-contract tests do not establish macOS compatibility.

## Build

From the repository root:

```sh
bash platforms/macos/build.sh launcher
bash platforms/macos/build.sh preview
```

| Output | Purpose |
| --- | --- |
| `dist/macos/codex-intro.app` | Desktop intro launcher, with a separate pink icon |
| `dist/macos/codex-intro-preview.app` | Standalone WebKit animation preview |

Bundles are ad-hoc signed locally, not notarized distribution packages. Build from a trusted checkout; do not disable system security checks to run an unknown download. The build includes ready-to-use assets and requires no downloaded Node dependencies.

## Launch and update

Save work and quit the desktop app with **Cmd+Q**, then open `dist/macos/codex-intro.app` or double-click `platforms/macos/launch.command`. If an app instance is already running, the launcher activates it instead of replaying the intro.

Open `dist/macos/codex-intro-preview.app` or `platforms/macos/preview.command` for the standalone preview. It does not launch the desktop app and has separate local storage.

To update, rebuild the relevant bundle. Its resources contain a self-contained snapshot of `shared/` and the macOS helper under `Contents/Resources/runtime/`, mirroring repository-relative paths. The launcher does not include Linux modules. Native bundle identifiers remain stable for storage compatibility.

Unlike Linux, this integration is a **separate launcher**: it does not override the normal app icon. Keep using the generated launcher for the intro, or the original app for a conventional launch.

## Security and removal

The launcher validates the target app's signature and identifier. The JavaScript helper checks the expected signing team and verifies that the debugging listener belongs to the current user and target app, restricted to `127.0.0.1`. The app's loopback debugging port stays available until the app fully quits; use this only on a trusted local machine.

To remove the integration, quit the desktop app, remove the generated launcher/preview bundles and stop using their `.command` shortcuts. Open the original app normally. No app files, account session or conversations need to be removed, and signing in again is not required. Linux installation scripts do not apply to macOS.

For optional default-image processing and contour tooling, see [development](development.md#default-assets).
