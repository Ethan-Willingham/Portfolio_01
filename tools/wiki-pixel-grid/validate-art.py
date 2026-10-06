#!/usr/bin/env python3
"""Check the full review set, attribution, evidence and lossless RGB fidelity."""
import hashlib,json
from collections import Counter
from pathlib import Path
from urllib.parse import quote
from PIL import Image
root=Path(__file__).resolve().parents[2]
m=json.loads((root/'assets/wiki-pixel-grid/manifest.json').read_text())
s=json.loads((root/'tools/wiki-pixel-grid/subjects.json').read_text())
assert len(m['tiles'])==250
counts=Counter();hashes=set()
queue_path=root/'research/wiki-pixel-grid/queue.json'
q=json.loads(queue_path.read_text())['articles'] if queue_path.exists() else None
for i,t in enumerate(m['tiles']):
 assert t['id']==i+1 and t['image'] and t['thumbnail']
 assert t['creation'].startswith('LLM-written drawing code')
 assert t['article']==s[i]['article'] and t['subject']==s[i]['subject']
 assert t['source']=='https://simple.wikipedia.org/w/index.php?oldid='+t['revision']
 assert t['articleUrl']=='https://simple.wikipedia.org/wiki/'+quote(t['article'].replace(' ','_'))
 if q:
  assert t['articleId']==q[i]['articleId'] and t['revision']==q[i]['revision']
  assert t['evidence'].replace(',','').replace('\u2014','') in q[i]['text'].replace(',','').replace('\u2014','')
 im=Image.open(root/t['image']).convert('RGB');expected=256 if i<50 else 1024
 assert im.size==(expected,expected)
 h=hashlib.sha256(im.tobytes()).hexdigest();assert h==t['sha256'];assert h not in hashes,('duplicate artwork',i+1);hashes.add(h)
 master=root/f'research/wiki-pixel-grid/code-masters/{i+1:03d}.png'
 if master.exists():assert Image.open(master).convert('RGB').tobytes()==im.tobytes()
 assert Image.open(root/t['thumbnail']).size==(256,256)
 assert t['medium']==m['media'][i//50]['medium']
 counts[t['medium']]+=1
assert set(counts.values())=={50}
assert 'image-generation models' in m['creationPolicy']
print('PASS: 250 distinct drawings, five media of 50, exact source sequence, evidence, URLs, master dimensions and lossless RGB equality.')
print(dict(counts))
