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

## What the first posts taught us (read before you build)

The pilots surfaced four failure modes. Do not repeat them.

1. **Voice is the bar, and it is where the first post failed.** The Beginning of
   Infinity post came out formal, educational, and high-flown, the exact opposite
   of `VOICE.md`. Pointing a window at the doc was not enough. So: write the prose
   with the **write-post** skill (it forces a line-by-line `VOICE.md` edit), then
   apply the monotone test from `VOICE.md` section 0, read every paragraph aloud
   and flat, and if it sounds like a textbook or a lecture, rewrite it in words you
   would actually say to a friend. Hunt down and kill formal construction:
   nominalizations ("the cultivation of"), passive voice, "one must," "it is
   important to," "serves to," throat-clearing, and every tell in `VOICE.md`
   section 5. Plain, warm, spoken. The writing disappears.

2. **Open concrete, never abstract.** The first post's opener was hard to follow
   because it led with the abstract idea. The fix that worked was an everyday
   analogy. Open on a concrete image or an example the reader already knows, then
   name the idea (`VOICE.md`: earn the abstract claim with a concrete one right
   after). If a smart friend would not get your first paragraph on one read, it is
   not done.

3. **Source the best copies yourself, autonomously.** All sources are fair game
   (see below), and the best translations are often copyrighted and not sitting in
   one tidy place. Go get them: spawn your own parallel research sub-agents, fetch
   and parse the editions, build the corpus. Do NOT stop and ask the owner to open
   another chat or track copies down. That hunt is the job, not a question to
   escalate.

4. **Match the site gutter on mobile.** The first posts read with a wide side
   gutter on phones; the site uses 20px. The token `--gutter` is responsive (20px
   phone, 32px tablet, 40px desktop); use `var(--gutter)` and never hardcode a
   horizontal padding. Before shipping, view the post at 375px width and confirm
   the side gutter is 20px, not 40px. Mandatory check.

5. **Homepage card description: two short sentences, not a tease, not an essay.**
   Aim for about 25 to 30 words: a hook, plus one concrete, specific detail that
   earns the click. The first pass overcorrected to ~15 words (clipped, like "here
   is Aristotle's answer"), and the original cards ran 50 to 105 (a full summary).
   Land between. Example: "Everyone wants to be happy and mostly chases the wrong
   things, money, status, pleasure. Here is Aristotle's answer, that happiness is a
   whole life of good habits, walked stop by stop." (~30 words.)

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

## Four approaches

Not every path takes the same engine. There are four.

### A. The Translation Stack
The Tao Te Ching format. For old texts that exist in many translations and break
naturally into short units (verse, chapter, aphorism). Each unit gets one short
title, one plain-English distillation, then the translations stacked. The
distillation is the product and the stack is the evidence. Let the different
renderings show their disagreement instead of turning the opening into a report
about translators.
Use for: Dhammapada, Analects, Bhagavad Gita, Guru Granth Sahib, Hebrew Bible,
New Testament, Quran.

**The finished Tao reference, locked 2026-07-19.** Study the live page and its
three scripts before carrying this format to another book.

- Open with one continuous, book-level explanation in plain English. It tells a
  new reader what the whole book is doing before the interactive reader begins.
- The reader's sticky capsule holds previous, chapter title, next, and the live
  translation count. Clicking the title opens the complete numbered chapter
  grid. Arrow keys move between chapters and the URL hash preserves the current
  one.
- Every chapter has a `title` and `plain` entry in the separate notes file. The
  title feeds the capsule. The plain text appears under one quiet `In plain
  English` label, with no box, sub-sections, source-language block, or translator
  commentary. A fallback may protect against a load failure, but no shipped
  chapter is intentionally left unfinished.
- The translations follow in three tiers: the famous ones first, then the
  lesser-known complete translations, then partial renderings. Keep chronology
  inside each tier and show its count. The reader should meet the versions people
  actually own before the archival long tail.
- The Tao page deliberately removed its Chinese block. A source-language block
  that the target reader cannot evaluate adds ceremony, not understanding. Keep
  one only when the next book and its audience make it genuinely useful.
- The visual anatomy is two sections: book-level summary, then reader. Preserve
  the centered series shell, floating capsule, unboxed commentary, framed
  hairlines, 20-pixel mobile gutter, and centered endcap and footer.

**The Analects transfer, completed 2026-07-19.** This is the scale test for the
finished Tao format: 503 short passages grouped inside 20 books, rather than 81
flat chapters.

- "Complete" means every received passage, not only the famous sayings. Every
  `B.C` reference has its own `title` and `plain` entry. The former keystone-only
  state, dots, filters, and empty breakdown message are gone.
- Preserve the book grouping in the chapter grid and the `#B.C` URL hash. The
  capsule still presents one continuous previous and next sequence across all
  503 passages.
- The received Chinese stays here because this post already promises the source,
  the units are short enough to keep it quiet, and the translation differences
  often turn on a compact repeated term. It sits after the plain-English opening
  and before the English stack, without a box or source-language commentary.
- For this corpus the tier order is the well-known editions (Legge, Waley, Lau,
  Ames and Rosemont, Slingerland), the other complete aligned edition (Muller),
  then the partial Eno comparisons. Missing copyrighted passages remain missing;
  no translation is invented to make a row look complete.
- The plain-English openings name the hard material as plainly as the humane
  material. In particular, 13.18 keeps filial concealment, 17.25 identifies its
  contempt for women and servants, and the book-level opening says directly that
  the text is hierarchical and not a modern liberal ethic.

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

### D. The Practice Mapped
For a path you do rather than read (a meditation, a technique, a movement). It
has no canonical text to stack or walk, so the post maps the practice itself:
what it is, where it came from, what it claims, how you actually do the core of
it, and what the evidence really shows, with proven benefit separated from hype.
The commercial and cult end of this world goes in as labeled case studies, never
endorsements.
Use for: the Meditation post (the Engine D pilot, with TM folded in), the
entheogen traditions, the cult and commercial case studies.

## The map: every major path

The series covers the great paths humans have used to answer what is real, how to
live, and what matters. Texts and practices both. Each entry shows its engine
(A/B/C/D) and status: **live** (built), **queued** (prompt written), or **add**
(planned). Stars mark the essentials, the dozen that touch every pillar at least
once. Some paths consolidate into one post (the social contract; meditation,
which folds in TM and every technique); the modern teachers and the chemical-path
books each get their own post.

**1. Indian / Dharmic**
- ★ Bhagavad Gita and the Upanishads (A) [live]
- ★ Dhammapada (A) [live]
- Nagarjuna, Mulamadhyamakakarika (B) [live]
- Patanjali, Yoga Sutras (A) [add], the meditation manual, pairs with the meditation post
- Guru Granth Sahib, Sikhism (A) [live]
- Jainism, the Tattvartha Sutra (A) [add]

**2. Chinese**
- ★ Tao Te Ching (A) [live]
- Zhuangzi, Ziporyn (B) [live]
- ★ The Analects, Confucius (A) [live]
- Mencius, human nature is good (A) [add]

**3. Abrahamic and the monotheist root**
- ★ Hebrew Bible / Torah (A) [live]
- ★ New Testament (A) [live]
- ★ The Quran (A) [live]
- Zoroastrianism, the Gathas (A) [add], the lost root of the other three
- Rumi, the Masnavi (A) [add], the ecstatic Sufi heart of Islam, the Barks-versus-Nicholson translation war

**4. Classical Western philosophy**
- ★ Plato, the death of Socrates and the cave (B) [add]
- ★ Aristotle, Nicomachean Ethics (B) [add]
- Marcus Aurelius, Meditations (A) [add]
- Epictetus, Enchiridion (A) [add]
- Lucretius, On the Nature of Things (B) [add]

**5. Modern Western philosophy**
- ★ Nietzsche, Beyond Good and Evil and the Genealogy (B) [add], the resident dissenter
- Kant, the categorical imperative (B) [add]
- Camus, The Myth of Sisyphus, with Kierkegaard (B) [add]
- Hume and Descartes (B) [add]

**6. Political and social philosophy**
- ★ The Social Contract: Hobbes, Locke, Rousseau, one comparative post (A) [add]
- Mill, On Liberty (B) [add]
- Marx, The Communist Manifesto (B) [add]
- Adam Smith (C) [add]

**7. The scientific worldview**
- The Beginning of Infinity, Deutsch (C) [live, needs the voice fix]
- ★ Darwin, On the Origin of Species (B) [add]
- Popper, Conjectures and Refutations (C) [add]
- Euclid, the Elements (B) [add]

**8. Literature as wisdom**
- ★ Dostoevsky, the Grand Inquisitor from Brothers Karamazov (B) [add]
- The Epic of Gilgamesh (B) [add]
- Dante, the Divine Comedy (B) [add]
- Homer, the Odyssey (B) [add]

**9. Psychology and the inner life**
- ★ The Spirituality of Imperfection, Kurtz (C) [live], the capstone
- Viktor Frankl, Man's Search for Meaning (C) [add]
- William James, The Varieties of Religious Experience (C) [add]
- Carl Jung, the shadow and individuation (C) [add]
- Augustine, Confessions (B) [add], the first autobiography and the divided will
- Montaigne, Essays (B) [add], the man who invented the essay to examine himself

**10. The contemplative and experiential paths**
- ★★ Meditation, all kinds: the truth of the benefits and how to get them (D) [add]. The Engine D pilot. Surveys TM, vipassana and insight, mindfulness and MBSR, zazen, mantra, breathwork and pranayama, loving-kindness, body-scan, Christian contemplative prayer, Sufi dhikr, Tibetan tonglen. Separates proven benefit from hype, then teaches the core of how to get it. TM lives inside this post.
- Aldous Huxley, The Perennial Philosophy (C) [add], the master key, all mystics say one thing
- Krishnamurti, truth is a pathless land (C) [add]
- Alan Watts, the bridge west (C) [add]
- Ram Dass, Be Here Now (C) [add]
- Eckhart Tolle, The Power of Now (C) [add]
- Gurdjieff and the Fourth Way, Ouspensky (C) [add]
- Aldous Huxley, The Doors of Perception (C) [add]
- Michael Pollan, How to Change Your Mind (C) [add]
- The entheogen traditions: peyote and the Native American Church, ayahuasca (D) [add]
- Wisdom without metaphysics: Harris, Batchelor, Wright (C) [add]

**11. The edge, as labeled case studies**
- Movements that became businesses or cages: Scientology, est and Landmark, A Course in Miracles, Theosophy and the New Age (D, case study) [add]

**12. The honest blind spot**
- The wisdom never written down: oral and indigenous traditions, Native American, African, Aboriginal (B, essay) [add]

**13. Strategy and power** (the amoral art of winning, distinct from ethics)
- ★ Sun Tzu, The Art of War (A) [add], short and aphoristic, a dozen translations diverge
- Machiavelli, The Prince (B) [add], power without the moralizing
- Musashi, The Book of Five Rings (B) [add], the swordsman's strategy
- Han Feizi, Chinese Legalism (A) [add], the dark twin of Confucius that unified China
- Robert Greene, The 48 Laws of Power (C) [add], the modern cynical version, doubles as a case study

**14. The human story (big history)**
- Yuval Noah Harari, Sapiens (C) [add], treated skeptically, its overreach is the post
- Jared Diamond, Guns, Germs, and Steel (C) [add], geography as destiny

**15. Beauty and art (aesthetics)**
- ★ Aristotle, Poetics (B) [add], why stories move us, catharsis
- Tanizaki, In Praise of Shadows, with Okakura's The Book of Tea (C) [add], wabi-sabi, beauty in imperfection
- Burke and Kant on the sublime and the beautiful (B) [add]
- John Berger, Ways of Seeing (C) [add], how we look at what we look at

**16. Love and eros**
- ★ Plato, the Symposium (B) [add], the ladder of love and Aristophanes' split humans
- The Song of Songs (A) [add], the erotic poetry hidden inside the Hebrew Bible
- The Kama Sutra (A) [add], desire and the art of living, far more than the cliche
- Barthes, A Lover's Discourse, or bell hooks, All About Love (C) [add], the modern read

### Scope and the gate

Serious paths go in as paths. Movements that became businesses or cults go in as
clearly-labeled case studies (how a path becomes a business, or a cage), never as
endorsed wisdom. That line keeps the series credible instead of credulous. Oral
and indigenous traditions cannot get a fair text post, so name that limit in one
honest essay rather than pretending the map is complete.

About sixty-five paths across sixteen pillars. A multi-year map, not a sprint.
Build in the priority batches below; the starred essentials are front-loaded and
touch every pillar at least once.

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

## Build order: the batches

Five batches, ordered by importance, objective weight in human history, not
personal taste. Each batch spans many pillars, so the series is broad at every
stopping point, and all sixteen pillars are covered by the end of Batch 3. The
scripture core and the capstone already shipped (see the map). Write each batch's
prompts just before it runs.

**Batch 1, the foundations of civilization (the most important, period).** Plato
(the death of Socrates and the cave), Aristotle's Nicomachean Ethics, Darwin's
Origin of Species, the Social Contract (Hobbes, Locke, Rousseau), Marx, Mill's On
Liberty, Nietzsche, Marcus Aurelius, Homer's Odyssey, Sun Tzu's Art of War, the
Meditation flagship (the Engine D pilot), and Frankl.

**Batch 2.** William James, Kant, Lucretius, Epictetus, Machiavelli, Augustine,
Mencius, Euclid, Aristotle's Poetics (opens beauty), Plato's Symposium (opens
love), Sapiens (opens the human story), Huxley's Perennial Philosophy.

**Batch 3.** The cult and commercial case studies (opens the edge), the oral and
indigenous essay (opens that blind spot), Dostoevsky's Grand Inquisitor,
Gilgamesh, Dante, Camus with Kierkegaard, Hume with Descartes, Han Feizi,
Patanjali's Yoga Sutras, Krishnamurti. All sixteen pillars are now covered.

**Batch 4, the contemplative and experiential world.** Alan Watts, Ram Dass,
Eckhart Tolle, Gurdjieff, Huxley's Doors of Perception, Pollan, the entheogen
traditions, secular Buddhism (Harris, Batchelor, Wright), In Praise of Shadows
with The Book of Tea, Burke and Kant on the sublime, Berger's Ways of Seeing.

**Batch 5, the remainder.** The Song of Songs, the Kama Sutra, Barthes or bell
hooks on love, Guns Germs and Steel, the Zoroastrian Gathas, Rumi, Jainism, Adam
Smith, Popper, Montaigne, Jung, Musashi, and the 48 Laws of Power.

## The per-book workflow

1. Read this file, `VOICE.md`, `STYLE.md`. Study `tao-te-ching.html` and
   `js/tao-data.js`, `js/tao-notes.js`, `js/tao.js` as the reference build.
2. Run the **deep-research** skill on the book. Drop a dossier in
   `research/<book>/`. Find the keystones by the selection rule, the best
   translations or editions, and the contested points. Adversarially fact-check,
   these texts have experts and adherents in the audience. Source the best
   translations yourself, including copyrighted ones, spawning parallel sub-agents
   to hunt them down and parse them. Never ask the owner to fetch copies.
3. Build the post on the assigned engine, in the site shell, reusing the Tao
   post's structure and the component kit.
4. Add the homepage card (follow the Tao card in `index.html`), the og:image
   block, and a thumbnail. **The thumbnail must be a real sourced image** (a
   relevant painting, photograph, or artwork, any license, named), never
   generative or procedural, the way the Tao card uses Zhang Lu's painting of
   Laozi. Source it during research and note where it came from. Then view the
   post at 375px width and confirm the side gutter is the site's 20px
   (`var(--gutter)`, never hardcoded).
5. Write the prose with the **write-post** skill and self-edit against `VOICE.md`
   line by line, including the monotone read-aloud test. Voice is the bar (see the
   pilot lessons up top); the first post failed here, so this is not optional.
6. Commit and push to `main` with explicit paths (`git add <files>`, never `-A`,
   this is a shared checkout).

## Reference implementation

`tao-te-ching.html` is the flat-chapter example of Approach A;
`analects.html` is the grouped large-corpus example. Each book uses three scripts:

- `js/<book>-data.js`: the translations verbatim, one entry per unit per
  translator, plus source text when the page genuinely needs it.
- `js/<book>-notes.js`: every shipped unit, shape
  `unit: { title, plain }`. `plain` is a summary, never an unlabeled translation.
- `js/<book>.js`: the explorer, with previous and next navigation, complete grid,
  URL hash, live count, and translations tiered famous, complete, partial.

Clone that architecture per book: a `<book>.html` shell, `js/<book>-data.js`,
`js/<book>-notes.js`, reusing the `js/tao.js` patterns.
