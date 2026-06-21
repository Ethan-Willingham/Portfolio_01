/* gen-hubs.mjs  -  generate the four series hub index pages and rewrite the
   homepage's card list (lift the series posts into hubs, drop in four hub cards).
   Idempotent: safe to re-run any time, e.g. after flipping a member from soon to
   live. Run from the repo root: node tools/gen-hubs.mjs   Then re-run
   tools/wrap-picture.mjs on the four hubs + index.html to restore the WebP
   <picture> wrapping, and tools/build-search-index.mjs. No em dashes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Members carry an era (the "measurement" shown beside the title: when the text
   is from) and a numeric year used only to sort them. Each hub lists oldest
   first, so the era column reads top-to-bottom as a timeline. Live members come
   before the greyed "coming soon" ones. A live member is
   {href,title,thumb,era,year,desc}; a planned one is {title,era,year,desc,soon}.
   Titles are short and parallel so the list reads as a set; descriptions are
   written for a reader who has never heard of the book. */
const live = (href, title, thumb, era, year, desc) => ({ href, title, thumb, era, year, desc });
const soon = (title, era, year, desc) => ({ title, era, year, desc, soon: true });

const HUBS = [
  {
    slug: 'religion', title: 'Religion, the Sacred Books',
    card: { thumb: 'hebrew-bible.jpg', alt: 'An open Torah scroll on velvet with a silver pointer resting in front.',
      desc: 'The ten books billions live by, each in its own language against the great English translations, with the keystones broken down where the translators split.' },
    lead: 'The books billions live by, laid out oldest first, from the Hebrew Bible to the Guru Granth Sahib. Each scripture in its own language against the great English translations.',
    members: [
      live('hebrew-bible.html', 'The Hebrew Bible', 'hebrew-bible.jpg', 'c. 600 BCE', -600, "The Jewish scriptures, and the root of all three Western religions: creation, the exodus from Egypt, the law, and the prophets' demand for justice. Read here the way Judaism reads it, through argument and never alone."),
      live('analects.html', 'The Analects of Confucius', 'analects.jpg', 'c. 450 BCE', -450, "The sayings Confucius's students wrote down, the book that shaped Chinese, Korean, and Japanese life for two thousand years. Less about gods than about how to be a decent person: family, learning, and treating others as you would want to be treated."),
      live('tao-te-ching.html', 'The Tao Te Ching', 'tao-te-ching.jpg', 'c. 400 BCE', -400, "Taoism's founding book, written in China about 2,500 years ago: 81 short, riddling poems on living in harmony with the Tao, the nameless way behind all things. The most translated book after the Bible, here in two dozen English versions at once."),
      live('zhuangzi.html', 'The Zhuangzi', 'zhuangzi.jpg', 'c. 300 BCE', -300, "The other great Taoist classic, and the funny one. Wild little stories that puncture our certainty, like the man who dreams he is a butterfly and wakes unsure which he is, walked in Brook Ziporyn's translation."),
      live('dhammapada.html', 'The Dhammapada', 'dhammapada.jpg', 'c. 250 BCE', -250, "Buddhism's most loved little book, 423 verses of the Buddha's teaching in its plainest form: the mind makes the world, hatred is never ended by hatred, and the way out of suffering is to want less. Seven English translations side by side."),
      live('gita.html', 'The Bhagavad Gita', 'gita.jpg', 'c. 100 BCE', -100, "Hinduism's best-known scripture. On the edge of a battle, a warrior loses his nerve, and his charioteer, who turns out to be God, talks him through how to act in a world of duty and loss. All 700 verses, including the line Oppenheimer quoted at the first atomic test."),
      live('new-testament.html', 'The New Testament', 'new-testament.jpg', 'c. 70 CE', 70, "The Christian scriptures: the life and teaching of Jesus, his death and resurrection, and the letters of Paul that built a religion. Sixteen keystone passages in the Greek against nine English translations, from the one Tyndale was burned at the stake for to today."),
      live('nagarjuna.html', "Nagarjuna's Middle Way", 'nagarjuna.jpg', 'c. 150 CE', 150, "The deepest book in Buddhist philosophy, from about 150 CE. Its argument is that nothing, including you, exists on its own, and that this emptiness is not bleak but the very thing that lets anything change or ever be set free."),
      live('quran.html', 'The Quran', 'quran.jpg', '632 CE', 632, "Islam's holy book, believed to be the literal words of God given to Muhammad in Arabic, which Muslims hold cannot truly be translated. Fourteen keystone passages in the Arabic against seven English versions, each only an interpretation of the meaning."),
      live('guru-granth-sahib.html', 'The Guru Granth Sahib', 'guru-granth-sahib.jpg', '1604', 1604, "The scripture of Sikhism, and the strangest case here: Sikhs treat the book itself as their living teacher, enthroned rather than merely read. One God, honest work, and the radical welcome of Hindu and Muslim saints into its own pages."),
      live('wisdom-never-written-down.html', 'The Wisdom Never Written Down', 'wisdom-never-written-down.jpg', 'oral, ancient', -3000, "A books series can only hold what was written. Here is the wisdom that was sung, spoken, and carved instead."),
    ],
  },
  {
    slug: 'philosophy', title: 'Philosophy and Science',
    card: { thumb: 'aristotle.jpg', alt: "Rembrandt's painting of Aristotle resting a hand on a bust of Homer.",
      desc: 'How to think and what is real, from Plato and Aristotle to Darwin and Deutsch, each argument walked one move at a time, the dissenters kept in.' },
    lead: 'How to think, and what is real, in the order it was argued. From the ancient Greeks through the Enlightenment to modern science, with the dissenters kept in the room.',
    members: [
      live('plato.html', 'Plato', 'plato.jpg', 'c. 380 BCE', -380, "Western philosophy starts here, in ancient Athens. Socrates is put to death for asking too many questions, and his student Plato leaves us the most famous image in all of philosophy: prisoners in a cave who mistake shadows on the wall for the real world."),
      live('aristotle.html', 'Aristotle', 'aristotle.jpg', 'c. 340 BCE', -340, "Plato's student, and maybe the most influential thinker who ever lived. His Ethics takes up the oldest question, what makes a good life, and answers that happiness is not a feeling but a whole life lived well, built one good habit at a time."),
      live('meditations.html', 'Marcus Aurelius', 'marcus-aurelius.jpg', 'c. 175 CE', 175, "The private journal of a Roman emperor, written to himself and never meant for anyone to read. The most powerful man alive, reminding himself to stay humble, to control only what he can, and to remember he will soon be dead. Stoicism, lived."),
      live('social-contract.html', 'Hobbes, Locke, and Rousseau', 'social-contract.jpg', '1651-1762', 1651, "The question that built the modern world: why should anyone obey the government at all? Three thinkers imagine life with no state, then argue their way to very different answers, the seeds of the dictator, of human rights, and of democracy."),
      live('marx.html', 'Karl Marx', 'marx.jpg', '1848', 1848, "Whatever you make of him, one of the most world-changing books ever written. Marx's argument that history runs on class struggle and that capitalism breeds its own gravediggers, walked honestly, next to the catastrophe carried out in his name."),
      live('mill.html', 'John Stuart Mill', 'mill.jpg', '1859', 1859, "The 1859 case for freedom that still shapes how we argue about it: the only reason to stop an adult from doing something is to keep them from harming someone else. With the strongest defense of free speech ever written."),
      live('darwin.html', 'Charles Darwin', 'darwin.jpg', '1859', 1859, "The most important science book of the modern age. A pocket watch found in the dirt needs a watchmaker; an eye, Darwin shows, does not. How the endless design of living things builds itself, with no designer at all, given enough time."),
      live('nietzsche.html', 'Nietzsche', 'nietzsche.jpg', '1886', 1886, "The great wrecking ball. God is dead, he announced, and our morals are not eternal truth but a clever revolt of the weak against the strong. The shelf's resident dissenter, here to attack what all the other books quietly agree on."),
      live('case-for-god.html', 'Can You Argue Your Way to God?', 'case-for-god.jpg', '1660 & 1952', 1952, "The two most famous arguments that you should believe in God, each built at full strength. Pascal says bet on God, the math favors it; C.S. Lewis says you cannot call Jesus a mere moral teacher. Both are brilliant, and both have a famous hole."),
      live('beginning-of-infinity.html', 'David Deutsch', 'beginning-of-infinity.jpg', '2011', 2011, "A living physicist's case for radical optimism. A good explanation is one that is hard to vary, and from that single test he argues that human knowledge has no built-in limit and that people are the most significant things in the universe."),
      soon('Euclid', 'c. 300 BCE', -300, "Two thousand years of certainty from one little book: where the idea of proving something true, step by airtight step, was born."),
      soon('Kant', '1785', 1785, "The other giant of modern philosophy, and the single rule he tried to build all of morality on: act only as you could wish everyone would act."),
      live('camus.html', 'Albert Camus', 'camus.jpg', '1942', 1942, "The one question he thought serious is whether life is worth living. If the universe hands us no built-in meaning, Camus says, the honest answer is revolt: refuse the exit of suicide and the comfort of faith alike, and live fully anyway, eyes open, picturing Sisyphus happy at the foot of his hill. The companion piece to Frankl, arguing the other way."),
      live('sapiens.html', 'Sapiens', 'sapiens.jpg', '2011', 2011, "A weak ape took over the planet, Yuval Noah Harari argues, by believing in shared fictions, money, gods, nations, that let total strangers cooperate. The decade's most gripping history, handled with a skeptic's eye."),
    ],
  },
  {
    slug: 'inner-life', title: 'The Inner Life',
    card: { thumb: 'meditation.jpg', alt: 'A Chola-period granite statue of the Buddha seated in meditation.',
      desc: 'Meaning, the mind, and how to bear a life: Frankl, the spirituality of imperfection, and the truth about every kind of meditation.' },
    lead: 'Meaning, the mind, and how to bear a life, laid out oldest first: the practices, the great consolations, the psychology of contentment, and the honest cases of a search gone wrong.',
    members: [
      live('meditation.html', 'Meditation, Honestly', 'meditation.jpg', 'ancient', -500, "Every kind of meditation in one place, with the hype stripped off: what TM, mindfulness, Zen, and the rest actually are, what the evidence really shows they do and do not do, and how to actually begin, today."),
      live('chemical-path.html', 'The Chemical Path', 'chemical-path.jpg', 'ancient + now', -499, "The oldest shortcut to the mystical experience is a drug, and science is rediscovering it. The old traditions, Huxley's Doors of Perception, the new psilocybin research, and the real risks, all in one place."),
      live('fox.html', 'Emmet Fox', 'fox.jpg', '1934', 1934, "A 1934 reading of the Sermon on the Mount as practical mind-power, not a moral scolding: change your thinking and you change your life. The book early AA passed hand to hand before it had one of its own."),
      live('frankl.html', 'Viktor Frankl', 'frankl.jpg', '1946', 1946, "A psychiatrist who came through the Nazi camps with one lesson: the men who held on were the ones who kept a reason to live. Meaning, not pleasure or power, is what we are really after, and it stays within reach even in suffering."),
      live('cults-the-cage.html', 'When a Path Becomes a Cage', 'cults-the-cage.jpg', 'modern', 1978, "How a search for meaning hardens into a cult: first the thought-reform playbook, then the cases, from Scientology to Jonestown. A clearly labeled case study, not an endorsement."),
      live('cults-business.html', 'When a Path Becomes a Business', 'cults-business.jpg', 'modern', 1979, "The other failure mode, spirituality with a price tag: est and Landmark, A Course in Miracles, the prosperity gospel, and the line where teaching ends and selling begins."),
      live('spirituality-of-imperfection.html', 'The Spirituality of Imperfection', 'spirituality-of-imperfection.jpg', '1992', 1992, "A quiet modern classic stitched together from stories across every tradition. To be human is to be imperfect, and the cracks are where the spiritual life actually starts, not a flaw to fix first. The book that ties this whole shelf together."),
      live('get-used-to-everything.html', 'Getting Used to Everything', 'get-used-to-everything.jpg', 'modern', 2026, "Why the new car stops thrilling you and grief slowly lifts, while a loud commute never stops grating. A field guide to habituation: what you adapt to, what you never do, and the one lever you really get, choosing what to get used to."),
      live('william-james.html', 'William James', 'william-james.jpg', '1902', 1902, "The 1902 book behind Alcoholics Anonymous. A scientist takes religious experience seriously as evidence, studying conversions and mystical states by what they actually do in a person's life, not by whether their creeds are true."),
      live('perennial-philosophy.html', 'The Perennial Philosophy', 'perennial-philosophy.jpg', '1945', 1945, "Aldous Huxley's claim that underneath every religion lies one shared truth, assembled from the mystics of every tradition. Almost the secret thesis of this whole shelf, pressure-tested for where it overreaches."),
      live('modern-teachers.html', 'The Modern Teachers', 'modern-teachers.jpg', '20th c.', 1965, "How the East got sold to the West in the twentieth century, by five charismatic teachers from Alan Watts to Eckhart Tolle, each keeping one big idea: you are it, be here now, wake up. Plus the honest problem of the guru who turns out to be a fraud, and how to keep the teaching without the teacher."),
    ],
  },
  {
    slug: 'power-story-love', title: 'Power, Story, and Love',
    card: { thumb: 'odyssey.jpg', alt: 'The Siren Vase: Odysseus lashed to the mast as bird-bodied Sirens fly around his ship.',
      desc: 'The human dramas: the Art of War on winning without fighting, the Odyssey on getting home, with power, story, and love still to come.' },
    lead: 'The human dramas, oldest first: the founding adventure of the West, the oldest book on strategy, and the great arguments about power, desire, and beauty still to come.',
    members: [
      live('odyssey.html', 'The Odyssey', 'odyssey.jpg', 'c. 700 BCE', -700, "The founding adventure story of the West. A soldier spends ten years trying to get home from a war, through monsters, witches, and the sea, winning by cunning more than force. Walked one monster at a time in Emily Wilson's translation."),
      live('art-of-war.html', 'The Art of War', 'art-of-war.jpg', 'c. 500 BCE', -500, "The oldest and most famous book on strategy, from China 2,500 years ago, and its central lesson is a twist: the best way to win is never to fight at all. Read everywhere now, from boardrooms to ballfields. Seven translations side by side."),
      live('symposium.html', 'The Symposium', 'symposium.jpg', 'c. 385 BCE', -385, "Plato's dinner party on love, climbing from drunken jokes to the sublime, and the source of Platonic love, which almost nobody has right. Where the idea that you have an other half comes from."),
      live('kama-sutra.html', 'The Kama Sutra', 'kama-sutra.jpg', 'c. 300 CE', 300, "The most misunderstood book in the world: not a sex manual but a guide to living well, of which desire is one civilized art. The prudish Victorian translation that made it a scandal, set against an honest modern one."),
      live('machiavelli.html', 'The Prince', 'machiavelli.jpg', '1532', 1532, "Machiavelli's blunt manual on power as it really is, not as it ought to be: a ruler who insists on staying good among the wicked will be destroyed, so he must learn how not to be. The book that turned a man's name into an insult, walked one cold lesson at a time."),
      live('grand-inquisitor.html', 'The Grand Inquisitor', 'grand-inquisitor.jpg', '1880', 1880, "The most powerful argument against God ever written, buried inside a Russian novel. Christ returns to earth, and the Church arrests him, for the crime of handing people a freedom they cannot bear."),
      live('in-praise-of-shadows.html', 'In Praise of Shadows', 'in-praise-of-shadows.jpg', '1906-1933', 1933, "A Japanese reply to Western taste: beauty lives in shadow, age, and imperfection, not in bright light and the brand new. Wabi-sabi, explained through a dim room and a cup of tea."),
    ],
  },
  {
    slug: 'staying-alive', title: 'Staying Alive',
    card: { thumb: 'big-enough.jpg', alt: 'The bowed bearded head and massive shoulders of the Farnese Hercules, an ancient marble statue.',
      desc: 'How to take care of the one body you get: muscle, the heart, food, sleep, and the rest, plus how long a human can really live. The actionable science, with the hype stripped off.' },
    lead: 'Taking care of the one body you get, from muscle and the heart to food, sleep, and how long a human can really live. The actionable health science, sorted from what is settled to what is merely sold.',
    members: [
      live('big-enough.html', 'Big Enough', 'big-enough.jpg', 'muscle', 1, "How to build muscle the natural way, and the harder skill of knowing when to stop. One supplement that works, real food, enough sleep, and a last ten percent that costs twice the effort for a result almost nobody will notice."),
      live('still-moving.html', 'Still Moving', 'still-moving.jpg', 'the heart', 2, "The two thirds of fitness lifting leaves out: cardio and stretching. How fit your heart is predicts how long you live better than almost anything, most stretching is wasted motion, and a small dose buys nearly all of the benefit."),
      live('what-to-eat.html', "What You're Supposed to Eat", 'what-to-eat.jpg', 'food', 3, "What to eat, sorted from the settled to the sold. Weight is just energy, health is mostly real food, and every famous diet ties when you actually test it. The few things that are true, and the long aisle of things that are not."),
      live('the-other-hours.html', 'The Other Hours', 'the-other-hours.jpg', 'the rest', 4, "Everything that decides your health but is not the gym or the kitchen: sleep, the people you love, what you breathe and drink, the medical numbers that save lives, and the recovery rituals that mostly do not work. Ranked biggest lever first."),
      live('how-long-can-you-live.html', 'How Long Can You Live?', 'how-long-can-you-live.jpg', 'the limit', 5, "The hard wall at 120 is unproven, the oldest-age records are riddled with missing paperwork and pension fraud, and the thing that actually adds years is the one nobody calls a hack. How long a human can last, and why."),
    ],
  },
];

/* oldest first, live before coming-soon */
const ordered = (members) => [...members].sort((a, b) => (a.soon ? 1 : 0) - (b.soon ? 1 : 0) || a.year - b.year);

/* ---- render a hub page ----------------------------------------------------- */
const memberCard = (m) => m.soon
  ? `        <li class="article-list-item">
          <div class="article-item is-soon">
            <span class="article-item-era">${m.era}</span>
            <h2 class="article-item-title">${m.title}<span class="soon-tag">coming soon</span></h2>
            <p class="article-item-description">${m.desc}</p>
          </div>
        </li>`
  : `        <li class="article-list-item fade-in">
          <a class="article-item" href="${m.href}">
            <span class="article-item-thumb"><img src="assets/thumbs/${m.thumb}" width="600" height="400" loading="lazy" decoding="async" alt=""></span>
            <span class="article-item-era">${m.era}</span>
            <h2 class="article-item-title">${m.title}</h2>
            <p class="article-item-description">${m.desc}</p>
          </a>
        </li>`;

const hubPage = (h) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${h.title} | Ethan Willingham</title>
  <meta name="description" content="${h.lead}">
  <meta property="og:title" content="${h.title}">
  <meta property="og:description" content="${h.lead}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ethan Willingham">
  <meta property="og:url" content="https://ethanwillingham.com/${h.slug}.html">
  <meta property="og:image" content="https://ethanwillingham.com/assets/thumbs/${h.card.thumb}">
  <link rel="preload" href="assets/fonts/century_supra_a_regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="collection.css">
</head>
<body>
  <div class="site-wrapper">
    <header class="site-header">
      <h1 class="site-name">${h.title}</h1>
      <p class="site-tagline">${h.lead}</p>
      <div class="home-search">
        <div class="hs-field-wrap">
          <label class="hs-field">
            <svg class="hs-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><line x1="15.6" y1="15.6" x2="21" y2="21" stroke-linecap="round"/></svg>
            <input class="hs-input" type="search" data-search-scope="${h.slug}" placeholder="Search these posts" aria-label="Search ${h.title}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="hs-panel" aria-autocomplete="list" aria-haspopup="listbox">
          </label>
          <div class="hs-panel" id="hs-panel" role="listbox" aria-label="Search results"></div>
        </div>
        <span class="hs-links">
          <a class="hs-about" href="/">Home</a>
          <a class="hs-about" href="about.html">About</a>
        </span>
      </div>
      <p class="hs-readout" role="status" aria-live="polite"></p>
    </header>
    <main>
      <ul class="article-list">
${ordered(h.members).map(memberCard).join('\n')}
      </ul>
    </main>
    <footer class="site-footer">
      <div class="site-footer-inner"><a href="/">&copy; 2026 Ethan Willingham</a></div>
    </footer>
  </div>
  <script src="js/search.js"></script>
  <script>
  (function () { var root = document.querySelector('.home-search'); var input = root && root.querySelector('.hs-input'); if (!input) return; input.addEventListener('focus', function () { root.classList.add('is-open'); }); input.addEventListener('blur', function () { setTimeout(function () { if (!input.value && !root.contains(document.activeElement)) root.classList.remove('is-open'); }, 160); }); })();
  </script>
  <script src="js/backtotop.js"></script>
</body>
</html>
`;

HUBS.forEach((h) => { writeFileSync(join(ROOT, h.slug + '.html'), hubPage(h)); console.log('wrote', h.slug + '.html', '(' + h.members.filter((m) => !m.soon).length + ' live, ' + h.members.filter((m) => m.soon).length + ' soon)'); });

/* ---- homepage surgery: drop series + old hub cards, drop in four collection
   cards. REMOVE includes the hub slugs so re-running never doubles them. ------- */
const REMOVE = new Set([
  ...HUBS.flatMap((h) => h.members.filter((m) => !m.soon).map((m) => m.href)),
  ...HUBS.map((h) => h.slug + '.html'),
]);
const hubHomeCard = (h) => {
  const n = h.members.filter((m) => !m.soon).length;
  return `        <li class="article-list-item fade-in">
          <a class="article-item is-collection" href="${h.slug}.html">
            <span class="article-item-thumb"><img src="assets/thumbs/${h.card.thumb}" width="600" height="400" loading="eager" decoding="async" alt="${h.card.alt}"></span>
            <span class="article-item-date">Collection &middot; ${n} posts</span>
            <h2 class="article-item-title">${h.title}</h2>
            <p class="article-item-description">${h.card.desc}</p>
          </a>
        </li>`;
};

let idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
const allLis = idx.match(/<li class="article-list-item[\s\S]*?<\/li>/g) || [];
let removed = 0;
const keptLis = allLis.filter((li) => {
  const href = (li.match(/href="([^"]+)"/) || [])[1];
  if (href && REMOVE.has(href)) { removed++; return false; }
  return true;
});
const newList = HUBS.map(hubHomeCard).join('\n') + '\n' + keptLis.join('\n');
idx = idx.replace(/<ul class="article-list">[\s\S]*?<\/ul>/, '<ul class="article-list">\n' + newList + '\n      </ul>');
writeFileSync(join(ROOT, 'index.html'), idx);
console.log('homepage: removed ' + removed + ' series/old-hub cards, kept ' + keptLis.length + ', added ' + HUBS.length + ' collection cards');
