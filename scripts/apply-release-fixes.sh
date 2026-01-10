#!/usr/bin/env bash
# Apply fixes from hotfix/* branches that aren't already in target
# Usage: ./scripts/apply-release-fixes.sh [--dry-run]
#
# Convention: Name your branch hotfix/<name> to have it auto-applied
# Fixes are automatically skipped once merged upstream

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

HOTFIX_PREFIX="hotfix/"

TARGET_DESC=$(git describe --tags --always HEAD 2>/dev/null || git rev-parse --short HEAD)

echo "🔧 Applying Hotfixes"
echo "===================="
echo "Target: $TARGET_DESC"
echo "Pattern: ${HOTFIX_PREFIX}*"
$DRY_RUN && echo -e "\033[1;33m(DRY RUN)\033[0m"
echo ""

# Find all hotfix/* branches
BRANCHES=$(git for-each-ref --format='%(refname:short)' "refs/heads/${HOTFIX_PREFIX}*" 2>/dev/null | sort)

if [[ -z "$BRANCHES" ]]; then
  echo "No ${HOTFIX_PREFIX}* branches found"
  exit 0
fi

for branch in $BRANCHES; do
  id="${branch#$HOTFIX_PREFIX}"
  FIX_TIP=$(git rev-parse "$branch")

  # Skip if already in target
  if git merge-base --is-ancestor "$FIX_TIP" HEAD 2>/dev/null; then
    echo "✅ [$id] already in target"
    continue
  fi

  # Count commits to apply
  MERGE_BASE=$(git merge-base HEAD "$branch" 2>/dev/null || echo "")
  if [[ -z "$MERGE_BASE" ]]; then
    echo "⚠️  [$id] no common ancestor, skipping"
    continue
  fi

  COMMIT_COUNT=$(git rev-list --count "$MERGE_BASE".."$branch" 2>/dev/null || echo "0")
  if [[ "$COMMIT_COUNT" -eq 0 ]]; then
    echo "✅ [$id] no new commits"
    continue
  fi

  echo ""
  echo "🔧 [$id] $COMMIT_COUNT commit(s)"
  git rev-list --oneline "$MERGE_BASE".."$branch" | sed 's/^/   /'

  if $DRY_RUN; then
    continue
  fi

  # Cherry-pick commits
  COMMITS=$(git rev-list --reverse "$MERGE_BASE".."$branch")
  SUCCESS=true

  for commit in $COMMITS; do
    if ! git cherry-pick --no-commit "$commit" 2>/dev/null; then
      echo "   ❌ conflict at $(git rev-parse --short $commit)"
      git cherry-pick --abort 2>/dev/null || true
      SUCCESS=false
      break
    fi
  done

  if $SUCCESS; then
    git commit -m "hotfix: apply $id ($COMMIT_COUNT commits)"
    echo "   ✅ applied"
  fi
done

echo ""
echo "===================="
$DRY_RUN && echo -e "\033[1;33m(DRY RUN - no changes made)\033[0m" || echo "Done"
