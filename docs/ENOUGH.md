# How Much Is Enough?

`enough.html` is an explorable post in In Progress. It has a whole public-domain painting, an opening topic selector and 12 cards: walking, exercise, protein, sets, sleep, fruit and vegetables, fiber, income, savings, work, alcohol and smoking. The owner removed the personal form, separate slider controls and Mind section. Shared fonts, links, navigation and footer follow `what-you-get-used-to.html`. The chooser is `enough-lab.html`.

The current scientific decisions and primary sources are documented in [ENOUGH_EVIDENCE_AUDIT.md](ENOUGH_EVIDENCE_AUDIT.md). That report is downloadable from the post. Research artifacts and historical reviews live in the main checkout’s ignored `research/enough/v2/` directory. Historical AI reader reviews do not certify the current edits.

## Current presentation

Protein uses the same graph component as the other topics: a dashed curve, published pointwise confidence shading, labeled axes and a movable marker. Its 111 approximate readings come from Tagawa 2021 Figure 2(h), the fully adjusted resistance-training panel. Intake is total g/lb/day; outcome is absolute modeled lean-mass change in lb across trial arms. It is not the causal effect of adding protein, an individual prediction or a hypertrophy percentage. The source adjusts for age, sex, duration and weight change, including a potential mediator. Other source panels differ, and the narrow pointwise band does not include all model uncertainty. Native source image coordinates, calibration, checksum and original kg values are stored with the data. No new spline is fitted, hard plateau imposed or tail extrapolated.

The ISSN recommendation of 1.4 to 2.0 g/kg/day remains separate in the headline, about 0.65 to 0.9 g/lb/day. It does not define the curve or its shading. Nunes 2022’s 62 resistance-exercise trials support a small added-protein lean-mass effect, but cannot establish a daily cutoff. The old Morton arm-level segmented model is retained only in `supportingEvidence.protein2018`.

Walking has one card and one matching opening preview, driven by the same Paluch 2022 age curves. Under 60 defaults to 8,000 steps, compared with 5,000; 60+ defaults to 6,000, compared with 3,000. Age and selected amount stay synchronized, and each age remembers its own marker. The full published extent runs to 16,000 with uncertainty. The former `#steps-longer` hash reaches this card. Ding 2025 remains supporting evidence, not a duplicate visible section.

Exercise retains Garcia’s author-deposited curve, now with confidence shading. Its headline gives HHS guidance of 150 to 300 moderate minutes/week. The sets model remains dashed with a 95% credible band; its tail above 25 is visibly marked as sparse. Sleep retains the named older self-report curve with its confidence band; the arbitrary six-hour highlight is removed and the headline uses adult guidance.

Fruit, income, alcohol and smoking show source groups as dots with 95% interval whiskers, without connecting dose-response lines. Income uses actual 100-point feeling scores and each group’s own interval; the axis is explicitly zoomed to 55 to 70. Fiber uses Yao 2023’s updated per-10-gram linear mortality summary and slope limits. The old Reynolds model remains in `supportingEvidence.fiber2019`. Work is a dashed historical model. Savings is dashed arithmetic; its shaded alternatives are assumptions, not confidence limits. The curve is a smooth approximation, while its readout rounds up to whole year-end contributions.

No live chart displays an exact 90% enough marker or treats a shown endpoint as 100% of possible benefit. Historical bounded calculations remain reproducible in the data and math module. They are not medical, financial or work recommendations. Card starting markers come from explicit `view.default` values rather than a calculated 90% crossing.

Each evidence drawer has two brief paragraphs, primary links and a source-data download. Full study counts, units, subgroup estimates, extraction methods and exclusions remain in the data and audit. Study populations and overlapping reviews must not be added into a grand evidence total.

## Interaction and checks

Clicking or dragging selects an amount directly. Arrow keys change it; Home and End select endpoints. Touch taps and horizontal drags select doses while vertical gestures scroll. Pointer exit clears pointer-origin decoration only, preserving the value, focus and captured dragging; keyboard focus remains visible. There is no storage or submission.

Run `node tools/test-enough-data.mjs` and, with Playwright on NODE_PATH, `node tools/test-enough-browser.cjs`. The harness owns an ephemeral server and `/Users/ethan/.local/bin/agent-chrome-for-testing`, closing both in `finally`. It checks 375x812, 768x900 and 1440x900, including source values, protein figure conversion, full intervals, chart controls, touch scrolling, pointer-exit behavior, shared reference styles, short disclosures, no removed panels and no missing resources. `ENOUGH_BASE_URL` runs the same checks against the deployed site. Automation does not certify real screen readers or physical devices.

Painting alternatives are Bruegel’s The Harvesters, Homer’s Breezing Up and Chardin’s Fruit, Jug, and a Glass. All are shown whole. Defaults are Bruegel, walking first and life-area colors.
