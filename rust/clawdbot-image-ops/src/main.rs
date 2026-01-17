//! Clawdbot Image Operations CLI
//!
//! High-performance image processing tool for metadata extraction and resizing.
//! Replaces sharp in Docker containers for smaller image size and faster processing.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat};
use serde::Serialize;
use std::fs::File;
use std::io::{BufWriter, Read};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "clawdbot-image-ops",
    about = "High-performance image operations for Clawdbot",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Get image metadata (dimensions, format) as JSON
    Metadata {
        /// Input image file path (use "-" for stdin)
        input: PathBuf,
    },

    /// Resize image to fit within max dimensions, output as JPEG
    Resize {
        /// Input image file path (use "-" for stdin)
        input: PathBuf,

        /// Output JPEG file path (use "-" for stdout)
        output: PathBuf,

        /// Maximum dimension for longest side
        #[arg(long, default_value = "1024")]
        max_side: u32,

        /// JPEG quality (1-100)
        #[arg(long, default_value = "85")]
        quality: u8,

        /// Don't enlarge images smaller than max_side
        #[arg(long, default_value = "true")]
        without_enlargement: bool,
    },

    /// Generate thumbnail
    Thumbnail {
        /// Input image file path
        input: PathBuf,

        /// Output file path
        output: PathBuf,

        /// Thumbnail size (square)
        #[arg(long, default_value = "256")]
        size: u32,

        /// JPEG quality (1-100)
        #[arg(long, default_value = "80")]
        quality: u8,
    },
}

#[derive(Serialize)]
struct ImageMetadata {
    width: u32,
    height: u32,
    format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    orientation: Option<u32>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Metadata { input } => cmd_metadata(&input),
        Commands::Resize {
            input,
            output,
            max_side,
            quality,
            without_enlargement,
        } => cmd_resize(&input, &output, max_side, quality, without_enlargement),
        Commands::Thumbnail {
            input,
            output,
            size,
            quality,
        } => cmd_thumbnail(&input, &output, size, quality),
    }
}

/// Read image from path or stdin
fn read_image(path: &PathBuf) -> Result<(DynamicImage, Option<ImageFormat>)> {
    if path.to_string_lossy() == "-" {
        // Read from stdin
        let mut buffer = Vec::new();
        std::io::stdin()
            .read_to_end(&mut buffer)
            .context("Failed to read from stdin")?;

        let format = image::guess_format(&buffer).ok();
        let img = image::load_from_memory(&buffer).context("Failed to decode image from stdin")?;
        Ok((img, format))
    } else {
        // Read from file
        let format = ImageFormat::from_path(path).ok();
        let img = image::open(path).context("Failed to open and decode image file")?;
        Ok((img, format))
    }
}

/// Write JPEG to path or stdout
fn write_jpeg(path: &PathBuf, img: &DynamicImage, quality: u8) -> Result<()> {
    let rgb = img.to_rgb8();

    if path.to_string_lossy() == "-" {
        // Write to stdout
        let mut encoder = JpegEncoder::new_with_quality(std::io::stdout(), quality);
        encoder
            .encode_image(&rgb)
            .context("Failed to encode JPEG to stdout")?;
    } else {
        // Write to file
        let file = File::create(path).context("Failed to create output file")?;
        let writer = BufWriter::new(file);
        let mut encoder = JpegEncoder::new_with_quality(writer, quality);
        encoder
            .encode_image(&rgb)
            .context("Failed to encode JPEG")?;
    }

    Ok(())
}

/// Get image metadata
fn cmd_metadata(input: &PathBuf) -> Result<()> {
    let (img, format) = read_image(input)?;
    let (width, height) = img.dimensions();

    let format_str = format
        .map(|f| format!("{:?}", f).to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    let metadata = ImageMetadata {
        width,
        height,
        format: format_str,
        orientation: None, // Could extract from EXIF if needed
    };

    let json = serde_json::to_string(&metadata).context("Failed to serialize metadata")?;
    println!("{}", json);

    Ok(())
}

/// Resize image to fit within max dimensions
fn cmd_resize(
    input: &PathBuf,
    output: &PathBuf,
    max_side: u32,
    quality: u8,
    without_enlargement: bool,
) -> Result<()> {
    let (img, _) = read_image(input)?;
    let (width, height) = img.dimensions();

    // Calculate new dimensions
    let max_current = width.max(height);

    let resized = if without_enlargement && max_current <= max_side {
        // Image is already smaller than max_side, don't enlarge
        img
    } else if max_current > max_side {
        // Need to resize down
        let scale = max_side as f64 / max_current as f64;
        let new_width = (width as f64 * scale).round() as u32;
        let new_height = (height as f64 * scale).round() as u32;

        img.resize(new_width, new_height, FilterType::Lanczos3)
    } else {
        img
    };

    write_jpeg(output, &resized, quality)?;

    // Output result metadata to stderr for debugging
    let (new_w, new_h) = resized.dimensions();
    eprintln!(
        "{{\"original_width\":{},\"original_height\":{},\"width\":{},\"height\":{}}}",
        width, height, new_w, new_h
    );

    Ok(())
}

/// Generate square thumbnail
fn cmd_thumbnail(input: &PathBuf, output: &PathBuf, size: u32, quality: u8) -> Result<()> {
    let (img, _) = read_image(input)?;

    // Use thumbnail which maintains aspect ratio and crops to square
    let thumb = img.thumbnail(size, size);

    write_jpeg(output, &thumb, quality)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn create_test_image() -> NamedTempFile {
        let mut file = NamedTempFile::with_suffix(".png").unwrap();

        // Create a simple 100x50 red PNG
        let img = DynamicImage::new_rgb8(100, 50);
        let mut bytes = Vec::new();
        img.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();

        file.write_all(&bytes).unwrap();
        file.flush().unwrap();
        file
    }

    #[test]
    fn test_read_image_from_file() {
        let file = create_test_image();
        let (img, format) = read_image(&file.path().to_path_buf()).unwrap();

        assert_eq!(img.dimensions(), (100, 50));
        assert_eq!(format, Some(ImageFormat::Png));
    }

    #[test]
    fn test_resize_maintains_aspect_ratio() {
        let file = create_test_image();
        let output = NamedTempFile::with_suffix(".jpg").unwrap();

        cmd_resize(
            &file.path().to_path_buf(),
            &output.path().to_path_buf(),
            50, // max_side
            85,
            true,
        )
        .unwrap();

        let (resized, _) = read_image(&output.path().to_path_buf()).unwrap();
        let (w, h) = resized.dimensions();

        // Should be 50x25 (maintaining 2:1 aspect ratio)
        assert_eq!(w, 50);
        assert_eq!(h, 25);
    }

    #[test]
    fn test_without_enlargement() {
        let file = create_test_image();
        let output = NamedTempFile::with_suffix(".jpg").unwrap();

        cmd_resize(
            &file.path().to_path_buf(),
            &output.path().to_path_buf(),
            200, // max_side larger than image
            85,
            true, // without_enlargement
        )
        .unwrap();

        let (resized, _) = read_image(&output.path().to_path_buf()).unwrap();
        let (w, h) = resized.dimensions();

        // Should remain 100x50, not enlarged
        assert_eq!(w, 100);
        assert_eq!(h, 50);
    }
}
