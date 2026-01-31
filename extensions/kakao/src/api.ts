/**
 * Kakao i Open Builder skill response helpers.
 *
 * Kakao chatbots are webhook-based: the bot platform POSTs a skill request
 * to our server and we return the response in the HTTP body.
 * There is no traditional "send message" API endpoint — all replies flow
 * through the skill response JSON.
 *
 * @see https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format
 */

import type { KakaoSkillResponse, KakaoOutput } from "./types.js";

/** Maximum characters per SimpleText output (Kakao limit). */
export const KAKAO_TEXT_LIMIT = 1000;

/** Build a skill response with one or more SimpleText outputs. */
export function buildTextResponse(text: string): KakaoSkillResponse {
  const chunks = chunkText(text, KAKAO_TEXT_LIMIT);
  const outputs: KakaoOutput[] = chunks.map((chunk) => ({
    simpleText: { text: chunk },
  }));
  // Kakao allows max 3 outputs per response
  return {
    version: "2.0",
    template: { outputs: outputs.slice(0, 3) },
  };
}

/** Build a skill response with a single image. */
export function buildImageResponse(imageUrl: string, altText: string): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleImage: { imageUrl, altText } }],
    },
  };
}

/** Build a fallback response when the agent takes too long. */
export function buildTimeoutResponse(): KakaoSkillResponse {
  return buildTextResponse("Still processing your message. Please try again shortly.");
}

/** Build an error response. */
export function buildErrorResponse(message?: string): KakaoSkillResponse {
  return buildTextResponse(message ?? "An error occurred. Please try again.");
}

/** Split text into chunks respecting the character limit. */
function chunkText(text: string, limit: number): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const lastNewline = window.lastIndexOf("\n");
    const lastSpace = window.lastIndexOf(" ");
    let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
    if (breakIdx <= 0) breakIdx = limit;
    const rawChunk = remaining.slice(0, breakIdx);
    const chunk = rawChunk.trimEnd();
    if (chunk.length > 0) chunks.push(chunk);
    const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
    const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
    remaining = remaining.slice(nextStart).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}
