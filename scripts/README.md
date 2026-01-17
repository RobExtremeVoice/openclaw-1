# Scripts Directory

This directory contains a **mix of upstream and fork-specific scripts**.

## Fork-Specific Scripts (Local Only)

These scripts exist **only in this fork** and will never conflict with upstream:

| Script | Purpose |
|--------|---------|
| `apply-release-fixes.sh` | Apply hotfix/* branches to release builds |
| `build-release.sh` | Build releases with hotfixes in .worktrees/ |
| `clawdbot-status.sh` | Monitor multiple Clawdbot instances |
| `deploy-release.sh` | Deploy built releases to /Applications |
| `e2e-with-gateway.sh` | Run E2E tests with test gateway |
| `release-fixes-status.sh` | Show hotfix branch status |
| `sync-upstream.sh` | Automated upstream sync (runs via cron) |

## Upstream Scripts

All other scripts in this directory come from upstream and should **not** be modified locally unless you plan to PR the changes back.

## Validation

Run this to verify fork-specific scripts haven't been added to upstream:

```bash
./.workflow/scripts/audit-fork-config.sh
```

## Guidelines

- **Fork-only scripts:** Add them here, document above, verify with audit
- **Upstream scripts:** Don't modify locally; PR changes upstream instead
- **When in doubt:** Check if the script exists in `upstream/main`
