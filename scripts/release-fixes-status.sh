#!/usr/bin/env bash
# Show hotfix/* branches and whether they're needed for a target
# Usage: ./scripts/release-fixes-status.sh [target]

set -euo pipefail

TARGET="${1:-HEAD}"
HOTFIX_PREFIX="hotfix/"

# Resolve target
case "$TARGET" in
  upstream) git fetch upstream main 2>/dev/null; TARGET_REF="upstream/main" ;;
  v*) TARGET_REF="$TARGET" ;;
  *) TARGET_REF="$TARGET" ;;
esac

TARGET_SHA=$(git rev-parse "$TARGET_REF" 2>/dev/null || { echo "❌ Cannot resolve: $TARGET"; exit 1; })
TARGET_DESC=$(git describe --tags --always "$TARGET_SHA" 2>/dev/null || echo "$TARGET_SHA")

echo "📋 Hotfix Status"
echo "================"
echo "Target: $TARGET_DESC"
echo "Pattern: ${HOTFIX_PREFIX}*"
echo ""

BRANCHES=$(git for-each-ref --format='%(refname:short)' "refs/heads/${HOTFIX_PREFIX}*" 2>/dev/null | sort)

if [[ -z "$BRANCHES" ]]; then
  echo "No ${HOTFIX_PREFIX}* branches found"
  echo ""
  echo "To create a hotfix:"
  echo "  git checkout -b hotfix/my-fix"
  exit 0
fi

printf "%-35s %-18s %s\n" "HOTFIX" "STATUS" "COMMITS"
printf "%-35s %-18s %s\n" "------" "------" "-------"

for branch in $BRANCHES; do
  id="${branch#$HOTFIX_PREFIX}"
  FIX_TIP=$(git rev-parse "$branch")

  if git merge-base --is-ancestor "$FIX_TIP" "$TARGET_SHA" 2>/dev/null; then
    printf "%-35s %-18s %s\n" "$id" "✅ in target" "-"
  else
    MERGE_BASE=$(git merge-base "$TARGET_SHA" "$branch" 2>/dev/null || echo "")
    if [[ -n "$MERGE_BASE" ]]; then
      COUNT=$(git rev-list --count "$MERGE_BASE".."$branch")
    else
      COUNT="?"
    fi
    printf "%-35s %-18s %s\n" "$id" "⏳ will apply" "$COUNT"
  fi
done

echo ""
echo "Commands:"
echo "  Preview: ./scripts/apply-release-fixes.sh --dry-run"
echo "  Apply:   ./scripts/apply-release-fixes.sh"
