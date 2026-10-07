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

## Generation and records

The owner chose the OpenAI built-in image tool. Generate one work at a time,
save the returned image and record the result before starting the next one.
The tool does not expose a model selector or report its underlying image model.
Keep `generation.model` null unless the returned metadata actually names it.

Every work starts with `generation.status: "planned"`, zero attempts and null
image paths. A successful result gets a local image path, a recorded attempt,
an import timestamp and its measured dimensions. The planned width and height are
1024 pixels; the returned file can have different dimensions. Use the actual
file size in the finished work record. The current `works` array is the source
of truth for what has been generated.

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

Local session records can provide a separate count of recorded planning and
coding tokens. Keep the time range, included sessions, model labels and any
coverage limits with that count. Do not add unknown image inference tokens to
it or present it as a complete measure of the images' production cost.

`production` stores the available measurements and their limits. Work-level
`generation.usage` and `generation.costUsd` stay null until a tool returns those
values. The image count and generation attempts can be counted directly from
the work records.
