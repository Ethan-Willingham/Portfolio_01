"""Extract Muller from the saved HTML and align whole Chinese passages.

The English labels in this source contain duplicate numbers. Use the Chinese
paragraph before each translation, and omit units whose divisions do not match.
"""
import difflib
from html.parser import HTMLParser
import re


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.parts = None
        self.skip_anchor = False

    def finish(self):
        if self.parts is not None:
            self.rows.append(re.sub(r'\s+', ' ', ''.join(self.parts)).strip())
            self.parts = None

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.finish()
            self.parts = []
        elif tag == 'hr':
            self.finish()
            self.rows.append(None)
        elif tag == 'a':
            self.skip_anchor = any(key == 'href' and value.startswith('#note-')
                                   for key, value in attrs)

    def handle_endtag(self, tag):
        if tag == 'p':
            self.finish()
        elif tag == 'a':
            self.skip_anchor = False

    def handle_data(self, value):
        if self.parts is not None and not self.skip_anchor:
            self.parts.append(value)


def han(text):
    # Orthographic variants in the saved editions, not changes to the output.
    variants = str.maketrans({'爲': '為', '囘': '回', '吿': '告', '敎': '教',
                             '淸': '清', '衞': '衛', '卽': '即', '歎': '嘆',
                             '恱': '悅', '説': '說', '躳': '躬', '脩': '修',
                             '兪': '俞', '峯': '峰'})
    return ''.join(re.findall(r'[\u4e00-\u9fff]', text)).translate(variants)


def parse_units(html):
    parser = Paragraphs()
    parser.feed(html)
    parser.finish()
    units, current, book = [], None, None
    in_comment = False
    for text in parser.rows:
        if text is None or text == 'Notes':
            if current:
                units.append(current)
            current = None
            continue
        heading = re.match(r'^(\d+)\. [A-Za-z].*[\u4e00-\u9fff]', text)
        if heading:
            book = int(heading[1])
            continue
        marker = re.match(r'^\[(\d+)-(\d+)\]\s*(.*)', text)
        unmarked_chinese = len(han(text)) >= 6 and not re.search(r'[A-Za-z]', text)
        if marker or unmarked_chinese:
            if current:
                units.append(current)
            if marker:
                book = int(marker[1])
            current = {'book': book, 'zh': marker[3] if marker else text, 'english': []}
            in_comment = False
        elif current and re.match(r'^(\[Comment\]|Comment:)', text):
            in_comment = True
        elif current and not in_comment and re.search(r'[A-Za-z]', text):
            current['english'].append(re.sub(r'^\[\d+:\d+\]\s*', '', text))
    if current:
        units.append(current)
    return units


def aligned_muller(html, received):
    result = {}
    ambiguous = set()
    for unit in parse_units(html):
        if not unit['english']:
            continue
        source = han(unit['zh'])
        candidates = []
        for ref, text in received.items():
            if int(ref.split('.')[0]) != unit['book']:
                continue
            target = han(text)
            matcher = difflib.SequenceMatcher(None, source, target, autojunk=False)
            # Count inserted and removed characters. Small spelling differences
            # are allowed; a neighboring passage is not projected into this one.
            edits = sum((i2 - i1) + (j2 - j1)
                        for op, i1, i2, j1, j2 in matcher.get_opcodes() if op != 'equal')
            candidates.append((matcher.ratio(), ref, edits))
        candidates.sort(reverse=True)
        if not candidates:
            continue
        score, ref, edits = candidates[0]
        if score < .82 or edits > 4:
            continue
        if len(candidates) > 1 and score - candidates[1][0] < .15:
            continue
        if ref in ambiguous:
            continue
        if ref in result:
            # The saved source also contains two renderings of 14.37. Keep
            # neither rather than silently choosing one of the alternatives.
            del result[ref]
            ambiguous.add(ref)
            continue
        result[ref] = ' '.join(unit['english'])
    return result


if __name__ == '__main__':
    import argparse
    import json
    from pathlib import Path

    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('html', type=Path, help='Saved original Muller HTML')
    args = cli.parse_args()
    target = Path(__file__).resolve().parents[1] / 'js' / 'analects-data.js'
    data = json.loads(target.read_text().removeprefix('window.ANA=').strip().removesuffix(';'))
    received = {f'{ch["b"]}.{ch["c"]}': ch['zh'] for ch in data['chapters']}
    translations = aligned_muller(args.html.read_text(), received)
    for chapter in data['chapters']:
        chapter['v'] = [version for version in chapter['v'] if version['k'] != 'muller']
        ref = f'{chapter["b"]}.{chapter["c"]}'
        if ref in translations:
            text = translations[ref].translate(str.maketrans({'‘': "'", '’': "'", '“': '"', '”': '"'}))
            text = text.replace('…', '...')
            text = re.sub(r'\s+([.,;:?!])', r'\1', text)
            text = re.sub(r'\(\s+', '(', text).replace(' )', ')').strip()
            chapter['v'].insert(1, {'k': 'muller', 't': text})
    data['translators']['muller']['n'] = len(translations)
    target.write_text('window.ANA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('Aligned Muller excerpts:', len(translations))
