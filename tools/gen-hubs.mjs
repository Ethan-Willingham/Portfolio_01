/* gen-hubs.mjs  -  generate the collection hub pages, the Longform collection
   page, and rewrite the homepage's card list (lift the collection's posts off
   the homepage; the collection itself is a header link, not a card).
   Idempotent: safe to re-run any time, e.g. after flipping a member from soon to
   live. Run from the repo root: node tools/gen-hubs.mjs   Then re-run
   tools/wrap-picture.mjs on the hubs + shelf + index.html to restore the WebP
   <picture> wrapping, and tools/build-search-index.mjs. No em dashes.
   Also the source of truth for collection membership: tools/gen-post-nav.mjs
   imports HUBS/SHELF from here to stamp each member post's endcap nav, so
   importing this module must stay side-effect free (writes run only when the
   file is executed directly, see the isMain guard at the bottom). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Members carry an era (the "measurement" shown beside the title: when the text
   is from) and a numeric year used only to sort them. Each hub lists oldest
   first, so the era column reads top-to-bottom as a timeline. Live members come
   before the greyed "coming soon" ones. A live member is
   {href,title,thumb,era,year,desc}; a planned one is {title,era,year,desc,soon}.
   A hub marked inProgress is not carded on the Longform shelf. Its page carries
   the amber in-progress banner and its members are flagged in the search index,
   so the collection reads as unfinished instead of finished. Its posts stay live
   at their normal URLs; nothing moves into /archive.
   Titles are short and parallel so the list reads as a set; descriptions are
   written for a reader who has never heard of the book. */
const live = (href, title, thumb, era, year, desc) => ({ href, title, thumb, era, year, desc });
const soon = (title, era, year, desc) => ({ title, era, year, desc, soon: true });

const HUBS = [
  {
    slug: 'religion', title: 'The Sacred Books',
    card: { thumb: 'guru-granth-sahib.jpg', alt: 'An illuminated page of the Guru Granth Sahib, with Gurmukhi script framed by orange, blue, and gold flowers.',
      desc: "Read beyond the familiar verses. From the Torah to the Guru Granth Sahib, these posts follow what each book says and where its English translations disagree." },
    lead: "Most of us know these books by a few famous lines. These readings follow the stories and ideas around them, including the difficult passages and disagreements over translation.",
    members: [
      live('hebrew-bible.html', 'The Torah', 'hebrew-bible.jpg', "Genesis to Deuteronomy", -600, "A family becomes a people, escapes slavery, and receives a law. The Torah follows them to the edge of the promised land, where Moses dies before they enter."),
      live('analects.html', 'The Analects of Confucius', 'analects.jpg', "Sayings and conversations", -450, "How do you become someone other people can rely on? Confucius works through that question in brief conversations about learning, family duties, and the conduct of rulers."),
      live('tao-te-ching.html', 'The Tao Te Ching', 'tao-te-ching.jpg', "81 short chapters", -400, "Water takes the low ground; a good ruler knows when to stop interfering. The Tao Te Ching asks how much of our trouble comes from trying too hard."),
      live('dhammapada.html', 'The Dhammapada: A Reading Guide', 'dhammapada.jpg', "Buddhist verses; date uncertain", -250, "Reciting a teaching gets you little if you never practice it. These Buddhist verses return to what we do with anger and desire, and how suffering can end."),
      live('gita.html', 'The Bhagavad Gita: A Guided Reading', 'gita.jpg', "Late BCE to early CE", -100, "Arjuna puts down his bow rather than fight his relatives. Krishna's answer joins duty with devotion and freedom from attachment, then persuades him to fight."),
      live('new-testament.html', 'The New Testament', 'new-testament.jpg', '1st to 2nd c. CE', 70, "Paul's letters came before the Gospels. Read the accounts of Jesus alongside the disputes in the early churches, where questions about faith and belonging were already urgent."),
      live('nagarjuna.html', 'Nagarjuna and the Emptiness of Everything', 'nagarjuna.jpg', 'c. 150 CE', 150, "If suffering had a fixed nature, it could never end. Nagarjuna calls things empty because they depend on conditions, and uses that argument to explain how change is possible."),
      live('quran.html', 'The Quran', 'quran.jpg', '632 CE', 632, "The Quran opens with a prayer, then the laws of a community. Its chapters weave ordinary duties into warnings of judgment; their order often hides how the teaching developed."),
      live('guru-granth-sahib.html', 'The Guru Granth Sahib', 'guru-granth-sahib.jpg', '1604', 1604, "This book is opened each morning and put to rest at night. Sikhs receive its hymns as their Guru, with devotion expressed through honest work and service."),
    ],
  },
  {
    slug: 'philosophy', title: "How to Think, and What's Real", inProgress: true,
    card: { thumb: 'aristotle.jpg', alt: "Rembrandt's painting of Aristotle resting a hand on a bust of Homer.",
      desc: "What can we know, and how should we live? Read the arguments from Plato to David Deutsch, with enough of the original text to judge them for yourself." },
    lead: "What makes a good life? What gives a government the right to rule? These readings follow the answers closely enough that you can see where you agree, and where you don't.",
    members: [
      live('plato.html', 'Plato', 'plato.jpg', 'c. 380 BCE', -380, "Socrates refuses to escape his death sentence. Plato's cave asks why someone who has seen beyond the shadows should go back. Both put a cost on examining your life."),
      live('aristotle.html', 'Aristotle', 'aristotle.jpg', 'c. 340 BCE', -340, "Aristotle treats happiness as something you do across a life. His Ethics asks how habits and judgment help us live well, and why friendship belongs in the answer."),
      live('meditations.html', 'Marcus Aurelius', 'marcus-aurelius.jpg', 'c. 175 CE', 175, "The Roman emperor reminds himself to get out of bed and stop resenting people. His notebook shows someone repeatedly practicing the advice he's still struggling to follow."),
      live('social-contract.html', 'Hobbes, Locke, and Rousseau', 'social-contract.jpg', '1651-1762', 1651, "Imagine living without a government. Hobbes sees danger, Locke sees rights, and Rousseau asks how people can rule themselves. Their answers give the state very different limits."),
      live('marx.html', 'Karl Marx', 'marx.jpg', '1848', 1848, "Work creates wealth. Marx asks who gets to keep it, then argues that capitalism produces the class that will overthrow it. Read the claim alongside what it failed to predict."),
      live('mill.html', 'John Stuart Mill', 'mill.jpg', '1859', 1859, "Your own good isn't enough reason for someone to force you. Mill draws the line at harm to others, then tests it against unpopular speech and unconventional lives."),
      live('darwin.html', 'Charles Darwin', 'darwin.jpg', '1859', 1859, "Useful inherited differences can accumulate over generations. Darwin's argument explains how living things become suited to their surroundings, including organs that seem too complicated to have developed gradually."),
      live('nietzsche.html', 'Nietzsche', 'nietzsche.jpg', '1886', 1886, "Who benefits when humility becomes a virtue? Nietzsche traces moral judgments back to the people making them and asks whether some of our admired qualities work against life."),
      live('case-for-god.html', 'Can You Argue Your Way to God?', 'case-for-god.jpg', '1660 & 1952', 1952, "Pascal treats belief as a wager. C.S. Lewis argues from Jesus's claims about himself. Follow both arguments, then look at the assumptions each needs you to accept."),
      live('beginning-of-infinity.html', 'David Deutsch', 'beginning-of-infinity.jpg', '2011', 2011, "An explanation that fits anything explains little. David Deutsch starts with explanations that are hard to vary and builds a case that our capacity to learn has no fixed limit."),
      live('euclid.html', 'Euclid', 'euclid.jpg', 'c. 300 BCE', -300, "Euclid starts with a few definitions and assumptions, then proves what follows. The Elements lets you watch geometry being built, with each claim depending on the ones before it."),
      live('kant.html', 'Kant', 'kant.jpg', '1785', 1785, "A lying promise works only while people still trust promises. Kant uses that problem to test moral rules: could you accept everyone acting on the same principle?"),
      live('camus.html', 'Albert Camus', 'camus.jpg', '1942', 1942, "We want life to make sense; the world offers no clear answer. Camus asks how to keep living without pretending that this gap has been resolved."),
      live('sapiens.html', 'Sapiens, Read Skeptically', 'sapiens.jpg', '2011', 2011, "Money works because strangers trust the same story about it. Harari uses that kind of shared belief to explain human cooperation. This reading checks the larger claims against the evidence."),
    ],
  },
  {
    slug: 'inner-life', title: 'The Inner Life', inProgress: true,
    card: { thumb: 'meditation.jpg', alt: 'A Chola-period granite statue of the Buddha seated in meditation.',
      desc: 'Meaning, the mind, and how to bear a life: Frankl, the spirituality of imperfection, and the truth about every kind of meditation.' },
    lead: 'Meaning, the mind, and how to bear a life, laid out oldest first: the practices, the great consolations, the psychology of contentment, and the honest cases of a search gone wrong.',
    members: [
      live('meditation.html', 'Meditation, Mapped', 'meditation.jpg', 'ancient', -500, "Every kind of meditation in one place, with the hype stripped off: what TM, mindfulness, Zen, and the rest actually are, what the evidence really shows they do and do not do, and how to actually begin, today."),
      live('chemical-path.html', 'The Chemical Path', 'chemical-path.jpg', 'ancient + now', -499, "The oldest shortcut to the mystical experience is a drug, and science is rediscovering it. The old traditions, Huxley's Doors of Perception, the new psilocybin research, and the real risks, all in one place."),
      live('fox.html', 'Emmet Fox', 'fox.jpg', '1934', 1934, "A 1934 reading of the Sermon on the Mount as practical mind-power, not a moral scolding: change your thinking and you change your life. The book early AA passed hand to hand before it had one of its own."),
      live('frankl.html', 'Viktor Frankl', 'frankl.jpg', '1946', 1946, "A psychiatrist who came through the Nazi camps with one lesson: the men who held on were the ones who kept a reason to live. Meaning, not pleasure or power, is what we are really after, and it stays within reach even in suffering."),
      live('cults-the-cage.html', 'When a Path Becomes a Cage', 'cults-the-cage.jpg', 'modern', 1978, "How a search for meaning hardens into a cult: first the thought-reform playbook, then the cases, from Scientology to Jonestown. A clearly labeled case study, not an endorsement."),
      live('cults-business.html', 'When a Path Becomes a Business', 'cults-business.jpg', 'modern', 1979, "The other failure mode, spirituality with a price tag: est and Landmark, A Course in Miracles, the prosperity gospel, and the line where teaching ends and selling begins."),
      live('spirituality-of-imperfection.html', 'The Spirituality of Imperfection', 'spirituality-of-imperfection.jpg', '1992', 1992, "A quiet modern classic stitched together from stories across every tradition. To be human is to be imperfect, and the cracks are where the spiritual life actually starts, not a flaw to fix first. The book that ties this whole shelf together."),
      live('william-james.html', 'William James', 'william-james.jpg', '1902', 1902, "The 1902 book behind Alcoholics Anonymous. A scientist takes religious experience seriously as evidence, studying conversions and mystical states by what they actually do in a person's life, not by whether their creeds are true."),
      live('perennial-philosophy.html', 'The Perennial Philosophy', 'perennial-philosophy.jpg', '1945', 1945, "Aldous Huxley's claim that underneath every religion lies one shared truth, assembled from the mystics of every tradition. Almost the secret thesis of this whole shelf, pressure-tested for where it overreaches."),
      live('modern-teachers.html', 'The Modern Teachers: How the East Got Sold to the West', 'modern-teachers.jpg', '20th c.', 1965, "How the East got sold to the West in the twentieth century, by five charismatic teachers from Alan Watts to Eckhart Tolle, each keeping one big idea: you are it, be here now, wake up. Plus the honest problem of the guru who turns out to be a fraud, and how to keep the teaching without the teacher."),
    ],
  },
  {
    slug: 'power-story-love', title: 'Power, Story, and Love', inProgress: true,
    card: { thumb: 'symposium.jpg', alt: "A detail of Anselm Feuerbach's Das Gastmahl, a torch-lit procession of garlanded revelers entering a feast.",
      desc: "A long trip home, a dinner party about love, and advice for keeping power. Homer, Plato, Machiavelli, and the others are often stranger than the lines people quote." },
    lead: "Odysseus is trying to get home. The Prince asks how a ruler keeps power. From epic poems to advice on love, these books pay close attention to what people do when they want something.",
    members: [
      live('odyssey.html', 'The Odyssey, the Long Way Home', 'odyssey.jpg', 'c. 700 BCE', -700, "Odysseus survives by lying, waiting, and knowing when to act. Getting back to Ithaca takes more than crossing the sea: he has to recover his place at home."),
      live('art-of-war.html', 'The Art of War, Side by Side', 'art-of-war.jpg', 'c. 500 BCE', -500, "A victory can cost more than it gains. Sun Tzu asks how preparation and knowledge can make fighting unnecessary, with English translations that reveal how much interpretation the advice needs."),
      live('symposium.html', "A dinner party turns into competing explanations of love. Plato gives us the search for an other half, then a stranger proposal: desire can lead beyond any one person."),
      live('kama-sutra.html', 'The Kama Sutra, Side by Side', 'kama-sutra.jpg', 'c. 300 CE', 300, "Courtship and marriage occupy much of this book on pleasure. Put the Victorian and modern translations together and you can see how differently they describe the same social world."),
      live('machiavelli.html', 'The Prince, Power Without the Moralizing', 'machiavelli.jpg', '1532', 1532, "A ruler can look merciful and leave people worse off. Machiavelli judges political choices by what they secure, including the cruel ones, and asks how power is kept."),
      live('grand-inquisitor.html', 'The Grand Inquisitor', 'grand-inquisitor.jpg', '1880', 1880, "Jesus returns to Seville, and the Church has him arrested. Dostoevsky's Inquisitor argues that people would rather be fed and told what to believe than be free."),
      live('in-praise-of-shadows.html', 'In Praise of Shadows', 'in-praise-of-shadows.jpg', '1906-1933', 1933, "A lacquer bowl looks different in a dim room. Tanizaki asks what electric light has cost Japanese beauty; Okakura approaches related questions through the preparation and drinking of tea."),
    ],
  },
  {
    slug: 'staying-alive', title: 'Staying Alive', inProgress: true,
    card: { thumb: 'big-enough.jpg', alt: 'The bowed bearded head and massive shoulders of the Farnese Hercules, an ancient marble statue.',
      desc: 'How to take care of the one body you get: muscle, the heart, food, sleep, and the rest, plus how long a human can really live. The actionable science, with the hype stripped off.' },
    lead: 'Taking care of the one body you get, from muscle and the heart to food, sleep, and how long a human can really live. The actionable health science, sorted from what is settled to what is merely sold.',
    members: [
      live('big-enough.html', 'Big Enough: How Much Muscle Is Actually Worth Building', 'big-enough.jpg', 'muscle', 1, "How to build muscle the natural way, and the harder skill of knowing when to stop. One supplement that works, real food, enough sleep, and a last ten percent that costs twice the effort for a result almost nobody will notice."),
      live('still-moving.html', 'Still Moving: The Two Thirds of Fitness Lifting Leaves Out', 'still-moving.jpg', 'the heart', 2, "The two thirds of fitness lifting leaves out: cardio and stretching. How fit your heart is predicts how long you live better than almost anything, most stretching is wasted motion, and a small dose buys nearly all of the benefit."),
      live('what-to-eat.html', "What You're Supposed to Eat", 'what-to-eat.jpg', 'food', 3, "What to eat, sorted from the settled to the sold. Weight is just energy, health is mostly real food, and every famous diet ties when you actually test it. The few things that are true, and the long aisle of things that are not."),
      live('the-other-hours.html', 'The Other Hours: Health Outside the Gym and the Kitchen', 'the-other-hours.jpg', 'the rest', 4, "Everything that decides your health but is not the gym or the kitchen: sleep, the people you love, what you breathe and drink, the medical numbers that save lives, and the recovery rituals that mostly do not work. Ranked biggest lever first."),
      live('how-long-can-you-live.html', 'How Long Can You Live?', 'how-long-can-you-live.jpg', 'the limit', 5, "The hard wall at 120 is unproven, the oldest-age records are riddled with missing paperwork and pension fraud, and the thing that actually adds years is the one nobody calls a hack. How long a human can last, and why."),
      live('the-body-rhymes.html', 'The Body Rhymes', 'the-body-rhymes.jpg', 'both ends', 6, "The normal-but-startling things the body does at the very start and end of life, set as mirror pairs, from a newborn running on its mother's hormones to the reflex you lose as a toddler and regain only if your brain fails. Why the two ends rhyme."),
    ],
  },
  {
    slug: 'career', title: 'Career',
    card: { thumb: 'all-in.jpg', alt: "Two oarsmen in Thomas Eakins's painting The Biglin Brothers Racing pull in unison across calm water.",
      desc: "How to manage a team, run a warehouse with software, and keep a customer after the sale. Guides built around the problems that come up at work." },
    lead: "Hiring good people, getting software to work on a warehouse floor, and helping a customer get what they paid for. Notes from the work I know.",
    members: [
      live('all-in.html', "People can meet every requirement and still hold back their best work. Managing professionals means making room for judgment while staying clear about responsibility and the problems you need solved."),
      live('warehouse.html', "Stock on a shelf may already belong to another order. Warehouse software tracks what's available and directs each move, from receiving a delivery to putting a parcel on a truck."),
      live('customer-success.html', "The software is live, but a supervisor still copies orders into a spreadsheet. Customer success starts by finding that gap and helping the customer get the result they bought."),
    ],
  },
];

const SHELF = {
  path: 'boring-stuff',
  title: 'Longform',
  /* the Admont library image (owner reimaged it 2026-07-12: the library, not
     the vegetables). Now used only for the collection page's og:image; the
     homepage links to the collection with a header link instead of carding it. */
  thumb: 'boring-stuff.jpg',
  credit: 'thumbnail: Admont Abbey Library, Austria; photo by Jorge Royan, CC BY-SA 3.0, via Wikimedia Commons.',
  alt: 'The white-and-gold Baroque hall of the Admont Abbey Library in Austria, its shelves of books beneath a painted ceiling fresco.',
  cardDesc: "Longer readings on old books and the work of everyday life. Pick a collection, or start with a question you already have.",
  /* only the finished collections. philosophy, power-story-love, staying-alive,
     and inner-life moved to the In Progress index (archive.html); they carry
     inProgress above. */
  hubOrder: ['career', 'religion'],
  /* The Book With No Blood Test moved to the In Progress index 2026-09-24
     (archive/no-blood-test/). The Other Side came out of The Inner Life the
     same day to stand on the shelf by itself. */
  singles: [
    {
      href: 'the-other-side.html', title: 'The Other Side', thumb: 'the-other-side.jpg',
      date: '2026-07-02', dateDisplay: '2 Jul 2026',
      alt: "An artist's impression of a star torn into a glowing streak as it falls toward a black hole, a dark disc against red clouds of gas.",
      desc: "A cup needs both clay and empty space. My reading of the Tao Te Ching starts with that dependence, then asks what it might mean for the self.",
    },
  ],
};

/* oldest first, live before coming-soon */
const ordered = (members) => [...members].sort((a, b) => (a.soon ? 1 : 0) - (b.soon ? 1 : 0) || a.year - b.year);

/* ---- render a hub page ----------------------------------------------------- */
/* the first card's image is above the fold, so it loads eager (site convention:
   first image eager, the rest lazy); ordered() puts live before soon, so index
   0 always has a thumb */
const memberCard = (m, i) => m.soon
  ? `        <li class="article-list-item">
          <div class="article-item is-soon">
            <span class="article-item-era">${m.era}</span>
            <h2 class="article-item-title">${m.title}<span class="soon-tag">coming soon</span></h2>
            <p class="article-item-description">${m.desc}</p>
          </div>
        </li>`
  : `        <li class="article-list-item fade-in">
          <a class="article-item" href="${m.href}">
            <span class="article-item-thumb"><img src="assets/thumbs/${m.thumb}" width="600" height="400" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" alt=""></span>
            <span class="article-item-era">${m.era}</span>
            <h2 class="article-item-title">${m.title}</h2>
            <p class="article-item-description">${m.desc}</p>
          </a>
        </li>`;

/* An in-progress hub loads the shared banner as the first child of <body> (same
   contract as the pages under /archive), and its back-link points at the In
   Progress index instead of the Longform shelf it is no longer listed on. */
const hubPage = (h) => {
  const banner = h.inProgress ? '\n  <script src="/js/archive-banner.js"></script>' : '';
  const backHref = h.inProgress ? 'archive.html' : 'boring-stuff.html';
  const backLabel = h.inProgress ? 'In Progress' : 'Longform';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#303931">
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
<body>${banner}
  <div class="site-wrapper">
    <header class="site-header">
      <h1 class="site-name">${h.title}</h1>
      <p class="site-tagline">${h.lead}</p>
      <div class="home-search">
        <div class="hs-field-wrap">
          <label class="hs-field">
            <svg class="hs-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><line x1="15.6" y1="15.6" x2="21" y2="21" stroke-linecap="round"/></svg>
            <input class="hs-input" type="search" data-search-scope="${h.slug}" placeholder="Search" aria-label="Search ${h.title}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="hs-panel" aria-autocomplete="list" aria-haspopup="listbox">
            <span class="hs-hint" aria-hidden="true">Search</span>
          </label>
          <div class="hs-panel" id="hs-panel" role="listbox" aria-label="Search results"></div>
        </div>
        <span class="hs-links">
          <a class="hs-about" href="/">Home</a>
          <a class="hs-about" href="${backHref}">${backLabel}</a>
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
      <div class="site-footer-inner"><a href="/">&copy; 2026 Ethan Willingham</a><span class="ftr-links"><a class="ftr-lucky" href="lucky.html">Feeling lucky? <span class="arr">&#8599;</span></a></span></div>
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
};

const liveCount = (h) => h.members.filter((m) => !m.soon).length;
const shelfHubs = SHELF.hubOrder.map((slug) => HUBS.find((h) => h.slug === slug));
if (shelfHubs.some((h) => !h)) throw new Error('SHELF.hubOrder names a missing hub');
const shelfCount = shelfHubs.reduce((sum, h) => sum + liveCount(h), 0) + SHELF.singles.length;
const shelfLead = "Longer readings on old books and the work of everyday life. Pick a collection, or start with a question you already have.";

const shelfHubCard = (h, i) => `        <li class="article-list-item fade-in">
          <a class="article-item is-collection" href="${h.slug}.html">
            <span class="article-item-thumb"><img src="assets/thumbs/${h.card.thumb}" width="600" height="400" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" alt="${h.card.alt}"></span>
            <span class="article-item-date">Collection &middot; ${liveCount(h)} posts</span>
            <h2 class="article-item-title">${h.title}</h2>
            <p class="article-item-description">${h.card.desc}</p>
          </a>
        </li>`;

const shelfSingleCard = (p) => `        <li class="article-list-item fade-in">
          <a class="article-item" href="${p.href}">
            <span class="article-item-thumb"><img src="assets/thumbs/${p.thumb}" width="600" height="400" loading="lazy" decoding="async" alt="${p.alt}"></span>
            <time class="article-item-date" datetime="${p.date}">${p.dateDisplay}</time>
            <h2 class="article-item-title">${p.title}</h2>
            <p class="article-item-description">${p.desc}</p>
          </a>
        </li>`;

const shelfPage = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#303931">
  <title>${SHELF.title} | Ethan Willingham</title>
  <meta name="description" content="${shelfLead}">
  <meta property="og:title" content="${SHELF.title}">
  <meta property="og:description" content="${shelfLead}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ethan Willingham">
  <meta property="og:url" content="https://ethanwillingham.com/${SHELF.path}.html">
  <meta property="og:image" content="https://ethanwillingham.com/assets/thumbs/${SHELF.thumb}">
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
      <h1 class="site-name">${SHELF.title}</h1>
      <p class="site-tagline">${shelfLead}</p>
      <div class="home-search">
        <div class="hs-field-wrap">
          <label class="hs-field">
            <svg class="hs-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><line x1="15.6" y1="15.6" x2="21" y2="21" stroke-linecap="round"/></svg>
            <input class="hs-input" type="search" data-search-scope="${SHELF.path}" placeholder="Search" aria-label="Search ${SHELF.title}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="hs-panel" aria-autocomplete="list" aria-haspopup="listbox">
            <span class="hs-hint" aria-hidden="true">Search</span>
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
${shelfHubs.map(shelfHubCard).concat(SHELF.singles.map(shelfSingleCard)).join('\n')}
      </ul>
    </main>
    <footer class="site-footer">
      <div class="site-footer-inner"><a href="/">&copy; 2026 Ethan Willingham</a><span class="ftr-links"><a class="ftr-lucky" href="lucky.html">Feeling lucky? <span class="arr">&#8599;</span></a></span></div>
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

/* ---- homepage surgery: drop the collection's posts + old hub/collection cards
   off the homepage. The collection is reached from a header link, not a card, so
   nothing is added back. REMOVE includes the collection path so a re-run also
   clears any stale card. ----------------------------------------------------- */
const REMOVE = new Set([
  ...HUBS.flatMap((h) => h.members.filter((m) => !m.soon).map((m) => m.href)),
  ...HUBS.map((h) => h.slug + '.html'),
  ...SHELF.singles.map((p) => p.href),
  SHELF.path + '.html',
]);

/* ---- run the generation only when executed directly (node tools/gen-hubs.mjs),
   never as an import side effect (gen-post-nav.mjs imports the data above). --- */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  HUBS.forEach((h) => { writeFileSync(join(ROOT, h.slug + '.html'), hubPage(h)); console.log('wrote', h.slug + '.html', '(' + liveCount(h) + ' live, ' + h.members.filter((m) => m.soon).length + ' soon)'); });
  writeFileSync(join(ROOT, SHELF.path + '.html'), shelfPage());
  console.log('wrote', SHELF.path + '.html', '(' + shelfCount + ' posts in ' + shelfHubs.length + ' collections + ' + SHELF.singles.length + ' single)');

  let idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const allLis = idx.match(/<li class="article-list-item[\s\S]*?<\/li>/g) || [];
  let removed = 0;
  const keptLis = allLis.filter((li) => {
    const href = (li.match(/href="([^"]+)"/) || [])[1];
    if (href && REMOVE.has(href)) { removed++; return false; }
    return true;
  });
  const newList = keptLis.join('\n');
  idx = idx.replace(/<ul class="article-list">[\s\S]*?<\/ul>/, '<ul class="article-list">\n' + newList + '\n      </ul>');
  writeFileSync(join(ROOT, 'index.html'), idx);
  console.log('homepage: removed ' + removed + ' collection post/old-hub cards, kept ' + keptLis.length + ' (collection is a header link, no card)');
}

export { HUBS, SHELF, ordered, liveCount };
