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
letters are made. The first 24 prompts range from 132 to 143 words.

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

| Work | Phrase | Direction | Attempts |
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
users or clients, martyr staging, stock AI imagery, finger and anatomy gags,
garbled-text gags, familiar-painting references used as a joke, and protest or
rhyming slogans. Keep real names, brands, logos, recognizable people and living
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
what changed and why, then regenerate. Stop at three attempts per work and
record a remaining failure honestly. Retain every attempt's prompt, image,
source hash, timestamp, six-check review and decision, including rejected
attempts. Keep `originalPrompt` and identify the chosen `selectedAttempt`.
The work's current `prompt` must match its selected image.

### Owner review before publication

The owner reviewed the contact sheet and approved publication of all 45 works
on October 7, 2026, together with the homepage thumbnail size fix. Passing the
six checks alone did not authorize publication. Final attempt counts and
individual review notes are recorded in the work records.

The owner requested a contact sheet of 025 to 044. Produce that exact range,
then also show 025 to 045 so the added food-court work is included in the
approval view. Use the actual image files, with 336-pixel squares and labels
outside the art. `tools/slop-contact-sheet.cjs --end 044` and `--end 045` make
the sheets; `--single 035` makes a 336-pixel word-check preview. While a title
has not entered the catalogue, supply `--prompts` with the prompt pack path
or `--title` for a single work.

The owner's explicit yes was received before committing, changing the `?v=`
values or pushing changes from this run.

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

For the third group, a returned image remains under review until its six checks
are recorded. Count every generation call, including rejected attempts. Keep
the complete attempt history in `generation.attemptLog`; selecting a later
image must not erase earlier prompts, images or review failures.

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

Local session records can provide a separate count of recorded planning and
coding tokens. Keep the time range, included sessions, model labels and any
coverage limits with that count. Do not add unknown image inference tokens to
it or present it as a complete measure of the images' production cost.

`production` stores the available measurements and their limits. Work-level
`generation.usage` and `generation.costUsd` stay null until a tool returns those
values. The image count and generation attempts can be counted directly from
the work records.
