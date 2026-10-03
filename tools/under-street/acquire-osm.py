#!/usr/bin/env python3
"""One metro Overpass acquisition, preserving utility source tags and OSM IDs.

Usage: python3 tools/under-street/acquire-osm.py /path/to/scratch [saved-osm.json]
OpenStreetMap geometry is a community snapshot, not an operator inventory.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[2]
DEST=ROOT/'archive/under-the-street/assets/map/data'
MANIFEST=DEST.parent/'datasets.json'
BBOX=[-94.05,44.47,-92.52,45.42]
BOX='44.47,-94.05,45.42,-92.52'
QUERY=f'''[out:json][timeout:180];(
way["power"~"^(line|minor_line|cable)$"]({BOX});
nwr["power"~"^(substation|plant)$"]({BOX});
nwr["man_made"~"^(pipeline|pipeline_station|water_tower|water_works|wastewater_plant)$"]({BOX});
nwr["pipeline"]({BOX});
nwr["telecom"~"^(exchange|data_center)$"]({BOX});
nwr["building"="data_center"]({BOX});
nwr["waterway"="dam"]({BOX});
nwr["lock"="yes"]({BOX});
);out geom;'''
ENDPOINT='https://overpass-api.de/api/interpreter'

def coords(e):
    if e.get('type')=='node':return [e['lon'],e['lat']]
    if e.get('geometry'):
        return [[p['lon'],p['lat']] for p in e['geometry'] if 'lon' in p]
    return [c for m in e.get('members',[]) for c in coords(m)] if e.get('members') else []

def point(e):
    c=coords(e)
    if c and isinstance(c[0],(int,float)):return c
    if not c:return None
    return [(min(p[0] for p in c)+max(p[0] for p in c))/2,(min(p[1] for p in c)+max(p[1] for p in c))/2]

def round_coords(c):
    if c and isinstance(c[0],(int,float)):return [round(c[0],5),round(c[1],5)]
    return [round_coords(x) for x in c]

def properties(e):
    t=e.get('tags',{});p={'i':e['type']+'/'+str(e['id'])}
    keep=['name','operator','location','substance','voltage','wikipedia','wikidata','power','man_made',
          'telecom','waterway','lock','height','start_date','end_date','check_date','disused','abandoned','construction','proposed',
          'disused:power','abandoned:power','construction:power','proposed:power','historic','building',
          'pipeline','diameter','pressure','usage','service','status','condition',
          'plant:source','plant:method','plant:output:electricity','generator:source','generator:output:electricity']
    p.update({k:t[k] for k in keep if k in t})
    if 'voltage' in t:
        numbers=[int(v) for v in re.findall(r'\d+',t['voltage'])]
        if numbers:p['v']=max(numbers)/1000
    capacity=t.get('plant:output:electricity') or t.get('generator:output:electricity')
    if capacity:
        p['capacity']=capacity
        m=re.fullmatch(r'\s*([\d.]+)\s*(GW|MW|kW|W)\s*',capacity)
        if m:p['mw']=float(m[1])*{'GW':1000,'MW':1,'kW':.001,'W':.000001}[m[2]]
    source=t.get('plant:source') or t.get('generator:source')
    if source:p['src']=source
    if t.get('man_made')=='pipeline':
        substance=t.get('substance','').lower()
        p['k']='g' if substance in ['gas','natural_gas','landfill_gas'] else 'h' if substance in ['steam','hot_water'] else 'w' if substance in ['water','rainwater','drain'] else 'f' if substance in ['fuel','oil'] else 'a' if 'ammonia' in substance else 'o' if substance else '?'
    return p

def main():
    scratch=pathlib.Path(sys.argv[1]);scratch.mkdir(parents=True,exist_ok=True)
    rawfile=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else scratch/'osm-utilities-2026-10.json'
    if len(sys.argv)<=2:
        # GET works on the public endpoint without an API key. Keep a saved
        # snapshot so later transforms do not require another regional pull.
        request=urllib.request.Request(ENDPOINT+'?'+urllib.parse.urlencode({'data':QUERY}),
                                       headers={'User-Agent':'TwinCitiesPublicData/1.0'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request,timeout=240) as r:rawfile.write_bytes(r.read())
                break
            except Exception:
                if attempt==2:raise
                time.sleep(5)
    raw=json.loads(rawfile.read_text())
    if raw.get('remark'):raise RuntimeError(raw['remark'])
    groups={k:[] for k in ['power-lines','power-minor','power-cables','substations','power-plants','pipelines','pipeline-stations','water-towers','waterworks','wastewater-plants','telephone-exchanges','data-centers','dams-locks']}
    for e in raw.get('elements',[]):
        t=e.get('tags',{});power=t.get('power');made=t.get('man_made');tele=t.get('telecom')
        group={'line':'power-lines','minor_line':'power-minor','cable':'power-cables','substation':'substations','plant':'power-plants'}.get(power)
        group=group or {'pipeline':'pipelines','pipeline_station':'pipeline-stations','water_tower':'water-towers','water_works':'waterworks','wastewater_plant':'wastewater-plants'}.get(made)
        group=group or ('pipeline-stations' if t.get('pipeline') else None)
        group=group or ('telephone-exchanges' if tele=='exchange' else 'data-centers' if tele=='data_center' or t.get('building')=='data_center' else 'dams-locks' if t.get('waterway')=='dam' or t.get('lock')=='yes' else None)
        if not group:continue
        p=properties(e)
        if group in ['power-lines','power-minor','power-cables','pipelines']:
            if e['type']=='relation':
                lines=[coords(m) for m in e.get('members',[]) if m.get('type')=='way']
                lines=[c for c in lines if len(c)>1]
                if not lines:continue
                geometry={'type':'MultiLineString','coordinates':round_coords(lines)}
            else:
                c=coords(e)
                if len(c)<2:continue
                geometry={'type':'LineString','coordinates':round_coords(c)}
        else:
            c=point(e)
            if not c:continue
            geometry={'type':'Point','coordinates':round_coords(c)}
        groups[group].append({'type':'Feature','properties':p,'geometry':geometry})
    manifest=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'version':1,'bbox':BBOX,'datasets':[]}
    entries={d['id']:d for d in manifest['datasets']}
    for group,fs in groups.items():
        id='osm-'+group;file=id+'.json';data=json.dumps({'type':'FeatureCollection','features':fs},separators=(',',':'),ensure_ascii=False).encode()
        target=DEST/file;temporary=DEST/(file+'.tmp')
        temporary.write_bytes(data);temporary.replace(target)
        allc=[c for f in fs for c in (f['geometry']['coordinates'] if f['geometry']['type']=='LineString' else
                                    [p for line in f['geometry']['coordinates'] for p in line] if f['geometry']['type']=='MultiLineString' else
                                    [f['geometry']['coordinates']])]
        bounds=[min(c[0] for c in allc),min(c[1] for c in allc),max(c[0] for c in allc),max(c[1] for c in allc)] if allc else None
        entries[id]={'id':id,'title':'OpenStreetMap '+group.replace('-',' '),'file':'data/'+file,'format':'GeoJSON',
                     'featureCount':len(fs),'geometry':sorted({f['geometry']['type'] for f in fs}),'bounds':bounds,
                     'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                     'properties':{'i':'OSM type/id','name':'OSM name tag','operator':'OSM operator tag','location':'OSM location tag',
                                   'substance':'OSM substance tag','voltage':'verbatim volts tag','v':'maximum tagged voltage in kV',
                                   'capacity':'verbatim output tag','mw':'numeric output if explicit supported unit supplied','src':'plant or generator source',
                                   'k':'pipeline substance class: g gas, h heat, w water/drain, f fuel/oil, a ammonia, o other, ? unclassified',
                                   'wikipedia':'verbatim OSM Wikipedia tag','wikidata':'verbatim OSM Wikidata ID'},
                     'source':{'url':'https://www.openstreetmap.org','downloadUrl':ENDPOINT,'sourceDate':raw.get('osm3s',{}).get('timestamp_osm_base'),
                               'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'coverage':'Community-mapped features intersecting the metro bounding box',
                               'license':'Open Database License (ODbL) 1.0','licenseUrl':'https://www.openstreetmap.org/copyright',
                               'attribution':'OpenStreetMap contributors',
                               'caveats':['Community map snapshot, not a complete utility inventory or confirmation of current operating status.',
                                          'Line features can extend outside the acquisition box because intersecting ways are preserved whole.',
                                          'Polygon facilities are represented by the center of their mapped bounds.',
                                          'Unknown pipeline substances remain unclassified; an operator name is not enough to assert what a pipe carries.',
                                          'Historic central-office tags may remain after a building changes use; names are preserved, not guessed.',
                                          'Voltage, output, lifecycle and Wikipedia tags can be incomplete or stale.']},
                     'reproduce':{'query':QUERY,'command':'python3 tools/under-street/acquire-osm.py /path/to/scratch'}}
        if group=='waterworks':
            entries[id]['title']='OpenStreetMap mapped water facilities'
            entries[id]['source']['caveats'].append('The water_works tag alone does not establish treatment, drinking-water use or current operation; this layer includes pumping, public-works and lift-station names. Exact primary-source facility-purpose overrides are maintained separately in the adapter.')
        print(f'{id}: {len(fs):,}, {len(data):,} bytes')
    manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    temporary=MANIFEST.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');temporary.replace(MANIFEST)

if __name__=='__main__':main()
