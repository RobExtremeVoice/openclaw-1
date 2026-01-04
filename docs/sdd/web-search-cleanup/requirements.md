# Web Search Cleanup - Requirements

## Context

After refactoring in commit `edf9fdb8` (explicit `/web` and `/deep` commands), web-search module contains dead code that was not removed during the refactor.

## Problem Statement

The `src/web-search/` module has:
1. Dead code from previous intent-detection approach
2. Hardcoded paths instead of config-driven approach
3. Inconsistency with `deep-research` module patterns

## Scope

### In Scope

1. **Dead Code Removal**
   - `src/web-search/detect.ts` - keyword/regex detection logic (no longer called)
   - `src/web-search/executor.ts` - `aggressivelyCleanQuery()` function (never called)
   - Related test files if they only test dead code

2. **Configuration Alignment**
   - Hardcoded CLI path in `executor.ts:27`:
     ```typescript
     cliPath = "/home/almaz/TOOLS/web_search_by_gemini/web-search-by-Gemini.sh"
     ```
   - Should follow `deep-research` pattern: `cfg.webSearch.cliPath`

3. **Import Cleanup**
   - Remove unused imports in `bot.ts` and other files

### Out of Scope

- Changing web search functionality
- Adding event streaming (parity with deep-research)
- Changing command parsing behavior
- UI/UX changes

## Files to Analyze

| File | Status | Action |
|------|--------|--------|
| `src/web-search/detect.ts` | Dead code | ? |
| `src/web-search/detect.test.ts` | Tests dead code | ? |
| `src/web-search/executor.ts` | Has dead function | Remove `aggressivelyCleanQuery()` |
| `src/web-search/gemini-cli.ts` | Active | Review |
| `src/web-search/messages.ts` | Active | Review |
| `src/web-search/test-fixtures.ts` | ? | Review |
| `src/telegram/bot.ts` | Imports detect.ts? | Clean imports |

## Open Questions

1. Is `detect.ts` used anywhere else in the codebase? (need grep verification)
2. Is `aggressivelyCleanQuery()` called from anywhere? (need grep verification)
3. Should `detect.ts` be fully removed or kept for future use?
4. Config schema for `webSearch.cliPath` - what type/defaults?

## Success Criteria

- [ ] No dead code in `src/web-search/`
- [ ] All tests pass after cleanup
- [ ] CLI path is configurable via `cfg.webSearch.cliPath`
- [ ] No unused imports
- [ ] Build succeeds

## References

- Commit `edf9fdb8`: refactor(telegram): use explicit /web and /deep commands
- Commit `7607c1c6`: refactor(web-search): exclude /deep command from detection
- `src/deep-research/executor.ts` - reference for config pattern
