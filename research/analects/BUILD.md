# Analects corpus build (reproducible)

Generator: `research/analects/build_analects.py`. Reads the parsed sources in
`research/analects/raw/` and emits `js/analects-data.js`. Same engine as the Tao
and Dhammapada builds: fetch with shell, parse with Python, never retype by hand.

## The data model

The Analects is 20 books of short chapters, cited Book.Chapter (e.g. `15.24`).
The Chinese Text Project's chapter division is the canonical numbering (503
chapters). `js/analects-data.js` is `window.ANA = {translators, order, books,
chapters}`; `chapters` is a flat list of `{b, c, zh, v:[{k,t}]}`. The breakdowns
in `js/analects-notes.js` are keyed by the `"B.C"` ref.

## Backbone (complete, every chapter)

```
# Chinese + Legge (1893), aligned, from the Chinese Text Project web pages.
# (the gettext API rate-limits bursts; the per-book HTML pages do not)
UA="Mozilla/5.0 ... Chrome/120 Safari/537.36"
SLUGS="xue-er wei-zheng ba-yi li-ren gong-ye-chang yong-ye shu-er tai-bo zi-han \
xiang-dang xian-jin yan-yuan zi-lu xian-wen wei-ling-gong ji-shi yang-huo wei-zi \
zi-zhang yao-yue"
i=1; for s in ${=SLUGS}; do   # NOTE: zsh needs ${=VAR} to word-split, else 1 pass
  curl -s --retry 3 --retry-delay 3 -A "$UA" "https://ctext.org/analects/$s" -o ctext_web/$i.html
  i=$((i+1)); sleep 2.5
done
```
Each ctext page pairs every passage in a `<td class="ctext">` (Chinese) and a
`<td class="etext">` (Legge). The parser walks the rows in order, pairs each
Chinese td with the following English td (which drops the trailing footer rows),
and strips footnote-anchor digits. Output: `raw/zh.json`, `raw/legge.json`,
503 passages each, keys identical. Keystones verified by content (15.24 is the
golden rule, not 15.23 in this numbering; 2.4, 7.1, 12.1, 13.3 all land right).

A. Charles Muller's translation (free at acmuller.net) is parsed from the saved
page `raw/muller_raw.html`. Muller carries his own Chinese per passage, so it is
aligned to the ctext numbering by matching the Han-character stream **per book**
(difflib over the concatenated Chinese of each book, projecting Muller's English
passage boundaries onto ctext's). This handles the ~11 books where Muller and
ctext split chapters differently. Each mapped passage is kept only if the Chinese
span it was assigned matches ctext's Chinese (ratio >= 0.6), so Muller appears
where it is certainly the right passage (465 of 503) and is omitted, not wrong,
elsewhere. Output: `raw/muller.json`.

## Keystones only (the chapters that carry a breakdown)

Reproduced verbatim for comparison and study, every translator named, every
chapter located. Curated by hand in `build_analects.py` (the `WALEY`, `ENO`,
`SLING`, `AMES` dicts) plus Lau pulled from `raw/lau_full.json`:

- **D. C. Lau** (1979): parsed from a clean copy of the Penguin text by its `B:C`
  markers into `raw/lau_full.json` (497 passages), OCR drop-caps fixed
  (`T he` -> `The`); the 16 keystones are taken from there.
- **Arthur Waley** (1938): read from the Internet Archive scan, cross-checked
  between two OCR copies, footnote markers removed, curated for the keystones.
- **Robert Eno** (2015), the free online teaching translation; keystones curated
  from his PDF, the trailing per-passage footnote dropped.
- **Edward Slingerland** (2003) and **Ames & Rosemont** (1998): the keystones
  where a breakdown turns on their wording (Slingerland 2.15, 15.24; Ames 12.1,
  15.24), verified against the published wording.

Only normalization to any quotation: curly quotation marks -> straight, and
spaces left by removing footnote anchors collapsed. Translators' own dashes and
parentheses are kept faithful (Eno's en-dashes, Waley's `(thread)`, etc.).

## Named but not quoted (no clean machine-readable copy verified)

Ezra Pound (1951), Simon Leys (1997), Burton Watson (2007), Annping Chin (2014):
their signature word-choices are discussed in the breakdowns as documented facts,
not quoted at length. Add them to the curated dicts the same way once a verbatim
source is in hand.

## Output (verified)

`window.ANA`: 503 chapters, 20 books, 7 translators (Legge 503, Muller 465, Lau
16, Waley 9, Eno 7, Slingerland 2, Ames 2), ~383 KB. Commentary is hand-written
in `js/analects-notes.js` (16 keystones). Full research in `dossier.md`.

Rebuild: `python3 research/analects/build_analects.py`.
