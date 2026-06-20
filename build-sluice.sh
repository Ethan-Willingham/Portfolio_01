#!/usr/bin/env bash
# Rebuild js/sluice.js from its fragments in js/sluice/.
#
# The fragments (js/sluice/NNN-*.js) are the editable source. This script
# concatenates them in numeric order into the single bundle that sluice.html
# loads and Amplify serves. The concat is a dumb text join — no transform, no
# minify — so the bundle stays plain, readable JS and is byte-for-byte the sum
# of its parts. Each fragment is a raw slice of the one IIFE: 000-head.js opens
# it, 999-tail.js closes it, the middle fragments are the body in order. They
# are NOT independently valid JS on their own; only the assembled bundle is.
#
# WORKFLOW: edit a fragment, then run ./build-sluice.sh. Do NOT edit
# js/sluice.js directly — the next build overwrites it.
#
# COLLAPSE BACK to a single hand-edited file (undo the split): run this once so
# js/sluice.js is current, then `rm -rf js/sluice build-sluice.sh`. js/sluice.js
# is untouched by that removal and becomes your single source file again.
set -euo pipefail
cd "$(dirname "$0")"

out="js/sluice.js"
# Only NNN-*.js fragments (three leading digits) are part of the bundle, so any
# stray file dropped in js/sluice/ is ignored. The zero-padded prefixes sort
# numerically under the default glob.
frags=( js/sluice/[0-9][0-9][0-9]-*.js )
if [ ! -e "${frags[0]}" ]; then
  echo "build-sluice: no fragments found in js/sluice/" >&2
  exit 1
fi

cat "${frags[@]}" > "$out"
echo "build-sluice: wrote $out from ${#frags[@]} fragments ($(wc -l < "$out") lines)"
