# Card 02: Remove detect.ts and Tests

| Field | Value |
|-------|-------|
| **ID** | WSC-02 |
| **Story Points** | 2 |
| **Depends On** | WSC-01 |
| **Sprint** | 1 - Removal |

## User Story

> As a maintainer, I want to remove dead detection code so that the codebase is cleaner.

## Context

Read before starting:
- Card 01 verified these files are dead code
- Files to remove:
  - `src/web-search/detect.ts` (182 lines)
  - `src/web-search/detect.test.ts`

## Instructions

### Step 1: Verify files exist

```bash
ls -la src/web-search/detect*.ts
```

### Step 2: Remove detect.ts

```bash
rm src/web-search/detect.ts
```

### Step 3: Remove detect.test.ts

```bash
rm src/web-search/detect.test.ts
```

### Step 4: Check for broken imports

```bash
pnpm type-check 2>&1 | head -30
```

If there are import errors, they need to be fixed in card 03.

### Step 5: Verify removal

```bash
ls src/web-search/
```

**Expected:** Only these files remain:
- `executor.ts`
- `executor.test.ts`
- `gemini-cli.ts`
- `messages.ts`
- `messages.test.ts`
- `test-fixtures.ts`

## Acceptance Criteria

- [ ] `detect.ts` is deleted
- [ ] `detect.test.ts` is deleted
- [ ] No orphaned imports (or documented for next card)

## Files Modified

- `src/web-search/detect.ts` - DELETED
- `src/web-search/detect.test.ts` - DELETED

## Next Steps

After completing this card:
1. Update state.json: set card 02 to "completed"
2. Read next card: [03-remove-dead-function.md](./03-remove-dead-function.md)
