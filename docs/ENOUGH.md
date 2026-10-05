# How Much Is Enough?

`enough.html` is an interactive evidence page in In Progress. It displays 17 researched questions about movement, muscle, sleep, food, harmful exposures, income, savings, work and meditation. The title and first walking card introduce the page before the optional personal panel.

## Data and interpretation

All numerical estimates, references, population limits, extraction methods and review identities live in `js/enough-data.js`. Primary tables and author deposits supply the empirical values. The protein response is reconstructed from a published segmented model; savings uses the disclosed annuity formula. No curve was digitized from an image.

Published exposure groups stay categorical. Equal spacing and dotted connectors do not imply equal dose intervals or predict a response within a group. Numeric source grids use straight interpolation for display. Full grids remain in the data file; long evidence tables show an identified sample.

A mark can identify a source benchmark, a model breakpoint, the lowest observed group, an example model input or the last published dose. Structured marker verification lets `tools/test-enough-data.mjs` reproduce every selected coordinate. A benchmark is not an individual prescription.

None of these extractions establishes a defensible 90 percent benefit threshold relative to zero. A chart endpoint is not a maximum. Protein's shaded strip describes uncertainty in the breakpoint, rather than response uncertainty. Meditation has no numerical daily response curve, so its empty plot means unknown. Savings has an assumption envelope, rather than a confidence interval.

The optional personal panel orders changes toward the walking, activity and protein marks by their size as a share of each mark. Sleep and work have no personal target. Different outcomes cannot support a common ranking of health benefits. Values are not stored or sent anywhere.

## Interface and checks

Each chart uses a native range input with a visible handle, keyboard support, a text readout and an accessible name. Opening evidence reveals available uncertainty and source tables. The SVG is hidden from assistive technology because the controls, readout and tables provide its text equivalent.

Run:

```sh
node tools/test-enough-data.mjs
node --check js/enough.js
node --check js/enough-data.js
NODE_PATH=/Users/ethan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tools/test-enough-browser.cjs
```

The browser harness owns its ephemeral server and Chrome for Testing process, and closes both in `finally`. It checks 375, 768 and 1440px, horizontal mouse and touch input, every slider's keyboard readout, native disclosure keyboard behavior, chart-label bounds, 44px evidence targets, optional input subsets, invalid weight, reset, cross-unit ranking, accessibility names, resource loading and the design chooser. Screenshots reload the default state before capture.

These checks establish Chromium behavior and browser accessibility-tree semantics. They do not establish actual VoiceOver or TalkBack speech, physical-device browser behavior, or human ten-second comprehension. The polish panel uses AI reader-role reviews, with those limits recorded in the research log.

## Maintenance

Edit the canonical data file and preserve its source locators and uncertainty distinctions. Bump the `?v=` values in both HTML pages when changing page scripts or styles. Rebuild the search index after changing questions or facts. The search builder reads the local data and indexes each card's stable anchor. Regenerate the sitemap after committing a new page.

`enough-lab.html` is a noindex chooser with four layouts, three chart treatments and five titles. The provisional choices are two columns with one column on phones, thin lines with source dots, and How Much Is Enough?

Thumbnail: Jean Simeon Chardin, *Fruit, Jug, and a Glass*, c. 1726/1728, National Gallery of Art, Chester Dale Collection, 1943.7.4. The museum identifies it as public domain: https://www.nga.gov/artworks/12202-fruit-jug-and-glass.
