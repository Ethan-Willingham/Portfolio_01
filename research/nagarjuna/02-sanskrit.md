# Nāgārjuna, Mūlamadhyamakakārikā — Sanskrit source (Devanagari + IAST)

**Purpose:** verbatim Sanskrit for the selected MMK verses, in both Devanagari and IAST, for a scholarly blog post.

## Confidence and sources

**Confidence: HIGH on the IAST** (pulled verbatim from a critical-edition-based digital text, byte-checked for correct Unicode diacritics). **Devanagari is mechanically transliterated from that IAST** (see method) and is reliable, with the one expected judgment call noted below (word-final virāma vs. sandhi-joining).

**Source editions used:**

1. **GRETIL** (Göttingen Register of Electronic Texts in Indian Languages), Nāgārjuna's *Mūlamadhyamakakārikā*, input by Douglas Bachman, revised by Richard Mahoney. This file follows the **J.W. de Jong (1977/1978) critical edition** verse text. It is the source for all verses **except the two dedicatory verses** (this particular file begins at 1.1 and has no maṅgala).
   - URL: https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/3_phil/buddh/nagmmk_u.htm
   - (Identical text also at the corpusTEI HTML mirror: http://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/html/sa_nAgArjuna-mUlamadhyamakakArikA.htm)

2. **GRETIL**, Nāgārjuna's *Madhyamakaśāstra* (the kārikā text as carried in Candrakīrti's *Prasannapadā* framing, with the maṅgala). **Source for the two dedicatory verses** (labeled there Mś_1.1 and Mś_1.2).
   - URL: http://gretil.sub.uni-goettingen.de/gretil/corpustei/transformations/html/sa_nAgArjuna-madhyamakazAstra.htm

3. **Cross-check for the dedicatory verses and 1.1:** Wikisource, "Mūlamadhyamakakārikā: first chapter in romanized Sanskrit with diacritics," which prints the *Prasannapadā* text as emended by **de Jong (1978)** and revised by **Akira Saito (1985)**. It agrees with GRETIL character-for-character (one orthographic difference only, noted below).
   - URL: https://wikisource.org/wiki/M%C5%ABlamadhyamakak%C4%81rik%C4%81:_first_chapter_in_romanized_Sanskrit_with_diacritics

**Method for Devanagari:** the verified IAST was transliterated to Devanagari with the `indic-transliteration` Python library (`sanscript`, IAST → DEVANAGARI scheme), the standard well-tested tool used in Sanskrit digital humanities. This is deterministic (rule-based, not a guess) and round-trips losslessly back to IAST. I did **not** hand-type any Devanagari.

**Diacritic check:** every non-ASCII character in the IAST was confirmed to be the correct precomposed Unicode codepoint: ā (U+0101), ī (U+012B), ū (U+016B), ṛ (U+1E5B), ṃ (U+1E43), ḥ (U+1E25), ṇ (U+1E47), ṣ (U+1E63), ś (U+015B), ñ (U+00F1). No look-alike characters.

### Flags / things to know

- **Word-separated Devanagari.** The Devanagari below keeps words separate, so word-final consonants carry an explicit virāma (e.g. अनिरोधम्, अगतद्, कश्चिद्). This is the standard *scholarly* presentation and matches the IAST word-spacing one-to-one. Many *printed* Devanagari editions instead join everything by sandhi within a pāda (e.g. the dedication as `अनिरोधमनुत्पादमनुच्छेदमशाश्वतम्`). Both are the same text; pick whichever style your post wants and stay consistent. A sandhi-joined variant of the dedication is given at the end of that verse for reference.
- **Dedication final-anusvāra orthography.** GRETIL (Madhyamakaśāstra) writes the verse-final syllables of the maṅgala with plain **-m** (aśāśvata**m**, anirgama**m**, śiva**m**, vara**m**). Wikisource/de-Jong-Saito writes them with verse-final **-ṃ** (anusvāra: aśāśvata**ṃ**, etc.). Before a pause these are equivalent; -m is the more conservative print. I have followed GRETIL (-m) in the IAST and Devanagari below and flag the variant here.
- **24.9 elision:** `ye 'nayor` — the `'` is an avagraha (Dev. ऽ), marking elided initial *a-* after `ye` (ye + anayor). Rendered as ये ऽनयोर्. Correct.
- The MMK survives complete in Sanskrit only because Candrakīrti quotes every kārikā in the *Prasannapadā*; the critical text is de Jong (1977), with later refinements by Ye Shaoyong (2011, using a Tibetan-held birch-bark manuscript). The verses below are stable across all these editions; none of the selected verses is a known site of major textual dispute.

---

## Dedicatory verses (maṅgalācaraṇa, before chapter 1)

### Dedication 1 — the eight negations (aṣṭa-niṣedha)

अनिरोधम् अनुत्पादम् अनुच्छेदम् अशाश्वतम् । अनेकार्थम् अनानार्थम् अनागमम् अनिर्गमम् ॥

*anirodham anutpādam anucchedam aśāśvatam / anekārtham anānārtham anāgamam anirgamam //*

- Source: GRETIL *Madhyamakaśāstra* (Mś_1.1); cross-checked Wikisource (de Jong 1978 / Saito 1985).
- Sandhi-joined Devanagari variant (as in many printed eds.): अनिरोधमनुत्पादमनुच्छेदमशाश्वतम् । अनेकार्थमनानार्थमनागममनिर्गमम् ॥
- Variant note: verse-final -m vs. -ṃ (see flags). The eight: non-ceasing, non-arising, non-annihilation, non-permanence, non-one-meaning (non-identity), non-many-meaning (non-difference), non-coming, non-going.

### Dedication 2 — homage to the Buddha

यः प्रतीत्यसमुत्पादं प्रपञ्चोपशमं शिवम् । देशयाम् आस संबुद्धस् तं वन्दे वदतां वरम् ॥

*yaḥ pratītyasamutpādaṃ prapañcopaśamaṃ śivam / deśayām āsa saṃbuddhas taṃ vande vadatāṃ varam //*

- Source: GRETIL *Madhyamakaśāstra* (Mś_1.2); cross-checked Wikisource (de Jong 1978 / Saito 1985).
- Sandhi-joined Devanagari variant: यः प्रतीत्यसमुत्पादं प्रपञ्चोपशमं शिवम् । देशयामास संबुद्धस्तं वन्दे वदतां वरम् ॥
- `deśayām āsa` = `deśayāmāsa` (periphrastic perfect of √diś, "he taught"); written as two words in de Jong, one word in GRETIL Madhyamakaśāstra. Same text.

---

## Chapter 1 — Examination of conditions (pratyayaparīkṣā)

### MMK 1.1

न स्वतो नापि परतो न द्वाभ्यां नाप्य् अहेतुतः । उत्पन्ना जातु विद्यन्ते भावाः क्व चन के चन ॥

*na svato nāpi parato na dvābhyāṃ nāpy ahetutaḥ / utpannā jātu vidyante bhāvāḥ kva cana ke cana //*

- Source: GRETIL MMK (MMK_1.1).
- `kva cana ke cana` is sometimes printed joined as `kvacana kecana` (so Wikisource); identical text, spacing only.

---

## Chapter 2 — Examination of motion / the goer (gatāgataparīkṣā)

### MMK 2.1

गतं न गम्यते तावद् अगतं नैव गम्यते । गतागतविनिर्मुक्तं गम्यमानं न गम्यते ॥

*gataṃ na gamyate tāvad agataṃ naiva gamyate / gatāgatavinirmuktaṃ gamyamānaṃ na gamyate //*

- Source: GRETIL MMK (MMK_2.1).

---

## Chapter 13 — Examination of formations / conditioned things (saṃskāraparīkṣā)

### MMK 13.8

शून्यता सर्वदृष्टीनां प्रोक्ता निःसरणं जिनैः । येषां तु शून्यतादृष्टिस् तान् असाध्यान् बभाषिरे ॥

*śūnyatā sarvadṛṣṭīnāṃ proktā niḥsaraṇaṃ jinaiḥ / yeṣāṃ tu śūnyatādṛṣṭis tān asādhyān babhāṣire //*

- Source: GRETIL MMK (MMK_13.8).
- Sense: "Emptiness is declared by the Conquerors to be the escape from all views; but those who hold emptiness *as* a view, them they called incurable."

---

## Chapter 18 — Examination of self and entities (ātmaparīkṣā)

### MMK 18.5

कर्मक्लेशक्षयान् मोक्षः कर्मक्लेशा विकल्पतः । ते प्रपञ्चात् प्रपञ्चस् तु शून्यतायां निरुध्यते ॥

*karmakleśakṣayān mokṣaḥ karmakleśā vikalpataḥ / te prapañcāt prapañcas tu śūnyatāyāṃ nirudhyate //*

- Source: GRETIL MMK (MMK_18.5).
- Sense: "Liberation is from the exhaustion of action and affliction; action and affliction are from conceptual construction (vikalpa); these are from proliferation (prapañca); but proliferation ceases in emptiness."

---

## Chapter 24 — Examination of the Four Noble Truths (āryasatyaparīkṣā)

### MMK 24.8 — the two truths

द्वे सत्ये समुपाश्रित्य बुद्धानां धर्मदेशना । लोकसंवृतिसत्यं च सत्यं च परमार्थतः ॥

*dve satye samupāśritya buddhānāṃ dharmadeśanā / lokasaṃvṛtisatyaṃ ca satyaṃ ca paramārthataḥ //*

- Source: GRETIL MMK (MMK_24.8).
- Sense: "The Buddhas' teaching of the Dharma rests on two truths: world-concealing (conventional) truth, and truth in the ultimate sense."

### MMK 24.9

ये ऽनयोर् न विजानन्ति विभागं सत्ययोर् द्वयोः । ते तत्त्वं न विजानन्ति गम्भीरं बुद्धशासने ॥

*ye 'nayor na vijānanti vibhāgaṃ satyayor dvayoḥ / te tattvaṃ na vijānanti gambhīraṃ buddhaśāsane //*

- Source: GRETIL MMK (MMK_24.9). (`ye 'nayor` = ye + anayor, avagraha ऽ.)

### MMK 24.10

व्यवहारम् अनाश्रित्य परमार्थो न देश्यते । परमार्थम् अनागम्य निर्वाणं नाधिगम्यते ॥

*vyavahāram anāśritya paramārtho na deśyate / paramārtham anāgamya nirvāṇaṃ nādhigamyate //*

- Source: GRETIL MMK (MMK_24.10).
- Sense: "Without relying on convention (vyavahāra), the ultimate is not taught; without reaching the ultimate, nirvāṇa is not attained."

### MMK 24.18 — dependent arising = emptiness = the middle way

यः प्रतीत्यसमुत्पादः शून्यतां तां प्रचक्ष्महे । सा प्रज्ञप्तिर् उपादाय प्रतिपत् सैव मध्यमा ॥

*yaḥ pratītyasamutpādaḥ śūnyatāṃ tāṃ pracakṣmahe / sā prajñaptir upādāya pratipat saiva madhyamā //*

- Source: GRETIL MMK (MMK_24.18).
- Sense: "That which is dependent arising, that we declare to be emptiness; that is a dependent designation (prajñaptir upādāya); that itself is the middle way."

### MMK 24.19

अप्रतीत्य समुत्पन्नो धर्मः कश्चिन् न विद्यते । यस्मात् तस्माद् अशून्यो हि धर्मः कश्चिन् न विद्यते ॥

*apratītya samutpanno dharmaḥ kaścin na vidyate / yasmāt tasmād aśūnyo hi dharmaḥ kaścin na vidyate //*

- Source: GRETIL MMK (MMK_24.19).
- Sense: "No dharma whatever exists that has arisen without dependence; therefore no dharma whatever exists that is non-empty."

---

## Chapter 25 — Examination of nirvāṇa (nirvāṇaparīkṣā)

### MMK 25.19 — saṃsāra and nirvāṇa not distinct

न संसारस्य निर्वाणात् किंचिद् अस्ति विशेषणम् । न निर्वाणस्य संसारात् किंचिद् अस्ति विशेषणम् ॥

*na saṃsārasya nirvāṇāt kiṃcid asti viśeṣaṇam / na nirvāṇasya saṃsārāt kiṃcid asti viśeṣaṇam //*

- Source: GRETIL MMK (MMK_25.19).
- Sense: "There is no distinction whatever of saṃsāra from nirvāṇa; there is no distinction whatever of nirvāṇa from saṃsāra."

### MMK 25.20

निर्वाणस्य च या कोटिः कोटिः संसरणस्य च । न तयोर् अन्तरं किंचित् सुसूक्ष्मम् अपि विद्यते ॥

*nirvāṇasya ca yā koṭiḥ koṭiḥ saṃsaraṇasya ca / na tayor antaraṃ kiṃcit susūkṣmam api vidyate //*

- Source: GRETIL MMK (MMK_25.20).
- Sense: "The limit (koṭi) of nirvāṇa is the limit of saṃsāra; between the two there is not the slightest, subtlest difference."

### MMK 25.24 — the final verse

सर्वोपलम्भोपशमः प्रपञ्चोपशमः शिवः । न क्व चित् कस्यचित् कश्चिद् धर्मो बुद्धेन देशितः ॥

*sarvopalambhopaśamaḥ prapañcopaśamaḥ śivaḥ / na kva cit kasyacit kaścid dharmo buddhena deśitaḥ //*

- Source: GRETIL MMK (MMK_25.24). This is the last verse of the MMK (de Jong numbering; chapter 25 has 24 verses; chapters 26-27 follow as appendices in the full text).
- Note: `kaścid dharmo` → कश्चिद् धर्मो (the d + dh; word-separated keeps कश्चिद् with virāma).
- Sense: "The stilling of all apprehension (upalambha), the stilling of proliferation, peace (śiva): no dharma whatsoever was taught by the Buddha anywhere to anyone."

---

## Key technical terms — word-glosses (Devanagari, IAST, etymology)

### svabhāva — स्वभाव — *svabhāva*
"own-being," intrinsic nature/essence. **sva** (स्व) "own, self" + **bhāva** (भाव) "being, becoming, state, nature" (from √bhū, "to be"). Literal: *own-being*. In MMK this is exactly what Nāgārjuna denies of everything: nothing has a fixed, independent, self-established essence. (Devanagari of the parts: स्व + भाव.)

### śūnyatā — शून्यता — *śūnyatā*
"emptiness, voidness, the state of being empty." **śūnya** (शून्य) "empty, void, hollow" + abstract suffix **-tā** (-ता) "-ness." Literal: *empty-ness*.
- **Confirmed etymology:** śūnya derives from the root **√śvi / śū** ("to swell, to grow"). The development is counter-intuitive but standard in the dictionaries (Monier-Williams; Mayrhofer's etymological dictionary): the root sense is "swollen," and a swollen/inflated thing is **hollow inside** — hence "empty, void." So the same image holds both "swollen" and "hollow/empty." (Compare the parallel in how a "blown-up" balloon is full of nothing.) The "swollen → hollow → empty" path is the accepted account; flagged here only because it surprises readers, not because it is doubtful.
- **śūnya is also the Sanskrit word for the number zero** (शून्य). Indian mathematicians used śūnya for the zero-digit and the empty place in positional notation; the word traveled (via Arabic *ṣifr*, a calque of śūnya "empty") into Latin *zephirum* → English *zero* and *cipher*. So Nāgārjuna's "emptiness" and the mathematical "zero" are literally the same word. (This is a genuine etymological link, safe to state.)

### prapañca — प्रपञ्च — *prapañca*
"conceptual proliferation; diffuseness; the manifold." **pra-** (प्र, "forth, forward, out") + **√pañc / pañca**-, conveying "spreading out, expansion, making manifold." Core literal sense: *expansion, spreading-out, diversification* — the mind's elaboration of bare experience into a sprawl of concepts, names, and oppositions. In ordinary Sanskrit it can mean "manifestation, expansion, the visible world, even prolixity/verbosity"; in Madhyamaka it is the technical name for conceptual-linguistic proliferation that fabricates the appearance of an independently real world. Its cessation (prapañcopaśama, प्रपञ्चोपशम) is peace/nirvāṇa (see 18.5, 25.24, and the dedication).
- Flag: the deep verbal root is debated by etymologists (often connected to a "spread/expand" sense; sometimes loosely associated with *pañca* "five," i.e. the five senses spreading out, but that is a folk/secondary association, not the secure derivation). The *meaning* "expansion → proliferation" is secure; the precise root history is the soft spot.

### pratītyasamutpāda — प्रतीत्यसमुत्पाद — *pratītyasamutpāda*
"dependent co-arising / dependent origination." Two parts:
- **pratītya** (प्रतीत्य) — gerund/absolutive of **prati + √i** ("to go toward, meet, approach, depend on"); literally "having met / having depended upon / in dependence on."
- **samutpāda** (समुत्पाद) — **sam-** ("together") + **ut-** ("up") + **pāda** from √pad ("to arise, come about"); "arising-up-together," co-arising.
- Literal whole: *having-depended, an arising-together* → "arising in dependence." This is the doctrine at the heart of MMK 24.18 (it is equated with śūnyatā).

### saṃvṛti — संवृति — *saṃvṛti*
"the concealing; the conventional." **sam-** ("together, completely") + **√vṛ** ("to cover, conceal, enclose"); literal sense *covering-over, concealment*. Hence *saṃvṛti-satya* (संवृतिसत्य) = "concealing truth," the conventional/everyday truth that veils the ultimate (MMK 24.8 reads *loka-saṃvṛti-satya*, "world-concealing truth"). Candrakīrti famously glosses saṃvṛti in three senses, the primary being "that which completely conceals (the real)."

### paramārtha — परमार्थ — *paramārtha*
"the ultimate; the highest meaning/object." **parama** (परम, "highest, supreme, furthest") + **artha** (अर्थ, "meaning, object, aim, the real thing"). Literal: *highest-object* / *supreme-meaning*. *Paramārtha-satya* (परमार्थसत्य) = "ultimate truth," the truth of how things actually are (emptiness), paired against saṃvṛti in MMK 24.8-10.

### prajñaptir upādāya — प्रज्ञप्तिर् उपादाय — *prajñaptir upādāya* (from 24.18)
"dependent designation / designation in dependence." **prajñapti** (प्रज्ञप्ति) "designation, making-known, a conceptual/nominal positing" (from pra + √jñā, "to make known, declare") + **upādāya** (उपादाय) absolutive of upa-ā-√dā, "having taken up, depending on, in reliance on." Literal: *a designation made in dependence (on its constituents)*. In 24.18 emptiness itself is called a prajñaptir upādāya — even "emptiness" is only a dependent designation, not a thing, which is why holding it as a view is the error warned of in 13.8.

---

## Appendix: chapter titles (for reference, IAST)

- Ch. 1 pratyayaparīkṣā (conditions)
- Ch. 2 gatāgataparīkṣā (the gone, the not-gone, motion)
- Ch. 13 saṃskāraparīkṣā (formations)
- Ch. 18 ātmaparīkṣā (self / entities)
- Ch. 24 āryasatyaparīkṣā (the noble truths)
- Ch. 25 nirvāṇaparīkṣā (nirvāṇa)
