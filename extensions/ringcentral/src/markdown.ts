/**
 * Convert standard Markdown to RingCentral Mini-Markdown format.
 * 
 * RingCentral Mini-Markdown differences:
 * - `_text_` = underline (not italic)
 * - `*text*` = italic
 * - `**text**` = bold
 * - `[text](url)` = link
 * - `> quote` = blockquote
 * - `* item` = bullet list
 * 
 * Not supported: strikethrough (~~), code blocks (```), headings (#), etc.
 */

/**
 * Convert standard markdown to RingCentral mini-markdown
 */
export function toRingCentralMarkdown(text: string): string {
  let result = text;

  // 1. Preserve links - temporarily replace them to avoid modifying URLs
  const linkPlaceholders: string[] = [];
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match) => {
    const idx = linkPlaceholders.length;
    linkPlaceholders.push(match);
    return `\x00LINK_${idx}\x00`;
  });

  // 2. Convert __text__ (some markdown bold) to **text**
  result = result.replace(/__([^_]+)__/g, "**$1**");

  // 3. Convert single _text_ to *text* for italic
  //    Match _text_ but not inside words (e.g., snake_case_name)
  result = result.replace(/(?<=^|[\s\p{P}])_([^_\n]+)_(?=$|[\s\p{P}])/gu, "*$1*");

  // 4. Remove strikethrough ~~text~~ (not supported)
  result = result.replace(/~~([^~]+)~~/g, "$1");

  // 5. Convert code blocks to plain text (not well supported)
  // Remove triple backtick code blocks
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    // Extract content without the backticks and language identifier
    const content = match.replace(/```\w*\n?/, "").replace(/\n?```$/, "");
    return content;
  });

  // Convert inline code `text` to plain text
  result = result.replace(/`([^`]+)`/g, "$1");

  // 6. Convert headings to bold (# Heading -> **Heading**)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "**$1**");

  // 7. Convert horizontal rules (---, ***, ___) to simple separator
  result = result.replace(/^[-*_]{3,}$/gm, "---");

  // 8. Normalize bullet lists (-, +, *) to * for consistency
  result = result.replace(/^(\s*)[-+]\s+/gm, "$1* ");

  // 9. Restore links
  result = result.replace(/\x00LINK_(\d+)\x00/g, (_match, idx) => {
    return linkPlaceholders[Number(idx)];
  });

  // 10. Keep numbered lists as-is (1. item)
  // 11. Keep blockquotes as-is (> quote)

  return result;
}

/**
 * Check if text contains markdown that needs conversion
 */
export function needsMarkdownConversion(text: string): boolean {
  // Check for patterns that need conversion
  return (
    // Single underscore italic
    /(?<![\\*_])_[^_\n]+_(?![_])/.test(text) ||
    // Strikethrough
    /~~[^~]+~~/.test(text) ||
    // Code blocks
    /```[\s\S]*?```/.test(text) ||
    // Inline code
    /`[^`]+`/.test(text) ||
    // Headings
    /^#{1,6}\s+.+$/m.test(text)
  );
}
