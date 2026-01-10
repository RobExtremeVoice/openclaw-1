#!/usr/bin/env bash
set -euo pipefail

# Build script for petter account
# Usage: ./scripts/build-release.sh v2026.1.6

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 v2026.1.6"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_DIR="$REPO_ROOT/.worktrees/$VERSION"
BRANCH_NAME="release/$VERSION"
LATEST_LINK="$REPO_ROOT/.local/latest"

echo "🚀 Building Clawdbot $VERSION"
echo ""

# Check if worktree exists
if [[ ! -d "$WORKTREE_DIR" ]]; then
  cd "$REPO_ROOT"

  # Check if the release branch exists
  if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    echo "📂 Creating worktree for existing branch $BRANCH_NAME..."
    git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
  else
    # Branch doesn't exist - create it from the version tag
    if git rev-parse --verify --quiet "$VERSION" >/dev/null; then
      echo "📂 Creating worktree with new branch $BRANCH_NAME from tag $VERSION..."
      git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$VERSION"
    else
      echo "❌ Error: Neither branch '$BRANCH_NAME' nor tag '$VERSION' exists"
      echo "   Please create a tag first: git tag $VERSION"
      exit 1
    fi
  fi
  echo ""
fi

# Navigate to worktree
cd "$WORKTREE_DIR"
echo "📍 Working directory: $(pwd)"
echo ""

# Initialize submodules (required for Peekaboo and its dependencies)
if [[ ! -d "Peekaboo/Core/PeekabooCore" ]]; then
  echo "📦 Initializing submodules..."
  git submodule update --init --recursive
  echo ""
fi

# Apply fixes using the smart apply script
# This auto-detects which fixes are needed based on what's already in the target
if [[ -f "$REPO_ROOT/scripts/apply-release-fixes.sh" ]]; then
  "$REPO_ROOT/scripts/apply-release-fixes.sh"
  echo ""
else
  echo "⚠️  apply-release-fixes.sh not found, skipping fix application"
  echo ""
fi

# Install dependencies if needed
if [[ ! -d "node_modules" ]]; then
  echo "📦 Installing dependencies..."
  pnpm self-update
  pnpm install
  echo ""
fi

# Build
echo "🔨 Building app..."
BUILD_ARCHS="arm64" \
DISABLE_LIBRARY_VALIDATION=1 \
./scripts/package-mac-app.sh

echo ""
echo "✅ Build complete!"
echo ""

# Update latest symlink
echo "🔗 Updating 'latest' symlink..."
ln -sfn "$WORKTREE_DIR" "$LATEST_LINK"
echo "   $LATEST_LINK -> $WORKTREE_DIR"
echo ""

echo "Build location: $WORKTREE_DIR/dist/Clawdbot.app"
echo ""
echo "Next steps:"
echo "1. Switch to admin account"
echo "2. Run: ./scripts/deploy-release.sh"
echo ""
