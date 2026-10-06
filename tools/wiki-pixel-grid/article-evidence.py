#!/usr/bin/env python3
"""Read one queued local article and return a bounded evidence excerpt."""
import json, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
article = json.loads((root / 'research/wiki-pixel-grid/queue.json').read_text())['articles'][int(sys.argv[1]) - 1]
key = sys.argv[2]
start = article['text'].find(key)
if start < 0:
    raise ValueError(f'Missing source evidence: {key}')
article['text'] = article['text'][max(0, start - 70):start + len(key) + 100]
print(json.dumps(article))
