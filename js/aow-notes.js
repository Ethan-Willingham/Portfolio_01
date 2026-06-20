/* ============================================================
   The Art of War, side by side: the commentary.
   Per-passage, plain-language breakdown of what Sun Tzu is doing
   and where the translators split. Written in the site voice.
   No em dashes (in my prose; verbatim quotes keep their own).
   Light inline HTML (<em>, <b>) is allowed; it is injected as
   innerHTML by js/aow.js.

   shape:  id: { title, gist, splits:[{zh, gloss, note}], read }
   Passages without an entry render the translations alone.
   ============================================================ */
window.AOW_NOTES = {

  1: {
    title: "War is the one thing you cannot wing",
    gist: "The book opens cold, with no glory in it. War is the biggest thing a state does, the ground it lives or dies on, the road to either lasting or being wiped out. So you study it, hard, or you lose. No trumpets, no honor, no heroes. The first sentence of the most famous war book ever written is basically a safety warning.",
    splits: [
      { zh: "兵", gloss: "bing", note: "One character that means soldiers, weapons, and war all at once, so the translators have to pick. Giles goes abstract with <em>'the art of war,'</em> Cleary picks <em>'military action,'</em> Mair just says <em>'warfare.'</em> The Chinese does not separate the fighting, the people, and the steel. They are one thing." },
      { zh: "死生之地", gloss: "the ground of death and life", note: "Almost everyone keeps this stark, because you cannot soften it. Death before life, not life before death. The phrasing alone tells you what register the book is in." }
    ],
    read: "Most war stories open on a battlefield. This one opens on a ledger. That is the whole book in one move: the drama is not the fighting, it is the math you do before."
  },

  2: {
    title: "War is the way of deception",
    gist: "Five characters: <em>bing zhe, gui dao ye</em>. War is the way of deception. Then a list of how: when you can fight, look like you cannot; when you are close, look far; when you are far, look near. The entire game is managing what the other side thinks it sees.",
    splits: [
      { zh: "詭道", gloss: "gui dao: the way of deceit", note: "Giles and Griffith flatten it to <em>'based on deception.'</em> Ames, Minford, and Mair keep the <em>way</em>, because 道 (<em>dao</em>) is the same loaded word that titles the Tao Te Ching. Deception is not a trick here, it is a method, a road you travel. And 詭 means strange and uncanny as much as it means false, so it is closer to wrong-footing the enemy than to lying to him." },
      { zh: "示之", gloss: "show him", note: "The verb that runs through the whole passage is <em>show</em>. Not <em>be</em> weak, <em>look</em> weak. Mair makes the point in his notes: this is not a license to lie, it is the general hiding his real intentions. You manage the appearance, you keep the truth." }
    ],
    read: "People read this line as permission to cheat. Sun Tzu means something colder and more useful: never let the enemy see what is actually there."
  },

  3: {
    title: "The battle is settled before it starts",
    gist: "Before a war, the old generals went to the ancestral temple and counted. They weighed the five factors, ran the seven comparisons, and tallied it up with counting rods. The side with the higher score has already won; the fighting just collects the result. Many counts, victory. Few counts, defeat. No counting at all, and you have already lost.",
    splits: [
      { zh: "廟算", gloss: "miao suan: temple reckoning", note: "Giles keeps the temple. So does Griffith. Ames makes it <em>'the temple rehearsal of the battle.'</em> Cleary quietly drops the temple for <em>'headquarters,'</em> trading an ancient ritual for a boardroom, which is exactly the kind of choice that tells you how a translator reads the whole book." },
      { zh: "算", gloss: "suan: to count / a count", note: "A pun that does not survive English. 算 is both the act of reckoning and the score you rack up, literally counting rods. Mair is the only one who keeps the rods in his English, so you can see the abacus under the metaphor." }
    ],
    read: "This is the engine under the famous 'win first, then fight.' You do not show up and hope. You add it up, and if the numbers say no, you do not go."
  },

  4: {
    title: "Win fast, or do not start",
    gist: "A long war ruins the country fighting it, even a country that is winning. Sun Tzu would rather see a clumsy, fast victory than a brilliant, drawn-out one. Speed is not a style choice here, it is the economics: armies eat, treasuries empty, and the other states pile on while you are stuck in the field.",
    splits: [
      { zh: "拙速", gloss: "zhuo su: clumsy but fast", note: "A phrase nobody can make pretty, and they do not try. Giles: <em>'stupid haste.'</em> Griffith: <em>'blundering swiftness.'</em> Ames: <em>'a foolish haste.'</em> The point is ugly on purpose: a quick win that looks dumb beats a slow one that looks smart." }
    ],
    read: "The least romantic line in any war book. The smart move is the short one, even when it is the ugly one."
  },

  5: {
    title: "The best win has no battle in it",
    gist: "This is the line. Winning every battle is not the top of the skill. The top is making the enemy quit without a fight. Then the ranking, best to worst: wreck his strategy, break up his alliances, beat his army in the field, and dead last, lay siege to his cities, which is slow and bloody and bleeds you white. The heroic battle is near the bottom of the list.",
    splits: [
      { zh: "不戰而屈人之兵", gloss: "subdue the enemy without fighting", note: "The most quoted sentence in the book. Worth knowing: Griffith's 1963 first edition says <em>'is the acme of skill,'</em> not <em>'the supreme excellence'</em> that gets passed around online (that is a later revision). Small thing, but this is the line people tattoo on themselves, so the wording matters." },
      { zh: "伐謀", gloss: "fa mou: attack the plan", note: "The very best target is not the enemy's army, it is his <em>plan</em>. Cleary: <em>'strikes while schemes are being laid.'</em> Denma, blunt as ever: <em>'cuts down strategy.'</em> You beat the war before it has troops in it." }
    ],
    read: "Everyone quotes this and then goes to war anyway. Sun Tzu ranked the bloodless win at the top of the list and the heroic siege at the very bottom, and he meant the order."
  },

  6: {
    title: "Know both, and you stay out of trouble",
    gist: "Know the enemy and know yourself, and a hundred battles will not endanger you. Know only yourself, you will win some and lose some. Know neither, you lose every time. Knowledge is the one variable; everything else falls out of it.",
    splits: [
      { zh: "百戰不殆", gloss: "a hundred battles, no peril", note: "Here is the famous misquote, and it is worth catching. The line does <b>not</b> say you will <em>win</em> a hundred battles. 不殆 (<em>bu dai</em>) means <em>not in danger</em>, not <em>victorious</em>. Giles: <em>'you need not fear.'</em> Griffith: <em>'you will never be in peril.'</em> Every careful translator keeps it as safety, never triumph. The poster version that promises a hundred wins is selling something Sun Tzu never wrote." }
    ],
    read: "The most quoted line in the book, and the most inflated. He promises you will not be destroyed. He never promised you would win."
  },

  7: {
    title: "Make yourself unbeatable first",
    gist: "The old masters first made themselves impossible to beat, then waited for the enemy to slip. Being unbeatable is on you. Beating the enemy is on him. You can build the first part yourself; the second you can only wait for.",
    splits: [
      { zh: "不可勝在己", gloss: "invincibility lies in yourself", note: "The clean half of the idea, and everyone keeps it close: your defense is yours to build, the opening is the enemy's to give. You do not manufacture his mistake. You make sure you are ready when it comes." },
      { zh: "形", gloss: "xing: form, disposition", note: "This is the title word of the chapter, the visible shape an army shows. Hold onto it. Two chapters later Sun Tzu tells you to erase it completely, and the word for that is 無形, no-form." }
    ],
    read: "Defense first, and not the dramatic kind. You close your own gaps and let the other guy open his."
  },

  8: {
    title: "Win first, then fight",
    gist: "The winning army wins, and then goes to battle. The losing army goes to battle, and then tries to win. By the time the swords are out, the result is mostly set. The fight is where you collect a victory you already arranged, or find out about a loss you already booked.",
    splits: [
      { zh: "先勝而後求戰", gloss: "first win, then seek battle", note: "Cleary's phrasing, <em>'a victorious army first wins and then seeks battle,'</em> is the one people quote. The line you have actually heard, <em>'every battle is won before it is fought'</em> (Gordon Gekko in <em>Wall Street</em>, Bill Belichick in the locker room), is a paraphrase of this. Good paraphrase. Just not a real sentence in the book." }
    ],
    read: "This is the verse Wall Street and the NFL turned into a slogan. The real line is stranger and better: the fighting is the last step, not the first."
  },

  9: {
    title: "The best win looks like nothing happened",
    gist: "The expert wins where winning was easy, because he set it up to be easy. So his victories bring him no fame for brilliance and no medal for bravery. There was no near-thing to admire, no heroic stand. He made no mistakes, beat someone who was already beaten, and went home.",
    splits: [
      { zh: "無智名，無勇功", gloss: "no fame for wisdom, no merit for courage", note: "Everyone keeps the deflation. Giles: <em>'neither reputation for wisdom nor credit for courage.'</em> Griffith: <em>'merit for valour.'</em> Cleary connects it to the setup: the good warrior <em>'prevailed when it was easy to prevail.'</em> He arranged easy, then took it." }
    ],
    read: "We hand out medals for the close call and the heroic comeback. Sun Tzu thinks the close call means you let it get close. The master's win is boring, and that is the compliment."
  },

  10: {
    title: "Shi, the force in the setup",
    gist: "Here is the hardest idea in the book, and English has no word for it. <em>Shi</em> is the force a situation stores when you arrange it right. Water moving fast enough to roll boulders is shi. A drawn crossbow, the instant before the trigger, is shi; the snap of release is <em>jie</em>, the timing. The power is not in the water or the bow. It is in the position.",
    splits: [
      { zh: "勢", gloss: "shi: configured force", note: "Watch them all reach for a different word. Giles and Griffith say <em>energy</em>, Cleary <em>force</em> and <em>momentum</em>, Minford <em>potential energy</em>, Mair <em>configuration</em>. The Denma group gives up and just keeps <em>shih</em>. The French scholar François Jullien calls it <em>propensity</em>: the way a setup, left alone, wants to go." },
      { zh: "節", gloss: "jie: the timed release", note: "Shi's partner, and it has to be rendered as a pair. Giles calls it <em>'decision'</em> and loses the timing, which is the whole point. Griffith, Cleary, and Ames all land on <em>timing</em>. Denma keeps the literal sense, <em>'the node,'</em> the joint in the bamboo where it snaps." }
    ],
    read: "Stop thinking about how hard your people are pushing. Think about the slope you put them on. Shi is the slope."
  },

  11: {
    title: "Roll the round stone downhill",
    gist: "The chapter ends on its picture. A good commander goes looking for victory in the shi, not in his individual soldiers, then puts them where winning is like rolling a round stone down a mountain a mile high. A square rock sits where you drop it. A round rock on a slope rolls itself. You do not push harder. You change the ground.",
    splits: [
      { zh: "求之於勢，不責於人", gloss: "seek it in shi, not in your people", note: "The leadership line, and it is brutal in its way: arrange the situation, do not lean on the individuals. Griffith: <em>'seeks victory from the situation and does not demand it of his subordinates.'</em> The work is in the setup, not in the squeezing." },
      { zh: "如轉圓石於千仞之山", gloss: "like a round stone down a mile-high mountain", note: "Jullien reads this one image as the entire idea. You arrange the slope; the stone falls of its own accord, <em>sponte sua</em>. The commander does not carry the stone down. He picks the hill." }
    ],
    read: "The most useful line here for anyone who is not a general. Do not try to get more out of people. Build the slope so the work rolls on its own."
  },

  12: {
    title: "Be so shaped that you have no shape",
    gist: "If the enemy cannot read your formation, he cannot plan against it. So the peak of arranging an army is to show no arrangement at all. Subtle to the point of formless, quiet to the point of soundless. Then even a spy planted inside your camp learns nothing, and a clever enemy has nothing to scheme against. You become the one holding his fate.",
    splits: [
      { zh: "無形", gloss: "wu xing: formlessness", note: "Remember 形, <em>form</em>, the title of chapter four, the shape an army shows? Here you erase it. Most translators render the negation straight (formless, no-form), but Mair breaks from the pack and translates 形 as <em>'positions'</em> the whole way through, so his formlessness becomes <em>'no position.'</em> One character choice, two different books." },
      { zh: "微乎微乎", gloss: "wei hu wei hu: subtle, subtle", note: "The Chinese doubles the word for effect. Minford keeps the doubling, <em>'subtlety of subtleties.'</em> Giles cannot resist and inflates it into <em>'O divine art of subtlety and secrecy!'</em> The plainer versions hit harder." }
    ],
    read: "Deception back in chapter one was hiding a single fact. This is hiding the shape of everything, until there is nothing left for the enemy to grab."
  },

  13: {
    title: "Take the shape of the ground",
    gist: "An army should move like water. Water runs off the high ground and pours into the low; an army avoids the enemy's strength and pours into his weakness. Water takes its shape from the land it is on; you take your plan from the enemy in front of you. No fixed shape, no fixed tactics. Whatever the ground hands you.",
    splits: [
      { zh: "水無常形，兵無常勢", gloss: "water has no constant shape, war no constant shi", note: "The two hardest words in the book, formlessness and shi, land in the same breath here. This is the Taoist heart of a military manual: soft over hard, low over high. It rhymes straight out of the Tao Te Ching, which also makes water the teacher." },
      { zh: "因敵而制勝", gloss: "shape your victory to the enemy", note: "The anti-formula. There is no formula, the line says, only the enemy in front of you. Cleary calls the knack of changing with the enemy <em>'genius'</em> outright." }
    ],
    read: "A war book whose highest image is water: yielding, low, shapeless, and it carves canyons. The winner is the one with no fixed plan to hit."
  },

  14: {
    title: "Add the ground and the sky",
    gist: "Chapter three said: know the enemy and yourself, and you stay out of danger. Here, deep in the chapter on terrain, Sun Tzu adds the missing half. Know the enemy and yourself, and your victory is not in danger. Know the ground and the weather too, and the victory is whole. People are half the equation. Place and timing are the rest.",
    splits: [
      { zh: "知天知地", gloss: "know heaven, know earth", note: "Heaven is the weather and the season; earth is the terrain. These are two of the five factors from way back in chapter one, returning at the end as the closer. The book ties its own knot." },
      { zh: "勝乃可全", gloss: "victory can be made whole", note: "The upgrade. Knowing the two sides gets you <em>'not in danger.'</em> Adding the ground and the sky gets you <em>'complete.'</em> Cleary stretches it to <em>'inexhaustible,'</em> Mair to <em>'unlimited.'</em>" }
    ],
    read: "The famous half of this couplet is 'know yourself and the enemy.' The forgotten half is 'know the ground and the sky,' and it is the half that turns safe into certain."
  },

  15: {
    title: "Pay for the truth, in people",
    gist: "The book ends on spies, and it is blunt about why. Everything Sun Tzu has promised, the win arranged in advance, the knowing of both sides, the reading of the enemy's shape, runs on knowing things before they happen. And that foreknowledge cannot be prayed out of the spirits, read off omens, or calculated from the stars. It comes from one place: people who already know. So you run spies, and you pay them better than anyone in your army.",
    splits: [
      { zh: "先知", gloss: "xian zhi: foreknowledge", note: "The word the whole book quietly rests on. Not prophecy, not magic. Just knowing first. Giles, Griffith, Cleary, and Ames all keep it as <em>foreknowledge</em>; Minford makes it plain as <em>'prior information.'</em>" },
      { zh: "必取於人", gloss: "it must be taken from people", note: "The coldest, most modern line in the book. Not from gods (鬼神), not from omens, not from the calendar's math. Ames: <em>'It must come from people, people who know the enemy's situation.'</em> Sun Tzu rules out everything supernatural and lands on human intelligence." }
    ],
    read: "A book that can sound mystical ends as the exact opposite. No spirits, no signs, no fate. If you want to know what the enemy will do, find the person who already knows, and buy him."
  }

};
