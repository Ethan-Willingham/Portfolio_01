/* ============================================================
   The New Testament, side by side: the commentary.
   Per-passage, plain-language breakdown of what the passage says
   and where the translators split. Written in the site voice.
   No em dashes in my prose. Light inline HTML (<em>, <b>, <a>) is
   allowed; it is injected as innerHTML by js/new-testament.js.

   shape:  id: { title, gist, splits:[{gk|he, gloss, note}], read }
   ============================================================ */
window.NT_NOTES = {

  "greatest-commandment": {
    title: "The whole thing, in two sentences",
    gist: "Someone asks Jesus to name the single most important rule, out of the 613 commands in the Jewish Law. He gives two. Love God with everything you have, and love your neighbor as yourself. Then the load-bearing line: <em>on these two hang all the Law and the Prophets</em>. Everything else is detail. And neither half is original. He is quoting the Hebrew Bible back to the experts in it, welding <a href=\"hebrew-bible.html\">Deuteronomy 6:5</a> (love God) to Leviticus 19:18 (love your neighbor) and saying the whole thing balances on the join.",
    splits: [
      { gk: "ἀγαπήσεις", gloss: "agapēseis: you shall love", note: "It is a command, not a mood. The verb is future tense used as an imperative, <em>you will love</em>, and the love word is <em>agapē</em> (the same one Paul defines in 1 Corinthians 13), the deliberate, willed kind you can be ordered to do, not the kind you fall into." },
      { gk: "κρέμαται", gloss: "krematai: hangs", note: "The Law and the Prophets <em>hang</em> on these two commandments. Wright makes it a door on its hinges; the older versions keep the plain image of weight hung on a peg. Pull the peg and everything drops." }
    ],
    read: "A rabbi named Hillel, a generation before Jesus, was asked to teach the whole Torah while standing on one foot. He said: what is hateful to you, do not do to your neighbor, the rest is commentary, go and learn. Jesus is making the same move, and lands in the same place."
  },

  "beatitudes": {
    title: "Blessed are the wrong people",
    gist: "The most famous sermon ever given opens by congratulating exactly the people the world steps over: the poor, the grieving, the meek, the ones who get pushed around and keep their hands clean anyway. <em>Blessed</em> here is not a pat on the head for being good. It is closer to <em>you are in a good place, even though it does not look like it</em>. The kingdom belongs to them, not to the winners.",
    splits: [
      { gk: "μακάριοι", gloss: "makarioi: blessed", note: "The word means happy, lucky, even enviable. The KJV's <em>blessed</em> has gone churchy over four centuries; the modern versions keep it anyway because nothing else fits. David Bentley Hart reaches the other way with <em>How blissful the destitute</em>, trying to recover the original's almost scandalous cheer, calling the abject enviable to their faces." },
      { gk: "πραεῖς", gloss: "praeis: meek", note: "<em>Meek</em> now sounds like a doormat. The Greek is closer to gentle, or strength with the brakes on, the word you would use for a powerful horse that has been broken to the bridle. The meek are not the weak. They are the ones not throwing their weight around." }
    ],
    read: "It is a list of everyone a Roman official would have stepped over without looking down, told to their faces that they are the ones who win. Read it flat, in a monotone, and it still reorders the room."
  },

  "other-cheek": {
    title: "Turn the other cheek",
    gist: "Jesus quotes the old rule, <em>an eye for an eye</em> (which was itself a brake on revenge, a cap, not a license), and then drives straight past it. Get hit, offer the other side. Sued for your shirt, hand over the coat too. Then the hardest sentence in the book: love your enemies, and pray for the people hunting you. The reason he gives is almost offhand. God sends sunshine and rain on the good and the rotten alike. Be like that.",
    splits: [
      { gk: "μὴ ἀντιστῆναι τῷ πονηρῷ", gloss: "do not resist the evil one", note: "Three readings live inside one phrase: do not resist <em>evil</em> (a principle), do not resist <em>the evildoer</em> (a person), do not resist <em>the evil one</em> (the devil). Most modern versions go with the evildoer. How you read it decides whether this is about pacifism or about not trading blows with the man in front of you." },
      { gk: "ἀγαπᾶτε τοὺς ἐχθρούς", gloss: "agapate tous echthrous: love your enemies", note: "The willed <em>agapē</em> again, aimed at the people who hate you. Not like them, not feel warmly toward them. Act for their good. It is the most demanded and least obeyed line Jesus ever said." }
    ],
    read: "Tolstoy, Gandhi, and King built movements on this passage. Augustine read it as a posture of the heart, not a ban on ever resisting. Luther split it into two kingdoms, one for your private self and one for the magistrate. The text itself just says: turn the cheek, and leaves the rest to you."
  },

  "lords-prayer": {
    title: "The prayer, and the word everyone says differently",
    gist: "Jesus hands his followers a short prayer, maybe sixty words, and it became the single most-recited paragraph in human history. Which makes it the best place on earth to watch translators split, because billions of people say one line of it three different ways: forgive us our <em>debts</em>, or <em>trespasses</em>, or <em>sins</em>.",
    splits: [
      { gk: "ὀφειλήματα", gloss: "opheilēmata: debts", note: "Matthew's Greek literally says <em>debts</em>, money you owe. Tyndale kept it and the KJV followed: <em>forgive us our debts, as we forgive our debtors</em>. Luke's version of the prayer uses <em>sins</em> instead. And <em>trespasses</em> comes from Tyndale too, from his wording of the lines just after, and it lodged in the English prayer book and never left. So which word your church says is largely an accident of the 1500s." },
      { gk: "ὁ ἐπιούσιος", gloss: "epiousios: daily", note: "<em>Give us this day our daily bread.</em> The word translated <em>daily</em> appears almost nowhere else in all of Greek, and nobody is sure what it means: bread for today, bread for tomorrow, bread we need to exist. The Douay-Rheims, following the Latin, gambles on <em>supersubstantial bread</em>, which is a sentence you can stare at for a while." },
      { gk: "[ἡ βασιλεία...]", gloss: "the doxology", note: "The ringing ending, <em>For thine is the kingdom, and the power, and the glory</em>, is not in the oldest manuscripts. The KJV has it because its Greek base (the Textus Receptus) did; the RSV, NIV, and ESV drop it to a footnote. Hart prints it but in brackets, to show it was added later. Catholics leave it out of the prayer entirely. A scribe's addition that half the world now says by heart." }
    ],
    read: "Same prayer, said by more people than any other words ever written, and the English-speaking half of them cannot agree on one line of it. The split is not theological. It is a fossil of which 16th-century translator your tradition happened to inherit."
  },

  "judge-not": {
    title: "Judge not",
    gist: "Probably the most quoted and least obeyed line in the book. Do not judge, or you will be measured by your own ruler. Then the cartoon: you are squinting at the speck of sawdust in someone else's eye with a plank sticking out of your own. Deal with your own eyes first, Jesus says, and then you will see well enough to help.",
    splits: [
      { gk: "μὴ κρίνετε", gloss: "mē krinete: do not judge", note: "The verb is <em>judge</em> in the sense of condemn, pass sentence, write someone off. It is not a ban on telling right from wrong (the same sermon tells you to spot false teachers a few lines later). It is about the posture of the self-appointed judge." },
      { gk: "κάρφος / δοκός", gloss: "karphos / dokos: speck / log", note: "A splinter against a roof-beam. Every translator keeps the gag because it is the point: the gap between the two is absurd on purpose. Jesus is being funny, and the people who quote this most rarely notice." }
    ],
    read: "The favorite verse of anyone who wants you to stop criticizing them. But the line is not <em>anything goes</em>. It is: take the beam out of your own eye, <em>then</em> you can see to take the speck out of your brother's. The helping is still the goal. You just go second."
  },

  "good-samaritan": {
    title: "Who counts as your neighbor",
    gist: "A lawyer tries to test Jesus and they end up agreeing on the answer: love God, love your neighbor, the same two commandments as always. Then the lawyer goes looking for the loophole. <em>And who is my neighbor?</em> Define it, draw the line, tell me who I am off the hook for. Jesus answers with a story. A man is robbed and left bleeding in a ditch. Two respectable religious officials pass him. The one who stops is a Samaritan, a member of a group Jesus' audience genuinely despised. Then Jesus turns the question inside out.",
    splits: [
      { gk: "πλησίον", gloss: "plēsion: neighbor", note: "The lawyer wants <em>neighbor</em> to be a noun, a category of people he owes something to, with an edge he can stand outside of. Jesus refuses to define it and makes it a verb instead: which man <em>became a neighbor</em> to the one in the ditch? You do not get to ask who qualifies. You go and be one." },
      { gk: "ἐσπλαγχνίσθη", gloss: "esplanchnisthē: moved with compassion", note: "A gut word, built on the Greek for the inner organs, the bowels. The Samaritan was moved in his insides. The KJV says <em>had compassion</em>, Wright <em>was filled with pity</em>. The priest and the Levite felt nothing there, and walked on." }
    ],
    read: "The shock is gone for us, because <em>Samaritan</em> now names a charity and a hospital. Put the group you most distrust into that slot, the one you would least expect to do the right thing, and let them be the hero of the story. That is the version Jesus told."
  },

  "prodigal-son": {
    title: "The father runs",
    gist: "A son asks for his inheritance early, which in that world is close to telling his father to drop dead. He takes the money, blows all of it, ends up so hungry he envies the pigs he is feeding, and rehearses a grovelling speech to win a job back as a hired hand. The famous moment is what the father does. While the son is <em>still a long way off</em>, the father sees him, and runs. A dignified old man, hiking up his robes and running down the road, which patriarchs simply did not do. He throws a feast before the son can finish apologizing. And then the parable does something strange: it ends on the older brother, the one who did everything right, standing in the yard, furious, refusing to come in.",
    splits: [
      { gk: "ἐσπλαγχνίσθη", gloss: "esplanchnisthē: moved with compassion", note: "The same gut-deep word as the Good Samaritan. The father is hit with it in the bowels the instant he sees the boy. It is the hinge of the whole story, and the translators leave it alone because the scandal is not in the word. It is in a patriarch running." },
      { gk: "ἔδει εὐφρανθῆναι", gloss: "we had to celebrate", note: "The father's last line to the angry older son: we <em>had</em> to be glad. Not <em>chose</em> to, <em>had</em> to. The KJV's <em>it was meet</em> and the modern <em>we had to</em> both carry it. The celebration was not optional, and the dutiful son is the one left out in the cold by his own choice." }
    ],
    read: "It is the whole gospel told as a family story, and the surprise is that the father is the one who looks foolish, undignified, running. The parable ends without telling you whether the older brother ever goes inside. That blank is pointed straight at the respectable, careful people listening, which in the scene is the religious leaders, and on the page is you."
  },

  "logos": {
    title: "In the beginning was the Word",
    gist: "Three of the four Gospels start with a birth. John starts before the universe. And he reaches for a word that was loaded on every side at once: <em>Logos</em>. It meant <em>word</em>, but also <em>reason</em>, the rational order the Greeks believed ran through all things, and it rang the Hebrew bell of God's word and wisdom that spoke the world into being. John says that Logos was with God, the Logos <em>was</em> God, and then drops the sentence the whole religion turns on: the Logos became flesh, and moved into the neighborhood.",
    splits: [
      { gk: "λόγος", gloss: "logos: Word / Reason", note: "Every translator keeps <em>Word</em>, because no single English word carries the load. Hart refuses to translate it at all and prints <em>the Logos</em>, precisely so you cannot kid yourself that you already know what it means." },
      { gk: "θεὸς ἦν ὁ λόγος", gloss: "the Word was God", note: "The most fought-over grammar in the New Testament. <em>God</em> (theos) has no <em>the</em> in front of it and sits before the verb. Nearly every translator reads <em>the Word was God</em>. The Jehovah's Witnesses' New World Translation reads <em>the Word was a god</em>, treating the missing article as <em>a</em>. Greek scholars overwhelmingly reject that (a definite predicate noun before the verb routinely drops the article), but Hart's lowercase <em>and the Logos was god</em> keeps a real shading the others smooth flat: the Word shares God's nature without being a second copy of the Father." },
      { gk: "ἐσκήνωσεν", gloss: "eskēnōsen: dwelt / pitched a tent", note: "Literally <em>pitched a tent</em>, an echo of God's tent in the wilderness where he camped with his people. The KJV's <em>dwelt among us</em> is the smooth choice; Hart's <em>pitched a tent among us</em> is the literal picture, God moving into a tent on your street." }
    ],
    read: "This one verse is the seed of three hundred years of argument that ends at the Council of Nicaea, the creed, and the doctrine of the Trinity. You can rank the translators by how much of that fight they let into the grammar. The scholars hedge; the Witnesses force it open; Hart leaves the seam showing."
  },

  "john-316": {
    title: "The gospel on a poster board",
    gist: "The single most quoted sentence in the book, and the whole system folded into one line: God loved the world, gave his Son, and anyone who trusts him does not die but lives. It is on signs at football games. The next verse, the one the signs leave off, is the part that softens it: God did not send the Son to <em>condemn</em> the world, but to save it.",
    splits: [
      { gk: "τὸν κόσμον", gloss: "ton kosmon: the world", note: "The Greek is <em>kosmos</em>, the whole ordered universe, where we get <em>cosmos</em>. Hart actually writes <em>God so loved the cosmos</em>, and it stops you, because the word is bigger and stranger than <em>the world</em>, which we hear as just <em>people</em>." },
      { gk: "μονογενῆ", gloss: "monogenē: only begotten / one and only", note: "The KJV's <em>only begotten</em> sounds like a metaphysical claim about how the Son was produced. The word more plainly means <em>one of a kind</em>, <em>the only one</em>. The NIV says <em>one and only</em>; Hart, <em>the Son, the only one</em>." },
      { gk: "ζωὴν αἰώνιον", gloss: "zōēn aiōnion: eternal life", note: "<em>Everlasting life</em>, or <em>eternal life</em>, or Hart's strange but literal <em>the life of the Age</em>, because the adjective is built on <em>aiōn</em>, <em>age</em>. Whether it means life that never ends, or life that belongs to the age to come, is a real and unsettled question, and most translations quietly pick <em>never ends</em>." }
    ],
    read: "Hart renders the most worn-out verse in English as <em>For God so loved the cosmos as to give the Son, the only one, so that everyone having faith in him might not perish, but have the life of the Age</em>, and suddenly it is strange again, and you actually read it. That is the entire reason to keep more than one translation on the table."
  },

  "virgin": {
    title: "Virgin, or young woman",
    gist: "Matthew says Jesus' birth fulfills a prophecy: <em>a virgin shall conceive and bear a son</em>. He is quoting Isaiah. The trouble is what Isaiah actually wrote, and which language you read it in.",
    splits: [
      { he: "עַלְמָה", gloss: "almah: young woman", note: "The Hebrew word in Isaiah 7:14 means a young woman of marriageable age. It does not specify virginity; Hebrew has a different word for that (<em>betulah</em>). And in Isaiah's own setting it is a sign to a frightened king about a child to be born in his own lifetime, not a prophecy about someone seven centuries later." },
      { gk: "παρθένος", gloss: "parthenos: virgin", note: "When Jewish scholars translated the Hebrew Bible into Greek (the Septuagint) a couple of centuries before Jesus, they rendered <em>almah</em> here as <em>parthenos</em>, which does mean <em>virgin</em>. Matthew, writing in Greek, quotes that Greek version. So the virgin birth, read as a fulfillment of Isaiah, rides on a translation choice made by Jews before Christianity existed." },
      { gk: "RSV, 1952", gloss: "the Bible they burned", note: "When the Revised Standard Version translated Isaiah 7:14 itself as <em>a young woman shall conceive</em>, going back to the Hebrew, the backlash was literal: a North Carolina pastor burned the page from his pulpit, and a critic mailed the ashes to the head of the translation committee. In Matthew 1:23, even the RSV keeps <em>virgin</em>, because there Matthew really did quote the Greek." }
    ],
    read: "It is the cleanest example of the whole page. A doctrine held by millions turns on which language you read one sentence in. And both sides are being honest. <em>Almah</em> is <em>young woman</em>. <em>Parthenos</em> is <em>virgin</em>. Matthew quoted the one that said virgin, and built a Christmas on it."
  },

  "forgive-them": {
    title: "Father, forgive them",
    gist: "The execution. They nail him up between two criminals, and the first thing he says from the cross is not a curse but a pardon: <em>Father, forgive them, for they know not what they do.</em> Underneath him, the soldiers are rolling dice for his clothes while he says it.",
    splits: [
      { gk: "Πάτερ, ἄφες αὐτοῖς", gloss: "Father, forgive them", note: "Here is the strange part. This sentence is missing from some of the oldest and best manuscripts. Either a scribe added it, or, more likely, an early scribe cut it, uncomfortable that Jesus forgave the very people killing him. Modern translations keep it, usually with a footnote admitting the earliest copies lack it. The most Christlike line in the Bible is also one of its least certain." },
      { gk: "οὐ... οἴδασιν", gloss: "they know not", note: "Who is <em>them</em>? The soldiers driving the nails, the crowd, the leaders, everyone. The text never says, and the translators cannot narrow what the Greek leaves open. The pardon is left deliberately wide." }
    ],
    read: "Three more sayings from the cross survive in the other Gospels, including <em>My God, my God, why have you forsaken me</em>, which is itself a quote of <a href=\"hebrew-bible.html\">Psalm 22</a>. Luke chose to lead with the forgiveness. And a nervous scribe, somewhere in the first centuries, came within one stroke of a pen of deleting it."
  },

  "empty-tomb": {
    title: "The tomb, and the abrupt ending",
    gist: "The women come at dawn to anoint the body, worrying out loud about who will move the heavy stone, and find it already rolled back and the tomb empty, with a young man in white saying <em>he is risen, he is not here</em>. And then Mark, the earliest Gospel, ends. In the oldest manuscripts there is no reunion, no appearance, nothing. Just an empty tomb and three women running away too frightened to speak.",
    splits: [
      { gk: "ἠγέρθη", gloss: "ēgerthē: he is risen / he was raised", note: "The verb is passive: <em>he was raised</em>. It quietly says God did this to him, rather than that he rose under his own power. The KJV's <em>he is risen</em> loses that; the NRSV's <em>he has been raised</em> keeps it. A whole theology hides in one verb ending." },
      { gk: "ἐφοβοῦντο γάρ", gloss: "for they were afraid", note: "<em>For they were afraid.</em> That is where the best early manuscripts of Mark stop, mid-fear, no happy ending. The familiar <em>longer ending</em> (verses 9 to 20, with the snake handling and the appearances) is a later addition, and every honest modern translation brackets it or flags it. Mark really did end on a cliff." }
    ],
    read: "The earliest written claim about the resurrection is not even in a Gospel. It is Paul, in 1 Corinthians 15, reciting a list of people who said they saw Jesus alive, written about twenty years after the fact and quoting a creed older still. So the claim is early, not a legend that swelled over centuries. What you make of the claim is exactly where the believer and the skeptic shake hands and walk off in opposite directions."
  },

  "love-chapter": {
    title: "If I have not love",
    gist: "Paul breaks off an argument with a squabbling church about who has the flashier spiritual gifts, and writes the most famous paragraph on love in any language, now read at weddings by people who have no idea it was a rebuke. Without love, he says, the most spectacular gifts are just noise. Then the definition everyone half-knows: love is patient, love is kind, it does not envy or boast, it keeps no record of wrongs. And the close: faith, hope, and love remain, and the greatest is love.",
    splits: [
      { gk: "ἀγάπη", gloss: "agapē: love / charity", note: "The big one. The KJV calls it <em>charity</em> from start to finish, because the word came into English through the Latin <em>caritas</em>. But <em>charity</em> shrank over the centuries to mean handouts and tax write-offs, so every modern version switched to <em>love</em>. Same Greek word, <em>agapē</em>, the willed, self-giving kind (Greek kept separate words for desire, <em>erōs</em>, and friendship, <em>philia</em>). The most-read passage on love in history changed its key word, and most readers never noticed." },
      { gk: "χαλκὸς ἠχῶν", gloss: "chalkos ēchōn: sounding brass / noisy gong", note: "A clanging piece of metal. The KJV's <em>sounding brass</em>, the modern <em>noisy gong</em>, Hart's <em>booming gong</em>. The image holds across all of them: impressive racket, no love, nothing." },
      { gk: "δι' ἐσόπτρου ἐν αἰνίγματι", gloss: "through a glass, darkly", note: "The KJV's <em>now we see through a glass, darkly</em> is one of the most beautiful lines in English, and a book title many times over. The modern versions say <em>in a mirror, dimly</em>, which is more accurate (the mirror was polished bronze, the image murky) and far less haunting. A clean case of accuracy costing music." }
    ],
    read: "Read it in a monotone and it still holds, which is the test. There is no clever wordplay propping it up. Paul is just naming, one flat clause at a time, what love does and does not do, to a church that thought spiritual fireworks were the point."
  },

  "justified-by-faith": {
    title: "The engine room",
    gist: "This is the densest paragraph Paul ever wrote, and the one the Reformation detonated out of. The argument in three beats: everyone has sinned and falls short; nobody earns their way right with God; but God puts people in the right <em>freely, by his grace</em>, through Jesus, received by trust. The technical word in the middle, <em>a propitiation</em>, is where the translators sweat through their shirts.",
    splits: [
      { gk: "δικαιούμενοι", gloss: "dikaioumenoi: justified", note: "A courtroom word: <em>declared in the right</em>, acquitted, the verdict read out. It is the hinge of Paul's gospel and the exact word the Reformation split on. Does God <em>declare</em> the sinner righteous, a legal verdict (the Protestant read), or actually <em>make</em> them righteous over time (the Catholic read)? Same Greek verb, two churches." },
      { gk: "ἱλαστήριον", gloss: "hilastērion: propitiation / expiation / mercy seat", note: "One of the hardest words in the New Testament, and the translations openly disagree. <em>Propitiation</em> (KJV, ESV) means appeasing an angry God. <em>Expiation</em> (RSV) means wiping sin away, with no anger in the picture. And the same word is the literal name of the gold lid of the Ark, the <em>mercy seat</em> where blood was sprinkled once a year, so some keep that image instead. Which one you pick quietly rewrites what the cross is for." }
    ],
    read: "Paul says you are put right <em>freely, by his grace</em>, as a gift, not a wage. Hold that beside the letter of James, a few books over, which says faith without works is dead. Two sentences, one New Testament, and the whole argument of Western Christianity stretched between them."
  },

  "grace": {
    title: "By grace, through faith, not works",
    gist: "The verse Martin Luther's entire movement hangs on: <em>by grace you have been saved, through faith, and this is not your own doing, it is the gift of God, not a result of works, so that no one may boast.</em> Salvation is a gift, not a paycheck. But read one more verse, the one that usually gets cut off the quote, and works walk right back in.",
    splits: [
      { gk: "χάριτι... οὐκ ἐξ ἔργων", gloss: "by grace... not from works", note: "<em>By grace</em> (<em>charis</em>, a free gift) <em>through faith</em>, and pointedly <em>not from works</em>, so nobody can boast they earned it. This is the Reformation banner, the whole of <em>sola gratia</em> and <em>sola fide</em> in one breath." },
      { gk: "ἐπὶ ἔργοις ἀγαθοῖς", gloss: "for good works", note: "Then verse 10: we are <em>created in Christ Jesus for good works</em>. The works that cannot earn the gift are the very thing the gift is for. Paul puts the gift first and the works second, as fruit rather than payment, and holds both in the same sentence." }
    ],
    read: "Pull verse 9 out on its own and you get <em>faith, not works</em>, the cry that split the Western church in two. Read verse 10 and you get <em>saved for works</em>. Both are Paul, one breath apart. Keep that tension in hand for the next passage, where his own colleague pushes back."
  },

  "faith-works": {
    title: "Faith without works is dead",
    gist: "And here is the seam, the place the New Testament is most often accused of contradicting itself. Paul, a few books back, says a person is justified by faith, apart from works. James says, flatly, <em>faith without works is dead</em>, and even <em>a person is justified by works and not by faith alone</em>. He reaches for the very same example Paul used (Abraham) and lands on the opposite headline. If your faith does not feed the hungry person standing in front of you, James says, it is a corpse.",
    splits: [
      { gk: "νεκρά", gloss: "nekra: dead", note: "Faith without works is <em>dead</em>, a corpse (<em>nekros</em>). James ends on the morgue image: as a body without breath is a dead body, so faith without works is dead. No hedging, no <em>perhaps</em>." },
      { gk: "ἐξ ἔργων δικαιοῦται", gloss: "justified by works", note: "James uses Paul's exact courtroom verb, <em>justified</em>, and Paul's exact proof text, Abraham, to say what sounds like the opposite. This is not two strangers disagreeing. It is two New Testament writers using the same words to pull in different directions, in the same book millions treat as one voice." }
    ],
    read: "Luther disliked James enough to call it <em>an epistle of straw</em> and shove it to the back of his Bible. Most readers since have decided the two men are answering different questions: Paul asks how you get <em>in</em> (grace, not earning it), James asks what real faith <em>looks like</em> once you are (it acts, or it was never alive). The Catholic Church, at the Council of Trent, sided with James against Luther. The fight is not settled. It is the exact seam the Reformation tore the church along, and you are looking at both edges of the tear."
  }

};
