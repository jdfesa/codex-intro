# Artificial Girl avatar

## Runtime asset

- File: `shared/web/assets/artificial-girl-avatar.jpg`.
- Format: 2752 × 1536, sRGB JPEG.
- Content: a cybernetic woman at a workstation surrounded by displays and cables.
- Display: centered `object-fit: cover` inside the square intro avatar frame; source bytes are not resized or rewritten at launch.
- Scope: intro only, not the installed app icon or persistent wallpaper.

The default opening title is `ARTIFICIAL GIRL`. Custom avatars and text are stored locally and take precedence, except recognized former built-in text defaults. Imported custom avatars are processed to a 512 × 512 square; that import format does not constrain the dimensions of the bundled source image.

Only the selected runtime image belongs in the distributed assets directory. Local backups and source variants are not required for playback. Default-image tooling can produce a smaller square runtime image when an explicit source is provided; see [development](development.md#default-assets).

Asset provenance and redistribution rights must be assessed separately from project code. See [references and asset credits](references.md).
