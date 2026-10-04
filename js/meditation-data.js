/* Selected practices for meditation.html. Health evidence is outcome-specific;
   traditional aims and beginner exercises are described separately. */
window.MED = {
  fams: {
    focus: { label: 'Stay with an object', color: '#dfc288' },
    open: { label: 'Observe experience', color: '#8fb3c7' },
    heart: { label: 'Practice goodwill', color: '#d9978c' },
    breath: { label: 'Change the breath', color: '#9ec79a' },
    word: { label: 'Pray', color: '#b79bc4' }
  },
  order: ['mindfulness', 'mantra', 'bodyscan', 'breath', 'metta',
          'vipassana', 'zazen', 'tonglen', 'centering', 'jesus', 'dhikr'],
  techniques: {
    mindfulness: {
      name: 'Mindfulness and MBSR',
      fam: 'open',
      also: 'mindfulness-based stress reduction',
      object: 'breath, sensations, and thoughts',
      one: 'Attend to present experience, noticing distraction and your reactions to what you notice.',
      origin: 'Jon Kabat-Zinn developed <a href="https://www.ummhealth.org/services-treatments/center-mindfulness/mindfulness-programs/mbsr">MBSR at UMass in 1979</a>, drawing on Buddhist practice and yoga. The eight-week secular course includes sitting, body scans, movement, and group teaching.',
      claims: 'Recognize habitual reactions to stress or pain and respond with more awareness. Breath attention is one exercise within the course.',
      ev: 'For anxiety disorders, a full MBSR course produced results within a prespecified margin of escitalopram in <a href="https://jamanetwork.com/journals/jamapsychiatry/fullarticle/2798510">a randomized trial</a>. That supports the course for those patients; it does not establish equivalent results from a brief app exercise.',
      evidenceFor: 'MBSR for anxiety disorders',
      grade: 'b',
      how: [
        'Sit comfortably, with eyes open or closed.',
        'Feel the natural breath at the nose, chest, or belly, without changing its pace.',
        'When attention moves elsewhere, return. A quiet label such as "thinking" may help.',
        'If attending to breathing is uncomfortable, use sounds or contact with the chair. Stop if distress persists.'
      ],
      time: 'Try a few minutes first',
      miss: 'Judging the session by how few thoughts occurred.',
      note: 'The <a href="https://www.ummhealth.org/services-treatments/center-mindfulness/mindfulness-programs/mbsr">full MBSR course</a> asks for roughly 45 to 60 minutes of daily home practice, with weekly classes.'
    },
    mantra: {
      name: 'Mantra and TM',
      fam: 'focus',
      also: 'Transcendental Meditation',
      object: 'a repeated sound, word, or phrase',
      one: 'Repeat a word or sound silently. TM teachers assign a mantra and teach its use.',
      origin: 'Maharishi Mahesh Yogi developed TM in the 1950s from earlier Indian meditation practices. <a href="https://my.clevelandclinic.org/health/treatments/22292-transcendental-meditation">Technique and background</a>. Mantra practice also exists outside this branded course.',
      claims: 'TM describes deep rest while awake, beyond ordinary thinking. Other mantra traditions give their words religious meaning.',
      ev: 'A <a href="https://pubmed.ncbi.nlm.nih.gov/35412731/">2022 review</a> found modest average blood-pressure reductions from TM, with effects waning after three months. The <a href="https://www.ahajournals.org/doi/10.1161/CIR.0000000000001356">2025 AHA/ACC guideline</a> allows TM as a possible addition to lifestyle changes or medication. Neither source establishes that any repeated word has the same result.',
      evidenceFor: 'TM and blood pressure',
      grade: 'c',
      how: [
        'For a generic exercise, sit comfortably and choose a neutral word such as "one." This is not TM instruction.',
        'Repeat it silently at an easy pace, without changing your breathing.',
        'When distracted, return to the word without trying to exclude every thought.',
        'Sit quietly for a moment before getting up.'
      ],
      time: 'Try five minutes of the generic exercise',
      miss: 'Assuming similar-looking exercises have been proved interchangeable.',
      note: 'The <a href="https://www.tm.org/en-us/course-fee">US TM course fee</a> is $980, with income-based rates and possible scholarships. It includes follow-up support; price does not establish efficacy.'
    },
    bodyscan: {
      name: 'The body scan',
      fam: 'focus',
      also: 'attention through the body',
      object: 'sensation, region by region',
      one: 'Move attention through the body, noticing pressure, warmth, tingling, or an area with no clear sensation.',
      origin: 'A core exercise in MBSR. The <a href="https://ggia.berkeley.edu/practice/body_scan_meditation">Berkeley guide</a> offers seated instructions and audio from university mindfulness teachers.',
      claims: 'Recognize bodily sensations and tension without immediately trying to change them. Relaxation is optional.',
      ev: 'In <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11420060/">a 2024 randomized trial</a>, 449 people received a 15-minute body scan and reported less immediate stress than audiobook listeners. The sample was mostly students without mental illness. This does not establish lasting benefit or treatment of an anxiety disorder.',
      evidenceFor: 'Body scans and immediate self-rated stress',
      grade: 'b',
      how: [
        'Sit or lie supported. Notice contact with the chair, bed, or floor.',
        'Attend to your feet, then move through the legs, torso, hands, arms, neck, and face.',
        'Pause at each region. You do not need to find a particular sensation.',
        'Return when distracted. Skip uncomfortable areas, or open your eyes and look around.'
      ],
      time: 'Try five minutes',
      miss: 'Treating the scan as a test of whether you can relax every muscle.',
      note: 'Try guided audio to follow the route, or sit if lying down makes you sleepy.'
    },
    breath: {
      name: 'Breathwork and pranayama',
      fam: 'breath',
      also: 'paced breathing and yogic breathing',
      object: 'the pace and pattern of breathing',
      one: 'Change your breathing deliberately. Slow pacing, holds, and rapid breathing have different risks.',
      origin: 'Yoga includes breathing techniques called <a href="https://www.nccih.nih.gov/health/yoga-effectiveness-and-safety">pranayama</a>. Modern breathing studies test selected patterns; their results cannot be applied to all yogic breathing.',
      claims: 'Some methods aim at relaxation or focus; religious yoga gives the breath a wider role.',
      ev: 'A <a href="https://www.nature.com/articles/s41598-023-49279-8">blinded trial of 400 people</a> found no extra mental-health benefit from slow pacing over matched guidance at a normal pace. A smaller <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947/">cyclic-sighing trial</a> found a mood advantage over brief mindfulness. These results leave the best pattern unsettled.',
      evidenceFor: 'Brief breathing exercises and mood',
      grade: 'c',
      how: [
        'Sit somewhere safe. Breathe normally, without trying to fill your lungs maximally.',
        'For slow pacing, try a comfortable inhale and exhale of roughly equal length. Avoid forcing the pacer\'s timing.',
        'For a double inhale, inhale through the nose, add a small second inhale, then exhale slowly. Avoid straining.',
        'Return to normal breathing if you feel dizzy, air-hungry, or more anxious.'
      ],
      time: 'Try a minute, then check how you feel',
      miss: 'Expecting a longer exhale to guarantee calm.',
      note: 'The pacer omits rapid breathing. <a href="https://www.wimhofmethod.com/faq">Forceful breathing and long holds can cause fainting</a>; <a href="https://www.wimhofmethod.com/practice-the-method">never practice them in water or while driving</a>.'
    },
    metta: {
      name: 'Loving-kindness',
      fam: 'heart',
      also: 'metta',
      object: 'wishes for yourself and others',
      one: 'Silently wish people well, including yourself. The phrases express an intention even when no warm feeling accompanies them.',
      origin: 'A Buddhist practice. The <a href="https://www.accesstoinsight.org/tipitaka/kn/snp/snp.1.08.amar.html">Metta Sutta</a> extends goodwill to all living beings. The exercise here follows <a href="https://www.mindful.org/loving-kindness-meditation-with-sharon-salzberg/">Sharon Salzberg</a>, one contemporary teacher.',
      claims: 'Cultivate goodwill and reduce hostility. Wishing someone well does not require approving their behavior or remaining in contact.',
      ev: 'A <a href="https://pubmed.ncbi.nlm.nih.gov/18954193/">randomized study of 139 working adults</a> found increases in reported positive emotions after training. The comparison was a waitlist, so it could not separate the exercise from expectations, attention, or meeting a group.',
      evidenceFor: 'Loving-kindness and positive emotion',
      grade: 'c',
      how: [
        'Choose yourself or someone whose welfare you can easily wish for.',
        'Repeat quietly: "May I be safe. May I be happy. May I be healthy. May I live with ease." Adapt the phrases if needed.',
        'Offer the wishes to another person, then to people you know less well.',
        'Extend them further if you want. You can leave out a difficult person.'
      ],
      time: 'Try a few minutes',
      miss: 'Demanding a feeling of love, or making the exercise an obligation to forgive harm.',
      note: 'You can start with someone else if wishes toward yourself feel uncomfortable.'
    },
    vipassana: {
      name: 'Vipassana',
      fam: 'open',
      also: 'insight meditation; Goenka-style scanning',
      object: 'changing sensations and reactions',
      one: 'Observe experience to understand impermanence and the habits of craving and resistance. Body scanning is one approach.',
      origin: 'Buddhist insight practice includes several lineages. The <a href="https://www.accesstoinsight.org/tipitaka/mn/mn.010.nysa.html">Satipatthana Sutta</a> attends to body, feelings, mind, and mental phenomena. Goenka courses teach one form.',
      claims: 'Directly understand how experience changes and weaken craving and aversion. Those are Buddhist aims; a symptom score cannot establish liberation.',
      ev: 'A <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0216643">survey of regular meditators</a> associated retreats and exclusively deconstructive practices, which examine how experience is constructed, with unpleasant experiences. This was an association, without proof of causation or a comparison of retreat methods.',
      evidenceFor: 'Retreats and unpleasant experiences',
      grade: 'c',
      how: [
        'Notice the natural breath without changing it.',
        'Attend to sensations in a small body region, then move to another.',
        'Notice a sensation changing, and notice any wish to keep it or make it stop.',
        'Return when distracted. Change position or stop when needed; equanimity does not require ignoring an injury.'
      ],
      time: 'Try a short exercise before considering a retreat',
      miss: 'Expecting every vipassana school to use the same technique.',
      note: 'Goenka courses run for <a href="https://www.dhamma.org/en/about/code">ten days, with many hours of daily meditation</a>, funded by donations rather than fees. Read the discipline and screening information before applying.'
    },
    zazen: {
      name: 'Zazen',
      fam: 'open',
      also: 'Zen sitting; Soto-style shikantaza',
      object: 'sitting awareness; methods vary',
      one: 'Sit upright and allow thoughts to come and go without pursuing them. This is Soto-style shikantaza, or just sitting.',
      origin: 'Japanese Zen developed from Chinese Chan. <a href="https://www.sotozen.com/eng/about/history/index.html">Soto follows Dogen</a>; <a href="https://zen.rinnou.net/zazen/sitting.html">Rinzai instructions</a> include breath counting. This entry describes one form of Zen sitting.',
      claims: 'Soto treats sitting as <a href="https://www.sotozen.com/eng/library/key_terms/pdf/key_terms01.pdf">the enactment of awakening</a>, within a religious and ethical practice.',
      ev: 'The clinical studies above do not test Soto shikantaza specifically. They cannot establish the same anxiety benefits as MBSR.',
      evidenceFor: 'Shikantaza for anxiety',
      grade: 'd',
      how: [
        'Use a cushion, kneeling bench, or chair for a stable, comfortable posture.',
        'Sit upright with relaxed shoulders. Rest one palm on the other, with thumb tips lightly touching.',
        'Keep your eyes slightly open and lowered. Let breathing proceed naturally.',
        'Allow thoughts to arise and pass. When caught in one or becoming dull, return to awareness of sitting.'
      ],
      time: 'Try a short sitting',
      miss: 'Forcing lotus posture, or treating just sitting as an instruction to doze.',
      note: 'These abbreviated <a href="https://www.sotozen.com/eng/zazen/howto/index.html">Soto instructions</a> omit temple forms. A teacher can help with posture and the wider practice.'
    },
    tonglen: {
      name: 'Tonglen',
      fam: 'heart',
      also: 'taking and sending',
      object: 'images of suffering and relief',
      one: 'Imagine taking in suffering on an inhalation and offering relief on an exhalation. The breath carries an image, not someone else\'s illness.',
      origin: 'A Tibetan Buddhist compassion practice within lojong, or mind training. This outline follows <a href="https://www.lionsroar.com/how-to-practice-tonglen-meditation/">Pema Chodron\'s teaching</a>.',
      claims: 'Cultivate compassion by imagining turning toward suffering rather than protecting only yourself.',
      ev: 'A <a href="https://link.springer.com/article/10.1007/s12671-025-02601-z">2025 randomized study of 60 healthcare workers</a> found an immediate increase in reported compassion after a guided exercise combining tonglen with focused attention. The comparison was a neutral audio story. One session cannot establish lasting benefit for grief or caregiving strain.',
      evidenceFor: 'Tonglen and immediate compassion',
      grade: 'd',
      how: [
        'Settle briefly with ordinary breathing.',
        'Bring to mind someone facing a difficulty you can attend to without becoming overwhelmed.',
        'With the in-breath, imagine taking in their difficulty as darkness or heaviness. With the out-breath, imagine offering relief.',
        'If comfortable, extend that wish to others facing the same difficulty. Stop if overwhelmed and look around the room.'
      ],
      time: 'Try a brief, gentle version',
      miss: 'Interpreting distress as proof that you should push further, or expecting the image to heal another person.',
      note: 'A teacher can guide this practice. A simple wish of goodwill is another option.'
    },
    centering: {
      name: 'Centering prayer',
      fam: 'word',
      also: 'Christian contemplative prayer',
      object: 'silence and a word of consent',
      one: 'Sit in silence. When absorbed in thought, use a chosen word to renew your consent to God\'s presence.',
      origin: 'A modern Christian method drawing on older contemplative teaching, including The Cloud of Unknowing. Its guidelines come from <a href="https://www.contemplativeoutreach.org.uk/centering-prayer-2/">Contemplative Outreach</a>.',
      claims: 'Open to God\'s presence and action. The word expresses consent, without promising a spiritual experience.',
      ev: 'A <a href="https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.720824/full">2021 student trial</a> found less reported stress after a centering exercise adapted for people of any or no faith. It used a waitlist comparison and excluded some participants from analysis. This is preliminary evidence, not proof about contemplative prayer generally.',
      evidenceFor: 'Adapted centering and reported stress',
      grade: 'd',
      how: [
        'Choose a short sacred word, such as God or Jesus, to express your intention.',
        'Sit comfortably, settle, and introduce the word silently.',
        'When engaged with thoughts, gently return to the word. Allow it to recede into silence rather than repeating it continuously.',
        'Remain quietly for a little while before getting up.'
      ],
      time: 'The tradition recommends twenty minutes twice daily',
      miss: 'Counting repetitions or making an empty mind the measure of the prayer.',
      note: 'That is a <a href="https://www.contemplativeoutreach.org/2023/04/19/why-is-20-minutes-recommended-for-centering-prayer/">teaching recommendation</a>, not a medical dose. Shorter periods are possible.'
    },
    jesus: {
      name: 'The Jesus Prayer',
      fam: 'word',
      also: 'Eastern Orthodox prayer',
      object: 'an invocation of Jesus',
      one: 'Repeat a prayer for mercy, attending to its meaning. It can accompany ordinary work or a quiet prayer period.',
      origin: 'An Eastern Orthodox practice described in the Philokalia and The Way of a Pilgrim. <a href="https://www.oca.org/orthodoxy/the-orthodox-faith/spirituality/prayer-fasting-and-almsgiving/the-jesus-prayer">The Orthodox Church in America</a> distinguishes ordinary repetition from guided hesychasm, the discipline of inner stillness.',
      claims: 'Continual remembrance of God, repentance, and communion with God.',
      ev: 'A <a href="https://doi.org/10.1037/scp0000154">small randomized trial</a> found lower reported stress from an online Jesus Prayer program than from a waitlist. It studied Christians who chose this program and did not compare it with an active treatment.',
      evidenceFor: 'A Jesus Prayer program and stress',
      grade: 'd',
      how: [
        'Sit, stand, or continue a simple daily task. Let your breathing remain natural.',
        'Say slowly: "Lord Jesus Christ, Son of God, have mercy on me, a sinner." Shorter forms are also used.',
        'Attend to the request for mercy. When distracted, return to the prayer.',
        'A prayer rope can help you keep your place. Seek guidance for a prayer rule suited to you.'
      ],
      time: 'Begin with a short prayer period',
      miss: 'Chasing bodily sensations or treating the words as a content-free relaxation formula.',
      note: 'The OCA advises a spiritual guide for advanced hesychast breathing and posture. This outline uses ordinary breathing.'
    },
    dhikr: {
      name: 'Dhikr',
      fam: 'word',
      also: 'remembrance of God; Sufi forms',
      object: 'God\'s names and words of remembrance',
      one: 'Remember God through repeated names or phrases, spoken or silent. Sufi orders teach particular forms within this wider Islamic practice.',
      origin: 'The Quran calls believers to remember God. This outline follows <a href="https://suficommunities.org/sufi-library/spiritual-practices/remembrance-dhikr/">a Shadhiliyya community</a>, rather than representing all Sufi orders.',
      claims: 'Turn attention and devotion toward God and purify the heart.',
      ev: 'A <a href="https://pubmed.ncbi.nlm.nih.gov/40632388/">2025 trial of 54 dialysis patients</a> reported improvements in anxiety and sleep from combined dhikr and salawat, blessings on the Prophet. That combined intervention in one hospital cannot establish general effects of every dhikr practice.',
      evidenceFor: 'Dhikr with salawat during dialysis',
      grade: 'd',
      how: [
        'Sit comfortably and turn your intention toward remembrance of God.',
        'Repeat Allah, or la ilaha illa Allah, there is no god but God, softly enough to hear.',
        'Attend to the meaning and sound. Keep your breathing comfortable and unforced.',
        'Use beads if helpful. Ask a teacher about the formula and count customary in that community.'
      ],
      time: 'Ask a teacher about a suitable period',
      miss: 'Assuming all orders use the same breath pattern, movement, or number of repetitions.',
      note: 'A generic repeated sound does not preserve this devotional purpose. Specialized litanies and movements need their own teaching.'
    }
  }
};
