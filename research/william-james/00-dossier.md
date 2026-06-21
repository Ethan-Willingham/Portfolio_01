# The Varieties of Religious Experience, William James (1902)

Research dossier for the Engine C (idea distillation) post `william-james.html`.
Source text: the public-domain 1902 first edition, read in full from Project
Gutenberg eBook 621 (saved locally as `varieties-gutenberg.txt`, not committed).
Verbatim quotes and line numbers are in `quotes.md`; the AA fact-check is in
`aa-connection.md`; the image provenance is in `portrait.md`. This file is the
consolidated summary.

## What the book is
The published Gifford Lectures on natural religion, twenty lectures William James
gave at the University of Edinburgh across 1901 to 1902. James (1842 to 1910) was
a Harvard physician (M.D. 1869) and the author of the field-defining *Principles
of Psychology* (1890); brother of the novelist Henry James. He is studying
**personal** religion (first-hand experience) and deliberately ignoring the
institutional branch (churches, theology, ceremony).

## The spine
Study religion as experience, not doctrine: the actual conversions, mystical
states, and feelings people report. Judge them as a scientist judges anything, by
their fruits (what they do to a life), not their roots (their cause) or their
creed (whether the theology is true).

## Keystones (verbatim, cited by Lecture; full wording in quotes.md)
1. **Definition of religion** (Lec. II): "the feelings, acts, and experiences of
   individual men in their solitude, so far as they apprehend themselves to stand
   in relation to whatever they may consider the divine." Personal, not
   institutional: "the founders of every church owed their power originally to ...
   direct personal communion with the divine."
2. **By their fruits, not their roots** (Lec. I): the "empiricist criterion." A
   religious state is not discredited by an ugly cause (a seizure, a breakdown).
   "Judge the religious life by its results exclusively."
3. **Healthy-minded / once-born** (Lec. IV to V): "the tendency which looks on all
   things and sees that they are good." The once-born vs twice-born pair is quoted
   from Francis W. Newman.
4. **The sick soul / twice-born** (Lec. VI to VII): "the worm at the core of all
   our usual springs of delight." The famous panic-fear passage ("That shape am I,
   I felt, potentially ...") is James's own breakdown, printed as an anonymous
   "French correspondent"; identified by Ralph Barton Perry (1935).
5. **Conversion** (Lec. IX): "the process, gradual or sudden, by which a self
   hitherto divided, and consciously wrong inferior and unhappy, becomes unified
   and consciously right superior and happy." Two types (Starbuck's labels): the
   sudden "self-surrender" type and the gradual "volitional" type, built "piece by
   piece." "The difference between the two types is after all not radical."
6. **The four marks of mysticism** (Lec. XVI to XVII): Ineffability, Noetic
   quality, Transiency, Passivity. Noetic is load-bearing: the state feels like
   knowledge, "insight into depths of truth unplumbed by the discursive intellect."
7. **The conclusions** (Lec. XX): the "uniform deliverance" in two parts. "1. The
   uneasiness ... a sense that there is something wrong about us as we naturally
   stand. 2. The solution ... we are saved from the wrongness by making proper
   connection with the higher powers." James's own stance: "piecemeal
   supernaturalism" (yes to a "MORE," no to any one church's full theology).

## The AA hook (fact vs legend; full detail in aa-connection.md)
- DOCUMENTED: Bill Wilson's last admission to Towns Hospital was Dec 11, 1934; the
  white-light experience came first, and he read *Varieties* just after, most
  likely still hospitalized. The book gave him permission to trust the experience
  and the idea that awakenings come in many forms, including slow ones, after
  "absolute defeat." Wilson credited James (dead since 1910) as "a founder of
  Alcoholics Anonymous" (*My First 40 Years*; repeated in *Comes of Age*, 1957).
  James is the only outside author the Big Book names.
- The Big Book's Appendix II, "Spiritual Experience" (added to the 2nd printing,
  1941, to calm newcomers who thought they needed a sudden white light): "Most of
  our experiences are what the psychologist William James calls the 'educational
  variety' because they develop slowly over a period of time."
- PRECISION TRAPS: "educational variety" is AA's gloss attributed to James, not a
  verbatim term of his; it maps onto his gradual "volitional type." "Deflation at
  depth" is Wilson's coinage, not in James at all (do not attribute it to James).
- STEELMAN: "the book behind AA" is half true. The machinery (steps, meetings,
  surrender) came from the Oxford Group; the disease idea from Dr. William
  Silkworth; the deepest jolt secondhand from Carl Jung (the Rowland Hazard case;
  the "spiritus contra spiritum" letter); "half measures availed us nothing" from
  Richard Peabody. Kurtz notes Wilson "was one of the few early members who did not
  read Varieties very thoroughly." James was the interpreter, not the architect.
- Cross-links on this site: `/archive/alcoholics-anonymous/...` (the Jung to
  Rowland to Ebby to Bill chain, the white light), `/archive/first-164/...` (how
  the Big Book and its appendix were written), `/archive/forty-not-a-hundred/...`
  (founding-myth honesty). None of the three mentions James, so this post fills a
  real gap.

## Honest limits to keep visible (per VOICE.md / CANON.md)
- James samples the religious geniuses (the extremes) on purpose; a thing studied
  only at its strongest looks more uniform and profound than the everyday article.
  He says so himself.
- "By their fruits" cannot decide which religion is true: two converts can bear
  good fruit on opposite creeds. James's win is narrower and real: religious
  experience earns a seat at the table of science. The modern psychology of
  religion starts here.

## The thumbnail
William James, 1903, Notman Studios (Boston); MS Am 1092, Houghton Library,
Harvard, via Wikimedia Commons (`File:William_James_b1842c.jpg`), public domain
(published before 1929). Source download 1410x1880. Derived assets: in-page
portrait `assets/james/william-james-portrait.jpg` (760x1013, full image), card
thumb `assets/thumbs/william-james.jpg` (600x400, face crop), link-preview
`assets/thumbs/william-james-og.jpg` (1200x630, portrait matted on the site green).

## Build notes
Engine C, shell cloned from `frankl.html` + `js/frankl.js`. Interactive piece: the
four marks of mysticism (the three-doors gallery pattern, four cards). Lives in
the **inner-life** hub (flip the soon() to live() in `tools/gen-hubs.mjs`, then
`node tools/gen-hubs.mjs` and `node tools/build-search-index.mjs`); not a homepage
card. Gutter verified at 20px at 375px width. No em dashes (the book's dashes are
rendered as commas inside quotes).
