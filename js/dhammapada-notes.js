/* ============================================================
   The Dhammapada, side by side: the commentary.
   Per-verse, plain-language breakdown of what the verse says and
   where the translators split. Written in the site voice.
   No em dashes. Light inline HTML (<em>, <b>) is allowed; it is
   injected as innerHTML by js/dhammapada.js.

   shape:  n: { title, gist, splits:[{pali, gloss, note}], read }
   Verses without an entry render the translations alone, so the
   breakdowns are written only for the keystones, the verses the
   rest of the tradition leans on.
   ============================================================ */
window.DHP_NOTES = {

  1: {
    title: "Mind comes first",
    gist: "The book's first move is to make the mind the cause of everything that happens to you. Whatever you are now started as a thought. Act from a fouled mind and suffering trails you like the cartwheel trailing the ox that pulls it. The next verse flips it: act from a clear mind and happiness follows like a shadow that never leaves. These two are the Twin Verses, and the tradition treats them as the seed the whole book grows from.",
    splits: [
      { pali: "mano", gloss: "mind / heart / intention", note: "The first word, and the translators cannot agree what it points to. Most say <em>mind</em> (Buddharakkhita: <em>'Mind precedes all mental states'</em>). Thanissaro alone says <em>heart</em>, because the Pali <em>mano</em> covers the feeling as much as the thinking. Sujato narrows it to <em>intention</em>, the part of the mind that chooses. Müller drops the word entirely and writes <em>'All that we are is the result of what we have thought.'</em> One term, read as intellect, as feeling, or as will." },
      { pali: "dhammā", gloss: "mental states / phenomena / experiences", note: "What the mind 'precedes.' Buddharakkhita keeps it small, <em>mental states</em> (your moods follow your mind). Thanissaro and Kaviratna go wide, <em>phenomena</em> and <em>the phenomena of existence</em> (the whole experienced world follows mind). Sujato says <em>experiences</em>. The Pali <em>dhamma</em> is the most overworked word in the book, and here it holds both the narrow and the cosmic reading at once." }
    ],
    read: "They cannot agree on the first word, then line up almost exactly on the cartwheel and the shadow. The plain images carry the teaching. The abstractions are where the trouble starts, which is the whole reason for a page like this."
  },

  2: {
    title: "And its mirror",
    gist: "Same three opening lines as verse 1, one word changed: the corrupted mind becomes a clear one, and suffering becomes happiness, the cartwheel becomes the shadow. Buddhist texts teach in matched pairs like this, the dark case then the bright case, which is why chapter one is called the Twin Verses. Read 1 and 2 as a single thought.",
    splits: [
      { pali: "pasanna", gloss: "clear / pure / bright / calm", note: "The good-mind word, set against <em>paduttha</em> (corrupted) in verse 1. Buddharakkhita and Sujato say <em>pure</em>, Thanissaro says <em>calm, bright</em>. It is less about moral spotlessness than about a mind that is settled and unclouded, the opposite of the agitated one that drags suffering behind it." }
    ],
    read: "If you only keep one idea from the whole book, the tradition wants it to be this pair: the quality of the mind you act from decides what follows you home."
  },

  5: {
    title: "The most quoted line, slightly mistranslated",
    gist: "Hatred is never stilled by more hatred; it is stilled only by its absence. This is the book's ethical keystone, the verse people quote when they quote the Dhammapada at all. The catch is that the most famous English version of it is not quite what the Pali says.",
    splits: [
      { pali: "averena", gloss: "by non-hatred", note: "Here is the whole problem in one word. The Pali says hatred is stilled <em>averena</em>, by <em>non-hatred</em>, the simple absence of hate. Buddharakkhita keeps it literal: <em>'By non-hatred alone is hatred appeased.'</em> But in 1881 Müller wrote <em>'hatred ceases by love,'</em> and that warmer line is the one that went around the world. Wagiswara and Saunders split the difference in 1912 with <em>'by kindness.'</em> <em>Avera</em> is the missing of hate, not yet the presence of love. The most repeated sentence in the book is a small, deliberate upgrade by a Victorian translator." },
      { pali: "sanantano", gloss: "ancient / eternal", note: "The closing tag, <em>esa dhammo sanantano</em>, <em>'this is an ancient law.'</em> Buddharakkhita: <em>a law eternal</em>. Sujato: <em>an ancient teaching</em>. The verse presents non-retaliation not as a new rule the Buddha invented but as something already old, a law of how the world runs." }
    ],
    read: "Worth sitting with that the line everyone loves is the one nobody quotes accurately. The real claim is colder and harder than the bumper sticker: you do not have to summon love, you only have to stop feeding the hate."
  },

  21: {
    title: "Heedfulness is the path to the deathless",
    gist: "The single quality the Buddha pressed hardest is here in one word, appamada, the opposite of running on autopilot. Stay awake to what you are doing and you walk toward the deathless. Sleepwalk through your life and you are already dead. Tradition says this is the verse that turned the emperor Asoka.",
    splits: [
      { pali: "appamāda", gloss: "heedfulness / vigilance / earnestness", note: "No clean English word exists, so the translators circle it. Buddharakkhita and Thanissaro say <em>heedfulness</em>, Kaviratna <em>vigilance</em>, Müller (1881) <em>earnestness</em>, Sujato <em>heedfulness</em> again. It means an alert, unforgetful attention to what matters, the mind that does not drift. The Buddha's reported last words name the same quality." },
      { pali: "amatapadaṁ", gloss: "the path / place of the deathless", note: "<em>Amata</em> is the <em>deathless</em>, literally the un-dying, a name for nibbana. Buddharakkhita and Thanissaro say <em>the Deathless</em>. Müller blinks and writes <em>'the path of immortality (Nirvana),'</em> smuggling in a soul-word the Pali avoids. The deathless is not a place you survive to; it is the going-out of the fire that drives rebirth." }
    ],
    read: "The pun is exact in Pali and lost in English: <em>appamada</em> (heed) against <em>pamada</em> (heedlessness), <em>amata</em> (deathless) against <em>mata</em> (dead). The verse is built like a hinge, awake on one side, dead on the other."
  },

  103: {
    title: "The harder conquest",
    gist: "Beat a thousand men a thousand times in battle, and you are still a lesser victor than the person who conquers one man: himself. The chapter sets the loud kind of victory next to the quiet one and lets you feel which is rarer.",
    splits: [
      { pali: "attānaṁ jine", gloss: "should conquer himself", note: "For once the translators barely diverge. <em>'He who conquers himself is the greater victor'</em> (Kaviratna); <em>'he indeed is the noblest victor who conquers himself'</em> (Buddharakkhita); <em>'he who would conquer just one, himself'</em> (Thanissaro). When the Pali is plain, the stack goes quiet, which is its own kind of evidence: the lines that fracture into a dozen Englishes are fracturing for a reason, and this is not one of them." }
    ],
    read: "Three verses later the book pushes it further: that inner victory cannot be undone, not by a god, not by anyone. The battlefield metaphor is doing something sly, borrowing the prestige of the warrior to hand it to the meditator."
  },

  153: {
    title: "The house-builder, found",
    gist: "The tradition holds that these two verses (153 and 154) are the first thing the Buddha said at the moment of awakening, sitting under the tree. For countless lives he had been looking for the 'house-builder,' the thing that keeps constructing a new existence each time the last one ends. Here he finally names it and tells it the building is over.",
    splits: [
      { pali: "gahakāra", gloss: "house-builder", note: "The whole image turns on who the builder is. The commentary says it is <em>tanha</em>, craving, the force that keeps raising a new 'house' (a new birth, a new self) lifetime after lifetime. The <em>house</em> is the body or repeated existence; the <em>rafters</em> are the defilements; the <em>ridgepole</em> is ignorance. Buddharakkhita: <em>'seeking the builder of this house (of life).'</em> Once the builder is seen, it cannot work in the dark anymore." }
    ],
    read: "Note what is doing the framing. The verse itself never says 'I am the Buddha and this is my awakening.' That is Buddhaghosa's fifth-century commentary, a thousand years after the fact, telling you where to stand. It is a beautiful tradition. It is a tradition, not the text."
  },

  154: {
    title: "The building is over",
    gist: "The second half of the awakening verse, and the only triumphant moment in a book that mostly speaks in calm imperatives. The rafters are broken, the ridgepole shattered, the mind has reached the unconditioned, and craving is finished. This is what the whole program is for.",
    splits: [
      { pali: "visaṅkhāra", gloss: "the unconditioned / un-constructed", note: "The hard, glorious word. The mind reaches <em>visankhara</em>, the state with nothing built or conditioned about it. Buddharakkhita names it <em>the Unconditioned</em>; Thanissaro keeps the verb alive, <em>'immersed in dismantling';</em> Sujato, <em>'set on demolition.'</em> Müller hedges into <em>'the Eternal.'</em> The point is not a heaven gained but a construction project finally stopped." },
      { pali: "taṇhānaṁ khaya", gloss: "the ending of craving", note: "The last line, and the book's destination: <em>'the destruction of craving'</em> (Buddharakkhita), <em>'the end of craving'</em> (Thanissaro). Not the end of feeling, the end of the thirst that turns feeling into a reason to build another house." }
    ],
    read: "Every other verse tells you what to do. This one shows you the one time it worked. That it sits in the chapter called Old Age, not in some chapter about glory, is the book being honest about where freedom actually gets found."
  },

  183: {
    title: "The whole teaching in three lines",
    gist: "If you want the tradition's own summary of itself, it is here. Stop doing harm. Do good. Clean up your own mind. That is the teaching of the Buddhas, plural, the thing every awakened one has taught. This verse is recited as the heart of the teaching, and it is the spine of this entire book: ethics, then good action, then the mind.",
    splits: [
      { pali: "sacittapariyodapanaṁ", gloss: "purifying one's own mind", note: "The third and decisive step. Anyone can preach 'do good, avoid evil'; the Buddhist turn is the third clause, <em>cleansing your own mind</em>. Buddharakkhita: <em>'to cleanse one's mind.'</em> Sujato: <em>'to purify one's mind.'</em> Without it the first two are just morality. With it they become a path, because the mind is where verse 1 said everything starts." },
      { pali: "buddhāna sāsanaṁ", gloss: "the teaching of the Buddhas", note: "<em>Buddhana</em> is plural, the Buddhas, more than one. The claim is bigger than one teacher's opinion: this three-part formula is what every awakened being across time has taught. <em>Sasana</em> is rendered <em>teaching</em>, <em>instruction</em>, or <em>dispensation</em>; it is the same word Theravada uses for the whole religion." }
    ],
    read: "Three clauses, and the order is the argument. Not 'purify your mind' first, when you are still doing harm, but stop the harm, build the good, and only then is the mind clear enough to work on. The sequence is the method."
  },

  277: {
    title: "The three marks (1): nothing built lasts",
    gist: "Three verses in a row (277, 278, 279) name the three marks of existence, the Buddhist diagnosis of why things hurt. The first: everything assembled from parts is impermanent. See that clearly, with wisdom and not just as a slogan, and you start to let go. The three together are the most concentrated philosophy in the book.",
    splits: [
      { pali: "sabbe saṅkhārā aniccā", gloss: "all conditioned things are impermanent", note: "<em>Sankhara</em> is the hardest word in the Canon: things that are put together, conditioned, fabricated. Buddharakkhita: <em>'All conditioned things are impermanent.'</em> Thanissaro: <em>'All fabrications are inconstant.'</em> Müller, reaching, writes <em>'All created things perish.'</em> Whatever is assembled comes apart; that is not a mood, it is a property of assembled things." }
    ],
    read: "Hold on to the exact wording here, because the next two verses change one word each, and the third changes the most important word of all. The Buddhist argument is hidden in what stays the same and what moves."
  },

  278: {
    title: "The three marks (2): and it cannot satisfy",
    gist: "Same verse, one word swapped: from impermanent to dukkha. Because everything built is unstable, leaning your happiness on it cannot finally satisfy. This is the word the whole tradition turns on, and it is the word the translators fight over hardest.",
    splits: [
      { pali: "dukkha", gloss: "suffering / unsatisfactory / stress", note: "Watch the backbone spread across this single word. Müller: <em>grief and pain</em>. Kaviratna: <em>sorrowful</em>. Buddharakkhita: <em>unsatisfactory</em>. Suddhaso: <em>unsatisfying</em>. Thanissaro: <em>stressful</em>. Sujato: <em>suffering</em>. <em>Dukkha</em> is more than pain. It is the friction of leaning on what will not hold, the bad axle that makes the cart ride rough. 'Suffering' oversells it, 'unsatisfactoriness' undersells it, and Thanissaro's plain 'stress' is the most modern attempt to thread the gap." }
    ],
    read: "If you ever wondered whether the famous 'life is suffering' is fair to the Buddha, this is the verse to argue it over. He did not say life is agony. He said nothing assembled can carry the weight you want to put on it."
  },

  279: {
    title: "The three marks (3): and none of it is you",
    gist: "The third mark, and the one that makes Buddhism Buddhism. One word changes that most translators miss in passing: the first two verses said sankhara, conditioned things. This one says dhamma, ALL things. Impermanence and dukkha apply to what is built; not-self applies to everything, with no exception left over to be a soul.",
    splits: [
      { pali: "sabbe dhammā anattā", gloss: "all things are not-self", note: "The deliberate widening. Verses 277 and 278 said <em>sabbe sankhara</em> (all conditioned things). This says <em>sabbe dhamma</em> (all things, even the unconditioned). Nothing anywhere is a self. Buddharakkhita and Thanissaro: <em>not-self</em>. The older translators miss it badly: Müller writes <em>'All forms are unreal,'</em> and Kaviratna <em>'unreal,'</em> turning a claim about selfhood into a claim that the world is an illusion, which the Pali does not say." },
      { pali: "anattā", gloss: "not-self vs no-self", note: "The live debate. Is the Buddha saying <em>there is no self</em> (a metaphysical claim) or <em>this is not-self</em> (a practical instruction: do not take any of this as you)? Thanissaro argues hard for the second, because when someone asked the Buddha point-blank whether a self exists, he refused to answer. 'No-self' reads it as ontology; 'not-self' reads it as a move you make. Suddhaso splits the difference with <em>impersonal</em>." }
    ],
    read: "This is the verse the Buddhists in your audience will check first, so the post should get it exactly right: <em>anicca</em> and <em>dukkha</em> are predicated of conditioned things, but <em>anatta</em> is predicated of all things. The wider net is not sloppy translation. It is the entire point."
  }

};
