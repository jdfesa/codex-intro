# Intro typography

Fonts are versioned under `shared/web/assets/fonts/` and loaded locally. There are no Google Fonts API, CDN or other font requests at runtime. The font binaries are unmodified; filenames use the repository's lowercase kebab-case convention.

| Family | Role | File | Upstream and terms |
| --- | --- | --- | --- |
| Special Elite, Regular | Opening title, including Artificial Girl | `special-elite-regular.ttf` | [Google Fonts distribution](https://github.com/google/fonts/tree/main/apache/specialelite), Apache 2.0 |
| OCR A, Regular | Opening classification caption and artwork status subtitle | `ocr-a.ttf` | [Matthew Skala's OCR 0.3.1](https://tsukurimashou.org/ocr.php.en), original notices retained |

Special Elite supplies the imperfect typewriter texture. OCR A provides the machine-readable classification-label style. Both use their real regular outlines without synthetic bolding. They do not change host-app text, icons, menus or zoom.

## Distribution notices

The complete Special Elite license is included as [`special-elite-license.txt`](../shared/web/assets/fonts/special-elite-license.txt). Copyright metadata remains embedded in the unmodified font.

OCR A comes from `OCRA.ttf` in [the author's OCR 0.3.1 archive](https://tsukurimashou.org/files/ocr-0.3.1.zip), not the separately licensed commercial OCR-A products. Skala releases his contribution to the public domain, but the underlying Richard B. Wales notice still applies. The original credit, permission and disclaimer block is preserved in [`ocr-a-notice.txt`](../shared/web/assets/fonts/ocr-a-notice.txt). It limits fees for distributing the font/source to reasonable copying or communications charges. **Do not treat this font as OFL/Apache licensed or sell it under this project's name.** See the [upstream documentation](https://tsukurimashou.org/ocr.pdf) before redistributing.

These font terms do not establish a license for the rest of the project or its artwork. Both platforms distribute the font notices alongside the binaries.

## Loading and isolation

Browser and native WebKit previews use `shared/web/fonts.css` with relative local URLs. The desktop payload embeds the same font bytes and constructs binary `FontFace` sources in the temporary iframe; no font URL request or host CSP relaxation is needed. Faces are added only to that iframe's font set and removed with it. Playback waits for font loading before measuring text or capturing the identity texture. A load failure uses local monospace fallbacks rather than preventing the app from opening.

## Integrity

SHA-256 of the distributed binaries:

```text
a776fcb4ceb8bdf03e2967688ebdad42680de5b91a7e62c17e718ae212d14bc4  special-elite-regular.ttf
db3a70dcfab1fcc0e32f88f9413876dccd267a0e377dd8afa7a18e4fe7cba018  ocr-a.ttf
```
