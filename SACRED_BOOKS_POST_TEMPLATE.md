# Sacred Books post template

This note records the structure selected for `quran.html` and confirmed by `gita.html` so the next Sacred Books post can begin with the decisions already made.

## The four-section structure

1. **Put the book in an order a new reader can follow.** Explain the movement of the whole text in plain English. Restore chronology when the printed order hides it, but keep the explanation in continuous prose. Do not repeat that movement in a separate pair of summary cards.
2. **Separate what is known from what is reconstructed.** Give the history of composition, collection, manuscripts, and later tradition. Use the three-part text check for early witnesses, wording stability, and meaning in English. These are different questions and should not be collapsed into one confidence score.
3. **Name the ideas that shape lived practice.** The count is a finding, not a format. Build the list from what a longtime practitioner would insist on, keep every idea that passes that bar, and stop at the first idea they would merely nod along to. Expect roughly six to sixteen depending on the book, and let the section heading state the real number; matching counts across books is a warning sign, not a goal. State each idea plainly, explain its role, add an `In practice` paragraph, and give two or three exact passages that let the reader test the claim.
4. **Do not skip the passages that resist a clean summary.** State the difficult wording, the historical context, the strongest restrictive reading, and the wider reading found in the tradition. Keep the source accordion at the end of this section.

The finished Quran post has four sections. It does not have a fifth interactive reader section.

## One bespoke element per book

Each post carries exactly one structural element only its book could have, so the series reads as readings rather than as one template refilled. The Gita's ideas ride a single conversation from dropped bow to lifted bow; the New Testament's will be four tellings of one life; the Guru Granth Sahib's a book enthroned as a living teacher; the Dhammapada's the paired-verse device. One per book. Zero dissolves the books into the format; two dissolves the format.

## Tests for the ideas section

Use the veteran test. A longtime member of the living practice community should recognize the chosen ideas as the things that actually organize prayer, time, money, appetite, repentance, family, and moral attention. This test certifies emphasis. It does not settle every theological dispute.

Use the convergence test. Note the core practices and claims recognized across major internal divisions, then name the disputes without pretending they disappear.

Use plain titles. The title should tell the reader the idea, not behave like an isolated aphorism.

## Quote discipline

- Use a public-domain translation when full quotation is needed. The Quran post uses Marmaduke Pickthall's 1930 translation, which is in the United States public domain in 2026.
- Verify quoted wording against a stable text source or API.
- Name the translation and the verse beside every excerpt.
- Ellipses may shorten a passage. They may not join separate words into a sentence the translator did not write.
- Explain when a plain-English claim is one argued interpretation rather than the only possible translation.

## History and transmission discipline

Keep three questions separate:

1. How early are the surviving witnesses?
2. How stable is the wording across those witnesses?
3. How much interpretation enters when the text becomes English?

Say what a piece of evidence dates. For example, radiocarbon dating applies to parchment, not ink. Separate an early common written source from later reports about exactly how that source was produced.

## Hard-parts discipline

For the Quran, the final set covers war, family authority, slavery and concubinage, corporal punishment, apostasy law, and claims about other faiths. Do not solve a tension by quoting only the easier verse. Put literal wording, limiting context, later legal use, and current disagreement in the same account.

Title the hard section as a plain noun list naming its cards, the Torah page's pattern (Slavery, patriarchy, violence, contradiction), not as an abstraction.

## Page mechanics

- Preserve the site's 20-pixel mobile gutter through `var(--gutter)`.
- Use the shared color tokens and established component kit.
- Keep sources collapsed and count unique external source URLs for the header.
- Recalculate reading time after structural edits. The selected Quran post has 27 sources and a 25-minute estimate.
- Keep comparison pages `noindex` and visibly labeled until the owner promotes one to the canonical post. At promotion, remove the label and `noindex`, move the selected page to the canonical filename, update its public metadata URL and endcap navigation, and remove the duplicate comparison page.
- Run the voice linter, HTML checks, mobile overflow check, local-link check, and console check before publishing.
- Do not add em dashes or emoji.

## Quran decisions already made

- Keep the Meccan to Medinan movement in the main prose.
- Remove the paired Mecca and Medina timeline cards.
- Remove the separate interactive reader, its CSS, its data scripts, and sources used only by that reader.
- Keep the twelve practice-tested ideas and the six difficult-passage cards.
- Keep the research sources at the end of section four.

The implementation reference is `quran.html`.

## Bhagavad Gita decisions already made

- Tell the movement as one conversation, from Arjuna dropping the bow to Arjuna choosing to raise it. The eighteen chapters need explanation, but not eighteen separate chapter cards.
- Keep the nested frame visible: Sanjaya reports Krishna and Arjuna to the blind king Dhritarashtra inside the larger `Mahabharata`.
- Separate the stable 700-verse Sanskrit core from the much later surviving witnesses and from the deep disagreement over interpretation.
- Name the classical disagreement directly. Shankara, Ramanuja, and Madhva are not three decorative sources for one settled meaning. Their conflict over knowledge, devotion, surrender, God, and Self is part of what the page must teach.
- Use Annie Besant's 1922 fourth edition for exact quotations. Wikisource provides numbered discourse pages and identifies the edition as public domain in the United States.
- Apply the veteran test across more than one kind of Hindu practice. The ideas should be recognizable in meditation, study, devotion, household duty, temple offering, and organized service.
- Keep six unresolved pressures together: literal war and allegorical readings, duty and `varna`, the mixed welcome of verse 9.32, detachment and moral responsibility, action and renunciation, and the recognition and subordination of other gods.
- Remove the 700-verse translation explorer and its data scripts from the page. The canonical Gita post has the same four-section reading-guide structure as the Quran post and no fifth reader section.

The second implementation reference is `gita.html`.

## New Testament decisions already made

- Begin with the shelf readers actually meet, then disclose the hidden composition order: Paul's undisputed letters are earlier than the four Gospels.
- Use four short Gospel portraits as the book's one bespoke element. Mark, Matthew, Luke, and John are four literary and theological tellings, not four bins of facts to merge into a single transcript.
- Follow the collection beyond Jesus: Acts moves from Jerusalem toward Rome, the letters expose the arguments inside early churches, and Revelation ends with judgment and renewed creation.
- The veteran test stops at fifteen ideas. The sixteenth candidate, scripture rereading Israel's story around Jesus, is real and important, but it was the first item an experienced Christian would merely nod along to rather than insist belonged in the load-bearing list.
- Test convergence across Catholic, Orthodox, and major Protestant practice. Keep baptism, Eucharist, prayer, Spirit, church, mission, care for the poor, embodied holiness, and resurrection beside the doctrinal center of incarnation, cross, grace, and faith.
- Use the 1901 American Standard Version for exact quotations. Wikisource supplies one stable numbered page per biblical book, and the edition is in the United States public domain.
- Give manuscript abundance its qualifications. More than 5,700 catalogued Greek witnesses does not mean 5,700 complete early New Testaments. Most are partial and medieval. Keep early fragments, recoverable Greek wording, and disputed English meaning as three separate judgments.
- Do not call Mark&rsquo;s earliest ending a Gospel with no resurrection. The messenger announces that Jesus has risen; what Mark 16.8 lacks is a narrated risen appearance.
- Keep seven unresolved pressures together: hell, slavery, women and authority, sexuality, anti-Judaism, the delayed return, and contradictions among the accounts.
- Remove the sixteen-passage, nine-translation reader and its three data scripts from the canonical page markup. The scripts remain unreferenced files pending a separate cleanup decision.

The third implementation reference is `new-testament.html`.

## Format decisions, 2026-07-19 second round

- The fixed twelve is retired, on the owner's call. It fit the Torah and the Gita honestly and cost the Quran page a patience card; the finding rule in section 3 replaces it.
- `gita.html` moved to thirteen ideas: a descent card (4.7, 4.8, 4.11 in Besant's wording) inserted before devotion, and the chapter 11 vision folded into the manifestations card (11.12).
- `gita.html`'s hard section retitled to the noun-list pattern: War, caste, detachment, renunciation, other gods.
- Open on `quran.html`, owner's call pending: the missing sabr card (with hardship goeth ease, 94:5-6; Allah tasketh not a soul beyond its scope, 2:286) and the noun-list hard title.
- Open: `quran-claude.html` is still live without `noindex` after promotion; this file's own promotion rule says the duplicate comes down. Owner disposition pending.
- Open: five orphaned reader scripts remain on main (`js/quran-data.js`, `js/quran-notes.js`, `js/quran.js`, `js/gita-data.js`, `js/gita.js`), referenced by nothing.
