# Desktop integration

## Shared payload

`extension/payload.mjs` packages local HTML, iframe CSS, settings, images and animation code. `extension/renderer.mjs` installs a temporary iframe in the main `app://-/index.html` window, checks message source identity, manages the wallpaper and settings shortcut, and removes the overlay after playback.

The host receives only `extension/wallpaper.css`: background and transparency rules, without typography or sizing overrides. The intro stylesheet is confined to its iframe. Artwork and contour canvases use the same centered contain projection. Restore removes the stylesheet, wallpaper URL, keyboard listener and overlay, restoring prior root values.

The wallpaper's background stack is ordered as a viewport wash, the opaque contained photo, and six low-opacity static glitch layers. The photo naturally occludes the texture; only letterbox margins expose it. Every texture layer is a CSS gradient with fixed viewport placement, without animation, filter, extra DOM, a resize observer or a rendering loop. The ordinary wallpaper-strength and Restore controls cover all layers.

The IndexedDB database `aemeath-startup-images`, bridge identifiers and native bundle identifiers are retained for compatibility. Installation never migrates or deletes account credentials. Known legacy default text is normalized for rendering; custom images and text remain unchanged.

## Linux runtime

The launcher opens the desktop process with inherited Chromium DevTools file descriptors 3 and 4. No TCP listener is created. It identifies one main app page, rechecks its URL immediately before injection, then detaches the renderer session after playback starts. The Node parent holds the transport open until the app exits because the tested runtime exits on pipe EOF.

Native UI scale is the default. The explicit `--ui-scale 80-99` option is reversible and does not write app preferences. Wayland uses `--ozone-platform=wayland` unless the original launch command or a custom executable already controls the backend.

## Per-user installation

`extension/linux/integration.mjs` installs a self-contained runtime under `$XDG_DATA_HOME/codex-intro` and replaces only the selected per-user desktop entry. If no user entry exists, the system entry is used as a template and remains untouched.

The installation manifest stores:

- A schema/version marker and desktop ID.
- The exact prior user desktop entry bytes and mode, or null for a system-only entry.
- The original template, resolved executable and argument tokens.
- The hash of the installed desktop override.

Runtime files are staged before an atomic directory switch. Desktop entry writes use an atomic temporary-file rename. Updates preserve the first original backup. Uninstall restores that backup exactly, or removes the override to reveal the system entry. Unrecognized directories, symlinks and later user edits are not overwritten. A per-installation lock serializes install and uninstall.

The override retains app identity, MIME types and existing desktop actions. It sets `DBusActivatable=false` so activation uses the mod's `Exec` path, and adds an Uninstall startup intro action. Commands are parsed as arguments, never evaluated by a shell. URL field expansion preserves separate arguments, including sign-in callbacks. Callback URLs are not logged.

`extension/linux/installed-launcher.mjs` activates an existing app with its original command. A cold start uses the intro. An intro startup failure attempts a plain app launch; a normal exit or shutdown signal never triggers an automatic restart. It inherits the normal environment and profile paths, without adding `--user-data-dir` or substituting HOME.

`extension/linux/desktop-launcher.mjs` is a short-lived dispatcher. It starts the pipe holder in a new process group/session with log-file descriptors instead of terminal pipes, then exits. The app therefore does not depend on the menu process or invoking terminal remaining open.

Installation does not register an autostart program, a system service or a replacement `chatgpt` binary. A helper exists only while its associated app session is active. Source-checkout changes require rerunning install to refresh the copied runtime.

Logs remain under `$XDG_STATE_HOME/codex-intro/launcher.log` for diagnostics. A desktop cache refresh is attempted when `update-desktop-database` is available. No custom file associations are registered or removed outside the desktop entry itself.

## macOS runtime

`native/extension.swift` activates an existing app or validates its signature and identifier before invoking `extension/run.mjs`. The JavaScript helper verifies that its loopback debugging listener belongs to the expected app and user. Its TCP debugging port remains available until the desktop app fully quits.

The standalone player in `native/app.swift` uses WebKit with local assets. Native bundle identifiers are stable so renaming source files and generated bundles does not reset existing local preview settings.

## Limits

Desktop internals are not a stable extension API. Reloads, new windows and automatic app restarts may discard the appearance layer. There is no automatic reinjection. A package update may require a launcher update or uninstall. macOS bundle builds require macOS and cannot be validated by Linux-only syntax checks.

Desktop override behavior follows the [Desktop Entry specification](https://specifications.freedesktop.org/desktop-entry/latest-single/), including its [Exec quoting and field codes](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html).
