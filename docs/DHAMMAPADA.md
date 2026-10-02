# Dhammapada reading guide

The post is `dhammapada.html`, with page-local styles in `dhammapada.css`.
`js/dhammapada-notes.js` contains newly written explanations of all 423 verses.
They are paraphrases, not translations. `js/dhammapada.js` renders the notes,
the optional Pali text, and the translation comparisons.

## Source and interpretation

The explanations use [Sujato's translation](https://suttacentral.net/dhp/en/sujato)
as their base, compared with the other editions in the corpus. Sujato's Bilara
translation and the Pali root text are
[dedicated to the public domain](https://github.com/suttacentral/bilara-data/blob/published/LICENSE.md).
Context and difficult passages were checked against
[Bodhi's introduction](https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.intro.budd.html)
and [Thanissaro's introduction, historical notes, and endnotes](https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.intro.than.html).

Distinguish what a verse says, what the later commentary explains, and what
history can establish. The compilation date is uncertain. The Pali Text Society
[lists the commentary as anonymous](https://palitextsociety.org/product/dhammapada-commentary-vol-iii/).
The introduction keeps the text's assumptions about karma, rebirth, monastic
practice, and liberation visible. It does not present those assumptions as
empirical findings or reduce the text to present-life advice.

Verses 277-278 concern conditioned things; 279 concerns all phenomena. Verses
294-295 use metaphorical killing, with the interpretation explicitly attributed
to the commentary. Verse 415 concerns ending sensual desire and further rebirth.

## Corpus corrections made in October 2026

The inherited corpus had several source and alignment errors:

- Gutenberg 35185 is [F. L. Woodward's 1921 edition](https://www.gutenberg.org/ebooks/35185),
  not Wagiswara and Saunders. The author key is now `woodward`.
- Woodward's electronic source misnumbers several passages. Canonical 388 and
  389 are printed as 387 and 388; canonical 418 is printed as a second 415.
  The passage labeled 268 covers 268-269. After alignment the corpus covers
  422 verses, with 387 absent. Its missing text is not supplied from another edition.
- The old Thanissaro parser could cross a heading boundary when an empty
  paragraph intervened. In particular, it put the 94-96 passage under 92-93.
  Parsing bounded source intervals corrected text at 86, 87, 92, 93, 94, 105,
  189, 190, 191, 247, and 346.
- Pali chapter colophons were included under the final verse of each chapter.
  They are now removed, along with Sujato's collection-ending line under 423.

Entries translated as combined passages have a `range: [first, last]` field.
The reader shows this range rather than presenting the whole passage as a
translation of just the current verse. Identical adjacent combined passages
in the other inherited editions are marked within their chapter boundaries.

## Reproducing and checking the repairs

Run `python3 tools/repair-dhammapada.py` from the repository root. It fetches the
26 Access to Insight chapter pages and Gutenberg's Woodward text, validates
coverage, and updates the existing corpus. To reuse downloaded sources, pass
`--source-dir PATH`, containing `than.01.html` through `than.26.html` and
`woodward.txt`. The operation is idempotent. If using the older ignored research
builder to regenerate the backbone, run this repair afterward.

Keep the translators' wording. Straight-quote and whitespace normalization is
retained. Sentence dashes become commas to follow the owner's punctuation rule;
numeric ranges use "to". The source notes disclose these editorial adjustments.

Check JavaScript syntax for all three page scripts. In a browser, check all
423 explanations, translation counts and source text, grouped ranges, verse
links, the complete index, keyboard navigation, source details, and missing-data
and JavaScript-disabled fallbacks. At 375px, body paragraphs must start 20px
from the viewport edge and the verse buttons must be at least 44px. Bump the
page's CSS and script query versions when editing them, and rebuild the post's
search-index entry after changing its prose.
