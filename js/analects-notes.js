/* ============================================================
   The Analects of Confucius, side by side: the commentary.
   Per-chapter, plain-language breakdown of what the passage says
   and where the translators split. Written in the site voice.
   No em dashes. Light inline HTML (<em>, <b>) is allowed; it is
   injected as innerHTML by js/analects.js.

   key:    "Book.Chapter"  ->  { title, gist, splits:[{zh, gloss, note}], read }
   Chapters without an entry render the translations alone, so the
   breakdowns are written only for the keystones, the chapters the
   rest of the book leans on.
   ============================================================ */
window.ANA_NOTES = {

  "1.1": {
    title: "It opens on a classroom, not a heaven",
    gist: "Most holy books open with a creation, a god, a cosmos. This one opens with a man saying it is nice to learn things and nicer to have friends visit. That is the whole tone of the Analects in three lines: no metaphysics, just the texture of a well-lived ordinary life. The third line slips in the word the book will spend itself on, <em>junzi</em>, the kind of person who keeps his footing even when nobody is watching or rewarding him.",
    splits: [
      { zh: "君子", gloss: "junzi: gentleman / superior man / exemplary person", note: "The most-translated word in the book, and you can date a translation by what it does here. <em>Junzi</em> literally means <em>a ruler's son</em>, an aristocrat by birth. Confucius hijacks it: from now on it means noble by character, not by blood. Legge says <em>a man of complete virtue</em>, Waley and Slingerland keep the class flavor with <em>gentleman</em>, Lau too. Ames and Rosemont go modern and gender-neutral with <em>exemplary person</em>; Watson and many now say <em>gentleman</em> with a wince. The whole democratic move of Confucianism is hidden in that one word: the title you were born with is replaced by one you earn." }
    ],
    read: "The test of the junzi is right there in line three: he is not bothered when people fail to notice him. A book that starts by telling you it is fine to be unknown is quietly telling you what it thinks success is."
  },

  "1.2": {
    title: "Goodness starts at the dinner table",
    gist: "Here is the engine of the whole system, said by a disciple, not the Master. Learn to treat your parents and older siblings well, and you build the habit that makes you a decent citizen and, eventually, a decent country. Confucianism does not start with love of humanity in the abstract. It starts with whether you are good to the people you actually live with, and works outward from there. The word for that home-grown virtue is <em>filial piety</em>, and it is called the <em>root</em>.",
    splits: [
      { zh: "孝", gloss: "xiao: filial piety / being good as a son", note: "<em>Xiao</em> is the love and duty owed upward in a family, to parents and ancestors. Legge's Victorian <em>filial</em> sounds stiff now; Lau plainly says <em>good as a son</em>; Waley keeps it warm, <em>behave well towards their parents</em>. No English word quite carries it, because for Confucius it is not a feeling but a practice, the daily grain of how you treat the old." },
      { zh: "本", gloss: "ben: root / trunk", note: "The key image. Filial conduct is the <em>ben</em>, the root or trunk, of <em>ren</em> (goodness). Get the root right and the rest grows; neglect it and nothing above it holds. The famous ladder you may have heard, cultivate yourself, then your family, then the state, then the world, is not actually in the Analects. It is spelled out a couple of centuries later in the <em>Great Learning</em>. But the seed of it is right here: virtue is a thing that ripples outward, and it starts at home." }
    ],
    read: "A modern reader bridles at this, and should. Tying goodness to obedience inside the family is exactly how families and states excuse abuse. Confucius half-saw the problem: elsewhere he says a son must remonstrate with a wrong father, gently and without resentment, but remonstrate. The root is the family. It was never meant to be a gag order."
  },

  "2.1": {
    title: "Lead like the pole star",
    gist: "Asked how to govern, Confucius gives an image instead of a policy. The ruler who has <em>de</em>, moral force, is like the North Star: it does not chase anything or bark orders, it just holds its place, and the whole sky turns around it. Good government, for him, is not mainly about laws or power. It is about a person so visibly good that people orient to him on their own.",
    splits: [
      { zh: "德", gloss: "de: virtue / moral force / charisma", note: "<em>De</em> is one of the hardest words here. It is not virtue as private goodness; it is virtue as a kind of gravity, the pull a genuinely good person exerts on everyone around them. Legge and Lau say <em>virtue</em>; Waley reaches for <em>moral force</em> and adds the Chinese, <em>(te)</em>, because no English word holds both the goodness and the magnetism; Eno keeps the plain <em>virtue</em> but warns it is an imperfect fit. Same word as the <em>Te</em> in the <em>Tao Te Ching</em>, and the same problem: it means power and goodness at once, which English insists on splitting." }
    ],
    read: "It is a sincerely held theory and a convenient one. A king who believes his job is to be radiant rather than just is a king who can skip the hard parts of governing. The Analects mostly resists that, because it never lets virtue be a feeling; it is always a track record of how you actually behaved."
  },

  "2.3": {
    title: "Law makes people sneaky; ritual makes them ashamed",
    gist: "The single clearest statement of why Confucius distrusts running a society on rules and punishments. Govern by law and penalty, he says, and people will stay out of jail but feel nothing about it; they will just get better at not getting caught. Govern by example and <em>ritual</em>, and they develop a sense of shame, and correct themselves from the inside. It is the ancient argument between a society of enforcement and a society of character.",
    splits: [
      { zh: "禮", gloss: "li: ritual / rites / propriety / ceremony", note: "<em>Li</em> is the other giant untranslatable, alongside <em>ren</em>. It started as religious rites, the sacrifices to ancestors and Heaven, and the character still carries an altar in it. Confucius stretches it to mean the entire web of proper behavior: manners, ceremony, etiquette, the right way to mourn, greet, give, defer. Legge says <em>the rules of propriety</em>; Lau and Waley say <em>the rites</em>; Slingerland says <em>ritual</em>; Eno keeps the bare Chinese, <em>li</em>, because every English choice is too small. It is not empty formality. It is the choreography that lets people live together without grinding." },
      { zh: "恥", gloss: "chi: shame / a sense of shame", note: "The hinge of the passage. Law produces people with no <em>chi</em>; ritual produces people who have it. Shame here is not humiliation, it is conscience, the inner wince that does the policing law cannot. Confucius is betting that a person who feels shame needs no guard." }
    ],
    read: "Every legal system since has had to argue with this. He is not wrong that pure enforcement breeds evasion. He just never quite reckons with what happens when the radiant ruler is a fraud, and the only thing left to protect you is the law he taught you to look down on."
  },

  "2.4": {
    title: "A whole life in one breath",
    gist: "The closest thing to an autobiography Confucius left, and it is six clauses long. At fifteen he committed to learning; at thirty he could stand on his own; by seventy he could do whatever he wanted and never cross a line, because by then wanting and right had finally become the same thing. It is the Confucian project in miniature: virtue is not a switch you flip, it is a slow lifetime of shaping yourself until the good and the easy stop fighting.",
    splits: [
      { zh: "天命", gloss: "tian ming: the decree / mandate of Heaven", note: "At fifty, he says, he knew <em>tian ming</em>. Legge: <em>the decrees of Heaven</em>. Lau: <em>the Decree of Heaven</em>. Eno leaves <em>Tian</em> untranslated on purpose, because <em>Heaven</em> drags in a Christian picture that is not there. <em>Tian</em> is not a god on a throne; it is closer to the way things are meant to go, the order of the world. To know its decree at fifty is to make peace with the shape and limits of your own life." },
      { zh: "從心所欲不踰矩", gloss: "follow the heart's desire without overstepping", note: "The last and most quoted clause. Waley: <em>follow the dictates of my own heart; for what I desired no longer overstepped the boundaries of right</em>. Lau: <em>follow my heart's desire without overstepping the line</em>. This is the goal of the whole book in seven words. Not a person who grits their teeth and resists temptation, but a person so worked-on that there is no temptation left to resist. Freedom, for Confucius, is what is left after a lifetime of discipline, not the thing you have before it." }
    ],
    read: "Notice that mastery arrives at seventy, not at enlightenment, not in a flash. There is no shortcut in this book, no sudden awakening. Just fifty-five years of practice, and a quiet line at the end admitting it took that long."
  },

  "2.15": {
    title: "Learning and thinking need each other",
    gist: "Six characters, and one of the most quoted lines in the book, because it is plainly true and most people only do half of it. Pile up facts without thinking them through and you are lost, a head full of unconnected stuff. Think hard without learning anything first and you are in danger, spinning clever theories out of nothing. The fix for each is the other.",
    splits: [
      { zh: "學而不思則罔", gloss: "learn without thinking and you are lost", note: "The translators barely diverge here, which is the tell that the Chinese is plain and the thought is clean. Legge: <em>learning without thought is labour lost</em>. Slingerland: <em>if you learn without thinking, you will be lost</em>. Lau: <em>if one learns but does not think, one will be bewildered</em>. <em>Wang</em>, the lost word, suggests being adrift, netted, with no bearings." }
    ],
    read: "When a line survives twenty-five centuries and a hundred translations almost unchanged, it is usually because it never needed defending. This one just keeps being right."
  },

  "4.8": {
    title: "Hear the Way in the morning, die content",
    gist: "The most intense thing Confucius ever says about how much truth matters. If he could grasp the <em>Way</em>, the right order of things, even for a single morning, he could die that same evening with no complaint. He almost never talks like this; the book is mostly calm and practical. For one line he sounds like a man on fire.",
    splits: [
      { zh: "道", gloss: "dao: the Way", note: "The same <em>dao</em> the Taoists built their whole book around, but Confucius means something more down to earth: the right way for a human being and a society to be, the path the old sages walked. Legge: <em>the right way</em>. Muller and Waley: <em>the Way</em>. The Taoist <em>dao</em> is the way of nature; the Confucian <em>dao</em> is the way of conduct. Same word, two of the great rival answers in Chinese thought." },
      { zh: "夕死可矣", gloss: "in the evening, die content", note: "Here the translators split on tone. Legge keeps it cool, <em>he may die in the evening without regret</em>. Waley makes it a cry, <em>in the evening, die content!</em>, exclamation and all. And Lau rewrites it entirely: <em>He has not lived in vain who dies the day he is told about the Way</em>, turning the line from a wish into a verdict on a life. One Chinese sentence, read as a private vow, a shout, and an epitaph." }
    ],
    read: "It is the rare passage where the practical teacher drops the manners and you see what is underneath: a man who would trade his remaining life for one clear sight of how things ought to be."
  },

  "4.15": {
    title: "The one thread",
    gist: "Confucius tells a disciple that everything he teaches is held together by a single thread, then walks out without explaining. The other students, baffled, ask what he meant. The disciple Zengzi gives the answer the tradition has leaned on ever since: the whole sprawling teaching reduces to two things, doing your best and putting yourself in the other person's place. This is Confucius's other one-line summary of himself, the positive twin of the negative golden rule in 15.24.",
    splits: [
      { zh: "忠恕", gloss: "zhong shu: loyalty / doing one's best, and reciprocity", note: "Two words carry the whole load. <em>Zhong</em> is loyalty, but really doing your utmost, giving the full effort owed. <em>Shu</em> is reciprocity, treating others as you would want to be treated. Waley: <em>Loyalty, consideration</em>. Eno: <em>loyalty and reciprocity</em>. Lau: <em>doing one's best and using oneself as a measure to gauge others</em>. Put together they are the inner and outer of the same move: be wholehearted, and imagine the other person is you." }
    ],
    read: "It matters that Confucius does not give the answer himself; a student does. The book is honest that it is a record kept by disciples, not a doctrine handed down whole. The thread was pieced together by the people who loved him, after he left the room."
  },

  "6.30": {
    title: "The good person lifts others up the stairs they are climbing",
    gist: "Asked whether a ruler who showered benefits on everyone would count as <em>ren</em>, good in the full sense, Confucius says that would be beyond even the ancient sage-kings. Then he gives the everyday version anyone can practice: if you want to stand on your own feet, help others stand; if you want to get somewhere, help others get there. It is the golden rule again, but stated as a positive this time, and it is the warmest definition of goodness in the book.",
    splits: [
      { zh: "仁", gloss: "ren: goodness / benevolence / humaneness", note: "This is the word everything in the Analects orbits, and no two translators agree on it. The character is <em>person</em> plus <em>two</em>: goodness as the thing that happens between people. Legge tried <em>perfect virtue</em> and <em>true virtue</em>; Waley settled on <em>Goodness</em> with a capital G; Lau says <em>benevolence</em>; Watson and Chin say <em>humaneness</em>; Ames and Rosemont, most radically, say <em>authoritative conduct</em>, to catch that <em>ren</em> is something you do and are seen to do, not a private warm feeling. Pound, the poet, sometimes just wrote <em>manhood</em> or <em>humanity</em>. Five real translators, five different English words for the highest thing a person can be." },
      { zh: "己欲立而立人", gloss: "wishing to stand, help others stand", note: "The mechanism of <em>ren</em> in one line. You already know what you want for yourself; goodness is just wanting it for others and acting on it. It is not self-sacrifice. It is using your own desires as the map to everyone else's." }
    ],
    read: "Stack this against 15.24 and you have the Confucian golden rule, both sides of it. Do not do to others what you would hate (the floor), and help others to what you want (the ceiling). He gives you the cautious version and the generous version, and trusts you to know which the moment calls for."
  },

  "7.1": {
    title: "I made none of this up",
    gist: "Confucius describes himself, and the description is startling for the founder of a tradition: he says he invented nothing. He is a <em>transmitter</em>, not a creator, just passing on the wisdom of the ancients he loves. The most influential teacher in Chinese history insisted he was only a messenger. Whether that is humility, strategy, or sincere belief is a question the whole tradition has chewed on.",
    splits: [
      { zh: "述而不作", gloss: "transmit but do not create", note: "<em>Shu</em> is to transmit or hand on; <em>zuo</em> is to make, create, innovate. Legge: <em>a transmitter and not a maker</em>. Lau: <em>I transmit but do not innovate</em>. Muller: <em>I am a transmitter, rather than an original thinker</em>. The claim is the same in all of them, and it is a claim modern scholars doubt: Confucius plainly did remake the ideas he inherited, pouring new meaning into old words like <em>ren</em> and <em>junzi</em>. He created by claiming not to, which may be the most effective way to get a culture to accept a new idea: tell them it is old." }
    ],
    read: "It is worth taking seriously rather than as false modesty. Confucius really did think the answers were already there, in the early Zhou, and that the job was to recover them, not to be original. A culture that prizes the new finds this hard to read. He genuinely believed the best thing he could do was carry something forward without dropping it."
  },

  "12.1": {
    title: "The most argued-over sentence in the book",
    gist: "His favorite student asks the biggest question, what is <em>ren</em>, and Confucius gives a definition every later school fought over: master yourself and return to <em>ritual</em>. Rein in the private, grasping self, and step back into the shared forms of proper conduct, and that is goodness. Do it for even one day, he says, and the whole world would feel it. Then he makes it concrete: do not look at, listen to, say, or do anything that violates ritual.",
    splits: [
      { zh: "克己復禮", gloss: "ke ji fu li: overcome the self and return to ritual", note: "Four characters, and the translators read them two different ways. Legge: <em>to subdue one's self and return to propriety</em>. Lau: <em>to return to the observance of the rites through overcoming the self</em>. Waley shrinks it to <em>submit to ritual</em>. The fight is over <em>ke ji</em>, overcome the self: is it conquering your selfishness (the moral reading), or just disciplining yourself (the milder one)? Centuries of Confucians split on whether goodness means crushing your desires or simply training them." },
      { zh: "仁", gloss: "ren, again: and watch the spread", note: "Line them up on this one passage. Legge: <em>perfect virtue</em>. Muller: <em>humaneness</em>. Lau: <em>benevolence</em>. Waley: <em>Goodness</em>. Ames and Rosemont: <em>authoritative conduct</em>. The same character, <em>ren</em>, rendered five ways in five English sentences about the same six Chinese words. If you ever wondered why a page like this exists, it is this passage." }
    ],
    read: "The radical thing here is that goodness is not turning inward to find your true self. It is the opposite: it is reining the self in and rejoining the shared forms. The West tends to locate virtue in authenticity, being true to who you are. Confucius locates it in <em>ritual</em>, fitting yourself to who you ought to be. Two completely different bets about where a good person comes from."
  },

  "12.2": {
    title: "The golden rule, told to a different student",
    gist: "Another disciple asks about <em>ren</em>, and Confucius gives a different answer than he gave in 12.1, because he always tailored the answer to the person asking. To this one he says: treat everyone with the gravity you would bring to a state ceremony, and, the line that matters, do not impose on others what you do not want yourself. The negative golden rule shows up here too, proof it was not a one-off but the steady center of his ethics.",
    splits: [
      { zh: "己所不欲，勿施於人", gloss: "do not impose on others what you do not want", note: "The exact same eight characters as the famous 15.24. Confucius says them more than once, to more than one student. When a teacher repeats a line verbatim to different people on different days, that is the tradition's way of telling you it is load-bearing." }
    ],
    read: "He never gives the same definition of goodness twice, and that is the point. There is no formula. <em>Ren</em> is not a thing you can define once and store; it is a thing you have to keep working out in front of whoever is actually standing there."
  },

  "13.3": {
    title: "If the words go wrong, everything goes wrong",
    gist: "Asked what he would do first if he ran a government, Confucius gives an answer that sounds like a grammar lesson and is actually a theory of how societies collapse: he would <em>rectify the names</em>. Make the words match reality again. If a ruler is called a ruler but does not act like one, if <em>father</em> and <em>son</em> have come loose from what they mean, then language is lying, and once language lies, nothing built on it (law, custom, trust) can stand. Fix the words and you start to fix the world.",
    splits: [
      { zh: "正名", gloss: "zheng ming: the rectification of names", note: "<em>Zheng</em> is to correct or set straight; <em>ming</em> is names, words, titles. Legge: <em>to rectify names</em>. Lau: <em>the rectification of names</em>. The idea is that every role-word, ruler, minister, father, son, comes with a built-in standard of behavior, and a society stays healthy only as long as the people in those roles actually live up to the words. Confucius's clearest version of it is four characters elsewhere: <em>let the ruler be a ruler, the minister a minister, the father a father, the son a son</em>." }
    ],
    read: "This lands hard in an age of spin and rebranding. His claim is that the corruption of language is not a side effect of a sick society, it is the cause. When words stop meaning what they say, people lose the ground under their feet, and, as he puts it, no longer know where to put hand or foot. Start by calling things what they are."
  },

  "15.24": {
    title: "One word for the rest of your life",
    gist: "A disciple asks the question everyone secretly wants answered: is there a single word you could practice your whole life and not go wrong? Confucius gives one. <em>Shu</em>. Then he unpacks it: do not impose on others what you would not want done to you. It is the golden rule, but flipped to the negative, a prohibition instead of a command. Not <em>do good to people</em>, but <em>start by not doing harm</em>. This is the book's own pick for its center, which is why it sits at the heart of this page.",
    splits: [
      { zh: "恕", gloss: "shu: reciprocity / consideration / likening to oneself", note: "The one word. The character is <em>heart</em> underneath <em>like / as</em>: literally, the heart that treats others as itself. It is almost impossible to translate in one English word, so the translators scatter. Legge gives up and shouts the abstraction, <em>RECIPROCITY</em>. Lau keeps the Chinese, <em>shu</em>, and explains it in a footnote. Waley calls it <em>consideration</em>. The moderns mostly skip the noun and jump to the rule it names." },
      { zh: "己所不欲，勿施於人", gloss: "do not impose on others what you do not want", note: "Here the renderings nearly converge, which is the proof that the line itself is plain. The only real choice is one verb: Lau, Slingerland, and Ames and Rosemont all say <em>impose</em> (do not force your preferences on people); Legge and Waley say <em>do</em> (do not do to them). <em>Impose</em> is sharper, about not overriding another's will; <em>do</em> is broader. A hair of difference, and otherwise five translators land in the same place." }
    ],
    read: "Sit with how negative it is. The version most of us grew up with tells you to take action: do unto others. Confucius tells you to hold back: do not. And the cautious version may be the wiser one, because you can rarely be sure what will help another person, but you almost always know what would hurt you. Start there, with the harm you can actually see."
  },

  "17.2": {
    title: "Born close, pulled apart by habit",
    gist: "One short line that quietly underwrites the whole project of self-cultivation. By nature, people start out nearly alike, Confucius says. It is <em>practice</em>, the habits we build and repeat, that drives us far apart. We are not born good or bad, gentleman or scoundrel; we become it, slowly, by what we do over and over. Which is exactly why a lifetime of the right practice can remake a person.",
    splits: [
      { zh: "性相近也，習相遠也", gloss: "by nature close, by practice far apart", note: "Legge: <em>By nature, men are nearly alike; by practice, they get to be wide apart</em>. Waley compresses it to <em>by nature, near together; by practice far apart</em>. This is nearly the only time Confucius talks about human <em>nature</em> (<em>xing</em>) at all, and he leaves it wide open, which is why his two great successors could split over it: Mencius decided people are born good, Xunzi that people are born bad, and both quoted Confucius. He left the door open and they each walked through a different side." }
    ],
    read: "It is an optimistic and demanding idea at once. Optimistic, because nobody is written off at birth. Demanding, because it means who you become is mostly on you and your habits, not your stars. The distance between a good life and a wasted one is just practice, repeated until it sets."
  },

  "17.19": {
    title: "Does Heaven talk?",
    gist: "Confucius says he would rather not speak anymore. His startled disciple asks: if you go silent, what will we have to pass on? And Confucius answers with the closest thing in the book to a statement about God. Does <em>Heaven</em> say anything? No. And yet the four seasons turn, and the hundred creatures are born, right on schedule. Heaven runs the whole world and never says a word. The lesson is half about teaching by example and half a glimpse of what Confucius thought Heaven actually was.",
    splits: [
      { zh: "天", gloss: "tian: Heaven / Nature / the sky", note: "This passage is the best window onto <em>tian</em>, and it shows you why <em>Heaven</em> is a slightly misleading translation. Confucius's <em>tian</em> does not speak, command, or judge from a throne; it works the way nature works, silently and reliably, through the turning seasons. Legge and Lau keep <em>Heaven</em>. Waley notes that here you could almost translate it <em>Nature</em>. It is not the personal God of the West and not nothing either, something closer to the impersonal order of the world, which you obey by watching what it does, not by listening for what it says." }
    ],
    read: "For a tradition often filed under religion, this is striking: the divine here is mute. It does not reveal, it just runs. And the way to be good, the passage hints, is the same as the way Heaven is good: not by preaching it, but by quietly being it, until the people around you turn like seasons. Confucius would rather show than tell, and he thinks Heaven feels the same."
  }

};
