# From the Machine to the Atom, editorial review

The reader can follow how purified silicon becomes a patterned, wired chip, then read the smaller structures in actual micrographs without mistaking a process label for a measured size. The page retains its visual sequence, but identifies the changes of device, year, specimen and imaging method. It ends on what the final reconstruction resolves: projected silicon atom columns.

## Scope and counts

Revised only `archive/machine-to-atom/machine-to-atom.html` and this review. No assets, shared styles, root copies, indexes or archive cards were edited. Nothing was staged, committed or pushed.

| Reading path | Before | After |
| --- | ---: | ---: |
| Header and main, including all captions and viewer instructions | 1,886 | 1,689 |
| Optional image-source disclosure | 184 | 228 |

Counts use decoded HTML text and the same word-token expression before and after. They exclude scripts, CSS, image attributes, the injected archive banner and footer. The separate short credits introduction remains outside those two counts. Main prose is about 10.4 percent shorter; the optional list grows because the original figure attribution and license statements needed repair. The page contains 16 zoomable assets in 15 figures. The seventeenth `img` element is the viewer's empty image element, so it is excluded from the visible count.

Eight minutes describes the main reading path at about 210 words per minute. Image viewing is explicitly additional. This length earns its space: each manufacturing stage explains a different operation, while the final images need their own specimen and scale explanations. Cutting the captions to slogans would restore the misleading implication of a continuous zoom.

## Specific original problems

The opening said chips were printed rather than carved and attributed almost every advanced chip to the pictured High-NA scanner. Etching is part of fabrication, and the 2020 M1 predates the EXE:5000 deliveries. The prose treated later images as deeper views of that M1 even though the wiring is an Intel process example and the FinFET is a 2023 research device.

The blanket wafer-flatness claim confused local roughness with whole-wafer shape. Unqualified price, mirror, purity, ingot weight and yield, timing, layer-count, resist-thickness, total-wire-length and transistor-area claims lacked a responsibly transferable source or added little to the page. They were removed rather than given false precision.

The supposed blank wafer is identified by its image record as finished neural-interface research. The FinFET credit named Yu rather than Yao and presented a 20 nm scale bar as the size of a modern switch. The atom image linked an Applied Microscopy review but credited Nature Communications. The wiring crop retained a third-party IEEE copyright despite the original page calling it CC BY. The influenza pair lacked a warning that displayed magnifications differ. The radiation caption implied immunity and inevitable ordinary-chip failure.

## Claim ledger

Sources below were actually opened. Manufacturer explanations establish representative processes, not a recipe for the pictured M1. Original papers were checked for the dimensions and image methods used in the revision.

| Claim or correction | Evidence opened | Classification and limit |
| --- | --- | --- |
| High-NA is an optical numerical-aperture change; first EXE:5000 modules shipped in December 2023. | [ASML's 2024 High-NA explainer](https://www.asml.com/en/company/stories/2024/5-things-high-na-euv) | Manufacturer history and optical explanation. These deliveries establish chronology, not widespread High-NA production. No price is retained. |
| The joint lab opened in 2024, after the M1's launch. | [ASML-imec lab announcement, June 3, 2024](https://www.asml.com/en/news/press-releases/2024/asml-imec-opening-high-na-euv-lithography-lab) | The EXE:5000 is described as a prototype for development. Removed the original near-universal manufacturing assertion. |
| The cleanroom photograph depicts Intel's installation at a separate site. | [Intel's April 18, 2024 installation account](https://www.intel.com/content/www/us/en/newsroom/news/intel-foundry-opens-new-frontier-chipmaking.html) | Official photograph caption identifies the D1X briefing in Hillsboro. Replaced the dead press-kit URL. |
| Cleanroom suits reduce particles shed by workers; particle contamination can damage fine patterns. | [ASML's chipmaking explanation](https://www.asml.com/en/technology/all-about-microchips/how-microchips-are-made) | Representative fabrication practice. Removed the hospital cleanliness ratio and boulder analogy. |
| Tin preparation and a main laser pulse produce plasma; EUV exposure uses radiation near 13.5 nm, with other emitted wavelengths. | [Versolato's full 2019 review, Figure 1 and sections 1 to 3](https://ir.arcnl.nl/pub/67/00076OA.pdf) | The pictured schematic describes the source module. It does not depict the whole scanner or imply monochromatic plasma emission. |
| ASML describes 50,000 droplet cycles per second; EUV uses mirrors and vacuum. | [ASML light and lasers](https://www.asml.com/en/technology/lithography-principles/light-and-lasers), [ASML lenses and mirrors](https://www.asml.com/en/technology/lithography-principles/lenses-and-mirrors) | Attributed manufacturer description, not a measurement of the pictured machine. The 13.5 nm wavelength is distinct from a transistor dimension. |
| Siemens-process purification uses distillable trichlorosilane and silicon deposition on heated rods. | [Wacker's electronic-grade silicon account](https://reports.wacker.com/2022/annual-report/sustainable-solutions/purity-is-our-recipe-for-success.html) | Manufacturer process description. Removed a universal purity ratio and treated controlled dopants separately. |
| A rotating seed pulled from molten silicon produces a Czochralski single crystal. Boron or phosphorus can be intentional additions. | [SUMCO's wafer process](https://www.sumcosi.com/english/products/process/) | Primary manufacturer's process. Single crystal concerns orientation; it is not a guarantee of a lattice without defects. |
| The large ingot photograph records Faggin at Intel in 2011, without ingot mass, dimensions or yield. | [Original Commons record](https://commons.wikimedia.org/wiki/File:Silicon_Ingots_Bigger_These_Days.jpg), [Intel's 4004 history](https://www.intel.com/content/www/us/en/history/virtual-vault/articles/the-intel-4004.html) | Photograph provenance and official historical account support the visit and design leadership. Removed the numerical yield. |
| SUMCO describes roughly 1 mm sawed slices, followed by lapping, damage etch and polishing; large production wafers can be 300 mm across. | [SUMCO process](https://www.sumcosi.com/english/products/process/), [Intel's full 2009 chipmaking booklet](https://download.intel.com/newsroom/kits/chipmaking/pdfs/Sand-to-Silicon_45nm-Version.pdf) | Converted ordinary dimensions to about 0.04 inches and 12 inches. These are representative sizes, not measurements of every pictured wafer. Intel's example describes a historical 45 nm process. |
| Whole-wafer thickness variation is different from local surface roughness. The cited experiment achieved about 40 nm over a full 300 mm wafer. | [Original 2007 NIST paper](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=823030) | The paper distinguishes full-wafer variation, smaller-site variation and roughness, and uses specialized finishing and metrology. The result is labeled experimental, not a modern purchasing specification. |
| The wafer-in-hand image is finished neural-interface work, not a verified blank 12-inch wafer. | [DOE/LLNL photograph record](https://commons.wikimedia.org/wiki/File:Silicon_wafer_researcher.jpg) | Record establishes purpose and 2013 date. Diameter is not established. |
| Lithography patterns resist; development and etching transfer patterns, with deposition, doping and polishing elsewhere in the sequence. | [ASML's fabrication steps](https://www.asml.com/en/company/stories/2021/semiconductor-manufacturing-process-steps), [Intel's 2009 process booklet](https://download.intel.com/newsroom/kits/chipmaking/pdfs/Sand-to-Silicon_45nm-Version.pdf) | Representative sequence, explicitly not a complete device recipe. Wording allows reflected mask light in EUV rather than asserting transmission through every mask. |
| Different layers can use EUV and DUV; pattern alignment matters. | [ASML's chipmaking explanation](https://www.asml.com/en/technology/all-about-microchips/how-microchips-are-made) | Distinguishes patterned steps from physical wiring layers. No universal layer count remains. |
| Spin coating spreads resist; patterned wafers scatter light; the rainbow does not establish function. | [Spin-coating photograph record](https://commons.wikimedia.org/wiki/File:Photoresist_spin_coating.jpg), [ASML's diffraction-based measurements](https://www.asml.com/en/technology/lithography-principles/measuring-accuracy), [2019 wafer record](https://commons.wikimedia.org/wiki/File:Silicon_Wafer_20190210.jpg) | Photograph observations plus optical mechanism. No resist thickness or circuit yield is inferred from color. The wafer's chip identity is unspecified. |
| The dicing photograph is a six-inch wafer; wafer test and packaging are separate operations. | [Original wafer record](https://commons.wikimedia.org/wiki/File:Exposed_150mm_6%22_wafer_with_hundreds_of_chips.jpg), [Intel process booklet](https://download.intel.com/newsroom/kits/chipmaking/pdfs/Sand-to-Silicon_45nm-Version.pdf) | A separate example, not the previous wafer cut apart. No die-count estimate is retained. |
| Apple announced M1 in 2020, with a 5 nm process, 16 billion transistors and eight CPU cores. | [Apple's November 10, 2020 announcement](https://www.apple.com/newsroom/2020/11/apple-unleashes-m1/) | Official specifications. Optical photographs reveal collective layout, not individual transistor counts. Regular versus irregular textures are visual interpretation, not complete block identification. |
| Intel's 2014 process has 20 nm gate length, 52 nm minimum interconnect pitch and thirteen copper layers; the wiring image shows ten. | [Natarajan et al., full 2014 IEDM paper](https://people.eecs.berkeley.edu/~pister/140sp16/resources/Intel14nmIEDM2014.pdf), especially Figure 10 | Original measured process dimensions. The 14 nm name is not a universal feature size. This is a separate chip example from M1. |
| Roughly spherical influenza virions are about 80 to 120 nm across. | [McDevitt et al., full CDC-hosted study, discussion](https://stacks.cdc.gov/view/cdc/39772/cdc_39772_DS1.pdf), [CDC/Cynthia Goldsmith image record](https://commons.wikimedia.org/wiki/File:Influenza_virus_particle_8430_lores.jpg) | The study uses nominal naked-virion size, not the larger exhaled particles it collects. Comparison is illustrative. Filamentous forms and the scale of the displayed CDC photograph are not inferred. |
| The FinFET is Yao et al.'s Si/SiGe superlattice experiment, with 30 nm fin width, 200 nm gate length and 20 nm scale bars. | [Original Nanomaterials paper, methods and Figure 2a,b](https://pmc.ncbi.nlm.nih.gov/articles/PMC10145376/) | Research device using alternating layers and a TiN gate. Scale-bar length is distinct from device length. Removed the unqualified billions-per-second switching claim. |
| Annular layouts are one radiation-tolerance design technique; total-dose and single-event effects differ. | [NASA's full 2004 presentation, slides 14, 15 and 39](https://nepp.nasa.gov/files/25295/MRS04_LaBel.pdf) | Institutional explanation, not a radiation test of the retained ring-gate photograph. Removed immunity, orbital use and inevitable scrambling claims. |
| The final image is a [110] silicon ptychographic reconstruction with a 1 nm scale bar, resolving projected columns. | [Suh et al., Applied Microscopy 55, 13 (2025), Figure 1b and ptychography explanation](https://pmc.ncbi.nlm.nih.gov/articles/PMC12672990/) | This is the publishing source of the retained figure, a microscopy review. It is not an M1 measurement or proof of isolated individual atoms. Removed the unsupported 0.5 nm spacing and machine-arranges-these-dots ending. |
| The Intel interconnect image is not covered by the review's blanket CC BY license. | [Moon et al., Advanced Science, Figure 1b credit](https://pmc.ncbi.nlm.nih.gov/articles/PMC10427378/) | Caption explicitly states reproduction with permission and copyright IEEE 2014. Corrected visible, optional and generated lightbox attribution. |

## Voice and presentation passes

1. Monotone read: removed spectacle about the most complicated machine, purified sand, cities, highways, elevators, a cosmic ray and a supposed final floor. Kept the specific material operations and image details that survive a flat reading.
2. First-paragraph deletion: replaced the original repeated printed-not-carved opening. The remaining introductory paragraph earns its place by defining the operations and warning that the sequence changes devices. The standfirst now states the actual payoff.
3. Generic-sentence pass: replaced staged zoom instructions in the narrative with actual changes in specimen and method. Instructions that operate the viewer remain in one compact line. Each caption identifies its own image rather than repeating awe about scale.
4. Volume cut: the main path loses 197 words despite added process distinctions and source corrections. Removed tangents and unsupported numerical decoration. The conclusion no longer recaps all prior images.
5. Source pass: numbers have nearby links, dimensions are tied to their source devices, historical facts have dates, and observational interpretation is limited. The final sentence states a microscopy limit rather than an inflated synthesis.

Applied the shared `editorial-page` and `editorial-hero` contract. Title, document title, OG title and Twitter title agree. The opening image sits after the title hero. Century Supra body and captions use the roughly 64-character measure, 1.27rem size and 1.72 line height. Sections use fine rules and centered serif headings. The mobile reading column has one 20px gutter, without duplicated caption padding. Images, photograph colors, asset dimensions and archive URL remain intact.

## Interactions and verification

Retained all 16 original preview sources, WebP siblings and full-resolution source paths, plus figure order, eager opening image, lazy later images, archive banner, home/footer links, disclosure, analytics event hook, reduced-motion reveal gate and back-to-top script. Lightbox click/tap, wheel and pinch zoom, drag pan, zoom buttons, fit/reset, keyboard shortcuts and Escape remain. Buttons are now 44px square. The reading-progress bar now updates on body-size changes and resize as well as scrolling, so closing image credits cannot leave a stale denominator.

Personally performed:

- Balanced-tag HTMLParser check, duplicate-ID check, all local `src`, `srcset`, `href` and full-resolution reference checks. No errors or missing paths. Compared the complete preview/full-resolution asset lists with the original, identical.
- Parsed every inline script with Node `vm.Script`. No syntax errors. The viewer implementation itself is unchanged.
- Checked decoded post content for em dashes, en dashes and pictographs, including entities. None found. `git diff --check` passed, and the target-file diff was read.
- Ran root's `tools/test-archive-editorial.cjs --slugs=machine-to-atom` at 1365 by 900 and 375 by 812. Zero browser errors, missing resources or horizontal overflow; archive notice present; titles agree; hero centered. At 375px, hero and reading gutters are 20px.
- Dedicated viewer test at 1365, 768 and 375px: every image loads and opens with matching corrected title and credit; zoom-in/out, keyboard zoom/reset/Escape, wheel and mouse pan, fit button, credits open/close, reading progress and 44px targets. Phone emulation also checks tap opening, two-finger pinch and one-finger pan.
- Inspected desktop and mobile opening screenshots, body screenshots and the phone lightbox screenshot.

Browser tests use `/Users/ethan/.local/bin/agent-chrome-for-testing`. Each harness owns its browser and local HTTP server and closes them in `finally`. Evidence is under `/tmp/machine-to-atom-editorial-browser/`, with `verification.json`, `static-verification.json`, `dedicated-viewer-verification.json` and screenshots. The dedicated harness is `/tmp/test-machine-to-atom.cjs`.

## Residual limits

The Don DeBold and Fritzchens Fritz links are retained photographer streams rather than exact item records. They were opened, but the exact archived files' original item licenses were not independently recovered. The ring-gate Commons record returned access errors; its original TiberiusRufus credit and CC BY-SA 4.0 statement are retained. No new numeric or performance claim depends on that image record.

Correcting the IEEE attribution does not establish a separate permission grant to this site. The existing image was preserved as assigned, and the revised page no longer claims that it is CC BY. The atom figure's publishing source is a review, so the page makes no experimental accuracy or ultimate resolution claim beyond its own stated figure and scale bar. Tests emulate Chromium touch behavior; a physical iPhone and Safari were not used.

## Proposed archive card, 28 words

Factory photographs and micrographs follow silicon from crystal growth to chip wiring and atomic columns, with sixteen zoomable images and explanations of what each device and scale reveals.

## Integration follow-up

The independent integration audit and root visual inspection corrected the ingot-scale alt text: the large ingot is exposed between supports, while smaller samples occupy the nearby glass case. The photograph, caption and credit are unchanged.
