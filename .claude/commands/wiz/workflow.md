---
description: Summon workflow wizard - prime agent with dev workflow and project management
allowed-tools: [Read, Glob, Grep, Task, Bash]
argument-hint: "[--verbose]"
---

# Wizard: Development Workflow

You are summoning a workflow wizard. Prime yourself with understanding of the development workflow, project management, and processes we use together.

**Arguments:** $ARGUMENTS

## CRITICAL: No Cheating

You MUST explore the workflow docs and project state, even in quiet mode.
The exploration happens regardless - `--verbose` only controls whether you display the report.

Generate your internal summary to ensure context is loaded. Then decide whether to show it.

---

## Phase 1: Explore Workflow Documentation

Read the main workflow guide and understand the development model:

| Priority | File | Purpose |
|----------|------|---------|
| 1 | `.workflow/AGENTS.md` | Complete workflow guide - the source of truth |
| 2 | `~/Projects/clawdbot/project/BACKLOG.md` | Current priorities and tasks |
| 3 | `~/Projects/clawdbot/project/DONE.md` | Completed work log |
| 4 | `.workflow/automation/agent-automation.md` | Multi-agent coordination (if exists) |
| 5 | `.workflow/automation/infrastructure.md` | Infrastructure setup (if exists) |

---

## Phase 2: Understand Build & Release System

Read the release build scripts and understand the hotfix workflow:

| File | Purpose |
|------|---------|
| `scripts/build-release.sh` | Main build script - creates worktrees, applies hotfixes |
| `scripts/apply-release-fixes.sh` | Auto-applies `hotfix/*` branches |
| `scripts/release-fixes-status.sh` | Shows hotfix status vs any target |
| `scripts/deploy-release.sh` | Deploys build to /Applications (admin) |

**Key Concepts:**
- **Hotfix Convention:** Branches named `hotfix/*` auto-apply during builds
- **Worktrees:** Isolated build directories in `.worktrees/<version>/`
- **Latest Symlink:** `.local/latest` points to most recent build

---

## Phase 3: Map Available Commands

Explore the slash command structure:

```bash
# Check available dev commands
ls .claude/commands/dev/

# Check available build commands
ls .claude/commands/build/

# Check available wiz commands
ls .claude/commands/wiz/
```

**Command Namespaces:**
- `/dev:*` - Development workflow (gate, test, commit, tdd, etc.)
- `/build:*` - Release builds (release, help)
- `/wiz:*` - Wizard priming (core, workflow, help)

---

## Phase 4: Understand Git Model

From `.workflow/AGENTS.md`, understand the three-remote model:

| Remote | Repository | Purpose |
|--------|------------|---------|
| `dev` | petter-b/clawdbot-dev (private) | Daily development |
| `fork` | petter-b/clawdbot (public) | PR staging |
| `upstream` | clawdbot/clawdbot | PR target only |

**PR Flow:** dev → fork → upstream

**Dev-Only Files (never push):**
- `.workflow/` - Workflow documentation
- `.claude/` - Claude Code config
- `scripts/setup-*.sh` - Local setup scripts
- `scripts/daily-*.sh` - Daily build automation

---

## Phase 5: Generate Report

Create a concise internal summary covering:
- Current project priorities (from BACKLOG.md)
- Hotfix system and build workflow
- Available slash commands
- Git remote model

### If `--verbose` in arguments:

Display your summary:

```
Dev Workflow Primed
===================

Project Status:
  Backlog:   ~/Projects/clawdbot/project/BACKLOG.md
  Done log:  ~/Projects/clawdbot/project/DONE.md

Hotfix System:
  Convention:  hotfix/* branches auto-apply during builds
  Status:      ./scripts/release-fixes-status.sh [target]
  Apply:       ./scripts/apply-release-fixes.sh [--dry-run]

Release Builds:
  Build:       /build:release [version]
  Artifacts:   .worktrees/<version>/dist/Clawdbot.app
  Latest:      .local/latest symlink

Git Model:
  dev      → Daily development (private)
  fork     → PR staging (public)
  upstream → PR target only

Commands:
  /dev:help    Development workflow commands
  /build:help  Release build commands
  /wiz:help    Wizard priming commands

Ready for questions about workflow, releases, or project planning.
```

### Default (no --verbose):

Just say:

```
Primed for workflow and project management questions.
```

---

## Ready

You are now a workflow expert. Answer questions with confidence about:
- Development workflow and conventions
- Build and release process
- Project priorities and tracking
- Git model and PR flow
- Available slash commands

If asked about something you didn't explore, read the relevant files first.
