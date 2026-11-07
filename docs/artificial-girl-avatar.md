# Artificial Girl avatar

## Runtime asset

- File: `assets/artificial-girl-avatar.jpg`.
- Format: 512 × 512, sRGB JPEG, opaque dark background.
- Original fictional cybernetic portrait with baked-in static scanlines, RGB separation and displaced fragments.
- Created with the built-in image generation tool; no reference image or API/CLI fallback was used.
- The default opening title is `ARTIFICIAL GIRL`. Custom avatars and text remain local and take precedence, except recognized former built-in text defaults.
- The image is used only inside the intro; it does not replace the installed app icon or the persistent background photograph.

The selected square output is downsampled with ImageMagick using `-resize 512x512 -strip -sampling-factor 4:4:4 -quality 94`. Only the runtime JPEG is shipped. Its glitch is baked into the artwork, not an ongoing animation or shader.

## Generation prompt

```text
Use case: stylized-concept.
Asset type: one square opening-avatar illustration for a polished dark desktop startup sequence, intended to read clearly at 512x512 and 160px.
Primary request: ARTIFICIAL GIRL — an original fictional young adult artificial woman, atmospheric and introspective, mixing late-1990s psychological cyberpunk anime with analog computer/video artifacts. Suggest a consciousness living between a person and a computer network without referencing or copying any named character or franchise.
Subject: head-and-shoulders portrait, short slightly uneven dark brown-black hair, pale ivory skin, quiet lucid eyes looking toward the viewer, restrained ambiguous expression. A dark high-neck technical jacket. Human first, subtly synthetic, not a generic armored robot. Fine cable/data traces dissolve into the darkness near the outer silhouette.
Composition: centered face, near-frontal with a slight natural head tilt, complete head with safe padding, shoulders fade into a near-black plum #08060d background. Portrait fills roughly 78 percent of the square, strong silhouette and clear eyes for a small avatar. No surrounding UI frame; the app supplies its own radar frame.
Style: cinematic hand-drawn anime cel illustration with delicately textured shadows, sparse analog film grain and CRT scanlines. Dark muted palette with pale skin, dusty magenta and cold cyan electronic accents.
Glitch: bake a controlled static digital glitch into the image itself — a few thin horizontally displaced slices across hair and one cheek, restrained red/cyan channel separation, short data fragments at the edges. Keep the face, eyes and identity readable; the glitch is intentional and elegant rather than noisy destruction.
Mood: uncanny, lonely, intelligent, quietly synthetic; sophisticated rather than cute or sexualized.
Text: none. No letters, Japanese writing, code, logos, signatures or watermarks.
Avoid: recognizable existing characters, explicit franchise symbols, school uniforms, nudity, horns, demon imagery, large robot armor, a busy city scene, extreme facial distortion, aggressive bloom, white backgrounds, multiple variants or a mockup.
```
