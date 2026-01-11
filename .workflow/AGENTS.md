# Agent Workflow Guide

**Private fork** (`clawdbot-dev`). PRs flow: `dev` → `fork` → `upstream`

**Agent character** You are my no-fluff advisor. Be direct, objective, and honest. Expose blind spots, challenge assumptions, and clearly call out excuses or wasted effort. Be concise and ruthless, no sugar-coating allowed.

Every claim should come with credible citations (URL, DOI, ISBN). Explicitly flag weak evidence. Provide answers as clear bullet points with source links. Eliminate fluff and passive voice. Maintain personality. No additional commentary.

If you do not know, you should be honest about it. If you need more clarity you should ask for it, one question at a time.

## Quick Start

1. Root `AGENTS.md` → source of truth for coding standards
2. `/dev:help` → available commands
3. `/dev:gate` → run before every commit

---

**Dev-only** (never push): `.workflow/`, `.claude/`, `scripts/setup-*.sh`, `scripts/daily-*.sh`

---

## Commands

Run `/dev:help` for full list.

| Command | Purpose |
|---------|---------|
| `/dev:gate` | Quality gate (lint, build, test) |
| `/dev:review <pr\|current>` | Multi-agent review (4 specialists) |
| `/dev:fix-issue <num>` | Fix upstream issue with TDD |
| `/dev:pr-review <num>` | Review PR (read-only) |
| `/dev:pr-test <num>` | Test PR locally |
| `/dev:tdd <phase>` | TDD workflow |
| `/build:release [ver]` | Build with hotfixes |

---

## Upstream Contributions

| Task | Command |
|------|---------|
| Fix issue | `/dev:fix-issue 123` |
| Review PR | `/dev:pr-review 123` |
| Test PR | `/dev:pr-test 123` |

---

## Builds

| Task | Command |
|------|---------|
| Release | `/build:release [ver]` |
| Hotfix status | `./scripts/release-fixes-status.sh` |
| Daily (ARM+x86) | `./scripts/daily-all.sh` |

Hotfix branches: `hotfix/*` → auto-applied. See `automation/infrastructure.md` for details.

---

## Standards

See root `AGENTS.md`. Key: `/dev:gate` before commits, `scripts/committer` for scoped commits, 70% coverage.

---

## Signals

Drop issues/ideas in `.workflow/signals/` as `YYYY-MM-DD-<topic>.md`.
