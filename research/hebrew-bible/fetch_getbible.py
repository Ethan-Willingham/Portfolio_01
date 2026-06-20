#!/usr/bin/env python3
"""Fetch KJV + YLT verbatim from getbible.net v2 for the keystone ranges."""
import json, re, sys, time, urllib.request

BOOK_NR = {"Genesis":1,"Exodus":2,"Leviticus":3,"Numbers":4,"Deuteronomy":5,
           "Job":18,"Psalms":19,"Proverbs":20,"Ecclesiastes":21,"Isaiah":23,
           "Hosea":28,"Amos":30,"Micah":33}

PASSAGES = {
    "gen-creation": ["Genesis 1:1-5","Genesis 1:26-27","Genesis 2:7"],
    "gen-lech-lecha": ["Genesis 12:1-3"],
    "akedah": ["Genesis 22:1-2","Genesis 22:11-13"],
    "burning-bush": ["Exodus 3:13-15"],
    "decalogue": ["Exodus 20:1-6"],
    "holiness": ["Leviticus 19:1-2","Leviticus 19:17-18"],
    "shema": ["Deuteronomy 6:4-9"],
    "tzedek": ["Deuteronomy 16:18-20"],
    "choose-life": ["Deuteronomy 30:15-20"],
    "isaiah-justice": ["Isaiah 1:16-17"],
    "almah": ["Isaiah 7:14"],
    "amos-justice": ["Amos 5:21-24"],
    "micah": ["Micah 6:6-8"],
    "psalm-23": ["Psalms 23:1-6"],
    "kohelet": ["Ecclesiastes 1:2","Ecclesiastes 12:13-14"],
    "job-whirlwind": ["Job 38:1-7"],
    "_hosea": ["Hosea 6:6"],
    "_proverbs": ["Proverbs 9:10"],
    "_job121": ["Job 1:21"],
}

cache = {}
def chapter(tr, book, ch):
    key = (tr, book, ch)
    if key in cache: return cache[key]
    url = f"https://api.getbible.net/v2/{tr}/{BOOK_NR[book]}/{ch}.json"
    req = urllib.request.Request(url, headers={"User-Agent":"portfolio-research/1.0"})
    d = json.load(urllib.request.urlopen(req, timeout=30))
    verses = {int(v["verse"]): re.sub(r"\s+"," ", v["text"]).strip() for v in d["verses"]}
    cache[key] = verses
    time.sleep(0.25)
    return verses

def parse(ref):
    m = re.match(r"^(.*) (\d+):(\d+)(?:-(\d+))?$", ref)
    book, ch, a, b = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    return book, ch, a, int(b) if b else a

def main():
    out = {}
    for pid, refs in PASSAGES.items():
        out[pid] = {}
        for ref in refs:
            book, ch, a, b = parse(ref)
            row = {}
            for tr in ("kjv","ylt"):
                vs = chapter(tr, book, ch)
                row[tr] = [vs[n] for n in range(a, b+1) if n in vs]
            out[pid][ref] = row
            print(f"OK {ref:22s} kjv={len(row['kjv'])} ylt={len(row['ylt'])}")
    with open("research/hebrew-bible/getbible_raw.json","w",encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("saved research/hebrew-bible/getbible_raw.json")

if __name__ == "__main__":
    main()
