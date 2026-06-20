/* ============================================================
   The Quran, side by side: the data.
   Arabic (Uthmani) source + transliteration, then seven English
   translations, for fourteen curated keystone passages. Verbatim.
   Arabic + Pickthall/Yusuf Ali/Saheeh/Abdel Haleem from quran.com;
   Arberry + Asad from alquran.cloud; George Sale (1734) from the
   Wikisource 1734 text and the Internet Archive reprint. No em dashes.
   Shape consumed by js/quran.js. Notes live in js/quran-notes.js.
   ============================================================ */
window.QURAN = {
 "translators": {
  "sale": {
   "name": "George Sale",
   "year": 1734
  },
  "pickthall": {
   "name": "Marmaduke Pickthall",
   "year": 1930
  },
  "yusufali": {
   "name": "Abdullah Yusuf Ali",
   "year": 1934
  },
  "arberry": {
   "name": "A. J. Arberry",
   "year": 1955
  },
  "asad": {
   "name": "Muhammad Asad",
   "year": 1980
  },
  "sahih": {
   "name": "Saheeh International",
   "year": 1997
  },
  "haleem": {
   "name": "M. A. S. Abdel Haleem",
   "year": 2004
  }
 },
 "order": [
  "sale",
  "pickthall",
  "yusufali",
  "arberry",
  "asad",
  "sahih",
  "haleem"
 ],
 "keystones": [
  {
   "id": "1",
   "ref": "Sura 1, al-Fatiha",
   "name": "The Opening",
   "vk": "Sura 1, al-Fatiha",
   "ar": [
    {
     "n": "1",
     "a": "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
    },
    {
     "n": "2",
     "a": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ"
    },
    {
     "n": "3",
     "a": "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
    },
    {
     "n": "4",
     "a": "مَـٰلِكِ يَوْمِ ٱلدِّينِ"
    },
    {
     "n": "5",
     "a": "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ"
    },
    {
     "n": "6",
     "a": "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ"
    },
    {
     "n": "7",
     "a": "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ"
    }
   ],
   "tr": "Bismi llahi r-rahmani r-rahim. Al-hamdu li-llahi rabbi l-'alamin. Ar-rahmani r-rahim. Maliki yawmi d-din. Iyyaka na'budu wa-iyyaka nasta'in. Ihdina s-sirata l-mustaqim. Sirata lladhina an'amta 'alayhim ghayri l-maghdubi 'alayhim wa-la d-dallin.",
   "v": [
    {
     "k": "sale",
     "t": "In the name of the most merciful God. Praise be to God, the Lord of all creatures; the most merciful, the king of the day of judgment. Thee do we worship, and of thee do we beg assistance. Direct us in the right way, in the way of those to whom thou hast been gracious; not of those against whom thou art incensed, nor of those who go astray."
    },
    {
     "k": "pickthall",
     "t": "In the name of Allah, the Beneficent, the Merciful.\nPraise be to Allah, Lord of the Worlds,\nThe Beneficent, the Merciful.\nMaster of the Day of Judgment,\nThee (alone) we worship; Thee (alone) we ask for help.\nShow us the straight path,\nThe path of those whom Thou hast favoured; Not the (path) of those who earn Thine anger nor of those who go astray."
    },
    {
     "k": "yusufali",
     "t": "In the name of Allah, Most Gracious, Most Merciful.\nPraise be to Allah, the Cherisher and Sustainer of the worlds;\nMost Gracious, Most Merciful;\nMaster of the Day of Judgment.\nThee do we worship, and Thine aid we seek.\nShow us the straight way,\nThe way of those on whom Thou hast bestowed Thy Grace, those whose (portion) is not wrath, and who go not astray."
    },
    {
     "k": "arberry",
     "t": "In the Name of God, the Merciful, the Compassionate\nPraise belongs to God, the Lord of all Being,\nthe All-merciful, the All-compassionate,\nthe Master of the Day of Doom.\nThee only we serve; to Thee alone we pray for succour.\nGuide us in the straight path,\nthe path of those whom Thou hast blessed, not of those against whom Thou art wrathful, nor of those who are astray."
    },
    {
     "k": "asad",
     "t": "In the name of God, The Most Gracious, The Dispenser of Grace:\nAll praise is due to God alone, the Sustainer of all the worlds,\nThe Most Gracious, the Dispenser of Grace,\nLord of the Day of Judgment!\nThee alone do we worship; and unto Thee alone do we turn for aid.\nGuide us the straight way.\nThe way of those upon whom Thou hast bestowed Thy blessings, not of those who have been condemned [by Thee], nor of those who go astray!"
    },
    {
     "k": "sahih",
     "t": "In the name of Allāh, the Entirely Merciful, the Especially Merciful.\n[All] praise is [due] to Allāh, Lord of the worlds -\nThe Entirely Merciful, the Especially Merciful,\nSovereign of the Day of Recompense.\nIt is You we worship and You we ask for help.\nGuide us to the straight path -\nThe path of those upon whom You have bestowed favor, not of those who have earned [Your] anger or of those who are astray."
    },
    {
     "k": "haleem",
     "t": "In the name of God, the Lord of Mercy, the Giver of Mercy!\nPraise belongs to God, Lord of the Worlds,\nthe Lord of Mercy, the Giver of Mercy,\nMaster of the Day of Judgement.\nIt is You we worship; it is You we ask for help.\nGuide us to the straight path:\nthe path of those You have blessed, those who incur no anger and who have not gone astray."
    }
   ]
  },
  {
   "id": "112",
   "ref": "Sura 112, al-Ikhlas",
   "name": "Pure faith",
   "vk": "Sura 112, al-Ikhlas",
   "ar": [
    {
     "n": "1",
     "a": "قُلْ هُوَ ٱللَّهُ أَحَدٌ"
    },
    {
     "n": "2",
     "a": "ٱللَّهُ ٱلصَّمَدُ"
    },
    {
     "n": "3",
     "a": "لَمْ يَلِدْ وَلَمْ يُولَدْ"
    },
    {
     "n": "4",
     "a": "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ"
    }
   ],
   "tr": "Qul huwa llahu ahad. Allahu s-samad. Lam yalid wa-lam yulad. Wa-lam yakun lahu kufuwan ahad.",
   "v": [
    {
     "k": "sale",
     "t": "Say, God is one God; the eternal God: he begetteth not, neither is he begotten: and there is not any one like unto him."
    },
    {
     "k": "pickthall",
     "t": "Say: He is Allah, the One!\nAllah, the eternally Besought of all!\nHe begetteth not nor was begotten.\nAnd there is none comparable unto Him."
    },
    {
     "k": "yusufali",
     "t": "Say: He is Allah, the One and Only;\nAllah, the Eternal, Absolute;\nHe begetteth not, nor is He begotten;\nAnd there is none like unto Him."
    },
    {
     "k": "arberry",
     "t": "Say: 'He is God, One,\nGod, the Everlasting Refuge,\nwho has not begotten, and has not been begotten,\nand equal to Him is not any one.'"
    },
    {
     "k": "asad",
     "t": "SAY: \"He is the One God:\n\"God the Eternal, the Uncaused Cause of All Being.\n\"He begets not, and neither is He begotten;\n\"and there is nothing that could be compared with Him."
    },
    {
     "k": "sahih",
     "t": "Say, \"He is Allāh, [who is] One,\nAllāh, the Eternal Refuge.\nHe neither begets nor is born,\nNor is there to Him any equivalent.\""
    },
    {
     "k": "haleem",
     "t": "Say, ‘He is God the One,\nGod the eternal.\nHe begot no one nor was He begotten.\nNo one is comparable to Him.’"
    }
   ]
  },
  {
   "id": "2:255",
   "ref": "Sura 2:255, Ayat al-Kursi",
   "name": "The Throne Verse",
   "vk": "Sura 2:255, Ayat al-Kursi",
   "ar": [
    {
     "n": "255",
     "a": "ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُۥ مَا فِى ٱلسَّمَـٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَـٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ"
    }
   ],
   "tr": "Allahu la ilaha illa huwa l-hayyu l-qayyum...",
   "v": [
    {
     "k": "sale",
     "t": "God! there is no God but he; the living, the self-subsisting: neither slumber nor sleep seizeth him; to him belongeth whatsoever is in heaven, and on earth. Who is he that can intercede with him, but through his good pleasure? He knoweth that which is past, and that which is to come unto them, and they shall not comprehend any thing of his knowledge, but so far as he pleaseth. His throne is extended over heaven and earth, and the preservation of both is no burden unto him. He is the high, the mighty."
    },
    {
     "k": "pickthall",
     "t": "Allah! There is no deity save Him, the Alive, the Eternal. Neither slumber nor sleep overtaketh Him. Unto Him belongeth whatsoever is in the heavens and whatsoever is in the earth. Who is he that intercedeth with Him save by His leave? He knoweth that which is in front of them and that which is behind them, while they encompass nothing of His knowledge save what He will. His throne includeth the heavens and the earth, and He is never weary of preserving them. He is the Sublime, the Tremendous."
    },
    {
     "k": "yusufali",
     "t": "Allah! There is no god but He,-the Living, the Self-subsisting, Eternal. No slumber can seize Him nor sleep. His are all things in the heavens and on earth. Who is there can intercede in His presence except as He permitteth? He knoweth what (appeareth to His creatures as) before or after or behind them. Nor shall they compass aught of His knowledge except as He willeth. His Throne doth extend over the heavens and the earth, and He feeleth no fatigue in guarding and preserving them for He is the Most High, the Supreme (in glory)."
    },
    {
     "k": "arberry",
     "t": "God there is no god but He, the Living, the Everlasting. Slumber seizes Him not, neither sleep; to Him belongs all that is in the heavens and the earth. Who is there that shall intercede with Him save by His leave? He knows what lies before them and what is after them, and they comprehend not anything of His knowledge save such as He wills. His Throne comprises the heavens and earth; the preserving of them oppresses Him not; He is the All-high, the All-glorious."
    },
    {
     "k": "asad",
     "t": "GOD - there is no deity save Him, the Ever-Living, the Self-Subsistent Fount of All Being. Neither slumber overtakes Him, nor sleep. His is all that is in the heavens and all that is on earth. Who is there that could intercede with Him, unless it be by His leave? He knows all that lies open before men and all that is hidden from them, whereas they cannot attain to aught of His knowledge save that which He wills [them to attain]. His eternal power overspreads the heavens and the earth, and their upholding wearies Him not. And he alone is truly exalted, tremendous."
    },
    {
     "k": "sahih",
     "t": "Allāh - there is no deity except Him, the Ever-Living, the Self-Sustaining. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursī extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great."
    },
    {
     "k": "haleem",
     "t": "God: there is no god but Him, the Ever Living, the Ever Watchful. Neither slumber nor sleep overtakes Him. All that is in the heavens and in the earth belongs to Him. Who is there that can intercede with Him except by His leave? He knows what is before them and what is behind them, but they do not comprehend any of His knowledge except what He wills. His throne extends over the heavens and the earth; it does not weary Him to preserve them both. He is the Most High, the Tremendous."
    }
   ]
  },
  {
   "id": "24:35",
   "ref": "Sura 24:35",
   "name": "The Light Verse",
   "vk": "Sura 24:35",
   "ar": [
    {
     "n": "35",
     "a": "۞ ٱللَّهُ نُورُ ٱلسَّمَـٰوَٰتِ وَٱلْأَرْضِ ۚ مَثَلُ نُورِهِۦ كَمِشْكَوٰةٍ فِيهَا مِصْبَاحٌ ۖ ٱلْمِصْبَاحُ فِى زُجَاجَةٍ ۖ ٱلزُّجَاجَةُ كَأَنَّهَا كَوْكَبٌ دُرِّىٌّ يُوقَدُ مِن شَجَرَةٍ مُّبَـٰرَكَةٍ زَيْتُونَةٍ لَّا شَرْقِيَّةٍ وَلَا غَرْبِيَّةٍ يَكَادُ زَيْتُهَا يُضِىٓءُ وَلَوْ لَمْ تَمْسَسْهُ نَارٌ ۚ نُّورٌ عَلَىٰ نُورٍ ۗ يَهْدِى ٱللَّهُ لِنُورِهِۦ مَن يَشَآءُ ۚ وَيَضْرِبُ ٱللَّهُ ٱلْأَمْثَـٰلَ لِلنَّاسِ ۗ وَٱللَّهُ بِكُلِّ شَىْءٍ عَلِيمٌ"
    }
   ],
   "tr": "Allahu nuru s-samawati wa-l-ard...",
   "v": [
    {
     "k": "sale",
     "t": "God is the light of heaven and earth: the similitude of his light is as a niche in a wall, wherein a lamp is placed, and the lamp inclosed in a case of glass; the glass appears as it were a shining star. It is lighted with the oil of a blessed tree, an olive neither of the east, nor of the west: it wanteth little but that the oil thereof would give light, although no fire touched it. This is light added unto light. God will direct unto his light whom he pleaseth. God propoundeth parables unto men; for God knoweth all things."
    },
    {
     "k": "pickthall",
     "t": "Allah is the Light of the heavens and the earth. The similitude of His light is as a niche wherein is a lamp. The lamp is in a glass. The glass is as it were a shining star. (This lamp is) kindled from a blessed tree, an olive neither of the East nor of the West, whose oil would almost glow forth (of itself) though no fire touched it. Light upon light. Allah guideth unto His light whom He will. And Allah speaketh to mankind in allegories, for Allah is Knower of all things."
    },
    {
     "k": "yusufali",
     "t": "Allah is the Light of the heavens and the earth. The Parable of His Light is as if there were a Niche and within it a Lamp: the Lamp enclosed in Glass: the glass as it were a brilliant star: Lit from a blessed Tree, an Olive, neither of the east nor of the west, whose oil is well-nigh luminous, though fire scarce touched it: Light upon Light! Allah doth guide whom He will to His Light: Allah doth set forth Parables for men: and Allah doth know all things."
    },
    {
     "k": "arberry",
     "t": "God is the Light of the heavens and the earth; the likeness of His Light is as a niche wherein is a lamp (the lamp in a glass, the glass as it were a glittering star) kindled from a Blessed Tree, an olive that is neither of the East nor of the West whose oil wellnigh would shine, even if no fire touched it; Light upon Light; (God guides to His Light whom He will.) (And God strikes similitudes for men, and God has knowledge of everything.)"
    },
    {
     "k": "asad",
     "t": "God is the Light of the heavens and the earth. The parable of His light is, as it were, that of a niche containing a lamp; the lamp is [enclosed] in glass, the glass [shining] like a radiant star: [a lamp] lit from a blessed tree - an olive-tree that is neither of the east nor of the west the oil whereof [is so bright that it] would well-nigh give light [of itself] even though fire had not touched it: light upon light! God guides unto His light him that wills [to be guided]; and [to this end] God propounds parables unto men, since God [alone] has full knowledge of all things."
    },
    {
     "k": "sahih",
     "t": "Allāh is the Light of the heavens and the earth. The example of His light is like a niche within which is a lamp; the lamp is within glass, the glass as if it were a pearly [white] star lit from [the oil of] a blessed olive tree, neither of the east nor of the west, whose oil would almost glow even if untouched by fire. Light upon light. Allāh guides to His light whom He wills. And Allāh presents examples for the people, and Allāh is Knowing of all things."
    },
    {
     "k": "haleem",
     "t": "God is the Light of the heavens and earth. His Light is like this: there is a niche, and in it a lamp, the lamp inside a glass, a glass like a glittering star, fuelled from a blessed olive tree from neither east nor west, whose oil almost gives light even when no fire touches it- light upon light- God guides whoever He will to his Light; God draws such comparisons for people; God has full knowledge of everything-"
    }
   ]
  },
  {
   "id": "103",
   "ref": "Sura 103, al-Asr",
   "name": "By the declining day",
   "vk": "Sura 103, al-Asr",
   "ar": [
    {
     "n": "1",
     "a": "وَٱلْعَصْرِ"
    },
    {
     "n": "2",
     "a": "إِنَّ ٱلْإِنسَـٰنَ لَفِى خُسْرٍ"
    },
    {
     "n": "3",
     "a": "إِلَّا ٱلَّذِينَ ءَامَنُوا۟ وَعَمِلُوا۟ ٱلصَّـٰلِحَـٰتِ وَتَوَاصَوْا۟ بِٱلْحَقِّ وَتَوَاصَوْا۟ بِٱلصَّبْرِ"
    }
   ],
   "tr": "Wa-l-'asr. Inna l-insana la-fi khusr. Illa lladhina amanu wa-'amilu s-salihati wa-tawasaw bi-l-haqqi wa-tawasaw bi-s-sabr.",
   "v": [
    {
     "k": "sale",
     "t": "By the afternoon: verily man employeth himself in that which will prove of loss; except those who believe, and do that which is right; and who mutually recommend the truth, and mutually recommend perseverance unto each other."
    },
    {
     "k": "pickthall",
     "t": "By the declining day,\nLo! man is a state of loss,\nSave those who believe and do good works, and exhort one another to truth and exhort one another to endurance."
    },
    {
     "k": "yusufali",
     "t": "By (the Token of) Time (through the ages),\nVerily Man is in loss,\nExcept such as have Faith, and do righteous deeds, and (join together) in the mutual teaching of Truth, and of Patience and Constancy."
    },
    {
     "k": "arberry",
     "t": "By the afternoon!\nSurely Man is in the way of loss,\nsave those who believe, and do righteous deeds, and counsel each other unto the truth, and counsel each other to be steadfast."
    },
    {
     "k": "asad",
     "t": "CONSIDER the flight of time!\nVerily, man is bound to lose himself\nunless he be of those who attain to faith, and do good works, and enjoin upon one another the keeping to truth, and enjoin upon one another patience in adversity."
    },
    {
     "k": "sahih",
     "t": "By time,\nIndeed, mankind is in loss,\nExcept for those who have believed and done righteous deeds and advised each other to truth and advised each other to patience."
    },
    {
     "k": "haleem",
     "t": "By the declining day,\nman is [deep] in loss,\nexcept for those who believe, do good deeds, urge one another to the truth, and urge one another to steadfastness."
    }
   ]
  },
  {
   "id": "31:13",
   "ref": "Sura 31:13",
   "name": "Luqman to his son",
   "vk": "Sura 31:13",
   "ar": [
    {
     "n": "13",
     "a": "وَإِذْ قَالَ لُقْمَـٰنُ لِٱبْنِهِۦ وَهُوَ يَعِظُهُۥ يَـٰبُنَىَّ لَا تُشْرِكْ بِٱللَّهِ ۖ إِنَّ ٱلشِّرْكَ لَظُلْمٌ عَظِيمٌ"
    }
   ],
   "tr": "Wa-idh qala luqmanu li-bnihi wa-huwa ya'izuhu: ya bunayya la tushrik bi-llah, inna sh-shirka la-zulmun 'azim.",
   "v": [
    {
     "k": "sale",
     "t": "And remember when Lokman said unto his son, as he admonished him, O my son, give not a partner unto God; for polytheism is a great impiety."
    },
    {
     "k": "pickthall",
     "t": "And (remember) when Luqman said unto his son, when he was exhorting him: O my dear son! Ascribe no partners unto Allah. Lo! to ascribe partners (unto Him) is a tremendous wrong -"
    },
    {
     "k": "yusufali",
     "t": "Behold, Luqman said to his son by way of instruction: \"O my son! join not in worship (others) with Allah: for false worship is indeed the highest wrong-doing.\""
    },
    {
     "k": "arberry",
     "t": "And when Lokman said to his son, admonishing him, 'O my son, do not associate others with God; to associate others with God is a mighty wrong."
    },
    {
     "k": "asad",
     "t": "And, lo, Luqman spoke thus unto his son, admonishing him: “O my dear son! Do not ascribe divine powers to aught beside God: for, behold, such [a false] ascribing of divinity is indeed an awesome wrong!"
    },
    {
     "k": "sahih",
     "t": "And [mention, O Muḥammad], when Luqmān said to his son while he was instructing him, \"O my son, do not associate [anything] with Allāh. Indeed, association [with Him] is great injustice.\""
    },
    {
     "k": "haleem",
     "t": "Luqman counselled his son, ‘My son, do not attribute any partners to God: attributing partners to Him is a terrible wrong.’"
    }
   ]
  },
  {
   "id": "14:7",
   "ref": "Sura 14:7",
   "name": "If you are grateful",
   "vk": "Sura 14:7",
   "ar": [
    {
     "n": "7",
     "a": "وَإِذْ تَأَذَّنَ رَبُّكُمْ لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ ۖ وَلَئِن كَفَرْتُمْ إِنَّ عَذَابِى لَشَدِيدٌ"
    }
   ],
   "tr": "...la-in shakartum la-azidannakum, wa-la-in kafartum inna 'adhabi la-shadid.",
   "v": [
    {
     "k": "sale",
     "t": "If ye be thankful, I will surely increase my favours towards you; but if ye be ungrateful, verily my punishment shall be severe."
    },
    {
     "k": "pickthall",
     "t": "And when your Lord proclaimed: If ye give thanks, I will give you more; but if ye are thankless, lo! My punishment is dire."
    },
    {
     "k": "yusufali",
     "t": "And remember! your Lord caused to be declared (publicly): \"If ye are grateful, I will add more (favours) unto you; But if ye show ingratitude, truly My punishment is terrible indeed.\""
    },
    {
     "k": "arberry",
     "t": "And when your Lord proclaimed, \"If you are thankful, surely I will increase you, but if you are thankless My chastisement is surely terrible.\"'"
    },
    {
     "k": "asad",
     "t": "And [remember the time] when your Sustainer made [this promise] known: 'If you are grateful [to Me], I shall most certainly give you more and more; but if you are ungrateful, verily, My chastisement will be severe indeed!\"'"
    },
    {
     "k": "sahih",
     "t": "And [remember] when your Lord proclaimed, 'If you are grateful, I will surely increase you [in favor]; but if you deny, indeed, My punishment is severe.'\""
    },
    {
     "k": "haleem",
     "t": "Remember that He promised, “If you are thankful, I will give you more, but if you are thankless, My punishment is terrible indeed.” ’"
    }
   ]
  },
  {
   "id": "2:177",
   "ref": "Sura 2:177",
   "name": "What counts as goodness",
   "vk": "Sura 2:177",
   "ar": [
    {
     "n": "177",
     "a": "۞ لَّيْسَ ٱلْبِرَّ أَن تُوَلُّوا۟ وُجُوهَكُمْ قِبَلَ ٱلْمَشْرِقِ وَٱلْمَغْرِبِ وَلَـٰكِنَّ ٱلْبِرَّ مَنْ ءَامَنَ بِٱللَّهِ وَٱلْيَوْمِ ٱلْـَٔاخِرِ وَٱلْمَلَـٰٓئِكَةِ وَٱلْكِتَـٰبِ وَٱلنَّبِيِّـۧنَ وَءَاتَى ٱلْمَالَ عَلَىٰ حُبِّهِۦ ذَوِى ٱلْقُرْبَىٰ وَٱلْيَتَـٰمَىٰ وَٱلْمَسَـٰكِينَ وَٱبْنَ ٱلسَّبِيلِ وَٱلسَّآئِلِينَ وَفِى ٱلرِّقَابِ وَأَقَامَ ٱلصَّلَوٰةَ وَءَاتَى ٱلزَّكَوٰةَ وَٱلْمُوفُونَ بِعَهْدِهِمْ إِذَا عَـٰهَدُوا۟ ۖ وَٱلصَّـٰبِرِينَ فِى ٱلْبَأْسَآءِ وَٱلضَّرَّآءِ وَحِينَ ٱلْبَأْسِ ۗ أُو۟لَـٰٓئِكَ ٱلَّذِينَ صَدَقُوا۟ ۖ وَأُو۟لَـٰٓئِكَ هُمُ ٱلْمُتَّقُونَ"
    }
   ],
   "tr": "Laysa l-birra an tuwallu wujuhakum qibala l-mashriqi wa-l-maghrib...",
   "v": [
    {
     "k": "sale",
     "t": "It is not righteousness that ye turn your faces in prayer towards the east and the west, but righteousness is of him who believeth in God and the last day, and the angels, and the scriptures, and the prophets; who giveth money for God's sake unto his kindred, and unto orphans, and the needy, and the stranger, and those who ask, and for redemption of captives; who is constant at prayer, and giveth alms; and of those who perform their covenant, when they have covenanted, and who behave themselves patiently in adversity, and hardships, and in time of violence."
    },
    {
     "k": "pickthall",
     "t": "It is not righteousness that ye turn your faces to the East and the West; but righteous is he who believeth in Allah and the Last Day and the angels and the Scripture and the prophets; and giveth wealth, for love of Him, to kinsfolk and to orphans and the needy and the wayfarer and to those who ask, and to set slaves free; and observeth proper worship and payeth the poor-due. And those who keep their treaty when they make one, and the patient in tribulation and adversity and time of stress. Such are they who are sincere. Such are the Allah-fearing."
    },
    {
     "k": "yusufali",
     "t": "It is not righteousness that ye turn your faces Towards east or West; but it is righteousness- to believe in Allah and the Last Day, and the Angels, and the Book, and the Messengers; to spend of your substance, out of love for Him, for your kin, for orphans, for the needy, for the wayfarer, for those who ask, and for the ransom of slaves; to be steadfast in prayer, and practice regular charity; to fulfil the contracts which ye have made; and to be firm and patient, in pain (or suffering) and adversity, and throughout all periods of panic. Such are the people of truth, the Allah-fearing."
    },
    {
     "k": "arberry",
     "t": "It is not piety, that you turn your faces to the East and to the West. True piety is this: to believe in God, and the Last Day, the angels, the Book, and the Prophets, to give of one's substance, however cherished, to kinsmen, and orphans, the needy, the traveller, beggars, and to ransom the slave, to perform the prayer, to pay the alms. And they who fulfil their covenant when they have engaged in a covenant, and endure with fortitude misfortune, hardship and peril, these are they who are true in their faith, these are the truly godfearing."
    },
    {
     "k": "asad",
     "t": "True piety does not consist in turning your faces towards the east or the west - but truly pious is he who believes in God, and the Last Day; and the angels, and revelation, and the prophets; and spends his substance - however much he himself may cherish - it - upon his near of kin, and the orphans, and the needy, and the wayfarer, and the beggars, and for the freeing of human beings from bondage; and is constant in prayer, and renders the purifying dues; and [truly pious are] they who keep their promises whenever they promise, and are patient in misfortune and hardship and in time of peril: it is they that have proved themselves true, and it is they, they who are conscious of God."
    },
    {
     "k": "sahih",
     "t": "Righteousness is not that you turn your faces toward the east or the west, but [true] righteousness is [in] one who believes in Allāh, the Last Day, the angels, the Book, and the prophets and gives wealth, in spite of love for it, to relatives, orphans, the needy, the traveler, those who ask [for help], and for freeing slaves; [and who] establishes prayer and gives zakāh; [those who] fulfill their promise when they promise; and [those who] are patient in poverty and hardship and during battle. Those are the ones who have been true, and it is those who are the righteous."
    },
    {
     "k": "haleem",
     "t": "Goodness does not consist in turning your face towards East or West. The truly good are those who believe in God and the Last Day, in the angels, the Scripture, and the prophets; who give away some of their wealth, however much they cherish it, to their relatives, to orphans, the needy, travellers and beggars, and to liberate those in bondage; those who keep up the prayer and pay the prescribed alms; who keep pledges whenever they make them; who are steadfast in misfortune, adversity, and times of danger. These are the ones who are true, and it is they who are aware of God."
    }
   ]
  },
  {
   "id": "16:90",
   "ref": "Sura 16:90",
   "name": "Justice and good conduct",
   "vk": "Sura 16:90",
   "ar": [
    {
     "n": "90",
     "a": "۞ إِنَّ ٱللَّهَ يَأْمُرُ بِٱلْعَدْلِ وَٱلْإِحْسَـٰنِ وَإِيتَآئِ ذِى ٱلْقُرْبَىٰ وَيَنْهَىٰ عَنِ ٱلْفَحْشَآءِ وَٱلْمُنكَرِ وَٱلْبَغْىِ ۚ يَعِظُكُمْ لَعَلَّكُمْ تَذَكَّرُونَ"
    }
   ],
   "tr": "Inna llaha ya'muru bi-l-'adli wa-l-ihsani wa-ita'i dhi l-qurba...",
   "v": [
    {
     "k": "sale",
     "t": "Verily God commandeth justice, and the doing of good, and the giving unto kindred what shall be necessary; and he forbiddeth wickedness, and iniquity, and oppression: he admonisheth you that ye may remember."
    },
    {
     "k": "pickthall",
     "t": "Lo! Allah enjoineth justice and kindness, and giving to kinsfolk, and forbiddeth lewdness and abomination and wickedness. He exhorteth you in order that ye may take heed."
    },
    {
     "k": "yusufali",
     "t": "Allah commands justice, the doing of good, and liberality to kith and kin, and He forbids all shameful deeds, and injustice and rebellion: He instructs you, that ye may receive admonition."
    },
    {
     "k": "arberry",
     "t": "Surely God bids to justice and good-doing and giving to kinsmen; and He forbids indecency, dishonour, and insolence, admonishing you, so that haply you will remember."
    },
    {
     "k": "asad",
     "t": "BEHOLD, God enjoins justice, and the doing of good, and generosity towards [one's] fellow-men; and He forbids all that is shameful and all that runs counter to reason, as well as envy; [and] He exhorts you [repeatedly] so that you might bear [all this] in mind."
    },
    {
     "k": "sahih",
     "t": "Indeed, Allāh orders justice and good conduct and giving [help] to relatives and forbids immorality and bad conduct and oppression. He admonishes you that perhaps you will be reminded."
    },
    {
     "k": "haleem",
     "t": "God commands justice, doing good, and generosity towards relatives and He forbids what is shameful, blameworthy, and oppressive. He teaches you, so that you may take heed."
    }
   ]
  },
  {
   "id": "2:256",
   "ref": "Sura 2:256",
   "name": "No compulsion",
   "vk": "Sura 2:256",
   "ar": [
    {
     "n": "256",
     "a": "لَآ إِكْرَاهَ فِى ٱلدِّينِ ۖ قَد تَّبَيَّنَ ٱلرُّشْدُ مِنَ ٱلْغَىِّ ۚ فَمَن يَكْفُرْ بِٱلطَّـٰغُوتِ وَيُؤْمِنۢ بِٱللَّهِ فَقَدِ ٱسْتَمْسَكَ بِٱلْعُرْوَةِ ٱلْوُثْقَىٰ لَا ٱنفِصَامَ لَهَا ۗ وَٱللَّهُ سَمِيعٌ عَلِيمٌ"
    }
   ],
   "tr": "La ikraha fi d-din, qad tabayyana r-rushdu mina l-ghayy...",
   "v": [
    {
     "k": "sale",
     "t": "Let there be no violence in religion. Now is right direction manifestly distinguished from deceit: whoever therefore shall deny Tagut, and believe in God, he shall surely take hold on a strong handle, which shall not be broken; God is he who heareth and seeth."
    },
    {
     "k": "pickthall",
     "t": "There is no compulsion in religion. The right direction is henceforth distinct from error. And he who rejecteth false deities and believeth in Allah hath grasped a firm handhold which will never break. Allah is Hearer, Knower."
    },
    {
     "k": "yusufali",
     "t": "Let there be no compulsion in religion: Truth stands out clear from Error: whoever rejects evil and believes in Allah hath grasped the most trustworthy hand-hold, that never breaks. And Allah heareth and knoweth all things."
    },
    {
     "k": "arberry",
     "t": "No compulsion is there in religion. Rectitude has become clear from error. So whosoever disbelieves in idols and believes in God, has laid hold of the most firm handle, unbreaking; God is All-hearing, All-knowing."
    },
    {
     "k": "asad",
     "t": "THERE SHALL BE no coercion in matters of faith. Distinct has now become the right way from [the way of] error: hence, he who rejects the powers of evil and believes in God has indeed taken hold of a support most unfailing, which shall never give way: for God is all-hearing, all-knowing."
    },
    {
     "k": "sahih",
     "t": "There shall be no compulsion in [acceptance of] the religion. The right course has become distinct from the wrong. So whoever disbelieves in ṭāghūt and believes in Allāh has grasped the most trustworthy handhold with no break in it. And Allāh is Hearing and Knowing."
    },
    {
     "k": "haleem",
     "t": "There is no compulsion in religion: true guidance has become distinct from error, so whoever rejects false gods and believes in God has grasped the firmest hand-hold, one that will never break. God is all hearing and all knowing."
    }
   ]
  },
  {
   "id": "19",
   "ref": "Sura 19:29-34, Maryam",
   "name": "The child in the cradle",
   "vk": "Sura 19:29-34, Maryam",
   "ar": [
    {
     "n": "29",
     "a": "فَأَشَارَتْ إِلَيْهِ ۖ قَالُوا۟ كَيْفَ نُكَلِّمُ مَن كَانَ فِى ٱلْمَهْدِ صَبِيًّا"
    },
    {
     "n": "30",
     "a": "قَالَ إِنِّى عَبْدُ ٱللَّهِ ءَاتَىٰنِىَ ٱلْكِتَـٰبَ وَجَعَلَنِى نَبِيًّا"
    },
    {
     "n": "31",
     "a": "وَجَعَلَنِى مُبَارَكًا أَيْنَ مَا كُنتُ وَأَوْصَـٰنِى بِٱلصَّلَوٰةِ وَٱلزَّكَوٰةِ مَا دُمْتُ حَيًّا"
    },
    {
     "n": "32",
     "a": "وَبَرًّۢا بِوَٰلِدَتِى وَلَمْ يَجْعَلْنِى جَبَّارًا شَقِيًّا"
    },
    {
     "n": "33",
     "a": "وَٱلسَّلَـٰمُ عَلَىَّ يَوْمَ وُلِدتُّ وَيَوْمَ أَمُوتُ وَيَوْمَ أُبْعَثُ حَيًّا"
    },
    {
     "n": "34",
     "a": "ذَٰلِكَ عِيسَى ٱبْنُ مَرْيَمَ ۚ قَوْلَ ٱلْحَقِّ ٱلَّذِى فِيهِ يَمْتَرُونَ"
    }
   ],
   "tr": "...qala inni 'abdu llahi atani ya l-kitaba wa-ja'alani nabiyya.",
   "v": [
    {
     "k": "sale",
     "t": "She made signs unto the child to answer them; and they said, How shall we speak to him who is an infant in the cradle? Whereupon the child said, Verily I am the servant of God: he hath given me the book of the gospel, and hath appointed me a prophet. And he hath made me blessed, wheresoever I shall be; and hath commanded me to observe prayer, and to give alms, so long as I shall live; and he hath made me dutiful towards my mother, and hath not made me proud or unhappy. And peace be on me the day whereon I was born, and the day whereon I shall die, and the day whereon I shall be raised to life. This was Jesus the son of Mary; the Word of truth, concerning whom they doubt."
    },
    {
     "k": "pickthall",
     "t": "Then she pointed to him. They said: How can we talk to one who is in the cradle, a young boy?\nHe spake: Lo! I am the slave of Allah. He hath given me the Scripture and hath appointed me a Prophet,\nAnd hath made me blessed wheresoever I may be, and hath enjoined upon me prayer and almsgiving so long as I remain alive,\nAnd (hath made me) dutiful toward her who bore me, and hath not made me arrogant, unblest.\nPeace on me the day I was born, and the day I die, and the day I shall be raised alive!\nSuch was Jesus, son of Mary: (this is) a statement of the truth concerning which they doubt."
    },
    {
     "k": "yusufali",
     "t": "But she pointed to the babe. They said: \"How can we talk to one who is a child in the cradle?\"\nHe said: \"I am indeed a servant of Allah: He hath given me revelation and made me a prophet;\n\"And He hath made me blessed wheresoever I be, and hath enjoined on me Prayer and Charity as long as I live;\n\"(He) hath made me kind to my mother, and not overbearing or miserable;\n\"So peace is on me the day I was born, the day that I die, and the day that I shall be raised up to life (again)\"!\nSuch (was) Jesus the son of Mary: (it is) a statement of truth, about which they (vainly) dispute."
    },
    {
     "k": "arberry",
     "t": "Mary pointed to the child then; but they said, 'How shall we speak to one who is still in the cradle, a little child?'\nHe said, 'Lo, I am God's servant; God has given me the Book, and made me a Prophet.\nBlessed He has made me, wherever I may be; and He has enjoined me to pray, and to give the alms, so long as I live,\nand likewise to cherish my mother; He has not made me arrogant, unprosperous.\nPeace be upon me, the day I was born, and the day I die, and the day I am raised up alive!'\nThat is Jesus, son of Mary, in word of truth, concerning which they are doubting."
    },
    {
     "k": "asad",
     "t": "Thereupon she pointed to him. They exclaimed: \"How can we talk to one who [as yet] is a little boy in the cradle?\"\n[But] he said: \"Behold, I am a servant of God. He has vouchsafed unto me revelation and made me a prophet,\nand made me blessed wherever I may be; and He has enjoined upon me prayer and charity as long as I live,\nand [has endowed me with] piety towards my mother; and He has not made me haughty or bereft of grace.\n\"Hence, peace was upon me on the day when I was born, and [will be upon me] on the day of my death, and on the day when I shall be raised to life [again]!\"\nSUCH WAS, in the words of truth, Jesus the son of Mary, about whose nature they so deeply disagree."
    },
    {
     "k": "sahih",
     "t": "So she pointed to him. They said, \"How can we speak to one who is in the cradle a child?\"\n[Jesus] said, \"Indeed, I am the servant of Allāh. He has given me the Scripture and made me a prophet.\nAnd He has made me blessed wherever I am and has enjoined upon me prayer and zakāh as long as I remain alive\nAnd [made me] dutiful to my mother, and He has not made me a wretched tyrant.\nAnd peace is on me the day I was born and the day I will die and the day I am raised alive.\"\nThat is Jesus, the son of Mary - the word of truth about which they are in dispute."
    },
    {
     "k": "haleem",
     "t": "She pointed at him. They said, ‘How can we converse with an infant?’\n[But] he said: ‘I am a servant of God. He has granted me the Scripture; made me a prophet;\nmade me blessed wherever I may be. He commanded me to pray, to give alms as long as I live,\nto cherish my mother. He did not make me domineering or graceless.\nPeace was on me the day I was born, and will be on me the day I die and the day I am raised to life again.’\nSuch was Jesus, son of Mary. [This is] a statement of the Truth about which they are in doubt:"
    }
   ]
  },
  {
   "id": "81",
   "ref": "Sura 81:1-14, at-Takwir",
   "name": "When the sun is folded up",
   "vk": "Sura 81:1-14, at-Takwir",
   "ar": [
    {
     "n": "1",
     "a": "إِذَا ٱلشَّمْسُ كُوِّرَتْ"
    },
    {
     "n": "2",
     "a": "وَإِذَا ٱلنُّجُومُ ٱنكَدَرَتْ"
    },
    {
     "n": "3",
     "a": "وَإِذَا ٱلْجِبَالُ سُيِّرَتْ"
    },
    {
     "n": "4",
     "a": "وَإِذَا ٱلْعِشَارُ عُطِّلَتْ"
    },
    {
     "n": "5",
     "a": "وَإِذَا ٱلْوُحُوشُ حُشِرَتْ"
    },
    {
     "n": "6",
     "a": "وَإِذَا ٱلْبِحَارُ سُجِّرَتْ"
    },
    {
     "n": "7",
     "a": "وَإِذَا ٱلنُّفُوسُ زُوِّجَتْ"
    },
    {
     "n": "8",
     "a": "وَإِذَا ٱلْمَوْءُۥدَةُ سُئِلَتْ"
    },
    {
     "n": "9",
     "a": "بِأَىِّ ذَنۢبٍ قُتِلَتْ"
    },
    {
     "n": "10",
     "a": "وَإِذَا ٱلصُّحُفُ نُشِرَتْ"
    },
    {
     "n": "11",
     "a": "وَإِذَا ٱلسَّمَآءُ كُشِطَتْ"
    },
    {
     "n": "12",
     "a": "وَإِذَا ٱلْجَحِيمُ سُعِّرَتْ"
    },
    {
     "n": "13",
     "a": "وَإِذَا ٱلْجَنَّةُ أُزْلِفَتْ"
    },
    {
     "n": "14",
     "a": "عَلِمَتْ نَفْسٌ مَّآ أَحْضَرَتْ"
    }
   ],
   "tr": "Idha sh-shamsu kuwwirat, wa-idha n-nujumu nkadarat...",
   "v": [
    {
     "k": "sale",
     "t": "When the sun shall be folded up; and when the stars shall fall; and when the mountains shall be made to pass away; and when the camels ten months gone with young shall be neglected; and when the wild beasts shall be gathered together; and when the seas shall boil; and when the souls shall be joined again to their bodies; and when the girl who hath been buried alive shall be asked for what crime she was put to death; and when the books shall be laid open; and when the heaven shall be removed; and when hell shall burn fiercely; and when paradise shall be brought near; every soul shall know what it hath wrought."
    },
    {
     "k": "pickthall",
     "t": "When the sun is overthrown,\nAnd when the stars fall,\nAnd when the hills are moved,\nAnd when the camels big with young are abandoned,\nAnd when the wild beasts are herded together,\nAnd when the seas rise,\nAnd when souls are reunited,\nAnd when the girl-child that was buried alive is asked\nFor what sin she was slain,\nAnd when the pages are laid open,\nAnd when the sky is torn away,\nAnd when hell is lighted,\nAnd when the Garden is brought nigh,\n(Then) every soul will know what it hath made ready."
    },
    {
     "k": "yusufali",
     "t": "When the sun (with its spacious light) is folded up;\nWhen the stars fall, losing their lustre;\nWhen the mountains vanish (like a mirage);\nWhen the she-camels, ten months with young, are left untended;\nWhen the wild beasts are herded together (in the human habitations);\nWhen the oceans boil over with a swell;\nWhen the souls are sorted out, (being joined, like with like);\nWhen the female (infant), buried alive, is questioned -\nFor what crime she was killed;\nWhen the scrolls are laid open;\nWhen the world on High is unveiled;\nWhen the Blazing Fire is kindled to fierce heat;\nAnd when the Garden is brought near;-\n(Then) shall each soul know what it has put forward."
    },
    {
     "k": "arberry",
     "t": "When the sun shall be darkened,\nwhen the stars shall be thrown down,\nwhen the mountains shall be set moving,\nwhen the pregnant camels shall be neglected,\nwhen the savage beasts shall be mustered,\nwhen the seas shall be set boiling,\nwhen the souls shall be coupled,\nwhen the buried infant shall be asked\nfor what sin she was slain,\nwhen the scrolls shall be unrolled,\nwhen heaven shall be stripped off;\nwhen Hell shall be set blazing,\nwhen Paradise shall be brought nigh,\nthen shall a soul know what it has produced."
    },
    {
     "k": "asad",
     "t": "WHEN THE SUN is shrouded in darkness,\nand when the stars lose their light,\nand when the mountains are made to vanish,\nand when she-camels big with young, about to give birth, are left untended,\nand when all beasts are gathered together,\nand when the seas boil over,\nand when all human beings are coupled [with their deeds],\nand when the girl-child that was buried alive is made to ask\nfor what crime she had been slain,\nand when the scrolls [of men's deeds] are unfolded,\nand when heaven is laid bare,\nand when the blazing fire [of hell] is kindled bright,\nand when paradise is brought into view:\n[on that Day] every human being will come to know what he has prepared [for himself]."
    },
    {
     "k": "sahih",
     "t": "When the sun is wrapped up [in darkness]\nAnd when the stars fall, dispersing,\nAnd when the mountains are removed\nAnd when full-term she-camels are neglected\nAnd when the wild beasts are gathered\nAnd when the seas are filled with flame\nAnd when the souls are paired\nAnd when the girl [who was] buried alive is asked\nFor what sin she was killed\nAnd when the pages are spread [i.e., made public]\nAnd when the sky is stripped away\nAnd when Hellfire is set ablaze\nAnd when Paradise is brought near,\nA soul will [then] know what it has brought [with it]."
    },
    {
     "k": "haleem",
     "t": "When the sun is shrouded in darkness,\nwhen the stars are dimmed,\nwhen the mountains are set in motion,\nwhen pregnant camels are abandoned,\nwhen wild beasts are herded together,\nwhen the seas boil over,\nwhen souls are sorted into classes,\nwhen the baby girl buried alive is asked\nfor what sin she was killed,\nwhen the records of deeds are spread open,\nwhen the sky is stripped away,\nwhen Hell is made to blaze\nand Paradise brought near:\nthen every soul will know what it has brought about."
    }
   ]
  },
  {
   "id": "99",
   "ref": "Sura 99, al-Zalzala",
   "name": "An atom's weight",
   "vk": "Sura 99, al-Zalzala",
   "ar": [
    {
     "n": "1",
     "a": "إِذَا زُلْزِلَتِ ٱلْأَرْضُ زِلْزَالَهَا"
    },
    {
     "n": "2",
     "a": "وَأَخْرَجَتِ ٱلْأَرْضُ أَثْقَالَهَا"
    },
    {
     "n": "3",
     "a": "وَقَالَ ٱلْإِنسَـٰنُ مَا لَهَا"
    },
    {
     "n": "4",
     "a": "يَوْمَئِذٍ تُحَدِّثُ أَخْبَارَهَا"
    },
    {
     "n": "5",
     "a": "بِأَنَّ رَبَّكَ أَوْحَىٰ لَهَا"
    },
    {
     "n": "6",
     "a": "يَوْمَئِذٍ يَصْدُرُ ٱلنَّاسُ أَشْتَاتًا لِّيُرَوْا۟ أَعْمَـٰلَهُمْ"
    },
    {
     "n": "7",
     "a": "فَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ خَيْرًا يَرَهُۥ"
    },
    {
     "n": "8",
     "a": "وَمَن يَعْمَلْ مِثْقَالَ ذَرَّةٍ شَرًّا يَرَهُۥ"
    }
   ],
   "tr": "Idha zulzilati l-ardu zilzalaha, wa-akhrajati l-ardu athqalaha...",
   "v": [
    {
     "k": "sale",
     "t": "When the earth shall be shaken by an earthquake; and the earth shall cast forth her burthens; and a man shall say, What aileth her? On that day the earth shall declare her tidings, for that thy Lord will inspire her. On that day men shall go forward in distinct classes, that they may behold their works. And whoever shall have wrought good of the weight of an ant, shall behold the same. And whoever shall have wrought evil of the weight of an ant, shall behold the same."
    },
    {
     "k": "pickthall",
     "t": "When Earth is shaken with her (final) earthquake\nAnd Earth yieldeth up her burdens,\nAnd man saith: What aileth her?\nThat day she will relate her chronicles,\nBecause thy Lord inspireth her.\nThat day mankind will issue forth in scattered groups to be shown their deeds.\nAnd whoso doeth good an atom's weight will see it then,\nAnd whoso doeth ill an atom's weight will see it then."
    },
    {
     "k": "yusufali",
     "t": "When the earth is shaken to her (utmost) convulsion,\nAnd the earth throws up her burdens (from within),\nAnd man cries (distressed): 'What is the matter with her?'-\nOn that Day will she declare her tidings:\nFor that thy Lord will have given her inspiration.\nOn that Day will men proceed in companies sorted out, to be shown the deeds that they (had done).\nThen shall anyone who has done an atom's weight of good, see it!\nAnd anyone who has done an atom's weight of evil, shall see it."
    },
    {
     "k": "arberry",
     "t": "When earth is shaken with a mighty shaking\nand earth brings forth her burdens,\nand Man says., 'What ails her?'\nupon that day she shall tell her tidings\nfor that her Lord has inspired her.\nUpon that day men shall issue in scatterings to see their works,\nand whoso has done an atom's weight of good shall see it,\nand whoso has done an atom's weight of evil shall see it."
    },
    {
     "k": "asad",
     "t": "WHEN THE EARTH quakes with her [last] mighty quaking,\nand [when] the earth yields up her burdens,\nand man cries out, \"What has happened to her?\" -\non that Day will she recount all her tidings,\nas thy Sustainer will have inspired her to do!\nOn that Day will all men come forward, cut off from one another, to be shown their [past] deeds.\nAnd so, he who shall have done an atom's weight of good, shall behold it;\nand he who shall have done an atom's weight of evil, shall behold it."
    },
    {
     "k": "sahih",
     "t": "When the earth is shaken with its [final] earthquake\nAnd the earth discharges its burdens\nAnd man says, \"What is [wrong] with it?\" -\nThat Day, it will report its news\nBecause your Lord has inspired [i.e., commanded] it.\nThat Day, the people will depart separated [into categories] to be shown [the result of] their deeds.\nSo whoever does an atom's weight of good will see it,\nAnd whoever does an atom's weight of evil will see it."
    },
    {
     "k": "haleem",
     "t": "When the earth is shaken violently in its [last] quaking,\nwhen the earth throws out its burdens,\nwhen man cries, ‘What is happening to it?’;\non that Day, it will tell all\nbecause your Lord will inspire it [to do so].\nOn that Day, people will come forward in separate groups to be shown their deeds:\nwhoever has done an atom’s-weight of good will see it,\nbut whoever has done an atom’s-weight of evil will see that."
    }
   ]
  },
  {
   "id": "39:53",
   "ref": "Sura 39:53",
   "name": "Do not despair",
   "vk": "Sura 39:53",
   "ar": [
    {
     "n": "53",
     "a": "۞ قُلْ يَـٰعِبَادِىَ ٱلَّذِينَ أَسْرَفُوا۟ عَلَىٰٓ أَنفُسِهِمْ لَا تَقْنَطُوا۟ مِن رَّحْمَةِ ٱللَّهِ ۚ إِنَّ ٱللَّهَ يَغْفِرُ ٱلذُّنُوبَ جَمِيعًا ۚ إِنَّهُۥ هُوَ ٱلْغَفُورُ ٱلرَّحِيمُ"
    }
   ],
   "tr": "Qul ya 'ibadiya lladhina asrafu 'ala anfusihim la taqnatu min rahmati llah...",
   "v": [
    {
     "k": "sale",
     "t": "O my servants who have transgressed against your own souls, despair not of the mercy of God: seeing that God forgiveth all sins; for he is gracious and merciful."
    },
    {
     "k": "pickthall",
     "t": "Say: O My slaves who have been prodigal to their own hurt! Despair not of the mercy of Allah, Who forgiveth all sins. Lo! He is the Forgiving, the Merciful."
    },
    {
     "k": "yusufali",
     "t": "Say: \"O my Servants who have transgressed against their souls! Despair not of the Mercy of Allah: for Allah forgives all sins: for He is Oft-Forgiving, Most Merciful."
    },
    {
     "k": "arberry",
     "t": "Say: 'O my people who have been prodigal against yourselves, do not despair of God's mercy; surely God forgives sins altogether; surely He is the All-forgiving, the All-compassionate."
    },
    {
     "k": "asad",
     "t": "SAY: “[Thus speaks God:] ‘O you servants of Mine who have transgressed against your own selves! Despair not of God’s mercy: behold, God forgives all sins - for, verily, He alone is much-forgiving, a dis­penser of grace!’”"
    },
    {
     "k": "sahih",
     "t": "Say, \"O My servants who have transgressed against themselves [by sinning], do not despair of the mercy of Allāh. Indeed, Allāh forgives all sins. Indeed, it is He who is the Forgiving, the Merciful.\""
    },
    {
     "k": "haleem",
     "t": "Say, ‘[God says], My servants who have harmed yourselves by your own excess, do not despair of God’s mercy. God forgives all sins: He is truly the Most Forgiving, the Most Merciful."
    }
   ]
  }
 ]
};
