# Web Search Cleanup - Trello Board

> Scrum Master: AI Agent | Sprint: Linear Execution
> Story Point Cap: 4 SP per card | Principle: KISS

## Execution Order

```
┌────────────────────────────────────────────────────────┐
│                     EXECUTION PIPELINE                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│  SPRINT 1: Verification & Removal                      │
│  ┌─────┐   ┌─────┐   ┌─────┐                          │
│  │ 01  │ → │ 02  │ → │ 03  │                          │
│  │ 1SP │   │ 2SP │   │ 1SP │                          │
│  └─────┘   └─────┘   └─────┘                          │
│  Verify    Remove    Remove                            │
│  Dead      detect.ts Function                          │
│                                                        │
│  SPRINT 2: Config & Finalize                           │
│  ┌─────┐   ┌─────┐                                    │
│  │ 04  │ → │ 05  │                                    │
│  │ 2SP │   │ 1SP │                                    │
│  └─────┘   └─────┘                                    │
│  Config    Verify                                      │
│  CLI Path  & Test                                      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## Card Index

| Card | Title | SP | Depends On | Status |
|------|-------|----|-----------:|--------|
| [01](./01-verify-dead-code.md) | Verify dead code with grep | 1 | - | TODO |
| [02](./02-remove-detect-ts.md) | Remove detect.ts and tests | 2 | 01 | TODO |
| [03](./03-remove-dead-function.md) | Remove aggressivelyCleanQuery | 1 | 02 | TODO |
| [04](./04-add-cli-config.md) | Add configurable CLI path | 2 | 03 | TODO |
| [05](./05-verify-and-test.md) | Verify build and tests | 1 | 04 | TODO |

## Sprint Summary

- **Sprint 1:** Dead Code Removal (4 SP)
  - Verify, Remove detect.ts, Remove function
- **Sprint 2:** Config & Finalize (3 SP)
  - Add CLI config, Verify & Test

**Total: 7 SP**
