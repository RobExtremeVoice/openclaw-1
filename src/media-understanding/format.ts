import type { MediaUnderstandingOutput } from "./types.js";

const MEDIA_PLACEHOLDER_RE = /^<media:[^>]+>(\s*\([^)]*\))?$/i;
const MEDIA_PLACEHOLDER_TOKEN_RE = /^<media:[^>]+>(\s*\([^)]*\))?\s*/i;

function normalizeBody(body?: string): string {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(MEDIA_PLACEHOLDER_TOKEN_RE, "").trim();
}

function isMeaningfulBody(body?: string): boolean {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return false;
  if (MEDIA_PLACEHOLDER_RE.test(trimmed)) return false;
  const cleaned = normalizeBody(trimmed);
  return Boolean(cleaned);
}

function formatSection(
  title: "Audio" | "Video",
  kind: "Transcript" | "Description",
  text: string,
  userText?: string,
): string {
  const lines = [`[${title}]`];
  if (userText) {
    lines.push(`User text:\n${userText}`);
  }
  lines.push(`${kind}:\n${text}`);
  return lines.join("\n");
}

export function formatMediaUnderstandingBody(params: {
  body?: string;
  outputs: MediaUnderstandingOutput[];
}): string {
  const outputs = params.outputs.filter((output) => output.text.trim());
  if (outputs.length === 0) {
    return params.body ?? "";
  }

  const userText = isMeaningfulBody(params.body) ? normalizeBody(params.body) : undefined;
  const sections: string[] = [];
  if (userText && outputs.length > 1) {
    sections.push(`User text:\n${userText}`);
  }

  for (const output of outputs) {
    if (output.kind === "audio.transcription") {
      sections.push(
        formatSection(
          "Audio",
          "Transcript",
          output.text,
          outputs.length === 1 ? userText : undefined,
        ),
      );
      continue;
    }
    sections.push(
      formatSection(
        "Video",
        "Description",
        output.text,
        outputs.length === 1 ? userText : undefined,
      ),
    );
  }

  return sections.join("\n\n").trim();
}
