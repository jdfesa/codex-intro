# References and asset credits

The original project used the following projects as implementation references. It did not copy their source code and does not require installing or running them.

| Reference | What it informed |
| --- | --- |
| [Tangc/codex-skin-launcher](https://github.com/Tangc/codex-skin-launcher) | Native macOS windows, application identifiers, and a separate launch entry point |
| [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin) | Full-window wallpaper, transparent surfaces, local CDP access, and process verification |
| [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation) | A skippable intro overlay, cleanup after playback, waiting for assets, and timeouts |

DSH uses its own overlay interface and cannot be installed directly into Codex. This project implements its animation and desktop integration independently and does not depend on a video library, a third-party runtime package, or continuous background monitoring.

## Visual assets

- The default avatar, `shared/web/assets/artificial-girl-avatar.jpg`, is a bundled cybernetic workstation illustration. See [asset notes](artificial-girl-avatar.md) for dimensions and display behavior. It is used only inside the intro and does not replace the installed app icon. Its inclusion does not imply a separate redistribution license.
- The default background, `shared/web/assets/artwork.jpg`, was resized and center-cropped from a local source image. The runtime background is 1536 × 1024, with matching contour coordinates in the same canvas space.
- `shared/web/assets/contours.js` was generated from the current runtime background with the same edge tracer used for custom imports. The macOS asset preparation tool can also regenerate default contours using Vision.
- The pink launcher icon is a recolored version of the original flower-shaped logo and is used to distinguish the personal launcher.
- The animation uses HTML, CSS, Canvas, and SVG. It has no soundtrack or remote font, CDN, or image requests.

The character artwork, logos, and project code have separate rights. Including third-party material does not grant any additional license to it.

## Fonts

Special Elite (Apache 2.0) and the OCR A implementation distributed by Matthew Skala are bundled locally with their respective notices. See [font sources, terms and checksums](fonts.md); OCR A's original distribution restrictions are not the same as Special Elite's license.
