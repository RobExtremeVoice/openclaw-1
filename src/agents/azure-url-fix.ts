/**
 * Azure OpenAI URL fix utility
 *
 * Problem: OpenAI SDK constructs URLs as: baseURL + path
 * For Azure with query params: https://endpoint/deployments/name?api-version=xxx + /chat/completions
 * Result: https://endpoint/deployments/name?api-version=xxx/chat/completions (WRONG)
 *
 * This utility intercepts fetch calls and fixes Azure URLs before sending.
 */

let azureUrlFixInstalled = false;

export function installAzureUrlFix(): void {
  if (azureUrlFixInstalled) return;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function azureCompatibleFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Extract URL string from input
    let url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    // Detect malformed Azure URLs
    // Pattern: https://endpoint/.../chat/completions?api-version={version}/chat/completions
    // The SDK appends /chat/completions after the query string, which is wrong
    // Fix to: https://endpoint/.../chat/completions?api-version={version}
    const azureUrlPattern = /(https:\/\/[^?]+)(\?[^/]+)(\/.*)/;
    const match = url.match(azureUrlPattern);

    if (match) {
      const [, basePath, queryParam, wrongPath] = match;
      // Only fix if this looks like an Azure URL with deployments
      if (basePath.includes("/deployments/") && queryParam.includes("api-version=")) {
        // Check if basePath already contains the wrongPath (duplicate case)
        const fixedUrl = basePath.endsWith(wrongPath)
          ? `${basePath}${queryParam}` // Already has path, just remove duplicate
          : `${basePath}${wrongPath}${queryParam}`; // Need to move path before query

        // Reconstruct input with fixed URL
        if (typeof input === "string") {
          return originalFetch(fixedUrl, init);
        } else if (input instanceof URL) {
          return originalFetch(new URL(fixedUrl), init);
        } else if (input instanceof Request) {
          return originalFetch(new Request(fixedUrl, input), init);
        }
      }
    }

    // Non-Azure URLs pass through unchanged
    return originalFetch(input, init);
  } as typeof fetch;

  azureUrlFixInstalled = true;
}

export function isAzureUrlFixInstalled(): boolean {
  return azureUrlFixInstalled;
}

/**
 * Reset the URL fix installation state (for testing only)
 * @internal
 */
export function resetAzureUrlFixForTesting(): void {
  azureUrlFixInstalled = false;
}
