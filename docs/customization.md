# Customization

[Overview](../README.md) · [Troubleshooting](../TROUBLESHOOTING.md)

Press **Ctrl+Alt+B** on Linux or **Cmd+Option+B** on macOS to open settings. **Esc** or **Skip** ends the intro. Reduced-motion preferences are respected.

## Controls

| Control | Behavior |
| --- | --- |
| Avatar | PNG, JPEG or WebP; square 512 × 512 crop |
| Background | Fits the full image into a 1536 × 1024 canvas and generates contours |
| Opening title and caption | Editable text; blank fields hide the corresponding label |
| Artwork subtitle | Text shown during the artwork stage |
| Wallpaper strength | 0–75%; 0 disables wallpaper; default 42% |
| Save and preview | Saves local changes and replays the intro |
| Close / Esc in settings | Discards unsaved changes |
| Use defaults | Selects bundled images and English text; save to apply |
| Restore Codex appearance | Removes the current appearance layer and shortcut, without uninstalling or deleting saved settings |

## Images and layout

Wallpaper, intro artwork and contour canvases share centered **contain** sizing. The full runtime image remains visible without stretching. Different aspect ratios leave margins rather than cropping the artwork. Tiled, static signal fragments, scanlines and a muted cyan/plum tint fill the entire exposed area without animation, blur, shaders or a background frame loop. They sit behind the opaque photo and disappear with the wallpaper.

The default **Artificial Girl** avatar uses a cybernetic workstation illustration. See [asset notes](artificial-girl-avatar.md) and [credits](references.md). It is not the installed app icon.

The default intro includes decorative code, cyan/violet traces and a bundled six-second silent portrait clip. The complete sequence lasts about 14.2 seconds. The clip plays once at normal speed, then returns to the original JPG; it never becomes the persistent wallpaper. Custom background images disable the default clip rather than combining unrelated artwork. Reduced-motion mode uses static code without light traces or video and retains the 12-second still sequence. Unsupported or unavailable media also falls back to the still.

Host font sizes, icons, spacing and saved zoom are unchanged by default. Intro CSS is isolated in a temporary iframe; only decorative backgrounds and transparency remain after playback. An optional manual Linux `--ui-scale` setting is separate from visual customization.

The opening title uses **Special Elite**; the classification caption and **Ready to use.** subtitle use **OCR A**. These fonts are bundled locally and apply to the intro only. See [typography and font notices](fonts.md).

## Local storage and privacy

Images and settings are stored locally in IndexedDB and are not uploaded by the mod. Individual source image files may be up to 30 MB. Desktop integration, browser preview and native standalone preview use separate storage contexts. Installing, updating or uninstalling the launcher does not clear customization or the app's sign-in.

Known former built-in text defaults normalize to English when rendered. Arbitrary custom text and images are preserved. To reset the selected appearance, choose **Use defaults**, then **Save and preview**.
