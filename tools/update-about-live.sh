#!/usr/bin/env bash
# ============================================================================
# update-about-live.sh  -  one click: refresh the About page and publish it.
#
# Does the whole safe flow so you never have to think about it:
#   1. fetch the latest origin/main (the live site)
#   2. build a throwaway clean worktree there (your local main can be messy/stale)
#   3. run tools/update-about.mjs --write  (ccusage stats + commit river + tiles + search)
#   4. commit + push straight to origin/main, which GitHub Pages auto-deploys
#   5. remove the throwaway worktree
#
# Double-click "Update About Page" on the Desktop, or run:  bash tools/update-about-live.sh
# ============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="https://ethanwillingham.com/about.html"
bold() { printf '\033[1m%s\033[0m\n' "$1"; }
die()  { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

cd "$REPO" || die "Can't find the repo at $REPO"
command -v node >/dev/null || die "node is not on PATH (open a normal Terminal and try again)."

bold "Updating the About page (publishing to $SITE)"
echo "==> Fetching the latest live site..."
git fetch origin main || die "git fetch failed (are you online / signed in to GitHub?)"

WT="$(mktemp -d)/about-wt"
cleanup() { git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Building a clean checkout of the live site..."
git worktree add --detach "$WT" origin/main >/dev/null 2>&1 || die "couldn't create the worktree"
cd "$WT" || die "worktree missing"

echo "==> Running the updater..."
node tools/update-about.mjs --write || die "the updater hit an error (see above)"

echo "==> Publishing any changes..."
git add about.html js/git-history-data.js js/git-attribution-data.js search-index.json tools/about-stats.json
if git diff --cached --quiet; then
  bold "Already up to date - nothing new to publish."
else
  git commit -q -m "about: refresh build stats (ccusage + commit river + tiles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || die "commit failed"
  if git push origin HEAD:main; then
    bold "Done. Live in ~15 seconds: $SITE"
  else
    die "Push was rejected (someone else pushed first). Just run this again."
  fi
fi
