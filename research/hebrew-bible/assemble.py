#!/usr/bin/env python3
"""
Assemble js/hebrew-bible-data.js from the fetched corpora plus the manually
verified Alter / Talmud / transliteration data. Pure local; no network.
"""
import json, re

SEF = json.load(open("research/hebrew-bible/sefaria_raw.json", encoding="utf-8"))
GB = json.load(open("research/hebrew-bible/getbible_raw.json", encoding="utf-8"))

def straighten(s):
    if not s:
        return s
    s = s.replace("<FI>", "[").replace("<Fi>", "]")
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s)
    return (s.replace("’", "'").replace("‘", "'")
             .replace("“", '"').replace("”", '"')
             .replace(" ", " ").strip())

GAP = " … "  # ellipsis between non-contiguous verse ranges

def sef_rows(pid):
    return {r["ref"]: r for r in SEF[pid]["ranges"]}

def join_he(pid, refs):
    rows = sef_rows(pid)
    blocks = []
    for ref in refs:
        v = rows[ref].get("he")
        if v:
            blocks.append(" ".join(x for x in v if x))
    return GAP.join(blocks)

def join_en(pid, refs, key, source):
    blocks = []
    for ref in refs:
        if source == "sef":
            v = sef_rows(pid)[ref].get(key)
        else:  # getbible
            v = GB[pid].get(ref, {}).get(key)
        if v:
            blocks.append(straighten(" ".join(x for x in v if x)))
        else:
            return None  # missing for at least one range -> treat as absent
    return GAP.join(blocks)

# ---- manually verified Alter (verbatim; see SOURCING.md) ----
ALTER = {
 "gen-creation": ("When God began to create heaven and earth, and the earth then was welter and "
   "waste and darkness over the deep and God's breath hovering over the waters, God said, 'Let "
   "there be light.' And there was light. And God saw the light, that it was good, and God divided "
   "the light from the darkness. And God called the light Day, and the darkness he called Night. "
   "And it was evening and it was morning, first day." + GAP +
   "And God created the human in his image, in the image of God he created him, male and female he "
   "created them." + GAP +
   "Then the Lord God fashioned the human, humus from the soil, and blew into his nostrils the "
   "breath of life, and the human became a living creature."),
 "psalm-23": ("The LORD is my shepherd, I shall not want. In grass meadows He makes me lie down, "
   "by quiet waters He guides me. My life He brings back. He leads me on pathways of justice for "
   "His name's sake. Though I walk in the vale of death's shadow, I fear no harm, for You are with "
   "me. Your rod and Your staff—it is they that console me. You set out a table before me in "
   "the face of my foes. You moisten my head with oil, my cup overflows. Let but goodness and "
   "kindness pursue me all the days of my life. And I shall dwell in the house of the LORD for many "
   "long days."),
 "kohelet": "Merest breath, said Qohelet, merest breath. All is mere breath.",
}

# ---- Hillel, Shabbat 31a ----
HILLEL_HE = ("שׁוּב מַעֲשֶׂה בְּגוֹי אֶחָד שֶׁבָּא לִפְנֵי שַׁמַּאי. אָמַר לוֹ: גַּיְּירֵנִי עַל מְנָת שֶׁתְּלַמְּדֵנִי כׇּל הַתּוֹרָה כּוּלָּהּ "
  "כְּשֶׁאֲנִי עוֹמֵד עַל רֶגֶל אַחַת! דְּחָפוֹ בְּאַמַּת הַבִּנְיָן שֶׁבְּיָדוֹ. בָּא לִפְנֵי הִלֵּל, גַּיְירֵיהּ. אָמַר לוֹ: דַּעֲלָךְ סְנֵי "
  "לְחַבְרָךְ לָא תַּעֲבֵיד — זוֹ הִיא כׇּל הַתּוֹרָה כּוּלָּהּ, וְאִידַּךְ פֵּירוּשָׁהּ הוּא, זִיל גְּמוֹר.")
HILLEL_DAVIDSON = ("There was another incident involving one gentile who came before Shammai and "
  "said to Shammai: Convert me on condition that you teach me the entire Torah while I am standing "
  "on one foot. Shammai pushed him away with the builder's cubit in his hand. The same gentile came "
  "before Hillel. He converted him and said to him: That which is hateful to you do not do to "
  "another; that is the entire Torah, and the rest is its interpretation. Go study.")
HILLEL_SONCINO = ("On another occasion it happened that a certain heathen came before Shammai and "
  "said to him, 'Make me a proselyte, on condition that you teach me the whole Torah while I stand "
  "on one foot.' Thereupon he repulsed him with the builder's cubit which was in his hand. When he "
  "went before Hillel, he said to him, 'What is hateful to you, do not to your neighbour: that is "
  "the whole Torah, while the rest is the commentary thereof; go and learn it.'")

# ---- transliteration of the signature line (Tetragrammaton voiced as Adonai, per reading) ----
TRANSLIT = {
 "hillel": "Da'alakh s'nei l'chavrakh la ta'aveid; zo hi kol haTorah kulah, v'idakh perushah hu, zil g'mor.",
 "gen-creation": "B'reshit bara Elohim et hashamayim v'et ha'aretz.",
 "gen-lech-lecha": "Lech l'cha me'artz'cha umimoladt'cha umibeit avicha el ha'aretz asher ar'eka.",
 "akedah": "Vayomer hineni. (“Here I am.”)",
 "burning-bush": "Ehyeh asher ehyeh.",
 "decalogue": "Anochi Adonai Elohecha asher hotzeticha me'eretz Mitzrayim.",
 "holiness": "V'ahavta l're'acha kamocha, ani Adonai.",
 "shema": "Sh'ma Yisrael, Adonai Eloheinu, Adonai echad. V'ahavta et Adonai Elohecha.",
 "tzedek": "Tzedek tzedek tirdof.",
 "choose-life": "Uvacharta bachayim, l'ma'an tichyeh atah v'zar'echa.",
 "isaiah-justice": "Limdu heitev, dirshu mishpat, ash'ru chamotz.",
 "almah": "Hinei ha'almah harah v'yoledet ben, v'karat sh'mo Immanu'el.",
 "amos-justice": "V'yigal kamayim mishpat, utzdakah k'nachal eitan.",
 "micah": "Asot mishpat v'ahavat chesed v'hatzne'a lechet im Elohecha.",
 "psalm-23": "Adonai ro'i, lo echsar.",
 "kohelet": "Havel havalim, amar Kohelet, havel havalim, hakol havel.",
 "job-whirlwind": "Mi zeh machshich etzah b'milin b'li da'at.",
}

# ---- passage metadata: (id, section, ref-display, index-label, sefaria-ranges) ----
P = [
 ("hillel", "talmud", "Shabbat 31a", "On one foot", None),
 ("gen-creation", "torah", "Genesis 1:1-5, 26-27; 2:7", "Creation",
    ["Genesis 1:1-5", "Genesis 1:26-27", "Genesis 2:7"]),
 ("gen-lech-lecha", "torah", "Genesis 12:1-3", "Call of Abraham", ["Genesis 12:1-3"]),
 ("akedah", "torah", "Genesis 22:1-2, 11-13", "The binding",
    ["Genesis 22:1-2", "Genesis 22:11-13"]),
 ("burning-bush", "torah", "Exodus 3:13-15", "The Name", ["Exodus 3:13-15"]),
 ("decalogue", "torah", "Exodus 20:1-6", "Ten Words", ["Exodus 20:1-6"]),
 ("holiness", "torah", "Leviticus 19:1-2, 17-18", "Love your neighbor",
    ["Leviticus 19:1-2", "Leviticus 19:17-18"]),
 ("shema", "torah", "Deuteronomy 6:4-9", "The Shema", ["Deuteronomy 6:4-9"]),
 ("tzedek", "torah", "Deuteronomy 16:18-20", "Justice, justice", ["Deuteronomy 16:18-20"]),
 ("choose-life", "torah", "Deuteronomy 30:15-20", "Choose life", ["Deuteronomy 30:15-20"]),
 ("isaiah-justice", "neviim", "Isaiah 1:16-17", "Seek justice", ["Isaiah 1:16-17"]),
 ("almah", "neviim", "Isaiah 7:14", "The young woman", ["Isaiah 7:14"]),
 ("amos-justice", "neviim", "Amos 5:21-24", "Let justice roll", ["Amos 5:21-24"]),
 ("micah", "neviim", "Micah 6:6-8", "Do justice", ["Micah 6:6-8"]),
 ("psalm-23", "ketuvim", "Psalm 23", "Psalm 23", ["Psalms 23:1-6"]),
 ("kohelet", "ketuvim", "Ecclesiastes 1:2", "Mere breath", ["Ecclesiastes 1:2"]),
 ("job-whirlwind", "ketuvim", "Job 38:1-7", "The whirlwind", ["Job 38:1-7"]),
]

TRANSLATORS = {
 "jps1917": {"name": "JPS", "year": 1917},
 "njps":    {"name": "NJPS", "year": 1985},
 "alter":   {"name": "Robert Alter", "year": 2018},
 "fox":     {"name": "Everett Fox", "year": 1995},
 "koren":   {"name": "Koren Jerusalem", "year": 1962},
 "kjv":     {"name": "King James Version", "year": 1611},
 "ylt":     {"name": "Young's Literal", "year": 1898},
 "davidson":{"name": "Koren Talmud (Steinsaltz)", "year": 2012},
 "soncino": {"name": "Soncino", "year": 1938},
}
ORDER = ["kjv", "ylt", "jps1917", "soncino", "koren", "njps", "fox", "davidson", "alter"]
SECTIONS = [
 {"id": "talmud", "he": "תַּלְמוּד", "en": "The Oral Torah", "sub": "how the text is read"},
 {"id": "torah", "he": "תּוֹרָה", "en": "Torah", "sub": "the Teaching"},
 {"id": "neviim", "he": "נְבִיאִים", "en": "Nevi'im", "sub": "the Prophets"},
 {"id": "ketuvim", "he": "כְּתוּבִים", "en": "Ketuvim", "sub": "the Writings"},
]

def build():
    passages = []
    for pid, sec, ref, label, refs in P:
        entry = {"id": pid, "sec": sec, "ref": ref, "label": label}
        if pid == "hillel":
            entry["he"] = HILLEL_HE
            entry["lang"] = "he"  # Aramaic, rendered in the Hebrew face
            entry["translit"] = TRANSLIT[pid]
            entry["v"] = [
                {"k": "davidson", "t": HILLEL_DAVIDSON},
                {"k": "soncino", "t": HILLEL_SONCINO},
            ]
            passages.append(entry)
            continue
        entry["he"] = join_he(pid, refs)
        entry["translit"] = TRANSLIT[pid]
        v = []
        for key, src in (("jps1917", "sef"), ("njps", "sef"), ("fox", "sef"),
                         ("koren", "sef"), ("kjv", "gb"), ("ylt", "gb")):
            t = join_en(pid, refs, key, src)
            if t:
                v.append({"k": key, "t": t})
        if pid in ALTER:
            v.append({"k": "alter", "t": straighten(ALTER[pid])})
        entry["v"] = v
        passages.append(entry)
    return {"translators": TRANSLATORS, "order": ORDER, "sections": SECTIONS, "passages": passages}

def main():
    hb = build()
    body = json.dumps(hb, ensure_ascii=False, indent=1)
    header = ("/* ============================================================\n"
              "   The Hebrew Bible, side by side: the corpus.\n"
              "   Curated keystone passages of the Tanakh. Per passage: the\n"
              "   pointed Masoretic Hebrew (Aramaic for the Talmud entry), a\n"
              "   transliteration of the signature line, and the English\n"
              "   translations stacked, all reproduced verbatim. Built by\n"
              "   research/hebrew-bible/assemble.py from machine-pulled sources\n"
              "   (Sefaria, getbible) plus verbatim-verified Alter and Talmud.\n"
              "   See research/hebrew-bible/SOURCING.md. No em dashes in site\n"
              "   prose; em dashes inside quotations are the translators' own.\n"
              "   ============================================================ */\n")
    with open("js/hebrew-bible-data.js", "w", encoding="utf-8") as f:
        f.write(header + "window.HB = " + body + ";\n")
    # quick report
    print("passages:", len(hb["passages"]))
    for p in hb["passages"]:
        keys = ",".join(v["k"] for v in p["v"])
        he_ok = "Y" if p.get("he") else "N"
        print(f"  {p['id']:16s} he={he_ok} [{keys}]")

if __name__ == "__main__":
    main()
