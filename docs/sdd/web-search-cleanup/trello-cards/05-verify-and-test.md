# Card 05: Verify Build and Tests

| Field | Value |
|-------|-------|
| **ID** | WSC-05 |
| **Story Points** | 1 |
| **Depends On** | WSC-04 |
| **Sprint** | 2 - Finalize |

## User Story

> As a maintainer, I want to verify all changes work so that I can merge with confidence.

## Context

All cleanup is complete. This card verifies everything works.

## Instructions

### Step 1: Type check

```bash
pnpm type-check
```

**Expected:** No errors

### Step 2: Lint check

```bash
pnpm lint
```

**Expected:** No errors (or only pre-existing ones)

### Step 3: Run web-search tests

```bash
pnpm test src/web-search/
```

**Expected:** All tests pass

### Step 4: Run telegram bot tests

```bash
pnpm test src/telegram/bot.test.ts
```

**Expected:** All tests pass

### Step 5: Build

```bash
pnpm build
```

**Expected:** Build succeeds

### Step 6: Verify file count

```bash
ls src/web-search/*.ts | wc -l
```

**Expected:** 5 files (executor, gemini-cli, messages, test-fixtures, executor.test or messages.test)

### Step 7: Final grep check

```bash
grep -r "detect.ts\|aggressivelyCleanQuery" src/ --include="*.ts"
```

**Expected:** No results

## Acceptance Criteria

- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes (or no new errors)
- [ ] `pnpm test src/web-search/` passes
- [ ] `pnpm build` succeeds
- [ ] No references to removed code

## Files Modified

- None (verification only)

## Completion

After completing this card:
1. Update state.json: set card 05 to "completed"
2. Update state.json: set overall_status to "COMPLETE"
3. Ready for code review and merge!

## Summary of Changes

| Action | Files |
|--------|-------|
| DELETED | `src/web-search/detect.ts` |
| DELETED | `src/web-search/detect.test.ts` |
| MODIFIED | `src/web-search/executor.ts` (removed dead function) |
| MODIFIED | `src/config/config.ts` (added webSearch.cliPath) |
| MODIFIED | `src/web-search/executor.ts` (use config for CLI path) |
