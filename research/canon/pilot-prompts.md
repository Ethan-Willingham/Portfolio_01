# Pilot kickoff prompts for the CANON series

Paste one of these into a fresh Claude Code window to start that book's post.
Each is self-contained. The heavy shared context lives in CANON.md, which the
prompt tells the window to read first. See CANON.md for the full plan.

---

## Pilot 1 of 3: Dhammapada (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series on this site. This one is the Dhammapada, the verse heart of the Buddhist Pali Canon. It uses Approach A, the Translation Stack, the same engine as the Tao Te Ching post.

Start by reading CANON.md (the series brief), then VOICE.md and STYLE.md, then study the reference build: tao-te-ching.html with js/tao-data.js, js/tao-notes.js, js/tao.js. The Dhammapada post should clone that architecture: a dhammapada.html shell, js/dhammapada-data.js (the translations, verbatim), js/dhammapada-notes.js (the breakdowns), reusing the js/tao.js explorer patterns.

Before building, run the deep-research skill and drop a dossier in research/dhammapada/.

The text: 423 verses in 26 chapters (vaggas), the Buddha's teaching in verse, in Pali. Use Romanized Pali as the "source" slot the way the Tao post uses Chinese, with transliteration and gloss.

The spine (diagnosis and prescription): suffering comes from the untrained mind and from craving, hatred, and delusion; the cure is to train the mind, live ethically, and cool the craving. "Mind precedes all things."

Keystone verses to anchor the breakdowns on (verify and expand in research):
- v1-2, the Twin Verses: "Mind precedes all mental states," the whole psychology in two lines.
- v5: "Hatred is never appeased by hatred, by love alone," the ethical keystone.
- v183: "Not to do evil, to cultivate good, to purify the mind: this is the teaching of the Buddhas," the tradition's own self-summary.
- v153-154, the house-builder verses, said to be the Buddha's words at awakening.
- v277-279, the three marks: all conditioned things are impermanent (anicca), are suffering (dukkha), all things are not-self (anatta).
- v103: "He who conquers himself is the greater victor."
- v21: "Heedfulness is the path to the deathless" (appamada).

Translation splits worth showing (the Pali equivalents of the Tao's dao and wu wei): dukkha ("suffering" vs "unsatisfactoriness" vs Thanissaro's "stress"), anatta ("not-self" vs "no-self"), dhamma, sankhara, nibbana.

Translations to stack (all sources are fair game, name every one): Max Muller (1881), Acharya Buddharakkhita, Thanissaro Bhikkhu, Gil Fronsdal, Eknath Easwaran, Juan Mascaro, Glenn Wallis, Daw Mya Tin, Ananda Maitreya, and others you find. Thanissaro and Buddharakkhita are freely redistributable via Access to Insight.

Frame: the accessible heart of the older (Theravada) canon. Note where Mahayana would diverge, but anchor on the Pali Dhammapada. Use the Key / Complete / All view toggle like the Tao post; not every verse needs a breakdown, only the keystones.

When it is built and self-edited against VOICE.md, add the homepage card and og:image (the thumbnail must be a real sourced image, named, like the Tao card's Zhang Lu painting of Laozi, never generative), then commit and push to main with explicit paths.

---

## Pilot 2 of 3: Zhuangzi (Approach B, One-Reading Walk)

You're building a post for my "great books, made learn-from-able" series. This one is the Zhuangzi, the second great Taoist book after the Tao Te Ching, in Brook Ziporyn's translation. It uses Approach B, the One-Reading Walk.

Read CANON.md first, then VOICE.md and STYLE.md, then study the reference build (tao-te-ching.html and js/tao-data.js, js/tao-notes.js, js/tao.js) so you can reuse the site shell and the breakdown idiom. Approach B is different from the Tao post: instead of stacking a chorus of translations for every line, you walk the text in Ziporyn's voice and unpack it, using the multi-translation stack only as occasional sidebars on the few famously compressed lines.

Before building, run the deep-research skill and drop a dossier in research/zhuangzi/.

The text: third century BCE, attributed to Zhuang Zhou. Wild, funny, paradoxical stories. The Inner Chapters (1-7) are the core; walk those, plus the best of the Outer and Miscellaneous chapters. Ziporyn (Hackett, 2009 Essential Writings and the 2020 complete) is the spine because his rendering of the playful voice is the achievement, so feature it.

The spine (diagnosis and prescription): we are imprisoned by fixed perspectives, rigid categories, the cult of usefulness, the fear of death, and the exhausting deliberate self; the way out is free and easy wandering, treating all perspectives as equal, spontaneity and flow, going along with transformation, and emptying the self.

Keystone passages (these are both the famous and the load-bearing ones):
- The opening: Kun the fish becoming Peng the giant bird, and the little quail who laughs at it. Scale and perspective. (Ch 1)
- The useless tree and the giant gourd, "the usefulness of the useless." (Ch 1, 4)
- The butterfly dream. (end of Ch 2)
- The equality of all perspectives, the "axis of the Way." (Ch 2, qi wu lun)
- Cook Ding carving the ox, the blade that never dulls. The flagship flow story. (Ch 3)
- The fasting of the mind, and sitting in forgetfulness. (Ch 4, 6)
- The happiness of the fish on the bridge over the Hao. (Ch 17)
- Zhuangzi drumming on a pot at his wife's death, and his own death. Equanimity toward transformation.
- Emperor Hundun (chaos) drilled with seven holes, and dying. (end of Ch 7)

For the hybrid sidebars, stack Ziporyn against Burton Watson, A.C. Graham, James Legge, Herbert Giles, Victor Mair, and Thomas Merton on the most compressed lines (the butterfly dream's last sentence, "you're not a fish," Cook Ding's "I go by the spirit"). All sources fair game, name each.

Note the authorship layering (Inner vs Outer vs Miscellaneous chapters) the way CANON.md says to name the contest. Play with the contrast to the Tao Te Ching: if the Tao is the gnomic manual, the Zhuangzi is the laughter.

When built and self-edited against VOICE.md, add the homepage card and og:image (the thumbnail must be a real sourced image, named, like the Tao card's Zhang Lu painting of Laozi, never generative), commit and push to main with explicit paths.

---

## Pilot 3 of 3: The Beginning of Infinity (Approach C, Idea Distillation)

You're building a post for my "great books, made learn-from-able" series. This one is David Deutsch's The Beginning of Infinity (2011). It uses Approach C, the Idea Distillation. It is the genre outlier in the series: secular epistemology and optimism, not a wisdom tradition, so it gets a crisp, modern, argument-mapping treatment, not the reverent scripture look.

Read CANON.md first, then VOICE.md and STYLE.md. Study tao-te-ching.html only for the site shell and component kit; the engine here is different. There are no competing translations to stack (Deutsch wrote it once, in English). So the format inverts: each load-bearing idea is stated plainly in my voice, anchored to a short quote with its page or chapter, and placed in the book's argument. The interactive element should be an argument map (claim, why it holds, what follows), not a chapter explorer. Build whatever shell fits, reusing the palette, fonts, and kit.

Before building, run the deep-research skill and drop a dossier in research/beginning-of-infinity/. Be exact: Deutsch is alive and his readers (the Hacker News and rationalist crowd) are exacting. Get the epistemology right, do not conflate his Popperian conjecture-and-criticism view with Bayesianism, which he opposes. Adversarially fact-check.

The job: make someone who will never read five hundred pages actually grasp the four or five ideas that matter.

The load-bearing ideas (verify and expand):
- Good explanations are "hard to vary" while still accounting for what they explain. His central, original criterion. The keystone.
- The reach of explanations: good explanatory knowledge is universal, it travels far beyond the problem it was built for.
- Fallibilism: there are no authoritative sources of knowledge and no certainty; knowledge grows by conjecture and criticism (Popper). Error-correction is everything.
- "Problems are inevitable. Problems are soluble." Every problem not forbidden by the laws of nature is soluble given the right knowledge.
- The principle of optimism: all evils are caused by insufficient knowledge. Optimism is a stance, not a mood.
- The jump to universality: alphabets, number systems, DNA, computers, systems that cross a threshold into unlimited reach. People as universal explainers, "the beginning of infinity."
- The critique of empiricism and inductivism: theories are not derived from observation, they are conjectured and tested.
- Against "Spaceship Earth" and the principle of mediocrity: people are significant; knowledge, not the biosphere, is what sustains us.

Use Deutsch's own chapter-end "Summary," "Terminology," and "Meanings of 'the beginning of infinity'" sections as scaffolding; they are his own self-distillations. All quotation is fair game, just locate every quote by page or chapter.

Match his energy: combative, precise, allergic to vagueness. When built and self-edited against VOICE.md, add the homepage card and og:image (the thumbnail must be a real sourced image, named, like the Tao card's Zhang Lu painting of Laozi, never generative), commit and push to main with explicit paths.
