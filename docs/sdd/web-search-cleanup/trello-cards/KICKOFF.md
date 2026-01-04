# Web Search Cleanup - AI Agent Kickoff

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🤖 AI AGENT INSTRUCTION                                                    ║
║                                                                              ║
║   Execute ALL 5 cards below in LINEAR order.                                 ║
║   Update state.json after EACH card.                                         ║
║   Do NOT stop until all cards are "completed".                               ║
║                                                                              ║
║   START NOW. First action: Read state.json, find first pending card.        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

> **ENTRY POINT**: This is the ONLY file you need. Everything is linked from here.
> This file is SELF-CONTAINED. Do not ask for clarification - all info is here.

## Mission

Clean up dead code in `src/web-search/` module after the refactor to explicit `/web` command.
Execute 5 cards in linear order. Track progress in `state.json`.

## Protocol

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AGENT EXECUTION LOOP                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. READ state.json → Find current card (status = "pending")            │
│  2. UPDATE state.json → Set card to "in_progress"                       │
│  3. READ card file → Execute all instructions                           │
│  4. VERIFY → Check all acceptance criteria                              │
│  5. UPDATE state.json → Set card to "completed" or "failed"             │
│  6. LOOP → Go to step 1 until all cards completed                       │
│                                                                         │
│  ON ERROR: Set card to "failed", add error message, STOP for help       │
│  ON COMPLETE: Set overall status to "COMPLETE"                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose | Agent Action |
|------|---------|--------------|
| [BOARD.md](./BOARD.md) | Card overview and pipeline | Read once at start |
| [state.json](./state.json) | Progress tracking | Read+write each card |
| [01-verify-dead-code.md](./01-verify-dead-code.md) | Verify dead code | **Execute** |
| [02-remove-detect-ts.md](./02-remove-detect-ts.md) | Remove detect.ts | **Execute** |
| [03-remove-dead-function.md](./03-remove-dead-function.md) | Remove function | **Execute** |
| [04-add-cli-config.md](./04-add-cli-config.md) | Add CLI config | **Execute** |
| [05-verify-and-test.md](./05-verify-and-test.md) | Final verification | **Execute** |

## Getting Started

```bash
cd docs/sdd/web-search-cleanup/trello-cards
cat state.json
```

**First action:** Read [BOARD.md](./BOARD.md) to understand card sequence.
**Then:** Execute cards in order: 01 → 02 → 03 → 04 → 05

## Completion Criteria

- [ ] All cards in state.json show "completed"
- [ ] No dead code in src/web-search/
- [ ] CLI path is configurable
- [ ] All tests pass
- [ ] Build succeeds

---

**NOW BEGIN.** First card: [01-verify-dead-code.md](./01-verify-dead-code.md)
