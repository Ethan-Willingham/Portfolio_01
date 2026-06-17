#!/usr/bin/env bash
# voice-lint.sh - keep em dashes and high-confidence LLM tells out of committed site content.
#
# Runs from a git pre-commit hook, so it scans the STAGED versions of *.html and *.md
# (exactly what is about to ship). Hard violations block the commit; soft tells warn only.
# The rules mirror VOICE.md section 5 (the kill-list). Enable once per checkout with:
#   git config core.hooksPath tools/githooks
#
# Bypass in a genuine exception with: git commit --no-verify

set -u

EMDASH=$'\xe2\x80\x94'   # em dash, U+2014
ENDASH=$'\xe2\x80\x93'   # en dash, U+2013 (used as a sentence dash)

# Formulaic filler that almost never appears in honest prose. Hard block.
HARD_PHRASES="in today's fast-paced world|in today's world|let's dive in|let us dive in|let's explore|it's important to note|it is important to note|it's worth noting|it is worth noting|needless to say|at the end of the day|in conclusion|buckle up"

# Fuzzier tells. These can be legitimate in context, so warn only.
SOFT_WORDS="delve|leverage|robust|seamless|pivotal|foster|underscore|nestled|meticulous|tapestry|testament"
SOFT_PHRASES="it's not just|it is not just|not only|that being said"

# Skip entirely: the frozen game demo, throwaway *-lab choosers, research scratch.
skip_all() {
  case "$1" in
    grand-motherload.html|*-lab.html) return 0 ;;
    research/*|node_modules/*|.git/*) return 0 ;;
  esac
  return 1
}

# Tell-phrase checks do not apply to the meta-docs, which quote the tells on purpose.
# (Em dashes are still checked everywhere except skip_all.)
skip_tells() {
  case "$1" in
    VOICE.md|AGENTS.md|CLAUDE.md|STYLE.md|README.md) return 0 ;;
    .claude/*) return 0 ;;
  esac
  return 1
}

hard_fail=0

while IFS= read -r f; do
  [ -n "$f" ] || continue
  skip_all "$f" && continue
  content=$(git show ":$f" 2>/dev/null) || continue

  dash=$(printf '%s\n' "$content" | grep -nF -e "$EMDASH" -e "$ENDASH" || true)
  if [ -n "$dash" ]; then
    echo "BLOCK  $f  (em/en dash; no dashes anywhere, use commas, periods, parens, or \"to\")"
    printf '%s\n' "$dash" | sed 's/^/    line /'
    hard_fail=1
  fi

  if ! skip_tells "$f"; then
    ph=$(printf '%s\n' "$content" | grep -niE "$HARD_PHRASES" || true)
    if [ -n "$ph" ]; then
      echo "BLOCK  $f  (LLM tell phrase; see the VOICE.md kill-list)"
      printf '%s\n' "$ph" | sed 's/^/    line /'
      hard_fail=1
    fi
    sw=$(printf '%s\n' "$content" | grep -niE "(${SOFT_WORDS})|${SOFT_PHRASES}" || true)
    if [ -n "$sw" ]; then
      echo "warn   $f  (possible LLM tell, check it in context)"
      printf '%s\n' "$sw" | sed 's/^/    line /'
    fi
  fi
done < <(git diff --cached --name-only --diff-filter=ACM -- '*.html' '*.md')

if [ "$hard_fail" -ne 0 ]; then
  echo ""
  echo "voice-lint: commit blocked. Fix the BLOCK lines above (the /write-post self-edit covers them),"
  echo "then commit again. Genuine exception: git commit --no-verify"
  exit 1
fi
exit 0
