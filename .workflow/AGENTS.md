# Agent Workflow Guide

> **You are in `clawdbot-dev`** (private fork). This is the primary development environment.
> PRs flow: `dev` → `fork` (public) → `upstream` (clawdbot/clawdbot)

## Directory Structure

```
.workflow/
├── AGENTS.md               # This file - main workflow guide
└── automation/
    ├── agent-automation.md # Multi-agent coordination
    └── infrastructure.md   # Mac mini + k3s + Tailscale

.claude/
├── CLAUDE.md               # Points here
├── settings.json           # Permissions and hooks
├── commands/
│   ├── dev/                # Dev workflow commands (dev:*)
│   └── build/              # Release build commands (build:*)
├── skills/                 # Auto-applied knowledge
│   ├── writing-tests/      # TDD patterns
│   ├── e2e-testing/        # E2E patterns
│   └── reviewing-code/     # Code review checklists
└── hooks/pre-bash.sh       # Pre-bash validation
```

### What Stays in Dev Repo (Never Push to Fork/Upstream)

| Content | Location |
|---------|----------|
| Workflow docs | `.workflow/` |
| Claude Code config | `.claude/` |
| Setup scripts | `scripts/setup-*.sh` |

**Explore locally:** `CLAUDE.md` (root) for project standards, `package.json` for commands, `src/**/*.test.ts` for test patterns.

---

## Quick Start

### First Steps
1. Read root `CLAUDE.md` - coding standards (source of truth)
2. Check `package.json` - available scripts
3. Run `/dev:help` - see available slash commands

### Key Commands
```bash
/dev:help              # List all dev commands
/dev:gate              # Quality gate - run before every commit
/dev:fix-issue <num>   # Fix an upstream issue
/dev:pr-review <num>   # Review a PR (read-only)
/dev:pr-test <num>     # Test a PR locally
```

### Workflow Docs Index

| Trigger | Read |
|---------|------|
| Writing tests | `.claude/skills/writing-tests/SKILL.md` |
| Writing E2E tests | `.claude/skills/e2e-testing/SKILL.md` |
| Multi-agent setup | `.workflow/automation/agent-automation.md` |
| Something broken | [Troubleshooting](#troubleshooting) |

---

## Git Remotes (Three-Remote Model)

| Remote | Repository | Purpose |
|--------|------------|---------|
| `dev` | petter-b/clawdbot-dev (private) | Daily development |
| `fork` | petter-b/clawdbot (public) | PR staging, mirrors upstream |
| `upstream` | clawdbot/clawdbot | PR target only, never push directly |

### Dev-Only Files (Never Push to Fork/Upstream)

```
.workflow/           # This workflow documentation
.claude/             # Claude Code config (slash commands, hooks)
scripts/setup-*.sh   # Local setup scripts
scripts/daily-*.sh   # Daily build automation
```

---

## Contributing to Upstream

### Workflow 1: Fixing an Issue

```bash
# 1. Sync from upstream
git fetch upstream
git checkout main
git merge upstream/main
git push dev main

# 2. Create PR branch from upstream/main
git checkout -b pr/fix-issue-123 upstream/main

# 3. Develop with TDD
/dev:tdd red "fix <issue description>"   # Write failing test
/dev:tdd green                            # Implement fix
/dev:gate                                 # Verify all passes

# 4. Commit (scoped) and push to public fork
scripts/committer "fix: description (#123)" src/file.ts src/file.test.ts
git push fork pr/fix-issue-123

# 5. Create PR
gh pr create --repo clawdbot/clawdbot \
  --base main \
  --head petter-b:pr/fix-issue-123 \
  --title "fix: description" \
  --body "Closes #123

## Summary
- What this fixes

## Test plan
- [x] Added regression test
- [x] Ran /dev:gate"
```

### Workflow 2: Reviewing a PR (Read-Only)

```bash
# View PR details and diff - do NOT checkout
gh pr view 123 --repo clawdbot/clawdbot
gh pr diff 123 --repo clawdbot/clawdbot

# Review checklist:
# - Security: input validation, injection, secrets
# - Quality: error handling, edge cases, types
# - Style: <700 LOC files, no over-engineering
# - Tests: adequate coverage
# - CHANGELOG: entry with PR # and contributor thanks
```

### Workflow 3: Testing a PR Locally

```bash
# 1. Create temp branch
git checkout -b temp/test-pr-123 main

# 2. Fetch and apply PR
gh pr checkout 123 --repo clawdbot/clawdbot

# 3. Test
/dev:gate
/dev:e2e

# 4. Clean up
git checkout main
git branch -D temp/test-pr-123
```

---

## One-Shot Prompt Templates

**Use slash commands** (they include full context):
- `/dev:fix-issue 123` - Fix issue #123
- `/dev:pr-review 456` - Review PR #456
- `/dev:pr-test 456` - Test PR #456 locally

---

## Slash Commands Reference

### Upstream Contributions
| Command | Purpose |
|---------|---------|
| `/dev:fix-issue <num>` | Fix an upstream issue with TDD |
| `/dev:pr-review <num>` | Review a PR (read-only) |
| `/dev:pr-test <num>` | Test a PR locally |

### Quality & Testing
| Command | Purpose |
|---------|---------|
| `/dev:gate` | **Run before every commit** - lint, build, test |
| `/dev:test [pattern]` | Run tests (add `--coverage` for report) |
| `/dev:e2e [pattern]` | Run E2E tests |
| `/dev:coverage [path]` | Analyze coverage gaps |

### Workflow
| Command | Purpose |
|---------|---------|
| `/dev:tdd red [feature]` | Write failing tests first |
| `/dev:tdd green` | Implement to pass tests |
| `/dev:tdd refactor` | Improve with tests passing |
| `/dev:commit "msg" files` | Safe commit via scripts/committer |
| `/dev:help` | List all commands |

### Release Builds
| Command | Purpose |
|---------|---------|
| `/build:release [version]` | Build latest (or specific) release with hotfixes |
| `/build:help` | Show build command help |

---

## Quality Standards

### Before Every Commit
```bash
/dev:gate   # or manually: pnpm lint && pnpm build && pnpm test --run
```

### PR Title Format (Conventional Commits)
- `feat(scope): add feature`
- `fix(scope): fix bug`
- `refactor(scope): improve code`
- `docs: update guide`

### CHANGELOG Entry Format

From steipete's commits:
```markdown
- Telegram: retry long-polling conflicts with backoff to avoid fatal exits.
- Onboarding: QuickStart auto-installs the Gateway daemon with Node.
```

For external contributors, add thanks:
```markdown
- WhatsApp: group /model list output by provider. (#456) - thanks @mcinteerj
```

### Code Standards (from root CLAUDE.md)
- 70% test coverage threshold
- Files under ~700 LOC
- No `any` types
- Extract helpers instead of duplicating

---

## Release Builds

Build upstream releases with local hotfixes applied automatically.

### Quick Start

```bash
/build:release              # Build latest upstream release
/build:release v2026.1.8    # Build specific version
/build:help                 # Show all build commands
```

### Hotfix Convention

Name branches `hotfix/*` to have them auto-applied during builds:

```bash
# Create a hotfix
git checkout -b hotfix/my-fix
# ... make changes, commit ...

# Check status
./scripts/release-fixes-status.sh

# Build (hotfixes auto-apply)
/build:release
```

Hotfixes are automatically skipped once merged upstream.

### Build Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/build-release.sh <version>` | Full build pipeline |
| `./scripts/deploy-release.sh [path]` | Deploy to /Applications |
| `./scripts/release-fixes-status.sh [target]` | Show hotfix status |
| `./scripts/apply-release-fixes.sh [--dry-run]` | Apply hotfixes manually |

### Build Artifacts

- **Worktrees**: `.worktrees/<version>/` - isolated build directories
- **Latest symlink**: `.local/latest` → most recent build worktree
- **Built app**: `.worktrees/<version>/dist/Clawdbot.app`

### Workflow

1. **Build** (as petter): `./scripts/build-release.sh v2026.1.10`
2. **Deploy** (as admin): `./scripts/deploy-release.sh` (uses `.local/latest`)

---

## Multi-Agent Safety

When multiple agents work in parallel:

| Rule | Reason |
|------|--------|
| Don't switch branches | Other agents may be on them |
| Don't stash | Affects shared state |
| Don't force push | Destroys others' work |
| Scope commits to your files | Avoid conflicts |
| Use worktrees for isolation | `.worktrees/<agent>/` |

---

## Daily Builds

Automated dual-architecture builds run daily at 06:00 to catch upstream regressions.

### Architecture

| Build | Platform | Script |
|-------|----------|--------|
| ARM (Apple Silicon) | Mac (local) | `scripts/daily-build.sh` |
| x86 (matches CI) | k8s cluster | `scripts/daily-build-k8s.sh` |
| E2E tests | k8s cluster | `scripts/daily-e2e-k8s.sh` |
| **Orchestrator** | Mac → k8s | `scripts/daily-all.sh` |

### Running Manually

```bash
# Full dual-architecture build (ARM + x86 in parallel)
./scripts/daily-all.sh

# ARM only (local)
./scripts/daily-build.sh

# x86 only (on k8s)
./scripts/daily-build-k8s.sh

# Include E2E tests after builds
INCLUDE_E2E=1 ./scripts/daily-all.sh
```

### Checking Results

```bash
# Latest build logs
ls -lt ~/.clawdbot/daily-builds/

# Today's summary
cat ~/.clawdbot/daily-builds/summary-$(date +%Y-%m-%d).log

# ARM build log
cat ~/.clawdbot/daily-builds/arm-$(date +%Y-%m-%d).log

# x86 build log
cat ~/.clawdbot/daily-builds/x86-$(date +%Y-%m-%d).log
```

### Scheduling (launchd)

The daily build is scheduled via `~/Library/LaunchAgents/com.clawdbot.daily-build.plist`.

```bash
# Check status
launchctl list | grep clawdbot

# Manual trigger
launchctl start com.clawdbot.daily-build

# View output
tail -f /tmp/clawdbot-daily-build.log
```

### If Build Fails

1. Check which architecture failed (ARM vs x86)
2. Read the relevant log in `~/.clawdbot/daily-builds/`
3. Determine if it's:
   - **Upstream regression** → Create issue or find existing
   - **Local config issue** → Fix deployment
   - **Flaky test** → Re-run to confirm

---

## Where to Find Things

| Need | Location |
|------|----------|
| Project coding standards | `CLAUDE.md` (root, synced from upstream) |
| Test patterns | `src/**/*.test.ts` |
| E2E patterns | `test/*.e2e.test.ts` |
| Test helpers | `src/gateway/test-helpers.ts` |
| CLI commands | `package.json` scripts |
| Slash commands | `.claude/commands/dev/` |

### Skills (Auto-Applied)

| Skill | Triggers When |
|-------|---------------|
| `writing-tests` | Writing or modifying tests, implementing features |
| `e2e-testing` | Writing integration tests, spawning processes |
| `reviewing-code` | After significant code changes, before commits |

### Workflow Documentation

| Trigger | Document |
|---------|----------|
| Multi-agent setup | `automation/agent-automation.md` |
| Infrastructure | `automation/infrastructure.md` |

---

## Troubleshooting

### Tests Timeout
Tests hanging or taking >30 seconds usually means stuck processes or port conflicts.

```bash
pgrep -f clawdbot          # Check for stuck gateway processes
pkill -f clawdbot          # Kill them
lsof -i :8080              # Check if port is in use
```

### E2E "Connection Refused"
Gateway not running. The `/dev:e2e` command spawns it automatically via `pnpm test:e2e`.

If running manually, ensure gateway is started first.

### Worktree Conflicts
"Branch already checked out" errors occur when multiple agents try to use the same branch.

```bash
git worktree list          # See all worktrees
git worktree remove <path> # Remove a stuck worktree
```

Each agent should have its own worktree under `.worktrees/`.

### Lint Fails
Biome formatting issues can often be auto-fixed.

```bash
pnpm format                # Auto-fix formatting
pnpm lint                  # See remaining issues
```

**Explore:** `biome.json` for lint rules.

---

## Upstream Patterns

### Current Open Issues (Good Starting Points)
- Issues labeled `bug` have clear scope
- Many issues unlabeled - opportunity to help triage
- Check https://github.com/clawdbot/clawdbot/issues

### PR Expectations
- Focused scope (one thing per PR)
- Tests for new/changed behavior
- CHANGELOG entry with PR # and thanks
- Conventional commit title

### AI-Assisted PRs Welcome
From upstream CONTRIBUTING.md:
- Mark as AI-assisted in PR description
- Note testing level (untested/lightly/fully tested)
- Include prompts if helpful
- Confirm you understand the code
