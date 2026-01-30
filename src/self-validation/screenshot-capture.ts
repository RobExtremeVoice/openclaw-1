import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { ScreenshotResult } from "./types.js";
import { SCREENSHOT_DIR_NAME } from "./constants.js";

const execAsync = promisify(exec);

export async function captureScreenshot(
  directory: string,
  sessionId: string,
): Promise<ScreenshotResult> {
  const screenshotDir = join(directory, ".openclaw", SCREENSHOT_DIR_NAME);
  const filename = `screenshot-${sessionId}-${Date.now()}.png`;
  const outputPath = join(screenshotDir, filename);

  try {
    if (!existsSync(screenshotDir)) {
      mkdirSync(screenshotDir, { recursive: true });
    }

    // Try tmux capture first
    try {
      await execAsync(`tmux capture-pane -p > "${outputPath}"`);
      return { path: outputPath, success: true };
    } catch {
      // Fallback to screencapture on macOS
      try {
        await execAsync(`screencapture -x "${outputPath}"`);
        return { path: outputPath, success: true };
      } catch {
        // Final fallback: gnome-screenshot on Linux
        try {
          await execAsync(`gnome-screenshot -f "${outputPath}"`);
          return { path: outputPath, success: true };
        } catch (err) {
          return {
            path: outputPath,
            success: false,
            error: `All screenshot methods failed: ${String(err)}`,
          };
        }
      }
    }
  } catch (err) {
    return {
      path: outputPath,
      success: false,
      error: String(err),
    };
  }
}
