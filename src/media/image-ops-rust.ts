/**
 * Rust-based image operations backend for Clawdbot.
 *
 * Uses the clawdbot-image-ops Rust CLI for high-performance image processing.
 * Falls back to sharp if the Rust binary is not available.
 *
 * Environment variables:
 * - CLAWDBOT_IMAGE_OPS_BIN: Path to the Rust binary (default: "clawdbot-image-ops")
 * - CLAWDBOT_IMAGE_BACKEND: Set to "rust" to prefer this backend
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink, mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

const RUST_BINARY = process.env.CLAWDBOT_IMAGE_OPS_BIN || "clawdbot-image-ops";

/** Check if Rust backend is available */
let rustAvailable: boolean | null = null;

export async function isRustBackendAvailable(): Promise<boolean> {
	if (rustAvailable !== null) {
		return rustAvailable;
	}

	try {
		await execFileAsync(RUST_BINARY, ["--version"]);
		rustAvailable = true;
	} catch {
		rustAvailable = false;
	}

	return rustAvailable;
}

/** Check if Rust backend should be preferred */
export function prefersRust(): boolean {
	return process.env.CLAWDBOT_IMAGE_BACKEND === "rust";
}

/** Helper to create a temporary directory and clean up after use */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "clawdbot-img-"));
	try {
		return await fn(dir);
	} finally {
		try {
			// Clean up temp files
			const files = await import("node:fs/promises").then((fs) => fs.readdir(dir));
			for (const file of files) {
				await unlink(join(dir, file)).catch(() => {});
			}
			await rmdir(dir).catch(() => {});
		} catch {
			// Ignore cleanup errors
		}
	}
}

/** Generate a random filename */
function randomFilename(ext: string): string {
	return `img_${randomBytes(8).toString("hex")}${ext}`;
}

export interface RustImageMetadata {
	width: number;
	height: number;
	format: string;
	orientation?: number;
}

/**
 * Get image metadata using Rust backend.
 * Returns dimensions and format as JSON.
 */
export async function rustMetadataFromBuffer(buffer: Buffer): Promise<RustImageMetadata> {
	return withTempDir(async (dir) => {
		const inputPath = join(dir, randomFilename(".img"));
		await writeFile(inputPath, buffer);

		const { stdout } = await execFileAsync(RUST_BINARY, ["metadata", inputPath]);
		return JSON.parse(stdout.trim()) as RustImageMetadata;
	});
}

export interface RustResizeParams {
	buffer: Buffer;
	maxSide: number;
	quality: number;
	withoutEnlargement?: boolean;
}

/**
 * Resize image to JPEG using Rust backend.
 * Maintains aspect ratio, fits within maxSide dimensions.
 */
export async function rustResizeToJpeg(params: RustResizeParams): Promise<Buffer> {
	const { buffer, maxSide, quality, withoutEnlargement = true } = params;

	return withTempDir(async (dir) => {
		const inputPath = join(dir, randomFilename(".img"));
		const outputPath = join(dir, randomFilename(".jpg"));

		await writeFile(inputPath, buffer);

		const args = [
			"resize",
			inputPath,
			outputPath,
			"--max-side",
			maxSide.toString(),
			"--quality",
			quality.toString(),
		];

		if (withoutEnlargement) {
			args.push("--without-enlargement", "true");
		} else {
			args.push("--without-enlargement", "false");
		}

		await execFileAsync(RUST_BINARY, args);

		return readFile(outputPath);
	});
}

/**
 * Generate thumbnail using Rust backend.
 */
export async function rustThumbnail(
	buffer: Buffer,
	size: number = 256,
	quality: number = 80
): Promise<Buffer> {
	return withTempDir(async (dir) => {
		const inputPath = join(dir, randomFilename(".img"));
		const outputPath = join(dir, randomFilename(".jpg"));

		await writeFile(inputPath, buffer);

		await execFileAsync(RUST_BINARY, [
			"thumbnail",
			inputPath,
			outputPath,
			"--size",
			size.toString(),
			"--quality",
			quality.toString(),
		]);

		return readFile(outputPath);
	});
}
