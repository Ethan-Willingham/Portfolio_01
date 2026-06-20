/* ============================================================
   The Guru Granth Sahib, side by side: the corpus.
   A curated set of keystone passages (the full scripture runs
   1,430 pages). For each: the Gurmukhi source, a readable
   transliteration, and the English translations, stacked.

   Every translation is reproduced verbatim from the named edition.
   Editorial touches, applied across the board: curly quotation
   marks are straightened; verse-number scaffolding (the ||1|| and
   [1-Pause] markers) is dropped for clean side-by-side reading; a
   couple of obvious scanning typos in the digitized editions are
   corrected to the translator's actual word. Nothing is paraphrased.

   shape:  { translators, parts, passages:[{id, part, loc, who, gur, tr, v:[{k,t}]}] }
   No em dashes (except inside verbatim quotations, which are left as printed).
   ============================================================ */
window.GGS = {

  translators: {
    trumpp:     { name: "Ernest Trumpp",             year: 1877, caution: true },
    macauliffe: { name: "Max Arthur Macauliffe",     year: 1909 },
    gopal:      { name: "Gopal Singh",               year: 1960 },
    manmohan:   { name: "Manmohan Singh",            year: 1962 },
    khalsa:     { name: "Sant Singh Khalsa",         year: 1996 },
    pashaura:   { name: "Pashaura Singh",            year: 2000 },
    nesbitt:    { name: "Eleanor Nesbitt",           year: 2005 },
    ngk:        { name: "Nikky-Guninder Kaur Singh", year: 2019 }
  },

  parts: [
    { label: "The root", sub: "Japji Sahib, the opening prayer" },
    { label: "The diagnosis, and the cure" },
    { label: "Honest life, not ceremony" },
    { label: "Neither Hindu nor Muslim, and the saints in the book" },
    { label: "The seal" }
  ],

  passages: [

    /* ---------- I. THE ROOT ---------- */
    {
      id: "mul-mantar", part: 1, who: "Guru Nanak",
      loc: "Mul Mantar · Japji Sahib · Ang 1",
      gur: "ੴ ਸਤਿ ਨਾਮੁ ਕਰਤਾ ਪੁਰਖੁ ਨਿਰਭਉ ਨਿਰਵੈਰੁ ਅਕਾਲ ਮੂਰਤਿ ਅਜੂਨੀ ਸੈਭੰ ਗੁਰ ਪ੍ਰਸਾਦਿ ॥",
      tr: "ik-oankaar sat naam kartaa purakh nirbha-o nirvair akaal moorat ajoonee saibhan gur parsaad",
      v: [
        { k: "trumpp", t: "OM!\n\nThe true name is the creator, the Spirit without fear, without enmity, having a timeless form, not produced from the womb.\n\nBy the favour of the Guru!" },
        { k: "macauliffe", t: "There is but one God whose name is true, the Creator, devoid of fear and enmity, immortal, unborn, self-existent; by the favour of the Guru." },
        { k: "gopal", t: "By the Grace of the One Supreme Being, The Eternal, The All-pervading Purusha, The Creator, Without Fear, Without Hate, the Being Beyond Time, Non-incarnated, Self-existent, The Enlightener." },
        { k: "manmohan", t: "There is but one God. True is His Name, creative His personality and immortal His form. He is without fear sans enmity, unborn and self-illumined. By the Guru's grace He is obtained." },
        { k: "khalsa", t: "One Universal Creator God. The Name Is Truth. Creative Being Personified. No Fear. No Hatred. Image Of The Undying, Beyond Birth, Self-Existent. By Guru's Grace." },
        { k: "pashaura", t: "There is one supreme being, the eternal reality (true name), the creator, without fear, devoid of enmity, immortal, never incarnated, self-existent, (known by) the grace of the Guru." },
        { k: "nesbitt", t: "This Being is one, truth by name, creator, fearless, without hatred, of timeless form, unborn, self-existent, and known by the Guru's grace." },
        { k: "ngk", t: "There is One Being\nTruth by Name\nPrimal Creator\nWithout fear\nWithout enmity\nTimeless in form\nUnborn\nSelf-existent\nThe grace of the Guru." }
      ]
    },

    {
      id: "japji-1", part: 1, who: "Guru Nanak",
      loc: "Japji Sahib, Pauri 1 · Ang 1",
      gur: "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥\nਹੁਕਮਿ ਰਜਾਈ ਚਲਣਾ ਨਾਨਕ ਲਿਖਿਆ ਨਾਲਿ ॥",
      tr: "kiv sachi-aaraa ho-ee-ai kiv koorhai tutai paal\nhukam rajaa-ee chalnaa naanak likhi-aa naal",
      v: [
        { k: "trumpp", t: "How does one become a man of truth (knowing the True one), how is the embankment of falsehood broken?\nHe who walks in his (i.e. God's) order and pleasure, O Nanak! (and) with (whom) it is (thus) written." },
        { k: "macauliffe", t: "How shall man become true before God? How shall the veil of falsehood be rent?\nBy walking, O Nanak, according to the will of the Commander as preordained." },
        { k: "gopal", t: "How then to be True? How rend the Veil of sham, untruth?\nHis Will (forsooth)\nInborn in us, ingrained,\nThou follow.\n(Thus is Truth attained)." },
        { k: "manmohan", t: "How can we be true and how can the screen of untruth be rent?\nTo obey the Lord's Order, which is pre-ordained, O Nanak! is the way." },
        { k: "khalsa", t: "So how can you become truthful? And how can the veil of illusion be torn away?\nO Nanak, it is written that you shall obey the Hukam of His Command, and walk in the Way of His Will." },
        { k: "ngk", t: "How then to be true?\nHow then to break the wall of lies?\nBy following the Will.\nSays Nanak, this is written for us." }
      ]
    },

    {
      id: "japji-2", part: 1, who: "Guru Nanak",
      loc: "Japji Sahib, Pauri 2 · Ang 1",
      gur: "ਨਾਨਕ ਹੁਕਮੈ ਜੇ ਬੁਝੈ ਤ ਹਉਮੈ ਕਹੈ ਨ ਕੋਇ ॥",
      tr: "naanak hukmai jay bujhai ta ha-umai kahai na ko-ay",
      v: [
        { k: "trumpp", t: "O Nanak! if one understand his order, he will not speak in self-conceit." },
        { k: "macauliffe", t: "He who understandeth God's order, O Nanak, is never guilty of egoism." },
        { k: "gopal", t: "And he, who knows the Will, doth feel\nThe 'I' in him no more, no more." },
        { k: "manmohan", t: "O Nanak! if man were to understand Lord's fiat, then no one would take pride (speak in ego)." },
        { k: "khalsa", t: "O Nanak, one who understands His Command, does not speak in ego." },
        { k: "ngk", t: "Says Nanak, by recognizing the Will, we silence our ego." }
      ]
    },

    {
      id: "pavan-guru", part: 1, who: "Guru Nanak",
      loc: "Japji Sahib, closing Salok · Ang 8",
      gur: "ਪਵਣੁ ਗੁਰੂ ਪਾਣੀ ਪਿਤਾ ਮਾਤਾ ਧਰਤਿ ਮਹਤੁ ॥\nਦਿਵਸੁ ਰਾਤਿ ਦੁਇ ਦਾਈ ਦਾਇਆ ਖੇਲੈ ਸਗਲ ਜਗਤੁ ॥\nਚੰਗਿਆਈਆ ਬੁਰਿਆਈਆ ਵਾਚੈ ਧਰਮੁ ਹਦੂਰਿ ॥\nਕਰਮੀ ਆਪੋ ਆਪਣੀ ਕੇ ਨੇੜੈ ਕੇ ਦੂਰਿ ॥\nਜਿਨੀ ਨਾਮੁ ਧਿਆਇਆ ਗਏ ਮਸਕਤਿ ਘਾਲਿ ॥\nਨਾਨਕ ਤੇ ਮੁਖ ਉਜਲੇ ਕੇਤੀ ਛੁਟੀ ਨਾਲਿ ॥੧॥",
      tr: "pavan guroo paanee pitaa maataa dharat mahat\ndivas raat du-ay daa-ee daa-i-aa khaylai sagal jagat\nchang-aa-ee-aa buri-aa-ee-aa vaachai dharam hadoor\nkarmee aapo aapnee kay nayrhai kay door\njinee naam dhi-aa-i-aa ga-ay maskat ghaal\nnaanak tay mukh ujlay kaytee chhutee naal",
      v: [
        { k: "trumpp", t: "The breath (wind) is the Guru, water the father, the great earth the mother.\nDay and night, the two are the male and female nurses, the whole world sports.\nIn the presence (of God) Dharm reads the good and bad actions (of the creatures).\nBy their own works some are near and some far off (from God).\nBy whom the name is meditated upon, they are gone, having done their work.\nNanak: they are bright in their face; how many other people are released (from existence) in their company!" },
        { k: "gopal", t: "Air the Guru, Water the Father,\nGreat Earth the Mother:\nNurses, Night and Day,\nIn whose lap the world doth play.\nOur deeds, good and bad,\nAre read\nIn the Presence of the Lord of Law:\nOur Actions keep us far, or near Him draw;\nThey who Dwell on the Name, their Toil is o'er.\nGlorious are their beings, Nanak, they save many more." },
        { k: "manmohan", t: "Air is the Guru, water is the Father, earth the great Mother,\nand day and night the two male nurse and female nurse, in whose lap the entire world plays.\nThe merits and demerits shall he read in the presence of the Righteous Justice.\nAccording to their respective deeds some shall be near some distant from the Lord.\nThey who have pondered on the Name and have departed after putting in toil.\nNanak, their faces shall be bright and many shall be emancipated along with them." },
        { k: "khalsa", t: "Air is the Guru, Water is the Father, and Earth is the Great Mother of all.\nDay and night are the two nurses, in whose lap all the world is at play.\nGood deeds and bad deeds, the record is read out in the Presence of the Lord of Dharma.\nAccording to their own actions, some are drawn closer, and some are driven farther away.\nThose who have meditated on the Naam, the Name of the Lord, and departed after having worked by the sweat of their brows,\nO Nanak, their faces are radiant in the Court of the Lord, and many are saved along with them!" },
        { k: "ngk", t: "Air is our Guru, water our father,\nand the great earth our mother.\nDay and night are the female and male nurses\nin whose laps the whole universe plays.\nGood and bad deeds are all disclosed\nin the presence of Righteousness.\nOur actions take us near or far.\nThose who remember the Name earn true success.\nNanak says their faces shine,\nand they take many with them to liberation." }
      ]
    },

    /* ---------- II. THE DIAGNOSIS, AND THE CURE ---------- */
    {
      id: "haumai", part: 2, who: "Guru Nanak",
      loc: "Asa di Var · Ang 466",
      gur: "ਹਉਮੈ ਦੀਰਘ ਰੋਗੁ ਹੈ ਦਾਰੂ ਭੀ ਇਸੁ ਮਾਹਿ ॥",
      tr: "ha-umai deeragh rog hai daaroo bhee is maahi",
      v: [
        { k: "gopal", t: "Ego is a chronic malady: but within it also is its remedy." },
        { k: "manmohan", t: "Ego is a chronic disease, but it has also its curing medicine." },
        { k: "khalsa", t: "Ego is a chronic disease, but it contains its own cure as well." }
      ]
    },

    {
      id: "shabad-guru", part: 2, who: "Guru Nanak",
      loc: "Siddh Gosht · Ang 943",
      gur: "ਸਬਦੁ ਗੁਰੂ ਸੁਰਤਿ ਧੁਨਿ ਚੇਲਾ ॥",
      tr: "sabad guroo surat dhun chaylaa",
      v: [
        { k: "gopal", t: "The Word is the Guru: and the Mind Attuned (to the Word) the disciple." },
        { k: "manmohan", t: "The Lord is my Guru, whose meditation, I, His disciple, greatly love." },
        { k: "khalsa", t: "The Shabad is the Guru, upon whom I lovingly focus my consciousness; I am the Chaylaa, the disciple." }
      ]
    },

    {
      id: "naam", part: 2, who: "Guru Arjan",
      loc: "Closing Salok · Ang 1429",
      gur: "ਨਾਨਕ ਨਾਮੁ ਮਿਲੈ ਤਾਂ ਜੀਵਾਂ ਤਨੁ ਮਨੁ ਥੀਵੈ ਹਰਿਆ ॥",
      tr: "naanak naam milai taan jeevaan tan man theevai hari-aa",
      v: [
        { k: "gopal", t: "Now, O God, Bless me with Thy life-giving Name, that blossom forth both my body and mind." },
        { k: "manmohan", t: "Nanak! Then alone I live and my body and soul blossom forth, if I am blessed with the Lord's Name." },
        { k: "khalsa", t: "O Nanak, if I am blessed with the Naam, I live, and my body and mind blossom forth." }
      ]
    },

    /* ---------- III. HONEST LIFE, NOT CEREMONY ---------- */
    {
      id: "ghal-khai", part: 3, who: "Guru Nanak",
      loc: "Salok, Var Sarang · Ang 1245",
      gur: "ਘਾਲਿ ਖਾਇ ਕਿਛੁ ਹਥਹੁ ਦੇਇ ॥\nਨਾਨਕ ਰਾਹੁ ਪਛਾਣਹਿ ਸੇਇ ॥੧॥",
      tr: "ghaal khaa-ay kichh hathahu day-ay\nnaanak raahu pachhaaneh say-ay",
      v: [
        { k: "gopal", t: "He alone, O Nanak, Knows the Way,\nWho earns with the sweat of his brow, and then shares it with the others." },
        { k: "manmohan", t: "One who eats what he earns through his earnest labour and from his hand gives something in charity;\nNanak, he alone knows the way of life." },
        { k: "khalsa", t: "One who works for what he eats, and gives some of what he has\nO Nanak, he knows the Path." }
      ]
    },

    {
      id: "aarti", part: 3, who: "Guru Nanak",
      loc: "Aarti · Raag Dhanasari · Ang 13, 663",
      gur: "ਗਗਨ ਮੈ ਥਾਲੁ ਰਵਿ ਚੰਦੁ ਦੀਪਕ ਬਨੇ ਤਾਰਿਕਾ ਮੰਡਲ ਜਨਕ ਮੋਤੀ ॥\nਧੂਪੁ ਮਲਆਨਲੋ ਪਵਣੁ ਚਵਰੋ ਕਰੇ ਸਗਲ ਬਨਰਾਇ ਫੂਲੰਤ ਜੋਤੀ ॥\nਕੈਸੀ ਆਰਤੀ ਹੋਇ ॥",
      tr: "gagan mai thaal rav chand deepak banay taarikaa mandal janak motee\ndhoop mal-aanlo pavan chavro karay sagal banraa-ay foolant jotee\nkaisee aartee ho-ay",
      v: [
        { k: "gopal", t: "The sky is the salver; the sun and the moon are the lamps,\nThe spheres of stars are studded in it as jewels;\nThe chandan-scented winds from the Malai mountain wave\nAnd scatter across the fragrance of myriads of flowers.\n(Thus) is Thy Worship performed,\nO Thou Destroyer of fear." },
        { k: "manmohan", t: "In the sky's salver, the sun and the moon are the lamps and the stars with their orbs, are the studded pearls.\nThe fragrance of sandal wood make Thy incense, wind Thy fan and all the vegetation Thine flowers, O Luminous Lord.\nWhat a beautiful worship with lamps is being performed?" },
        { k: "khalsa", t: "Upon that cosmic plate of the sky, the sun and moon are the lamps. The stars and their orbs are the studded pearls.\nThe fragrance of sandalwood in the air is the temple incense, and the wind is the fan. All the plants of the world are the altar flowers in offering to You, O Luminous Lord.\nWhat a beautiful Aartee, lamp-lit worship service this is!" },
        { k: "ngk", t: "The sky is our platter, the sun and moon our lamps,\nit is studded with pearls, the starry galaxies,\nThe wafting scent of sandalwood is our incense,\nthe gentle breeze, our whisk,\nall vegetation, the bouquet of flowers we offer to You.\nWhat an act of worship!\nThis truly is Your worship, You who sunder life from death." }
      ]
    },

    {
      id: "jot-na-jati", part: 3, who: "Guru Nanak",
      loc: "Raag Asa · Ang 349",
      gur: "ਜਾਣਹੁ ਜੋਤਿ ਨ ਪੂਛਹੁ ਜਾਤੀ ਆਗੈ ਜਾਤਿ ਨ ਹੇ ॥",
      tr: "jaanhu jot na poochhahu jaatee aagai jaat na hay",
      v: [
        { k: "gopal", t: "See thou of each the Light within and ask not his caste:\nFor, Hereafter, the caste is of no avail." },
        { k: "manmohan", t: "Recognise Lord's light within all and inquire not the caste, as there is no caste in the next world." },
        { k: "khalsa", t: "Recognize the Lord's Light within all, and do not consider social class or status; there are no classes or castes in the world hereafter." }
      ]
    },

    /* ---------- IV. NEITHER HINDU NOR MUSLIM, AND THE SAINTS ---------- */
    {
      id: "hindu-musalman", part: 4, who: "Guru Arjan",
      loc: "Raag Bhairo · Ang 1136",
      gur: "ਨਾ ਹਮ ਹਿੰਦੂ ਨ ਮੁਸਲਮਾਨ ॥",
      tr: "naa ham hindoo na musalmaan",
      v: [
        { k: "gopal", t: "I am neither a Hindu, nor a Muslim,\nFor, my body and the vital breath belong to the God of both." },
        { k: "manmohan", t: "I am neither a Hindu, nor a Muslim." },
        { k: "khalsa", t: "I am not a Hindu, nor am I a Muslim." }
      ]
    },

    {
      id: "kabir-noor", part: 4, who: "Bhagat Kabir",
      loc: "Raag Prabhati · Ang 1349",
      gur: "ਅਵਲਿ ਅਲਹ ਨੂਰੁ ਉਪਾਇਆ ਕੁਦਰਤਿ ਕੇ ਸਭ ਬੰਦੇ ॥",
      tr: "aval alah noor upaa-i-aa kudrat kay sabh banday",
      v: [
        { k: "gopal", t: "First, God Created His Light; and from it were all men made;\nYea, from God's Light came the whole universe: then, whom shall we call good, whom bad?" },
        { k: "manmohan", t: "Firstly God created light and then by His Omnipotence, made all the mortals." },
        { k: "khalsa", t: "First, Allah created the Light; then, by His Creative Power, He made all mortal beings." }
      ]
    },

    {
      id: "farid", part: 4, who: "Sheikh Farid",
      loc: "Salok · Ang 1378",
      gur: "ਫਰੀਦਾ ਜੋ ਤੈ ਮਾਰਨਿ ਮੁਕੀਆਂ ਤਿਨੑਾ ਨ ਮਾਰੇ ਘੁੰਮਿ ॥\nਆਪਨੜੈ ਘਰਿ ਜਾਈਐ ਪੈਰ ਤਿਨੑਾ ਦੇ ਚੁੰਮਿ ॥",
      tr: "fareedaa jo tai maaran mukee-aan tinhaa na maaray ghumm\naapnarhai ghar jaa-ee-ai pair tinhaa day chumm",
      v: [
        { k: "gopal", t: "O Farid, they, who give thee blows, greet them with a kiss.\nYea, go not back to thy home if thou art amiss!" },
        { k: "manmohan", t: "Farid! To those who beat thee with fists; do not return them beating turning around.\nKiss thou their feet and go to thy own house." },
        { k: "khalsa", t: "Do not turn around and strike those who strike you with their fists. Kiss their feet, and return to your own home." }
      ]
    },

    {
      id: "ravidas-begampura", part: 4, who: "Bhagat Ravidas",
      loc: "Raag Gauri · Ang 345",
      gur: "ਬੇਗਮ ਪੁਰਾ ਸਹਰ ਕੋ ਨਾਉ ॥\nਦੂਖੁ ਅੰਦੋਹੁ ਨਹੀ ਤਿਹਿ ਠਾਉ ॥",
      tr: "baygam puraa sahar ko naa-o\ndookh andohu nahee tihi thaa-o",
      v: [
        { k: "gopal", t: "'Griefless' is the name of my Town,\nWhere abide not either pain or care." },
        { k: "manmohan", t: "Begampura is the name of the town.\nThere is no pain and anxiety there." },
        { k: "khalsa", t: "Baygumpura, 'the city without sorrow', is the name of the town.\nThere is no suffering or anxiety there." }
      ]
    },

    /* ---------- V. THE SEAL ---------- */
    {
      id: "mundavani", part: 5, who: "Guru Arjan",
      loc: "Mundavani · Ang 1429",
      gur: "ਥਾਲ ਵਿਚਿ ਤਿੰਨਿ ਵਸਤੂ ਪਈਓ ਸਤੁ ਸੰਤੋਖੁ ਵੀਚਾਰੋ ॥\nਅੰਮ੍ਰਿਤ ਨਾਮੁ ਠਾਕੁਰ ਕਾ ਪਇਓ ਜਿਸ ਕਾ ਸਭਸੁ ਅਧਾਰੋ ॥\nਜੇ ਕੋ ਖਾਵੈ ਜੇ ਕੋ ਭੁੰਚੈ ਤਿਸ ਕਾ ਹੋਇ ਉਧਾਰੋ ॥\nਏਹ ਵਸਤੁ ਤਜੀ ਨਹ ਜਾਈ ਨਿਤ ਨਿਤ ਰਖੁ ਉਰਿ ਧਾਰੋ ॥\nਤਮ ਸੰਸਾਰੁ ਚਰਨ ਲਗਿ ਤਰੀਐ ਸਭੁ ਨਾਨਕ ਬ੍ਰਹਮ ਪਸਾਰੋ ॥੧॥",
      tr: "thaal vich tinn vastoo pa-ee-o sat santokh veechaaro\namrit naam thaakur kaa pa-i-o jis kaa sabhas adhaaro\njay ko khaavai jay ko bhunchai tis kaa ho-ay udhaaro\nayh vasat tajee nah jaa-ee nit nit rakh ur dhaaro\ntam sansaar charan lag taree-ai sabh naanak barahm pasaaro",
      v: [
        { k: "gopal", t: "In the Platter (of this Book) are placed three things, Truth, Contentment and Wisdom,\nAnd also the Nectar-Name of the Lord, who is the Support of all.\nHe, who Tastes this Fare, Relishes it, and he is wholly Fulfilled.\nThis Thing one cannot forsake: so keep thou it in thy Mind,\nFor, (through it), one Swims across the Dark (Sea) of Existence, (and knows that) all that seems is the Expanse of God." },
        { k: "manmohan", t: "In the platter are placed three things, truth, contentment and meditations.\nThe Nectar-Name of the Lord, who is the support of all, has also been put therein.\nIf some one partakes this and relishes it, he is emancipated.\nThis can be forsaken not, so ever and always keep thou this enshrined in thy mind.\nRepairing to the Lord's feet, the dark world ocean is crossed; O Nanak, everything is an extension of the Lord." },
        { k: "khalsa", t: "Upon this Plate, three things have been placed: Truth, Contentment and Contemplation.\nThe Ambrosial Nectar of the Naam, the Name of our Lord and Master, has been placed upon it as well; it is the Support of all.\nOne who eats it and enjoys it shall be saved.\nThis thing can never be forsaken; keep this always and forever in your mind.\nThe dark world-ocean is crossed over, by grasping the Feet of the Lord; O Nanak, it is all the extension of God." }
      ]
    }

  ]
};
