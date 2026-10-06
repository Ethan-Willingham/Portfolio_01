#!/usr/bin/env python3
"""Publish a square master losslessly and rebuild the small overview atlas."""
import argparse, json, shutil
from urllib.parse import quote
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser()
p.add_argument('tile',type=int)
p.add_argument('master',type=Path)
p.add_argument('metadata',type=Path)
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
folder=root/'assets/wiki-pixel-grid'
manifest_path=folder/'manifest.json'
manifest=json.loads(manifest_path.read_text())
image=Image.open(a.master).convert('RGB')
if image.width != image.height:
    raise ValueError('The generated master must be square; do not crop artwork silently')
master_folder=root/'research/wiki-pixel-grid/masters'
master_folder.mkdir(parents=True,exist_ok=True)
shutil.copy2(a.master,master_folder/f'{a.tile:03d}.png')
image.save(folder/f'{a.tile:03d}.webp',format='WEBP',lossless=True,method=6)
meta=json.loads(a.metadata.read_text())
queue=json.loads((root/'research/wiki-pixel-grid/queue.json').read_text())
article=queue['articles'][a.tile-1]
meta.update({'articleId':article['articleId'],'revision':article['revision'],'source':'https://simple.wikipedia.org/w/index.php?oldid='+article['revision']})
meta['articleUrl']='https://simple.wikipedia.org/wiki/'+quote(article['title'].replace(' ','_'))
meta.update({'id':a.tile,'image':f'assets/wiki-pixel-grid/{a.tile:03d}.webp','masterWidth':image.width,'masterHeight':image.height})
manifest['tiles'][a.tile-1]=meta
preview_size=64
atlas=Image.new('RGB',(manifest['columns']*preview_size,((len(manifest['tiles'])+manifest['columns']-1)//manifest['columns'])*preview_size),(48,57,49))
for i,tile in enumerate(manifest['tiles']):
    if not tile.get('image'):continue
    tile_image=Image.open(root/tile['image'])
    sampling=Image.Resampling.NEAREST if tile.get('medium')=='pixel art' else Image.Resampling.LANCZOS
    tile_image=tile_image.resize((preview_size,preview_size),sampling)
    x=(i%manifest['columns'])*preview_size;y=(i//manifest['columns'])*preview_size
    atlas.paste(tile_image,(x,y))
    tile['preview']=[x,y,preview_size,preview_size]
atlas.save(folder/'overview.webp',format='WEBP',lossless=True,method=6)
manifest['atlas']='assets/wiki-pixel-grid/overview.webp'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Published tile {a.tile}; {sum(bool(t.get("image")) for t in manifest["tiles"])} complete')
