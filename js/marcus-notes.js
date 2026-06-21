/* ============================================================
   Marcus Aurelius, Meditations, side by side: the commentary.
   Per-passage plain-language breakdown of what the passage says,
   the Greek behind it, and where the translators split. Written in
   the site voice. No em dashes in my own text; quoted translations
   keep their original punctuation. Light inline HTML (<em>, <b>) is
   injected as innerHTML by js/marcus.js.

   shape:  "B.S": { title, gist, splits:[{gk, gloss, note}], read }
   Passages without an entry render the translations alone.
   ============================================================ */
window.MARCUS_NOTES = {

  "1.17": {
    title: "The book opens as a thank-you list",
    gist: "Book 1 is not philosophy. It is a list of people Marcus owes, one by one, for what each gave him. From his grandfather, control of his temper. From his mother, generosity. From his tutor Rusticus, the loaned copy of Epictetus that set the whole thing off. The last and longest section thanks the gods. The most powerful man alive opens his private notebook by admitting he was made by other people.",
    splits: [
      { gk: "Παρὰ τῶν θεῶν", gloss: "para ton theon: from the gods", note: "Every section of Book 1 starts the same way: <em>from</em> someone. Long opens this one <em>'To the gods I am indebted'</em>; Haines, <em>'From the Gods.'</em> The grammar is the lesson. Nothing he values is self-made." }
    ],
    read: "A king's diary that begins with a list of debts. You can feel him working to stay small."
  },

  "2.1": {
    title: "Tomorrow you will meet awful people. Start there.",
    gist: "His first move each morning is to expect the worst of people: the meddler, the ingrate, the bully. Not to armor up against them, the opposite. He reminds himself they act badly out of ignorance, that they are his kin, and that he was built to work alongside them like the two rows of teeth. So none of it can really touch him, and he cannot hate them. Bracing for the difficulty is how he takes the sting out of it.",
    splits: [
      { gk: "συνεργία", gloss: "synergia: working together", note: "<em>'We are made for co-operation,'</em> says Long, <em>'like feet, like hands, like eyelids, like the rows of the upper and lower teeth.'</em> The word is the root of English <em>synergy</em>. The person who wrongs you is not an enemy, he is a body part working against the body." }
    ],
    read: "Everyone quotes the parade of jerks. The point is the line after it: they are family, so you carry them."
  },

  "2.11": {
    title: "You could be dead by evening. Act like it.",
    gist: "Do, say, and think everything as if you could leave life this moment, because you can. Then he runs the cold version of the argument: if the gods exist, death is no threat, they will not let real harm reach you; if they do not, a world without them is not worth clinging to. Either way the exit is nothing to dread, so let its nearness sharpen what you do now.",
    splits: [
      { gk: "ἐξιέναι τοῦ βίου", gloss: "exienai tou biou: to depart from life", note: "Marcus returns to this image constantly. Long: <em>'thou mayest depart from life this very moment.'</em> Hays cuts it to five words: <em>'You could leave life right now.'</em>" }
    ],
    read: "Not morbid. He uses death the way you use a deadline, to make the present count."
  },

  "2.17": {
    title: "Life is a short war in a foreign country",
    gist: "He sizes up a human life with no comfort at all. Time is a point, the body a river running off, fame just forgetting waiting to happen. Then the turn: one thing can carry you through it, philosophy, which here is not a subject but a practice. Keep the bit of the divine inside you intact, do nothing falsely, and meet death calmly, as nothing worse than nature taking its parts back.",
    splits: [
      { gk: "ὁ βίος πόλεμος", gloss: "ho bios polemos: life is warfare", note: "<em>'Life is a warfare and a stranger's sojourn,'</em> Long writes, <em>'fame after death is only forgetfulness.'</em> Marcus wrote it during an actual war, on the Danube frontier. The metaphor was barely a metaphor." }
    ],
    read: "Philosophy, for him, is not the seminar. It is the thing that gets a soldier through the campaign."
  },

  "4.3": {
    title: "You don't need a cabin. You have your own mind.",
    gist: "People dream of getting away: the shore, the hills, a place in the country. Marcus calls that a waste, because the quietest retreat there is needs no travel at all, your own mind, and you can step into it any second. This is the passage later readers named the inner citadel. Under it sits the line the whole book leans on: the world is change, life is opinion.",
    splits: [
      { gk: "ὑπόληψις", gloss: "hypolepsis: opinion, the read you add", note: "The hinge of the book. <em>ὁ κόσμος ἀλλοίωσις, ὁ βίος ὑπόληψις</em>, <em>'the universe is change, life is opinion.'</em> Not that nothing is real, but that the part you govern is the verdict you pass on what happens. Every translator says <em>opinion</em> or <em>judgment</em>; the Greek means the interpretation you lay over a bare fact." }
    ],
    read: "He was the emperor, at war, and could not get away. So he found the one retreat nobody could take from him."
  },

  "4.7": {
    title: "Drop the words 'I've been wronged,' and the wrong is gone",
    gist: "Three steps, and they fit in one breath. Remove the opinion that you have been harmed, and the feeling of harm goes with it. Remove the feeling, and the harm itself is gone. The harm was never sitting in the event. You added it, in the verdict.",
    splits: [
      { gk: "Ἆρον τὴν ὑπόληψιν", gloss: "aron ten hypolepsin: take away the opinion", note: "Same word as 4.3, <em>hypolepsis</em>. Long: <em>'Take away thy opinion, and then there is taken away the complaint, I have been harmed.'</em> The maxim this idea usually travels as, <em>'we are disturbed not by things but by our opinions about them,'</em> is not Marcus. It is his teacher Epictetus, and the full sorting-out is at 8.47." }
    ],
    read: "The load-bearing move of Stoicism, stated about as plainly as it ever gets."
  },

  "4.49": {
    title: "Be the rock the waves break on",
    gist: "Be like a headland with the surf smashing into it: it stands, and the water around it falls quiet. Then he catches himself mid-complaint and rewrites it on the spot. Not 'unlucky me, that this happened to me,' but 'lucky me, that this happened and I can take it unbroken, not crushed by the present, not afraid of what is coming.' Same event, flipped by the verdict laid on it.",
    splits: [
      { gk: "ἄκρα", gloss: "akra: headland, promontory", note: "Long and Casaubon say <em>promontory</em>; Haines, <em>a headland of rock</em>. The image is identical in every version, and it became the stock picture of resilience. Marcus then does the harder thing the cliche leaves out, and edits his own self-pity in real time." }
    ],
    read: "Everyone remembers the rock. The lesson is the next sentence, where he corrects his own flinch."
  },

  "5.1": {
    title: "The emperor of Rome, telling himself to get out of bed",
    gist: "It is dawn and he does not want to get up. So he argues with himself the way anyone does. I am rising to do the work of a human being. Why am I sulking about going to do the thing I was made for? Is staying warm under the covers really what I exist for? The man who ruled the known world had the same fight with the morning that you do, and he wrote down the pep talk.",
    splits: [
      { gk: "ἐπὶ ἀνθρώπου ἔργον", gloss: "epi anthropou ergon: for a man's work", note: "Hays makes it sound like today: <em>'I have to go to work, as a human being.'</em> Long keeps it formal: <em>'I am rising to the work of a human being.'</em> Same complaint, eighteen centuries apart." }
    ],
    read: "If you read one passage to learn what this book is, read this. He is exactly like you, and he is the emperor."
  },

  "5.16": {
    title: "Your mind takes the color of its thoughts",
    gist: "Whatever you turn over often, your mind turns into. The soul gets dyed the color of its thoughts. So he tells himself to steep it in good ones: that you can live well anywhere, even in a palace, even in a war camp. The argument is almost mechanical. Thoughts are not decoration laid on the self. They are the material it is made of.",
    splits: [
      { gk: "βάπτεται", gloss: "baptetai: is dyed, dipped", note: "The picture is cloth taking dye. Staniforth: <em>'the soul becomes dyed with the colour of its thoughts.'</em> Hammond: <em>'souls are dyed by thoughts.'</em> The same root gives us <em>baptize</em>. You become whatever you soak in." }
    ],
    read: "Marcus Aurelius on what your feed is doing to you, written seventeen centuries early. Watch what you steep in."
  },

  "5.20": {
    title: "What stands in the way becomes the way",
    gist: "The most quoted line in the book, and it is the tail end of a passage about other people. Some of them will block what you are trying to do. Fine, he says: a person in your way is just another obstacle, like wind or a wild animal, nothing to resent. And the mind can turn any obstacle into fuel. What blocks the action can be made to advance it.",
    splits: [
      { gk: "ἐμπόδιον", gloss: "empodion: obstacle, what is in the foot's way", note: "Watch the length. Long takes a hundred words to arrive: <em>'that which is an obstacle on the road helps us on this road.'</em> Hays boils the whole thing to eleven: <em>'The impediment to action advances action. What stands in the way becomes the way.'</em> That compression is why Ryan Holiday could build a bestseller on it." }
    ],
    read: "Same passage, two lengths. Marcus had the idea; the slogan is Hays's, and the slogan is what survived."
  },

  "6.6": {
    title: "The best revenge is to not become like them",
    gist: "Four words in the Greek. The way to get back at someone who wronged you is to refuse to turn into them. Revenge that copies the offense just adds a second offender. Declining to be reshaped by it is the only win that leaves you intact.",
    splits: [
      { gk: "μὴ ἐξομοιοῦσθαι", gloss: "me exomoiousthai: not to be made like", note: "Staniforth gets it down to <em>'To refrain from imitation is the best revenge.'</em> Long, plainer: <em>'The best way of avenging thyself is not to become like the wrong-doer.'</em> The verb is about being <em>made similar</em>, reshaped by what was done to you." }
    ],
    read: "Cleaner than any line about revenge being a dish best served cold. Do not let the offense rewrite you."
  },

  "6.8": {
    title: "The one part of you that runs itself",
    gist: "There is a part of the mind that rouses and steers itself, makes itself into whatever it chooses, and decides how everything that happens will look to it. Marcus calls it the ruling faculty. It is the part he is forever addressing in this book, because it is the only part fully his to command.",
    splits: [
      { gk: "ἡγεμονικόν", gloss: "hegemonikon: the ruling faculty", note: "The keyword of Marcus's psychology. Long: <em>'the ruling principle.'</em> Hays: <em>'the directing mind.'</em> Everything that happens to you is outside; the <em>hegemonikon</em> is the inside, the one thing that can step back from its own impressions and say yes or no." }
    ],
    read: "Whoever you mean when you say you talked yourself into it, this is who you were talking to."
  },

  "6.30": {
    title: "Don't let the job turn you into a monster",
    gist: "Here is the heart of the whole notebook. The most powerful man on earth, warning himself, in private, not to be wrecked by his own power. Do not get Caesarified. Stay simple, honest, just, a friend of the gods and of people. Then he holds up the one model he trusts, his adopted father Antoninus, and lists everything he admired in him, as a checklist for the ruler not to stop being.",
    splits: [
      { gk: "ἀποκαισαρωθῇς", gloss: "apokaisarothes: be turned into a Caesar", note: "Marcus coins a verb for it. Hays catches the strangeness: <em>'To escape imperialization, that indelible stain.'</em> Hammond keeps the coinage: <em>'Take care not to be Caesarified, or dyed in purple.'</em> Purple was the emperor's color; the fear is that it soaks all the way through." }
    ],
    read: "Every powerful person should tape this to a mirror. Almost none do. He did, in private, and it is most of why we still trust him."
  },

  "7.9": {
    title: "Everything is wired to everything",
    gist: "Nothing stands alone. All things are woven together, the bond is sacred, and it all composes one world: one cosmos, one God running through it, one substance, one law, one reason shared by every thinking creature. The Stoic universe is not a heap of separate objects. It is a single web, and you are one knot in it.",
    splits: [
      { gk: "λόγος κοινός", gloss: "logos koinos: the common reason", note: "<em>Logos</em> is the largest Stoic word: the rational order running through the cosmos, and the share of it inside your own mind. Because everyone holds a piece of the same <em>logos</em>, harming another person is, for Marcus, a kind of self-harm. The web is moral, not just physical." }
    ],
    read: "The Stoic argument for not being a jerk: there is no 'other people,' only other knots in the same net."
  },

  "7.59": {
    title: "Dig. The good is further down.",
    gist: "Two short clauses. The source of good is inside you, and it never runs dry, as long as you keep digging. Not found, not handed over, dug for. The labor is the access.",
    splits: [
      { gk: "Ἔνδον σκάπτε", gloss: "endon skapte: dig within", note: "One of the best lines to watch travel. Long and Haines keep it gentle: <em>'Look within.'</em> The moderns pick up the shovel. Hays: <em>'Dig deep; the water, goodness, is down there.'</em> Hammond: <em>'Dig inside yourself.'</em> The Greek verb is literally to <em>dig</em>, so the moderns are the more faithful ones." }
    ],
    read: "Eight translators, one buried spring. This is the entry to set to All and watch them split."
  },

  "8.47": {
    title: "It isn't the thing. It's your read on the thing.",
    gist: "If something outside you is causing pain, it is not the thing doing it but your judgment about the thing, and you can wipe that judgment out this second. This is the closest Marcus comes to the single most famous idea in Stoicism. It is also worth being exact about who actually said what.",
    splits: [
      { gk: "κρῖμα, δόγμα", gloss: "krima, dogma: the verdict you pass", note: "The line everyone quotes, <em>'we are disturbed not by things but by our opinions of them,'</em> is Epictetus, not Marcus (Handbook 5, where the word is <em>dogmata</em>). Marcus's own version is right here, and he uses <em>krima</em> then <em>dogma</em>, both meaning the verdict you add. This is the seed of modern cognitive therapy; Albert Ellis and Aaron Beck both traced their method back to the Stoics." }
    ],
    read: "The most misattributed idea in self-help, sourced and sorted. The thing is neutral. You supply the sting."
  },

  "9.6": {
    title: "Three things, and that is the whole job",
    gist: "Marcus compresses the entire practice into three present-tense moves: judge what is in front of you clearly, act for the common good, and accept whatever comes from outside your control. Hays lays it out like a checklist. That is all you need, and every piece of it is available right now.",
    splits: [
      { gk: "ὑπόληψις, πρᾶξις, διάθεσις", gloss: "judgment, action, disposition", note: "The three nouns map the whole Stoic self: what you think (<em>hypolepsis</em>), what you do (<em>praxis</em>), and how you take what happens (<em>diathesis</em>). The Greek is so compressed that this is the one keystone where Hays so outruns the older versions that the others are barely quotable next to him." }
    ],
    read: "If the book had a one-line summary, this is it. Think straight, act for others, accept the rest."
  },

  "9.30": {
    title: "Zoom out until your whole life is a dot",
    gist: "Look down on it all from a great height: the herds of people, the crowds and ceremonies, the ships in storm and calm, the endless weddings and lawsuits and funerals. From up there your troubles shrink to their real size, and so does your name, which most people never knew and the rest will soon forget. It is the cosmic zoom-out, done on purpose, to get your own scale right.",
    splits: [
      { gk: "ἄνωθεν ἐπιθεωρεῖν", gloss: "anothen epitheorein: to survey from above", note: "Astronauts have a name for the real thing: the <em>overview effect</em>, seeing Earth from orbit and feeling your problems rescale. Marcus ran it in his head, on a battlefield. Hays: <em>'look down on the earth from above.'</em> Farquharson keeps the long catalogue of herds and armies and weddings and funerals, all mixed together." }
    ],
    read: "The oldest cure for a swollen head, and it still works. Go up until you are small."
  },

  "10.16": {
    title: "Stop describing the good man. Be one.",
    gist: "Quit theorizing about what a good person is like and go be one. That is the entire entry. It is also the source of one of the most shared 'Marcus' quotes, which is worth getting right.",
    splits: [
      { gk: "ἀγαθὸς ἀνήρ", gloss: "agathos aner: a good man", note: "The popular version, <em>'Waste no more time arguing about what a good man should be. Be one,'</em> is really two translators stitched together. <em>'Waste no more time arguing'</em> is Maxwell Staniforth (1964); the ending tracks the older wording. Hays renders it <em>'Stop talking about what a good man is like, and just be one.'</em> Marcus's point survives all of them: stop talking, start being." }
    ],
    read: "The most action-forward line in the book, and a small lesson in how quotes drift loose from the people who wrote them."
  },

  "12.17": {
    title: "If it's not right, don't do it. If it's not true, don't say it.",
    gist: "Two rules, no exceptions, that fit on a sticky note. Do not do what is not right. Do not say what is not true. The rest of the entry tells you to keep your impulses under your own command, so that the two rules are actually yours to keep.",
    splits: [
      { gk: "καθῆκον", gloss: "kathekon: the fitting thing, duty", note: "<em>Εἰ μὴ καθήκει, μὴ πράξῃς</em>, <em>'if it is not fitting, do it not.'</em> <em>Kathekon</em> is the Stoic word for the appropriate action, what the situation genuinely calls for. Cicero translated it <em>officium</em>, which is how it reached English as <em>duty</em>." }
    ],
    read: "The whole of ethics, twice, in a sentence you could hand a child."
  },

  "12.36": {
    title: "The last words: leave the stage with good grace",
    gist: "The final passage of the book, and it is about being dismissed. You have lived as a citizen of this great city, he says. Five years or a hundred, what is the difference? Nature, which cast you in the play, is now calling you off, like a director releasing an actor. You did not finish five acts, only three? In a life, three acts are a whole play. The one who brought you on is the one who decides it is done. So go, and go gladly.",
    splits: [
      { gk: "ὁ ἀπολύων ἵλεως", gloss: "ho apolyon hileos: the one who dismisses you is kind", note: "Watch how each translator lands the very last line. Long: <em>'he also who releases thee is satisfied.'</em> Haines: <em>'he that dismisses thee is gracious.'</em> Hays: <em>'So make your exit with grace, the same grace shown to you.'</em> The book that began with a list of debts ends by handing the final one back without complaint." }
    ],
    read: "He spent twelve books rehearsing his own death. The last line is the calmest sentence in it."
  }

};
