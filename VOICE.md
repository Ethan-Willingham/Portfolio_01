# VOICE.md - the site voice guide

The single canonical reference for how every post on this site is **written**. Read this
before writing or editing any post prose. It is the prose sibling of `STYLE.md` (which
governs how the site looks). One calibrated voice runs every post; a reader should finish a
piece, believe it, and never once have noticed the writing.

This voice was not invented. It was calibrated with the owner in `voice-lab.html` by his
reacting to real paragraphs from the live posts, so it describes what he already approves,
not a style imposed on him.

---

## 0. The one rule

**The writing disappears.** A smart, skeptical reader finishes the post, believes it, and
never thinks about the sentences. Facts and structure carry the piece. Wordcraft never does.
If a line only works because of a clever turn of phrase, it is load-bearing word magic, and
it gets cut.

**The test:** read it aloud, flat, in a monotone. If it still informs, it passes. If it
deflates, the idea underneath was thin and the writing was propping it up. Fix the idea, not
the sentence.

---

## 1. The voice: Warm

The smart friend telling you something cool. Not an essayist performing.

- **Contractions.** The occasional "you." A little dry wit.
- **Facts first.** Define every term in line, the first time it appears. No riddle-sentences.
- **Plain words you would actually say out loud.** (Graham's rule: write like you talk.)
- **Vary sentence length on purpose.** Break a run of same-length sentences with one short
  one, or one long one. The rhythm is the music (Provost).
- **No throat-clearing.** No warm-up, no "Be honest at once." Start on the point.

---

## 2. The hard moments (decided in the voice lab)

These are the places where tone alone is not enough, and structure decides whether it lands.

- **Open with the bottom line (BLUF).** The first sentence is the single most surprising true
  fact, no runway. Earn the abstract claim with a concrete one right after. Never open on "In
  today's world," a dictionary definition, or a cold anecdote before the thesis. The opening
  is the highest-leverage sentence in the post; a skimmer decides there.
  Example: "Only one person in history has been proven to live past 120. Almost everyone else
  who has claimed it turns out to be a clerical error."

- **Deliver a shocking fact with understatement (litotes, deadpan).** Say it calm, almost
  wry. The gap between the flat tone and the awful fact makes the reader supply the reaction.
  A strong fact already carries its own horror; piling on adjectives competes with it and
  makes it *weaker*. Let the fact do the gasping.
  Example: "On paper, Japan's oldest man was doing fine. In the bedroom he was a skeleton,
  and had been for 32 years."

- **Use juxtaposition.** Put two facts side by side and say nothing. The reader connects them
  and believes the conclusion more because they reached it themselves. This is the owner's
  go-to move.
  Example: "More than five hundred Americans are on record as older than 110. Seven of them
  have a birth certificate."

Other tools, for when a single fact earns it (use sparingly, never on every line): end-stress
(put the punch word last), the telling detail (one concrete fact stands in for the whole),
parataxis (short flat clauses, no "and"), sentence-length whiplash.

---

## 3. Structure (for readers with no patience)

- **Front-load the payoff.** Sort by wow, not by chronology. Never open a post with
  weak-visual history; compress origins into a short, late, self-aware capsule.
- **One idea per paragraph,** with the point in the lead sentence.
- **Scannable.** Short sections, clear subheads, a stated read-time. Keep the post as short as
  the idea allows; cut a chapter before padding one.

---

## 4. Credibility (so it survives Hacker News)

The stated fear is hate comments on HN. The defense is restraint plus verifiable substance,
never a Silicon Valley makeover.

- **The title says exactly what the post delivers.** No overclaiming, no listicle or "you
  won't believe" framing. Set it identical across the card, `<title>`, `og:title`, and h1.
- **Source every number; link the primary source.** Assume the first commenter will check the
  methodology, the sample size, and the control.
- **Steelman, then answer.** State the strongest counterargument yourself before a commenter
  does. Pressure-test the owner's own thesis against the data, and keep the inconvenient
  corrections visible in the piece. Being right beats being reassured.
- **Lead with substance, not marketing.** Show the work, including what failed. Never
  condescend or explain the obvious.

---

## 5. Never look like an LLM: the kill-list

Check every draft against these. (The em dash is banned site-wide regardless; on its own it
is a weak tell. The cluster below is what actually gives an LLM away.)

| Tell | Instead |
|---|---|
| "It's not just X, it's Y" / "not X but Y" | say Y straight |
| reflexive rule of three ("fast, clean, simple") | keep the one specific thing |
| "In today's fast-paced world..." | start on the fact |
| "Let's dive in" / "Let's explore" | just begin |
| "It's important to note that..." | cut the hedge, say it |
| "In conclusion" / "Ultimately," | end on the last real point |
| delve, leverage, robust, seamless, pivotal, foster, tapestry, testament to | the plain word you would say |
| "Studies show" / "Experts say" | name and link the source, or cut the claim |
| bolding a key term in every line | almost none; word order carries the emphasis |
| every sentence the same length | break the pattern on purpose |
| Title Case Headings | sentence case |

---

## 6. Hard rules

- **No em dashes anywhere,** in posts or in commit messages. Use commas, periods,
  parentheses, or "to".
- **No emojis anywhere,** in posts, UI copy, commit messages, or docs, whichever assistant
  is writing (Claude, ChatGPT/Codex, all of them). The linter blocks them. Decorative
  markers get drawn in CSS or SVG, never typed as pictograph characters: bare glyphs like
  U+25B6 silently turn into color emoji on iOS and ignore the site palette.
- **Imperial units in posts** (lb, oz, inches, F). Keep the real unit where imperial would be
  wrong (supplements in grams, vitamin D in ng/mL, energy in calories). Interactive tools
  default to imperial with a metric toggle.

---

## 7. Writers to steal from (when stuck)

All plain, fact-dense, and respected by the exact skeptical crowd the owner worries about.

- **Paul Graham:** write like you talk.
- **Patrick McKenzie (patio11):** mechanism-level detail, told plainly.
- **Dan Luu:** claims backed by your own measurement, zero flourish.
- **Morgan Housel:** one idea per post, carried by a concrete story and a turn.
- **Matt Levine:** a dry subject made gripping by a plain voice and a running joke.
- **Julian Shapiro:** ruthless compression; every word earns its place.
