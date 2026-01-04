# Card 04: Add Configurable CLI Path

| Field | Value |
|-------|-------|
| **ID** | WSC-04 |
| **Story Points** | 2 |
| **Depends On** | WSC-03 |
| **Sprint** | 2 - Config |

## User Story

> As an operator, I want to configure the web search CLI path so that I can use different installations.

## Context

Read before starting:
- Current hardcoded path in `executor.ts:27`:
  ```typescript
  cliPath = "/home/almaz/TOOLS/web_search_by_gemini/web-search-by-Gemini.sh"
  ```
- Reference pattern in `src/deep-research/executor.ts:154`:
  ```typescript
  const cliPath = cfg.deepResearch?.cliPath ?? getDefaultDeepResearchCliPath();
  ```

## Instructions

### Step 1: Check existing config structure

```bash
grep -A 10 "webSearch" src/config/config.ts
```

### Step 2: Add cliPath to webSearch config

Edit `src/config/config.ts` to add `cliPath` field to webSearch config type.

### Step 3: Add default CLI path function

Create or edit to add:

```typescript
export function getDefaultWebSearchCliPath(): string {
  return "/home/almaz/TOOLS/web_search_by_gemini/web-search-by-Gemini.sh";
}
```

### Step 4: Update executor.ts to use config

Edit `src/web-search/executor.ts`:

```typescript
import { loadConfig, getDefaultWebSearchCliPath } from "../config/config.js";

export async function executeWebSearch(
  query: string,
  options: ExecuteWebSearchOptions = {}
): Promise<ExecuteWebSearchResult> {
  const cfg = loadConfig();
  const {
    cliPath = cfg.webSearch?.cliPath ?? getDefaultWebSearchCliPath(),
    timeoutMs = 30000,
    dryRun = false,
  } = options;
  // ... rest unchanged
}
```

### Step 5: Type check

```bash
pnpm type-check
```

## Acceptance Criteria

- [ ] `webSearch.cliPath` is configurable in config
- [ ] Default path function exists
- [ ] `executor.ts` uses config instead of hardcoded path
- [ ] Type checking passes

## Files Modified

- `src/config/config.ts` - Add webSearch.cliPath type and default
- `src/web-search/executor.ts` - Use config for CLI path

## Next Steps

After completing this card:
1. Update state.json: set card 04 to "completed"
2. Read next card: [05-verify-and-test.md](./05-verify-and-test.md)
