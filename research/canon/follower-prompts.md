# Follower kickoff prompts for the CANON series

Paste one into a fresh Claude Code window. Each is self-contained; the shared
rules live in CANON.md, which every prompt tells the window to read first. The
three lessons that actually went wrong in the pilots (voice, autonomous sourcing,
mobile gutter) are restated in each prompt on purpose. Order and engine map are
in CANON.md. You already have the Zhuangzi pilot prompt; it still stands and will
inherit the CANON.md voice fixes.

---

## The Analects (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is The Analects of Confucius. Approach A, the Translation Stack, the same engine as the Tao Te Ching post.

VOICE IS THE BAR. The first post in this series (Deutsch) shipped too formal and educational and had to be fixed; do not repeat that. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, then study tao-te-ching.html with js/tao-data.js, js/tao-notes.js, js/tao.js. Write the prose with the write-post skill and run its monotone read-aloud test. Plain, warm, spoken, a smart friend telling you something true. Open concrete (an everyday example), never on an abstract claim.

Clone the Tao architecture: analects.html, js/analects-data.js, js/analects-notes.js, reusing the js/tao.js patterns. Run the deep-research skill and drop a dossier in research/analects/. Source the best translations yourself (including copyrighted ones), spawning parallel sub-agents to track them down; do not ask me to fetch copies.

The spine (diagnosis and prescription): a society falls apart when people abandon virtue and their roles; the repair is self-cultivation that ripples outward, from the person to the family to the state.

Keystones (verify and expand):
- 15.24, the self-summary: asked for one word to practice for life, "Reciprocity (shu). Do not impose on others what you do not desire." The negative golden rule.
- 2.4, the arc of a life: "At fifteen I set my heart on learning... at seventy I could follow my heart's desire without overstepping."
- 2.3, govern by virtue and ritual, not law and punishment.
- 12.1, ren as self-mastery and returning to ritual.
- 2.15, "Learning without thought is labor lost; thought without learning is perilous."
- 4.8, "If a man hears the Way in the morning, he may die content in the evening."
- 13.3, the rectification of names.
- 1.2, filial piety as the root of humaneness.

The load-bearing untranslatables to stack (the Analects' dao and wu wei): ren (benevolence / humaneness / goodness / authoritative conduct), junzi (gentleman / exemplary person / superior man), li (ritual / rites / propriety), de (virtue / moral force), tian (heaven). Classical Chinese source line with gloss.

Translations to stack (all fair game, name every one): James Legge, Arthur Waley, D.C. Lau, Ezra Pound, Simon Leys, Edward Slingerland, Ames and Rosemont, Burton Watson, Annping Chin. Frame: more philosophical than religious; the Analects is fragments compiled by disciples, not a treatise, say so; Confucius calls himself a transmitter not an inventor (7.1).

When built and self-edited against VOICE.md, add the homepage card, og:image, and a real sourced thumbnail (named, never generative). Verify at 375px that the gutter is 20px. Commit and push to main with explicit paths.

---

## Bhagavad Gita (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is the Bhagavad Gita, the heart of Hindu scripture. Approach A, the Translation Stack.

VOICE IS THE BAR. The first post (Deutsch) shipped too formal and had to be fixed; do not repeat that. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, then study tao-te-ching.html and js/tao*.js. Write the prose with the write-post skill and run the monotone test. Plain, warm, spoken. Open concrete, never abstract.

Clone the Tao architecture: gita.html, js/gita-data.js, js/gita-notes.js. Run the deep-research skill, dossier in research/gita/. Source the best translations yourself, including copyrighted ones, via parallel sub-agents; do not ask me to fetch copies.

The setup is a story: Arjuna freezes on the battlefield, unwilling to fight a war that will kill his own kin, and Krishna talks him through how to act in a world of duty and loss. That dialogue is the whole book. The spine (diagnosis and prescription): we are bound by attachment to the results of our actions and by ignorance of the deathless Self; the way out is to act without grasping at outcomes (karma yoga), to love and surrender (bhakti), and to know the Self (jnana).

Keystones (verify and expand):
- 2.47, the self-summary: "You have a right to your actions, but never to the fruits of your actions." Karma yoga, the load-bearing line.
- 2.20 and 2.22, the deathless Self: "as a man casts off worn-out clothes and takes new ones, so the Self casts off worn-out bodies." The teaching that dissolves Arjuna's grief.
- 3.35 / 18.47, svadharma: "better to do your own duty imperfectly than another's well."
- 4.7-8, the avatar doctrine: "Whenever dharma declines, I manifest to restore it."
- Chapter 11, the theophany: Krishna's cosmic form, "I am become Death, the shatterer of worlds" (11.32).
- 18.66, the final refuge verse: "Abandon all dharmas and take refuge in me alone."

Weave in the Upanishadic backdrop the Gita popularizes: the great sayings (mahavakyas) Tat tvam asi ("That thou art") and Aham Brahmasmi ("I am Brahman").

Untranslatables to stack: dharma (duty / law / righteousness / the way things are), yoga (discipline / union / path), atman (Self / soul), karma (action), guna (the three qualities), Brahman. Sanskrit source line (Devanagari + transliteration).

Translations (all fair game, name each): Edwin Arnold (The Song Celestial), Kashinath Telang, Annie Besant, Prabhavananda and Isherwood, Eknath Easwaran, Barbara Stoler Miller, Stephen Mitchell, Winthrop Sargeant, Graham Schweig, Laurie Patton.

Name the sectarian contest (CANON.md says to): Advaita (Shankara, non-dual), Vishishtadvaita (Ramanuja, devotion), and Dvaita (Madhva, dualism) read the same verses oppositely. Situate the Gita as a 700-verse episode inside the Mahabharata. The war framing needs care: Gandhi read it as the inner battle, others literally; present the range.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## Guru Granth Sahib (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is the Guru Granth Sahib, the scripture of Sikhism. Approach A, but it is a big text, so curate keystones rather than running the whole thing.

VOICE IS THE BAR. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, then study tao-te-ching.html and js/tao*.js. write-post skill, monotone test, plain warm spoken voice, concrete opener.

Clone the Tao architecture: guru-granth-sahib.html, js/ggs-data.js, js/ggs-notes.js. deep-research skill, dossier in research/guru-granth-sahib/. Source the best translations yourself via parallel sub-agents; do not ask me to fetch copies.

Open on the hook that reframes everything: the Guru Granth Sahib is treated as the eternal LIVING Guru. When Guru Gobind Singh died in 1708 he ended the line of human Gurus and named the book itself the Guru. It is enthroned, not just read. That changes what "scripture" even means.

The spine (diagnosis and prescription): we are separated from God by haumai (ego, self-centeredness, "I am-ness") and attachment; we return through naam (remembrance of the divine Name), honest living, and grace.

Keystones (verify and expand):
- The Mul Mantar, the self-summary and root creed that opens the book: "Ik Onkar," One God, true by name, creator, without fear, without hatred, timeless, unborn, self-existent, known by grace.
- Japji Sahib (Guru Nanak's morning prayer that opens the Granth) and its question: "How to become truthful, how to tear away the veil of falsehood?" Answer: by walking in the Hukam, the divine order.
- The three pillars the text grounds: meditate on the Name, earn an honest living, share with others.
- Nanak's rejection of caste, ritual, and empty pilgrimage: "There is no Hindu, no Muslim," God is found in honest life, not ceremony.
- The radical inclusion: the Granth contains hymns by Hindu and Muslim saints (Kabir, Ravidas, Farid), not just the Sikh Gurus. Highlight it.

Untranslatables to stack: Naam (the Name / the divine identity), Hukam (divine order / will / command), Shabad (the Word / divine sound), haumai (ego / self-centeredness), sachiar (the true one), nadar (grace). Gurmukhi source line + transliteration. Note the text is multilingual.

Translations (all fair game, name each): Max Arthur Macauliffe, Gopal Singh, Manmohan Singh (the 8-volume standard), Sant Singh Khalsa (the widely used online translation), Nikky-Guninder Kaur Singh (modern, literary). Ernest Trumpp's notorious flawed Victorian version is useful only as a cautionary contrast, do not lean on its condescension.

Handle with reverence; Sikhs treat the physical text with strict respect, and the post should reflect that care. The haumai diagnosis quietly rhymes with AA's "self-centeredness is the root," but do not force the connection.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## The Hebrew Bible / Torah (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is the Hebrew Bible (the Tanakh), read as Judaism reads it. Approach A, curated keystones from a large text. Do this before the Christian Bible post; that one will build on this.

VOICE IS THE BAR. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, study tao-te-ching.html and js/tao*.js. write-post skill, monotone test, plain warm spoken, concrete opener.

Clone the Tao architecture: hebrew-bible.html, js/hebrew-bible-data.js, js/hebrew-bible-notes.js. deep-research skill, dossier in research/hebrew-bible/. Source the best translations yourself via parallel sub-agents; do not ask me to fetch copies.

Pitch the post on what is distinctively JEWISH about reading this text, not the Christian Old Testament lens: covenant, peoplehood, law, this-worldly ethics, and the text read through the rabbis (the Oral Torah), never alone. No Christ-typology, no original-sin emphasis.

The spine (diagnosis and prescription): a people keeps straying from the covenant and from justice; the repair is return (teshuvah), keeping the commandments, and pursuing justice as a holy people. This-world, not the afterlife.

Keystones (verify and expand):
- Hillel's self-summary (Talmud, Shabbat 31a): "What is hateful to you, do not do to your neighbor. That is the whole Torah; the rest is commentary. Go and learn." Use it as the framing.
- The Shema (Deut 6:4): "Hear, O Israel: the LORD our God, the LORD is One," with "love the LORD your God with all your heart." The creed.
- Genesis 1: creation, humans in the image of God (1:27). Translation fork: "In the beginning God created" vs "When God began to create."
- Exodus: the founding event of peoplehood, the burning bush and the divine name "Ehyeh asher ehyeh" (Ex 3:14), the Decalogue (Ex 20).
- Leviticus 19:18: "love your neighbor as yourself," inside the Holiness Code.
- Deuteronomy 16:20: "Justice, justice shall you pursue."
- Micah 6:8: "do justice, love mercy, walk humbly with your God."
- Ecclesiastes (Kohelet): "hevel," vanity or breath, the wisdom counterweight.

Untranslatables and forks to stack: the Tetragrammaton YHWH ("the LORD" / "Yahweh" / "the Eternal" / unpronounced), torah (law / teaching / instruction, "teaching" is the truer sense), nephesh (soul / life / being), tzedek (justice / righteousness), hevel. Hebrew source line (pointed) + transliteration.

Translations (all fair game, name each): JPS 1917 and NJPS 1985 (the Jewish standards), Robert Alter (the literary landmark, feature it), Everett Fox (echoes the Hebrew syntax), KJV (the famous English cadence), Young's Literal, Koren. Name the Jewish framing: Tanakh = Torah, Nevi'im, Ketuvim; the written and oral Torah are inseparable. The contest with the Christian reading is a teaching point (Isaiah 7:14 almah, "young woman" vs "virgin"). Avoid supersessionism; handle with respect.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## The Bible / New Testament (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is the Christian Bible, centered on the New Testament. Approach A, curated keystones from the largest and most-scrutinized text in the series. Do this after the Hebrew Bible post and build on it.

VOICE IS THE BAR. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, study tao-te-ching.html and js/tao*.js. write-post skill, monotone test, plain warm spoken, concrete opener. Because this is the most-scrutinized post, source every claim and steelman the contested doctrines.

Clone the Tao architecture: new-testament.html, js/new-testament-data.js, js/new-testament-notes.js. deep-research skill, dossier in research/new-testament/. Source the best translations yourself via parallel sub-agents; do not ask me to fetch copies.

The spine (diagnosis and prescription): humanity is estranged from God by sin and cannot save itself; the repair is reconciliation by grace through the life, death, and resurrection of Jesus, lived out as love of God and neighbor.

Keystones (verify and expand):
- The Greatest Commandment, the self-summary (Matthew 22:37-40): "Love God, and love your neighbor as yourself. On these two hang all the Law and the Prophets."
- The Sermon on the Mount (Matthew 5-7): the Beatitudes, "turn the other cheek," "love your enemies," the Lord's Prayer, "judge not." The ethical heart.
- John 1:1, the Word (Logos): "In the beginning was the Word, and the Word was God." Translation fork on Logos and the grammar.
- John 3:16, the gospel in one verse.
- The Passion and Resurrection, the load-bearing event, not just a saying: "Father, forgive them," the empty tomb.
- 1 Corinthians 13, Paul on love: "If I have not love, I am a noisy gong."
- Romans and Ephesians 2:8-9, grace: "by grace you have been saved through faith, not by works." The Protestant keystone.
- The Good Samaritan and the Prodigal Son (Luke 10, 15), the parables that carry the ethic.

Untranslatables and forks to stack: Logos (Word / Reason), agape (love / charity, KJV "charity" vs modern "love" in 1 Cor 13), metanoia (repentance / change of mind), pistis (faith / trust), the Lord's Prayer wording (debts / trespasses / sins), and the famous Isaiah 7:14 "virgin / young woman" as quoted in Matthew. Greek source line + transliteration. The English-translation lineage is itself a dramatic story (Tyndale burned for it, then the KJV).

Translations (all fair game, name each): KJV and Tyndale (the cadence and its source), Douay-Rheims (Catholic), RSV/NRSV (scholarly), NIV and ESV (modern evangelical standards), N.T. Wright's Kingdom New Testament, and David Bentley Hart's deliberately strange literal New Testament (feature it, it defamiliarizes). Name the sectarian contest sharply: Catholic, Orthodox, and Protestant canons differ (the deuterocanon), and faith versus works splits Paul from James 2 ("faith without works is dead"). Focus this post on the NT and on how Christianity re-reads the Hebrew scriptures; do not re-treat shared Genesis and Exodus material covered in the Hebrew Bible post.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## The Quran (Approach A, Translation Stack)

You're building a post for my "great books, made learn-from-able" series. This one is the Quran. Approach A, curated keystones. This is the post that needs the most care; do it once the format is well proven.

VOICE IS THE BAR. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, study tao-te-ching.html and js/tao*.js. write-post skill, monotone test, plain warm spoken, concrete opener. Reverent and precise throughout.

Clone the Tao architecture: quran.html, js/quran-data.js, js/quran-notes.js. deep-research skill, dossier in research/quran/. Source the best translations yourself via parallel sub-agents; do not ask me to fetch copies.

Foreground the point that reframes the whole translation stack: Muslims hold the Arabic Quran to be the literal, inimitable word of God, so every translation is "an interpretation of the meanings," not the Quran itself. That is the teaching, not a footnote. Feature the Arabic source line prominently and present it with dignity.

The spine (diagnosis and prescription): humanity forgets God, is ungrateful, and associates partners with the One (shirk); the way is submission (islam) to the one God (tawhid), gratitude, prayer, charity, justice, and mindfulness of the Day of Judgment.

Keystones (verify and expand):
- Al-Fatiha (Sura 1), the self-summary: the seven verses recited in every unit of every prayer, called the essence of the whole Quran. "In the name of God, the Most Gracious, the Most Merciful... Guide us to the straight path."
- Sura 112 (al-Ikhlas), pure oneness: "Say: He is God, the One... there is none comparable to Him." Tradition counts it a third of the Quran.
- Ayat al-Kursi (2:255), the Throne Verse, the most-recited single verse.
- 2:256, "There is no compulsion in religion."
- The Light Verse (24:35), "God is the Light of the heavens and the earth," the mystical keystone.
- 16:90, "God commands justice and good conduct."
- Sura 19 (Maryam) and the shared prophets (Abraham, Moses, Jesus, Mary), revised from the biblical tradition.
- A short late-Meccan sura like 81 (at-Takwir) for the vivid Day-of-Judgment voice.

Untranslatables to stack: Allah ("God" vs left as "Allah"), islam (submission / surrender), rahman and rahim (the two mercy words, hard to tell apart in English), taqwa (God-consciousness / piety), and the opening of Al-Fatiha ("Lord of the worlds / of all beings"). Arabic source line + transliteration.

Translations (all fair game, name each): Pickthall, Yusuf Ali, A.J. Arberry (the literary one that echoes the Arabic rhythm), Sahih International, M.A.S. Abdel Haleem (clear modern), Muhammad Asad, George Sale (the first major English from Arabic). The Quran's text is essentially uniform worldwide (unlike the Bible's variants); the contest is in interpretation (tafsir) and the Sunni and Shia split on authority, not in the text. Note the non-chronological order (longest suras first). Give context rather than apologetics or hostile verse-mining.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named, and chosen with care, calligraphy or architecture rather than figural images). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## Nagarjuna, Mulamadhyamakakarika (Approach B, One-Reading Walk)

You're building a post for my "great books, made learn-from-able" series. This one is Nagarjuna's Mulamadhyamakakarika, the foundation of Madhyamaka Buddhist philosophy, in Jay Garfield's translation (The Fundamental Wisdom of the Middle Way). Approach B, the One-Reading Walk. This is the hardest content in the series.

VOICE IS THE BAR, and this is the maximum-danger post for the "too educational" failure. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md, study tao-te-ching.html and js/tao*.js for the shell and the breakdown idiom. write-post skill, monotone test. Use concrete everyday analogies relentlessly (the chariot and its parts, a forest that is "empty" of being one thing yet full of trees); if a smart friend cannot follow a paragraph on one read, rewrite it. Do not lapse into Buddhist-studies register.

Build a one-reading walk: Garfield as the spine (his verse-by-verse commentary is why his edition is the standard), and unpack the argument. This text is technical argument, not story or devotion, so track the logical moves, the reductios, not just the verses. Use the multi-translation stack only as sidebars on the few pivotal verses. deep-research skill, dossier in research/nagarjuna/. Source the editions yourself via parallel sub-agents; do not ask me to fetch copies.

The spine (diagnosis and prescription): we suffer because we grasp things, and ourselves, as having svabhava, an independent fixed essence; that grasping is the root delusion. The cure is to see emptiness (sunyata): nothing exists independently, because everything arises dependently. Emptiness is not nothingness; it is the absence of independent essence, which is exactly what makes change and liberation possible.

Keystone moves (verify and expand):
- The opening eight negations (no arising, no ceasing, no permanence, no annihilation, no coming, no going, no identity, no difference) framing dependent origination.
- 24.18-19, the keystone: "Whatever is dependently arisen is explained as emptiness... there is nothing that is not dependently arisen, therefore nothing that is not empty."
- 24.8-10, the two truths: conventional and ultimate; without the conventional, the ultimate cannot be taught.
- The deconstruction of motion (Ch 2): the goer, the going, and the gone.
- 13.8, the emptiness of emptiness: "those who take emptiness itself as a view are incurable." It is not a new absolute.
- 25.19, "there is not the slightest difference between samsara and nirvana."

Interpretation splits for the sidebars: svabhava ("inherent existence" / "intrinsic nature" / "essence"), sunyata ("emptiness" / "voidness," and why "voidness" misleads), prapanca ("conceptual proliferation" / "fabrication"). Compare Garfield against Siderits and Katsura (the analytic edition), Kenneth Inada, Frederick Streng, and a secular reading like Stephen Batchelor. Sanskrit source line + transliteration. Name the interpretive contest (Svatantrika vs Prasangika). Frame: this is the philosophical engine under the Heart Sutra's "form is emptiness."

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.

---

## The Spirituality of Imperfection (Approach C, Idea Distillation)

You're building a post for my "great books, made learn-from-able" series. This one is The Spirituality of Imperfection by Ernest Kurtz and Katherine Ketcham (1992). Approach C, the Idea Distillation. This is the capstone; do it last, because it ties the whole series together.

VOICE IS THE BAR. Read CANON.md first (especially "What the first posts taught us"), then VOICE.md and STYLE.md. Study tao-te-ching.html for the shell and kit. write-post skill, monotone test, plain warm spoken, concrete opener. Unlike the Deutsch post, this one IS a wisdom book, so give it the warm, personal, story-first treatment, not the cool argument-map look.

There are no competing translations (it was written once, in English), so use Approach C: state each load-bearing idea plainly in my voice, anchored to a short quote with its page or chapter. deep-research skill, dossier in research/spirituality-of-imperfection/. Source the book and its embedded sources yourself; do not ask me to fetch copies.

Context worth knowing: Ernest Kurtz also wrote Not-God, the definitive history of Alcoholics Anonymous, so this connects directly to the AA posts on the site. The book teaches spirituality through stories drawn from many traditions (Hasidic tales, the desert fathers, Zen koans, Sufi stories, and AA).

The spine (diagnosis and prescription): the modern demand to be perfect and in control, and the denial of our own limits, is what kills the spiritual life; spirituality is found precisely in accepting imperfection. "To be human is to be imperfect," and that imperfection is the doorway, not the obstacle.

Load-bearing ideas (verify and expand, state each plainly, anchor with a short quote):
- The thesis: spirituality begins with accepting that our fractured, imperfect being simply is.
- Imperfection as the spiritual ground; the wisdom traditions agree we are limited, and that this is the way in.
- The story, not the doctrine, is the native form of spiritual wisdom: we discover who we are by telling our own.
- "Not-God," Kurtz's foundational AA insight: the first and essential message is that you are not God, not in control. The root of both the addiction and the recovery.
- The specific qualities the book maps (release, gratitude, humility, tolerance, forgiveness, being-at-home), each told through a tale.
- Spirituality as experience, not belief; the difference from religion.

Reproduce a few of the embedded cross-tradition stories (they are the best part), each attributed. The interactive element could be a small gallery of those tales, stories from very different traditions that all teach the same thing.

This is the capstone because it names the thread under the whole series: the convergence on imperfection, ego, and limitation that shows up as self-centeredness in AA, haumai in Sikhism, anatta in Buddhism, pride in Christianity. Let the post explicitly tie the series together and reference the other posts.

When built and self-edited, add the homepage card, og:image, real sourced thumbnail (named). Verify 20px gutter at 375px. Commit and push with explicit paths.
