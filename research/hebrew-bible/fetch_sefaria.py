#!/usr/bin/env python3
"""
Fetch verbatim Tanakh text from the Sefaria API (v3) for the keystone passages.
Pulls, per passage range: the pointed Hebrew + JPS1917 + NJPS1985 + Fox + Koren.
Pure HTTP; no model inference. Saves raw verse arrays to sefaria_raw.json.
"""
import json, re, sys, time, urllib.parse, urllib.request

API = "https://www.sefaria.org/api/v3/texts/"

# version titles exactly as Sefaria lists them
HE_NIKKUD = "Tanach with Nikkud"
HE_MASORAH = "Miqra according to the Masorah"
V_JPS1917 = "The Holy Scriptures: A New Translation (JPS 1917)"
V_NJPS = "Tanakh: The Holy Scriptures, published by JPS"
V_FOX = "The Five Books of Moses, by Everett Fox. New York, Schocken Books, 1995"
V_KOREN = "The Koren Jerusalem Bible"

EN_VERSIONS = [("jps1917", V_JPS1917), ("njps", V_NJPS), ("fox", V_FOX), ("koren", V_KOREN)]

# passage id -> list of contiguous ranges (Sefaria ref form)
PASSAGES = {
    "gen-creation": ["Genesis 1:1-5", "Genesis 1:26-27", "Genesis 2:7"],
    "gen-lech-lecha": ["Genesis 12:1-3"],
    "akedah": ["Genesis 22:1-2", "Genesis 22:11-13"],
    "burning-bush": ["Exodus 3:13-15"],
    "decalogue": ["Exodus 20:1-6"],
    "holiness": ["Leviticus 19:1-2", "Leviticus 19:17-18"],
    "shema": ["Deuteronomy 6:4-9"],
    "tzedek": ["Deuteronomy 16:18-20"],
    "choose-life": ["Deuteronomy 30:15-20"],
    "isaiah-justice": ["Isaiah 1:16-17"],
    "almah": ["Isaiah 7:14"],
    "amos-justice": ["Amos 5:21-24"],
    "micah": ["Micah 6:6-8"],
    "psalm-23": ["Psalms 23:1-6"],
    "kohelet": ["Ecclesiastes 1:2", "Ecclesiastes 12:13-14"],
    "job-whirlwind": ["Job 38:1-7"],
    # fold-ins, fetched for note accuracy only
    "_hosea": ["Hosea 6:6"],
    "_proverbs": ["Proverbs 9:10"],
    "_job121": ["Job 1:21"],
}

TAG = re.compile(r"<[^>]+>")
FOOTNOTE = re.compile(r"\{[^}]*\}")  # Fox uses {S} style markers sometimes

def clean(s):
    if s is None:
        return None
    if isinstance(s, list):
        s = " ".join(clean(x) or "" for x in s)
    s = TAG.sub("", s)
    s = s.replace("&nbsp;", " ").replace("&thinsp;", " ")
    s = s.replace("&#8217;", "’").replace("&#8216;", "‘")
    s = s.replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def fetch(ref, versions):
    q = "&".join("version=" + urllib.parse.quote(v) for v in versions) + "&return_format=text_only"
    url = API + urllib.parse.quote(ref) + "?" + q
    req = urllib.request.Request(url, headers={"User-Agent": "portfolio-research/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def version_text(data, title):
    """pull the verse-array text for a given versionTitle from a v3 response"""
    for v in data.get("versions", []):
        if v.get("versionTitle") == title:
            t = v.get("text")
            if isinstance(t, list):
                return [clean(x) for x in t]
            return [clean(t)]
    return None

def main():
    out = {}
    want_he = ["hebrew|" + HE_NIKKUD, "hebrew|" + HE_MASORAH]
    want_en = ["english|" + t for _, t in EN_VERSIONS]
    for pid, refs in PASSAGES.items():
        out[pid] = {"refs": refs, "ranges": []}
        for ref in refs:
            try:
                data = fetch(ref, want_he + want_en)
            except Exception as e:
                print(f"ERR {ref}: {e}", file=sys.stderr)
                out[pid]["ranges"].append({"ref": ref, "error": str(e)})
                time.sleep(0.5)
                continue
            he = version_text(data, HE_NIKKUD) or version_text(data, HE_MASORAH)
            row = {"ref": ref, "he": he}
            for key, title in EN_VERSIONS:
                row[key] = version_text(data, title)
            out[pid]["ranges"].append(row)
            got = [k for k, _ in EN_VERSIONS if row.get(k)]
            print(f"OK  {ref:24s} he={'Y' if he else 'N'} en={','.join(got)}")
            time.sleep(0.35)
    with open("research/hebrew-bible/sefaria_raw.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("\nsaved research/hebrew-bible/sefaria_raw.json")

if __name__ == "__main__":
    main()
