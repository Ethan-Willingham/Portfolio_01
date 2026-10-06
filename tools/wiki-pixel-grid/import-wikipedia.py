#!/usr/bin/env python3
"""Import an offline Wikimedia articles dump and draw a reproducible random queue."""
import argparse, bz2, hashlib, json, random, sqlite3, xml.etree.ElementTree as ET
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('dump', type=Path)
p.add_argument('--database', type=Path, default=Path('research/wiki-pixel-grid/articles.sqlite'))
p.add_argument('--count', type=int, default=250)
p.add_argument('--seed', default='wiki-pixel-grid-250-v1')
a = p.parse_args()
a.database.parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(a.database)
db.execute('CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, title TEXT, revision TEXT, text TEXT)')
ns = None
count = 0
with bz2.open(a.dump, 'rb') as source:
    for event, el in ET.iterparse(source, events=('start', 'end')):
        if ns is None:
            ns = el.tag.split('}')[0] + '}'
        if event != 'end' or el.tag != ns + 'page':
            continue
        if el.findtext(ns+'ns') == '0' and el.find(ns+'redirect') is None:
            rev = el.find(ns+'revision')
            text = rev.findtext(ns+'text') or ''
            if text.strip():
                db.execute('INSERT OR REPLACE INTO articles VALUES (?, ?, ?, ?)',
                           (int(el.findtext(ns+'id')), el.findtext(ns+'title'), rev.findtext(ns+'id'), text))
                count += 1
                if count % 10000 == 0:
                    db.commit()
                    print(f'Imported {count} articles', flush=True)
        el.clear()
db.commit()
ids = [r[0] for r in db.execute('SELECT id FROM articles ORDER BY id')]
chosen = random.Random(a.seed).sample(ids, a.count)
queue = []
for i, article_id in enumerate(chosen, 1):
    row = db.execute('SELECT title, revision, text FROM articles WHERE id=?', (article_id,)).fetchone()
    queue.append({'tile': i, 'articleId': article_id, 'title': row[0], 'revision': row[1], 'text': row[2]})
(a.database.parent / 'queue.json').write_text(json.dumps({'seed': a.seed, 'corpusArticles': len(ids), 'articles': queue}, ensure_ascii=False, indent=2))
print(f'Imported {count} articles; sampled {len(queue)} without replacement')
