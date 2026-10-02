#!/usr/bin/env python3
"""Repair Thanissaro verse alignment and label shared passages in the existing corpus.

Run with --source-dir /path/to/ati-pages to use saved than.01.html to than.26.html.
Include woodward.txt in that directory, or pass --woodward-file separately.
Otherwise fetch the chapter pages and Gutenberg text. Quoted text is
normalized only as in the original build: straight quotes and whitespace.
"""
import argparse
import concurrent.futures
import html
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "js/dhammapada-data.js"


def tidy(source):
    text = html.unescape(re.sub(r"<[^>]+>", "", source))
    for char in ("\u201c", "\u201d", "\u2033"):
        text = text.replace(char, '"')
    for char in ("\u2018", "\u2019", "\u02bc"):
        text = text.replace(char, "'")
    text = "\n".join(re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text.strip("\n"))


def parse_chapter(raw):
    out = {}
    heads = list(re.finditer(r"<h5\b[^>]*>(.*?)</h5>", raw, re.S | re.I))
    for i, heading in enumerate(heads):
        numbers = [int(n) for n in re.findall(r"\d+", tidy(heading.group(1)))]
        if not numbers:
            continue
        lo, hi = min(numbers), max(numbers)
        end = heads[i + 1].start() if i + 1 < len(heads) else len(raw)
        # Bound each search by its own heading. Empty p/anchor elements between
        # the heading and poem must never let a regex consume the next heading.
        poem = re.search(r'<div\s+class=[\'\"]freeverse[\'\"][^>]*>(.*?)</div>', raw[heading.end():end], re.S | re.I)
        if not poem:
            raise ValueError(f"No poem for verses {lo}-{hi}")
        body = poem.group(1)
        anchors = list(re.finditer(r'<a\b[^>]*\bid=[\'\"]dhp-(\d+)[\'\"][^>]*>(.*?)</a>', body, re.S | re.I))
        slices = [(lo, 0)] + [(int(a.group(1)), a.start()) for a in anchors]
        labels = [n for n, _ in slices]
        if labels != sorted(set(labels)) or any(n < lo or n > hi for n in labels):
            raise ValueError(f"Invalid labels {labels} in {lo}-{hi}")
        pending = None
        for j, (number, start) in enumerate(slices):
            stop = slices[j + 1][1] if j + 1 < len(slices) else len(body)
            last = slices[j + 1][0] - 1 if j + 1 < len(slices) else hi
            text = tidy(body[start:stop])
            if pending is None:
                pending = number
            if not text:
                continue
            for n in range(pending, last + 1):
                if n in out:
                    raise ValueError(f"Repeated verse {n}")
                out[n] = {"t": text, "range": [pending, last]}
            pending = None
        if pending is not None:
            raise ValueError(f"Empty trailing passage {pending}-{hi}")
    return out


def parse_woodward(raw):
    raw = raw.replace("\r\n", "\n")
    start = re.search(r"(?m)^\s*1\.\s*$", raw)
    if not start:
        raise ValueError("Missing Woodward first verse")
    end = raw.find("*** END")
    lines = raw[start.start():end if end > 0 else len(raw)].split("\n")
    out, i, last = {}, 0, 0
    while i < len(lines):
        label = re.match(r"^\s*(\d+(?:\s*[,-]\s*\d+)?)\.?\s*(.*)$", lines[i])
        if not label:
            i += 1
            continue
        numbers = re.findall(r"\d+", label.group(1))
        lo, hi = int(numbers[0]), int(numbers[-1])
        if hi < lo and len(numbers[-1]) < len(numbers[0]):
            hi = int(numbers[0][:-len(numbers[-1])] + numbers[-1])
        # Errata in Gutenberg 35185's source numbering, checked against the
        # Pali sequence and the parallel translations. Verse 387 is absent.
        if lo == hi == 268:
            hi = 269
        elif lo == hi == 387:
            lo = hi = 388
        elif lo == hi == 388:
            lo = hi = 389
        elif lo == hi == 415 and last == 417:
            lo = hi = 418
        if lo <= last or hi > 423:
            i += 1
            continue
        stanza = [re.sub(r"\[\d+\]", "", label.group(2)).strip()]
        i += 1
        while i < len(lines) and lines[i].strip():
            stanza.append(re.sub(r"\[\d+\]", "", lines[i]).strip())
            i += 1
        text = tidy("\n".join(line for line in stanza if line))
        if text:
            for n in range(lo, hi + 1):
                out[n] = {"t": text, "range": [lo, hi]}
            last = hi
    if set(out) != set(range(1, 424)) - {387}:
        raise ValueError("Woodward must cover 422 verses, with only 387 missing")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=pathlib.Path)
    parser.add_argument("--woodward-file", type=pathlib.Path)
    args = parser.parse_args()

    def fetch(chapter):
        if args.source_dir:
            return args.source_dir.joinpath(f"than.{chapter:02}.html").read_text()
        url = f"https://www.accesstoinsight.org/tipitaka/kn/dhp/dhp.{chapter:02}.than.html"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode("utf-8")

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        chapters = list(pool.map(fetch, range(1, 27)))
    corrected = {}
    for raw in chapters:
        chapter = parse_chapter(raw)
        if corrected.keys() & chapter.keys():
            raise ValueError("Verse repeated across chapters")
        corrected.update(chapter)
    if set(corrected) != set(range(1, 424)):
        raise ValueError("Source does not cover exactly 423 verses")
    woodward_file = args.woodward_file or (args.source_dir / "woodward.txt" if args.source_dir else None)
    if woodward_file:
        woodward = parse_woodward(woodward_file.read_text())
    else:
        with urllib.request.urlopen("https://www.gutenberg.org/cache/epub/35185/pg35185.txt", timeout=30) as response:
            woodward = parse_woodward(response.read().decode("utf-8"))

    source = DATA.read_text()
    prefix = "window.DHP="
    if not source.startswith(prefix):
        raise ValueError("Unexpected data wrapper")
    data = json.loads(source[len(prefix):].strip().rstrip(";"))
    # The legacy build fetched Gutenberg 35185 under the wrong author's key.
    # That source is Woodward's 1921 edition, not Wagiswara and Saunders.
    if "wagiswara" in data["translators"]:
        metadata = data["translators"].pop("wagiswara")
        metadata.update({"name": "F. L. Woodward", "year": 1921})
        data["translators"]["woodward"] = metadata
        data["order"] = ["woodward" if k == "wagiswara" else k for k in data["order"]]
        for verse in data["verses"]:
            for entry in verse["v"]:
                if entry["k"] == "wagiswara":
                    entry["k"] = "woodward"
    changed = []
    for verse in data["verses"]:
        entry = next(v for v in verse["v"] if v["k"] == "thanissaro")
        if entry["t"] != corrected[verse["n"]]["t"]:
            changed.append(verse["n"])
        entry.update(corrected[verse["n"]])
        verse["v"] = [entry for entry in verse["v"] if entry["k"] != "woodward"]
        if verse["n"] in woodward:
            verse["v"].append({"k": "woodward", **woodward[verse["n"]]})
        verse["v"].sort(key=lambda entry: data["translators"][entry["k"]]["year"])
    data["translators"]["woodward"]["n"] = len(woodward)

    # Bilara includes chapter/collection colophons under the final verse UID.
    # They are editorial closing lines, not part of the numbered verse.
    for chapter in data["vaggas"]:
        verse = data["verses"][chapter["to"] - 1]
        lines = verse["pali"].split("\n")
        for i, line in enumerate(lines):
            if re.match(r"^\S+vaggo \S+\.$", line):
                verse["pali"] = "\n".join(lines[:i]).rstrip()
                break
    final = next(entry for entry in data["verses"][-1]["v"] if entry["k"] == "sujato")
    final["t"] = final["t"].replace("\nThe Sayings of the Dhamma are complete.", "").rstrip()

    # The original build duplicated combined passages at each verse number.
    # Identify those identical adjacent entries, confined to one chapter.
    for key in data["translators"]:
        if key in ("thanissaro", "woodward"):
            continue
        previous = []

        def mark_group():
            if len(previous) > 1:
                shared = [previous[0][0], previous[-1][0]]
                for _, _, entry in previous:
                    entry["range"] = shared

        for verse in data["verses"]:
            entry = next((v for v in verse["v"] if v["k"] == key), None)
            if previous and (entry is None or previous[-1][1] != verse["vg"] or previous[-1][2]["t"] != entry["t"]):
                mark_group()
                previous = []
            if entry:
                previous.append((verse["n"], verse["vg"], entry))
        mark_group()
    result = prefix + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    DATA.write_text(result)
    print(f"423 Thanissaro verses checked. Corrected text at {changed}. Woodward: {len(woodward)} verses.")


if __name__ == "__main__":
    main()
