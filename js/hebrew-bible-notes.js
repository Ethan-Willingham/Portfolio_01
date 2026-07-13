/* ============================================================
   The Hebrew Bible, side by side: the commentary.
   Per-passage, plain-language breakdown of what each keystone
   says and where the translators split, read the way Judaism
   reads it. Written in the site voice. No em dashes in the
   prose. Light inline HTML (<em>, <b>) is allowed; it is
   injected as innerHTML by js/hebrew-bible.js.

   shape:  id: { title, gist, splits:[{he, translit, gloss, note}] }
   Keyed by passage id (see js/hebrew-bible-data.js).
   ============================================================ */
window.HB_NOTES = {

  "hillel": {
    title: "The whole Torah, standing on one foot",
    gist: "A man tells the rabbi Shammai he will convert to Judaism if Shammai can teach him the entire Torah while he stands on one foot. Shammai, a builder, chases him off with his measuring rod. The man tries Hillel, who says yes: <em>what is hateful to you, do not do to your neighbor. That is the whole Torah. The rest is commentary. Go and learn.</em> Two thousand years of how Jews read this book live in that last sentence.",
    splits: [
      { he: "וְאִידַּךְ פֵּירוּשָׁהּ הוּא", translit: "v'idakh perushah hu", gloss: "the rest is its commentary", note: "The modern Koren-Steinsaltz edition says <em>the rest is its interpretation.</em> The older Soncino says <em>the commentary thereof.</em> Same claim: the famous line is the headline, and the entire rest of the tradition, the law and the argument and the counter-argument, is the footnote you are obligated to read. This is the <b>Oral Torah</b>, the spoken tradition Jews hold was handed down alongside the written one. The book is never read alone." },
      { he: "זִיל גְּמוֹר", translit: "zil g'mor", gloss: "go and learn", note: "Two Aramaic words, and they are the engine of the whole religion. Hillel does not say go and <em>believe</em>, or go and <em>obey</em>. He says go and <em>study</em>. The summary is the door, not the room." }
    ]
  },

  "gen-creation": {
    title: "When God began to create",
    gist: "The most famous opening in any book, and the grammar is already contested in the first word. Then, in the same few lines, the claim the rest of the Hebrew Bible is built on: the human being is made <em>b'tzelem Elohim</em>, in the image of God. Not the king, not the priest. Every person.",
    splits: [
      { he: "בְּרֵאשִׁית", translit: "b'reshit", gloss: "in the beginning of", note: "The King James and the 1917 JPS read a clean statement: <em>In the beginning God created.</em> But the word is pointed as a construct, <em>in the beginning of</em>, the start of a longer clause. So the modern Jewish translations, NJPS and Alter and Fox, open <em>When God began to create</em>, and the world is already there in verse 2, unformed, with a wind over the water. Rashi argued exactly this a thousand years ago. Read his way, Genesis is not a story about making something from nothing. It is about pulling order out of a chaos that was already there." },
      { he: "תֹהוּ וָבֹהוּ", translit: "tohu va-vohu", gloss: "formless and void", note: "A rhyming pair that appears almost nowhere else in the Bible. JPS: <em>unformed and void.</em> Fox: <em>Confusion and Chaos.</em> Alter coins <em>welter and waste</em> on purpose, to do in English what the Hebrew does in sound." },
      { he: "צֶלֶם אֱלֹהִים", translit: "tzelem Elohim", gloss: "the image of God", note: "<em>And God created the human in his image.</em> This is the load-bearing verse of the whole tradition. In a world where only a king was called the image of a god, Genesis says every human is. Rabbi Akiva called it the ground of human worth. Justice, dignity, how you treat a stranger, all of it is cashed out from here." },
      { he: "נֶפֶשׁ חַיָּה", translit: "nefesh chayah", gloss: "a living being", note: "In Genesis 2:7 God breathes into the human and he becomes a <em>nefesh chayah</em>. The King James says <em>a living soul</em>, and four centuries of English readers heard a ghost installed in a body. The Hebrew does not say that. <em>Nefesh</em> is the whole breathing creature, the life itself. Alter writes <em>a living creature</em>, the very words used of the animals. This Bible is not about a soul trapped in flesh. It is about a body that lives." }
    ]
  },

  "gen-lech-lecha": {
    title: "Go forth",
    gist: "God tells Abram to leave everything that defines him, his land, his birthplace, his father's house, and go to a country he will only be shown later. In return, a promise: I will make you a great nation, and through you all the families of the earth will be blessed. This is where a people begins, and where the <b>covenant</b>, the binding two-way deal between God and Israel, starts.",
    splits: [
      { he: "לֶךְ־לְךָ", translit: "lech l'cha", gloss: "go forth / go for yourself", note: "Two words, hard to pin down. The plain sense is just <em>go.</em> But the second word, <em>l'cha</em>, literally <em>to</em> or <em>for yourself</em>, makes it personal: <em>go for yourself</em>, go and become who you are meant to be. KJV smooths it to <em>get thee out.</em> The Hebrew keeps the odd little echo." },
      { he: "וְנִבְרְכוּ", translit: "v'nivrechu", gloss: "shall be blessed / shall bless themselves", note: "The promise that all nations will be <em>blessed</em> through Abraham can also read <em>will bless themselves by</em> him. The grammar carries both and the translators pick. The difference is whether Israel is a channel of blessing to the world or just an example of it." }
    ]
  },

  "akedah": {
    title: "The binding of Isaac",
    gist: "God tells Abraham to take his son, his only son, the one he loves, and offer him up on a mountain. Abraham says one word, <em>hineni</em>, here I am, and goes. At the last second a voice stops the knife. Jews call it the <em>Akedah</em>, the binding, and read it aloud every year on the New Year. It is the hardest story in the Torah and the tradition has never agreed on what it teaches.",
    splits: [
      { he: "הִנֵּנִי", translit: "hineni", gloss: "here I am", note: "Abraham says it three times in the chapter, to God, to his son, to the angel. It does not mean <em>here</em> as a place. <em>Hineni</em> means <em>I am wholly here, ready.</em> Every translation keeps it bare, <em>here I am</em>, because the power is in how little it says while everything is at stake." },
      { he: "וְהָאֱלֹהִים נִסָּה", translit: "v'ha'Elohim nisah", gloss: "and God tested", note: "<em>God tested Abraham.</em> The King James says God did <em>tempt</em> Abraham, which now sounds like God lured him into sin; in 1611, <em>tempt</em> just meant <em>test.</em> The word matters, because the whole question of the story is what kind of God asks this, and whether passing is obedience or failure." }
    ]
  },

  "burning-bush": {
    title: "I will be what I will be",
    gist: "Moses, standing at the burning bush, asks God for a name to give the people. The answer is a riddle: <em>Ehyeh asher ehyeh.</em> Then God gives the four-letter name that Jews have not spoken aloud for more than two thousand years.",
    splits: [
      { he: "אֶהְיֶה אֲשֶׁר אֶהְיֶה", translit: "ehyeh asher ehyeh", gloss: "I will be what I will be", note: "The King James froze it into philosophy: <em>I AM THAT I AM</em>, God as pure being. But the Hebrew verb is future, not present. It is closer to <em>I will be what I will be</em>, or <em>I will be there as I will be there.</em> Alter writes <em>I-Will-Be-Who-I-Will-Be.</em> Fox: <em>I will be-there howsoever I will be-there.</em> Not a static fact but a presence that shows up, on its own terms." },
      { he: "יְהוָה", translit: "YHWH", gloss: "the Name", note: "The four letters, the <b>Tetragrammaton</b>, are built from that same verb <em>to be.</em> Jews do not pronounce it. Reading aloud, you substitute <em>Adonai</em> (my Lord); in ordinary speech, <em>Hashem</em> (the Name). KJV and JPS print <em>the LORD</em> in small capitals to mark where it stands. Fox just leaves the consonants, <em>YHWH</em>, unsayable on the page. The most important name in the book is the one you are not allowed to say." }
    ]
  },

  "decalogue": {
    title: "The ten words",
    gist: "Everyone calls them the Ten Commandments. Jews call them the <em>Aseret haDibrot</em>, the Ten Words, or Ten Statements, and they count them differently than Christians do. The very first of the ten is not a command at all.",
    splits: [
      { he: "אָנֹכִי יְהוָה אֱלֹהֶיךָ", translit: "Anochi YHWH Elohecha", gloss: "I am the LORD your God", note: "For Jews this is the <b>first</b> of the ten: <em>I am the LORD your God, who brought you out of the land of Egypt, out of the house of bondage.</em> It commands nothing. It states who is speaking and why they have the standing to ask. Most Christian traditions treat this line as a preface and start counting at <em>no other gods</em>, so their ten and the Jewish ten never quite line up. Same text, different ten." },
      { he: "דְּבָרִים", translit: "d'varim", gloss: "words / utterances", note: "The Torah never calls these <em>commandments.</em> It calls them <em>devarim</em>, words or utterances. The Jewish count reads the first <em>word</em> as the premise and the other nine as what follows from it. The freedom comes first; the rules are how you keep it." }
    ]
  },

  "holiness": {
    title: "Love your neighbor as yourself",
    gist: "Buried in the middle book of the Torah, in a chapter of seemingly scattered rules, sits the line Hillel and everyone after him built on: <em>love your neighbor as yourself.</em> It lives inside the <em>Holiness Code</em>, where being holy turns out to mean how you pay a worker, treat the deaf, and judge the poor.",
    splits: [
      { he: "וְאָהַבְתָּ לְרֵעֲךָ כָּמוֹךָ", translit: "v'ahavta l're'acha kamocha", gloss: "love your neighbor as yourself", note: "Rabbi Akiva called this <em>the great principle of the Torah.</em> His colleague Ben Azzai disagreed: the greater principle, he said, is that every human descends from the one person made in God's image (Genesis 5:1), because <em>love your neighbor</em> can quietly stop at people like you, while <em>everyone bears God's image</em> cannot. The rabbis kept both sides of the argument on the page. Alter renders <em>re'a</em> as <em>your fellow man</em>; the reach of that one word is the whole debate." },
      { he: "קְדֹשִׁים תִּהְיוּ", translit: "k'doshim tihyu", gloss: "you shall be holy", note: "The chapter opens <em>you shall be holy, for I the LORD your God am holy</em>, and then defines holy as leaving the corner of your field for the poor and keeping honest weights. <b>Holiness here is ethical, not ritual.</b> You become holy by how you treat people." }
    ]
  },

  "shema": {
    title: "Hear, O Israel",
    gist: "The closest thing Judaism has to a creed, said morning and night, taught to children, and meant to be the last words a Jew says before dying. Six Hebrew words, and then the command that follows from them: love this God with everything you have.",
    splits: [
      { he: "יְהוָה אֶחָד", translit: "Adonai echad", gloss: "the LORD is one / the LORD alone", note: "The old reading, KJV and JPS 1917: <em>the LORD our God, the LORD is one</em>, a claim about God's oneness. NJPS rereads it: <em>the LORD is our God, the LORD alone</em>, a claim about loyalty, this God and no other. Hebrew has no <em>is</em> to anchor the sentence, so both fit. One verse, and it is either metaphysics or a marriage vow." },
      { he: "וְאָהַבְתָּ", translit: "v'ahavta", gloss: "and you shall love", note: "A commanded love, <em>with all your heart, with all your soul, with all your might.</em> Alter keeps <em>nefesh</em> concrete, <em>all your being</em>, not <em>soul.</em> The Shema does not ask you to feel something. It tells you to <em>do</em> love, with your whole life, then teach it to your children and write it on your doorposts." }
    ]
  },

  "tzedek": {
    title: "Justice, justice",
    gist: "Three Hebrew words the whole prophetic tradition turns on: <em>tzedek tzedek tirdof.</em> Justice, justice, you shall pursue. The word is doubled, and biblical Hebrew does not waste words.",
    splits: [
      { he: "צֶדֶק צֶדֶק תִּרְדֹּף", translit: "tzedek tzedek tirdof", gloss: "justice, justice you shall pursue", note: "The doubling is the famous part, and the rabbis read it hard: pursue justice, but <em>only by just means</em>, or pursue it relentlessly, twice over. The verb <em>tirdof</em> is not <em>do</em> justice or <em>keep</em> it. It is <em>chase</em> it, hunt it down. Young's, ever literal, hears the other sense of the noun: <em>Righteousness, righteousness, thou dost pursue.</em>" },
      { he: "צֶדֶק", translit: "tzedek", gloss: "justice / righteousness", note: "<em>Tzedek</em> sits between two English words. It is <em>justice</em> in a courtroom and <em>righteousness</em> in a person, and the close cousin <em>tzedakah</em> became the ordinary word for <em>charity</em>, because in this tradition giving to the poor is not generosity, it is justice owed. One root holds all three." }
    ]
  },

  "choose-life": {
    title: "Choose life",
    gist: "At the end of his life Moses lays it out flat. I have set before you life and death, blessing and curse. He refuses to leave it open: <em>therefore choose life.</em> The whole Hebrew Bible faces this world, and here is the clearest reason why. The reward and the ruin are both here, now, in the land and in your children, not in a world to come.",
    splits: [
      { he: "וּבָחַרְתָּ בַּחַיִּים", translit: "uvacharta bachayim", gloss: "and you shall choose life", note: "Every translation keeps it plain, <em>choose life</em>, because the command is plain. Young's, reading the Hebrew tense over-literally, gets the strange <em>thou hast fixed on life</em>, which loses the choosing. And the choosing is the point: the covenant assumes you are free, then tells you which way to jump." }
    ]
  },

  "isaiah-justice": {
    title: "Learn to do good",
    gist: "Isaiah opens with the complaint that runs through all the prophets. God is sick of the sacrifices and festivals and prayers of people who are unjust the rest of the week. The fix is not more religion. It is to stop doing evil, learn to do good, seek justice, defend the orphan, and plead for the widow.",
    splits: [
      { he: "דִּרְשׁוּ מִשְׁפָּט", translit: "dirshu mishpat", gloss: "seek justice", note: "<em>Mishpat</em> is justice as right judgment, the correct ruling, and it is paired here with rescuing the powerless. The orphan and the widow are the prophets' standing test cases: the people with no one to defend them. How a society treats them is how Isaiah grades it." }
    ]
  },

  "almah": {
    title: "The young woman",
    gist: "One verse, and the longest-running translation fight between Jews and Christians. Isaiah tells the frightened King Ahaz that a young woman will bear a son named Immanuel, as a sign about a war happening right then. The Hebrew word is <em>almah.</em> Everything turns on it.",
    splits: [
      { he: "הָעַלְמָה", translit: "ha'almah", gloss: "the young woman", note: "<em>Almah</em> means a young woman of marriageable age. The specific Hebrew word for <em>virgin</em> is <em>betulah</em>, and this is not that word. Every Jewish translation reads <em>the young woman.</em> The King James reads <em>a virgin</em>, following the ancient Greek translation, which the Gospel of Matthew then quoted as a prophecy of a virgin birth. NJPS and JPS put it back: <em>the young woman is with child.</em>" },
      { he: "עִמָּנוּ אֵל", translit: "Immanu El", gloss: "God is with us", note: "The child's name means <em>God is with us.</em> In Isaiah's own moment it is a sign with a deadline: before this baby is old enough to choose, the kings menacing Ahaz will be gone. Read in its setting, it is about a war in the 700s BCE. Read forward by the Church, it became something else. Both readings are real. They are not the same reading, and pretending otherwise helps no one." }
    ]
  },

  "amos-justice": {
    title: "Let justice roll down",
    gist: "Amos, a shepherd by trade, delivers the most ferocious lines in the Bible against hollow worship. God says: I hate your festivals, I will not smell your offerings, take away the noise of your songs. And then the sentence Martin Luther King carried: <em>let justice roll down like waters.</em>",
    splits: [
      { he: "וְיִגַּל כַּמַּיִם מִשְׁפָּט", translit: "v'yigal kamayim mishpat", gloss: "let justice roll like waters", note: "<em>Let justice roll down like waters, and righteousness like a mighty stream.</em> The two words are back together: <em>mishpat</em> (justice) and <em>tzedakah</em> (righteousness), the prophets' inseparable pair. Young's makes the stream <em>perennial</em>, one that never runs dry, which is the picture: not a flash flood of fairness but a river that always flows." }
    ]
  },

  "micah": {
    title: "What the LORD requires",
    gist: "Micah asks what God actually wants, and runs the bids up: burnt offerings? thousands of rams? rivers of oil? my own firstborn child? Then he answers his own question, and the answer is almost insultingly simple. Three things.",
    splits: [
      { he: "עֲשׂוֹת מִשְׁפָּט וְאַהֲבַת חֶסֶד", translit: "asot mishpat v'ahavat chesed", gloss: "do justice and love kindness", note: "<em>Do justice, love</em> chesed, <em>and walk humbly with your God.</em> The middle word, <b>chesed</b>, is one of the great untranslatables: loyal love, kindness, mercy, the steady faithfulness you owe inside a relationship. KJV: <em>love mercy.</em> Young's: <em>love kindness.</em> NJPS: <em>love goodness.</em> None is wrong and none is complete." },
      { he: "הַצְנֵעַ לֶכֶת", translit: "hatzne'a lechet", gloss: "walk humbly / walk modestly", note: "<em>Walk humbly with your God.</em> Not <em>believe the right things</em> or <em>worship grandly.</em> Walk, the Bible's favorite verb for living a life, and do it modestly. The whole of religion compressed into a posture." }
    ]
  },

  "psalm-23": {
    title: "The LORD is my shepherd",
    gist: "The best-loved poem in the book, and a master class in what a translation keeps and what it costs. Everyone knows the King James music. Set it beside the Hebrew and the modern readings and you can watch a famous cadence form, and hear what it quietly smooths over.",
    splits: [
      { he: "גֵּיא צַלְמָוֶת", translit: "gei tzalmavet", gloss: "valley of deepest dark", note: "The beloved <em>valley of the shadow of death</em> (KJV) is one Hebrew word, <em>tzalmavet</em>, most likely <em>deep darkness, gloom.</em> NJPS cools it to <em>a valley of deepest darkness.</em> Alter keeps the death in it but tightens the music to <em>the vale of death's shadow.</em> The King James read a comfort into the line that the Hebrew only suggests, and it became the most quoted sentence about dying in the language." },
      { he: "נַפְשִׁי יְשׁוֹבֵב", translit: "nafshi yeshovev", gloss: "restores my life", note: "KJV: <em>he restoreth my soul.</em> There is <em>nefesh</em> again. Alter refuses the soul: <em>my life He brings back.</em> Not a spirit repaired in the next world, a life, a self, brought back from exhaustion in this one. The whole Hebrew picture of a person rides on that choice." }
    ]
  },

  "kohelet": {
    title: "Mere breath",
    gist: "The strangest book in the Bible announces, up front, that everything is <em>hevel.</em> For centuries English made that <em>vanity.</em> The word actually means <em>breath, vapor</em>, the little fog you exhale on a cold day, gone the instant it appears. Kohelet, usually called the Preacher, looks at all of human striving and calls it that.",
    splits: [
      { he: "הֲבֵל הֲבָלִים", translit: "havel havalim", gloss: "breath of breaths", note: "<em>Hevel</em> is not moral vanity and not pride. It is <em>fleeting, weightless, impossible to hold.</em> KJV and Koren keep the old <em>vanity of vanities.</em> NJPS tries <em>utter futility.</em> Alter goes back to the physical image: <em>Merest breath, said Qohelet, merest breath. All is mere breath.</em> Said that way, the book is not scolding you. It is grieving how fast it all goes." }
    ]
  },

  "job-whirlwind": {
    title: "Out of the whirlwind",
    gist: "Job, a good man, loses everything for no reason, and demands that God explain. For dozens of chapters his friends insist he must secretly deserve it. He refuses to lie about that. Finally God answers, out of a storm, and the answer is not an answer. It is a question.",
    splits: [
      { he: "מִי זֶה מַחְשִׁיךְ עֵצָה", translit: "mi zeh machshich etzah", gloss: "who is this who darkens counsel", note: "<em>Who is this who darkens counsel with words without knowledge?</em> Then God spends four chapters on the mountain goat and the ostrich and the sea and the storm, none of which has anything to do with Job's case. He never explains the suffering. He makes the questioner feel very small, and somehow Job is satisfied." }
    ]
  }

};
