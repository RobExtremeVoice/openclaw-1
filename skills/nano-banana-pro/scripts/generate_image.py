#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=1.0.0",
#     "pillow>=10.0.0",
# ]
# ///
"""
Generate or edit images using Google's Gemini image generation API.

Usage:
    # Single image generation
    uv run generate_image.py --prompt "your image description" --filename "output.png"
    
    # Batch generation
    uv run generate_image.py --prompt "lobster astronaut" --count 4 --out-dir ./images
    
    # Image editing
    uv run generate_image.py --prompt "make it sunset" --input-image photo.jpg --filename edited.png
    
    # With options
    uv run generate_image.py --prompt "mountain landscape" --aspect-ratio 16:9 --resolution 2K
"""

import argparse
import html
import json
import os
import sys
from datetime import datetime
from pathlib import Path


def get_api_key(provided_key: str | None) -> str | None:
    """Get API key from argument first, then environment."""
    if provided_key:
        return provided_key
    return os.environ.get("GEMINI_API_KEY")


def generate_gallery_html(output_dir: Path, images: list[dict]) -> Path:
    """Generate an HTML gallery for the images."""
    html_path = output_dir / "index.html"
    
    html_parts = ["""<!DOCTYPE html>
<html>
<head>
    <title>Generated Images</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
        h1 { text-align: center; color: #ffd700; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { background: #16213e; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .card img { width: 100%; height: auto; display: block; }
        .card .info { padding: 12px; }
        .card .prompt { font-size: 14px; color: #aaa; word-wrap: break-word; }
        .card .meta { font-size: 12px; color: #666; margin-top: 8px; }
    </style>
</head>
<body>
    <h1>🍌 Nano Banana Pro Gallery</h1>
    <div class="gallery">
"""]
    
    for img in images:
        # Escape HTML to prevent injection
        safe_filename = html.escape(img['filename'])
        safe_prompt = html.escape(img['prompt'])
        safe_resolution = html.escape(img['resolution'])
        safe_model = html.escape(img.get('model', 'gemini-2.0-flash-preview-image-generation'))
        prompt_preview = html.escape(img['prompt'][:50]) + ("..." if len(img['prompt']) > 50 else "")
        
        html_parts.append(f"""
        <div class="card">
            <img src="{safe_filename}" alt="{prompt_preview}">
            <div class="info">
                <div class="prompt">{safe_prompt}</div>
                <div class="meta">{safe_resolution} • {safe_model}</div>
            </div>
        </div>
""")
    
    html_parts.append("""
    </div>
</body>
</html>
""")
    
    html_path.write_text("".join(html_parts), encoding="utf-8")
    return html_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate images using Gemini image generation API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --prompt "a cute robot" --filename robot.png
  %(prog)s --prompt "mountain sunset" --count 4 --out-dir ./gallery
  %(prog)s --prompt "add rain" --input-image photo.jpg --filename rainy.png
  %(prog)s --prompt "cyberpunk city" --aspect-ratio 16:9 --resolution 2K
        """
    )
    parser.add_argument(
        "--prompt", "-p",
        required=True,
        help="Image description/prompt"
    )
    parser.add_argument(
        "--filename", "-f",
        help="Output filename (e.g., sunset-mountains.png). Required for single image."
    )
    parser.add_argument(
        "--input-image", "-i",
        help="Optional input image path for editing/modification"
    )
    parser.add_argument(
        "--resolution", "-r",
        choices=["1K", "2K", "4K"],
        default="1K",
        help="Output resolution: 1K (default), 2K, or 4K"
    )
    parser.add_argument(
        "--aspect-ratio", "-a",
        choices=["1:1", "3:4", "4:3", "9:16", "16:9"],
        default="1:1",
        help="Aspect ratio (default: 1:1 square)"
    )
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=1,
        help="Number of images to generate (default: 1)"
    )
    parser.add_argument(
        "--out-dir", "-o",
        help="Output directory for batch generation (creates timestamped subdir)"
    )
    parser.add_argument(
        "--model", "-m",
        default="gemini-2.0-flash-preview-image-generation",
        help="Model to use (default: gemini-2.0-flash-preview-image-generation)"
    )
    parser.add_argument(
        "--api-key", "-k",
        help="Gemini API key (overrides GEMINI_API_KEY env var)"
    )
    parser.add_argument(
        "--no-gallery",
        action="store_true",
        help="Skip HTML gallery generation for batch mode"
    )

    args = parser.parse_args()

    # Validate arguments
    if args.count > 1 and not args.out_dir:
        print("Error: --out-dir is required when --count > 1", file=sys.stderr)
        sys.exit(1)
    
    if args.count == 1 and not args.filename and not args.out_dir:
        print("Error: --filename or --out-dir is required", file=sys.stderr)
        sys.exit(1)

    # Get API key
    api_key = get_api_key(args.api_key)
    if not api_key:
        print("Error: No API key provided.", file=sys.stderr)
        print("Please either:", file=sys.stderr)
        print("  1. Provide --api-key argument", file=sys.stderr)
        print("  2. Set GEMINI_API_KEY environment variable", file=sys.stderr)
        sys.exit(1)

    # Import here after checking API key to avoid slow import on error
    from google import genai
    from google.genai import types
    from PIL import Image as PILImage

    # Initialize client
    client = genai.Client(api_key=api_key)

    # Set up output directory
    if args.out_dir:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_dir = Path(args.out_dir) / f"nano-banana-{timestamp}"
        output_dir.mkdir(parents=True, exist_ok=True)
    else:
        output_dir = Path(args.filename).parent
        output_dir.mkdir(parents=True, exist_ok=True)

    # Load input image if provided (for editing)
    input_image = None
    output_resolution = args.resolution
    if args.input_image:
        try:
            input_image = PILImage.open(args.input_image)
            print(f"Loaded input image: {args.input_image}")

            # Auto-detect resolution if default
            if args.resolution == "1K":
                width, height = input_image.size
                max_dim = max(width, height)
                if max_dim >= 3000:
                    output_resolution = "4K"
                elif max_dim >= 1500:
                    output_resolution = "2K"
                else:
                    output_resolution = "1K"
                print(f"Auto-detected resolution: {output_resolution} (from input {width}x{height})")
        except Exception as e:
            print(f"Error loading input image: {e}", file=sys.stderr)
            sys.exit(1)

    # Generate images
    generated_images = []
    
    for i in range(args.count):
        if args.count > 1:
            # Generate filename for batch mode
            filename = f"image-{i+1:03d}.png"
            output_path = output_dir / filename
            print(f"\n[{i+1}/{args.count}] Generating...")
        else:
            if args.filename:
                output_path = Path(args.filename)
                if not output_path.is_absolute():
                    output_path = output_dir / output_path
            else:
                output_path = output_dir / "image.png"

        # Build contents
        if input_image:
            contents = [input_image, args.prompt]
            print(f"Editing image with resolution {output_resolution}...")
        else:
            contents = args.prompt
            print(f"Generating image with resolution {output_resolution}, aspect ratio {args.aspect_ratio}...")

        try:
            # Build image config - omit aspect_ratio entirely when editing
            image_config_kwargs = {"image_size": output_resolution}
            if not input_image:
                image_config_kwargs["aspect_ratio"] = args.aspect_ratio
            
            response = client.models.generate_content(
                model=args.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                    image_config=types.ImageConfig(**image_config_kwargs)
                )
            )

            # Process response and save image
            image_saved = False
            model_text = None
            
            for part in response.parts:
                if part.text is not None:
                    model_text = part.text
                    print(f"Model response: {part.text}")
                elif part.inline_data is not None:
                    from io import BytesIO

                    image_data = part.inline_data.data
                    if isinstance(image_data, str):
                        import base64
                        image_data = base64.b64decode(image_data)

                    image = PILImage.open(BytesIO(image_data))

                    # Convert to RGB for PNG
                    if image.mode == 'RGBA':
                        rgb_image = PILImage.new('RGB', image.size, (255, 255, 255))
                        rgb_image.paste(image, mask=image.split()[3])
                        rgb_image.save(str(output_path), 'PNG')
                    elif image.mode == 'RGB':
                        image.save(str(output_path), 'PNG')
                    else:
                        image.convert('RGB').save(str(output_path), 'PNG')
                    
                    image_saved = True
                    
                    generated_images.append({
                        "filename": output_path.name,
                        "path": str(output_path.resolve()),
                        "prompt": args.prompt,
                        "resolution": output_resolution,
                        "aspect_ratio": args.aspect_ratio,
                        "model": args.model,
                        "model_text": model_text,
                    })

            if image_saved:
                full_path = output_path.resolve()
                print(f"Image saved: {full_path}")
                if args.count == 1:
                    # For single image, emit MEDIA token
                    print(f"MEDIA: {full_path}")
            else:
                print(f"Error: No image was generated in response {i+1}.", file=sys.stderr)
                if args.count == 1:
                    sys.exit(1)

        except Exception as e:
            print(f"Error generating image: {e}", file=sys.stderr)
            if args.count == 1:
                sys.exit(1)

    # Save metadata and generate gallery for batch mode
    if args.count > 1:
        if not generated_images:
            print(f"\nError: No images were successfully generated.", file=sys.stderr)
            sys.exit(1)
        
        # Save prompts.json with relative paths for portability
        prompts_data = []
        for img in generated_images:
            prompts_data.append({
                "filename": img["filename"],
                "prompt": img["prompt"],
                "resolution": img["resolution"],
                "aspect_ratio": img["aspect_ratio"],
                "model": img["model"],
                "model_text": img.get("model_text"),
            })
        
        prompts_path = output_dir / "prompts.json"
        prompts_path.write_text(json.dumps(prompts_data, indent=2), encoding="utf-8")
        print(f"\nMetadata saved: {prompts_path}")
        
        # Generate HTML gallery
        if not args.no_gallery:
            gallery_path = generate_gallery_html(output_dir, generated_images)
            print(f"Gallery saved: {gallery_path}")
        
        print(f"\nGenerated {len(generated_images)}/{args.count} images in {output_dir}")


if __name__ == "__main__":
    main()
