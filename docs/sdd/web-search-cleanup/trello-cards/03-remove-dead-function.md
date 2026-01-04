# Card 03: Remove aggressivelyCleanQuery Function

| Field | Value |
|-------|-------|
| **ID** | WSC-03 |
| **Story Points** | 1 |
| **Depends On** | WSC-02 |
| **Sprint** | 1 - Removal |

## User Story

> As a maintainer, I want to remove unused functions so that the code is easier to understand.

## Context

Read before starting:
- `src/web-search/executor.ts` contains `aggressivelyCleanQuery()` at lines 101-128
- This function is defined but never called

## Instructions

### Step 1: View the function to remove

```bash
grep -n "aggressivelyCleanQuery" src/web-search/executor.ts
```

### Step 2: Remove the function

Edit `src/web-search/executor.ts` and delete lines 101-128 (the entire `aggressivelyCleanQuery` function).

```typescript
// DELETE THIS ENTIRE FUNCTION (lines 101-128):
// Additional cleaning patterns for very malformed queries
function aggressivelyCleanQuery(query: string): string {
  // ... entire function body ...
}
```

### Step 3: Verify removal

```bash
grep "aggressivelyCleanQuery" src/web-search/executor.ts
```

**Expected:** No results

### Step 4: Type check

```bash
pnpm type-check
```

**Expected:** No errors

## Acceptance Criteria

- [ ] `aggressivelyCleanQuery` function is removed from executor.ts
- [ ] Type checking passes
- [ ] No references to removed function

## Files Modified

- `src/web-search/executor.ts` - Remove dead function

## Next Steps

After completing this card:
1. Update state.json: set card 03 to "completed"
2. Read next card: [04-add-cli-config.md](./04-add-cli-config.md)
