"""Regression checks for the Analects excerpt alignment and shipped corpus."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
from analects_muller import aligned_muller


class AlignmentTests(unittest.TestCase):
    def test_duplicate_english_numbers_do_not_replace_other_passages(self):
        received = {'9.8': '子曰吾有知乎哉無知也', '9.9': '子曰鳳鳥不至河不出圖吾已矣夫'}
        html = '''<p>[9-8] 子曰吾有知乎哉無知也</p>
        <p>[9:8] Do I possess knowledge?<a href="#note-1">1</a></p>
        <p>[Comment] This is commentary.</p>
        <p>[9-9] 子曰鳳鳥不至河不出圖吾已矣夫</p>
        <p>[9:8] The phoenix has not come.</p><hr>
        <p>Notes</p><p>Footnotes must stay outside the translation.</p>'''
        self.assertEqual(aligned_muller(html, received), {
            '9.8': 'Do I possess knowledge?', '9.9': 'The phoenix has not come.'})

    def test_combined_units_are_not_repeated_as_separate_translations(self):
        received = {'11.18': '柴也愚參也魯師也辟由也喭',
                    '11.19': '子曰回也其庶乎屢空賜不受命而貨殖焉億則屢中'}
        html = f'<p>[11-18] {received["11.18"]}{received["11.19"]}</p><p>Two passages together.</p>'
        self.assertEqual(aligned_muller(html, received), {})

    def test_unmarked_chinese_starts_a_new_unit(self):
        received = {'10.18': '色斯舉矣翔而後集山梁雌雉', '11.1': '子曰先進於禮樂野人也'}
        html = '''<p>[10-20] 色斯舉矣翔而後集山梁雌雉</p><p>The pheasant.</p><hr>
        <p>11. Xian jin 先進</p><p>子曰先進於禮樂野人也</p><p>[11:1] Earlier practitioners.</p>'''
        self.assertEqual(aligned_muller(html, received), {
            '10.18': 'The pheasant.', '11.1': 'Earlier practitioners.'})

    def test_ambiguous_duplicate_source_units_are_omitted(self):
        html = '''<p>[14-37] 子曰賢者辟世其次辟地其次辟色其次辟言</p><p>First reading.</p>
        <p>[14-37] 子曰賢者辟世其次辟地其次辟色其次辟言</p><p>Other reading.</p>'''
        self.assertEqual(aligned_muller(html, {'14.37': '子曰賢者辟世其次辟地其次辟色其次辟言'}), {})

    def test_shipped_passages_and_footnote_boundaries(self):
        source = (ROOT / 'js' / 'analects-data.js').read_text()
        data = json.loads(source.removeprefix('window.ANA=').strip().removesuffix(';'))
        chapters = {f'{ch["b"]}.{ch["c"]}': ch for ch in data['chapters']}
        self.assertEqual(len(chapters), 503)
        self.assertEqual(len(data['books']), 20)
        self.assertTrue(all(any(v['k'] == 'legge' for v in ch['v']) for ch in chapters.values()))
        def muller(ref):
            return next(v['t'] for v in chapters[ref]['v'] if v['k'] == 'muller')
        self.assertIn('possess knowledge', muller('9.8'))
        self.assertNotIn('Phoenix', muller('9.8'))
        self.assertIn('Phoenix', muller('9.9'))
        self.assertIn('wise are not confused', muller('9.29'))
        self.assertIn('some with whom we can study', muller('9.30'))
        self.assertNotIn('先進', muller('10.18'))
        self.assertNotIn('Notes', muller('20.3'))
        self.assertLess(len(muller('20.3')), 400)
        for translator, meta in data['translators'].items():
            actual = sum(v['k'] == translator for ch in chapters.values() for v in ch['v'])
            self.assertEqual(meta['n'], actual)


if __name__ == '__main__':
    unittest.main()
