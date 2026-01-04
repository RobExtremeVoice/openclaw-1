# Card 01: Verify Dead Code

| Field | Value |
|-------|-------|
| **ID** | WSC-01 |
| **Story Points** | 1 |
| **Depends On** | None |
| **Sprint** | 1 - Verification |

## User Story

> As a maintainer, I want to verify which code is dead so that I can safely remove it.

## Context

Read before starting:
- [requirements.md](../requirements.md) - Full requirements
- Commit `edf9fdb8` switched to explicit `/web` command

## Instructions

### Step 1: Check if detectWebSearchIntent is used

```bash
grep -r "detectWebSearchIntent" src/ --include="*.ts" | grep -v "\.test\." | grep -v "detect.ts"
```

**Expected:** No results (function not imported anywhere except tests)

### Step 2: Check if extractSearchQuery is used

```bash
grep -r "extractSearchQuery" src/ --include="*.ts" | grep -v "\.test\." | grep -v "detect.ts"
```

**Expected:** No results

### Step 3: Check if aggressivelyCleanQuery is used

```bash
grep -r "aggressivelyCleanQuery" src/ --include="*.ts"
```

**Expected:** Only definition in executor.ts, no calls

### Step 4: Check imports from detect.ts

```bash
grep -r "from.*web-search/detect" src/ --include="*.ts" | grep -v "\.test\."
```

**Expected:** No results

### Step 5: Document findings

Record the grep results. If any function IS used, update requirements.md and STOP.

## Acceptance Criteria

- [ ] Confirmed `detectWebSearchIntent` is not imported in production code
- [ ] Confirmed `extractSearchQuery` is not imported in production code
- [ ] Confirmed `aggressivelyCleanQuery` is defined but never called
- [ ] Documented findings in execution log

## Files Modified

- None (verification only)

## Next Steps

After completing this card:
1. Update state.json: set card 01 to "completed"
2. Read next card: [02-remove-detect-ts.md](./02-remove-detect-ts.md)
