# How Much Is Enough?

`enough.html` is an explorable post in In Progress. It has a full painting, a selectable opening curve and 12 cards grouped by life area. The owner removed the personal form and the Mind section. The chooser is `enough-lab.html`. Fonts, the dark-green background, Home navigation, link treatment and footer follow the site and `what-you-get-used-to.html`.

## Calculation

For benefit curves, share is improvement from the lowest displayed dose divided by the largest improvement anywhere in the declared range. It is 0% at the origin and 100% at the best point. Enough is the first 90% crossing. This is a descriptive comparison within selected endpoints, not an absolute maximum, causal effect or personal forecast.

`js/enough-data.js` stores primary coordinates, per-point source locations, uncertainty, model parameters, ranges and computed crossings. `js/enough-math.js` supplies the calculation to the UI and validator. Reconstructable models use their analytical expressions. Other lines interpolate source coordinates. Categories select published groups and never invent an exact threshold between them. Full tables, extraction details and caveats remain downloadable; each on-page evidence drawer has two short paragraphs and a data link.

The opening shows one curve at a time, selectable with Walking, Exercise and Protein buttons. Each uses physical amounts and source outcomes. Walking opens at 7,000 steps with 47% lower mortality risk compared with 2,000 steps; its 12,000-step estimate is 55%. The opening y-axis names the baseline. Exercise opens at 150 moderate minutes/week; protein at 0.70 g/lb/day. Each selection keeps its own marker. The opening omits the enough rule to keep the first explanation simple.

All eight formerly normalized benefit charts now plot source outcome units. Steps, exercise, fruit and vegetables, and fiber use relative mortality-risk reductions in percent, with the baseline stated in each readout. Protein uses extra fat-free mass gain in lb relative to 0.41 g/lb/day, explicitly labeled a model. This outcome includes muscle and water. Income uses feeling-score point increases above the lowest income group. Savings uses years to the model target and a descending, unfilled line. Work uses added source output-index units above 24 hours. No benefit endpoint is drawn as 100% of possible benefit.

The bounded enough calculation remains reproducible. On each individual benefit chart, the dashed line is placed at the actual outcome at the first 90% crossing, with a separate “Enough: 90% of shown improvement” key. For walking, that is 49.5% lower risk at 10,500 steps, not 90% lower mortality. Categories can exceed the exact 90% threshold when their first qualifying group crosses it. Ordinary y-ticks have room between them. Sleep, sets and harmful-exposure charts keep their original outcome units without an enough rule.

Separately normalized lower and upper pointwise curves are sensitivity checks, not confidence intervals for thresholds. Protein has a published breakpoint interval but no complete response band. Work has no reconstructable covariance, so no band is invented. Savings alternatives are assumptions, not statistical limits. The sets card is an exception to gain normalization, described below.

## Cards

| Card | Range shown | Enough or other shape |
|---|---|---|
| Steps | 2,000 to 12,000/day | 10,500; actual risk reductions are 47% at 7,000 and 55% at 12,000 |
| Exercise | 0 to 600 moderate minutes/week | 342.64 minutes; actual risk reductions are 31% at 150 and 38.4% at 600 |
| Protein | 0.41 to 1.09 g/lb/day | 0.7022 g/lb, about 105 g at 150 lb |
| Weekly sets per muscle | 0 to 45 fractional sets | Uncertain ceiling; original model contrasts and 95% credible band; no enough marker |
| Sleep | 3 to 11 hours | Low point 7; highlighted 6 to 7.25 stays within 1% of the minimum |
| Fruit and vegetables | Groups eating about 2.1 to 7.3 servings | First qualifying group 5.3; later 7.3 group falls below 90% |
| Fiber | Chosen 7 to 35 g window, 2019 log-linear model | 31.86 g; still improves at 35 |
| Income | Source bands $10k to $500k+ | First qualifying band $200k to $300k; no settled ceiling |
| Savings | Chosen 5 to 95% window | 73.11% under stated steady assumptions |
| Work | Historical model, 24 to 72.5 hours | 53.48 captures 90%; peak 62.91 |
| Alcohol | Groups, top 32.5+ US drinks/week | No proven longevity benefit; signed extra risk |
| Smoking | Never, 1, 5, 20 cigarettes/day | Enough zero; men's extra coronary risk |

## Sets correction, October 4, 2026

The former 0 to 100 gain score made an uncertain dose-response model look like a precise practical payoff, with a misleading 38-set marker. The page now says “No settled optimum.” It shows the original Pelland 2026 contrasts in their reported percentage units with a 95% credible band. It does not normalize them into a share of possible growth or calculate an enough point. The initial marker is 10 sets.

The exact author-deposited table has High=10, Low=0 at 4.18% (2.49 to 5.81), High=30, Low=0 at 8.41% (4.96 to 11.77), and High=30, Low=10 at 4.06% (2.42 to 5.64). These compare modeled post/pre muscle-size ratios. They do not establish that a person moving from 10 to 30 sets doubles their hypertrophy. Direct work counts as one set and indirect work as half. Section 4.4 explicitly warns about few studies above about 25 sets and uncertainty compatible with a plateau or inverted U.

A fresh source audit added Steele et al.'s April 23, 2026 SportRxiv preprint. Its 12-week trial compared 9 and 36 fractional weekly sets in trained adults. The body reports a standardized difference of 0.023 with a 90% interval of -0.045 to 0.091 and equivalence p=0.032 within a plus or minus 0.1 margin. The abstract has -0.044 as its lower limit; the body value is retained. There were 120 randomized participants, 112 baseline tests and 87 post-tests. Circumference and skinfold estimates, dropouts and preregistration amendments limit interpretation. It is counterevidence, not proof of a universal ceiling or a peer-reviewed replacement for the meta-analysis.

`followupAudit` stores these source checks and labels the fresh primary-agent audit separately from the earlier researcher/adversary review. The retired normalization is preserved as historical provenance only. Meditation evidence is retained in `archivedEvidence` after the owner removed its card.

## Other primary-data decisions

Ding 2025 Table 2 uses all 11 predictions. The tail improves again, so shortening the range to force a 7,000-step threshold would change the question. Garcia 2023's selected window contains 94% of the source's person-years; the full author curve extends beyond it and gives a different crossing.

Morton 2018's plateau is imposed by the segmented model, whose superiority over a straight line is uncertain. Fruit and veg preserves the NHS women's groups and their later dip. Fiber reconstructs Reynolds 2019's printed log-linear slope rather than digitizing a separate curved fit.

Income preserves author-deposited group means and standard errors, including the top group's dip. The open $500k+ band uses an assigned $625k coordinate, not an observed cap. The author's smooth log-income trend is a different summary, and the ceiling remains disputed.

Pencavel's IZA DP8129 Equation 4 and Table 4(ii) give additional output as 126.089(h-24) minus 4.533 times max(0,h-49) squared. Unknown group intercepts cancel. This historical factory result is not a modern recommended workweek. WHO/ILO stroke evidence measures a separate outcome.

Zhao 2023 preserves light-drinking estimates below zero extra risk and intervals including no difference. Alcohol uses published intake groups with an open top category, not invented midpoints. One US drink contains 14 g. Hackshaw 2018 men's extra coronary risk is 48% for one cigarette and 104% for twenty, a ratio of 46.15%.

## Interaction and checks

Every numeric chart has named x and y axes and a focusable graphical control. Clicking or dragging changes the marker and readout, without a separate slider bar. Arrow keys select adjacent groups or small dose increments; Home and End select endpoints. Touch taps and horizontal drags select doses, while vertical gestures scroll the page. Mouse and pen exit suppress pointer-origin focus decoration while preserving focus, the selected value and captured dragging. A keyboard event restores visible focus, and keyboard-origin focus remains visible when the pointer leaves. Touch behavior is unchanged. There is no personal form, storage or network submission.

Run `node tools/test-enough-data.mjs` and, with Playwright on NODE_PATH, `node tools/test-enough-browser.cjs`. The harness owns an ephemeral server and `/Users/ethan/.local/bin/agent-chrome-for-testing`, closing both in `finally`. It checks 375x812, 768x900 and 1440x900: natural painting aspect ratio, all chart controls and axis bounds, source outcome values and baselines, y-tick separation, actual outcome positions of enough rules, independent opening selections, pointer-exit decoration, keyboard and touch interaction, short disclosures, removed sections, reference-essay styles, accessible names and values, no horizontal overflow and no missing resources. `ENOUGH_BASE_URL` can run the same checks against the deployed site. Automation does not certify physical devices or real screen readers.

Local research and historical AI reader reviews live in `/Users/ethan/Portfolio_01/research/enough/v2/`. AI reader personas are simulations, not human testing. The latest owner follow-up uses the behavioral harness, source checks and screenshot inspection; historical reader reviews do not certify these new edits.

Painting options remain Bruegel's The Harvesters (Met), Homer's Breezing Up (NGA) and Chardin's Fruit, Jug, and a Glass (NGA), all public domain. Every painting is shown whole. Defaults are Bruegel, walking first and area colors. The old shared-dose layouts and percentage rings were removed from the chooser.
