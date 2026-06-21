/* gen-hubs.mjs  -  generate the four series hub index pages and rewrite the
   homepage's card list (lift the series posts into hubs, drop in four hub cards).
   Run from the repo root: node tools/gen-hubs.mjs   No em dashes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- the four hubs ---------------------------------------------------------
   Each member is {href,title,thumb,desc} for a live post, or {title,desc,soon}
   for a planned one (greyed, no link). */
const live = (href, title, thumb, desc) => ({ href, title, thumb, desc });
const soon = (title, desc) => ({ title, desc, soon: true });

const HUBS = [
  {
    slug: 'religion', title: 'Religion, the Sacred Books',
    card: { thumb: 'hebrew-bible.jpg', alt: 'An open Torah scroll on velvet with a silver pointer resting in front.',
      desc: 'The ten books billions live by, each in its own language against the great English translations, with the keystones broken down where the translators split.' },
    lead: 'The books billions live by, side by side. Each scripture in its own language against the great English translations, with the keystone passages broken down where the translators split.',
    members: [
      live('tao-te-ching.html', 'The Tao Te Ching, Side by Side', 'tao-te-ching.jpg', 'Every chapter in the original Chinese against two dozen complete English translations.'),
      live('zhuangzi.html', 'The Zhuangzi, the Book That Laughs', 'zhuangzi.jpg', "Nine of the wildest Taoist stories, walked in Brook Ziporyn's translation."),
      live('analects.html', 'The Analects of Confucius, Side by Side', 'analects.jpg', 'All twenty books of Confucius, the great translations stacked and broken down.'),
      live('dhammapada.html', 'The Dhammapada, Side by Side', 'dhammapada.jpg', "All 423 verses of the Buddha's teaching across seven English translations."),
      live('gita.html', 'The Bhagavad Gita, Side by Side', 'gita.jpg', 'A warrior freezes before a battle, and his charioteer, who is God, talks him through it.'),
      live('nagarjuna.html', 'Nagarjuna and the Emptiness of Everything', 'nagarjuna.jpg', 'Nothing exists on its own, including you, and that emptiness is the best news there is.'),
      live('hebrew-bible.html', 'The Hebrew Bible, Side by Side', 'hebrew-bible.jpg', 'The Tanakh read the way Judaism reads it, the keystones across seven translations.'),
      live('new-testament.html', 'The New Testament, Side by Side', 'new-testament.jpg', 'Sixteen keystone passages in the original Greek against nine translations, Tyndale to Hart.'),
      live('quran.html', 'The Quran, Side by Side', 'quran.jpg', 'The Arabic that cannot be translated, against seven English interpretations of the meaning.'),
      live('guru-granth-sahib.html', 'The Guru Granth Sahib, Side by Side', 'guru-granth-sahib.jpg', 'The book Sikhs enthrone as a living teacher, its keystones across the major translations.'),
      soon('Rumi, the Masnavi', 'The ecstatic Sufi heart of Islam, and the great translation war.'),
      soon('The wisdom never written down', 'The oral and indigenous traditions a books series structurally misses.'),
    ],
  },
  {
    slug: 'philosophy', title: 'Philosophy and Science',
    card: { thumb: 'aristotle.jpg', alt: "Rembrandt's painting of Aristotle resting a hand on a bust of Homer.",
      desc: 'How to think and what is real, from Plato and Aristotle to Darwin and Deutsch, each argument walked one move at a time, the dissenters kept in.' },
    lead: 'How to think, and what is real. From the Greeks to the moderns, each argument walked one move at a time, with the dissenters kept in the room.',
    members: [
      live('plato.html', "Plato's Cave and the Death of Socrates", 'plato.jpg', 'Executed for asking too many questions: the examined life, the cave, the calm death of Socrates.'),
      live('aristotle.html', 'Aristotle and the Good Life', 'aristotle.jpg', 'Everyone wants to be happy and mostly chases the wrong things. Here is Aristotle’s answer.'),
      live('meditations.html', 'The Meditations of Marcus Aurelius', 'marcus-aurelius.jpg', 'The private notebook a Roman emperor wrote to himself, mostly about humility and death.'),
      live('nietzsche.html', 'Nietzsche and the Case Against Morality', 'nietzsche.jpg', "God is dead, and your humility is a weapon the weak invented. The series' dissenter."),
      live('mill.html', 'On Liberty, and the Only Reason to Stop You', 'mill.jpg', "Mill's 1859 case for leaving people alone, unless they harm someone else."),
      live('social-contract.html', 'The Social Contract, Side by Side', 'social-contract.jpg', 'Why should anyone obey the state? Hobbes, Locke, and Rousseau, set against each other.'),
      live('marx.html', 'Marx and the Gravediggers', 'marx.jpg', "Capitalism's sharpest critic, and the catastrophe in his name, walked one move at a time."),
      live('darwin.html', 'Darwin and the Watchmaker', 'darwin.jpg', 'A watch in the dirt needs a watchmaker. An eye, Darwin shows, does not.'),
      live('beginning-of-infinity.html', 'The Beginning of Infinity, Mapped', 'beginning-of-infinity.jpg', "Deutsch's case for optimism: a good explanation is one that is hard to vary."),
      soon('Camus, The Myth of Sisyphus', 'If life has no built-in meaning, why not quit? The existential keystone.'),
      soon('Kant and the categorical imperative', 'The other giant of modern philosophy, and the rule he built morality on.'),
      soon('Sapiens', 'How shared fictions let strangers cooperate, handled skeptically.'),
      soon('Euclid, and where proof begins', 'Two thousand years of deductive reasoning, from one little book.'),
    ],
  },
  {
    slug: 'inner-life', title: 'The Inner Life',
    card: { thumb: 'meditation.jpg', alt: 'A Chola-period granite statue of the Buddha seated in meditation.',
      desc: 'Meaning, the mind, and how to bear a life: Frankl, the spirituality of imperfection, and the truth about every kind of meditation.' },
    lead: 'Meaning, the mind, and how to bear a life. The great consolations, the recovery literature, and the honest truth about every kind of meditation.',
    members: [
      live('meditation.html', 'Meditation, Mapped', 'meditation.jpg', 'The truth about every kind of meditation, and how to actually do each one.'),
      live('frankl.html', "Man's Search for Meaning", 'frankl.jpg', 'A psychiatrist in the Nazi camps on the one thing that kept men alive: a reason.'),
      live('spirituality-of-imperfection.html', 'The Spirituality of Imperfection', 'spirituality-of-imperfection.jpg', 'To be human is to be imperfect, and the cracks are where the spiritual life starts.'),
      live('get-used-to-everything.html', 'Do You Get Used to Everything?', 'get-used-to-everything.jpg', 'What fades, what never does (commuting, grief), and the one move you actually get.'),
      soon('William James, The Varieties of Religious Experience', "Religion as experience, not doctrine. The book behind AA's spiritual language."),
      soon('Emmet Fox, The Sermon on the Mount', "New Thought, and early AA's textbook before the Big Book existed."),
      soon('Huxley, The Perennial Philosophy', 'The claim that, underneath, all the mystics are saying one thing.'),
      soon('The Modern Teachers', 'Watts, Krishnamurti, Ram Dass, Tolle, and the East sold to the West.'),
      soon('The Chemical Path', 'Psychedelics and the mystical state, from Huxley to the new science.'),
      soon('Cults: the cage and the business', 'How a path to meaning becomes a prison, or a cash register.'),
    ],
  },
  {
    slug: 'power-story-love', title: 'Power, Story, and Love',
    card: { thumb: 'odyssey.jpg', alt: 'The Siren Vase: Odysseus lashed to the mast as bird-bodied Sirens fly around his ship.',
      desc: 'The human dramas: the Art of War on winning without fighting, the Odyssey on getting home, with power, story, and love still to come.' },
    lead: 'The human dramas. How we fight, how we get home, and how we love: power without illusions, the oldest stories, and the art of desire.',
    members: [
      live('art-of-war.html', 'The Art of War, Side by Side', 'art-of-war.jpg', 'The most famous war book says the best way to win is to never fight.'),
      live('odyssey.html', 'The Odyssey, the Long Way Home', 'odyssey.jpg', 'The long way home, and what it costs, walked one monster at a time.'),
      soon('Machiavelli, The Prince', 'Power as it actually is, stripped of the moralizing.'),
      soon('Dostoevsky, the Grand Inquisitor', 'The sharpest argument against God ever written, in the mouth of a believer.'),
      soon("Plato's Symposium", 'The foundational Western text on love, and the ladder from desire to the divine.'),
      soon('The Kama Sutra', 'The art of living well, of which erotic love is one civilized part.'),
      soon('In Praise of Shadows', 'A Japanese aesthetic: beauty in shadow, imperfection, and the worn.'),
    ],
  },
];

/* ---- render a hub page ----------------------------------------------------- */
const memberCard = (m) => m.soon
  ? `        <li class="article-list-item">
          <div class="article-item is-soon">
            <h2 class="article-item-title">${m.title}<span class="soon-tag">coming soon</span></h2>
            <p class="article-item-description">${m.desc}</p>
          </div>
        </li>`
  : `        <li class="article-list-item fade-in">
          <a class="article-item" href="${m.href}">
            <span class="article-item-thumb"><img src="assets/thumbs/${m.thumb}" width="600" height="400" loading="lazy" decoding="async" alt=""></span>
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
          <a class="hs-about" href="archive.html">Archive</a>
        </span>
      </div>
      <p class="hs-readout" role="status" aria-live="polite"></p>
    </header>
    <main>
      <ul class="article-list">
${h.members.map(memberCard).join('\n')}
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

/* ---- homepage surgery: drop the series cards, drop in four hub cards -------- */
const REMOVE = new Set(HUBS.flatMap((h) => h.members.filter((m) => !m.soon).map((m) => m.href)));
const hubHomeCard = (h) => `        <li class="article-list-item fade-in">
          <a class="article-item" href="${h.slug}.html">
            <span class="article-item-thumb"><img src="assets/thumbs/${h.card.thumb}" width="600" height="400" loading="eager" decoding="async" alt="${h.card.alt}"></span>
            <time class="article-item-date" datetime="2026-06-21">21 Jun 2026</time>
            <h2 class="article-item-title">${h.title}</h2>
            <p class="article-item-description">${h.card.desc}</p>
          </a>
        </li>`;

let idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
const liRe = /<li class="article-list-item[\s\S]*?<\/li>/g;
const allLis = idx.match(liRe) || [];
let removed = 0;
const keptLis = allLis.filter((li) => {
  const href = (li.match(/href="([^"]+)"/) || [])[1];
  if (href && REMOVE.has(href)) { removed++; return false; }
  return true;
});
const newList = HUBS.map(hubHomeCard).join('\n') + '\n' + keptLis.join('\n');
idx = idx.replace(/<ul class="article-list">[\s\S]*?<\/ul>/, '<ul class="article-list">\n' + newList + '\n      </ul>');
writeFileSync(join(ROOT, 'index.html'), idx);
console.log('homepage: removed ' + removed + ' series cards, kept ' + keptLis.length + ', added ' + HUBS.length + ' hub cards');
