/* ============================================================
   The Kamasutra, side by side: the corpus.
   Vatsyayana's keystone passages in Sanskrit (romanized, the
   root sutras), then the 1883 Burton/Arbuthnot translation set
   against the accurate 2002 translation by Wendy Doniger and
   Sudhir Kakar. One entry per translator per passage. The whole
   point of the page is the gap between those two columns. Used
   by js/kama.js.

   shape: window.KAMA = {
     translators: { key: {name, year, n, src} },
     order: [keys, chronological],
     passages: [ {id, book, bookTitle, ref, iast, gloss, v:[{k, t}]} ]
   }

   Every quotation is reproduced verbatim for comparison and
   study, each translator named. Burton (1883) is public domain;
   Doniger and Kakar (2002) is quoted for comparison. Quotes were
   checked line by line against the Project Gutenberg Burton text
   (ebook 27827) and the Oxford World's Classics edition. Where
   two non-adjacent sentences are quoted, a blank line ("\n\n")
   marks the gap; "[...]" marks an elision inside one quoted run.
   Curly quotes are normalized to straight, but each source keeps
   its own punctuation, including the em dashes the rest of the
   site avoids (one falls in Doniger's passage 1). Nothing else is
   changed. No paraphrase, ever.

   The Sanskrit is the romanized (IAST) root text from the Fezas
   critical edition via GRETIL; sutra numbers follow that edition.
   ============================================================ */
window.KAMA = {
  translators: {
    burton:  { name: "Richard Burton", year: 1883, n: 13, src: "the 'Kama Shastra Society', London and Benares (public domain)" },
    doniger: { name: "Doniger and Kakar", year: 2002, n: 13, src: "Oxford World's Classics" }
  },
  order: ["burton", "doniger"],

  passages: [
    {
      id: 1, book: 1, bookTitle: "General Principles", ref: "1.2.11",
      iast: "śrotra-tvak-cakṣur-jihvā-ghrāṇānām ātma-saṃyuktena manasādhiṣṭhitānāṃ sveṣu sveṣu viṣayeṣv ānukūlyataḥ pravṛttiḥ kāmaḥ.",
      gloss: "Kama is the ear, skin, eye, tongue, and nose, led by the mind and the self, each engaging its object with pleasure.",
      v: [
        { k: "burton", t: "Kama is the enjoyment of appropriate objects by the five senses of hearing, feeling, seeing, tasting, and smelling, assisted by the mind together with the soul.\n\nWhen all the three, viz., Dharma, Artha, and Kama come together, the former is better than the one which follows it, i.e., Dharma is better than Artha, and Artha is better than Kama." },
        { k: "doniger", t: "Pleasure, in general, consists in engaging the ear, skin, eye, tongue, and nose each in its own appropriate sensation, all under the control of the mind and heart driven by the conscious self.\n\nWhen these three aims—religion, power, and pleasure—compete, each is more important than the one that follows." }
      ]
    },
    {
      id: 2, book: 1, bookTitle: "General Principles", ref: "1.2.23",
      iast: "varam adya kapotaḥ śvo mayūrāt.",
      gloss: "Better a pigeon today than a peacock tomorrow. The materialists' case against deferring any pleasure.",
      v: [
        { k: "burton", t: "The Lokayatikas say: Religious ordinances should not be observed, for they bear a future fruit, and at the same time it is also doubtful whether they will bear any fruit at all. What foolish person will give away that which is in his own hands into the hands of another? Moreover, it is better to have a pigeon to-day than a peacock to-morrow; and a copper coin which we have the certainty of obtaining, is better than a gold coin, the possession of which is doubtful." },
        { k: "doniger", t: "Who but a fool would take what is in his own hand and put it in someone else's hand? 'Better a pigeon today than a peacock tomorrow,' and 'Better a copper coin that is certain than a gold coin that is doubtful.'" }
      ]
    },
    {
      id: 3, book: 1, bookTitle: "General Principles", ref: "1.3.15",
      iast: "gītam, vādyam, nṛtyam, ālekhyam, viśeṣaka-cchedyam …",
      gloss: "Singing, instrumental music, dancing, painting, cutting leaf-patterns, and on to sixty-four arts a cultured person learns.",
      v: [
        { k: "burton", t: "1. Singing.\n2. Playing on musical instruments.\n3. Dancing.\n4. Union of dancing, singing, and playing instrumental music.\n5. Writing and drawing.\n6. Tattooing.\n7. Arraying and adorning an idol with rice and flowers.\n8. Spreading and arraying beds or couches of flowers, or flowers upon the ground." },
        { k: "doniger", t: "singing; playing musical instruments; dancing; painting; cutting leaves into shapes; making lines on the floor with rice-powder and flowers; arranging flowers; [...] preparing various forms of vegetables, soups, and other things to eat; preparing wines, fruit juices, and other things to drink; needlework; weaving; playing the lute and the drum [...]" }
      ]
    },
    {
      id: 4, book: 1, bookTitle: "General Principles", ref: "1.4.1",
      iast: "gārhasthyam adhigamya nāgaraka-vṛttaṃ varteta.",
      gloss: "Having set up a household, he lives the life of the nagaraka, the cultivated man-about-town.",
      v: [
        { k: "burton", t: "He should take a house in a city, or large village, or in the vicinity of good men, or in a place which is the resort of many persons. This abode should be situated near some water, and divided into different compartments for different purposes. It should be surrounded by a garden, and also contain two rooms, an outer and an inner one. The inner room should be occupied by the females, while the outer room, balmy with rich perfumes, should contain a bed, soft, agreeable to the sight, covered with a clean white cloth, low in the middle part, having garlands and bunches of flowers upon it." },
        { k: "doniger", t: "And there he makes his home in a house near water, with an orchard, separate servant quarters, and two bedrooms.\n\nThis is how the house is furnished: In the outer bedroom there is a bed, low in the middle and very soft, with pillows on both sides and a white top sheet. (There is also a couch.) At the head of the bed there is a grass mat and an altar, on which are placed the oils and garlands left over from the night, a pot of beeswax, a vial of perfume, some bark from a lemon tree, and betel." }
      ]
    },
    {
      id: 5, book: 2, bookTitle: "On Sex", ref: "2.1.1",
      iast: "śaśo vṛṣo 'śva iti liṅgato nāyaka-viśeṣāḥ. nāyikā punar mṛgī baḍavā hastinī ceti.",
      gloss: "By the liṅga, men are hare, bull, horse. Women, in turn, are doe, mare, elephant. (No organ-word is given for the woman at all.)",
      v: [
        { k: "burton", t: "Man is divided into three classes, viz., the hare man, the bull man, and the horse man, according to the size of his lingam. Woman also, according to the depth of her yoni, is either a female deer, a mare, or a female elephant. There are thus three equal unions between persons of corresponding dimensions, and there are six unequal unions, when the dimensions do not correspond, or nine in all." },
        { k: "doniger", t: "The man is called a 'hare', 'bull', or 'stallion', according to the size of his sexual organ; a woman, however, is called a 'doe', 'mare', or 'elephant cow'. And so there are three equal couplings, between sexual partners of similar size, and six unequal ones." }
      ]
    },
    {
      id: 6, book: 2, bookTitle: "On Sex", ref: "2.1.22",
      iast: "suratānte sukhaṃ puṃsāṃ strīṇāṃ tu satataṃ sukham.",
      gloss: "A man's pleasure comes at the end of sex; a woman's runs the whole way through.",
      v: [
        { k: "burton", t: "Auddalika says, 'Females do not emit as males do. The males simply remove their desire, while the females, from their consciousness of desire, feel a certain kind of pleasure, which gives them satisfaction, but it is impossible for them to tell you what kind of pleasure they feel.'\n\nLastly, Vatsyayana is of opinion that the semen of the female falls in the same way as that of the male." },
        { k: "doniger", t: "Men's sensual pleasure comes at the end of sex,\nbut women's is continual.\nAnd the wish to stop occurs\nonly when fluids are used up.\n\nVatsyayana says: It is clearly apparent from this very argument that the sensual experience of a woman is manifested just like that of a man. How could two people of the same species who are striving toward a single goal achieve different climaxes?" }
      ]
    },
    {
      id: 7, book: 2, bookTitle: "On Sex", ref: "2.2.14",
      iast: "latāveṣṭitakaṃ vṛkṣādhirūḍhakaṃ tila-taṇḍulakaṃ kṣīra-nīrakam.",
      gloss: "Four embraces of lovers already together: twining vine, climbing the tree, rice-and-sesame, milk-and-water.",
      v: [
        { k: "burton", t: "When a woman, clinging to a man as a creeper twines round a tree, bends his head down to hers with the desire of kissing him and slightly makes the sound of sut sut, embraces him, and looks lovingly towards him, it is called an embrace like the 'twining of a creeper.'\n\nWhen a man and a woman are very much in love with each other, and not thinking of any pain or hurt, embrace each other as if they were entering into each other's bodies, it is called an embrace like a 'mixture of milk and water.'" },
        { k: "doniger", t: "Four embraces are used while making love: the 'twining vine', 'climbing the tree', 'rice-and-sesame', and 'milk-and-water'.\n\nBlind with passion, oblivious to pain or injury, they embrace as if they would enter one another; she may be on his lap, seated facing him, or on a bed. This is called 'milk-and-water'." }
      ]
    },
    {
      id: 8, book: 2, bookTitle: "On Sex", ref: "2.6.1",
      iast: "rāga-kāle viśālayanty eva jaghanaṃ mṛgī saṃviśed uccarate.",
      gloss: "The famous chapter of positions, one chapter of one book of seven. At the moment of passion, a 'doe' opens herself for the 'high union.'",
      v: [
        { k: "burton", t: "On the occasion of a 'high congress' the Mrigi (Deer) woman should lie down in such a way as to widen her yoni, while in a 'low congress' the Hastini (Elephant) woman should lie down so as to contract hers. But in an 'equal congress' they should lie down in the natural position." },
        { k: "doniger", t: "At the moment of passion, in a coupling where the man is larger than the woman, a 'doe' positions herself in such a way as to stretch herself open inside. And in a coupling where the man is smaller, an 'elephant cow' contracts herself inside." }
      ]
    },
    {
      id: 9, book: 2, bookTitle: "On Sex", ref: "2.7.25",
      iast: "kaṣṭam an-ārya-vṛttam an-ādṛtam iti vātsyāyanaḥ.",
      gloss: "Painful, ignoble, not to be condoned, says Vatsyayana, of the violence he has just finished describing.",
      v: [
        { k: "burton", t: "Instances of the dangerous use of them may be given as follows. The King of the Panchalas killed the courtezan Madhavasena by means of the wedge during congress. King Shatakarni Shatavahana of the Kuntalas deprived his great Queen Malayavati of her life by a pair of scissors.\n\nThe various modes of enjoyment are not for all times or for all persons, but they should only be used at the proper time, and in the proper countries and places." },
        { k: "doniger", t: "But Vatsyayana says: It is a painful and barbarous thing to do, and not to be sanctioned.\n\nThe King of the Cholas killed Chitrasena, a courtesan de luxe, by using the 'wedge' during sex. And the Kuntala king Shatakarni Shatavahana killed his queen, Malayavati, by using the 'scissor'." }
      ]
    },
    {
      id: 10, book: 3, bookTitle: "Acquiring a Wife", ref: "3.2.4",
      iast: "upakrameta visrambhayec ca na tu brahmacaryam ativarteta.",
      gloss: "He should make advances and win her trust, but not break his continence. On the first nights with a young bride.",
      v: [
        { k: "burton", t: "Vatsyayana says that the man should begin to win her over, and to create confidence in her, but should abstain at first from sexual pleasures. Women being of a tender nature, want tender beginnings, and when they are forcibly approached by men with whom they are but slightly acquainted, they sometimes suddenly become haters of sexual connection, and sometimes even haters of the male sex." },
        { k: "doniger", t: "For the first three nights after they have been joined together, the couple sleep on the ground, remain sexually continent, and eat food that has no salt or spices.\n\nVatsyayana says: He begins to entice her and win her trust, but he still remains sexually continent." }
      ]
    },
    {
      id: 11, book: 4, bookTitle: "The Wife", ref: "4.1.20",
      iast: "ekacāriṇī-vṛttam.",
      gloss: "The conduct of the only wife. Whether she may scold a straying husband, and the single word Burton added.",
      v: [
        { k: "burton", t: "In the event of any misconduct on the part of her husband, she should not blame him excessively though she be a little displeased. She should not use abusive language towards him, but rebuke him with conciliatory words, whether he be in the company of friends or alone." },
        { k: "doniger", t: "She scolds him with abusive language when he is alone or among friends." }
      ]
    },
    {
      id: 12, book: 6, bookTitle: "Courtesans", ref: "6.1.1",
      iast: "veśyānāṃ puruṣādhigame ratir vṛttiś ca sargāt.",
      gloss: "For courtesans, taking up with men is by nature both pleasure and a living.",
      v: [
        { k: "burton", t: "By having intercourse with men courtesans obtain sexual pleasure, as well as their own maintenance. Now when a courtesan takes up with a man from love, the action is natural; but when she resorts to him for the purpose of getting money, her action is artificial or forced. Even in the latter case, however, she should conduct herself as if her love were indeed natural, because men repose their confidence on those women who apparently love them." },
        { k: "doniger", t: "Courtesans find sexual pleasure and a natural way of making a living in their sexual relations with men. Doing it for sexual pleasure is natural, and for gain is artificial, but she makes the artificial, too, appear natural, because men trust women who are driven by desire." }
      ]
    },
    {
      id: 13, book: 7, bookTitle: "Secret Lore", ref: "7.1.57",
      iast: "vihitaṃ loka-yātrārthaṃ na rāgārtho 'sya saṃvidhiḥ.",
      gloss: "It was composed for the good of the world, not for the sake of passion.",
      v: [
        { k: "burton", t: "This work is not intended to be used merely as an instrument for satisfying our desires. A person, acquainted with the true principles of this science, and who preserves his Dharma, Artha, and Kama, and has regard for the practices of the people, is sure to obtain the mastery over his senses.\n\nIn short, an intelligent and prudent person, attending to Dharma and Artha, and attending to Kama also, without becoming the slave of his passions, obtains success in everything that he may undertake." },
        { k: "doniger", t: "By combining earlier texts\nand following their methods,\nVatsyayana composed this Kamasutra,\nwith great effort, in a condensed form.\n\nA man who knows its real meaning\nsees religion, power, and pleasure,\nhis own convictions, and the ways of the world\nfor what they are, and he is not driven by passion." }
      ]
    }
  ]
};
