#!/usr/bin/env python3
# coding: utf-8
"""
Dhammapada corpus build (reproducible).

Reads the raw sources in /tmp/dhp (see BUILD.md for the fetch commands) and emits
/tmp/dhammapada-data.js  ->  copy to js/dhammapada-data.js.

Backbone (complete, verbatim, non-OCR):
  pali          SuttaCentral bilara root-pli-ms      (CC0)  -> the SOURCE slot
  sujato        SuttaCentral, Bhikkhu Sujato 2021    (CC0)
  suddhaso      SuttaCentral, Bhikkhu Suddhaso 2016   (CC-BY-NC)
  thanissaro    Access to Insight, 1997              (free distribution)
  buddharakkhita Access to Insight, 1985             (free distribution)
  muller        Project Gutenberg #2017, 1881        (public domain)
  kaviratna     Theosophical Univ Press, 1980        (free online)

Long tail (in-copyright, keystone verses only): research/dhammapada/extras.json,
shape { "<verse>": { "<translator-key>": "text" } }, merged if present.

Only normalization applied to verbatim text: curly quotes -> straight (matches the
Tao build and the site's typography). Dashes are left exactly as the translator set
them. My own prose (the breakdowns) carries no em dashes; quotations stay faithful.
"""
import json, re, os, sys, glob, html

D = "/tmp/dhp"
OUT = "/tmp/dhammapada-data.js"

# 26 SuttaCentral vagga file stems, in canon order, with verse ranges.
STEMS = ["dhp1-20","dhp21-32","dhp33-43","dhp44-59","dhp60-75","dhp76-89",
    "dhp90-99","dhp100-115","dhp116-128","dhp129-145","dhp146-156","dhp157-166",
    "dhp167-178","dhp179-196","dhp197-208","dhp209-220","dhp221-234","dhp235-255",
    "dhp256-272","dhp273-289","dhp290-305","dhp306-319","dhp320-333","dhp334-359",
    "dhp360-382","dhp383-423"]

# ------------------------------------------------------------------ helpers
def straight(s):
    """Curly -> straight quotes only; everything else faithful."""
    return (s.replace('“','"').replace('”','"').replace('″','"')
             .replace('‘',"'").replace('’',"'").replace('ʼ',"'"))

def unent(s):
    return html.unescape(s)

def detag(s):
    return re.sub(r'<[^>]+>', '', s)

def numrange(label):
    """'138,139,140' or '153-154' or '5' -> (lo, hi)."""
    nums = [int(x) for x in re.findall(r'\d+', label)]
    return (min(nums), max(nums)) if nums else (None, None)

def numrange_abbr(label):
    """Like numrange but expands the elided-digit ranges Wagiswara uses:
    '271-2' -> (271,272), '246-7' -> (246,247), '153,154' -> (153,154)."""
    toks = re.findall(r'\d+', label)
    if not toks: return (None, None)
    a = int(toks[0])
    if len(toks) == 1: return (a, a)
    b = int(toks[-1])
    if b < a and len(toks[-1]) < len(str(a)):       # abbreviated second number
        pa = str(a); b = int(pa[:len(pa) - len(toks[-1])] + toks[-1])
    return (min(a, b), max(a, b))

def tidy(s):
    """Collapse runs of spaces/tabs but KEEP newlines (line breaks are the poetry)."""
    s = straight(unent(s))
    out = []
    for line in s.split('\n'):
        out.append(re.sub(r'[ \t ]+', ' ', line).strip())
    # drop leading/trailing blank lines, collapse 3+ blanks to 1
    txt = '\n'.join(out).strip('\n')
    txt = re.sub(r'\n{3,}', '\n\n', txt)
    return txt

# ------------------------------------------------------------------ SuttaCentral (pli / sujato / suddhaso)
def sc_layer(suffix):
    """Return {verse:int -> text} joining pada segments; '\n' between lines."""
    out = {}
    for st in STEMS:
        fp = f"{D}/sc/{st}.{suffix}.json"
        if not os.path.exists(fp):
            continue
        data = json.load(open(fp, encoding='utf-8'))
        bucket = {}
        for key, val in data.items():
            m = re.match(r'dhp(\d+):(\d+)(?:\.(\d+))?$', key)
            if not m:
                continue
            v = int(m.group(1)); seg = int(m.group(2)); sub = int(m.group(3) or 0)
            if seg == 0:
                continue  # dhpN:0.x are headers (collection / vagga / vatthu story names)
            bucket.setdefault(v, []).append((seg, sub, val))
    # ^ note: bucket built per-file; flush below
        for v, segs in bucket.items():
            segs.sort()
            parts = []
            for _, _, t in segs:
                t = t.replace('<j>', '\n')        # SuttaCentral intra-segment line break
                t = straight(unent(detag(t)))      # strip <em> etc., decode entities, straighten quotes
                for ln in t.split('\n'):
                    ln = ln.strip()
                    if ln: parts.append(ln)
            out[v] = '\n'.join(parts)
    return out

def sc_headers():
    """vagga names + per-verse vatthu (story) names, from the Pali + Sujato files."""
    vaggas = []      # list of dicts in order
    story = {}       # verse -> story name (pali)
    seen = set()
    for idx, st in enumerate(STEMS, 1):
        pli = json.load(open(f"{D}/sc/{st}.pli.json", encoding='utf-8'))
        suj = json.load(open(f"{D}/sc/{st}.sujato.json", encoding='utf-8'))
        # vagga name: first verse's :0.3 segment
        first = int(st[3:].split('-')[0])
        last  = int(st[3:].split('-')[1])
        vpali = ''; ven = ''
        for k,val in pli.items():
            if k.endswith(':0.3'): vpali = straight(val).strip(); break
        for k,val in suj.items():
            if k.endswith(':0.3'): ven = straight(val).strip(); break
        # ven like "1. Pairs" -> strip leading "N. "
        ven = re.sub(r'^\d+\.\s*', '', ven)
        vaggas.append({"n": idx, "pali": vpali, "en": ven, "from": first, "to": last})
        # vatthu names: any dhpN:0.x segment that is a *vatthu
        for k,val in pli.items():
            m = re.match(r'dhp(\d+):0\.\d+$', k)
            if m and 'vatthu' in val.lower():
                story[int(m.group(1))] = straight(val).strip()
    return vaggas, story

# ------------------------------------------------------------------ ATI Buddharakkhita
def ati_budd():
    out = {}
    for fp in sorted(glob.glob(f"{D}/ati/budd.*.html")):
        raw = open(fp, encoding='utf-8', errors='replace').read()
        i = raw.find('H_content'); body = raw[i:] if i >= 0 else raw
        cut = body.find('id="F_')
        if cut > 0: body = body[:cut]
        # each verse (or grouped couplet) is one <p> whose label is <b>N.</b> or <b>A-B.</b>
        for pm in re.finditer(r'<p>(.*?)</p>', body, re.S):
            block = pm.group(1)
            lm = re.search(r'<b>(\d+)(?:\s*[,-]\s*(\d+))?\.?</b>', block)
            if not lm: continue
            a = int(lm.group(1)); b = int(lm.group(2) or a)
            txt = tidy(detag(block[lm.end():]))
            if not txt: continue
            for n in range(a, b+1): out[n] = txt
    return out

# ------------------------------------------------------------------ ATI Thanissaro (freeverse)
def ati_than():
    """Thanissaro's verses live in <div class="freeverse"> blocks, each preceded by an
    <h5> giving the verse range. Inside a block, verses after the first are marked by
    <a id="dhp-N">; a combined poem (e.g. 153-154) has no internal anchors, so the whole
    block maps to the range. Line breaks are kept (they are the poetry)."""
    out = {}
    for fp in sorted(glob.glob(f"{D}/ati/than.*.html")):
        raw = open(fp, encoding='utf-8', errors='replace').read()
        i = raw.find('H_content'); body = raw[i:] if i >= 0 else raw
        cut = body.find('id="F_')
        if cut > 0: body = body[:cut]
        for m in re.finditer(r'<h5>(.*?)</h5>\s*(?:<a id="dhp-\d+"></a>\s*)*<div class="freeverse">(.*?)</div>', body, re.S):
            lo, hi = numrange(detag(m.group(1)))
            if lo is None: continue
            fv = m.group(2)
            whole = tidy(detag(fv))               # the block as one poem (fallback for combined verses)
            seg = {}
            anchors = list(re.finditer(r'<a id="dhp-(\d+)">', fv))
            if anchors:
                seg[lo] = tidy(detag(fv[:anchors[0].start()]))   # text before first internal anchor
                for j, a in enumerate(anchors):
                    end = anchors[j+1].start() if j+1 < len(anchors) else len(fv)
                    seg[int(a.group(1))] = tidy(detag(fv[a.end():end]))
            # Thanissaro groups some verses (empty anchors / two verses in one segment). Use the
            # fine split where a verse has its own text; otherwise fall back to the whole block,
            # so a combined verse shows the passage it belongs to rather than going missing.
            for n in range(lo, hi+1):
                out[n] = seg.get(n) or whole
    return out

# ------------------------------------------------------------------ Muller (Gutenberg plain text)
def muller():
    s = open(f"{D}/muller.txt", encoding='utf-8', errors='replace').read()
    s = s.replace('\r\n','\n')
    # work between the first chapter header and the Gutenberg footer
    a = s.find('The Twin-Verses')
    z = s.find('*** END OF THE PROJECT')
    if z < 0: z = len(s)
    body = s[a:z]
    out = {}
    # verses start with "N." at the start of a line; capture until next "N." or chapter header
    # join wrapped lines: a verse is the text from its number to the next number marker.
    lines = body.split('\n')
    lo = hi = None; buf = []
    def flush(lo, hi, buf):
        if lo is None: return
        txt = ' '.join(x.strip() for x in buf).strip()
        txt = re.sub(r'\s+', ' ', txt)
        if txt:
            for num in range(lo, hi+1): out[num] = straight(txt)
    for ln in lines:
        m = re.match(r'^(\d+(?:\s*[,-]\s*\d+)*)\.\s+(.*)$', ln)
        if m:
            flush(lo, hi, buf)
            lo, hi = numrange(m.group(1)); buf = [m.group(2)]
        elif re.match(r'^\s*Chapter\s+[IVXLC]+\.', ln):
            # chapter header between verses: ends the current verse, not part of any verse
            flush(lo, hi, buf); lo = hi = None; buf = []
        else:
            # verses wrap across lines (and blank lines) in this etext; keep accumulating
            buf.append(ln)
    flush(lo, hi, buf)
    # Muller's Gutenberg etext folds footnote markers; strip bracketed footnote refs like [1]
    for k in list(out):
        out[k] = re.sub(r'\[\d+\]', '', out[k]).strip()
        out[k] = re.sub(r'\s+', ' ', out[k])
    return out

# ------------------------------------------------------------------ Wagiswara & Saunders (Gutenberg, metrical verse)
def wagiswara():
    """1912 metrical translation. Verses are numbered (the number alone on its line)
    followed by a quatrain; footnotes sit between chapters after a blank line, so a
    verse = the run of non-blank lines right after its number. Line breaks kept."""
    s = open(f"{D}/wagiswara.txt", encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
    a = re.search(r'(?m)^1\.\s*$', s)
    z = s.find('*** END')
    body = s[a.start(): z if z > 0 else len(s)]
    lines = body.split('\n')
    out = {}; i = 0; last_hi = 0
    while i < len(lines):
        # a verse opens with its number (alone, or followed by its first line on the same line);
        # grouped couplets use elided ranges like "271-2". The monotonic guard rejects stray digits.
        m = re.match(r'^\s*(\d+(?:\s*[,-]\s*\d+)?)\.?\s*(.*)$', lines[i])
        lo, hi = numrange_abbr(m.group(1)) if m else (None, None)
        if lo is None or lo <= last_hi or lo > 423:
            i += 1; continue
        stanza = []
        first = re.sub(r'\[\d+\]', '', m.group(2)).strip()
        if first: stanza.append(first)
        i += 1
        while i < len(lines) and lines[i].strip() != '':
            stanza.append(re.sub(r'\[\d+\]', '', lines[i]).strip())
            i += 1
        txt = straight('\n'.join(l for l in stanza if l).strip())
        if txt:
            for n in range(lo, hi + 1): out[n] = txt
            last_hi = hi
    return out

# ------------------------------------------------------------------ Kaviratna (theosociety html)
def kaviratna():
    out = {}
    for fp in sorted(glob.glob(f"{D}/kav/dham*.html"), key=lambda p: int(re.search(r'dham(\d+)', p).group(1))):
        text = unent(detag(open(fp, encoding='utf-8', errors='replace').read()))
        # verses are separated by whitespace-only gaps; each block opens with a number(list).
        # a stray verse in this etext drops the period ("85 Few..."), so the period is optional.
        for block in re.split(r'\n\s*\n', text):
            b = block.strip()
            m = re.match(r'^(\d+(?:\s*[,-]\s*\d+)*)\.?\s+(.+)$', b, re.S)
            if not m: continue
            lo, hi = numrange(m.group(1))
            txt = re.sub(r'\s+', ' ', m.group(2)).strip()
            if not txt or lo is None or lo > 423: continue
            for n in range(lo, hi+1):
                if n not in out: out[n] = straight(txt)
    return out

# ------------------------------------------------------------------ assemble
def main():
    pali     = sc_layer('pli')
    sujato   = sc_layer('sujato')
    suddhaso = sc_layer('suddhaso')
    budd     = ati_budd()
    than     = ati_than()
    mul      = muller()
    kav      = kaviratna()
    wag      = wagiswara()
    vaggas, story = sc_headers()

    layers = {
        "muller":        ("F. Max Müller", 1881, "Project Gutenberg (public domain)", mul),
        "wagiswara":     ("Wagiswara & Saunders", 1912, "Project Gutenberg (public domain)", wag),
        "kaviratna":     ("Harischandra Kaviratna", 1980, "Theosophical Univ. Press", kav),
        "buddharakkhita":("Acharya Buddharakkhita", 1985, "Access to Insight", budd),
        "thanissaro":    ("Thanissaro Bhikkhu", 1997, "Access to Insight", than),
        "suddhaso":      ("Bhikkhu Suddhāso", 2016, "SuttaCentral", suddhaso),
        "sujato":        ("Bhikkhu Sujato", 2021, "SuttaCentral", sujato),
    }

    # diagnostics
    print("verse counts per layer (of 423):")
    print(f"  pali     {len(pali)}")
    for k,(nm,yr,src,dd) in layers.items():
        miss = [n for n in range(1,424) if n not in dd]
        print(f"  {k:14s} {len(dd):4d}   missing[:8]={miss[:8]}")

    # merge extras (in-copyright long tail), if present
    extras_path = os.path.join(os.path.dirname(__file__), "extras.json")
    extra_meta_path = os.path.join(os.path.dirname(__file__), "extras-meta.json")
    extras = {}
    extra_meta = {}
    if os.path.exists(extras_path):
        extras = json.load(open(extras_path, encoding='utf-8'))
        extra_meta = json.load(open(extra_meta_path, encoding='utf-8')) if os.path.exists(extra_meta_path) else {}
        print(f"extras: {sum(len(v) for v in extras.values())} quotes across {len(extras)} verses, {len(extra_meta)} translators")

    # translator registry
    translators = {}
    for k,(nm,yr,src,dd) in layers.items():
        translators[k] = {"name": nm, "year": yr, "n": len(dd), "src": src}
    # extras translators
    ecount = {}
    for v, m in extras.items():
        for tk in m: ecount[tk] = ecount.get(tk,0)+1
    for tk, meta in extra_meta.items():
        translators[tk] = {"name": meta["name"], "year": meta["year"], "n": ecount.get(tk,0), "src": meta.get("src","")}

    order = sorted(translators, key=lambda k: (translators[k]["year"], translators[k]["name"]))

    # verses
    verses = []
    vof = {}  # verse -> vagga n
    for vg in vaggas:
        for n in range(vg["from"], vg["to"]+1): vof[n] = vg["n"]
    for n in range(1, 424):
        vlist = []
        for k in order:
            if k in layers and n in layers[k][3]:
                vlist.append({"k": k, "t": layers[k][3][n]})
            elif str(n) in extras and k in extras[str(n)]:
                vlist.append({"k": k, "t": straight(extras[str(n)][k])})
        verses.append({"n": n, "vg": vof.get(n,0), "pali": pali.get(n,""), "v": vlist})

    DHP = {"translators": translators, "order": order, "vaggas": vaggas, "verses": verses}
    js = "window.DHP=" + json.dumps(DHP, ensure_ascii=False, separators=(',',':')) + ";\n"
    open(OUT, "w", encoding='utf-8').write(js)
    size = os.path.getsize(OUT)
    print(f"\nwrote {OUT}  ({size/1024:.0f} KB)")
    print(f"translators: {len(translators)}  vaggas: {len(vaggas)}  verses: {len(verses)}")
    avg = sum(len(v['v']) for v in verses)/len(verses)
    print(f"avg versions/verse: {avg:.1f}")

if __name__ == "__main__":
    main()
