/* ============================================================
   The Art of War, side by side: the corpus.
   Sun Tzu's keystone passages in Classical Chinese (the received
   text), then seven English translations stacked verbatim, one
   entry per translator per passage. Used by js/aow.js.

   shape: window.AOW = {
     translators: { key: {name, year, n, src} },
     order: [keys, chronological],
     passages: [ {id, ch, chZh, chTitle, zh, v:[{k, t}]} ]
   }

   Verse-set translations (Minford, Ames, parts of Denma/Mair) keep
   their line breaks as "\n"; a blank line ("\n\n") is a stanza gap.
   Every quotation is reproduced verbatim, including each source's
   own punctuation (so a few carry em dashes the rest of the site
   never uses). The Chinese is the received text from ctext.org,
   normalized to orthodox traditional characters (于 to 於).
   Where a translator is absent from a passage, the cell is simply
   left out and the explorer shows the rest. No paraphrase, ever.
   ============================================================ */
window.AOW = {
  translators: {
    giles:    { name: "Lionel Giles",            year: 1910, n: 15, src: "Luzac & Co. (public domain)" },
    griffith: { name: "Samuel B. Griffith",      year: 1963, n: 15, src: "Oxford / Clarendon Press" },
    cleary:   { name: "Thomas Cleary",           year: 1988, n: 15, src: "Shambhala" },
    ames:     { name: "Roger T. Ames",           year: 1993, n: 12, src: "Ballantine, from the Yinqueshan bamboo text" },
    denma:    { name: "Denma Translation Group",  year: 2001, n: 12, src: "Shambhala" },
    minford:  { name: "John Minford",            year: 2002, n: 15, src: "Penguin Classics" },
    mair:     { name: "Victor H. Mair",          year: 2007, n: 12, src: "Columbia University Press" }
  },
  order: ["giles", "griffith", "cleary", "ames", "denma", "minford", "mair"],

  passages: [
    {
      id: 1, ch: 1, chZh: "始計", chTitle: "Laying Plans",
      zh: "兵者，國之大事，死生之地，存亡之道，不可不察也。",
      v: [
        { k: "giles", t: "The art of war is of vital importance to the State. It is a matter of life and death, a road either to safety or to ruin. Hence it is a subject of inquiry which can on no account be neglected." },
        { k: "griffith", t: "War is a matter of vital importance to the State; the province of life or death; the road to survival or ruin. It is mandatory that it be thoroughly studied." },
        { k: "cleary", t: "Military action is important to the nation—it is the ground of death and life, the path of survival and destruction, so it is imperative to examine it." },
        { k: "ames", t: "War is a vital matter of state. It is the field on which life or death is determined and the road that leads to either survival or ruin, and must be examined with the greatest care." },
        { k: "denma", t: "The military is a great matter of the state.\nIt is the ground of death and life,\nThe Tao of survival or extinction.\nOne cannot but examine it." },
        { k: "minford", t: "War is\nA grave affair of state;\nIt is a place\nOf life and death,\nA road\nTo survival and extinction,\nA matter\nTo be pondered carefully." },
        { k: "mair", t: "Warfare is a great affair of the state.\nThe field of life and death,\nThe way of preservation and extinction.\nIt cannot be left unexamined." }
      ]
    },
    {
      id: 2, ch: 1, chZh: "始計", chTitle: "Laying Plans",
      zh: "兵者，詭道也。故能而示之不能，用而示之不用，近而示之遠，遠而示之近。",
      v: [
        { k: "giles", t: "All warfare is based on deception. Hence, when able to attack, we must seem unable; when using our forces, we must seem inactive; when we are near, we must make the enemy believe we are far away; when far away, we must make him believe we are near." },
        { k: "griffith", t: "All warfare is based on deception. Therefore, when capable, feign incapacity; when active, inactivity. When near, make it appear that you are far away; when far away, that you are near. Offer the enemy a bait to lure him; feign disorder and strike him." },
        { k: "cleary", t: "A military operation involves deception. Even though you are competent, appear to be incompetent. Though effective, appear to be ineffective." },
        { k: "ames", t: "Warfare is the art (tao) of deceit. Therefore, when able, seem to be unable; when ready, seem unready; when nearby, seem far away; and when far away, seem near. If the enemy seeks some advantage, entice him with it. If he is in disorder, attack him and take him." },
        { k: "minford", t: "The Way of War is\nA Way of Deception.\n\nWhen able,\nFeign inability;\nWhen deploying troops,\nAppear not to be.\nWhen near,\nAppear far;\nWhen far,\nAppear near." },
        { k: "mair", t: "Warfare is a way of deception.\nTherefore,\nWhen one is capable, give the appearance of being incapable.\nWhen one is active, give the appearance of being inactive.\nWhen one is near, give the appearance of being far.\nWhen one is far, give the appearance of being near." }
      ]
    },
    {
      id: 3, ch: 1, chZh: "始計", chTitle: "Laying Plans",
      zh: "夫未戰而廟算勝者，得算多也；未戰而廟算不勝者，得算少也。多算勝，少算不勝，而況於無算乎？吾以此觀之，勝負見矣。",
      v: [
        { k: "giles", t: "Now the general who wins a battle makes many calculations in his temple ere the battle is fought. The general who loses a battle makes but few calculations beforehand. Thus do many calculations lead to victory, and few calculations to defeat: how much more no calculation at all! It is by attention to this point that I can foresee who is likely to win or lose." },
        { k: "griffith", t: "Now if the estimates made in the temple before hostilities indicate victory it is because calculations show one's strength to be superior to that of his enemy; if they indicate defeat, it is because calculations show that one is inferior. With many calculations, one can win; with few one cannot. How much less chance of victory has one who makes none at all! By this means I examine the situation and the outcome will be clearly apparent." },
        { k: "cleary", t: "The one who figures on victory at headquarters before even doing battle is the one who has the most strategic factors on his side. The one who figures on inability to prevail at headquarters before doing battle is the one who has the least strategic factors on his side. The one with many strategic factors in his favor wins, the one with few strategic factors in his favor loses—how much the more so for one with no strategic factors in his favor. Observing the matter in this way, I can see who will win and who will lose." },
        { k: "ames", t: "It is by scoring many points that one wins the war beforehand in the temple rehearsal of the battle; it is by scoring few points that one loses the war beforehand in the temple rehearsal of the battle. The side that scores many points will win; the side that scores few points will not win, let alone the side that scores no points at all." },
        { k: "minford", t: "Victory belongs to the side\nThat scores most\nIn the temple calculations\nBefore battle.\nDefeat belongs to the side\nThat scores least\nIn the temple calculations\nBefore battle.\nMost spells victory;\nLeast spells defeat;\nNone, surer defeat.\nI see it in this way,\nAnd the outcome is apparent." },
        { k: "mair", t: "Now, he who is victorious in the temple computations before battle is the one who receives more counting rods. He who is not victorious in the temple computations before battle is the one who receives fewer counting rods. The one with more counting rods wins, and the one with fewer counting rods loses. How much less chance of winning is there for someone who receives no counting rods at all! Through our observation of these calculations, victory and defeat are apparent." }
      ]
    },
    {
      id: 4, ch: 2, chZh: "作戰", chTitle: "Waging War",
      zh: "故兵聞拙速，未睹巧之久也。夫兵久而國利者，未之有也。",
      v: [
        { k: "giles", t: "Thus, though we have heard of stupid haste in war, cleverness has never been seen associated with long delays. There is no instance of a country having benefited from prolonged warfare." },
        { k: "griffith", t: "Thus, while we have heard of blundering swiftness in war, we have not yet seen a clever operation that was prolonged. For there has never been a protracted war from which a country has benefited." },
        { k: "cleary", t: "Therefore I have heard of military operations that were clumsy but swift, but I have never seen one that was skillful and lasted a long time. It is never beneficial to a nation to have a military operation continue for a long time." },
        { k: "ames", t: "Thus in war, I have heard tell of a foolish haste, but I have yet to see a case of cleverly dragging on the hostilities. There has never been a state that has benefited from an extended war." },
        { k: "denma", t: "The military values victory.\nIt does not value prolonging." },
        { k: "minford", t: "I have heard that in war\nHaste can be\nFolly\nBut have never seen\nDelay that was\nWise.\n\nNo nation has ever benefited\nFrom a protracted war." }
      ]
    },
    {
      id: 5, ch: 3, chZh: "謀攻", chTitle: "Attack by Stratagem",
      zh: "是故百戰百勝，非善之善者也；不戰而屈人之兵，善之善者也。故上兵伐謀，其次伐交，其次伐兵，其下攻城。",
      v: [
        { k: "giles", t: "Hence to fight and conquer in all your battles is not supreme excellence; supreme excellence consists in breaking the enemy's resistance without fighting. Thus the highest form of generalship is to baulk the enemy's plans; the next best is to prevent the junction of the enemy's forces; the next in order is to attack the enemy's army in the field; and the worst policy of all is to besiege walled cities." },
        { k: "griffith", t: "For to win one hundred victories in one hundred battles is not the acme of skill. To subdue the enemy without fighting is the acme of skill. Thus, what is of supreme importance in war is to attack the enemy's strategy." },
        { k: "cleary", t: "Therefore those who win every battle are not really skillful—those who render others' armies helpless without fighting are the best of all. Therefore the superior militarist strikes while schemes are being laid." },
        { k: "ames", t: "So to win a hundred victories in a hundred battles is not the highest excellence; the highest excellence is to subdue the enemy's army without fighting at all. Therefore, the best military policy is to attack strategies; the next to attack alliances; the next to attack soldiers; and the worst to assault walled cities." },
        { k: "denma", t: "One hundred victories in one hundred battles is not the most skillful.\nSubduing the other's military without battle is the most skillful.\n\nThe superior military cuts down strategy." },
        { k: "minford", t: "Ultimate excellence lies\nNot in winning\nEvery battle\nBut in defeating the enemy\nWithout ever fighting.\nThe highest form of warfare\nIs to attack\nStrategy itself." },
        { k: "mair", t: "Causing the enemy forces to submit without a battle is the most excellent approach. Therefore, the most superior stratagem in warfare is to stymie the enemy's plans; the next best is to stymie his alliances; the next best is to stymie his troops; the worst is to attack his walled cities." }
      ]
    },
    {
      id: 6, ch: 3, chZh: "謀攻", chTitle: "Attack by Stratagem",
      zh: "知彼知己，百戰不殆；不知彼而知己，一勝一負；不知彼，不知己，每戰必敗。",
      v: [
        { k: "giles", t: "If you know the enemy and know yourself, you need not fear the result of a hundred battles. If you know yourself but not the enemy, for every victory gained you will also suffer a defeat. If you know neither the enemy nor yourself, you will succumb in every battle." },
        { k: "griffith", t: "Know the enemy and know yourself; in a hundred battles you will never be in peril. When you are ignorant of the enemy but know yourself, your chances of winning or losing are equal. If ignorant both of your enemy and of yourself, you are certain in every battle to be in peril." },
        { k: "cleary", t: "So it is said that if you know others and know yourself, you will not be imperiled in a hundred battles; if you do not know others but know yourself, you win one and lose one; if you do not know others and do not know yourself, you will be imperiled in every single battle." },
        { k: "ames", t: "He who knows the enemy and himself\nWill never in a hundred battles be at risk;\nHe who does not know the enemy but knows himself\nWill sometimes win and sometimes lose;\nHe who knows neither the enemy nor himself\nWill be at risk in every battle." },
        { k: "denma", t: "Knowing the other and knowing oneself,\nIn one hundred battles no danger.\nNot knowing the other and knowing oneself,\nOne victory for one loss.\nNot knowing the other and not knowing oneself,\nIn every battle certain defeat." },
        { k: "minford", t: "Know the enemy,\nKnow yourself,\nAnd victory\nIs never in doubt,\nNot in a hundred battles.\n\nHe who knows self\nBut not the enemy\nWill suffer one defeat\nFor every victory.\nHe who knows\nNeither self\nNor enemy\nWill fail\nIn every battle." }
      ]
    },
    {
      id: 7, ch: 4, chZh: "軍形", chTitle: "Tactical Dispositions",
      zh: "昔之善戰者，先為不可勝，以待敵之可勝。不可勝在己，可勝在敵。",
      v: [
        { k: "giles", t: "The good fighters of old first put themselves beyond the possibility of defeat, and then waited for an opportunity of defeating the enemy." },
        { k: "griffith", t: "Anciently the skilful warriors first made themselves invincible and awaited the enemy's moment of vulnerability." },
        { k: "cleary", t: "In ancient times skillful warriors first made themselves invincible, and then watched for vulnerability in their opponents." },
        { k: "ames", t: "Of old the expert in battle would first make himself invincible and then wait for the enemy to expose his vulnerability. Invincibility depends on oneself; vulnerability lies with the enemy." },
        { k: "denma", t: "In the past the skilled first made themselves invincible to await the enemy's vincibility.\nInvincibility lies in oneself.\nVincibility lies in the enemy.\nThus the skilled can make themselves invincible.\nThey cannot cause the enemy's vincibility." },
        { k: "minford", t: "Of old,\nThe Skillful Warrior\nFirst ensured\nHis own\nInvulnerability;\nThen he waited for\nThe enemy's\nVulnerability." },
        { k: "mair", t: "Those skilled in battle in antiquity first made themselves invincible so as to confront the vincibility of the enemy. Invincibility depends upon oneself; vincibility depends upon the enemy." }
      ]
    },
    {
      id: 8, ch: 4, chZh: "軍形", chTitle: "Tactical Dispositions",
      zh: "是故勝兵先勝而後求戰，敗兵先戰而後求勝。",
      v: [
        { k: "giles", t: "Thus it is that in war the victorious strategist only seeks battle after the victory has been won, whereas he who is destined to defeat first fights and afterwards looks for victory." },
        { k: "griffith", t: "Thus a victorious army wins its victories before seeking battle; an army destined to defeat fights in the hope of winning." },
        { k: "cleary", t: "Therefore a victorious army first wins and then seeks battle; a defeated army first battles and then seeks victory." },
        { k: "ames", t: "For this reason, the victorious army only enters battle after having first won the victory, while the defeated army only seeks victory after having first entered the fray." },
        { k: "denma", t: "The victorious military is first victorious and after that does battle.\nThe defeated military first does battle and after that seeks victory." },
        { k: "minford", t: "The victorious army\nIs victorious first\nAnd seeks battle later;\nThe defeated army\nDoes battle first\nAnd seeks victory later." },
        { k: "mair", t: "Being victorious in war depends upon first preparing the conditions for victory and then seeking battle with the enemy; being defeated in war results from first engaging in battle and then seeking victory." }
      ]
    },
    {
      id: 9, ch: 4, chZh: "軍形", chTitle: "Tactical Dispositions",
      zh: "故善戰者之勝也，無智名，無勇功。",
      v: [
        { k: "giles", t: "Hence his victories bring him neither reputation for wisdom nor credit for courage." },
        { k: "griffith", t: "And therefore the victories won by a master of war gain him neither reputation for wisdom nor merit for valour." },
        { k: "cleary", t: "In ancient times those known as good warriors prevailed when it was easy to prevail. Therefore the victories of good warriors are not noted for cleverness or bravery." },
        { k: "ames", t: "Thus the battle of the expert is never an exceptional victory, nor does it win him reputation for wisdom or credit for courage." },
        { k: "minford", t: "The Skillful Warrior of old\nWon\nEasy victories.\n\nThe victories\nOf the Skillful Warrior\nAre not\nExtraordinary victories;\nThey bring\nNeither fame for wisdom\nNor merit for valor." },
        { k: "mair", t: "Those in antiquity who were said to be skilled in battle won their victories against those who were easy to vanquish. Therefore, the victories of one who is skilled in battle do not evince a reputation for wisdom and do not bespeak brave merit." }
      ]
    },
    {
      id: 10, ch: 5, chZh: "兵勢", chTitle: "Energy",
      zh: "激水之疾，至於漂石者，勢也；鷙鳥之擊，至於毀折者，節也。是故善戰者，其勢險，其節短。勢如張弩，節如機發。",
      v: [
        { k: "giles", t: "The onset of troops is like the rush of a torrent which will even roll stones along in its course. The quality of decision is like the well-timed swoop of a falcon which enables it to strike and destroy its victim. Energy may be likened to the bending of a crossbow; decision, to the releasing of the trigger." },
        { k: "griffith", t: "When torrential water tosses boulders, it is because of its momentum; when the strike of a hawk breaks the body of its prey, it is because of timing. His potential is that of a fully drawn crossbow; his timing, the release of the trigger." },
        { k: "cleary", t: "When the speed of rushing water reaches the point where it can move boulders, this is the force of momentum. When the speed of a hawk is such that it can strike and kill, this is precision. So it is with skillful warriors—their force is swift, their precision is close. Their force is like drawing a catapult, their precision is like releasing the trigger." },
        { k: "ames", t: "That the velocity of cascading water can send boulders bobbing about is due to its strategic advantage (shih). That a bird of prey when it strikes can smash its victim to pieces is due to its timing. His strategic advantage (shih) is like a drawn crossbow and his timing is like releasing the trigger." },
        { k: "denma", t: "The rush of water, to the point of tossing rocks about. This is shih.\nThe strike of a hawk, at the killing snap. This is the node." },
        { k: "minford", t: "A rushing torrent\nCarries boulders\nOn its flood;\nSuch is the energy\nOf its momentum.\n\nA swooping falcon\nBreaks the back\nOf its prey;\nSuch is the precision\nOf its timing.\n\nHis energy is like\nA drawn crossbow,\nHis timing like\nThe release of a trigger." },
        { k: "mair", t: "The swiftness of a diving raptor can tear its prey apart; this is due to its instinctive timing. For this reason, he who is skilled in battle builds up an overpowering configuration that he releases with instantaneous timing. The configuration that he constructs is like a fully drawn and cocked crossbow; the timing of his release is like pulling its trigger." }
      ]
    },
    {
      id: 11, ch: 5, chZh: "兵勢", chTitle: "Energy",
      zh: "故善戰者，求之於勢，不責於人，故能擇人而任勢。任勢者，其戰人也，如轉木石；木石之性，安則靜，危則動，方則止，圓則行。故善戰人之勢，如轉圓石於千仞之山者，勢也。",
      v: [
        { k: "giles", t: "The clever combatant looks to the effect of combined energy, and does not require too much from individuals. Hence his ability to pick out the right men and utilise combined energy. Thus the energy developed by good fighting men is as the momentum of a round stone rolled down a mountain thousands of feet in height. So much on the subject of energy." },
        { k: "griffith", t: "Therefore a skilled commander seeks victory from the situation and does not demand it of his subordinates. He selects his men and they exploit the situation. Thus, the potential of troops skilfully commanded in battle may be compared to that of round boulders which roll down from mountain heights." },
        { k: "cleary", t: "Therefore good warriors seek effectiveness in battle from the force of momentum, not from individual people. Getting people to fight by letting the force of momentum work is like rolling logs and rocks. Logs and rocks are still when in a secure place, but roll on an incline; they remain stationary if square, they roll if round. Therefore, when people are skillfully led into battle, the momentum is like that of round rocks rolling down a high mountain—this is force." },
        { k: "ames", t: "The expert at battle seeks his victory from strategic advantage (shih) and does not demand it from his men. He who exploits the strategic advantage (shih) sends his men into battle like rolling logs and boulders. It is the nature of logs and boulders that on flat ground, they are stationary, but on steep ground, they roll; the square in shape tends to stop but the round tends to roll." },
        { k: "denma", t: "And so one skilled at battle\nSeeks it in shih and does not demand it of people.\n\nOne who uses shih sets people to battle as if rolling trees and rocks.\nAs for the nature of trees and rocks—\nWhen still, they are at rest.\nWhen agitated, they move.\nWhen square, they stop.\nWhen round, they go.\nThus the shih of one skilled at setting people to battle is like rolling round rocks from a mountain one thousand jen high." },
        { k: "minford", t: "The Skillful Warrior\nExploits\nThe potential energy;\nHe does not hold his men\nResponsible.\nHe deploys his men\nTo their best\nBut relies on\nThe potential energy.\n\nRelying on the energy,\nHe sends his men into battle\nLike a man\nRolling logs or boulders.\n\nSkillfully deployed soldiers\nAre like round boulders\nRolling down\nA mighty mountainside." },
        { k: "mair", t: "Therefore, he who is skilled in battle places emphasis upon configuration and does not put undue responsibilities on his subordinates. Therefore, he can select suitable subordinates and take advantage of configuration. When he who takes advantage of configuration sends his subordinates into battle, it is like turning over a log or a boulder. The nature of wood and stone is such that when they are stable they are still, but when they are precarious they move; when they are square they stop, but when they are round they roll." }
      ]
    },
    {
      id: 12, ch: 6, chZh: "虛實", chTitle: "Weak Points and Strong",
      zh: "微乎微乎，至於無形；神乎神乎，至於無聲；故能為敵之司命。故形兵之極，至於無形；無形，則深間不能窺，智者不能謀。",
      v: [
        { k: "giles", t: "O divine art of subtlety and secrecy! Through you we learn to be invisible, through you inaudible; and hence we can hold the enemy's fate in our hands." },
        { k: "griffith", t: "Subtle and insubstantial, the expert leaves no trace; divinely mysterious, he is inaudible. Thus he is master of his enemy's fate." },
        { k: "cleary", t: "Be extremely subtle, even to the point of formlessness. Be extremely mysterious, even to the point of soundlessness. Thereby you can be the director of the opponent's fate." },
        { k: "ames", t: "So veiled and subtle,\nTo the point of having no form (hsing);\nSo mysterious and miraculous,\nTo the point of making no sound.\nTherefore he can be arbiter of the enemy's fate." },
        { k: "denma", t: "Subtle! Subtle! To the point of formlessness.\n\nThe ultimate in giving form to the military is to arrive at formlessness.\nWhen one is formless, deep spies cannot catch a glimpse and the wise cannot strategize." },
        { k: "minford", t: "Oh, subtlety of subtleties!\nWithout form!\nOh, mystery of mysteries!\nWithout sound!\nHe is master of\nHis enemy's fate." },
        { k: "mair", t: "Therefore, the extreme skill in showing one's positions may reach to the degree of there seeming to be no position. When there are no positions, even deeply planted spies cannot detect them, and even a wise foe will not be able to make plans against me." }
      ]
    },
    {
      id: 13, ch: 6, chZh: "虛實", chTitle: "Weak Points and Strong",
      zh: "夫兵形象水，水之形，避高而趨下；兵之形，避實而擊虛。水因地而制流，兵因敵而制勝。故兵無常勢，水無常形。",
      v: [
        { k: "giles", t: "Military tactics are like unto water; for water in its natural course runs away from high places and hastens downwards. So in war, the way is to avoid what is strong and to strike at what is weak. Water shapes its course according to the nature of the ground over which it flows; the soldier works out his victory in relation to the foe whom he is facing. Therefore, just as water retains no constant shape, so in warfare there are no constant conditions." },
        { k: "griffith", t: "Now an army may be likened to water, for just as flowing water avoids the heights and hastens to the lowlands, so an army avoids strength and strikes weakness. And as water has no constant form, there are in war no constant conditions." },
        { k: "cleary", t: "Military formation is like water—the form of water is to avoid the high and go to the low, the form of a military force is to avoid the full and attack the empty; the flow of water is determined by the earth, the victory of a military force is determined by the opponent. So a military force has no constant formation, water has no constant shape: the ability to gain victory by changing and adapting according to the opponent is called genius." },
        { k: "ames", t: "The positioning (hsing) of troops can be likened to water: Just as the flow of water avoids high ground and rushes to the lowest point, so on the path to victory avoid the enemy's strong points and strike where he is weak. Thus an army does not have fixed strategic advantages (shih) or an invariable position (hsing)." },
        { k: "denma", t: "Water determines its movement in accordance with the earth.\nThe military determines victory in accordance with the enemy." },
        { k: "minford", t: "Military dispositions\nTake form like water.\nWater shuns the high\nAnd hastens to the low,\nWar shuns the strong\nAnd attacks the weak.\n\nWar has no\nConstant dynamic;\nWater has no\nConstant form." },
        { k: "mair", t: "The form of a body of soldiers resembles that of water. Water's natural form is such that it avoids heights and rushes toward depths. The natural form of a body of soldiers is such that it avoids solidity and strikes at emptiness. Water produces currents in accordance with the terrain; soldiers produce victory in accordance with the enemy. Therefore, a body of soldiers has no constant configuration; a body of water has no constant form." }
      ]
    },
    {
      id: 14, ch: 10, chZh: "地形", chTitle: "Terrain",
      zh: "故曰：知彼知己，勝乃不殆；知天知地，勝乃可全。",
      v: [
        { k: "giles", t: "If you know the enemy and know yourself, your victory will not stand in doubt; if you know Heaven and know Earth, you may make your victory complete." },
        { k: "griffith", t: "Know the enemy, know yourself; your victory will never be endangered. Know the ground, know the weather; your victory will then be total." },
        { k: "cleary", t: "So it is said that when you know yourself and others, victory is not in danger; when you know sky and earth, victory is inexhaustible." },
        { k: "ames", t: "Know the other, know yourself,\nAnd the victory will not be at risk;\nKnow the ground, know the natural conditions,\nAnd the victory can be total." },
        { k: "denma", t: "Know the other and know oneself,\nThen victory is not in danger\nKnow earth and know heaven,\nThen victory can be complete." },
        { k: "minford", t: "Know the enemy,\nKnow yourself,\nAnd victory\nIs never in doubt,\nNot in a hundred battles.\n\nKnow Heaven,\nKnow Earth,\nAnd your victory\nIs complete." },
        { k: "mair", t: "If you know the enemy and know yourself, victory will not be at risk; if you know heaven and you know earth, your victories will be unlimited." }
      ]
    },
    {
      id: 15, ch: 13, chZh: "用間", chTitle: "The Use of Spies",
      zh: "故明君賢將，所以動而勝人，成功出於眾者，先知也。先知者，不可取於鬼神，不可象於事，不可驗於度，必取於人，知敵之情者也。",
      v: [
        { k: "giles", t: "Thus, what enables the wise sovereign and the good general to strike and conquer, and achieve things beyond the reach of ordinary men, is foreknowledge. Now this foreknowledge cannot be elicited from spirits; it cannot be obtained inductively from experience, nor by any deductive calculation. Knowledge of the enemy's dispositions can only be obtained from other men." },
        { k: "griffith", t: "Now the reason the enlightened prince and the wise general conquer the enemy whenever they move and their achievements surpass those of ordinary men is foreknowledge. What is called 'foreknowledge' cannot be elicited from spirits, nor from gods, nor by analogy with past events, nor from calculations. It must be obtained from men who know the enemy situation." },
        { k: "cleary", t: "So what enables an intelligent government and a wise military leadership to overcome others and achieve extraordinary accomplishments is foreknowledge. Foreknowledge cannot be gotten from ghosts and spirits, cannot be had by analogy, cannot be found out by calculation. It must be obtained from people, people who know the conditions of the enemy." },
        { k: "ames", t: "Thus the reason the farsighted ruler and his superior commander conquer the enemy at every move, and achieve successes far beyond the reach of the common crowd, is foreknowledge. Such foreknowledge cannot be had from ghosts and spirits, educed by comparison with past events, or verified by astrological calculations. It must come from people—people who know the enemy's situation." },
        { k: "denma", t: "Foreknowledge cannot be grasped from ghosts and spirits,\nCannot be inferred from events,\nCannot be projected from calculation.\nIt must be grasped from people's knowledge." },
        { k: "minford", t: "Prior information\nEnables wise rulers\nAnd worthy generals\nTo move\nAnd conquer,\nBrings them success\nBeyond that of the multitude.\n\nThis information\nCannot be obtained\nFrom spirits;\nIt cannot be deduced\nBy analogy;\nIt cannot be calculated\nBy measurement.\n\nIt can be obtained only\nFrom men,\nFrom those who know\nThe enemy's dispositions." }
      ]
    }
  ]
};
