#!/usr/bin/env python3
# coding: utf-8
"""
Incremental long-tail merge for the Dhammapada corpus.

build_dhp.py rebuilds the whole corpus from the raw sources in /tmp/dhp (it also
merges extras.json if present). When you only want to fold a new batch of the
in-copyright long tail (research/dhammapada/extras.json + extras-meta.json) into
the EXISTING js/dhammapada-data.js, without re-fetching the seven-translation
backbone, run this instead. It reads the committed data.js, splices the extras in
exactly the way build_dhp.py would, and writes data.js back. The diff is then only
the new translators on the verses they cover; every backbone verse is untouched.

This is byte-for-byte equivalent to what build_dhp.py emits for the same extras
files, so a future from-scratch `build_dhp.py` run reproduces the same result.

Only normalization applied to the extras text: curly quotes -> straight (the same
straight() as build_dhp.py). Diacritics and every other character are left as-is.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "js", "dhammapada-data.js")
EXTRAS = os.path.join(HERE, "extras.json")
EXTRA_META = os.path.join(HERE, "extras-meta.json")

def straight(s):
    """Curly -> straight quotes only; everything else faithful (matches build_dhp.py)."""
    return (s.replace('“', '"').replace('”', '"').replace('″', '"')
             .replace('‘', "'").replace('’', "'").replace('ʼ', "'"))

def main():
    raw = open(DATA, encoding='utf-8').read().strip()
    assert raw.startswith("window.DHP=") and raw.endswith(";"), "unexpected data.js shape"
    DHP = json.loads(raw[len("window.DHP="):-1])

    extras = json.load(open(EXTRAS, encoding='utf-8'))
    extra_meta = json.load(open(EXTRA_META, encoding='utf-8'))

    translators = DHP["translators"]

    # verses each extra translator appears on
    ecount = {}
    for _v, m in extras.items():
        for tk in m:
            ecount[tk] = ecount.get(tk, 0) + 1

    # register / refresh the extra translators (appended after the backbone, as in build_dhp.py)
    for tk, meta in extra_meta.items():
        translators[tk] = {"name": meta["name"], "year": meta["year"],
                           "n": ecount.get(tk, 0), "src": meta.get("src", "")}

    # order: year then name, across all translators (same key as build_dhp.py)
    order = sorted(translators, key=lambda k: (translators[k]["year"], translators[k]["name"]))
    DHP["order"] = order

    # splice extras into each covered verse; rebuild that verse's list to follow `order`
    by_n = {v["n"]: v for v in DHP["verses"]}
    touched = 0
    for vs, m in extras.items():
        n = int(vs)
        verse = by_n[n]
        have = {e["k"]: e["t"] for e in verse["v"]}   # existing backbone text, verbatim
        for tk, t in m.items():
            have[tk] = straight(t)
        verse["v"] = [{"k": k, "t": have[k]} for k in order if k in have]
        touched += 1

    js = "window.DHP=" + json.dumps(DHP, ensure_ascii=False, separators=(',', ':')) + ";\n"
    open(DATA, "w", encoding='utf-8').write(js)

    quotes = sum(len(m) for m in extras.values())
    print(f"merged {quotes} extra quotes across {touched} verses")
    print(f"extra translators: " + ", ".join(f"{tk} (n={ecount[tk]})" for tk in extra_meta))
    print(f"translators now: {len(translators)}  order: {order}")
    print(f"wrote {os.path.relpath(DATA, os.getcwd())} ({os.path.getsize(DATA)/1024:.0f} KB)")

if __name__ == "__main__":
    main()
