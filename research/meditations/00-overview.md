# Meditations (Marcus Aurelius) — image sourcing + framing dossier

Companion to the translation-comparison post on Marcus Aurelius's *Meditations*.
This file covers (PART 1) the real, properly-licensed thumbnail image, and
(PART 2) the framing facts that anchor the post's voice. The translation
sourcing lives in `hays.md` (in-copyright keystones) and `long-full.txt` (the
public-domain George Long 1862 text from Project Gutenberg).

Site context: dark warm-green background (`--bg: #303931`). A bronze or marble
subject on a plain ground reads like a museum object on that field, which is the
look we want for the card thumbnail and the 1200x630 OG image.

---

## PART 1 — THE IMAGE

All direct URLs below were confirmed to resolve to real JPEG data at the stated
pixel dimensions. Two research passes downloaded each file and decoded its
dimensions (valid `ffd8` JPEG magic, HTTP 200); the two top picks were
additionally re-confirmed via WebFetch against their Commons File: pages, which
returned the same dimensions/license/credit. Note for whoever downloads these:
`upload.wikimedia.org` rate-limits rapid sequential requests from one IP
(returns a 2,256-byte HTML "Wikimedia Error" page with HTTP 429). That is a
throttle, not a dead link. Download with a real browser User-Agent, a
`Referer: https://commons.wikimedia.org/` header, and a pause between files, or
just use the browser. The Met has **no** Open-Access Marcus Aurelius marble
(its only Marcus marble is a Louvre loan, not Met property), so every viable
candidate is on Wikimedia Commons.

### RECOMMENDED PRIMARY — Capitoline Museums marble bust (Grandmont)

The single best all-rounder. A large three-quarter marble head, securely
identified, against a genuinely plain warm gray-brown wall. The neutral ground
extends past the face on both sides, so it crops cleanly to a wide 1200x630
rectangle without cutting the face, and the warm stone tone sits naturally on
the dark-green site. Highest-resolution truly-neutral-background option.

- **Direct file URL** (verified, ~7.0 MB):
  `https://upload.wikimedia.org/wikipedia/commons/5/52/0_Marcus_Aurelius_-_Palazzo_Nuovo_-_Musei_Capitolini_%281%29.JPG`
- **Dimensions:** 2592 x 3888 (portrait)
- **License:** CC BY-SA 3.0 Unported (dual-licensed GFDL 1.2+). Attribution + share-alike required.
- **Credit line (human, one line):** Marble bust of Marcus Aurelius, c. 161–180 CE, Capitoline Museums, Rome (Palazzo Nuovo, Hall of the Emperors, inv. MC0448); photo by Jean-Pol Grandmont, CC BY-SA 3.0, via Wikimedia Commons.
- **File page:** `https://commons.wikimedia.org/wiki/File:0_Marcus_Aurelius_-_Palazzo_Nuovo_-_Musei_Capitolini_(1).JPG`
- **Use:** best for the 1200x630 OG image; also crops fine to a small landscape card with zero masking.

### STRONG ALTERNATIVE (cleanest license) — Glyptothek Munich bust (Bibi Saint-Pol)

The single most-recognizable Marcus Aurelius bust (frontal, full beard, cloak),
and the simplest licensing on the page: the photographer released it into the
**public domain**, so no attribution is legally required (credit anyway, it is
polite). The one drawback: the background is a busy patterned tapestry/mosaic,
NOT neutral, so to sit it on the dark-green site you would knock out / mask the
background first. Square aspect makes it ideal for a small card crop once the
background is handled.

- **Direct file URL** (verified, ~2.1 MB):
  `https://upload.wikimedia.org/wikipedia/commons/b/bb/Marcus_Aurelius_Glyptothek_M%C3%BCnchen.jpg`
- **Dimensions:** 1700 x 1700 (square)
- **License:** Public Domain (photographer's worldwide PD release). No attribution legally required.
- **Credit line (human, one line):** Bust of Marcus Aurelius (r. 161–180 CE), Glyptothek, Munich; photo by Bibi Saint-Pol, released to the public domain, via Wikimedia Commons.
- **File page:** `https://commons.wikimedia.org/wiki/File:Marcus_Aurelius_Glyptothek_M%C3%BCnchen.jpg`
- **Use:** best for a small square-ish card thumbnail IF you mask the patterned background; PD makes it the lowest-friction license.

### EQUESTRIAN STATUE — landscape option (Chabe01)

The bronze equestrian statue is the iconic Marcus Aurelius object. The only true
**landscape** shot of it at good resolution is the outdoor 1981 replica in the
Piazza del Campidoglio: a clean 3/4 view of the emperor on horseback against a
plain sky/plaza ground. Best equestrian choice for a small landscape card; for
an OG image the rider's silhouette reads, but the horse dominates the frame.

- **Direct file URL** (verified, ~4.4 MB):
  `https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_%C3%89questre_Marc_Aur%C3%A8le_-_Rome_%28IT62%29_-_2021-08-27_-_6.jpg`
- **Dimensions:** 4032 x 3024 (landscape, 4:3)
- **License:** CC BY-SA 4.0. Attribution + share-alike required.
- **Credit line (human, one line):** Equestrian statue of Marcus Aurelius (1981 replica in situ; original c. 175 CE, Capitoline Museums, Rome), Piazza del Campidoglio; photo by Chabe01, CC BY-SA 4.0, via Wikimedia Commons.
- **File page:** `https://commons.wikimedia.org/wiki/File:Statue_%C3%89questre_Marc_Aur%C3%A8le_-_Rome_(IT62)_-_2021-08-27_-_6.jpg`
- **Note:** shows the outdoor replica. If you specifically want the original indoor bronze, see the next candidate.

### EQUESTRIAN STATUE — highest-res original bronze (Merulana)

The original bronze itself (the lead image on the English Wikipedia article),
at very high resolution. It is an extreme vertical (nearly 1:1.8 portrait), so
it is a hard tall-crop for any landscape tile, but it is the best option if you
want maximum sharpness or a portrait/square crop of the rider.

- **Direct file URL** (verified to stream real image data; file exceeds a 10 MB fetch cap):
  `https://upload.wikimedia.org/wikipedia/commons/b/b5/Equestrian_statue_of_Marcus_Aurelius_%28Rome%29.jpg`
- **Dimensions:** 4872 x 8844 (tall portrait)
- **License:** CC BY-SA 4.0. Attribution + share-alike required.
- **Credit line (human, one line):** Equestrian statue of Marcus Aurelius, original bronze c. 175 CE, Capitoline Museums, Rome; photo by Merulana, CC BY-SA 4.0, via Wikimedia Commons.
- **File page:** `https://commons.wikimedia.org/wiki/File:Equestrian_statue_of_Marcus_Aurelius_(Rome).jpg`

### Also verified, listed for completeness (not recommended)

- **British Museum (Cyrene) marble bust** — highest-res bust (Commons reports 3153 x 4651), CC BY-SA 2.0, photo by Carole Raddato. Plain blue-gray wall, but it is stored with an EXIF-orientation flag so the buffer decodes sideways (4651 x 3153) and renders rotated unless you bake in the rotation; the face is also a small region of a wide frame, so it needs rotate + aggressive crop. More work than the Capitoline.
  `https://upload.wikimedia.org/wikipedia/commons/4/4c/Marble_bust_of_the_emperor_Marcus_Aurelius_in_a_fringed_cloak%2C_circa_160-170%2C_found_in_the_House_of_Jason_Magnus_in_Cyrene_%28Libya%29%2C_British_Museum_%2817273906391%29.jpg`
- **Louvre Ma 1138** (the bust shown on loan at the Met) — 2155 x 2500, CC BY-SA 3.0. Fine bust, slightly busier museum background than the Capitoline.
  `https://upload.wikimedia.org/wikipedia/commons/9/91/P1230312_Louvre_Marc_Aurele_Ma1138_rwk.jpg`
- **Capitoline horse-head detail** (Clemensfranz) — 4928 x 3264, CC BY-SA 3.0. Dramatic, but it is the horse's head, so the thumbnail would not read as "Marcus Aurelius."
  `https://upload.wikimedia.org/wikipedia/commons/2/21/Marcus_Aurelius_Kapitolische_Museen_Pferdekopf.jpg`

### Ranking summary

- **Homepage card (landscape, shown small):** 1st = Capitoline bust (crops clean, zero masking); 2nd = Chabe01 equestrian (only native-landscape statue shot, iconic silhouette); 3rd = Glyptothek (most iconic + PD, but needs background knockout).
- **1200x630 OG image:** 1st = Capitoline bust (plain wall past the face on both sides = clean wide crop); 2nd = British Museum Cyrene (highest res, but rotate + hard crop); equestrian shots are weaker here because the horse fills the wide frame.

### Single recommended choice

**Capitoline Museums marble bust, photo by Jean-Pol Grandmont.**
Direct URL: `https://upload.wikimedia.org/wikipedia/commons/5/52/0_Marcus_Aurelius_-_Palazzo_Nuovo_-_Musei_Capitolini_%281%29.JPG`
License: CC BY-SA 3.0 (attribution + share-alike).
One-line credit: *Marble bust of Marcus Aurelius, c. 161–180 CE, Capitoline Museums, Rome; photo by Jean-Pol Grandmont, CC BY-SA 3.0, via Wikimedia Commons.*

If a no-attribution / public-domain image is preferred over the share-alike
license, fall back to the **Glyptothek Munich bust** (PD) and knock out its
patterned background.

> Licensing note for the post: the most-neutral, best-cropping options are all
> CC BY-SA, which requires a visible attribution line (author + license version
> + link to the Commons file page) AND share-alike. Only the Glyptothek bust is
> public domain. The site already credits images museum-object style, so a
> CC BY-SA credit line fits the existing convention.

---

## PART 2 — FRAMING FACTS (confirmed, one line each + citation)

- **Roman emperor 161–180 CE, last of the "Five Good Emperors."** Confirmed. He
  ruled 161–180 CE (co-emperor with Lucius Verus to 169, then with his son
  Commodus from 177), and is counted the last of the five (Nerva, Trajan,
  Hadrian, Antoninus Pius, Marcus Aurelius). [Britannica](https://www.britannica.com/biography/Marcus-Aurelius-Roman-emperor) · [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu/entries/marcus-aurelius/)

- **The *Meditations* is his private notebook.** Confirmed. It is a series of
  personal writings / notes to himself on Stoic practice; it is unlikely Marcus
  ever intended them to be published. [Wikipedia, *Meditations*](https://en.wikipedia.org/wiki/Meditations) · [Internet Encyclopedia of Philosophy](https://iep.utm.edu/marcus-aurelius/)

- **Written in GREEK, not Latin.** Confirmed. Marcus wrote the twelve books in
  Koine Greek (the language of philosophy at the time), even though he was the
  Roman emperor and Latin was the language of the state. [Wikipedia, *Meditations*](https://en.wikipedia.org/wiki/Meditations) (Koine Greek: Τὰ εἰς ἑαυτόν)

- **Never meant to be read; no title, no addressee.** Confirmed. The work has no
  official title; "Meditations" is a later convention. The Greek title commonly
  given is **Τὰ εἰς ἑαυτόν / Ta eis heauton = "To Himself."** [Wikipedia, *Meditations*](https://en.wikipedia.org/wiki/Meditations) · [Internet Archive — "Τὰ εἰς ἑαυτόν / Ta eis heauton"](https://archive.org/details/Iseendale_Marcus_Aurelius)

- **Much of it written on military campaign on the Danube frontier (Marcomannic
  Wars), 170s.** Confirmed. Internal datelines survive: between Books 1 and 2,
  "Among the Quadi, at the Granua/Gran" (a Danube tributary on the enemy side of
  the frontier); between Books 2 and 3, "At Carnuntum" (the Pannonian legionary
  base where Marcus was based c. 171–175 during the Marcomannic Wars). [Classical Wisdom — Carnuntum](https://classicalwisdom.com/philosophy/stoicism/carnuntum-where-marcus-aurelius-wrote-the-meditations/) · [Battle of Carnuntum (Wikipedia)](https://en.wikipedia.org/wiki/Battle_of_Carnuntum)

- **He was a Stoic; his teacher Rusticus gave him Epictetus.** Confirmed. The
  Stoic Quintus Junius Rusticus was Marcus's most important teacher; it was from
  Rusticus that Marcus first read Epictetus, lent a copy of the *Discourses*
  from Rusticus's own library. (Marcus thanks Rusticus for exactly this in
  *Meditations* 1.7.) [Modern Stoicism — Rusticus](https://modernstoicism.com/marcus-aurelius-the-stoic-disciple-of-rusticus/) · [Junius Rusticus (Wikipedia)](https://en.wikipedia.org/wiki/Junius_Rusticus)

- **Color: the "philosopher-king"; the bronze equestrian statue survived because
  it was mistaken for the Christian emperor Constantine.** Confirmed. It is one
  of very few surviving ancient Roman bronze equestrian statues; through the
  Middle Ages it was believed to depict Constantine the Great (the first
  Christian emperor) and was called "the Horse of Constantine," which spared it
  from the melting-down that destroyed the other imperial bronzes (often recast
  for church bells or coin). [Wikipedia — Equestrian statue of Marcus Aurelius](https://en.wikipedia.org/wiki/Equestrian_statue_of_Marcus_Aurelius) · [Carleton Guide to Medieval Rome](https://cgmr.carleton.edu/items/show/459)
  - Specifics worth keeping straight for the post: first documented as
    "Constantine" in the 10th century; moved to the Campidoglio (Michelangelo's
    square) by Pope Paul III in 1538; the original bronze moved indoors to the
    Capitoline Museums in 1981 with a replica left outdoors.

---

## Sources cross-check (key URLs)

- Meditations / Greek / "To Himself": https://en.wikipedia.org/wiki/Meditations
- Marcus Aurelius (life, Five Good Emperors, Stoicism): https://plato.stanford.edu/entries/marcus-aurelius/ ; https://iep.utm.edu/marcus-aurelius/ ; https://www.britannica.com/biography/Marcus-Aurelius-Roman-emperor
- Campaign datelines / Carnuntum / Marcomannic Wars: https://classicalwisdom.com/philosophy/stoicism/carnuntum-where-marcus-aurelius-wrote-the-meditations/ ; https://en.wikipedia.org/wiki/Battle_of_Carnuntum
- Rusticus → Epictetus: https://modernstoicism.com/marcus-aurelius-the-stoic-disciple-of-rusticus/ ; https://en.wikipedia.org/wiki/Junius_Rusticus
- Statue / Constantine mistaken identity: https://en.wikipedia.org/wiki/Equestrian_statue_of_Marcus_Aurelius ; https://cgmr.carleton.edu/items/show/459
- Image file pages (Commons): see PART 1 (each candidate lists its File: page)
