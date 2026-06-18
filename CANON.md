# CANON.md

The brief for the "great books, made learn-from-able" series. Every post in the
series is built in its own Claude Code window. Read this file first, then
`VOICE.md` and `STYLE.md`, then study the reference build (the Tao Te Ching
post). This file is the shared brain, so the per-book kickoff prompts can stay
short.

## What the series is

Take the most important books humans have written, the ones almost nobody reads
cover to cover, and make their load-bearing ideas genuinely learn-from-able for
someone who will never pick them up. Where a book exists in many translations,
stack the translations side by side and show where they split, the way the Tao
Te Ching post does. Where it does not, distill it.

The reader is someone curious and smart who will never read the Quran or five
hundred pages of Deutsch. The post is not a summary. It is an encounter with the
actual words, curated down to what matters and unpacked in plain language.

## The selection rule: load-bearing, not popular

The hard part of every post is choosing what goes in. The rule is: **the most
important parts, not the most popular parts.** Those overlap but are not the
same. The famous verse is often the bumper sticker. You want the keystone, the
claim the rest of the tradition leans on.

In AA, the popular line is the Serenity Prayer. The load-bearing one is
"selfishness, self-centeredness, that is the root of our troubles." That is the
kind of sentence you are hunting for in every book.

Two tools for finding it:

1. **Lean on the book's own self-summary.** Most traditions have already told
   you what is central. Hillel teaching the whole Torah standing on one foot.
   Jesus naming the greatest commandment. The Buddha: "I teach suffering and the
   end of suffering." Confucius asked for one word to live by. The Sikh Mul
   Mantar, literally the "root creed." Start there. It is the most defensible
   center, because it is the tradition's own.

2. **Follow the spine.** Every one of these books answers two questions: what is
   wrong with us or the world, and what is the way out. Organize the post on that
   diagnosis-and-prescription spine and you cannot leave the important parts out,
   because the important parts are the answers. Beautiful passages that serve
   neither question are the popular filler to cut.

## Three approaches

Not every book takes the same engine. There are three.

### A. The Translation Stack
The Tao Te Ching format. For old texts that exist in many translations and break
naturally into short units (verse, chapter, aphorism). Each unit gets: the
source line, a plain breakdown of what it is doing and where the translators
split, then the translations stacked. The breakdown is the product, the
translations are the evidence.
Use for: Dhammapada, Analects, Bhagavad Gita, Guru Granth Sahib, Hebrew Bible,
New Testament, Quran.

### B. The One-Reading Walk
For an old text where one modern translation is itself the achievement, and the
content is narrative or argument that wants a single coherent voice rather than a
chorus. Walk the text in that one reading and unpack the hard parts. Use the
stack trick from Approach A only as occasional sidebars, on the few famously
compressed lines where the renderings genuinely diverge.
Use for: Zhuangzi (Ziporyn), Nagarjuna's Mulamadhyamakakarika (Garfield).

### C. The Idea Distillation
For modern, single-author books written once in one language. There are no
competing translations to stack. The format inverts: instead of many renderings
of one source line, it is one load-bearing idea, stated plainly in the site
voice, anchored to a short quote and to where it sits in the book's argument. The
interactive element should fit the book (an argument map, not a chapter
explorer). The product is the distillation and the connective tissue.
Use for: The Beginning of Infinity (Deutsch), The Spirituality of Imperfection
(Kurtz and Ketcham).

## The books and their engines

| Book | Tradition / author | Engine |
| --- | --- | --- |
| Tao Te Ching | Taoism | A (done) |
| Dhammapada | Buddhism (Pali Canon) | A |
| The Analects | Confucius | A |
| Bhagavad Gita | Hinduism | A |
| Guru Granth Sahib | Sikhism | A |
| Hebrew Bible / Torah | Judaism | A |
| The Bible / New Testament | Christianity | A |
| The Quran | Islam | A |
| Zhuangzi | Taoism (Ziporyn translation) | B |
| Mulamadhyamakakarika | Nagarjuna (Garfield translation) | B |
| The Beginning of Infinity | David Deutsch | C |
| The Spirituality of Imperfection | Kurtz and Ketcham | C |

## Sources and licensing: everything is fair game

**Do not limit sources to the public domain.** Use the best translation or
edition for the job, regardless of copyright. The whole point of the stack is to
show the best and most interesting renderings against each other, and the best
ones are often modern and in copyright (Mitchell, Le Guin, and Hinton are already
quoted in the Tao post). The same goes for any image or edition a post needs.

The one rule that does not relax: **name every source and locate every quote.**
Every translator named, every verse or page cited. Material is reproduced for
comparison, study, and teaching, and it reads as scholarship because it is
attributed like scholarship. That attribution is the series' own defense.

## Voice, craft, and respect

- Read **VOICE.md** before writing a word, and run the **write-post** skill's
  self-edit pass before showing the owner anything. Plain, warm, fast, a smart
  friend telling you something true. No essayist throat-clearing, no LLM tells.
- Read **STYLE.md** before touching color, type, or components. One warm OKLCH
  palette on the locked dark-green background, three self-hosted fonts,
  `var(--token)` over raw hex.
- **No em dashes anywhere.** Commas, periods, parentheses, or "to." A pre-commit
  hook enforces it.
- **These are living faiths of billions.** The voice works only if it stays
  curious and respectful. Never glib, never "here is the cheat code to religion."
  Deutsch is the exception in genre, not in care: he gets a crisp, modern,
  argument-mapping treatment rather than the reverent one, and his readers are
  exacting, so be precise.
- **Name the contest, do not smooth it.** What counts as "most important" is
  disputed inside every tradition. Theravada and Mahayana are different canons.
  Catholic and Protestant Bibles differ. Advaita and dvaita read the Gita
  oppositely. Surface the disagreement rather than fake a neutral center. It is
  more honest and more interesting.

## Build order

The order proves each engine before scaling it. Learning only flows within an
engine, not across, so the three pilots are independent and can run in parallel.

1. **Pilots (one per engine):** Dhammapada (A), Zhuangzi (B), The Beginning of
   Infinity (C).
2. **Regroup,** fold what the pilots taught back into this file.
3. **Followers, batched within each engine:** Analects, Gita, then the curated
   libraries. The three Abrahamic texts go foundation-first: Hebrew Bible, then
   New Testament, then Quran. Nagarjuna follows Zhuangzi.
4. **Capstone, last:** The Spirituality of Imperfection, which is itself a
   synthesis of these traditions and ties the series together.

## The per-book workflow

1. Read this file, `VOICE.md`, `STYLE.md`. Study `tao-te-ching.html` and
   `js/tao-data.js`, `js/tao-notes.js`, `js/tao.js` as the reference build.
2. Run the **deep-research** skill on the book. Drop a dossier in
   `research/<book>/`. Find the keystones by the selection rule, the best
   translations or editions, and the contested points. Adversarially fact-check,
   these texts have experts and adherents in the audience.
3. Build the post on the assigned engine, in the site shell, reusing the Tao
   post's structure and the component kit.
4. Add the homepage card (follow the Tao card in `index.html`), the og:image
   block, and a thumbnail. **The thumbnail must be a real sourced image** (a
   relevant painting, photograph, or artwork, any license, named), never
   generative or procedural, the way the Tao card uses Zhang Lu's painting of
   Laozi. Source it during research and note where it came from.
5. Self-edit against `VOICE.md` line by line.
6. Commit and push to `main` with explicit paths (`git add <files>`, never `-A`,
   this is a shared checkout).

## Reference implementation

`tao-te-ching.html` is the built example of Approach A. The data lives in two
files:

- `js/tao-data.js`: the translations, verbatim, one entry per chapter per
  translator.
- `js/tao-notes.js`: the breakdowns, shape
  `n: { title, gist, splits:[{zh, gloss, note}], read }`. Chapters without an
  entry render the translations alone, so you write breakdowns only for the
  keystones.
- `js/tao.js`: the explorer (chapter nav, the Key / Complete / All view toggle,
  the grid index).

Clone that architecture per book: a `<book>.html` shell, `js/<book>-data.js`,
`js/<book>-notes.js`, reusing the `js/tao.js` patterns.
