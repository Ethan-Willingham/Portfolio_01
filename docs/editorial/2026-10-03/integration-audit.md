# Independent integration audit

A separate GPT-6.1 Sol agent at extra-high reasoning first audited sixteen stable
posts after their individual editorial reviews, then checked the final scope,
identity and assets of all eighteen. It also separately checked static reading
for the completed Sure Things and Predatory Advertising rewrites. Individual
source reviews and browser checks are recorded in VERIFICATION.md.

The audit compared frozen baseline and revised HTML, used strict tag-stack
parsing and actual browser DOM at 1024 by 768, checked scripting-disabled reading
after animations settled, expanded disclosures and inspected selected images.
It did not edit repository files. Its owned servers and approved testing browsers
were closed after each run.

The sixteen posts had no unclosed or misnested tags, duplicate static IDs,
broken same-page fragments, lost control IDs, forbidden dashes or emoji. Titles,
social titles, archive URLs, current archive cards and shared editorial stylesheet
inclusion agreed. Original image-path sets survived; the first-year reference
retained all 28 unique image paths and 29 instances after its documented duplicate
removal. First reading images load eagerly. The gallery's first image uses the
browser's eager default. Documented credit corrections and the two original JPEG
compression examples were respected.

The audit examined generated captions, static fallbacks, accessible descriptions
and source/credit sections. It found no additional consequential contradiction
within that comparison. This is an integration check, not an independent
validation of every underlying study, catalogue credit or image license.

Two consequential findings were repaired by root and independently retested:
default reveal styles hid substantive text indefinitely in No Blood Test and
Best Photographs when JavaScript was disabled and ordinary motion was enabled.
Hiding now requires the JavaScript marker. Both complete reading paths and their
expanded disclosures remain visible without scripting. No Blood Test's three
SVGs and 40 shapes remain visible with zero stroke offset; the gallery's five
SVGs and 59 shapes remain visible. Ordinary-motion scripted reading also passes.
The Number's opening fade settles correctly and required no change.

The audit also identified an inaccurate ingot-scale alt text. Root inspected the
actual photograph and corrected it to describe the exposed silicon ingot between
supports and the smaller samples in the adjacent glass case. The photograph,
caption and credit were unchanged.

Weather's generated tour and the recommendation catalogue still require
JavaScript. Their interactive behavior is checked separately. Final independent
no-JavaScript evidence is in `/tmp/archive-integration-final-nojs-svg.json`.

Root's subsequent focused browser run at 1365 by 900 and 375 by 812 passed the
repaired pages and the first-year guide with zero errors or missing resources.
Its 46 first-year chart captures passed text-bound checks, and the phone chart
can be scrolled with the keyboard. Evidence is in
`/tmp/portfolio-editorial-reveal-keyboard/verification.json`.

The final scope check confirmed exactly eighteen selected files, matching page,
archive-card and social titles, synchronized descriptions, unchanged archive URLs
and retained unique image paths. Sure Things and Predatory Advertising also pass
ordinary-motion no-JavaScript reading before and after expanding disclosures;
all eighteen and six images load respectively. Four differing metadata
descriptions were synchronized, and the intentional retirement share-image
replacement is documented in its report. Final scope evidence is in
`/tmp/portfolio-editorial-final-scope-audit.md`.

The final combined publication run and the corrected picker retest close all
thirty-six desktop/phone page views. All forty-six first-year SVG text-bound
checks pass, and the phone keyboard probe scrolls its wide chart by 28px. The
final aggregation retains the initial failure and successful repair evidence at
`/tmp/portfolio-editorial-publication/final-verification.json`.
