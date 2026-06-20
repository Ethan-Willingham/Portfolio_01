#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build js/analects-data.js for the Analects translation stack.

Backbone (complete, every chapter):
  - Chinese received text + James Legge (1893), parsed from the Chinese Text
    Project (ctext.org/analects), both public domain. -> raw/zh.json, raw/legge.json
  - A. Charles Muller (rev. of 1990), freely posted at acmuller.net, aligned to
    the canonical ctext numbering by matching the Chinese character stream
    (handles the books where Muller's chapter division differs). -> raw/muller.json
    Kept only where the assigned Chinese span matches ctext (462 of 503).

Keystones only (the chapters that carry a breakdown), reproduced verbatim for
comparison and study, every translator named, every passage located:
  - D. C. Lau (1979), parsed from a clean copy of the Penguin text. -> raw/lau_full.json
  - Arthur Waley (1938), read from the Internet Archive text, cross-checked
    between two scans, footnote markers removed. (curated below)
  - Robert Eno (2015), the free online teaching translation. (curated below)
  - Edward Slingerland (2003) and Roger Ames & Henry Rosemont Jr. (1998), on the
    keystones where a breakdown turns on their wording. (curated below)

Only normalization to any quotation: curly quotation marks -> straight, to match
the site. Translators' own dashes and parentheses are kept faithful.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'js', 'analects-data.js'))

def straight(s):
    s = (s.replace('‘', "'").replace('’', "'")
          .replace('“', '"').replace('”', '"')
          .replace('…', '...'))
    s = re.sub(r'\s+([.,;:?!])', r'\1', s)   # tidy spaces left by stripping footnote anchors
    s = re.sub(r'\(\s+', '(', s).replace(' )', ')')
    return s.strip()

def load(name):
    return json.load(open(os.path.join(RAW, name), encoding='utf-8'))

ZH   = load('zh.json')
LEG  = load('legge.json')
MUL  = load('muller.json')
LAUF = load('lau_full.json')

# ---- book metadata: incipit (first characters), pinyin, short English hint ----
BOOKS = [
  {"n":1, "zh":"學而",   "py":"Xué Ér",        "en":"To Learn"},
  {"n":2, "zh":"為政",   "py":"Wéi Zhèng",     "en":"To Govern"},
  {"n":3, "zh":"八佾",   "py":"Bā Yì",         "en":"Eight Rows"},
  {"n":4, "zh":"里仁",   "py":"Lǐ Rén",        "en":"Of Goodness"},
  {"n":5, "zh":"公冶長", "py":"Gōngyě Cháng",  "en":"Gongye Chang"},
  {"n":6, "zh":"雍也",   "py":"Yōng Yě",       "en":"There Is Yong"},
  {"n":7, "zh":"述而",   "py":"Shù Ér",        "en":"To Transmit"},
  {"n":8, "zh":"泰伯",   "py":"Tài Bó",        "en":"Tai Bo"},
  {"n":9, "zh":"子罕",   "py":"Zǐ Hǎn",        "en":"The Master Rarely"},
  {"n":10,"zh":"鄉黨",   "py":"Xiāng Dǎng",    "en":"In the Village"},
  {"n":11,"zh":"先進",   "py":"Xiān Jìn",      "en":"Former Students"},
  {"n":12,"zh":"顏淵",   "py":"Yán Yuān",      "en":"Yan Yuan"},
  {"n":13,"zh":"子路",   "py":"Zǐ Lù",         "en":"Zi Lu"},
  {"n":14,"zh":"憲問",   "py":"Xiàn Wèn",      "en":"Xian Asked"},
  {"n":15,"zh":"衛靈公", "py":"Wèi Líng Gōng", "en":"Duke Ling of Wei"},
  {"n":16,"zh":"季氏",   "py":"Jì Shì",        "en":"The Ji Clan"},
  {"n":17,"zh":"陽貨",   "py":"Yáng Huò",      "en":"Yang Huo"},
  {"n":18,"zh":"微子",   "py":"Wēi Zǐ",        "en":"The Viscount of Wei"},
  {"n":19,"zh":"子張",   "py":"Zǐ Zhāng",      "en":"Zi Zhang"},
  {"n":20,"zh":"堯曰",   "py":"Yáo Yuē",       "en":"Yao Said"},
]

TRANSLATORS = {
  "legge":       {"name":"James Legge",            "year":1893, "src":"Chinese Text Project (public domain)",          "full":True},
  "waley":       {"name":"Arthur Waley",           "year":1938, "src":"Internet Archive (1938 text)"},
  "lau":         {"name":"D. C. Lau",              "year":1979, "src":"Penguin Classics"},
  "muller":      {"name":"A. Charles Muller",      "year":1990, "src":"acmuller.net (free online)",                    "full":True},
  "ames":        {"name":"Ames & Rosemont",        "year":1998, "src":"A Philosophical Translation (Ballantine)"},
  "slingerland": {"name":"Edward Slingerland",     "year":2003, "src":"Hackett"},
  "eno":         {"name":"Robert Eno",             "year":2015, "src":"Indiana Univ. (free online teaching translation)"},
}

# ---- curated keystone passages (verbatim, curly quotes already straightened) ----
# Waley (1938), read from the Internet Archive scans, footnote digits removed.
WALEY = {
 "1.2": "Master Yu said, Those who in private life behave well towards their parents and elder brothers, in public life seldom show a disposition to resist the authority of their superiors. And as for such men starting a revolution, no instance of it has ever occurred. It is upon the trunk that a gentleman works. When that is firmly set up, the Way grows. And surely proper behaviour towards parents and elder brothers is the trunk of Goodness?",
 "2.1": "He who rules by moral force (te) is like the pole-star, which remains in its place while all the lesser stars do homage to it.",
 "2.4": "At fifteen I set my heart upon learning. At thirty, I had planted my feet firm upon the ground. At forty, I no longer suffered from perplexities. At fifty, I knew what were the biddings of Heaven. At sixty, I heard them with docile ear. At seventy, I could follow the dictates of my own heart; for what I desired no longer overstepped the boundaries of right.",
 "4.8": "In the morning, hear the Way; in the evening, die content!",
 "4.15": "The Master said, Shen! My Way has one (thread) that runs right through it. Master Tseng said, Yes. When the Master had gone out, the disciples asked, saying, What did he mean? Master Tseng said, Our Master's Way is simply this: Loyalty, consideration.",
 "12.1": "Yen Hui asked about Goodness. The Master said, He who can himself submit to ritual is Good. If (a ruler) could for one day himself submit to ritual, everyone under Heaven would respond to his Goodness. For Goodness is something that must have its source in the ruler himself; it cannot be got from others.",
 "15.24": "Tzu-kung asked saying, Is there any single saying that one can act upon all day and every day? The Master said, Perhaps the saying about consideration: Never do to others what you would not like them to do to you.",
 "17.2": "By nature, near together; by practice far apart.",
 "17.19": "Heaven does not speak; yet the four seasons run their course thereby, the hundred creatures, each after its kind, are born thereby. Heaven does no speaking!",
}
# Robert Eno (2015), the free online teaching translation (en-dashes are his).
ENO = {
 "1.1": "The Master said: To study and at due times practice what one has studied, is this not a pleasure? When friends come from distant places, is this not joy? To remain unsoured when his talents are unrecognized, is this not a junzi?",
 "2.1": "The Master said: When one rules by means of virtue it is like the North Star – it dwells in its place and the other stars pay reverence to it.",
 "2.3": "The Master said: Guide them with policies and align them with punishments and the people will be evasive and without shame. Guide them by virtue and align them with li and the people will have a sense of shame and fulfill their roles.",
 "2.4": "The Master said: When I was fifteen I set my heart on learning. At thirty I took my stand. At forty I was without confusion. At fifty I knew the command of Tian. At sixty I heard it with a compliant ear. At seventy I follow the desires of my heart and do not overstep the bounds.",
 "4.15": "The Master said, Shen, a single thread runs through my dao. Master Zeng said, Yes. The Master went out, and the other disciples asked, What did he mean? Master Zeng said, The Master's dao is nothing other than loyalty and reciprocity.",
 "7.1": "The Master said, To transmit but not create, to be faithful in loving the old – in this I dare compare myself to Old Peng.",
 "17.19": "The Master said, I wish to be wordless. Zigong said, If you do not speak, then what will we your followers have to pass on? The Master said, What does Tian ever say? Yet the four seasons turn and the things of the world are born. What does Tian ever say?",
}
# Edward Slingerland (2003), Hackett.
SLING = {
 "2.15": "If you learn without thinking about what you have learned, you will be lost. If you think without learning, however, you will fall into danger.",
 "15.24": "Do not impose upon others what you yourself do not desire.",
}
# Ames & Rosemont (1998), the philosophical translation: ren as "authoritative conduct".
AMES = {
 "12.1": "Yan Hui inquired about authoritative conduct (ren). The Master replied, Through self-discipline and observing ritual propriety (li) one becomes authoritative in one's conduct. If for the space of a day one were able to accomplish this, the whole empire would defer to this authoritative model. Becoming authoritative in one's conduct is self-originating; how could it originate with others?",
 "15.24": "Do not impose on others what you yourself do not want.",
}

# keystones that carry a breakdown (used to pull Lau cleanly from lau_full.json)
KEYSTONES = ["1.1","1.2","2.1","2.3","2.4","2.15","4.8","4.15","6.30","7.1",
             "12.1","12.2","13.3","15.24","17.2","17.19"]

def lau_clean(r):
    if r not in LAUF: return None
    t = straight(LAUF[r])
    t = t.replace(' tO ', ' to ').replace('said. ', 'said, ')   # OCR drop-cap fixes
    t = re.sub(r'\s+', ' ', t).strip()
    return t

LAU = {r: lau_clean(r) for r in KEYSTONES if lau_clean(r)}

# assemble per-translator keystone tables
EXTRAS = {"waley": WALEY, "eno": ENO, "slingerland": SLING, "ames": AMES, "lau": LAU}

# ---- build chapters ----
def refnum(r): a,b = r.split('.'); return (int(a), int(b))
chapters = []
for r in sorted(ZH, key=refnum):
    b, c = refnum(r)
    v = []
    if LEG.get(r):  v.append({"k":"legge",  "t": straight(LEG[r])})
    if MUL.get(r):  v.append({"k":"muller", "t": straight(MUL[r])})
    for k, table in EXTRAS.items():
        if r in table and table[r]:
            v.append({"k":k, "t": straight(table[r])})
    chapters.append({"b":b, "c":c, "zh":ZH[r], "v":v})

# n-count per translator
counts = {}
for ch in chapters:
    for v in ch["v"]:
        counts[v["k"]] = counts.get(v["k"], 0) + 1
for k in TRANSLATORS:
    TRANSLATORS[k]["n"] = counts.get(k, 0)

order = sorted(TRANSLATORS, key=lambda k: TRANSLATORS[k]["year"])
data = {"translators": TRANSLATORS, "order": order, "books": BOOKS, "chapters": chapters}

with open(OUT, 'w', encoding='utf-8') as f:
    f.write("window.ANA=")
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(";\n")

print("wrote", OUT)
print("chapters:", len(chapters))
print("translator coverage:", {k: counts.get(k,0) for k in TRANSLATORS})
print("size: %.0f KB" % (os.path.getsize(OUT)/1024))
# sanity: keystone stacks
for r in ["12.1","15.24","2.4"]:
    b,c = refnum(r); ch = next(x for x in chapters if x["b"]==b and x["c"]==c)
    print(f"  {r}: {[v['k'] for v in ch['v']]}")
