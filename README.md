# Codex Intro

**A cinematic startup, then a quiet workspace.** An unofficial visual mod for the Codex / ChatGPT desktop app: a skippable 12-second intro followed by an optional translucent wallpaper.

<div align="center">

https://github.com/user-attachments/assets/61a0779c-7e02-46d7-b988-017d4bbd8b1c

</div>

[Download the demo](docs/media/codex-intro-demo.mp4) · 25 seconds · 2.6 MB

- **Your appearance:** customize the avatar, artwork and opening text locally.
- **Native sizing:** fonts, icons, spacing and saved zoom stay unchanged by default.
- **Reversible:** no app-file patches, profile resets or sign-in changes.

## Compatibility

| Platform | Integration | Requirements |
| --- | --- | --- |
| Linux | Persistent, per-user desktop launcher | Node.js 22+, compatible desktop app and `.desktop` entry |
| macOS | Separate native launcher and preview | macOS 13+, Xcode Command Line Tools, compatible desktop app |
| Windows | Not implemented | Browser preview only |

This depends on desktop internals, not a supported extension API. Package formats and app updates can affect compatibility. See the tested versions and limitations in the [Linux](docs/linux.md) and [macOS](docs/macos.md) guides. The `codex` terminal CLI alone is not the desktop app.

## Install on Linux

From a local checkout:

```sh
./platforms/linux/install.sh
```

Fully quit the desktop app, then open its **normal app icon**. No terminal needs to remain open. Installation is per-user, requires no `sudo`, and preserves the existing profile and sign-in.

For terminal access, run **`gpt`** or `chatgpt` from any directory. Both are shortcuts to the installed intro, not a separate application. See [terminal shortcuts and paths](docs/linux.md#terminal-shortcuts).

To quit completely on Linux, save your work and run [`./platforms/linux/close-codex.sh`](platforms/linux/close-codex.sh). Without the checkout, use `~/.local/share/codex-intro/close-codex.sh` (default XDG data path).

To uninstall, run the installed helper, then fully quit and reopen the app:

```sh
~/.local/share/codex-intro/uninstall.sh
```

That path uses the default XDG data directory. See [Linux installation](docs/linux.md) for custom paths, updates, manual launches and exact rollback behavior. For macOS, follow the [native launcher guide](docs/macos.md).

## Customize

Press **Ctrl+Alt+B** on Linux or **Cmd+Option+B** on macOS. Use **Esc** or click **Skip** to end playback. Images and settings stay local. See [customization](docs/customization.md) for all controls and privacy details.

## Repository layout

```text
codex-intro/
├── README.md
├── TROUBLESHOOTING.md
├── platforms/
│   ├── linux/          # Installation, desktop entry, process and pipe lifecycle
│   └── macos/          # Swift launchers, native bundles and asset preparation
├── shared/
│   ├── desktop/        # Appearance injection, CDP helpers and wallpaper
│   └── web/            # Intro, settings and bundled visual assets
├── tests/
│   ├── fixtures/       # Local mock desktop host
│   ├── linux/          # Linux unit tests and opt-in desktop smoke tests
│   └── shared/         # Portable asset, CDP and packaging contract tests
├── tools/              # Portable test runner and mock-host generator
└── docs/               # Technical guides, asset notes and preview media
```

## Documentation

- [Troubleshooting](TROUBLESHOOTING.md) — startup, launcher and recovery issues.
- [Linux](docs/linux.md) · [macOS](docs/macos.md) — platform setup and removal.
- [Customization](docs/customization.md) — images, text, wallpaper and local storage.
- [Typography](docs/fonts.md) — bundled fonts, loading and distribution notices.
- [Development](docs/development.md) — previews, tests and contribution conventions.
- [Desktop integration](docs/desktop-integration.md) — architecture and safety boundaries.
- [References and asset rights](docs/references.md) — credits and bundled artwork.

Not affiliated with OpenAI. No project code license has been specified; bundled third-party artwork and logos retain their separate rights.
