# How Much Is Enough?

`enough.html` is an explorable post in In Progress. Version2 rebuilds its presentation around bounded share of improvement, a painting-led opening, a shared range control, optional personal bars and13 cards grouped by life area. The chooser is `enough-lab.html`. All three fonts and the dark-green background come from the site kit.

## Calculation

For each curve where more helps, share = improvement from the lowest displayed dose divided by the largest improvement anywhere in the explicitly declared displayed range. It is0% at that range’s origin and100% at its best point. Enough is the first90% crossing. The denominator is a bounded descriptive comparison, not an absolute biological maximum, causal effect or personal forecast. Selected model windows are labeled as such.

`js/enough-data.js` contains the primary coordinates, source location per point, full retained activity grid, raw uncertainty, model parameters, declared range and computed share/crossings. `js/enough-math.js` supplies the shared calculation to the UI and validator. For exact reconstructable models, analytical expressions evaluate the selected dose; root-finding gives the crossing. Otherwise we use straight lines between source coordinates. Categorical evidence selects the first qualifying source group and never invents a continuous threshold. The old off-topic cards remain as archived evidence in the data file.

The overview overlays steps, exercise and protein. Its x-axis is the fraction through each curve’s displayed dose range. The range endpoints differ, so it is not equal physical effort. Its y-axis compares shares of distinct outcomes, not equal health gains. A shared40% point initially displays about83 to 86% of those range-bounded gains. Each card and the overview drawer disclose the physical ranges.

Separately normalizing complete lower and upper pointwise curves provides a sensitivity check. It is not a formal confidence interval for a threshold. Protein’s published breakpoint interval can be propagated conditionally through the chosen model; it is not a new response band. Work has no reconstructable covariance, so no band is invented. Savings alternatives are assumptions, never confidence limits.

## Cards

|Card|Range shown|Enough or other shape|
|---|---|---|
|Steps|2,000 to 12,000/day|10,500;7,000 reaches85.5%|
|Exercise|0 to 600 moderate minutes/week|342.64 minutes;150 reaches80.6%|
|Protein|0.41 to 1.09g/lb/day|0.7022g/lb, about105g at150lb|
|Weekly sets per muscle|0 to 45|Keeps paying; descriptive90% point37.83|
|Sleep|3 to 11hours|Low point7; highlighted6 to 7.25 stays within1% of the minimum|
|Fruit and vegetables|Source groups eating about2.1 to 7.3servings|First qualifying group has median intake5.3; later7.3 group falls below90%|
|Fiber|Chosen7 to 35g window,2019 log-linear model|31.86g; model still improves at35|
|Income|Source bands$10k to$500k+|First qualifying band$200k to $300k; no settled ceiling|
|Savings|Chosen5 to 95% window|73.11% under stated steady assumptions|
|Work|Historical factory model24 to 72.5hours|53.48hours captures90%; peak62.91hours|
|Meditation|No reliable measured daily curve|Unknown; no invented minute slider|
|Alcohol|Published categories, top32.5+US drinks/week|No proven longevity benefit; signed excess risk|
|Smoking|Never,1,5,20cigarettes/day|Enough zero; men’s excess coronary risk|

## Primary-data decisions

Ding2025 Table2 uses all11 predictions. Its tail improves again, so do not truncate the range to force a7,000-step threshold. Garcia2023’s0 to 600window contains94% of the source’s person-years. The full author curve extends to about2,229minutes and gives a different crossing; alternatives are disclosed in the drawer. Arem2015 remains a research cross-check.

Morton2018’s plateau is imposed in a segmented model; its superiority over a straight line is uncertain. The90% point differs from the1.62g/kg bend. Pelland2026’s source has observed zero-training controls. Version2 corrects the old one-set origin to exact High=x,Low=0 contrasts. A2.01% model contrast compares post/pre muscle-size ratios, not2% more of an individual’s muscle gain. Frequency is folded into its evidence.

Fruit and veg preserves NHS women’s Table2 groups and their later dip. Fiber reconstructs the printed Reynolds2019 log-linear RR0.93 per8g rather than digitizing the nonlinear figure. The selected7 to 35window is a conservative subset of its approximate6 to 35figure extent, not exact observed extremes. Newer meta-analyses were screened but supply no defensible replacement numeric spline.

Income preserves author-deposited group means and SE-derived limits, including the top group’s dip. The top$500k+ band is open;625k is an assigned representative coordinate, not an observed cap. The smooth log-income trend is distinct from these means. About one feeling-score point per doubling comes from the author’s0.113 log coefficient and the raw-to-standardized scale factor. The general ceiling remains disputed.

Pencavel’s IZA DP8129 Equation4 and Table4(ii) give additional output126.089(h−24)−4.533max(0,h−49)^2. Unknown group intercepts cancel. Its historical factory result is not a modern recommended workweek. Separate WHO/ILO stroke evidence belongs in the drawer.

Zhao2023 Table2 corrects abstainer bias and uses lifetime nondrinkers. Keep the low-drinking central estimates of−4% and−7% excess risk, with intervals including zero. Do not manufacture midpoints or a finite maximum for its open top category. One US standard drink is14g. Hackshaw2018 men’s extra coronary risk is48% for one cigarette and104% for20; their ratio is46.15%.

## Interaction and checks

Every numeric card has a native labeled range control, a human readout and an evidence drawer with source estimates with outcome units. Chart pointer gestures focus and update that same control. Categories snap to source points; keyboard navigation remains native. The optional personal inputs collapse under a native disclosure. The panel accepts any subset, pairs protein with body weight in pounds, rejects invalid values and declines extrapolation. It makes no network request or storage write. Sleep’s bar marks hours across its displayed range, not a health-share score. Work explicitly uses the factory curve.

Run `node tools/test-enough-data.mjs`. Then, with Playwright on NODE_PATH, run `node tools/test-enough-browser.cjs`. The browser harness owns an ephemeral server and `/Users/ethan/.local/bin/agent-chrome-for-testing`, closing both in `finally`. It verifies375x812,768x900 and1440x900, keyboard, mouse, actual dispatched touch, drawer Enter, input subsets/reset/error cases,44px controls, SVG label bounds, accessibility names and no missing resources. This is automation, not physical-device or real screen-reader certification.

Research and AI reader reviews are local, ignored files in `/Users/ethan/Portfolio_01/research/enough/v2/`; progress and polish logs are in its parent. AI reader personas are simulations, never human user testing. The local write-post skill is applied in a separate editing pass. An installed dataviz skill could not be found; primary design references and explicit statistical/art reviews fill that gap without claiming the skill ran.

Painting options: Bruegel’s The Harvesters (Met), Homer’s Breezing Up (NGA), Chardin’s Fruit,Jug,andGlass (NGA), all public domain. Provisional choices: Bruegel, shared overlay, area colors. `enough-lab.html` previews all painting/layout/color combinations.
