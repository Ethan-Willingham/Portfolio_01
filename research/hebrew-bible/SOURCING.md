# Hebrew Bible post: sourcing record

## Translations and how each was sourced (all verbatim)

| Key | Translation | Year | Source | Coverage |
|---|---|---|---|---|
| `he` | Masoretic Hebrew (Tanach with Nikkud) | Masoretic | Sefaria API v3, version "Tanach with Nikkud" | all |
| `jps1917` | JPS (Old JPS) | 1917 | Sefaria, "The Holy Scriptures: A New Translation (JPS 1917)" (PD) | all |
| `njps` | NJPS (New JPS) | 1985 | Sefaria, "Tanakh: The Holy Scriptures, published by JPS" | all |
| `fox` | Everett Fox | 1995 | Sefaria, "The Five Books of Moses, by Everett Fox" | Torah only |
| `koren` | Koren Jerusalem Bible | 1962 | Sefaria, "The Koren Jerusalem Bible" | all |
| `kjv` | King James Version | 1611 | getbible.net v2 (PD) | all |
| `ylt` | Young's Literal | 1898 | getbible.net v2 (PD) | all |
| `alter` | Robert Alter | 1996-2018 | web, verbatim-verified per below | featured passages |
| `davidson` | Koren / Steinsaltz (William Davidson Talmud) | 2012 | Sefaria, Shabbat 31a (CC-BY-NC) | Hillel only |
| `soncino` | Soncino Talmud | 1938 | halakhah.com / come-and-hear.com (verified) | Hillel only |

Hebrew, JPS1917, NJPS, Fox, Koren, KJV, YLT are machine-pulled (deterministic, see
`fetch_sefaria.py`, `fetch_getbible.py`). Alter is not online as clean full text, so it
is sourced verse by verse and only quoted where the exact wording was corroborated.

## Robert Alter, verbatim wording verified (with sources)

- **Genesis 1:1-5** "When God began to create heaven and earth, and the earth then was welter
  and waste and darkness over the deep and God's breath hovering over the waters, God said,
  'Let there be light.' And there was light. And God saw the light, that it was good, and God
  divided the light from the darkness. And God called the light Day, and the darkness he called
  Night. And it was evening and it was morning, first day."
  (jweekly 2018; greatbooksguy.com; widely corroborated)
- **Genesis 1:27** "And God created the human in his image, in the image of God he created him,
  male and female he created them." (greatbooksguy.com)
- **Genesis 2:7** "Then the Lord God fashioned the human, humus from the soil, and blew into his
  nostrils the breath of life, and the human became a living creature." (Claremont Review;
  corroborated; Alter's known adam/adamah = human/humus wordplay, nefesh = "living creature")
- **Exodus 3:14** "Ehyeh-Asher-Ehyeh, I-Will-Be-Who-I-Will-Be ... Ehyeh has sent me to you."
  (exodus-314.com; Sefaria sheets; Alter's footnote confirms "I-Will-Be-Who-I-Will-Be")
- **Deuteronomy 6:5** "And you shall love the Lord your God with all your heart and with all
  your being and with all your might." (fromthedesk.org)
- **Leviticus 19:18** "...love your fellow man as yourself..." (jcrelations.net)
- **Psalm 23** "The LORD is my shepherd, I shall not want. In grass meadows He makes me lie
  down, by quiet waters He guides me. My life He brings back. He leads me on pathways of
  justice for His name's sake. Though I walk in the vale of death's shadow, I fear no harm,
  for You are with me. Your rod and Your staff, it is they that console me. You set out a table
  before me in the face of my foes. You moisten my head with oil, my cup overflows. Let but
  goodness and kindness pursue me all the days of my life. And I shall dwell in the house of
  the LORD for many long days." (fromthedesk.org, reproducing Alter's Book of Psalms)
- **Ecclesiastes 1:2** "Merest breath, said Qohelet, merest breath. All is mere breath."
  (Patrick Reardon review; colvinism; corroborated)

In the STACK (shown as a verbatim translation): gen-creation, psalm-23, kohelet (1:2).
In the BREAKDOWNS (named with the exact distinctive phrase): all of the above.

## Hillel, Babylonian Talmud, Shabbat 31a

- **Aramaic** (Sefaria, William Davidson - Vocalized Aramaic): the convert/Shammai/Hillel
  segment, key line: "דַּעֲלָךְ סְנֵי לְחַבְרָךְ לָא תַּעֲבֵיד, זוֹ הִיא כׇּל הַתּוֹרָה כּוּלָּהּ, וְאִידַּךְ פֵּירוּשָׁהּ הוּא, זִיל גְּמוֹר."
- **Davidson/Steinsaltz** (Sefaria, CC-BY-NC): "...The same gentile came before Hillel. He
  converted him and said to him: That which is hateful to you do not do to another; that is the
  entire Torah, and the rest is its interpretation. Go study."
- **Soncino** (halakhah.com, verified): "...When he went before Hillel, he said to him, 'What is
  hateful to you, do not to your neighbour: that is the whole Torah, while the rest is the
  commentary thereof; go and learn it.'"

## Note on punctuation

Per site convention, curly quotation marks in the English translations are turned straight.
Em dashes that belong to a translator (NJPS, Alter, Young's "--") are kept verbatim; the
no-em-dash rule governs the post's own prose, not quoted sources.
