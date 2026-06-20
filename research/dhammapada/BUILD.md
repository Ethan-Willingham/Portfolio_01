# Dhammapada corpus build (reproducible)

Generator: `research/dhammapada/build_dhp.py` (reads /tmp/dhp sources, emits
/tmp/dhammapada-data.js -> copy to `js/dhammapada-data.js`). Same engine as the
Tao build: fetch with shell, parse with Python, never retype by hand.

## Fetch the sources first (into /tmp/dhp):
```
mkdir -p /tmp/dhp/sc /tmp/dhp/ati /tmp/dhp/kav

# 1. SuttaCentral bilara: romanized Pali (CC0) + Sujato (CC0) + Suddhaso, by vagga.
#    NOTE: zsh does not word-split a plain $VAR; use ${=STEMS} or the loop runs once.
STEMS="dhp1-20 dhp21-32 dhp33-43 dhp44-59 dhp60-75 dhp76-89 dhp90-99 dhp100-115 \
dhp116-128 dhp129-145 dhp146-156 dhp157-166 dhp167-178 dhp179-196 dhp197-208 \
dhp209-220 dhp221-234 dhp235-255 dhp256-272 dhp273-289 dhp290-305 dhp306-319 \
dhp320-333 dhp334-359 dhp360-382 dhp383-423"
SCB="https://raw.githubusercontent.com/suttacentral/bilara-data/published"
for st in ${=STEMS}; do
  curl -sL --retry 4 --retry-delay 1 "$SCB/root/pli/ms/sutta/kn/dhp/${st}_root-pli-ms.json"                     -o /tmp/dhp/sc/${st}.pli.json
  curl -sL --retry 4 --retry-delay 1 "$SCB/translation/en/sujato/sutta/kn/dhp/${st}_translation-en-sujato.json"     -o /tmp/dhp/sc/${st}.sujato.json
  curl -sL --retry 4 --retry-delay 1 "$SCB/translation/en/suddhaso/sutta/kn/dhp/${st}_translation-en-suddhaso.json" -o /tmp/dhp/sc/${st}.suddhaso.json
done

# 2. Access to Insight: Thanissaro + Buddharakkhita, 26 chapter pages each (free distribution).
for n in $(seq -w 1 26); do
  curl -sL -A "Mozilla/5.0" "https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.${n}.than.html" -o /tmp/dhp/ati/than.${n}.html
  curl -sL -A "Mozilla/5.0" "https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.${n}.budd.html" -o /tmp/dhp/ati/budd.${n}.html
done

# 3. Kaviratna, 26 cantos (Theosophical Univ. Press, free online).
for n in $(seq 1 26); do
  curl -sL -A "Mozilla/5.0" "https://www.theosociety.org/pasadena/dhamma/dham${n}.htm" -o /tmp/dhp/kav/dham${n}.html
done

# 4. Public-domain verse translations from Project Gutenberg.
curl -sL "https://www.gutenberg.org/cache/epub/2017/pg2017.txt"   -o /tmp/dhp/muller.txt      # Muller 1881 (SBE X)
curl -sL "https://www.gutenberg.org/cache/epub/35185/pg35185.txt" -o /tmp/dhp/wagiswara.txt   # Wagiswara & Saunders 1912

python3 research/dhammapada/build_dhp.py && cp /tmp/dhammapada-data.js js/dhammapada-data.js
```

## Output (verified): 7 complete English translations + the Pali, all 423 verses,
26 vaggas, ~7.0 versions/verse, ~585 KB.
- pali (SuttaCentral, CC0), sujato 2021 (CC0), suddhaso 2016, thanissaro 1997,
  buddharakkhita 1985, kaviratna 1980, muller 1881, wagiswara 1912.
- All verbatim. Only normalization: curly quotes -> straight (matches the Tao
  build and the site typography). Translators' own dashes are kept faithful.

## Notes / gotchas the parsers handle
- Grouped couplets are printed many ways: ATI `<a id="verse-87-88">`, Muller
  `153, 154.`, Kaviratna `138,139,140.`, Wagiswara elided `271-2`. The combined
  text is assigned to every verse in the range.
- SuttaCentral `dhpN:0.x` segments are headers (collection / vagga / vatthu names)
  and are skipped; `<j>` is an intra-segment line break and becomes a newline.
- Thanissaro groups some verses with empty anchors; a verse whose own segment is
  empty falls back to the whole block (never goes missing).
- Wagiswara is at 420/423 (3 oddly-formatted verses show the other six).

## The long tail (not in the build, deliberately)
The famous in-copyright moderns (Easwaran, Mascaro, Fronsdal, Wallis, Narada,
Mya Tin, Maitreya, Carter & Palihawadana, Roebuck, Norman) are printed in books,
not posted as clean machine-readable text, and the loose blog quotations of them
do not meet the "locate every quote" bar. They are named in the breakdowns where
their choice matters rather than quoted from an unverified source. If a verbatim
source becomes available, add it to a hand-kept `extras.json`
(`{ "<verse>": { "<key>": "text" } }`) plus `extras-meta.json`
(`{ "<key>": {name, year, src} }`); the build merges both if present.

## Commentary
Hand-written in `js/dhammapada-notes.js` (keystones only), shape
`n: {title, gist, splits:[{pali, gloss, note}], read}`. Verses without an entry
render the stack alone. Adding a breakdown never touches the corpus.
Full research in `research/dhammapada/dossier.md`.
