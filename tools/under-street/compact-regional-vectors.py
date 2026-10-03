#!/usr/bin/env python3
"""Clip regional layers and generalize them in meters for browser display.

Usage: python3 tools/under-street/compact-regional-vectors.py /path/to/scratch
Requires GDAL ogr2ogr. The untouched acquisitions are retained in scratch, while
the official source endpoint and full downloadable dataset remain in metadata.
Simplification is for a regional educational map, not engineering decisions.
"""
import datetime as dt
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
DEST=ROOT/'archive/under-the-street/assets/map/data'
MANIFEST=DEST.parent/'datasets.json'
BBOX=['-94.05','44.47','-92.52','45.42']
TOLERANCES={'surface-streams':10,'surficial-geology':20,'electric-service-areas':10,'telephone-service-areas':10}

def coordinates(c):
    if c and isinstance(c[0],(int,float)):yield c
    else:
        for a in c:yield from coordinates(a)

def normalize_geometry(g,family):
    if not g:return None
    if g['type']=='GeometryCollection':
        children=[normalize_geometry(c,family) for c in g['geometries']]
        parts=[]
        for child in children:
            if not child:continue
            if child['type']==family:parts.append(child['coordinates'])
            else:parts.extend(child['coordinates'])
        if not parts:return None
        return {'type':'Multi'+family,'coordinates':parts}
    if g['type'] not in [family,'Multi'+family]:return None
    return g

def main():
    scratch=pathlib.Path(sys.argv[1]);scratch.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST.read_text());entries={d['id']:d for d in manifest['datasets']}
    for id,tolerance in TOLERANCES.items():
        if id not in entries:continue
        source=DEST/(id+'.json');raw=scratch/(id+'-unsimplified.json')
        if not raw.exists() or not entries[id].get('generalization'):raw.write_bytes(source.read_bytes())
        projected=scratch/(id+'-projected.geojson');simplified=scratch/(id+'-simplified.geojson');result=scratch/(id+'-browser.geojson')
        for p in [projected,simplified,result]:
            if p.exists():p.unlink()
        valid=scratch/(id+'-valid.geojson')
        if valid.exists():valid.unlink()
        subprocess.run(['ogr2ogr','-f','GeoJSON',str(valid),str(raw),'-makevalid'],check=True)
        subprocess.run(['ogr2ogr','-f','GeoJSON',str(projected),str(valid),'-clipsrc',*BBOX,'-t_srs','EPSG:3857'],check=True)
        subprocess.run(['ogr2ogr','-f','GeoJSON',str(simplified),str(projected),'-simplify',str(tolerance)],check=True)
        subprocess.run(['ogr2ogr','-f','GeoJSON',str(result),str(simplified),'-t_srs','EPSG:4326','-lco','COORDINATE_PRECISION=5'],check=True)
        data=json.loads(result.read_text());features=[]
        family='LineString' if id=='surface-streams' else 'Polygon'
        for f in data['features']:
            f.pop('id',None);f['geometry']=normalize_geometry(f.get('geometry'),family)
            if f['geometry']:features.append(f)
        payload={'type':'FeatureCollection','features':features}
        encoded=json.dumps(payload,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
        entry=entries[id];entry['featureCount']=len(features);entry['bytes']=len(encoded);entry['sha256']=hashlib.sha256(encoded).hexdigest()
        cs=[c for f in features for c in coordinates(f['geometry']['coordinates'])]
        entry['bounds']=[min(c[0] for c in cs),min(c[1] for c in cs),max(c[0] for c in cs),max(c[1] for c in cs)]
        entry['geometry']=sorted({f['geometry']['type'] for f in features})
        temporary=source.with_suffix('.json.tmp');temporary.write_bytes(encoded);temporary.replace(source)
        entry['generalization']={'clipBounds':list(map(float,BBOX)),'toleranceProjectedMeters':tolerance,'projection':'EPSG:3857',
                                 'method':'GDAL topology-preserving per-feature simplification; shared boundaries are not a survey'}
        entry['source']['caveats']=[s for s in entry['source']['caveats'] if 'extend outside' not in s]
        entry['source']['caveats'].append(f'Browser geometry is clipped to the metro box and generalized with {tolerance} projected-meter tolerance. Use original source downloads for analysis.')
        entry['reproduce']={'command':'python3 tools/under-street/acquire-public-data.py '+id+' && python3 tools/under-street/compact-regional-vectors.py /path/to/scratch'}
        print(f'{id}: {len(features):,} features, {len(encoded):,} bytes',flush=True)
    manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    temporary=MANIFEST.with_suffix('.json.tmp');temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');temporary.replace(MANIFEST)

if __name__=='__main__':main()
