/* Generate the In Progress collection pages and refresh the standalone homepage cards.
   Membership lives in HUBS. Homepage cards and their original GitHub creation
   commits live in homepage-posts.json, with homepage display dates and original
   creation timestamps in America/Chicago.
   Use --hub=<slug> to generate just one collection, or --homepage for cards only.
   Imports are side-effect free. Re-run wrap-picture and build-search-index after generation. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Members carry an era (the "measurement" shown beside the title: when the text
   is from) and a numeric year used only to sort them. Each hub lists oldest
   first, so the era column reads top-to-bottom as a timeline. Live members come
   before the greyed "coming soon" ones. A live member is
   {href,title,thumb,era,year,desc}; a planned one is {title,era,year,desc,soon}.
   A hub marked inProgress is listed on archive.html. Its page carries
   the amber in-progress banner and its members are flagged in the search index,
   so the collection reads as unfinished instead of finished. Its posts stay live
   at their normal URLs; nothing moves into /archive.
   Titles are short and parallel so the list reads as a set; descriptions are
   written for a reader who has never heard of the book. */
const live = (href, title, thumb, era, year, desc) => ({ href, title, thumb, era, year, desc });
const soon = (title, era, year, desc) => ({ title, era, year, desc, soon: true });

const HUBS = [
  {
    slug: 'religion', title: 'The Sacred Books', inProgress: true,
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
      live('plato.html', 'Plato', 'plato.jpg', 'c. 380 BCE', -380, "Socrates tested claims to wisdom. Plato imagined giving power to people trained to understand the good, and used the cave story to explain their education."),
      live('aristotle.html', 'Aristotle', 'aristotle.jpg', 'c. 340 BCE', -340, "A good character cannot prevent every loss. Seven passages through Aristotle's Ethics examine happiness as activity, the judgment virtue requires, and why even a happy person needs friends."),
      live('meditations.html', 'Marcus Aurelius', 'marcus-aurelius.jpg', 'c. 175 CE', 175, "An emperor warns himself against the effects of power. Twenty-eight passages connect judgment and death to providence, moral character, and duties to others, with sourced translation comparisons and plain explanations."),
      live('social-contract.html', 'Hobbes, Locke, and Rousseau', 'social-contract.jpg', '1651-1762', 1651, "Hobbes lets a condemned prisoner resist execution. Read his case for sovereignty beside Locke's limited government and Rousseau's general will, with five questions and fifteen primary excerpts."),
      live('marx.html', 'Karl Marx', 'marx.jpg', '1848', 1848, "Marx and Engels argue that capitalism creates the workers who will overthrow it. Follow their account of ownership and labor, its failed forecasts, and the governments that claimed its legacy."),
      live('mill.html', 'John Stuart Mill', 'mill.jpg', '1859', 1859, "Mill protects unpopular opinions and the freedom to choose your own life. His examples show why harm, social pressure, and even consent leave difficult questions about coercion."),
      live('darwin.html', 'Charles Darwin', 'darwin.jpg', '1859', 1859, "Darwin starts with pigeon breeders and asks how inherited differences spread in the wild. Eight stops follow his argument through the eye, branching species, and the heredity he could not explain."),
      live('nietzsche.html', 'Nietzsche', 'nietzsche.jpg', '1886-1887', 1886, "Nietzsche asks whether our virtues serve resentment or human flourishing. A walk through moral genealogy, bad conscience, and the ascetic ideal, with the exclusions his alternative cannot escape."),
      live('case-for-god.html', 'Can You Argue Your Way to God?', 'case-for-god.jpg', '1670 & 1952', 1952, "Pascal wagers a finite life against eternal happiness. Lewis reasons from conscience and the claims of Jesus; both arguments depend on premises their famous slogans tend to hide."),
      live('beginning-of-infinity.html', 'David Deutsch', 'beginning-of-infinity.jpg', '2011', 2011, "An explanation of winter becomes a test for how knowledge grows. Follow Deutsch's ideas about universality and optimism, with their physical limits and the questions his argument leaves open."),
      live('euclid.html', 'Euclid', 'euclid.jpg', 'c. 300 BCE', -300, "Two circles construct a triangle with equal sides. Follow Euclid's first proof and the Pythagorean theorem, then examine the assumptions that allow other geometries to work."),
      live('kant.html', 'Kant', 'kant.jpg', '1785', 1785, "Kant's honest shopkeeper does the right thing for profit. Seven passages trace the difference between duty and self-interest, then test universal law, human dignity, and the argument for freedom."),
      live('camus.html', 'Albert Camus', 'camus.jpg', '1942', 1942, "Camus asks whether life needs an ultimate explanation to be worth living. His answer is revolt; Frankl and Nagel help expose what that answer still leaves unresolved."),
      live('sapiens.html', 'Sapiens, Read Skeptically', 'sapiens.jpg', '2011 / English 2014', 2011, "A company can outlive everyone who works for it. Harari explains human cooperation through shared beliefs; the evidence complicates his account of farming, happiness, and the future of our species."),
    ],
  },
  {
    slug: 'inner-life', title: 'The Inner Life', inProgress: true,
    card: { thumb: 'meditation.jpg', alt: 'A Chola-period granite statue of the Buddha seated in meditation.',
      desc: "Read James, Fox, Huxley, and Frankl alongside the evidence for meditation and psychedelics. Examine what spiritual teachers promise and how authority or money can distort the relationship." },
    lead: "James studies religious experience; Frankl asks what makes life worth living. Alongside the books are readings on meditation, psychedelics, spiritual authority, and money, with the claims checked against their sources.",
    members: [
      live('meditation.html', 'Meditation, Mapped', 'meditation.jpg', 'ancient', -500, "Eleven practices, from mindfulness to dhikr, ask you to do different things. Compare their aims and health evidence, including the limits of the trials, then try a short attention exercise."),
      live('chemical-path.html', 'The Chemical Path', 'chemical-path.jpg', 'ancient + now', -499, "Huxley took mescaline and saw ordinary objects differently. Follow his explanation alongside Indigenous traditions and modern clinical trials, where a meaningful experience and a lasting treatment benefit are separate questions."),
      live('fox.html', 'Emmet Fox', 'fox.jpg', '1934', 1934, "Fox reads Jesus's teachings as instructions for changing thought. His book helped early AA members, but its promise that right thinking changes external events goes beyond the evidence for psychological treatment."),
      live('frankl.html', 'Viktor Frankl', 'frankl.jpg', '1946', 1946, "Frankl remembers imagining his wife during forced labor. His account asks how meaning can sustain a person, without establishing why some prisoners survived and others were murdered."),
      live('cults-the-cage.html', 'When a Path Becomes a Cage', 'cults-the-cage.jpg', 'modern', 1978, "A group's unusual beliefs tell you little about whether members can leave. Five cases examine threats, secrecy, control, and violence, separating court findings from allegations and competing accounts."),
      live('cults-business.html', 'When a Path Becomes a Business', 'cults-business.jpg', 'modern', 1979, "A fee can support a teacher or fund a promise that never delivers. Examine Landmark, A Course in Miracles, prosperity preaching, wellness sales, and TM through their claims and financial arrangements."),
      live('spirituality-of-imperfection.html', 'The Spirituality of Imperfection', 'spirituality-of-imperfection.jpg', '1992', 1992, "Ernest Kurtz and Katherine Ketcham draw on recovery and religious stories to explore admitting limits. Read their account of humility and fellowship, with attention to what the stories can and cannot establish."),
      live('william-james.html', 'William James', 'william-james.jpg', '1902', 1902, "James collects accounts of conversion and mystical experience, then asks what they do in a life. Follow his judgments alongside the limits of his cases and his own belief in a spiritual reality."),
      live('perennial-philosophy.html', 'The Perennial Philosophy', 'perennial-philosophy.jpg', '1945', 1945, "Huxley assembles a shared spiritual philosophy from selected mystics. Read five passages in context, where Buddhist accounts of self and Christian accounts of union complicate his claim of agreement."),
      live('modern-teachers.html', 'The Modern Teachers', 'modern-teachers.jpg', '20th c.', 1965, "Watts, Ram Dass, Krishnamurti, Gurdjieff, and Tolle give different accounts of self and practice. Compare what each asks you to accept, and what a teacher's conduct can tell you about their authority."),
    ],
  },
  {
    slug: 'staying-alive', title: 'Staying Alive', inProgress: true,
    card: { thumb: 'big-enough.jpg', alt: 'The bowed bearded head and massive shoulders of the Farnese Hercules, an ancient marble statue.',
      desc: 'How to take care of the one body you get: muscle, the heart, food, sleep, and the rest. The actionable science, with the hype stripped off.' },
    lead: "Four guides to muscle, cardio, food, and health outside the gym. Each pairs practical examples with the studies behind the advice.",
    members: [
      live("big-enough.html", "Big Enough", "big-enough.jpg", "muscle", 1, "More weekly sets can build more muscle, with smaller returns. The training plans and protein tool help you choose a routine you can keep doing."),
      live("still-moving.html", "Still Moving", "still-moving.jpg", "the heart", 2, "Brisk walking counts as aerobic activity. Fit cardio around lifting, total your weekly activity, and see what stretching and strength work can change."),
      live("what-to-eat.html", "What You're Supposed to Eat", "what-to-eat.jpg", "food", 3, "In a controlled feeding trial, people ate more from the ultra-processed menu. Compare that result with diet trials, protein and fiber targets, and the evidence for supplements."),
      live("the-other-hours.html", "The Other Hours", "the-other-hours.jpg", "the rest", 4, "Blood pressure can be high without symptoms. Read about sleep, smoking, screening, and the limits of popular recovery treatments, then use the checklist to choose a place to start."),
    ],
  },
];

const STANDALONE_POSTS = JSON.parse(readFileSync(join(ROOT, 'tools/homepage-posts.json'), 'utf8'));

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
   Progress index instead of the homepage. */
const hubPage = (h) => {
  const banner = h.inProgress ? '\n  <script src="/js/archive-banner.js"></script>' : '';
  const backHref = h.inProgress ? 'archive.html' : '/';
  const backLabel = h.inProgress ? 'In Progress' : 'Home';
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
  <script src="js/search.js?v=20261003il"></script>
  <script>
  (function () { var root = document.querySelector('.home-search'); var input = root && root.querySelector('.hs-input'); if (!input) return; input.addEventListener('focus', function () { root.classList.add('is-open'); }); input.addEventListener('blur', function () { setTimeout(function () { if (!input.value && !root.contains(document.activeElement)) root.classList.remove('is-open'); }, 160); }); })();
  </script>
  <script src="js/backtotop.js"></script>
</body>
</html>
`;
};

const liveCount = (h) => h.members.filter((m) => !m.soon).length;
function updateHomepage() {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const removed = new Set([
    ...HUBS.flatMap((h) => h.members.filter((m) => !m.soon).map((m) => m.href)),
    ...HUBS.map((h) => h.slug + '.html'),
    ...STANDALONE_POSTS.map((p) => p.href),
    'boring-stuff.html', 'career.html',
  ]);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cards = (html.match(/<li class="article-list-item[\s\S]*?<\/li>/g) || [])
    .filter((li) => !removed.has((li.match(/href="([^"]+)"/) || [])[1]));
  for (const p of STANDALONE_POSTS) {
    const image = p.image || `assets/thumbs/${p.thumb}`;
    const provenance = p.createdCommit ? `<!-- First published in GitHub commit ${p.createdCommit}, ${p.createdAt}. -->\n              ` : '';
    cards.push(`        <li class="article-list-item fade-in" data-keywords="${esc(p.keywords)}">
          <a class="article-item" href="${p.href}">
            <span class="article-item-thumb">
              ${provenance}${p.credit ? `<!-- thumbnail: ${esc(p.credit)} -->\n              ` : ''}<picture><source type="image/webp" srcset="${image.replace(/\.jpg$/, '.webp')}"><img src="${image}" width="${p.width || 600}" height="${p.height || 400}" loading="lazy" decoding="async" alt="${esc(p.alt)}"></picture>
            </span>
            <time class="article-item-date" datetime="${p.date}">${p.dateDisplay}</time>
            <h2 class="article-item-title">${esc(p.title)}</h2>
            <p class="article-item-description">${esc(p.desc)}</p>
          </a>
        </li>`);
  }
  const date = (li) => (li.match(/datetime="([^"]+)"/) || [, ''])[1];
  cards.sort((a, b) => date(b).localeCompare(date(a)));
  const list = cards.map((li, i) => li.replace(/loading="(?:lazy|eager)"/g, `loading="${i === 0 ? 'eager' : 'lazy'}"`)).join('\n');
  html = html.replace(/<ul class="article-list">[\s\S]*?<\/ul>/, `<ul class="article-list">\n${list}\n      </ul>`);
  writeFileSync(join(ROOT, 'index.html'), html);
  console.log('homepage:', cards.length, 'posts, newest first');
}


/* ---- run the generation only when executed directly (node tools/gen-hubs.mjs),
   never as an import side effect (gen-post-nav.mjs imports the data above). --- */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const hubArg = process.argv.slice(2).find((arg) => arg.startsWith('--hub='));
  const selectedHub = hubArg && HUBS.find((h) => h.slug === hubArg.slice(6));
  if (hubArg && !selectedHub) throw new Error(`Unknown hub: ${hubArg.slice(6)}`);
  const targets = process.argv.includes('--homepage') ? [] : selectedHub ? [selectedHub] : HUBS;
  targets.forEach((h) => { writeFileSync(join(ROOT, h.slug + '.html'), hubPage(h)); console.log('wrote', h.slug + '.html', '(' + liveCount(h) + ' live, ' + h.members.filter((m) => m.soon).length + ' soon)'); });
  if (!selectedHub) {
    updateHomepage();
  }
}

export { HUBS, STANDALONE_POSTS, ordered, liveCount };
