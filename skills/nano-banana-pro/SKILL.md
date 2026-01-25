---
name: nano-banana-pro
description: Generate or edit images via Gemini image generation API (formerly Nano Banana Pro).
homepage: https://ai.google.dev/gemini-api/docs/image-generation
metadata: {"clawdbot":{"emoji":"🍌","requires":{"bins":["uv"],"env":["GEMINI_API_KEY"]},"primaryEnv":"GEMINI_API_KEY","install":[{"id":"uv-brew","kind":"brew","formula":"uv","bins":["uv"],"label":"Install uv (brew)"}]}}
---

# Nano Banana Pro (Gemini Image Generation)

Use the bundled script to generate or edit images via Gemini's image generation API.

## Generate

```bash
# Single image
uv run {baseDir}/scripts/generate_image.py --prompt "a cute robot exploring mars" --filename robot.png

# With aspect ratio and resolution
uv run {baseDir}/scripts/generate_image.py --prompt "cyberpunk cityscape" --filename city.png --aspect-ratio 16:9 --resolution 2K

# Batch generation with gallery
uv run {baseDir}/scripts/generate_image.py --prompt "surreal landscape" --count 4 --out-dir ./images
```

## Edit

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "add dramatic sunset lighting" --filename edited.png --input-image /path/to/photo.jpg
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prompt`, `-p` | Image description (required) | - |
| `--filename`, `-f` | Output filename | - |
| `--input-image`, `-i` | Input image for editing | - |
| `--resolution`, `-r` | `1K`, `2K`, or `4K` | `1K` |
| `--aspect-ratio`, `-a` | `1:1`, `3:4`, `4:3`, `9:16`, `16:9` | `1:1` |
| `--count`, `-n` | Number of images (batch mode) | `1` |
| `--out-dir`, `-o` | Output directory (creates timestamped subdir) | - |
| `--model`, `-m` | Model name | `gemini-2.0-flash-preview-image-generation` |
| `--no-gallery` | Skip HTML gallery in batch mode | - |

## API Key

Provide via:
- `GEMINI_API_KEY` env var
- `--api-key` flag
- `skills."nano-banana-pro".apiKey` in `~/.clawdbot/clawdbot.json`
- `skills."nano-banana-pro".env.GEMINI_API_KEY` in config

## Batch Mode Output

When using `--count > 1`, the script creates:
- Numbered image files (`image-001.png`, `image-002.png`, etc.)
- `prompts.json` — metadata for each image
- `index.html` — browsable thumbnail gallery

## Notes

- Auto-detects resolution from input image when editing
- The script prints a `MEDIA:` line for Clawdbot to auto-attach on supported providers
- Do not read the image back; report the saved path only
- Use timestamps in filenames: `yyyy-mm-dd-hh-mm-ss-name.png`
