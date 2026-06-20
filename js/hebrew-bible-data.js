/* ============================================================
   The Hebrew Bible, side by side: the corpus.
   Curated keystone passages of the Tanakh. Per passage: the
   pointed Masoretic Hebrew (Aramaic for the Talmud entry), a
   transliteration of the signature line, and the English
   translations stacked, all reproduced verbatim. Built by
   research/hebrew-bible/assemble.py from machine-pulled sources
   (Sefaria, getbible) plus verbatim-verified Alter and Talmud.
   See research/hebrew-bible/SOURCING.md. No em dashes in site
   prose; em dashes inside quotations are the translators' own.
   ============================================================ */
window.HB = {
 "translators": {
  "jps1917": {
   "name": "JPS",
   "year": 1917
  },
  "njps": {
   "name": "NJPS",
   "year": 1985
  },
  "alter": {
   "name": "Robert Alter",
   "year": 2018
  },
  "fox": {
   "name": "Everett Fox",
   "year": 1995
  },
  "koren": {
   "name": "Koren Jerusalem",
   "year": 1962
  },
  "kjv": {
   "name": "King James Version",
   "year": 1611
  },
  "ylt": {
   "name": "Young's Literal",
   "year": 1898
  },
  "davidson": {
   "name": "Koren Talmud (Steinsaltz)",
   "year": 2012
  },
  "soncino": {
   "name": "Soncino",
   "year": 1938
  }
 },
 "order": [
  "kjv",
  "ylt",
  "jps1917",
  "soncino",
  "koren",
  "njps",
  "fox",
  "davidson",
  "alter"
 ],
 "sections": [
  {
   "id": "talmud",
   "he": "תַּלְמוּד",
   "en": "The Oral Torah",
   "sub": "how the text is read"
  },
  {
   "id": "torah",
   "he": "תּוֹרָה",
   "en": "Torah",
   "sub": "the Teaching"
  },
  {
   "id": "neviim",
   "he": "נְבִיאִים",
   "en": "Nevi'im",
   "sub": "the Prophets"
  },
  {
   "id": "ketuvim",
   "he": "כְּתוּבִים",
   "en": "Ketuvim",
   "sub": "the Writings"
  }
 ],
 "passages": [
  {
   "id": "hillel",
   "sec": "talmud",
   "ref": "Shabbat 31a",
   "label": "On one foot",
   "he": "שׁוּב מַעֲשֶׂה בְּגוֹי אֶחָד שֶׁבָּא לִפְנֵי שַׁמַּאי. אָמַר לוֹ: גַּיְּירֵנִי עַל מְנָת שֶׁתְּלַמְּדֵנִי כׇּל הַתּוֹרָה כּוּלָּהּ כְּשֶׁאֲנִי עוֹמֵד עַל רֶגֶל אַחַת! דְּחָפוֹ בְּאַמַּת הַבִּנְיָן שֶׁבְּיָדוֹ. בָּא לִפְנֵי הִלֵּל, גַּיְירֵיהּ. אָמַר לוֹ: דַּעֲלָךְ סְנֵי לְחַבְרָךְ לָא תַּעֲבֵיד — זוֹ הִיא כׇּל הַתּוֹרָה כּוּלָּהּ, וְאִידַּךְ פֵּירוּשָׁהּ הוּא, זִיל גְּמוֹר.",
   "lang": "he",
   "translit": "Da'alakh s'nei l'chavrakh la ta'aveid; zo hi kol haTorah kulah, v'idakh perushah hu, zil g'mor.",
   "v": [
    {
     "k": "davidson",
     "t": "There was another incident involving one gentile who came before Shammai and said to Shammai: Convert me on condition that you teach me the entire Torah while I am standing on one foot. Shammai pushed him away with the builder's cubit in his hand. The same gentile came before Hillel. He converted him and said to him: That which is hateful to you do not do to another; that is the entire Torah, and the rest is its interpretation. Go study."
    },
    {
     "k": "soncino",
     "t": "On another occasion it happened that a certain heathen came before Shammai and said to him, 'Make me a proselyte, on condition that you teach me the whole Torah while I stand on one foot.' Thereupon he repulsed him with the builder's cubit which was in his hand. When he went before Hillel, he said to him, 'What is hateful to you, do not to your neighbour: that is the whole Torah, while the rest is the commentary thereof; go and learn it.'"
    }
   ]
  },
  {
   "id": "gen-creation",
   "sec": "torah",
   "ref": "Genesis 1:1-5, 26-27; 2:7",
   "label": "Creation",
   "he": "בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל־פְּנֵי תְהוֹם וְרוּחַ אֱלֹהִים מְרַחֶפֶת עַל־פְּנֵי הַמָּיִם׃ וַיֹּאמֶר אֱלֹהִים יְהִי אוֹר וַיְהִי־אוֹר׃ וַיַּרְא אֱלֹהִים אֶת־הָאוֹר כִּי־טוֹב וַיַּבְדֵּל אֱלֹהִים בֵּין הָאוֹר וּבֵין הַחֹשֶׁךְ׃ וַיִּקְרָא אֱלֹהִים לָאוֹר יוֹם וְלַחֹשֶׁךְ קָרָא לָיְלָה וַיְהִי־עֶרֶב וַיְהִי־בֹקֶר יוֹם אֶחָד׃ … וַיֹּאמֶר אֱלֹהִים נַעֲשֶׂה אָדָם בְּצַלְמֵנוּ כִּדְמוּתֵנוּ וְיִרְדּוּ בִדְגַת הַיָּם וּבְעוֹף הַשָּׁמַיִם וּבַבְּהֵמָה וּבְכָל־הָאָרֶץ וּבְכָל־הָרֶמֶשׂ הָרֹמֵשׂ עַל־הָאָרֶץ׃ וַיִּבְרָא אֱלֹהִים אֶת־הָאָדָם בְּצַלְמוֹ בְּצֶלֶם אֱלֹהִים בָּרָא אֹתוֹ זָכָר וּנְקֵבָה בָּרָא אֹתָם׃ … וַיִּיצֶר יְהוָה אֱלֹהִים אֶת־הָאָדָם עָפָר מִן־הָאֲדָמָה וַיִּפַּח בְּאַפָּיו נִשְׁמַת חַיִּים וַיְהִי הָאָדָם לְנֶפֶשׁ חַיָּה׃",
   "translit": "B'reshit bara Elohim et hashamayim v'et ha'aretz.",
   "v": [
    {
     "k": "jps1917",
     "t": "In the beginning God created the heaven and the earth. Now the earth was unformed and void, and darkness was upon the face of the deep; and the spirit of God hovered over the face of the waters. And God said: 'Let there be light.' And there was light. And God saw the light, that it was good; and God divided the light from the darkness. And God called the light Day, and the darkness He called Night. And there was evening and there was morning, one day. … And God said: 'Let us make man in our image, after our likeness; and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth, and over every creeping thing that creepeth upon the earth.' And God created man in His own image, in the image of God created He him; male and female created He them. … Then the LORD God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul."
    },
    {
     "k": "njps",
     "t": "When God began to create heaven and earth— the earth being unformed and void, with darkness over the surface of the deep and a wind from God sweeping over the water— God said, \"Let there be light\"; and there was light. God saw that the light was good, and God separated the light from the darkness. God called the light Day, and the darkness He called Night. And there was evening and there was morning, a first day. … And God said, \"Let us make man in our image, after our likeness. They shall rule the fish of the sea, the birds of the sky, the cattle, the whole earth, and all the creeping things that creep on earth.\" And God created man in His image, in the image of God He created him; male and female He created them. … the LORD God formed man from the dust of the earth. He blew into his nostrils the breath of life, and man became a living being."
    },
    {
     "k": "fox",
     "t": "At the beginning of God's creating of the heavens and the earth —now the earth was Confusion and Chaos, darkness over the face of Ocean, rushing-spirit of God soaring over the waters— God said: Let there be light! And there was light. God saw the light: that it was good. God separated the light from the darkness. God called the light: Day, and the darkness he called: Night. There was setting, there was dawning: day one. … God said: Let us make humankind, in our image, according to our likeness! They shall have dominion over the fish of the sea, the birds of the heavens, animals, all the earth, and all crawling things that crawl about on the earth! So God created humankind in his image, in the image of God did he create it, male and female he created them. … And YHWH God formed the human, of dust from the ground; he blew into his nostrils the breath of life and the human became a living being."
    },
    {
     "k": "koren",
     "t": "IN THE BEGINNING God created the heaven and the earth. And the earth was without form and void; and darkness was on the face of the deep. And a wind from God moved over the surface of the waters. And God said, Let there be light: and there was light. And God saw the light, that it was good: and God divided the light from the darkness. And God called the light Day, and the darkness He called Night. And there was evening and there was morning, one day. … And God said, Let Us make Mankind in Our image, after Our likeness: and let them have dominion over the fish of the sea, and over the birds of the air, and over the cattle, and over all the earth, and over every creeping thing that creeps on the earth. So God created Mankind in His own image, in the image of God He created him; male and female He created them. … And the Lord God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul."
    },
    {
     "k": "kjv",
     "t": "In the beginning God created the heaven and the earth. And the earth was without form and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters. And God said, Let there be light: and there was light. And God saw the light, that it was good: and God divided the light from the darkness. And God called the light Day, and the darkness he called Night. And the evening and the morning were the first day. … And God said, Let us make man in our image, after our likeness: and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth, and over every creeping thing that creepeth upon the earth. So God created man in his own image, in the image of God created he him; male and female created he them. … And the Lord God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul."
    },
    {
     "k": "ylt",
     "t": "In the beginning of God's preparing the heavens and the earth-- the earth hath existed waste and void, and darkness [is] on the face of the deep, and the Spirit of God fluttering on the face of the waters, and God saith, `Let light be;' and light is. And God seeth the light that [it is] good, and God separateth between the light and the darkness, and God calleth to the light `Day,' and to the darkness He hath called `Night;' and there is an evening, and there is a morning--day one. … And God saith, `Let Us make man in Our image, according to Our likeness, and let them rule over fish of the sea, and over fowl of the heavens, and over cattle, and over all the earth, and over every creeping thing that is creeping on the earth.' And God prepareth the man in His image; in the image of God He prepared him, a male and a female He prepared them. … And Jehovah God formeth the man--dust from the ground, and breatheth into his nostrils breath of life, and the man becometh a living creature."
    },
    {
     "k": "alter",
     "t": "When God began to create heaven and earth, and the earth then was welter and waste and darkness over the deep and God's breath hovering over the waters, God said, 'Let there be light.' And there was light. And God saw the light, that it was good, and God divided the light from the darkness. And God called the light Day, and the darkness he called Night. And it was evening and it was morning, first day. … And God created the human in his image, in the image of God he created him, male and female he created them. … Then the Lord God fashioned the human, humus from the soil, and blew into his nostrils the breath of life, and the human became a living creature."
    }
   ]
  },
  {
   "id": "gen-lech-lecha",
   "sec": "torah",
   "ref": "Genesis 12:1-3",
   "label": "Call of Abraham",
   "he": "וַיֹּאמֶר יְהוָה אֶל־אַבְרָם לֶךְ־לְךָ מֵאַרְצְךָ וּמִמּוֹלַדְתְּךָ וּמִבֵּית אָבִיךָ אֶל־הָאָרֶץ אֲשֶׁר אַרְאֶךָּ׃ וְאֶעֶשְׂךָ לְגוֹי גָּדוֹל וַאֲבָרֶכְךָ וַאֲגַדְּלָה שְׁמֶךָ וֶהְיֵה בְּרָכָה׃ וַאֲבָרֲכָה מְבָרְכֶיךָ וּמְקַלֶּלְךָ אָאֹר וְנִבְרְכוּ בְךָ כֹּל מִשְׁפְּחֹת הָאֲדָמָה׃",
   "translit": "Lech l'cha me'artz'cha umimoladt'cha umibeit avicha el ha'aretz asher ar'eka.",
   "v": [
    {
     "k": "jps1917",
     "t": "Now the LORD said unto Abram: 'Get thee out of thy country, and from thy kindred, and from thy father's house, unto the land that I will show thee. And I will make of thee a great nation, and I will bless thee, and make thy name great; and be thou a blessing. And I will bless them that bless thee, and him that curseth thee will I curse; and in thee shall all the families of the earth be blessed.'"
    },
    {
     "k": "njps",
     "t": "The LORD said to Abram, \"Go forth from your native land and from your father's house to the land that I will show you. I will make of you a great nation, And I will bless you; I will make your name great, And you shall be a blessing. I will bless those who bless you And curse him that curses you; And all the families of the earth Shall bless themselves by you.\""
    },
    {
     "k": "fox",
     "t": "YHWH said to Avram: Go-you-forth from your land, from your kindred, from your father's house, to the land that I will let you see. I will make a great nation of you and will give-you-blessing and will make your name great. Be a blessing! I will bless those blessing you, while those insulting you, I will curse. All the clans of the earth will find blessing through you!"
    },
    {
     "k": "koren",
     "t": "Now the Lord said to Avram, Get thee out of thy country, and from thy kindred, and from thy father's house, to the land that I will show thee: and I will make of thee a great nation, and I will bless thee, and make thy name great; and thou shalt be a blessing: and I will bless them that bless thee, and curse him that curses thee: and in thee shall all the families of the earth be blessed."
    },
    {
     "k": "kjv",
     "t": "Now the Lord had said unto Abram, Get thee out of thy country, and from thy kindred, and from thy father's house, unto a land that I will shew thee: And I will make of thee a great nation, and I will bless thee, and make thy name great; and thou shalt be a blessing: And I will bless them that bless thee, and curse him that curseth thee: and in thee shall all families of the earth be blessed."
    },
    {
     "k": "ylt",
     "t": "And Jehovah saith unto Abram, `Go for thyself, from thy land, and from thy kindred, and from the house of thy father, unto the land which I shew thee. And I make thee become a great nation, and bless thee, and make thy name great; and be thou a blessing. And I bless those blessing thee, and him who is disesteeming thee I curse, and blessed in thee have been all families of the ground.'"
    }
   ]
  },
  {
   "id": "akedah",
   "sec": "torah",
   "ref": "Genesis 22:1-2, 11-13",
   "label": "The binding",
   "he": "וַיְהִי אַחַר הַדְּבָרִים הָאֵלֶּה וְהָאֱלֹהִים נִסָּה אֶת־אַבְרָהָם וַיֹּאמֶר אֵלָיו אַבְרָהָם וַיֹּאמֶר הִנֵּנִי׃ וַיֹּאמֶר קַח־נָא אֶת־בִּנְךָ אֶת־יְחִידְךָ אֲשֶׁר־אָהַבְתָּ אֶת־יִצְחָק וְלֶךְ־לְךָ אֶל־אֶרֶץ הַמֹּרִיָּה וְהַעֲלֵהוּ שָׁם לְעֹלָה עַל אַחַד הֶהָרִים אֲשֶׁר אֹמַר אֵלֶיךָ׃ … וַיִּקְרָא אֵלָיו מַלְאַךְ יְהוָה מִן־הַשָּׁמַיִם וַיֹּאמֶר אַבְרָהָם אַבְרָהָם וַיֹּאמֶר הִנֵּנִי׃ וַיֹּאמֶר אַל־תִּשְׁלַח יָדְךָ אֶל־הַנַּעַר וְאַל־תַּעַשׂ לוֹ מְאוּמָּה כִּי עַתָּה יָדַעְתִּי כִּי־יְרֵא אֱלֹהִים אַתָּה וְלֹא חָשַׂכְתָּ אֶת־בִּנְךָ אֶת־יְחִידְךָ מִמֶּנִּי׃ וַיִּשָּׂא אַבְרָהָם אֶת־עֵינָיו וַיַּרְא וְהִנֵּה־אַיִל אַחַר נֶאֱחַז בַּסְּבַךְ בְּקַרְנָיו וַיֵּלֶךְ אַבְרָהָם וַיִּקַּח אֶת־הָאַיִל וַיַּעֲלֵהוּ לְעֹלָה תַּחַת בְּנוֹ׃",
   "translit": "Vayomer hineni. (“Here I am.”)",
   "v": [
    {
     "k": "jps1917",
     "t": "And it came to pass after these things, that God did prove Abraham, and said unto him: 'Abraham'; and he said: 'Here am I.' And He said: 'Take now thy son, thine only son, whom thou lovest, even Isaac, and get thee into the land of Moriah; and offer him there for a burnt-offering upon one of the mountains which I will tell thee of.' … And the angel of the LORD called unto him out of heaven, and said: 'Abraham, Abraham.' And he said: 'Here am I.' And he said: 'Lay not thy hand upon the lad, neither do thou any thing unto him; for now I know that thou art a God-fearing man, seeing thou hast not withheld thy son, thine only son, from Me.' And Abraham lifted up his eyes, and looked, and behold behind him a ram caught in the thicket by his horns. And Abraham went and took the ram, and offered him up for a burnt-offering in the stead of his son."
    },
    {
     "k": "njps",
     "t": "Some time afterward, God put Abraham to the test. He said to him, \"Abraham,\" and he answered, \"Here I am.\" And He said, \"Take your son, your favored one, Isaac, whom you love, and go to the land of Moriah, and offer him there as a burnt offering on one of the heights that I will point out to you.\" … Then an angel of the LORD called to him from heaven: \"Abraham! Abraham!\" And he answered, \"Here I am.\" And he said, \"Do not raise your hand against the boy, or do anything to him. For now I know that you fear God, since you have not withheld your son, your favored one, from Me.\" When Abraham looked up, his eye fell upon a ram, caught in the thicket by its horns. So Abraham went and took the ram and offered it up as a burnt offering in place of his son."
    },
    {
     "k": "fox",
     "t": "Now after these events it was that God tested Avraham and said to him: Avraham! He said: Here I am. He said: Pray take your son, your only one, whom you love, Yitzhak, and go-you-forth to the land of Moriyya/Seeing, and offer him up there as an offering-up on one of the mountains that I will tell you of. … But YHWH'S messenger called to him from heaven and said: Avraham! Avraham! He said: Here I am. He said: Do not stretch out your hand against the lad, do not do anything to him! For now I know that you are in awe of God— you have not withheld your son, your only one, from me. Avraham lifted up his eyes and saw: here, a ram caught behind in the thicket by its horns! Avraham went, he took the ram and offered it up as an offering-up in place of his son."
    },
    {
     "k": "koren",
     "t": "And it came to pass after these things, that God did test Avraham, and said to him, Avraham: and he said, Here I am! And He said, Take now thy son, thy only son Yiżĥaq, whom thou lovest, and get thee into the land of Moriyya; and offer him there for a burnt offering upon one of the mountains which I will tell thee of. … And an angel of the Lord called to him out of heaven, and said, Avraham, Avraham: and he said, Here I am. And he said, Lay not thy hand upon the lad, neither do anything to him: for now I know that thou fearest God, seeing thou hast not withheld thy son, thy only son from me. And Avraham lifted up his eyes, and looked and behold behind him a ram caught in the thicket by his horns: and Avraham went and took the ram, and offered him up for a burnt offering in place of his son."
    },
    {
     "k": "kjv",
     "t": "And it came to pass after these things, that God did tempt Abraham, and said unto him, Abraham: and he said, Behold, here I am. And he said, Take now thy son, thine only son Isaac, whom thou lovest, and get thee into the land of Moriah; and offer him there for a burnt offering upon one of the mountains which I will tell thee of. … And the angel of the Lord called unto him out of heaven, and said, Abraham, Abraham: and he said, Here am I. And he said, Lay not thine hand upon the lad, neither do thou any thing unto him: for now I know that thou fearest God, seeing thou hast not withheld thy son, thine only son from me. And Abraham lifted up his eyes, and looked, and behold behind him a ram caught in a thicket by his horns: and Abraham went and took the ram, and offered him up for a burnt offering in the stead of his son."
    },
    {
     "k": "ylt",
     "t": "And it cometh to pass after these things that God hath tried Abraham, and saith unto him, `Abraham;' and he saith, `Here [am] I.' And He saith, `Take, I pray thee, thy son, thine only one, whom thou hast loved, even Isaac, and go for thyself unto the land of Moriah, and cause him to ascend there for a burnt-offering on one of the mountains of which I speak unto thee.' … And the messenger of Jehovah calleth unto him from the heavens, and saith, `Abraham, Abraham;' and he saith, `Here [am] I;' and He saith, `Put not forth thine hand unto the youth, nor do anything to him, for now I have known that thou art fearing God, and hast not withheld thy son, thine only one, from Me.' And Abraham lifteth up his eyes, and looketh, and lo, a ram behind, seized in a thicket by its horns; and Abraham goeth, and taketh the ram, and causeth it to ascend for a burnt-offering instead of his son;"
    }
   ]
  },
  {
   "id": "burning-bush",
   "sec": "torah",
   "ref": "Exodus 3:13-15",
   "label": "The Name",
   "he": "וַיֹּאמֶר מֹשֶׁה אֶל־הָאֱלֹהִים הִנֵּה אָנֹכִי בָא אֶל־בְּנֵי יִשְׂרָאֵל וְאָמַרְתִּי לָהֶם אֱלֹהֵי אֲבוֹתֵיכֶם שְׁלָחַנִי אֲלֵיכֶם וְאָמְרוּ־לִי מַה־שְּׁמוֹ מָה אֹמַר אֲלֵהֶם׃ וַיֹּאמֶר אֱלֹהִים אֶל־מֹשֶׁה אֶהְיֶה אֲשֶׁר אֶהְיֶה וַיֹּאמֶר כֹּה תֹאמַר לִבְנֵי יִשְׂרָאֵל אֶהְיֶה שְׁלָחַנִי אֲלֵיכֶם׃ וַיֹּאמֶר עוֹד אֱלֹהִים אֶל־מֹשֶׁה כֹּה־תֹאמַר אֶל־בְּנֵי יִשְׂרָאֵל יְהוָה אֱלֹהֵי אֲבֹתֵיכֶם אֱלֹהֵי אַבְרָהָם אֱלֹהֵי יִצְחָק וֵאלֹהֵי יַעֲקֹב שְׁלָחַנִי אֲלֵיכֶם זֶה־שְּׁמִי לְעֹלָם וְזֶה זִכְרִי לְדֹר דֹּר׃",
   "translit": "Ehyeh asher ehyeh.",
   "v": [
    {
     "k": "jps1917",
     "t": "And Moses said unto God: 'Behold, when I come unto the children of Israel, and shall say unto them: The God of your fathers hath sent me unto you; and they shall say to me: What is His name? what shall I say unto them?' And God said unto Moses: 'I AM THAT I AM'; and He said: 'Thus shalt thou say unto the children of Israel: I AM hath sent me unto you.' And God said moreover unto Moses: 'Thus shalt thou say unto the children of Israel: The LORD, the God of your fathers, the God of Abraham, the God of Isaac, and the God of Jacob, hath sent me unto you; this is My name for ever, and this is My memorial unto all generations."
    },
    {
     "k": "njps",
     "t": "Moses said to God, \"When I come to the Israelites and say to them, 'The God of your fathers has sent me to you,' and they ask me, 'What is His name?' what shall I say to them?\" And God said to Moses, \"Ehyeh-Asher-Ehyeh.\" He continued, \"Thus shall you say to the Israelites, 'Ehyeh sent me to you.'\" And God said further to Moses, \"Thus shall you speak to the Israelites: The LORD, the God of your fathers, the God of Abraham, the God of Isaac, and the God of Jacob, has sent me to you: This shall be My name forever, This My appellation for all eternity."
    },
    {
     "k": "fox",
     "t": "Moshe said to God: Here, I will come to the Children of Israel and I will say to them: The God of your fathers has sent me to you, but they will say to me: What is his name?— what shall I say to them? God said to Moshe: Ehyeh Asher Ehyeh/I will be however I will be. And he said: Thus shall you say to the Children of Israel: EHYEH/I-WILL-BE has sent me to you. And God said further to Moshe: Thus shall you say to the Children of Israel: YHWH, the God of your fathers, the God of Avraham, the God of Yitzhak, and the God of Yaakov, has sent me to you. That is my name for the ages, that is my title [from] generation to generation."
    },
    {
     "k": "koren",
     "t": "And Moshe said to God, Behold, when I come to the children of Yisra᾽el, and shall say to them, The God of your fathers has sent me to you; and they shall say to me, What is his name? what shall I say to them? And God said to Moshe, Eheye Asher Eheye (I will ever be what I now am): and he said, Thus shalt thou say to the children of Yisra᾽el, Eheye (I Am) has sent me to you. And God said moreover to Moshe, Thus shalt thou say to the children of Yisra᾽el, The Lord God of your fathers, the God of Avraham the God of Yiżĥaq, and the God of Ya῾aqov, has sent me to you: this is my name for ever, and this is my memorial to all generations."
    },
    {
     "k": "kjv",
     "t": "And Moses said unto God, Behold, when I come unto the children of Israel, and shall say unto them, The God of your fathers hath sent me unto you; and they shall say to me, What is his name? what shall I say unto them? And God said unto Moses, I AM THAT I AM: and he said, Thus shalt thou say unto the children of Israel, I AM hath sent me unto you. And God said moreover unto Moses, Thus shalt thou say unto the children of Israel, The Lord God of your fathers, the God of Abraham, the God of Isaac, and the God of Jacob, hath sent me unto you: this is my name for ever, and this is my memorial unto all generations."
    },
    {
     "k": "ylt",
     "t": "And Moses saith unto God, `Lo, I am coming unto the sons of Israel, and have said to them, The God of your fathers hath sent me unto you, and they have said to me, What [is] His name? what do I say unto them?' And God saith unto Moses, `I AM THAT WHICH I AM;' He saith also, `Thus dost thou say to the sons of Israel, I AM hath sent me unto you.' And God saith again unto Moses, `Thus dost thou say unto the sons of Israel, Jehovah, God of your fathers, God of Abraham, God of Isaac, and God of Jacob, hath sent me unto you; this [is] My name--to the age, and this My memorial, to generation--generation."
    }
   ]
  },
  {
   "id": "decalogue",
   "sec": "torah",
   "ref": "Exodus 20:1-6",
   "label": "Ten Words",
   "he": "וַיְדַבֵּר אֱלֹהִים אֵת כָּל־הַדְּבָרִים הָאֵלֶּה לֵאמֹר׃ אָנֹכִי יְהוָה אֱלֹהֶיךָ אֲשֶׁר הוֹצֵאתִיךָ מֵאֶרֶץ מִצְרַיִם מִבֵּית עֲבָדִים׃ לֹא יִהְיֶה־לְךָ אֱלֹהִים אֲחֵרִים עַל־פָּנָיַ לֹא תַעֲשֶׂה־לְךָ פֶסֶל וְכָל־תְּמוּנָה אֲשֶׁר בַּשָּׁמַיִם מִמַּעַל וַאֲשֶׁר בָּאָרֶץ מִתַָּחַת וַאֲשֶׁר בַּמַּיִם מִתַּחַת לָאָרֶץ לֹא־תִשְׁתַּחְוֶה לָהֶם וְלֹא תָעָבְדֵם כִּי אָנֹכִי יְהוָה אֱלֹהֶיךָ אֵל קַנָּא פֹּקֵד עֲוֺן אָבֹת עַל־בָּנִים עַל־שִׁלֵּשִׁים וְעַל־רִבֵּעִים לְשֹׂנְאָי׃ וְעֹשֶׂה חֶסֶד לַאֲלָפִים לְאֹהֲבַי וּלְשֹׁמְרֵי מִצְוֺתָי׃",
   "translit": "Anochi Adonai Elohecha asher hotzeticha me'eretz Mitzrayim.",
   "v": [
    {
     "k": "jps1917",
     "t": "And God spoke all these words, saying: I am the LORD thy God, who brought thee out of the land of Egypt, out of the house of bondage. Thou shalt have no other gods before Me. Thou shalt not make unto thee a graven image, nor any manner of likeness, of any thing that is in heaven above, or that is in the earth beneath, or that is in the water under the earth; thou shalt not bow down unto them, nor serve them; for I the LORD thy God am a jealous God, visiting the iniquity of the fathers upon the children unto the third and fourth generation of them that hate Me; and showing mercy unto the thousandth generation of them that love Me and keep My commandments."
    },
    {
     "k": "njps",
     "t": "God spoke all these words, saying: I the LORD am your God who brought you out of the land of Egypt, the house of bondage: You shall have no other gods besides Me. You shall not make for yourself a sculptured image, or any likeness of what is in the heavens above, or on the earth below, or in the waters under the earth. You shall not bow down to them or serve them. For I the LORD your God am an impassioned God, visiting the guilt of the parents upon the children, upon the third and upon the fourth generations of those who reject Me, but showing kindness to the thousandth generation of those who love Me and keep My commandments."
    },
    {
     "k": "fox",
     "t": "God spoke all these words, saying: I am YHWH your God, who brought you out from the land of Egypt, from a house of serfs. You are not to have any other gods before my presence. You are not to make yourself a carved-image or any figure that is in the heavens above, that is on the earth beneath, that is in the waters beneath the earth; you are not to bow down to them and you are not to serve them, for I, YHWH your God, am a zealous God, calling-to-account the iniquity of the fathers upon the sons, to the third and the fourth [generation] of those hating me, but showing loyalty to the thousandth of those loving me, of those keeping my commandments."
    },
    {
     "k": "koren",
     "t": "And God spoke all these words, saying, I am the Lord thy God, who have brought thee out of the land of Miżrayim, out of the house of bondage. Thou shalt have no other gods beside me. Thou shalt not make for thyself any carved idol, or any likeness of any thing that is in heaven above, or that is in the earth beneath, or that is in the water under the earth: thou shalt not bow down to them, nor serve them: for I the Lord thy God am a jealous God, punishing the iniquity of the fathers upon the children unto the third and fourth generation of those that hate me; but showing mercy to thousands of generations of those that love me, and keep my commandments."
    },
    {
     "k": "kjv",
     "t": "And God spake all these words, saying, I am the Lord thy God, which have brought thee out of the land of Egypt, out of the house of bondage. Thou shalt have no other gods before me. Thou shalt not make unto thee any graven image, or any likeness of any thing that is in heaven above, or that is in the earth beneath, or that is in the water under the earth: Thou shalt not bow down thyself to them, nor serve them: for I the Lord thy God am a jealous God, visiting the iniquity of the fathers upon the children unto the third and fourth generation of them that hate me; And shewing mercy unto thousands of them that love me, and keep my commandments."
    },
    {
     "k": "ylt",
     "t": "`And God speaketh all these words, saying, I [am] Jehovah thy God, who hath brought thee out of the land of Egypt, out of a house of servants. `Thou hast no other Gods before Me. `Thou dost not make to thyself a graven image, or any likeness which [is] in the heavens above, or which [is] in the earth beneath, or which [is] in the waters under the earth. Thou dost not bow thyself to them, nor serve them: for I, Jehovah thy God, [am] a zealous God, charging iniquity of fathers on sons, on the third [generation] , and on the fourth, of those hating Me, and doing kindness to thousands, of those loving Me and keeping My commands."
    }
   ]
  },
  {
   "id": "holiness",
   "sec": "torah",
   "ref": "Leviticus 19:1-2, 17-18",
   "label": "Love your neighbor",
   "he": "וַיְדַבֵּר יְהוָה אֶל־מֹשֶׁה לֵּאמֹר דַּבֵּר אֶל־כָּל־עֲדַת בְּנֵי־יִשְׂרָאֵל וְאָמַרְתָּ אֲלֵהֶם קְדֹשִׁים תִּהְיוּ כִּי קָדוֹשׁ אֲנִי יְהוָה אֱלֹהֵיכֶם׃ … לֹא־תִשְׂנָא אֶת־אָחִיךָ בִּלְבָבֶךָ הוֹכֵחַ תּוֹכִיחַ אֶת־עֲמִיתֶךָ וְלֹא־תִשָּׂא עָלָיו חֵטְא׃ לֹא־תִקֹּם וְלֹא־תִטֹּר אֶת־בְּנֵי עַמֶּךָ וְאָהַבְתָּ לְרֵעֲךָ כָּמוֹךָ אֲנִי יְהוָה׃",
   "translit": "V'ahavta l're'acha kamocha, ani Adonai.",
   "v": [
    {
     "k": "jps1917",
     "t": "And the LORD spoke unto Moses, saying: Speak unto all the congregation of the children of Israel, and say unto them: Ye shall be holy; for I the LORD your God am holy. … Thou shalt not hate thy brother in thy heart; thou shalt surely rebuke thy neighbour, and not bear sin because of him. Thou shalt not take vengeance, nor bear any grudge against the children of thy people, but thou shalt love thy neighbour as thyself: I am the LORD."
    },
    {
     "k": "njps",
     "t": "The LORD spoke to Moses, saying: Speak to the whole Israelite community and say to them: You shall be holy, for I, the LORD your God, am holy. … You shall not hate your kinsfolk in your heart. Reprove your kinsman but incur no guilt because of him. You shall not take vengeance or bear a grudge against your countrymen. Love your fellow as yourself: I am the LORD."
    },
    {
     "k": "fox",
     "t": "YHWH spoke to Moshe, saying: Speak to the entire community of the Children of Israel, and say to them: Holy are you to be, for holy am I, YHWH your God! … You are not to hate your brother in your heart; rebuke, yes, rebuke your fellow, that you not bear sin because of him! You are not to take-vengeance, you are not to retain-anger against the sons of your kinspeople— but be loving to your neighbor [as one] like yourself; I am YHWH!"
    },
    {
     "k": "koren",
     "t": "And the Lord spoke to Moshe saying, Speak to all the congregation of the children of Yisra᾽el, and say to them, You shall be holy: for I the Lord your God am holy. … Thou shalt not hate thy brother in thy heart: thou shalt certainly rebuke thy neighbour, and not suffer sin on his account. Thou shalt not avenge, nor bear any grudge against the children of thy people, but thou shalt love thy neighbour as thyself: I am the Lord."
    },
    {
     "k": "kjv",
     "t": "And the Lord spake unto Moses, saying, Speak unto all the congregation of the children of Israel, and say unto them, Ye shall be holy: for I the Lord your God am holy. … Thou shalt not hate thy brother in thine heart: thou shalt in any wise rebuke thy neighbour, and not suffer sin upon him. Thou shalt not avenge, nor bear any grudge against the children of thy people, but thou shalt love thy neighbour as thyself: I am the Lord."
    },
    {
     "k": "ylt",
     "t": "And Jehovah speaketh unto Moses, saying, `Speak unto all the company of the sons of Israel, and thou hast said unto them, Ye are holy, for holy [am] I, Jehovah, your God. … `Thou dost not hate thy brother in thy heart; thou dost certainly reprove thy fellow, and not suffer sin on him. `Thou dost not take vengeance, nor watch the sons of thy people; and thou hast had love to thy neighbour as thyself; I [am] Jehovah."
    }
   ]
  },
  {
   "id": "shema",
   "sec": "torah",
   "ref": "Deuteronomy 6:4-9",
   "label": "The Shema",
   "he": "שְׁמַע יִשְׂרָאֵל יְהוָה אֱלֹהֵינוּ יְהוָה אֶחָד׃ וְאָהַבְתָּ אֵת יְהוָה אֱלֹהֶיךָ בְּכָל־לְבָבְךָ וּבְכָל־נַפְשְׁךָ וּבְכָל־מְאֹדֶךָ׃ וְהָיוּ הַדְּבָרִים הָאֵלֶּה אֲשֶׁר אָנֹכִי מְצַוְּךָ הַיּוֹם עַל־לְבָבֶךָ׃ וְשִׁנַּנְתָּם לְבָנֶיךָ וְדִבַּרְתָּ בָּם בְּשִׁבְתְּךָ בְּבֵיתֶךָ וּבְלֶכְתְּךָ בַדֶּרֶךְ וּבְשָׁכְבְּךָ וּבְקוּמֶךָ׃ וּקְשַׁרְתָּם לְאוֹת עַל־יָדֶךָ וְהָיוּ לְטֹטָפֹת בֵּין עֵינֶיךָ׃ וּכְתַבְתָּם עַל־מְזוּזֹת בֵּיתֶךָ וּבִשְׁעָרֶיךָ׃",
   "translit": "Sh'ma Yisrael, Adonai Eloheinu, Adonai echad. V'ahavta et Adonai Elohecha.",
   "v": [
    {
     "k": "jps1917",
     "t": "HEAR, O ISRAEL: THE LORD OUR GOD, THE LORD IS ONE. And thou shalt love the LORD thy God with all thy heart, and with all thy soul, and with all thy might. And these words, which I command thee this day, shall be upon thy heart; and thou shalt teach them diligently unto thy children, and shalt talk of them when thou sittest in thy house, and when thou walkest by the way, and when thou liest down, and when thou risest up. And thou shalt bind them for a sign upon thy hand, and they shall be for frontlets between thine eyes. And thou shalt write them upon the door-posts of thy house, and upon thy gates."
    },
    {
     "k": "njps",
     "t": "Hear, O Israel! The LORD is our God, the LORD alone. You shall love the LORD your God with all your heart and with all your soul and with all your might. Take to heart these instructions with which I charge you this day. Impress them upon your children. Recite them when you stay at home and when you are away, when you lie down and when you get up. Bind them as a sign on your hand and let them serve as a symbol on your forehead; inscribe them on the doorposts of your house and on your gates."
    },
    {
     "k": "fox",
     "t": "Hearken O Israel: YHWH our God, YHWH is One! So you are to love YHWH your God with all your heart, with all your being, with all your substance! And these words, which I myself command you today, are to be upon your heart. You are to repeat them with your children and are to speak of them in your sitting in your house and in your walking in the way, in your lying down and in your rising up. You are to tie them as a sign upon your hand, and they are to be for bands between your eyes. And you are to write them upon the doorposts of your house and on your gates."
    },
    {
     "k": "koren",
     "t": "Hear, O Yisra᾽el: The Lord our God; the Lord is one. And thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy might. And these words, which I command thee this day, shall be in thy heart: and thou shalt teach them diligently to thy children, and shalt talk of them when thou sittest in thy house, and when thou walkest by the way, and when thou liest down, and when thou risest up. And thou shalt bind them for a sign upon thy arm, and they shall be as frontlets between thy eyes. And thou shalt write them upon the doorposts of thy house, and on thy gates."
    },
    {
     "k": "kjv",
     "t": "Hear, O Israel: The Lord our God is one Lord: And thou shalt love the Lord thy God with all thine heart, and with all thy soul, and with all thy might. And these words, which I command thee this day, shall be in thine heart: And thou shalt teach them diligently unto thy children, and shalt talk of them when thou sittest in thine house, and when thou walkest by the way, and when thou liest down, and when thou risest up. And thou shalt bind them for a sign upon thine hand, and they shall be as frontlets between thine eyes. And thou shalt write them upon the posts of thy house, and on thy gates."
    },
    {
     "k": "ylt",
     "t": "`Hear, O Israel, Jehovah our God [is] one Jehovah; and thou hast loved Jehovah thy God with all thy heart, and with all thy soul, and with all thy might, and these words which I am commanding thee to-day have been on thine heart, and thou hast repeated them to thy sons, and spoken of them in thy sitting in thine house, and in thy walking in the way, and in thy lying down, and in thy rising up, and hast bound them for a sign upon thy hand, and they have been for frontlets between thine eyes, and thou hast written them on door-posts of thy house, and on thy gates."
    }
   ]
  },
  {
   "id": "tzedek",
   "sec": "torah",
   "ref": "Deuteronomy 16:18-20",
   "label": "Justice, justice",
   "he": "שֹׁפְטִים וְשֹׁטְרִים תִּתֶּן־לְךָ בְּכָל־שְׁעָרֶיךָ אֲשֶׁר יְהוָה אֱלֹהֶיךָ נֹתֵן לְךָ לִשְׁבָטֶיךָ וְשָׁפְטוּ אֶת־הָעָם מִשְׁפַּט־צֶדֶק׃ לֹא־תַטֶּה מִשְׁפָּט לֹא תַכִּיר פָּנִים וְלֹא־תִקַּח שֹׁחַד כִּי הַשֹּׁחַד יְעַוֵּר עֵינֵי חֲכָמִים וִיסַלֵּף דִּבְרֵי צַדִּיקִם׃ צֶדֶק צֶדֶק תִּרְדֹּף לְמַעַן תִּחְיֶה וְיָרַשְׁתָּ אֶת־הָאָרֶץ אֲשֶׁר־יְהוָה אֱלֹהֶיךָ נֹתֵן לָךְ׃",
   "translit": "Tzedek tzedek tirdof.",
   "v": [
    {
     "k": "jps1917",
     "t": "Judges and officers shalt thou make thee in all thy gates, which the LORD thy God giveth thee, tribe by tribe; and they shall judge the people with righteous judgment. Thou shalt not wrest judgment; thou shalt not respect persons; neither shalt thou take a gift; for a gift doth blind the eyes of the wise, and pervert the words of the righteous. Justice, justice shalt thou follow, that thou mayest live, and inherit the land which the LORD thy God giveth thee."
    },
    {
     "k": "njps",
     "t": "You shall appoint magistrates and officials for your tribes, in all the settlements that the LORD your God is giving you, and they shall govern the people with due justice. You shall not judge unfairly: you shall show no partiality; you shall not take bribes, for bribes blind the eyes of the discerning and upset the plea of the just. Justice, justice shall you pursue, that you may thrive and occupy the land that the LORD your God is giving you."
    },
    {
     "k": "fox",
     "t": "Judges and officials you are to provide for yourselves, within all your gates that YHWH your God is giving you, for your tribal-districts; they are to judge the people [with] equitable justice. You are not to cast aside a case-for-judgment, you are not to [specially] recognize [anyone's] face, and you are not to take a bribe —for a bribe blinds the eyes of the wise, and twists the words of the equitable. Equity, equity you are to pursue, in order that you may live and possess the land that YHWH your God is giving you!"
    },
    {
     "k": "koren",
     "t": "Judges and officers shalt thou make thee in all thy gates, which the Lord thy God gives thee, throughout thy tribes: and they shall judge the people with righteous judgment. Thou shalt not wrest judgment; thou shalt not respect persons, neither take a bribe: for a bribe blinds the eyes of the wise, and perverts the words of the righteous. Justice, only justice shalt thou pursue, that thou mayst live, and inherit the land which the Lord thy God gives thee."
    },
    {
     "k": "kjv",
     "t": "Judges and officers shalt thou make thee in all thy gates, which the Lord thy God giveth thee, throughout thy tribes: and they shall judge the people with just judgment. Thou shalt not wrest judgment; thou shalt not respect persons, neither take a gift: for a gift doth blind the eyes of the wise, and pervert the words of the righteous. That which is altogether just shalt thou follow, that thou mayest live, and inherit the land which the Lord thy God giveth thee."
    },
    {
     "k": "ylt",
     "t": "`Judges and authorities thou dost make to thee within all thy gates which Jehovah thy God is giving to thee, for thy tribes; and they have judged the people--a righteous judgment. Thou dost not turn aside judgment; thou dost not discern faces, nor take a bribe, for the bribe blindeth the eyes of the wise, and perverteth the words of the righteous. Righteousness--righteousness thou dost pursue, so that thou livest, and hast possessed the land which Jehovah thy God is giving to thee."
    }
   ]
  },
  {
   "id": "choose-life",
   "sec": "torah",
   "ref": "Deuteronomy 30:15-20",
   "label": "Choose life",
   "he": "רְאֵה נָתַתִּי לְפָנֶיךָ הַיּוֹם אֶת־הַחַיִּים וְאֶת־הַטּוֹב וְאֶת־הַמָּוֶת וְאֶת־הָרָע׃ אֲשֶׁר אָנֹכִי מְצַוְּךָ הַיּוֹם לְאַהֲבָה אֶת־יְהוָה אֱלֹהֶיךָ לָלֶכֶת בִּדְרָכָיו וְלִשְׁמֹר מִצְוֺתָיו וְחֻקֹּתָיו וּמִשְׁפָּטָיו וְחָיִיתָ וְרָבִיתָ וּבֵרַכְךָ יְהוָה אֱלֹהֶיךָ בָּאָרֶץ אֲשֶׁר־אַתָּה בָא־שָׁמָּה לְרִשְׁתָּהּ׃ וְאִם־יִפְנֶה לְבָבְךָ וְלֹא תִשְׁמָע וְנִדַּחְתָּ וְהִשְׁתַּחֲוִיתָ לֵאלֹהִים אֲחֵרִים וַעֲבַדְתָּם׃ הִגַּדְתִּי לָכֶם הַיּוֹם כִּי אָבֹד תֹּאבֵדוּן לֹא־תַאֲרִיכֻן יָמִים עַל־הָאֲדָמָה אֲשֶׁר אַתָּה עֹבֵר אֶת־הַיַּרְדֵּן לָבֹא שָׁמָּה לְרִשְׁתָּהּ׃ הַעִידֹתִי בָכֶם הַיּוֹם אֶת־הַשָּׁמַיִם וְאֶת־הָאָרֶץ הַחַיִּים וְהַמָּוֶת נָתַתִּי לְפָנֶיךָ הַבְּרָכָה וְהַקְּלָלָה וּבָחַרְתָּ בַּחַיִּים לְמַעַן תִּחְיֶה אַתָּה וְזַרְעֶךָ׃ לְאַהֲבָה אֶת־יְהוָה אֱלֹהֶיךָ לִשְׁמֹעַ בְּקֹלוֹ וּלְדָבְקָה־בוֹ כִּי הוּא חַיֶּיךָ וְאֹרֶךְ יָמֶיךָ לָשֶׁבֶת עַל־הָאֲדָמָה אֲשֶׁר נִשְׁבַּע יְהוָה לַאֲבֹתֶיךָ לְאַבְרָהָם לְיִצְחָק וּלְיַעֲקֹב לָתֵת לָהֶם׃",
   "translit": "Uvacharta bachayim, l'ma'an tichyeh atah v'zar'echa.",
   "v": [
    {
     "k": "jps1917",
     "t": "See, I have set before thee this day life and good, and death and evil, in that I command thee this day to love the LORD thy God, to walk in His ways, and to keep His commandments and His statutes and His ordinances; then thou shalt live and multiply, and the LORD thy God shall bless thee in the land whither thou goest in to possess it. But if thy heart turn away, and thou wilt not hear, but shalt be drawn away, and worship other gods, and serve them; I declare unto you this day, that ye shall surely perish; ye shall not prolong your days upon the land, whither thou passest over the Jordan to go in to possess it. I call heaven and earth to witness against you this day, that I have set before thee life and death, the blessing and the curse; therefore choose life, that thou mayest live, thou and thy seed; to love the LORD thy God, to hearken to His voice, and to cleave unto Him; for that is thy life, and the length of thy days; that thou mayest dwell in the land which the LORD swore unto thy fathers, to Abraham, to Isaac, and to Jacob, to give them."
    },
    {
     "k": "njps",
     "t": "See, I set before you this day life and prosperity, death and adversity. For I command you this day, to love the LORD your God, to walk in His ways, and to keep His commandments, His laws, and His rules, that you may thrive and increase, and that the LORD your God may bless you in the land that you are about to enter and possess. But if your heart turns away and you give no heed, and are lured into the worship and service of other gods, I declare to you this day that you shall certainly perish; you shall not long endure on the soil that you are crossing the Jordan to enter and possess. I call heaven and earth to witness against you this day: I have put before you life and death, blessing and curse. Choose life—if you and your offspring would live— by loving the LORD your God, heeding His commands, and holding fast to Him. For thereby you shall have life and shall long endure upon the soil that the LORD swore to your ancestors, Abraham, Isaac, and Jacob, to give to them."
    },
    {
     "k": "fox",
     "t": "See, I set before you today life and good, and death and evil: in that I command you today to love YHWH your God, to walk in his ways and to keep his commandments, his laws and his regulations, that you may stay-alive and become-many and YHWH your God may bless you in the land that you are entering to possess. Now if your heart should face about, and you do not hearken, and you be led and bow down to other gods, and serve them, I declare to you today that you will perish, yes, perish; you will not prolong days on the land that you are crossing the Jordan to enter, to possess. I call-as-witness against you today the heavens and the earth: life and death I place before you, blessing and curse; so choose life, in order that you may stay alive, you and your seed, by loving YHWH your God, by hearkening to his voice and by cleaving to him, for he is your life and the length of your days, to be settled on the land that YHWH swore to your fathers, to Avraham, to Yitzhak and to Yaakov, to give them!"
    },
    {
     "k": "koren",
     "t": "See, I have set before thee this day life and good, and death and evil; in that I command thee this day to love the Lord thy God, to walk in his ways, and to keep his commandments and his statutes and his judgments: then thou shalt live and multiply: and the Lord thy God shall bless thee in the land into which thou goest to possess it. But if thy heart turn away, so that thou wilt not hear, but shalt be drawn away, and worship other gods, and serve them; I announce to you this day, that you shall surely perish, and that you shall not prolong your days upon the land, whither thou passest over the Yarden to go to possess it. I call heaven and earth to witness this day against you, that I have set before thee life and death, blessing and cursing: therefore choose life, that both thou and thy seed may live: that thou mayst love the Lord thy God, and that thou mayst obey his voice, and that thou mayst cleave to him: for he is thy life, and the length of thy days: that thou mayst dwell in the land which the Lord swore to thy fathers, to Avraham, to Yiżĥaq, and to Ya῾aqov, to give them."
    },
    {
     "k": "kjv",
     "t": "See, I have set before thee this day life and good, and death and evil; In that I command thee this day to love the Lord thy God, to walk in his ways, and to keep his commandments and his statutes and his judgments, that thou mayest live and multiply: and the Lord thy God shall bless thee in the land whither thou goest to possess it. But if thine heart turn away, so that thou wilt not hear, but shalt be drawn away, and worship other gods, and serve them; I denounce unto you this day, that ye shall surely perish, and that ye shall not prolong your days upon the land, whither thou passest over Jordan to go to possess it. I call heaven and earth to record this day against you, that I have set before you life and death, blessing and cursing: therefore choose life, that both thou and thy seed may live: That thou mayest love the Lord thy God, and that thou mayest obey his voice, and that thou mayest cleave unto him: for he is thy life, and the length of thy days: that thou mayest dwell in the land which the Lord sware unto thy fathers, to Abraham, to Isaac, and to Jacob, to give them."
    },
    {
     "k": "ylt",
     "t": "`See, I have set before thee to-day life and good, and death and evil, in that I am commanding thee to-day to love Jehovah thy God, to walk in His ways, and to keep His commands, and His statutes, and His judgments; and thou hast lived and multiplied, and Jehovah thy God hath blessed thee in the land whither thou art going in to possess it. `And if thy heart doth turn, and thou dost not hearken, and hast been driven away, and hast bowed thyself to other gods, and served them, I have declared to you this day, that ye do certainly perish, ye do not prolong days on the ground which thou art passing over the Jordan to go in thither to possess it. `I have caused to testify against you to-day the heavens and the earth; life and death I have set before thee, the blessing and the reviling; and thou hast fixed on life, so that thou dost live, thou and thy seed, to love Jehovah thy God, to hearken to His voice, and to cleave to Him (for He [is] thy life, and the length of thy days), to dwell on the ground which Jehovah hath sworn to thy fathers, to Abraham, to Isaac, and to Jacob, to give to them.'"
    }
   ]
  },
  {
   "id": "isaiah-justice",
   "sec": "neviim",
   "ref": "Isaiah 1:16-17",
   "label": "Seek justice",
   "he": "רַחֲצוּ הִזַּכּוּ הָסִירוּ רֹעַ מַעַלְלֵיכֶם מִנֶּגֶד עֵינָי חִדְלוּ הָרֵעַ׃ לִמְדוּ הֵיטֵב דִּרְשׁוּ מִשְׁפָּט אַשְּׁרוּ חָמוֹץ שִׁפְטוּ יָתוֹם רִיבוּ אַלְמָנָה׃",
   "translit": "Limdu heitev, dirshu mishpat, ash'ru chamotz.",
   "v": [
    {
     "k": "jps1917",
     "t": "Wash you, make you clean, Put away the evil of your doings From before Mine eyes, Cease to do evil; Learn to do well; Seek justice, relieve the oppressed, Judge the fatherless, plead for the widow."
    },
    {
     "k": "njps",
     "t": "Wash yourselves clean; Put your evil doings Away from My sight. Cease to do evil; Learn to do good. Devote yourselves to justice; Aid the wronged. Uphold the rights of the orphan; Defend the cause of the widow."
    },
    {
     "k": "koren",
     "t": "Wash you, make you clean; put away the evil of your doings from before my eyes; cease to do evil; learn to do well; seek judgment, relieve the oppressed, judge the fatherless, plead for the widow."
    },
    {
     "k": "kjv",
     "t": "Wash you, make you clean; put away the evil of your doings from before mine eyes; cease to do evil; Learn to do well; seek judgment, relieve the oppressed, judge the fatherless, plead for the widow."
    },
    {
     "k": "ylt",
     "t": "Wash ye, make ye pure, Turn aside the evil of your doings, from before Mine eyes, Cease to do evil, learn to do good. Seek judgment, make happy the oppressed, Judge the fatherless, strive [for] the widow."
    }
   ]
  },
  {
   "id": "almah",
   "sec": "neviim",
   "ref": "Isaiah 7:14",
   "label": "The young woman",
   "he": "לָכֵן יִתֵּן אֲדֹנָי הוּא לָכֶם אוֹת הִנֵּה הָעַלְמָה הָרָה וְיֹלֶדֶת בֵּן וְקָרָאת שְׁמוֹ עִמָּנוּ אֵל׃",
   "translit": "Hinei ha'almah harah v'yoledet ben, v'karat sh'mo Immanu'el.",
   "v": [
    {
     "k": "jps1917",
     "t": "Therefore the Lord Himself shall give you a sign: behold, the young woman shall conceive, and bear a son, and shall call his name Immanuel."
    },
    {
     "k": "njps",
     "t": "Assuredly, my Lord will give you a sign of His own accord! Look, the young woman is with child and about to give birth to a son. Let her name him Immanuel."
    },
    {
     "k": "koren",
     "t": "Therefore the Lord himself shall give you a sign; Behold, the young woman is with child, and she will bear a son, and shall call his name ῾Immanu᾽el."
    },
    {
     "k": "kjv",
     "t": "Therefore the Lord himself shall give you a sign; Behold, a virgin shall conceive, and bear a son, and shall call his name Immanuel."
    },
    {
     "k": "ylt",
     "t": "Therefore the Lord Himself giveth to you a sign, Lo, the Virgin is conceiving, And is bringing forth a son, And hath called his name Immanuel,"
    }
   ]
  },
  {
   "id": "amos-justice",
   "sec": "neviim",
   "ref": "Amos 5:21-24",
   "label": "Let justice roll",
   "he": "שָׂנֵאתִי מָאַסְתִּי חַגֵּיכֶם וְלֹא אָרִיחַ בְּעַצְּרֹתֵיכֶם׃ כִּי אִם־תַּעֲלוּ־לִי עֹלוֹת וּמִנְחֹתֵיכֶם לֹא אֶרְצֶה וְשֶׁלֶם מְרִיאֵיכֶם לֹא אַבִּיט׃ הָסֵר מֵעָלַי הֲמוֹן שִׁרֶיךָ וְזִמְרַת נְבָלֶיךָ לֹא אֶשְׁמָע׃ וְיִגַּל כַּמַּיִם מִשְׁפָּט וּצְדָקָה כְּנַחַל אֵיתָן׃",
   "translit": "V'yigal kamayim mishpat, utzdakah k'nachal eitan.",
   "v": [
    {
     "k": "jps1917",
     "t": "I hate, I despise your feasts, And I will take no delight in your solemn assemblies. Yea, though ye offer me burnt-offerings and your meal-offerings, I will not accept them; Neither will I regard the peace-offerings of your fat beasts. Take thou away from Me the noise of thy songs; And let Me not hear the melody of thy psalteries. But let justice well up as waters, And righteousness as a mighty stream."
    },
    {
     "k": "njps",
     "t": "I loathe, I spurn your festivals, I am not appeased by your solemn assemblies. If you offer Me burnt offerings—or your meal offerings— I will not accept them; I will pay no heed To your gifts of fatlings. Spare Me the sound of your hymns, And let Me not hear the music of your lutes. But let justice well up like water, Righteousness like an unfailing stream."
    },
    {
     "k": "koren",
     "t": "I hate, I despise your feasts, and I will not smell the sacrifices of your solemn assemblies. Though you offer me burnt offerings and your meal offerings, I will not accept them: neither will I regard the peace offerings of your fat beasts. Take away from me the noise of thy songs; for I will not hear the melody of thy lutes. But let justice roll down like waters, and righteousness like a mighty stream."
    },
    {
     "k": "kjv",
     "t": "I hate, I despise your feast days, and I will not smell in your solemn assemblies. Though ye offer me burnt offerings and your meat offerings, I will not accept them: neither will I regard the peace offerings of your fat beasts. Take thou away from me the noise of thy songs; for I will not hear the melody of thy viols. But let judgment run down as waters, and righteousness as a mighty stream."
    },
    {
     "k": "ylt",
     "t": "I have hated--I have loathed your festivals, And I am not refreshed by your restraints. For though ye cause burnt-offerings and your presents to ascend to Me, I am not pleased, And the peace-offering of your fatlings I behold not. Turn aside from Me the noise of thy songs, Yea, the praise of thy psaltery I hear not. And roll on as waters doth judgment, And righteousness as a perennial stream."
    }
   ]
  },
  {
   "id": "micah",
   "sec": "neviim",
   "ref": "Micah 6:6-8",
   "label": "Do justice",
   "he": "בַּמָּה אֲקַדֵּם יְהוָה אִכַּף לֵאלֹהֵי מָרוֹם הַאֲקַדְּמֶנּוּ בְעוֹלוֹת בַּעֲגָלִים בְּנֵי שָׁנָה׃ הֲיִרְצֶה יְהוָה בְּאַלְפֵי אֵילִים בְּרִבְבוֹת נַחֲלֵי־שָׁמֶן הַאֶתֵּן בְּכוֹרִי פִּשְׁעִי פְּרִי בִטְנִי חַטַּאת נַפְשִׁי׃ הִגִּיד לְךָ אָדָם מַה־טּוֹב וּמָה־יְהוָה דּוֹרֵשׁ מִמְּךָ כִּי אִם־עֲשׂוֹת מִשְׁפָּט וְאַהֲבַת חֶסֶד וְהַצְנֵעַ לֶכֶת עִם־אֱלֹהֶיךָ׃",
   "translit": "Asot mishpat v'ahavat chesed v'hatzne'a lechet im Elohecha.",
   "v": [
    {
     "k": "jps1917",
     "t": "'Wherewith shall I come before the LORD, And bow myself before God on high? Shall I come before Him with burnt-offerings, With calves of a year old? Will the LORD be pleased with thousands of rams, With ten thousands of rivers of oil? Shall I give my first-born for my transgression, The fruit of my body for the sin of my soul?' It hath been told thee, O man, what is good, And what the LORD doth require of thee: Only to do justly, and to love mercy, and to walk humbly with thy God."
    },
    {
     "k": "njps",
     "t": "With what shall I approach the LORD, Do homage to God on high? Shall I approach Him with burnt offerings, With calves a year old? Would the LORD be pleased with thousands of rams, With myriads of streams of oil? Shall I give my first-born for my transgression, The fruit of my body for my sins? \"He has told you, O man, what is good, And what the LORD requires of you: Only to do justice And to love goodness, And to walk modestly with your God;"
    },
    {
     "k": "koren",
     "t": "With what shall I come before the Lord, and bow myself before the high God? shall I come before him with burnt offerings, with calves of a year old? will the Lord be pleased with thousands of rams, or with ten thousands of rivers of oil? shall I give my firstborn for my transgression, the fruit of my body for the sin of my soul? He has told thee, O man, what is good; and what does the Lord require of thee, but to do justly, and to love true loyalty, and to walk humbly with thy God?"
    },
    {
     "k": "kjv",
     "t": "Wherewith shall I come before the Lord, and bow myself before the high God? shall I come before him with burnt offerings, with calves of a year old? Will the Lord be pleased with thousands of rams, or with ten thousands of rivers of oil? shall I give my firstborn for my transgression, the fruit of my body for the sin of my soul? He hath shewed thee, O man, what is good; and what doth the Lord require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?"
    },
    {
     "k": "ylt",
     "t": "With what do I come before Jehovah? Do I bow to God Most High? Do I come before Him with burnt-offerings? With calves--sons of a year? Is Jehovah pleased with thousands of rams? With myriads of streams of oil? Do I give my first-born [for] my transgression? The fruit of my body [for] the sin of my soul? He hath declared to thee, O man, what [is] good; Yea, what is Jehovah requiring of thee, Except--to do judgment, and love kindness, And lowly to walk with thy God?"
    }
   ]
  },
  {
   "id": "psalm-23",
   "sec": "ketuvim",
   "ref": "Psalm 23",
   "label": "Psalm 23",
   "he": "מִזְמוֹר לְדָוִד יְהוָה רֹעִי לֹא אֶחְסָר׃ בִּנְאוֹת דֶּשֶׁא יַרְבִּיצֵנִי עַל־מֵי מְנֻחוֹת יְנַהֲלֵנִי׃ נַפְשִׁי יְשׁוֹבֵב יַנְחֵנִי בְמַעְגְּלֵי־צֶדֶק לְמַעַן שְׁמוֹ׃ גַּם כִּי־אֵלֵךְ בְּגֵיא צַלְמָוֶת לֹא־אִירָא רָע כִּי־אַתָּה עִמָּדִי שִׁבְטְךָ וּמִשְׁעַנְתֶּךָ הֵמָּה יְנַחֲמֻנִי׃ תַּעֲרֹךְ לְפָנַי שֻׁלְחָן נֶגֶד צֹרְרָי דִּשַּׁנְתָּ בַשֶּׁמֶן רֹאשִׁי כּוֹסִי רְוָיָה׃ אַךְ טוֹב וָחֶסֶד יִרְדְּפוּנִי כָּל־יְמֵי חַיָּי וְשַׁבְתִּי בְּבֵית־יְהוָה לְאֹרֶךְ יָמִים׃",
   "translit": "Adonai ro'i, lo echsar.",
   "v": [
    {
     "k": "jps1917",
     "t": "A Psalm of David. The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures; He leadeth me beside the still waters. He restoreth my soul; He guideth me in straight paths for His name's sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil, for Thou art with me; Thy rod and Thy staff, they comfort me. Thou preparest a table before me in the presence of mine enemies; Thou hast anointed my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life; And I shall dwell in the house of the LORD for ever."
    },
    {
     "k": "njps",
     "t": "A psalm of David. The LORD is my shepherd; I lack nothing. He makes me lie down in green pastures; He leads me to water in places of repose; He renews my life; He guides me in right paths as befits His name. Though I walk through a valley of deepest darkness, I fear no harm, for You are with me; Your rod and Your staff—they comfort me. You spread a table for me in full view of my enemies; You anoint my head with oil; my drink is abundant. Only goodness and steadfast love shall pursue me all the days of my life, and I shall dwell in the house of the LORD for many long years."
    },
    {
     "k": "koren",
     "t": "A Psalm of David. The Lord is my shepherd; I shall not want. He makes me to lie down in green pastures: he leads me beside the still waters. He restores my soul: he leads me in the paths of righteousness for his name's sake. Even though I walk through the valley of the shadow of death, I will fear no evil: for Thou art with me; Thy rod and Thy staff they comfort me. Thou preparest a table before me in the presence of my enemies: Thou anointest my head with oil; my cup runs over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord forever."
    },
    {
     "k": "kjv",
     "t": "The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake. Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me. Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over. Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the Lord for ever."
    },
    {
     "k": "ylt",
     "t": "A Psalm of David. Jehovah [is] my shepherd, I do not lack, In pastures of tender grass He causeth me to lie down, By quiet waters He doth lead me. My soul He refresheth, He leadeth me in paths of righteousness, For His name's sake, Also--when I walk in a valley of death-shade, I fear no evil, for Thou [art] with me, Thy rod and Thy staff--they comfort me. Thou arrangest before me a table, Over-against my adversaries, Thou hast anointed with oil my head, My cup is full! Only--goodness and kindness pursue me, All the days of my life, And my dwelling [is] in the house of Jehovah, For a length of days!"
    },
    {
     "k": "alter",
     "t": "The LORD is my shepherd, I shall not want. In grass meadows He makes me lie down, by quiet waters He guides me. My life He brings back. He leads me on pathways of justice for His name's sake. Though I walk in the vale of death's shadow, I fear no harm, for You are with me. Your rod and Your staff—it is they that console me. You set out a table before me in the face of my foes. You moisten my head with oil, my cup overflows. Let but goodness and kindness pursue me all the days of my life. And I shall dwell in the house of the LORD for many long days."
    }
   ]
  },
  {
   "id": "kohelet",
   "sec": "ketuvim",
   "ref": "Ecclesiastes 1:2",
   "label": "Mere breath",
   "he": "הֲבֵל הֲבָלִים אָמַר קֹהֶלֶת הֲבֵל הֲבָלִים הַכֹּל הָבֶל׃",
   "translit": "Havel havalim, amar Kohelet, havel havalim, hakol havel.",
   "v": [
    {
     "k": "jps1917",
     "t": "Vanity of vanities, saith Koheleth; Vanity of vanities, all is vanity."
    },
    {
     "k": "njps",
     "t": "Utter futility!—said Koheleth— Utter futility! All is futile!"
    },
    {
     "k": "koren",
     "t": "Vanity of vanities, says Qohelet, vanity of vanities; all is vanity."
    },
    {
     "k": "kjv",
     "t": "Vanity of vanities, saith the Preacher, vanity of vanities; all is vanity."
    },
    {
     "k": "ylt",
     "t": "Vanity of vanities, said the Preacher, Vanity of vanities: the whole [is] vanity."
    },
    {
     "k": "alter",
     "t": "Merest breath, said Qohelet, merest breath. All is mere breath."
    }
   ]
  },
  {
   "id": "job-whirlwind",
   "sec": "ketuvim",
   "ref": "Job 38:1-7",
   "label": "The whirlwind",
   "he": "וַיַּעַן־יְהוָה אֶת־אִיּוֹב מנ הסערה [מִן ] [הַסְּעָרָה] וַיֹּאמַר׃ מִי זֶה מַחְשִׁיךְ עֵצָה בְמִלִּין בְּלִי־דָעַת׃ אֱזָר־נָא כְגֶבֶר חֲלָצֶיךָ וְאֶשְׁאָלְךָ וְהוֹדִיעֵנִי׃ אֵיפֹה הָיִיתָ בְּיָסְדִי־אָרֶץ הַגֵּד אִם־יָדַעְתָּ בִינָה׃ מִי־שָׂם מְמַדֶּיהָ כִּי תֵדָע אוֹ מִי־נָטָה עָלֶיהָ קָּו׃ עַל־מָה אֲדָנֶיהָ הָטְבָּעוּ אוֹ מִי־יָרָה אֶבֶן פִּנָּתָהּ׃ בְּרָן־יַחַד כּוֹכְבֵי בֹקֶר וַיָּרִיעוּ כָּל־בְּנֵי אֱלֹהִים׃",
   "translit": "Mi zeh machshich etzah b'milin b'li da'at.",
   "v": [
    {
     "k": "jps1917",
     "t": "Then the LORD answered Job out of the whirlwind, and said: Who is this that darkeneth counsel By words without knowledge? Gird up now thy loins like a man; For I will demand of thee, and declare thou unto Me. Where wast thou when I laid the foundations of the earth? Declare, if thou hast the understanding. Who determined the measures thereof, if thou knowest? Or who stretched the line upon it? Whereupon were the foundations thereof fastened? Or who laid the corner-stone thereof, When the morning stars sang together, And all the sons of God shouted for joy?"
    },
    {
     "k": "njps",
     "t": "Then the LORD replied to Job out of the tempest and said: Who is this who darkens counsel, Speaking without knowledge? Gird your loins like a man; I will ask and you will inform Me. Where were you when I laid the earth's foundations? Speak if you have understanding. Do you know who fixed its dimensions Or who measured it with a line? Onto what were its bases sunk? Who set its cornerstone When the morning stars sang together And all the divine beings shouted for joy?"
    },
    {
     "k": "koren",
     "t": "Then the Lord answered Iyyov out of the storm wind, and said, Who is this that darkens counsel by words without knowledge? Gird up now thy loins like a man; for I will demand of thee, and let me know thy answer. Where wast thou when I laid the foundations of the earth? declare, if thou hast understanding. Who determined its measurements, if thou knowst? or who has stretched the line upon it? whereupon are its foundations fastened? or who laid its corner stone; when the morning stars sang together, and all the sons of God shouted for joy?"
    },
    {
     "k": "kjv",
     "t": "Then the Lord answered Job out of the whirlwind, and said, Who is this that darkeneth counsel by words without knowledge? Gird up now thy loins like a man; for I will demand of thee, and answer thou me. Where wast thou when I laid the foundations of the earth? declare, if thou hast understanding. Who hath laid the measures thereof, if thou knowest? or who hath stretched the line upon it? Whereupon are the foundations thereof fastened? or who laid the corner stone thereof; When the morning stars sang together, and all the sons of God shouted for joy?"
    },
    {
     "k": "ylt",
     "t": "And Jehovah answereth Job out of the whirlwind, and saith: -- Who [is] this--darkening counsel, By words without knowledge? Gird, I pray thee, as a man, thy loins, And I ask thee, and cause thou Me to know. Where wast thou when I founded earth? Declare, if thou hast known understanding. Who placed its measures--if thou knowest? Or who hath stretched out upon it a line? On what have its sockets been sunk? Or who hath cast its corner-stone? In the singing together of stars of morning, And all sons of God shout for joy,"
    }
   ]
  }
 ]
};
