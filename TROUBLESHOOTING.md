# Troubleshooting

Start with the [Linux guide](docs/linux.md) or [macOS guide](docs/macos.md) to confirm requirements and supported launch methods. Desktop integration relies on app internals and may stop working after an app update.

## The launcher says the app is already running

Closing a window is not always the same as quitting the app. Save your work and use **Quit** in the app menu. On Linux, if there is no visible window, run this from a separate terminal:

```sh
./platforms/linux/close-codex.sh
```

Without the checkout, use `~/.local/share/codex-intro/close-codex.sh`. The helper identifies the desktop executable rather than trusting its process title. It sends SIGTERM, waits up to 10 seconds, then forces shutdown if needed. `--timeout 5`, `--force`, `--quiet` and `--help` are available. Forced shutdown can lose unsaved work.

Do not delete `SingletonLock`, reset the profile, or sign out to troubleshoot the mod.

## The normal icon opens without the intro

- Check installation with `node platforms/linux/integration.mjs status`.
- Fully quit before reopening. A second icon click activates the running app without replaying the intro.
- Rerun `./platforms/linux/install.sh` after changing or updating this checkout: the installed runtime is an independent copy.
- Shortcuts that call the `chatgpt` binary directly bypass the mod. Point them at `~/.local/share/codex-intro/launch.sh` or the managed desktop entry.
- For a differently named desktop entry, use `--desktop-id` as described in the [Linux guide](docs/linux.md).

Paths above assume default XDG directories. Some desktops cache pinned launchers; unpin and re-add the existing app entry if a stale shortcut remains.

## No window appears, or the app closes during startup

On Linux, inspect the launcher log:

```sh
tail -n 80 "${XDG_STATE_HOME:-$HOME/.local/state}/codex-intro/launcher.log"
```

Confirm that the Node.js executable used at installation still exists. Reinstall after changing Node versions or moving its installation. Confirm the original desktop app opens without the mod using the reversible uninstaller below.

An installed cold start attempts one plain-app launch if intro startup fails. Normal Quit or a shutdown signal never triggers an automatic restart. In a manual Linux launch, the terminal must remain open: closing its private debugging pipe can close the tested desktop runtime. Prefer the installed launcher for daily use.

If the desktop app fails even without the mod, troubleshoot the app/package separately. Do not remove your app profile or credentials as a mod recovery step.

## Uninstall or update refuses to overwrite a launcher

The installer deliberately preserves later user edits, symlinks and unrecognized directories. Keep a copy of any edited desktop entry. For an edited managed entry, move it out of the applications directory, then rerun uninstall to restore the original backup. Do not delete the installed runtime first: its private `installation.json` contains the original launcher bytes.

A stale `codex-intro.lock` directory can remain after an interrupted operation. Remove it **only after confirming no install or uninstall operation is running**, then retry. Its location is next to the installed runtime under the XDG data directory.

## Restore the original appearance

**Restore Codex appearance** in settings removes the current overlay and wallpaper. It does not uninstall the launcher or delete saved settings; a future cold start can apply the mod again.

To remove the Linux integration completely:

```sh
./platforms/linux/uninstall.sh
# Or, without the checkout:
~/.local/share/codex-intro/uninstall.sh
```

Use the installed path under your configured `XDG_DATA_HOME` if customized. Fully quit and reopen afterward. The original launcher is restored, or the user override is removed to reveal the system entry. The desktop app, profile, conversations and sign-in are not removed.

On macOS, quit the desktop app, stop using/remove the generated launcher bundle, then open the original app. This also closes the app's temporary debugging listener.

## Appearance disappears after reload or in a new window

There is no automatic reinjection into reloads, new windows or app restarts. Fully quit and relaunch using the integrated entry point. If an app update changes the main-window structure, uninstall until compatibility is restored.

## Unexpected text, images or sizing

Choose **Use defaults**, then **Save and preview**. Only recognized former built-in text defaults are normalized automatically; custom text and images are not overwritten. Standalone previews and desktop integration have separate local storage.

Native UI sizing is the default. If a manual launch used `--ui-scale`, omit it on the next launch. The wallpaper intentionally uses centered `contain` sizing: the full image is visible, with static low-contrast texture in unused margins.

## Reporting an issue

Include OS/session type (Wayland or X11), desktop package/version, Node.js version, launch method, installation status and a short reproduction. State whether the original app works after uninstall. Redact callback URLs, tokens, private paths and conversation contents from logs and screenshots.
