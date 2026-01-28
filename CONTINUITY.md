# CONTINUITY.md — Exec Events E2E Fix

## Goal
Make exec events (Codex, Claude, etc.) visible in Crabwalk UI as distinct "EXEC" nodes — not "agent" or "chat".

### Success Criteria
1. When Codex runs, Crabwalk shows an "EXEC" labeled node (not "AGENT")
2. Exec events flow: Gateway emits → WebSocket broadcasts → Crabwalk receives → UI renders
3. All changes have test coverage
4. Clean git history with meaningful commits

## Constraints/Assumptions
- Gateway code: `/home/clawdbot/dev/clawdbot-exec-events/`
- Crabwalk code: `/home/clawdbot/apps/crabwalk/`
- Config already has `hooks.exec.emitEvents: true` and whitelist
- Must use test-driven approach

## Key Decisions
1. Rolled back cowboy changes (2026-01-27)
2. Starting fresh with proper beads model

## State

### Done
- [x] Rolled back uncommitted changes
- [x] Created CONTINUITY.md
- [x] **Bead 1: Audit** — Full E2E flow audit complete (see AUDIT_REPORT.md)
- [x] **Bead 2: Add top-level runId** — Commit `e49b41503` (2026-01-27)
  - Added `runId?: string` to ExecEventBase type
  - Updated all 3 emitExecEvent calls to include `runId: execEventsState.context?.runId`
  - Build passes

### Now
- [ ] Test & deploy Crabwalk graph layout fixes

### Next
- [ ] Push to GitHub (failed earlier due to token permissions)
- [ ] Add test coverage for top-level runId

### Crabwalk Graph Layout Fixes (Bead 3) — 2026-01-28
**Problems Fixed:**
1. Subagents spawned from top "lobster" node → Now connect to parent session
2. Exec nodes appeared unattached → Connect to their session via sessionKey
3. Subagents missing timestamps → Now display relative time ("2m ago")
4. Session identification → Subagent sessions now styled distinctly with cyan glow

**Changes Made:**

**Gateway (`/home/clawdbot/dev/clawdbot-exec-events`):**
- `src/gateway/session-utils.types.ts`: Added `spawnedBy?: string` and `createdAt?: number` to `GatewaySessionRow`
- `src/gateway/session-utils.ts`: Include `spawnedBy` in session list response

**Crabwalk (`/home/clawdbot/apps/crabwalk`):**
- `src/integrations/clawdbot/protocol.ts`: Added `spawnedBy?: string` to `SessionInfo` and `MonitorSession`
- `src/integrations/clawdbot/parser.ts`: Pass through `spawnedBy` in `sessionInfoToMonitor`
- `src/components/monitor/ActionGraph.tsx`: Use `spawnedBy` to connect subagent sessions to parent (not crab origin)
- `src/components/monitor/SessionNode.tsx`: Added timestamp display, subagent visual styling with cyan glow

**Builds Verified:** Both Gateway and Crabwalk compile successfully

## Open Questions (RESOLVED)
- ✅ CONFIRMED: Exec events ARE being emitted (Line 406-408, server.impl.ts)
- ✅ CONFIRMED: Crabwalk HAS distinct ExecNode.tsx component (not reusing AgentNode)
- ✅ CONFIRMED: runId IS required for session linking but optional in Gateway
- ✅ ROOT CAUSE: Gateway sends `context.runId` (nested, optional), Crabwalk expects `exec.runId` (top-level, required)

## Working Set
- Gateway exec emission: `src/agents/bash-tools.exec.ts`
- Gateway broadcast: `src/gateway/server.impl.ts`
- Exec event types: `src/infra/exec-events.ts`
- Crabwalk parser: `/home/clawdbot/apps/crabwalk/src/integrations/clawdbot/parser.ts`
- Crabwalk UI: `/home/clawdbot/apps/crabwalk/src/components/monitor/ExecNode.tsx`
- Crabwalk graph: `/home/clawdbot/apps/crabwalk/src/components/monitor/ActionGraph.tsx`
