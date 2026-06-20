/* ============================================================
   meditation-data.js
   The eleven techniques, each mapped on five axes for the
   explorer in meditation.html:
     one    what it is (one plain sentence)
     origin where it came from
     claims what the tradition claims
     ev     what the evidence shows  (+ grade: a/b/c/d)
     how    how to do the core of it (numbered steps)
     time   how long
     miss   the common mistakes
     note   an honest aside (cost, a teacher caveat)
   Data only. The explorer (js/meditation.js) renders it.
   Sources are cited in the post's reference list. No em dashes.
   ============================================================ */
window.MED = {
  fams: {
    focus:  { label: 'Focus on one thing',    color: '#dfc288' },
    open:   { label: 'Open awareness',         color: '#8fb3c7' },
    heart:  { label: 'Heart and compassion',   color: '#d9978c' },
    breath: { label: 'Working the breath',     color: '#9ec79a' },
    word:   { label: 'Sacred words',           color: '#b79bc4' }
  },

  /* display order = roughly easiest-to-start first */
  order: ['mindfulness', 'mantra', 'bodyscan', 'breath', 'metta',
          'vipassana', 'zazen', 'tonglen', 'centering', 'jesus', 'dhikr'],

  techniques: {

    mindfulness: {
      name: 'Mindfulness and MBSR',
      fam: 'open',
      also: 'mindfulness-based stress reduction',
      object: 'the breath, then whatever arises',
      one: 'You rest your attention on the breath, and every time it wanders off you notice that and bring it back, on purpose and without scolding yourself.',
      origin: 'The molecular biologist <b>Jon Kabat-Zinn</b> built the 8-week MBSR course in a hospital basement at the University of Massachusetts in 1979. It is Buddhist insight meditation with the religion taken out, so it could be prescribed to patients in pain. His definition: "paying attention in a particular way: on purpose, in the present moment, and nonjudgmentally."',
      claims: 'Not enlightenment, just a better relationship with your own experience: less reactivity to stress, pain, and anxiety. You cannot stop the waves, the line goes, but you can learn to surf.',
      ev: 'The most-studied kind by far. The best meta-analysis found small but real benefits for anxiety, depression, and pain, about the size of an antidepressant. Its clinical offshoot, MBCT, cuts relapse for recurring depression by about a third versus usual care.',
      grade: 'b',
      how: [
        'Sit in a chair or on a cushion, upright but not stiff, "awake, dignified, and relaxed." Feet flat, hands on your thighs.',
        'Close your eyes, or let them rest half-open with a soft gaze on the floor a few feet ahead.',
        'Find the breath where you feel it most plainly: the nostrils, the chest, or the belly. Rest your attention there. <b>Do not control the breath</b>, just feel the one already happening.',
        'Your mind will wander into thoughts, plans, sounds. The instant you notice, name it lightly ("thinking") and walk your attention back to the breath, with no self-criticism.',
        'That return is the entire exercise. You may do it a hundred times in one sitting. Each one counts, like a rep.'
      ],
      time: 'Start at 10 minutes a day. MBSR builds toward 45. Daily beats long.',
      miss: 'Trying to empty the mind (the goal is noticing you left and coming back), and beating yourself up on every distraction (the instruction is a kind, matter-of-fact return).',
      note: 'Free, secular, and the easiest place for most people to start. The 8-week course is taught in hospitals and online worldwide.'
    },

    mantra: {
      name: 'Mantra and TM',
      fam: 'focus',
      also: 'Transcendental Meditation',
      object: 'a repeated meaningless sound',
      one: 'You sit with your eyes closed and silently repeat a short, meaningless sound, lightly enough that the repetition can fade on its own and the mind settles inward.',
      origin: '<b>Maharishi Mahesh Yogi</b> systematized an old Vedic mantra practice into Transcendental Meditation and began teaching it in the 1950s. The Beatles’ 1968 trip to his ashram in Rishikesh made it a household word.',
      claims: 'That the mind settles past thought into "pure consciousness," a state of deep rest while fully awake, which the movement calls restful alertness. It is sold as effortless: no concentration required.',
      ev: 'Real but modest. Independent reviews find a few-mmHg drop in blood pressure, no better than other relaxation methods, and the American Heart Association gives it only a cautious nod. Its grand claims, yogic "flying" (cross-legged hopping) and lowering a city’s crime rate by group meditation, are pseudoscience.',
      grade: 'c',
      how: [
        'Sit comfortably, back supported, eyes closed. Sit quietly for a few seconds first.',
        'Begin to repeat a mantra silently in your mind. TM assigns a Sanskrit sound; a neutral word like "one" works the same way (Herbert Benson showed this at Harvard).',
        '<b>Effortlessness is the whole game.</b> Do not concentrate on it or hold a rhythm. Let it be faint, vague, even let it change or slip away. That fading is the mind settling.',
        'When you notice you have drifted into ordinary thoughts, gently come back to the mantra. No annoyance.',
        'At the end, drop the mantra and sit with closed eyes for two or three minutes before you get up.'
      ],
      time: 'About 20 minutes, twice a day, classically morning and late afternoon.',
      miss: 'Concentrating or gripping the mantra (it is meant to be loose), and treating a busy mind as failure (noticing and returning is the practice, not an interruption).',
      note: 'Real TM is trademarked and taught only through a paid course, about $980 in the US, with a "personal" mantra. The mechanics above are free to copy.'
    },

    bodyscan: {
      name: 'The body scan',
      fam: 'focus',
      also: 'sweeping the body',
      object: 'sensation, region by region',
      one: 'Lying down, you move your attention slowly through the body, part by part, noticing whatever sensation (or none) is there, without trying to change it.',
      origin: 'A centerpiece of Kabat-Zinn’s MBSR, and usually the first practice taught. It descends from the body-"sweeping" of the Burmese vipassana lineage (U Ba Khin, Goenka) and from yoga nidra, the lying-down "yogic sleep."',
      claims: 'To build interoception (the felt sense of your body from inside), to surface and release tension you did not know you held, and to anchor attention in plain sensation rather than thought.',
      ev: 'Studied as part of MBSR for stress, pain, and sleep; hard to isolate from the rest of the course. The honest read: a reliable way into the body and a calming practice, with the same modest evidence base as mindfulness generally.',
      grade: 'c',
      how: [
        'Lie on your back, legs uncrossed and a little apart, arms slightly away from your sides, palms up, eyes closed.',
        'Take a few natural breaths and feel the whole body resting, heavy, supported by the floor.',
        'Bring attention to the toes of your <b>left</b> foot. Notice what is there: warmth, tingling, pressure, or nothing at all. "Nothing" is a real, fine answer.',
        'On the in-breath, imagine the breath reaching that part; on the out-breath, let it soften and release. Then move on.',
        'Travel slowly: left foot and leg, right foot and leg, hips, belly, chest, back, arms, hands, shoulders, neck, face, the crown. End by feeling the whole body at once.'
      ],
      time: 'Classic MBSR runs 45 minutes; 20 is plenty to start.',
      miss: 'Falling asleep (do it sitting, or earlier in the day, not in bed), and trying to force relaxation (you notice tension, you do not make it leave; forcing it just adds more).',
      note: 'Free and well suited to guided audio while you learn the route.'
    },

    breath: {
      name: 'Breathwork and pranayama',
      fam: 'breath',
      also: 'slow breathing, the physiological sigh',
      object: 'the breath itself, deliberately paced',
      one: 'Instead of just watching the breath, you deliberately shape it, slowing it down and lengthening the exhale, to push your own nervous system toward calm.',
      origin: 'Two streams. Ancient yogic <b>pranayama</b> (Patanjali’s Yoga Sutras, the fourth of the eight limbs) regulates the breath to steady the mind. And a modern toolkit, from heart-rate-variability research and a 2023 Stanford study, that does the same with plain physiology.',
      claims: 'A fast, on-demand "off-ramp" from fight-or-flight. The mechanism is real and simple: a long exhale engages the vagus nerve and the parasympathetic ("rest and digest") brake, slowing the heart.',
      ev: 'The strongest mechanism in this whole guide. A 2023 Stanford trial found 5 minutes a day of slow "cyclic sighing" beat both box breathing and mindfulness for improving mood; slow breathing reliably raises heart-rate variability.',
      grade: 'b',
      how: [
        'For the fastest reset, the <b>physiological sigh</b>: a normal inhale through the nose, then a second short sip of air to top off the lungs, then a long, slow exhale through the mouth. Repeat for a minute or five.',
        'For steady calm, <b>slow breathing</b>: in for about 5 seconds, out for about 5 or 6, no holds, around 6 breaths a minute, for 5 minutes.',
        'For focus under pressure, <b>box breathing</b>: in 4, hold 4, out 4, hold 4.',
        'For a yogic version, <b>alternate-nostril</b>: thumb closes the right nostril, breathe in left; switch, breathe out right; in right, switch, out left. Keep it gentle.',
        'In all of them, keep the exhale at least as long as the inhale. That is the lever.'
      ],
      time: 'As little as 1 to 5 minutes. It works almost immediately.',
      miss: 'Forcing or straining (gentle is the point), and confusing this with the intense methods below.',
      note: 'Hard safety rule: forceful breathing and breath-holds (Wim Hof, kapalabhati, holotropic) can make you faint. Never do them in or near water or while driving, and skip them with heart, lung, or seizure conditions or in pregnancy.'
    },

    metta: {
      name: 'Loving-kindness',
      fam: 'heart',
      also: 'metta, the brahmaviharas',
      object: 'phrases of goodwill',
      one: 'You silently repeat a few good wishes, first for yourself and then in widening circles to others, deliberately growing goodwill the way you would train any other habit.',
      origin: 'The Buddhist <b>Metta Sutta</b> and the four brahmaviharas ("divine abodes"). Its modern phrase-by-phrase form was brought west by <b>Sharon Salzberg</b> and the Insight Meditation Society in the 1990s.',
      claims: 'To soften self-judgment, dissolve ill-will, and build a durable baseline of warmth and connection. It is offered as the direct antidote to fear and resentment.',
      ev: 'Trials link it to more positive emotion, more social connection, and less self-criticism. Effects are modest and the studies are mostly small, but the direction is consistent.',
      grade: 'c',
      how: [
        'Sit comfortably, eyes closed. Bring yourself to mind first.',
        'Silently repeat a small set of wishes, slowly: <b>"May I be safe. May I be happy. May I be healthy. May I live with ease."</b>',
        'Move to someone easy to love (a friend, a mentor, even a pet): "May you be safe, happy, healthy, at ease."',
        'Then a neutral person (a cashier, a stranger on the bus). Then, gently, a difficult person. Then all beings everywhere.',
        'You are planting an intention, not squeezing out a feeling. Whatever shows up, warmth or boredom or nothing, let it be and keep saying the words.'
      ],
      time: 'About 20 minutes for the full circle; 10 is fine, and on a hard day just do yourself.',
      miss: 'Forcing the feeling (you repeat the wish, you do not manufacture love on command), and skipping yourself (the tradition starts there on purpose).',
      note: 'Free. A good complement to a focus practice rather than a full replacement.'
    },

    vipassana: {
      name: 'Vipassana',
      fam: 'open',
      also: 'insight meditation, Goenka',
      object: 'the breath, then body sensations',
      one: 'You sharpen attention on the breath, then sweep it through the body and watch every sensation arise and pass while refusing to react to any of it.',
      origin: 'Rooted in the Buddha’s <b>Satipatthana Sutta</b>, the four foundations of mindfulness. Today it mostly reaches people through <b>S.N. Goenka’s</b> free 10-day silent course, in the Burmese lineage of U Ba Khin.',
      claims: 'That by observing sensation with total equanimity you feel, directly, that everything is impermanent (anicca), and you dissolve the deep habits of craving and aversion at their root.',
      ev: 'The 10-day course produces big reported gains, with mixed-quality research behind them. It is also the kind of intense, deconstructive practice where most of the documented lasting adverse effects show up, so go in informed.',
      grade: 'c',
      how: [
        'First, <b>anapana</b>: sit upright, eyes closed, and watch the natural breath where it touches the nostrils. Do not control it. Narrow attention to that small patch of skin.',
        'Once attention is steady, begin the <b>body sweep</b>: move it slowly from the top of the head, part by part, down to the toes, then back up.',
        'In each spot, observe whatever sensation is there: heat, tingling, pressure, pain, or nothing.',
        '<b>The cardinal rule is equanimity.</b> Do not chase the pleasant or fight the unpleasant. Just observe, and know it will pass.',
        'When the mind runs off, bring it back, calmly, and resume the sweep.'
      ],
      time: 'Taught in a 10-day residential retreat; at home, 30 to 60 minutes.',
      miss: 'Reacting to sensations instead of watching them (the reaction is the very habit you are training out), and straining to manufacture a tingle (observe what is actually there).',
      note: 'The 10-day courses are genuinely free, funded by past students’ donations, with total silence for the first nine days.'
    },

    zazen: {
      name: 'Zazen',
      fam: 'open',
      also: 'Zen sitting, shikantaza',
      object: 'nothing, or a counted breath, or a koan',
      one: 'You sit in a precise upright posture and, rather than steering the mind, you "just sit," letting thoughts come and go without chasing or fighting them.',
      origin: 'Chan Buddhism crossing from China into Japanese <b>Zen</b>. <b>Dogen</b> (1200s) centered the Soto school on "just sitting" (shikantaza); the Rinzai school, revived by <b>Hakuin</b>, sits with a koan like "the sound of one hand."',
      claims: 'In Soto, sitting is not a means to a later enlightenment but enlightenment itself, enacted now. In Rinzai, sustained "Great Doubt" on a koan builds to a sudden breakthrough (kensho).',
      ev: 'Long-term Zen practitioners show the expected attention and brain signatures, but rigorous clinical trials on zazen specifically are sparse, partly because Zen frames sitting as awakening, not as a health treatment.',
      grade: 'd',
      how: [
        'Sit on a cushion in lotus, half-lotus, kneeling, or a chair, so your two knees and your seat make a stable tripod. Spine erect, crown lifted, chin slightly in.',
        'Rest the hands in your lap, left palm on right, thumb-tips lightly touching (the "cosmic mudra"). Tongue on the roof of the mouth.',
        '<b>Keep the eyes half-open</b>, lowered to the floor about three feet ahead, unfocused. Rock gently side to side, then settle.',
        'To start, count breaths on the exhale: one, two, up to ten, then back to one. Lose count? Just start at one again.',
        'Later, drop the counting and just sit: let thoughts arise and pass without grabbing them. Alert, upright, going nowhere.'
      ],
      time: 'A sit runs 25 to 40 minutes; beginners start at 10 to 15.',
      miss: 'Slumping or closing the eyes (the posture is the practice; both breed drowsiness), and fighting thoughts or trying to go blank (you let them pass, you do not evict them).',
      note: 'Free. The posture is exacting, so a session at a local Zen center is worth it early on.'
    },

    tonglen: {
      name: 'Tonglen',
      fam: 'heart',
      also: 'sending and taking',
      object: 'suffering, on the breath',
      one: 'You reverse the usual instinct: on the in-breath you breathe in someone’s suffering, and on the out-breath you send them relief.',
      origin: 'A Tibetan Buddhist <b>lojong</b> ("mind training") practice carried to Tibet by the Indian master <b>Atisha</b> in the 11th century, and made widely known in the West by <b>Pema Chodron</b> and Chogyam Trungpa.',
      claims: 'To dismantle self-cherishing, the reflex of putting "me" first and pushing pain away, which Buddhism treats as the root of suffering, and to grow real compassion in its place.',
      ev: 'A small but encouraging literature, mostly on compassion meditation broadly rather than tonglen alone: more self-compassion, more compassion for others, less anxiety.',
      grade: 'd',
      how: [
        'Rest for a moment in stillness, a brief flash of openness before you begin.',
        'Sync with the breath using texture: breathe <b>in</b> hot, heavy, dark, tight; breathe <b>out</b> cool, light, bright, fresh.',
        'Bring to mind a specific person who is suffering (start with someone you love). Breathe <b>in</b> their pain, wishing to take it; breathe <b>out</b> relief and ease to them.',
        'Widen it: everyone, everywhere, caught in that same kind of pain. In with theirs, out with relief.',
        'If you get stuck or overwhelmed, do it for your own pain and everyone who feels the same. Then return to the simple textures.'
      ],
      time: 'A few minutes to a full sitting, plus an on-the-spot version any time pain hits.',
      miss: 'Getting the breath backwards (in takes suffering, out sends relief), and staying abstract (it only bites with a real person and a real pain). Discomfort is expected, not a sign you are doing it wrong.',
      note: 'Free, and unusually direct for grief, caregiving, or anger. Counterintuitive by design.'
    },

    centering: {
      name: 'Centering prayer',
      fam: 'word',
      also: 'Christian contemplative prayer',
      object: 'a single "sacred word"',
      one: 'You sit in silence and, whenever you notice a thought has carried you off, you return ever so gently to one chosen word that stands for your consent to God’s presence.',
      origin: 'Packaged in the 1970s by three Trappist monks (<b>Thomas Keating</b>, William Meninger, Basil Pennington) from the 14th-century English mystical text <b>The Cloud of Unknowing</b> and the older "negative way" of the desert fathers.',
      claims: 'Not an experience or a blank mind, but consent: opening to God’s presence and action within. It is preparation for contemplation, which the tradition holds is given, not manufactured.',
      ev: 'Thin and mixed. The broader research on silent, repetitive prayer points to the same parasympathetic calming as other contemplative practice, but centering prayer specifically is barely studied.',
      grade: 'd',
      how: [
        'Choose one short sacred word that means "yes" to you: God, Jesus, Abba, Peace, Love, Stillness. Keep the same word.',
        'Sit comfortably, eyes closed, and silently introduce the word once.',
        'When you notice you have gotten caught up in a thought (a feeling, an image, even a "spiritual" insight), <b>return ever so gently to the word</b>, then let even the word fade into silence.',
        'The word is a feather-touch reset, not a chant on a beat. You reach for it only when you notice you have drifted.',
        'At the end, stay in silence with eyes closed for a couple of minutes.'
      ],
      time: 'A minimum of 20 minutes, twice a day, is the standard.',
      miss: 'Treating the word as a chanted mantra (it is a single gentle reset), and grading the sit by how few thoughts you had (a distracted sit where you kept consenting is a good sit).',
      note: 'Unlike a mantra, the word is a symbol of intention, not a sound to repeat rhythmically. Free.'
    },

    jesus: {
      name: 'The Jesus Prayer',
      fam: 'word',
      also: 'hesychasm, prayer of the heart',
      object: 'one repeated sentence',
      one: 'You repeat one short sentence, slowly and attentively, over and over, until calling on the name of Jesus becomes as constant and unforced as breathing.',
      origin: 'The Eastern Orthodox tradition of the desert fathers and Mount Athos, gathered in the <b>Philokalia</b> (1782) and carried to lay readers by the Russian classic <b>The Way of a Pilgrim</b>. "Hesychasm" comes from the Greek for stillness.',
      claims: 'Unceasing prayer made real (it keeps running while you work or sleep), the mind descending into the heart, and ultimately communion with God. The words "have mercy on me, a sinner" are central, not optional.',
      ev: 'Almost no study isolates it. Rhythmic, breath-linked repetitive prayer in general shows calming effects, but the tradition measures success theologically (humility, ceaseless prayer), not in heart rate.',
      grade: 'd',
      how: [
        'Sit or stand quietly, head slightly bowed, eyes lowered or closed.',
        'Repeat, slowly and meaning every word: <b>"Lord Jesus Christ, Son of God, have mercy on me, a sinner."</b> Beginners can shorten it to "Lord Jesus Christ, have mercy on me."',
        'Optionally pair it with the breath: in on "Lord Jesus Christ, Son of God," out on "have mercy on me, a sinner."',
        'Many keep count on a knotted prayer rope, one prayer per knot, so the body stays lightly occupied.',
        'Carry it into the day, in line, on the bus, falling asleep, until it begins to run on its own.'
      ],
      time: 'Less a single sit than a daily rule that grows: start with 10 to 15 minutes morning and evening.',
      miss: 'Treating it as a hollow mantra (you are calling on a person in repentance, which the tradition insists on), and chasing experiences of warmth or light (considered a delusion to seek).',
      note: 'The advanced breathing-and-heart techniques are taught only under a spiritual father; the simple form above is the safe core.'
    },

    dhikr: {
      name: 'Sufi dhikr',
      fam: 'word',
      also: 'remembrance of God, zikr',
      object: 'the names of God',
      one: 'You repeat the name of God or a short Quranic phrase, aloud or silently in the heart, often on the breath, until remembrance of God becomes continuous.',
      origin: 'Grounded in the Quran’s command to remember God often ("in the remembrance of God do hearts find rest"), and developed into a discipline by the Sufi orders, each transmitting its forms from master to disciple. The whirling of Rumi’s order is one famous form.',
      claims: 'Presence of the heart and peace, the scrubbing of the heart of all but God, and at its height fana, the passing away of the ego-self in God.',
      ev: 'A young, mostly small literature, largely from Muslim clinical settings, links rhythmic dhikr to less anxiety, lower cortisol, and better heart-rate variability, the same family of effects as other breath-paced repetition.',
      grade: 'd',
      how: [
        'Sit grounded and upright, feet and seat solid, body relaxed. The Quran allows remembrance standing, sitting, or lying down.',
        'Choose one formula: <b>"Allah"</b>, or <b>"La ilaha illa Allah"</b> (there is no god but God), or one of the 99 Names.',
        'Repeat it softly, just loud enough to hear, or silently in the heart. Stay with the meaning, not the count.',
        'A common breath method for "La ilaha illa Allah": draw "La ilaha" in on the in-breath (clearing all else), plant "illa Allah" in the heart on the out-breath.',
        'Count on a string of 99 beads if it helps you stay present; pause each round and check in with your heart.'
      ],
      time: 'A daily set amount (a round of beads, once or twice), carried into ordinary life.',
      miss: 'Mechanical counting with an absent heart (presence is the whole point), and treating "Allah" as a generic sound (in Islam it is an act of devotion, not a content-neutral mantra).',
      note: 'The advanced order-specific litanies, the whirling, and heart-center methods are taught only with a teacher’s permission; the simple core above is open to a respectful beginner.'
    }

  }
};
