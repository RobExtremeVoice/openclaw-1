/**
 * Normalize a messaging target for Universal IM.
 */
export function normalizeUniversalImMessagingTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();

  // Handle prefixed formats
  if (lower.startsWith("channel:")) {
    const id = trimmed.slice("channel:".length).trim();
    return id ? `channel:${id}` : undefined;
  }
  if (lower.startsWith("group:")) {
    const id = trimmed.slice("group:".length).trim();
    return id ? `group:${id}` : undefined;
  }
  if (lower.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    return id ? `user:${id}` : undefined;
  }
  if (lower.startsWith("universal-im:")) {
    const id = trimmed.slice("universal-im:".length).trim();
    return id ? `user:${id}` : undefined;
  }

  // Handle @ prefix as user
  if (trimmed.startsWith("@")) {
    const id = trimmed.slice(1).trim();
    return id ? `user:${id}` : undefined;
  }

  // Handle # prefix as channel
  if (trimmed.startsWith("#")) {
    const id = trimmed.slice(1).trim();
    return id ? `channel:${id}` : undefined;
  }

  // Default to user
  return `user:${trimmed}`;
}

/**
 * Check if a string looks like a Universal IM target ID.
 */
export function looksLikeUniversalImTargetId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  // Check for known prefixes
  if (/^(user|channel|group|universal-im):/i.test(trimmed)) return true;

  // Check for @ or # prefix
  if (/^[@#]/.test(trimmed)) return true;

  // Check for ID-like format (alphanumeric with some special chars)
  return /^[a-z0-9_-]{3,}$/i.test(trimmed);
}

/**
 * Normalize an allowlist entry.
 */
export function normalizeAllowEntry(entry: string): string {
  return entry
    .trim()
    .replace(/^(universal-im|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

/**
 * Format an allowlist entry for display.
 */
export function formatAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).trim();
    return username ? `@${username.toLowerCase()}` : "";
  }
  return trimmed.replace(/^(universal-im|user):/i, "").toLowerCase();
}
