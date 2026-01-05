#!/bin/bash
# Sync clawd workspace to GitHub

cd /Users/dbhurley/clawd

# Check if there are changes
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit"
    exit 0
fi

# Add, commit, push
git add -A
git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M')"
git push origin main

echo "Workspace synced and pushed!"
