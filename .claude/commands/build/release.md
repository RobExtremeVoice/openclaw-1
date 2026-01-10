# Build Release

Build the latest upstream release with hotfixes applied.

## Steps

1. **Check hotfix status** - Show current `hotfix/*` branches and their status
2. **Check for new upstream release** - Fetch tags and compare with local
3. **Build** - Create worktree and build with hotfixes auto-applied

## Instructions

Run these steps in order:

### Step 1: Show hotfix status

```bash
./scripts/release-fixes-status.sh
```

Report what hotfixes exist and their status.

### Step 2: Check for new upstream release

```bash
git fetch upstream --tags
```

Then compare the latest upstream tag with local:

```bash
# Get latest upstream tag
LATEST=$(git tag --sort=-version:refname | grep '^v2' | head -1)
echo "Latest release: $LATEST"

# Check if we have a worktree for it
if [[ -d ".worktrees/$LATEST" ]]; then
  echo "Worktree exists: .worktrees/$LATEST"
else
  echo "No worktree yet for $LATEST"
fi
```

Report:
- Latest upstream version
- Whether we already have a build for it
- If there's a newer version available

### Step 3: Confirm and build

Ask the user if they want to proceed with building the latest version.

If yes, run:

```bash
./scripts/build-release.sh <version>
```

Where `<version>` is the latest tag (e.g., `v2026.1.9`).

### Step 4: Report results

After build completes, show:
- Build location
- Which hotfixes were applied
- Next steps (deploy command)

## Arguments

- `$ARGUMENTS` - Optional: specific version to build (e.g., `v2026.1.8`). If not provided, builds latest.
