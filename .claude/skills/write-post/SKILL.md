---
name: write-post
description: Draft (or rewrite) a blog post for this portfolio site in the owner's calibrated voice, then self-edit it line by line against VOICE.md before showing the user. Use this whenever the user wants to write, draft, rewrite, or tighten a post, essay, field guide, or article for the site, or asks for something "in my voice" or "in the site voice." Always read VOICE.md first and always run the self-edit pass. The entire reason this skill exists is so posts stay dense and specific instead of drifting into the generic register.
---

# write-post

This skill writes posts the way the owner approves: plain, warm, concise, sourced, and
invisible. The reader should finish believing the facts and never having thought about the
sentences. The bar is not "good writing." It is writing that disappears.

The owner does not want to do wordcraft, does not want hate comments on Hacker News, and does
not want prose in the generic register, the kind that could have been written by anyone about
anything. Those three goals collapse into one method: lead with the fact, underplay it,
source it, and cut anything that only works because of a clever turn of phrase.

## Why the self-edit pass is the whole point

A draft written straight through will always pick up the symptoms of empty writing (VOICE.md
section 7). They slip in while you are thinking about content, not sentences. So the value of
this skill is not the draft. It is the **separate, deliberate editing pass** that hunts those
symptoms down afterward and rewrites them. Skipping it defeats the purpose. Treat the draft
as a rough cut and the self-edit as the real work.

## Step 0: Read the spec first

Always read these before writing a word:

- `VOICE.md` (repo root). This is the canonical voice guide and the source of truth for every
  rule below. It was calibrated with the owner, so follow it exactly, not your own instincts
  about "good writing." Start with the calibration passages in its section 2 and hold them in
  mind while drafting: they are the target, verbatim from the live site.
- `STYLE.md` (repo root) only if you are producing a full HTML page (layout, components,
  color). Posts use the field-guide idiom of the existing pages.
- If the topic has a research dossier under `research/`, read it for facts and sources. The
  owner's posts are heavily sourced; never invent a number.

## Step 1: Pin down the post before drafting

Get these straight first, asking the user only if they are genuinely unknown:

- **The one takeaway.** What does the reader believe at the end that they did not at the start?
- **The BLUF fact.** The single most surprising true fact, for the opening sentence.
- **The spine.** Three to six sections, one idea each, sorted by wow and not by chronology.
- **The facts and their sources.** Every number needs a primary source you can link. If the
  facts are not in hand and the topic needs research, gather them first (or ask the user how
  they want to source it). Being right beats being impressive.
- **The owner's thesis, and its strongest counterargument.** Plan to state the objection
  yourself and answer it. If the data contradicts the thesis, keep the correction visible.
  The owner has asked, repeatedly, to be pressure-tested rather than flattered.
- **The thing only this post can say.** A measurement run for the piece, a primary text
  actually read and quoted, a demo on the page, a mistake kept visible (VOICE.md section 5).
  If none exists yet, that is a research gap, not a writing task: gather about three times
  the concrete material the post can use before drafting.

## Step 2: Draft in the Warm voice

Write the rough cut applying VOICE.md. The shape of it:

- **Open with the bottom line.** First sentence is the surprising fact, no runway. Never open
  on "In today's world," a definition, or a warm-up anecdote.
- **Warm voice.** The smart friend telling you something cool. Contractions, the occasional
  "you," a little dry wit, facts first. Not an essayist performing.
- **Deliver shocking facts with understatement.** Say them flat and let the reader react. A
  strong fact carries its own weight; adjectives compete with it and make it weaker.
- **Use juxtaposition.** Put two facts side by side and say nothing. The reader connects them.
- **One idea per paragraph**, the point in the lead sentence. Vary sentence length on purpose.
- **Imperial units** in posts (lb, oz, inches, F), except where the real unit is metric
  (supplements in grams, vitamin D in ng/mL).

## Step 3: The self-edit pass (do this as a separate pass)

Go back through the draft line by line. This is not a proofread, it is a hunt. Run the five
passes in VOICE.md section 8, with the symptoms table (section 7) open. For each item below,
search the draft and rewrite every hit; the high-value ones:

- **Em dashes:** none, anywhere. Use commas, periods, parentheses, or "to". (The commit-time
  linter hard-blocks these, so catching them here saves a failed commit.)
- **"It's not just X, it's Y" / "not X but Y":** delete the scaffold, assert Y straight.
- **Rule of three** ("fast, clean, and simple"): keep the one specific thing.
- **"In today's fast-paced world" / cold-open throat-clearing:** start on the fact instead.
- **"Let's dive in," "It's important to note," "In conclusion," "Ultimately":** cut them.
- **Tell-tale words** (delve, leverage, robust, seamless, pivotal, foster, tapestry,
  testament to): swap for the plain word you would say out loud.
- **"Studies show" / "Experts say":** name and link the source, or cut the claim.
- **Reflexive bolding** of key terms: remove almost all of it.
- **Uniform sentence length:** break the pattern. One long, one short.
- **Title Case Headings:** sentence case.

Then three judgment passes that matter more than any single phrase:

- **The read-aloud-flat test.** Read each sentence in a monotone. If it only lands because of
  the phrasing, it is load-bearing wordcraft. Cut it or replace it with the plain fact. If a
  whole paragraph deflates when read flat, the idea under it was thin; fix the idea.
- **The generic-sentence test** (VOICE.md section 6). Could this exact sentence appear in
  someone else's essay on the topic? If yes, cut it or replace it with something only this
  post can say. A draft that keeps failing this test needs more research, not better prose.
- **The skeptic test.** Would a hostile Hacker News commenter find an unsourced number, an
  overclaimed title, or an obvious counterargument you ducked? Fix it before they do.

Rewrite freely here. A self-edit that changes only a few words did not actually happen.

## Step 4: Present it

Show the user the result, then:

- Give the read-time and one plain line on what the post does.
- If the self-edit made notable cuts, name the two or three biggest ones, so the user sees the
  voice working and can push back.
- Invite reaction. When the user corrects something ("too much," "cut that," "warmer here"),
  offer to fold the rule into `VOICE.md` so the guide sharpens with every post.

## What good looks like

Before (reads written, has tells):
> In today's fast-paced world, it's important to note that the data on extreme human aging is,
> quite frankly, a fascinating tapestry of error. Ultimately, most supercentenarians are not
> just old, they're unverifiable.

After (Warm, plain, the fact does the work):
> Most "supercentenarians" are a paperwork problem. When a US state started issuing real birth
> certificates, the number of people claiming to be 110 or older dropped by 69 to 82 percent.

Same fact. The second one disappears, and that is the goal.
