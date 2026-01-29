import { describe, expect, it } from "vitest";

import { splitMediaFromOutput } from "./parse.js";

describe("splitMediaFromOutput", () => {
  it("detects audio_as_voice tag and strips it", () => {
    const result = splitMediaFromOutput("Hello [[audio_as_voice]] world");
    expect(result.audioAsVoice).toBe(true);
    expect(result.text).toBe("Hello world");
  });

  it("captures media paths with spaces", () => {
    const result = splitMediaFromOutput("MEDIA:/Users/pete/My File.png");
    expect(result.mediaUrls).toEqual(["/Users/pete/My File.png"]);
    expect(result.text).toBe("");
  });

  it("captures quoted media paths with spaces", () => {
    const result = splitMediaFromOutput('MEDIA:"/Users/pete/My File.png"');
    expect(result.mediaUrls).toEqual(["/Users/pete/My File.png"]);
    expect(result.text).toBe("");
  });

  it("captures tilde media paths with spaces", () => {
    const result = splitMediaFromOutput("MEDIA:~/Pictures/My File.png");
    expect(result.mediaUrls).toEqual(["~/Pictures/My File.png"]);
    expect(result.text).toBe("");
  });

  it("normalizes Windows file URLs", () => {
    const result = splitMediaFromOutput("MEDIA:file:///C:/Users/pete/My%20File.png");
    const expected =
      process.platform === "win32" ? "C:\\Users\\pete\\My File.png" : "C:/Users/pete/My File.png";
    expect(result.mediaUrls).toEqual([expected]);
    expect(result.text).toBe("");
  });

  it("accepts Windows drive letter paths", () => {
    const result = splitMediaFromOutput("MEDIA:C:/Users/pete/My File.png");
    expect(result.mediaUrls).toEqual(["C:/Users/pete/My File.png"]);
    expect(result.text).toBe("");
  });

  it("accepts Windows drive letter paths with backslashes", () => {
    const filePath = "C:\\Users\\pete\\My File.png";
    const result = splitMediaFromOutput(`MEDIA:${filePath}`);
    expect(result.mediaUrls).toEqual([filePath]);
    expect(result.text).toBe("");
  });

  it("keeps audio_as_voice detection stable across calls", () => {
    const input = "Hello [[audio_as_voice]]";
    const first = splitMediaFromOutput(input);
    const second = splitMediaFromOutput(input);
    expect(first.audioAsVoice).toBe(true);
    expect(second.audioAsVoice).toBe(true);
  });

  it("keeps MEDIA mentions in prose", () => {
    const input = "The MEDIA: tag fails to deliver";
    const result = splitMediaFromOutput(input);
    expect(result.mediaUrls).toBeUndefined();
    expect(result.text).toBe(input);
  });

  it("parses MEDIA tags with leading whitespace", () => {
    const result = splitMediaFromOutput("  MEDIA:/tmp/screenshot.png");
    expect(result.mediaUrls).toEqual(["/tmp/screenshot.png"]);
    expect(result.text).toBe("");
  });
});
