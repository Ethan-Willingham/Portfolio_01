# Slop

Slop is a gallery of AI-made pictures about AI making crap. The owner supplied
the premise and asked AI to write the phrases, choose the art directions,
generate the images and build the site. The awkwardness is part of the work.

The gallery is a full-screen field of square images that the visitor can pan
through and inspect. A piece should reward looking at the image before reading
its production record. The surrounding interface uses the site's fonts and
palette; each artwork has its own colors and material.

## The catalogue

[`js/slop-data.js`](../js/slop-data.js) contains the phrase bank, art directions,
work plans and production record. It is a strict JSON object assigned to
`window.SLOP_DATA`, so browser code and production tools can read the same data.

The catalogue began with 120 phrases, 48 art directions and 24 work plans.
The second group adds ten phrases and ten work plans, bringing the totals to
130 phrases and 34 works. It uses ten previously unused art directions.
The revised third group adds eleven more phrases, works and art directions:
141 phrases, 45 generated works and 59 directions. All eleven new works passed
the six checks, and the owner approved publication on October 7, 2026.
The owner's later curation left 25 works on view and retired 20. That completed
production history contains 45 generated work IDs and 55 generation attempts.
Groups four to ten added works 046 to 109. The eleventh group adds three works
about formulaic AI language. The catalogue now has 208 phrases, 123 directions,
112 generated work IDs and 194 lifetime image calls. There are 37 active works
and 75 retired works.
The phrase bank includes the owner's four starting lines: "Slop", "A step below
average", "Uncanny" and "Looks right, but wrong". The remaining lines range from
short complaints to descriptions of familiar generated-image errors. They
avoid turning every piece into the same argument about artistic authenticity.

The `styles` catalogue mixes movements, mediums and processes. It is a working
selection across painting, print, sculpture, photography, collage, textiles,
light and digital images. Its labels describe the intended result. An image
of a ceramic object is still a generated image, even when the direction calls
for a ceramic sculpture. The catalogue does not attribute generated pieces to
artists or claim that any physical object was made.

## The first group

Each work pairs one phrase with a different art direction. The words belong to
the material: they are cut through paint, assembled from paper, bent from
tubing, scratched into clay, woven into cloth or carried by another visible
process. Their placement should change with that process.

| Work | Phrase | Direction |
|---|---|---|
| 001 | Slop | Impasto painting |
| 002 | Authorship unavailable | Redaction drawing |
| 003 | Feeling generated | Neon sculpture |
| 004 | A step below average | Hard-edge abstraction |
| 005 | Original-ish | Torn typographic collage |
| 006 | Almost a hand | Glazed ceramic sculpture |
| 007 | A mood without a memory | Woven textile |
| 008 | Nobody stood there | Cyanotype |
| 009 | Good enough to scroll past | Halftone pop print |
| 010 | This should have been deleted | Photocopier collage |
| 011 | Uncanny | Op art |
| 012 | Looks right, but wrong | Synthetic stock photography |
| 013 | Yesterday, statistically | Encaustic painting |
| 014 | Words approaching language | Digital glitch composition |
| 015 | The average won | Suprematist abstraction |
| 016 | A convincing waste | Arte Povera assemblage |
| 017 | Meaning sold separately | Minimalist sculpture |
| 018 | An image of having an idea | Photomontage |
| 019 | An accident without an accident | Automatic ink drawing |
| 020 | Authentic-looking | Airbrush painting |
| 021 | The shadows disagree | Woodcut |
| 022 | Taste pending | Stained-glass panel |
| 023 | The reference escaped | Risograph print |
| 024 | Freshly recycled | Resin assemblage |

The prompts request independent square images. Paintings and prints fill the
image; a sculpture can include the surface, light and shadow needed to show its
form. Every prompt includes the chosen phrase verbatim and describes how its
letters are made. The original first 24 prompts range from 132 to 143 words.

## The second group

The next ten pieces target confident errors, outsourced judgment, unpaid work,
quantity without value, automated empathy and invented expertise. Each joke has
a visible mechanism: defective cups multiply, tears become coins, a citation
returns to itself, or an empty worker silhouette remains in pulped paperwork.

| Work | Phrase | Direction |
|---|---|---|
| 025 | Now wrong in bulk | Screenprint |
| 026 | Your work. Our breakthrough. | Decollage |
| 027 | Your grief improves our product | Embroidery |
| 028 | Doctor of plausible bullshit | Lithography |
| 029 | Human in the billing loop | Found-object assemblage |
| 030 | A million copies of who cares | Concrete poetry |
| 031 | Peer reviewed by itself | Drypoint |
| 032 | I agree with your last opinion | Low-poly digital sculpture |
| 033 | Permission not found. Proceeding. | Scanography |
| 034 | Now with fewer people | Paper pulp relief |

## The third group

The starting prompts come from the reviewed "Third group" in the owner's local
`research/slop/NEXT_PROMPTS.md` prompt pack. Use its first-attempt prompts
verbatim, with two later changes from the owner: work 040
becomes "Something for everyone." on a layered notice board, and work 045 adds
"Our signature dish." in a food court with five stalls. The other nine retain
their original order. This production run contains eleven new works.

| Work | Phrase | Direction | Original run attempts |
|---|---|---|---|
| 035 | Photographer: none | Archive record | 2 |
| 036 | By continuing, you agree | Canvas verso | 2 |
| 037 | Even the copies had painters | Workshop genre painting | 2 |
| 038 | Restored into a stranger | Vernacular snapshot | 1 |
| 039 | Underdrawing: noise | Technical imaging | 1 |
| 040 | Something for everyone. | Notice-board photograph | 1 |
| 041 | Only one of these happened | Activity-book page | 2 |
| 042 | Open edition | Etching edition | 3 |
| 043 | Illustrated by | Picture-book cover | 1 |
| 044 | Image for illustration purposes only | Street photograph | 2 |
| 045 | Our signature dish. | Food-court menu photograph | 1 |

New phrases take p131 through p141 in work order. Add each new direction when
its work is recorded. The work records hold the actual attempts and decisions;
passing these checks does not constitute the owner's approval to publish.
The table records the original third-group run. Later revisions add to each
work's lifetime attempt count without changing this historical record.

The run used 18 attempts. Works 035, 036, 042 and 044 needed larger or darker
lettering. Work 037 needed visible oil brushwork throughout the scene, and 041
needed matching photographs. Work 042's third attempt reversed the copper
plate relative to its impression. All seven rejected attempts remain in the
catalogue with their images, prompts, six checks and reasons. The final batch
check passed with the complete group beside 025 to 034.

### The bar for new work

Record a small, checkable loss in a flat voice. Use wording a person or
institution could actually write, and let the picture hold the evidence.
Where the wording is the object, such as a form or a credit line, it belongs to
that object. Get the depicted material and process right.

Read "The bar", "Cut, and why" and "Judge every result before keeping it" in
the prompt pack before generating. The cuts exclude puns, memes, sneers at
users or clients, martyr staging, stock AI imagery, familiar-painting references
used as a joke, and protest or rhyming slogans. Finger, anatomy and garbled-text
gags are excluded outside the specific "Giveaways, amplified" prompts, where a
trade setting makes the visible error the point. Keep real names, brands,
logos, recognizable people and living
artists' signature looks out of the images. Maker's marks and other incidental
identifiers must be invented or blank. Do not use generated braille or fake
news imagery. Keep the criticism factually fair and acknowledge the human
history of copies, decorative art and displaced work.

### Review every attempt

Run these six checks after every generated image, before starting the next
work. Record a pass or failure and a concrete note for each check in that
attempt's `generation.attemptLog` entry.

1. **Words.** Check the exact phrase, spelling and punctuation at 336 pixels
   square. Main lettering should be at least one twentieth of the image height.
2. **Evidence.** Hide the words and check whether the visual mechanism remains.
   When the words are the object, check that they belong to its record or
   material. A pleasant image with an attached caption fails this check.
3. **Medium.** The named process must be visible at gallery size, rather than
   reading as a generic digital painting or a different medium.
4. **Cringe.** Remove details that wink, preach, explain the joke or sneer.
5. **Guardrails.** Check identities, brands, watermarks, signatures and stray
   garbled lettering. Tiny illegible text is allowed only where requested.
6. **Batch.** Put the new result beside works 025 to 034 on a contact sheet.
   Check for repeated palettes and formulas; regenerate the dullest work if
   the group becomes visually uniform.

On failure, change only the sentence responsible for the failed check. Record
what changed and why, then regenerate. Stop at three attempts per work within
a production run or registered revision, and record a remaining failure
honestly. Retain every attempt's prompt, source hash, timestamp, six-check review
and decision, including rejected attempts. Retain its images unless the owner
requests their deletion, then preserve the metadata and record the deletion.
Keep `originalPrompt` and identify the chosen `selectedAttempt`.
The work's current `prompt` must match its selected image.

### Original publication approval

The owner reviewed the contact sheet and approved publication of all 45 works
on October 7, 2026, together with the homepage thumbnail size fix. Passing the
six checks alone did not authorize publication. Final attempt counts and
individual review notes are recorded in the work records.

The reviewed contact sheets covered 025 to 044 and 025 to 045, including the
added food-court work. They used the actual image files, with 336-pixel squares
and labels outside the art. `tools/slop-contact-sheet.cjs --end 044` and `--end 045` make
the sheets; `--single 035` makes a 336-pixel word-check preview. While a title
has not entered the catalogue, supply `--prompts` with the prompt pack path
or `--title` for a single work.

The owner's explicit yes was received before committing, changing the `?v=`
values or pushing changes from this run.

## Owner curation, October 7, 2026

The picker review first removed 17 works from view and requested replacement
images for 006, 011 and 037. The owner then rejected all three remakes and
directed deletion of those images and retirement of those three works too.
The final 20 retired IDs are **002, 006, 007, 008, 010, 011, 014, 015, 018,
021, 023, 027, 028, 029, 031, 033, 036, 037, 039 and 042**.

That curation left **25 works on view**, **45 lifetime generated work IDs** and
**55 lifetime attempts**: the earlier 52 plus three new attempts. Retired works
keep their catalogue entries and production history, with
`generation.status: "retired"` and a retirement record. Keep the surviving IDs
unchanged.

Revision **`owner-review-2026-10-07`** generated one replacement for each of
these works. All three passed the recorded six checks and were subsequently
rejected by the owner. The revision is finished, with no further retries.
The contact-sheet approval above applied to the original third group; the
owner's latest direct request authorizes these deletions and retirements.

| Work | Phrase | Attempts before revision | Final lifetime attempts |
|---|---|---|---|
| 006 | Almost a hand | 1 | 2 |
| 011 | Uncanny | 1 | 2 |
| 037 | Even the copies had painters | 2 | 3 |

The three rejected replacement records retain their prompts, source hashes,
timestamps and six-check reviews. Their `image` and `fallback` fields are null,
with `deletedAt`, `deletionReason` and `ownerDecision: "rejected"` recording the
owner's decision. The replacement image files are deleted and excluded from
publication. Work-level selections for 006, 011 and 037 point back to their
historical originals, while all three works remain retired. Earlier assets and
attempt records stay intact.

`tools/slop-record-attempt.mjs` imports a replacement under a registered
`generation.revisions` entry when passed `--revision` alongside `--id`,
`--source` and `--request`. Each new attempt records its `revisionId`. The limit
is three new attempts per work per revision, with a review before each further
attempt. Attempt numbers and `generation.attempts` remain cumulative across
the work's lifetime. This completed revision used one new attempt per work.

The original attempts for 006 and 011 predate the six-check records. Their
preserved entries use `legacy: true`, `review: null` and a note explaining that
history. Leave those missing reviews unknown. The rejected remakes retain the
full six-check reviews recorded when they were generated.

## Current production: groups four to ten

The owner approved production of **046 to 109**, in group and work order from
the updated local `research/slop/NEXT_PROMPTS.md`. The frozen local plan is
`research/slop/groups-04-10-plan.json`. It contains 64 work plans: 60 ordinary
pieces and four nine-image demonstration grids, requiring at least **96 image
calls** before ordinary retries. New phrases take p142 to p205 in work order.

Keep works 001 to 045 and their histories unchanged. The 20 retired IDs above
stay retired, including 006, 011 and 037. Do not renumber any work. The tables
start pending and are updated after each group; `js/slop-data.js` records each
call and review. Publication was approved after the second picker curation,
as recorded below.

### Fourth group, 046 to 055

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 046 | Worth the drive | Windshield photograph | Retired by owner, 1 attempt |
| 047 | Admission £35 | Event flash photograph | Retired by owner, 2 attempts |
| 048 | Small batch | Retail shelf photograph | Retired by owner, 2 attempts |
| 049 | Painted by hand | Hand-painted wall advertisement | Complete, 1 attempt |
| 050 | Easy to grow | Seed packet | Complete, 1 attempt |
| 051 | Virtually staged | Property listing photograph | Complete, 2 attempts |
| 052 | Tour dates to be announced | Record sleeve | Retired by owner, 2 attempts |
| 053 | Learn to paint | Bus-shelter advertisement | Retired by owner, 1 attempt |
| 054 | Each sesame seed placed by hand | Food-styling set | Retired by owner, 1 attempt |
| 055 | Apprentices painted the backgrounds | Tempera altarpiece | Retired by owner, 2 attempts |

All ten works are complete after 15 attempts. The group contact sheet is saved
locally at `research/slop/review/contact-sheet-046-055.png`.

### Fifth group, 056 to 065

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 056 | New look, same tacos | Rótulo sign painting | Retired by owner, 1 attempt |
| 057 | Meet the team | Headshot wall | Complete, 1 attempt |
| 058 | You are here | Park map board | Complete, 2 attempts |
| 059 | Stay inside the lines | Coloring-book page | Retired by owner, 1 attempt |
| 060 | Can you make it look less AI? | Designer's markup | Retired by owner, 2 attempts |
| 061 | Ask to see my sketchbook | Convention table photograph | Retired by owner, 2 attempts |
| 062 | Rare | Trading card | Retired by owner, 1 attempt |
| 063 | Behind the scenes | Magazine page | Retired by owner, 1 attempt |
| 064 | Real, for what it's worth | Contact sheet | Retired by owner, 2 attempts |
| 065 | This took seconds | Millefleurs tapestry | Complete, 2 attempts |

All ten works are complete after 15 attempts. The group contact sheet is saved
locally at `research/slop/review/contact-sheet-056-065.png`. Through group five,
20 new works used 30 image calls. The weekly meter read **19% used** at
**2026-10-07T20:00:09Z**, up **11 percentage points** from the 8% baseline in
the same window.

### Sixth group, 066 to 075

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 066 | Homemade | Lemonade stand | Complete, 1 attempt |
| 067 | Beginner friendly | Craft pattern booklet | Retired by owner, 2 attempts |
| 068 | Shop local | Main-street photograph | Complete, 1 attempt |
| 069 | Pickup for all restaurants | Delivery-kitchen door | Complete, 2 attempts |
| 070 | Artist quality | Paint-set packaging | Retired by owner, 2 attempts |
| 071 | Limited edition | Gig-poster wall | Retired by owner, 2 attempts |
| 072 | Negative prompt: ugly | Charcoal portrait | Retired by owner, 2 attempts |
| 073 | The marble did not fight back | Marble sculpture | Retired by owner, 2 attempts |
| 074 | Viewing by appointment | Gallery painting | Retired by owner, 2 attempts |
| 075 | It won't hold. | Tattoo flash | Retired by owner, 2 attempts |

All ten works are complete after 18 attempts. Eight needed another attempt for
lettering at 336 pixels. Work 070 also needed a clearer contrast between its
smooth box image and watercolor sketch. Work 074 needed visible oil brushwork
and every picture concealed, in addition to a readable notice.

The group sheet was shown and saved locally at
`research/slop/review/contact-sheet-066-075.png`. Through group six, 30 new
works used 48 image calls. The weekly meter read **22% used** at
**2026-10-07T20:50:50Z**, up **14 percentage points** from the 8% baseline in
the same window.

### Seventh group, 076 to 085

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 076 | It took photography 150 years | Archive photograph | Retired by owner, 2 attempts |
| 077 | Distractions removed | Photo-service advertisement | Retired by owner, 1 attempt |
| 078 | Likely AI-generated | Parchment document | Retired by owner, 1 attempt |
| 079 | Disqualified for being real | Award certificate | Retired by owner, 2 attempts |
| 080 | New work continues to appear | Retrospective wall | Retired by owner, 2 attempts |
| 081 | The Luddites were weavers | Jacquard weaving | Retired by owner, 1 attempt |
| 082 | Medium: up to one phone charge | Museum wall label | Retired by owner, 2 attempts |
| 083 | Can you make this by Saturday? | Bakery counter photograph | Complete, 2 attempts |
| 084 | Every line was put there by someone | Drawing automaton | Retired by owner, 2 attempts |
| 085 | Everyone smiled | Holiday photo card | Retired by owner, 1 attempt |

All ten works are complete after 16 attempts. Works 076, 079, 080, 082,
083 and 084 needed larger lettering at 336 pixels. Work 080 also needed
its eight year labels enlarged so the chronology remained readable.

The group sheet was shown and saved locally at
`research/slop/review/contact-sheet-076-085.png`. Through group seven, 40 new
works used 64 image calls. The weekly meter read **25% used** at
**2026-10-07T21:34:19Z**, up **17 percentage points** from the 8% baseline.

### Eighth group, 086 to 095

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 086 | You have looked at this longer than it took to make | Bench plaque | Retired by owner, 2 attempts |
| 087 | The phone added the craters | Experiment photograph | Retired by owner, 2 attempts |
| 088 | Borrowed 48,213 times | Library due-date slip | Retired by owner, 2 attempts |
| 089 | For my medical record only | Consent form | Retired by owner, 2 attempts |
| 090 | Meet our farmers | Produce-aisle sign | Retired by owner, 1 attempt |
| 091 | Today's special | Chalkboard menu | Retired by owner, 1 attempt |
| 092 | Please submit each work separately | Carbon-copy form | Retired by owner, 3 attempts |
| 093 | Painting survived the camera | Portrait miniature | Retired by owner, 1 attempt |
| 094 | Smooth used to mean skill | Academic oil painting | Retired by owner, 2 attempts |
| 095 | Hand-embellished | Retail canvas print | Retired by owner, 2 attempts |

All ten works are complete after 18 attempts. Seven needed larger lettering.
Works 087 and 089 also needed extra readable text removed. Work 092 used its
third attempt to make its handwritten description illegible as requested.
No work exhausted its attempts with an unresolved failure.

The group sheet was shown and saved locally at
`research/slop/review/contact-sheet-086-095.png`. Through group eight, 50 new
works used 82 image calls. The weekly meter read **28% used** at
**2026-10-07T22:25:45.000Z**, up **20 percentage points** from the 8% baseline.

### Ninth group, 096 to 099

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 096 | My grandmother | Demonstration grid | Retired by owner, 9 unedited runs |
| 097 | A portrait of the artist | Demonstration grid | Retired by owner, 9 unedited runs |
| 098 | The most beautiful painting in the world | Demonstration grid | Retired by owner, 9 unedited runs |
| 099 | Something no one has ever seen | Demonstration grid | Retired by owner, 9 unedited runs |

All four grids are complete after 36 unchanged source calls. Every source is
preserved, including failed observations. Work 096 repeats smiling elderly
women in domestic rooms. Work 097 repeats a dark-haired painter at an easel,
with unrequested motivational lettering in all nine runs. Work 098 varies
between classical terraces and alpine lakes, always in golden light. Work
099 varies the anatomy of translucent alien creatures but repeats watery
fantasy landscapes. These are observations from sequential calls; the tool
exposes no context-reset control, so the record does not claim independent
sampling or universal model behavior.

The grids and their captions were assembled with code from whole, uncropped
sources in generation order. Each assembly record names its inputs and hashes.
The group sheet was shown and saved locally at
`research/slop/review/contact-sheet-096-099.png`. Through group nine, 54 new
works used 118 image calls. The weekly meter read **34% used** at
**2026-10-07T23:45:16.000Z**, up **26 percentage points** from baseline.

### Tenth group, 100 to 109

| Work | Phrase | Direction | Status |
|---|---|---|---|
| 100 | It is always ten past ten | Clock-shop photograph | Retired by owner, 2 attempts |
| 101 | Fill it to the top | Restaurant photograph | Retired by owner, 2 attempts |
| 102 | We count every tooth | Clinic window poster | Retired by owner, 1 attempt |
| 103 | Full set | Salon wall photograph | Complete, 2 attempts |
| 104 | Packed house | Show poster | Complete, 2 attempts |
| 105 | Move-in ready | Builder's billboard | Retired by owner, 2 attempts |
| 106 | Test rides available | Shop-window poster | Retired by owner, 1 attempt |
| 107 | Piano lessons, all ages | Window decal | Retired by owner, 2 attempts |
| 108 | Design approved by client | Tattoo-station photograph | Retired by owner, 2 attempts |
| 109 | Everything in its place | Catalog page | Complete, 1 attempt |

All ten works passed the six checks after 17 calls. Works 100, 101, 103, 107
and 108 needed larger lettering. Work 101 also needed consistent half-filled
glasses, and 103 needed unbranded bottles. Work 104 needed visible fused crowd
anatomy instead of ordinary background blur; 105 needed stairs terminating at
a blank wall and a garage without a paved approach. Every rejected attempt,
its six checks and the limited prompt revision remain in the catalogue.

The group sheet was shown and saved locally at
`research/slop/review/contact-sheet-100-109.png`. All seven groups are complete:
64 works from 135 image calls, including 36 unchanged demonstration sources.
Before the second picker review, the existing 20 retirements remained retired
and 89 works were ready for the wall, with their original numbers preserved.

After the final image, the weekly meter read **36% used** at
**2026-10-08T00:21:43.000Z**. The final review reading at
**2026-10-08T00:22:43.000Z** was also **36%**. The increase from the 8% baseline
was **28 percentage points** in the same quota window, below the owner's
stop threshold. This measures account activity, not image tokens or cost.
The completed batch was held for the owner's picker review and publication
approval before any commit, cache version change or push.

Final validation confirmed all 64 first prompts against the frozen pack,
all 135 recorded calls and reviews, all 36 original demonstration sources,
and unchanged records for works 001 to 045. The catalogue validator passed.
Browser checks passed on desktop, portrait and landscape, including image
loading, pan and zoom, stable IDs, retired-work exclusion, artwork metadata,
Index navigation and the Ledger. No script, asset or overflow errors appeared.

The owner then requested scroll zoom and another removal picker. Ordinary
scroll now zooms around the pointer; dragging pans, Shift-scroll pans, and
trackpad pinch remains available. The visible and accessible instructions
describe those controls. `slop-review-lab.html` lists all active works,
offers a filter for the new batch (046 to 109), saves selections under the
existing browser key and exports a removal list with stable work numbers.
Filtering never drops a selection. These changes were included in the local
preview for the owner's review.

### Second picker curation, October 7, 2026

The owner requested removal of these 50 works after reviewing the local picker:
**004, 012, 035, 041, 046, 047, 048, 052, 053, 054, 055, 056, 059, 060, 061,
062, 063, 064, 067, 070, 072, 073, 074, 075, 076, 077, 078, 079, 080, 081,
082, 084, 085, 086, 087, 088, 089, 090, 092, 093, 094, 095, 097, 098, 099,
100, 101, 102, 106 and 108**.

All 50 now have `generation.status: "retired"` and a dated retirement record.
The wall, Index and removal picker exclude them. Their original numbers,
images, prompts, attempts and six-check records remain in the production
history. The three retired demonstration grids keep all nine source images
each. No replacement images were requested or generated.

This leaves **39 active works**: 21 from works 001 to 045 and 18 from the new
batch. There are **70 retired works**, **109 lifetime generated work IDs** and
**190 lifetime image calls**. The group tables below the production heading
reflect these retirement decisions. Earlier generation checks remain recorded
as performed; passing those checks did not override the owner's selections.
The local preview has these removals. Catalogue and browser checks passed for
39 active works on desktop, portrait and landscape, including the picker,
Index, Ledger and scroll zoom.

### Publication approval

The owner explicitly requested "publish" at the end of this review, on
October 7, 2026 (recorded at 2026-10-08T00:46:02Z). This approves the curated
39-work gallery, the 50 new retirements, ordinary scroll zoom and the removal
picker. The catalogue and gallery script cache versions advance to 5; the
picker script advances to 2. The generated sources and production history
remain recorded, including retired works. No new image calls were needed
for curation or publication.

### Further picker curation

The owner then requested removal and publication of five more works: 071
(Limited edition), 091 (Today's special), 096 (My grandmother), 105
(Move-in ready) and 107 (Piano lessons, all ages). Their retirements were
recorded at 2026-10-08T00:52:59Z. This leaves 34 active works and 75 retired
works. All four demonstration grids are now retired; their nine-source
records remain intact. The catalogue cache version advances to 6.

### Current production rules

Read "The bar", "What the owner's removals teach", "Cut, and why" and "Judge
every result" before generating. The prompt pack discusses seven early
removals as examples; both picker decisions above remain authoritative.

Use each ordinary prompt verbatim on its first attempt. Record all six checks
after every image, before another call. On failure, change only the responsible
sentence and record why. Stop at three attempts per ordinary work. A remaining
failure gets `generation.status: "failed"`, preserving its images and reviews
while staying off the wall and Index. If **more than three works in one group**
still fail after three attempts, stop on the fourth unresolved work and show
the owner before continuing.

The weekly baseline is **8% used**, observed at **2026-10-07T18:52:46Z**, with
`resetsAt: 1792001978`. Monitor the meter during production and pause if it
rises **more than 30 percentage points**, meaning a reading above **38%** in
that same window. Record the final reading. This is account-wide activity,
including other chats. If the quota window changes, keep both observations
and leave their difference unknown rather than subtracting unrelated windows.

After each group, make its contact sheet from the actual files, with 336-pixel
artwork squares and labels outside them. Compare it beside works 025 to 034 for
the batch check and keep each group sheet for final review. Continue unless a
stopping rule applies. When all groups are done, show every contact sheet and
wait for the owner's explicit yes before **committing, changing any `?v=`
value or pushing**. Earlier publication approvals do not approve this run.

### Nine unedited observations, works 096 to 099

These four demonstrations override the usual retry rule. Run each bare prompt
exactly nine times, adding nothing. Use a fresh context if the tool supports
one; do not claim that an unavailable context-reset control was used. Keep all
nine results in generation order, including unexpected variety. They are nine
observations, not nine rerolls from which to choose a preferred picture.

| Work | Exact prompt |
|---|---|
| 096 | `A photo of my grandmother.` |
| 097 | `A portrait of an artist at work.` |
| 098 | `The most beautiful painting in the world.` |
| 099 | `Make an image of something no one has ever seen before.` |

Record all six checks after each image as observations. Failures do not justify
steering, replacing or discarding a source. Titles need not appear within these
images. Code assembles the whole images, without cropping, in a 3 by 3 grid in
reading order and adds a plain caption band containing the title.

Use `generation.kind: "demonstration-grid"`, `expectedRuns: 9` and
`sourceRuns`, with no ordinary `attemptLog` or `selectedAttempt`.
`generation.attempts` counts actual source calls from zero through nine. Every
source retains its number, exact prompt, original bytes, image paths, measured
dimensions, hash, timestamp and six-check review. Reviewed sources use
`decision: "recorded"` even when a check describes a failure.

Only a grid with nine reviewed sources and a code assembly record can become
complete. `generation.assembly` records `method: "code"`, `fit: "contain"`, three
columns and rows, the caption, `sourceRunNumbers: [1,2,3,4,5,6,7,8,9]`, and
the composition's source PNG, hash and timestamp. Preserve every source alongside the composite.
A planned grid has zero calls, an empty `sourceRuns` array and null work image
paths. The nine-source rule does not relax review or record keeping.

## Eleventh group, AI language

The owner requested a few works about conspicuously formulaic AI wording,
including emails, and directly authorized publication. These three pieces use
an email collage, a deli wrapper and a finished greeting card. The wording is
part of each object. It is satire about familiar language habits, not a claim
that these phrases identify a particular model or prove AI authorship.

| Work | Phrase | Direction | Attempts |
|---|---|---|---|
| 110 | I hope this email finds you well. | Inbox paste-up | 1 |
| 111 | It's not just a sandwich. It's an experience. | Sandwich-wrapper still life | 1 |
| 112 | Here's a more human version: | Greeting-card proof | 2 |

Phrases p206 to p208 and three new styles follow the existing catalogue without
renumbering or restoring retired work. The first two images passed all six
checks on the first attempt. Work 112's first instruction was too small at
336 pixels. Only the sentence specifying that instruction changed for its
second attempt, asking for larger type on four short lines. Both attempts,
their prompts and the failed word check remain in the production record.

The batch comparisons use retained works 001, 005, 025, 040, 045, 050, 065, 083,
103 and 109, alongside the new pieces. The final contact sheet covers 110 to
112. The three selected images passed their recorded six checks.

This run used four built-in image calls. The weekly account meter was 39% used
at 2026-10-08T00:57:15.000Z before generation, and 40% used at
2026-10-08T01:06:00.000Z after the last image and review. Both readings belong
to the same 10,080-minute window, a change of one percentage point. This is
account activity, including other chats, and cannot be converted into image
tokens or a per-image cost. The preceding production interval is preserved in
`production.accountUsageHistory`.

## Generation and records

The owner chose the OpenAI built-in image tool. Generate one work at a time,
save the returned image and record the result before starting the next one.
The tool does not expose a model selector or report its underlying image model.
Keep `generation.model` null unless the returned metadata actually names it.
General product documentation, including references to GPT Image 2, does not
identify the model used for a particular call. Do not turn that documentation
into a per-image attribution.

Artwork popups show two production facts: **Attempts** and **Generated with**.
When the model is unreported, the latter identifies OpenAI and says "model not
reported". Keep token measurements, cost limits and the detailed production
record in the Ledger.

Every work starts with `generation.status: "planned"`, zero attempts and null
image paths. A successful result gets a local image path, a recorded attempt,
an import timestamp and its measured dimensions. The planned width and height are
1024 pixels; the returned file can have different dimensions. Use the actual
file size in the finished work record. The current `works` array is the source
of truth for what has been generated.

For ordinary new work, a returned image remains under review until its six checks
are recorded. Count every generation call, including rejected attempts. Keep
the complete attempt history in `generation.attemptLog`; selecting a later
image must not erase earlier prompts, images or review failures. Planned
ordinary records have zero attempts, an empty log and null image paths. Failed
records retain their last image and all reviews. Demonstrations use the
separate source-run and assembly structure above.

Keep the full prompt with its work. Review the result for legible wording,
composition and the requested material. Update the alt text to describe what
the generated image actually shows. If a result is regenerated, count the new
attempt and retain an honest record of the earlier attempt. An error can belong
in this project; its record should still describe it accurately.

## Usage measurements

Image inference tokens and planning or coding tokens are separate measurements.
The built-in image tool does not return image input tokens, image output tokens
or a per-image price. Those fields remain null. A missing measurement means
unknown; it never means free or zero tokens.

The owner asked for the account usage meter before and after production. Record
the two observed percentages, their times and the meter's window length. Report
their difference in percentage points. The meter covers the account, including
other chats that run during the interval, so it cannot identify this gallery's
image cost or image token count.

Later production runs get their own before-and-after interval in
`production.accountUsage`. Keep earlier intervals in `accountUsageHistory` so
account activity between runs does not inflate a run's reported change.

The third-group baseline was **70% used**, observed at
**2026-10-07T15:13:00.913Z**, before its first image. After the final generation,
the reading was **78% used** at **2026-10-07T15:59:03.972Z**. The change was
**8 percentage points** within the same 10,080-minute account window. This
includes any other account activity during the interval and cannot be assigned
to individual images or converted into image tokens.

The owner-review revision starts from **98% used**, observed at
**2026-10-07T18:18:53.000Z**, before the first replacement image. After the three
new attempts, the reading was **2% used** at **2026-10-07T18:27:40.000Z**. Both
readings have a 10,080-minute window, but the meter reported a new quota window
during the run: `resetsAt` changed from `1791950199` to `1792001978`. Record both
observations and leave `deltaPercentagePoints` null. Percentages from different
quota windows cannot be subtracted to measure this run. Retain the third-group
interval in `accountUsageHistory`.

Local session records can provide a separate count of recorded planning and
coding tokens. Keep the time range, included sessions, model labels and any
coverage limits with that count. Do not add unknown image inference tokens to
it or present it as a complete measure of the images' production cost.

`production` stores the available measurements and their limits. Work-level
`generation.usage` and `generation.costUsd` stay null until a tool returns those
values. The image count and generation attempts can be counted directly from
the work records.
