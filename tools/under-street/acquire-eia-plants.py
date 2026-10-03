#!/usr/bin/env python3
"""Export August 2026 EIA-860M generator records and plant summaries.

Usage: python3 tools/under-street/acquire-eia-plants.py /path/to/scratch
Uses standard-library XML to read the public machine-readable XLSX workbook.
No spreadsheet formulas are calculated. Operating, planned, retired and
canceled records remain distinct, including backup and out-of-service units.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[2]
DEST=ROOT/'archive/under-the-street/assets/map/data'
MANIFEST=DEST.parent/'datasets.json'
URL='https://www.eia.gov/electricity/data/eia860m/xls/august_generator2026.xlsx'
BBOX=[-94.05,44.47,-92.52,45.42]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def number(v):
    try:return round(float(v),4)
    except (ValueError,TypeError):return None

def date(row,month,year):
    m,y=number(row.get(month)),number(row.get(year))
    return f'{int(y):04d}-{int(m):02d}' if m and y else None

def main():
    scratch=pathlib.Path(sys.argv[1]);scratch.mkdir(parents=True,exist_ok=True)
    xlsx=scratch/'august_generator2026.xlsx'
    if not xlsx.exists():urllib.request.urlretrieve(URL,xlsx)
    records=[];total=0
    with zipfile.ZipFile(xlsx) as z:
        strings=[''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',NS)]
        def value(c):
            v=c.find('m:v',NS)
            if v is None:return None
            return strings[int(v.text)] if c.get('t')=='s' else v.text
        for sheet,stage in [(1,'Operating'),(2,'Planned'),(3,'Retired'),(4,'Canceled or Postponed')]:
            rows=ET.fromstring(z.read(f'xl/worksheets/sheet{sheet}.xml')).findall('m:sheetData/m:row',NS)
            header={re.sub(r'\d+','',c.get('r')):value(c) for c in rows[2].findall('m:c',NS)}
            for r in rows[3:]:
                row={header[re.sub(r'\d+','',c.get('r'))]:value(c) for c in r.findall('m:c',NS) if re.sub(r'\d+','',c.get('r')) in header}
                if not row.get('Plant ID'):continue
                total+=1
                x,y=number(row.get('Longitude')),number(row.get('Latitude'))
                if x is None or y is None or not (BBOX[0]<=x<=BBOX[2] and BBOX[1]<=y<=BBOX[3]):continue
                props={'i':int(float(row['Plant ID'])),'name':row.get('Plant Name'),'operator':row.get('Entity Name'),
                       'g':row.get('Generator ID'),'stage':stage,'status':row.get('Status') or stage,
                       'mw':number(row.get('Nameplate Capacity (MW)')),'summerMW':number(row.get('Net Summer Capacity (MW)')),
                       'technology':row.get('Technology'),'fuel':row.get('Energy Source Code'),
                       'opened':date(row,'Operating Month','Operating Year'),
                       'retired':date(row,'Retirement Month','Retirement Year'),
                       'plannedRetirement':date(row,'Planned Retirement Month','Planned Retirement Year'),
                       'plannedOperation':date(row,'Planned Operation Month','Planned Operation Year')}
                props={k:v for k,v in props.items() if v is not None and str(v).strip()}
                records.append({'type':'Feature','properties':props,'geometry':{'type':'Point','coordinates':[x,y]}})
    keys=[(f['properties']['i'],f['properties']['g'],f['properties']['stage']) for f in records]
    if len(keys)!=len(set(keys)):raise RuntimeError('Duplicate generator records in selected inventory')
    plants={}
    for f in records:
        p=f['properties'];i=p['i']
        plant=plants.setdefault(i,{'type':'Feature','geometry':f['geometry'],'properties':{'i':i,'name':p['name'],'operators':set(),
                                                     'mw':0,'plannedMW':0,'retiredMW':0,'fuels':set(),'technologies':set(),'units':[]}})
        out=plant['properties'];out['operators'].add(p.get('operator',''))
        if p['stage'] in ['Operating','Planned','Retired']:
            key={'Operating':'mw','Planned':'plannedMW','Retired':'retiredMW'}[p['stage']]
            out[key]+=p.get('mw') or 0
        if p.get('fuel') and p['stage']=='Operating':out['fuels'].add(p['fuel'])
        if p.get('technology') and p['stage']=='Operating':out['technologies'].add(p['technology'])
        out['units'].append({k:v for k,v in p.items() if k not in ['i','name','operator']})
    for f in plants.values():
        p=f['properties'];p['operator']='; '.join(sorted(p.pop('operators')))
        p['fuels']=sorted(p['fuels']);p['technologies']=sorted(p['technologies'])
        for k in ['mw','plannedMW','retiredMW']:p[k]=round(p[k],3)
        stages={u['stage'] for u in p['units']}
        p['status']='Operating' if 'Operating' in stages else 'Planned' if 'Planned' in stages else 'Retired' if 'Retired' in stages else 'Canceled or Postponed'
    manifest=json.loads(MANIFEST.read_text());entries={e['id']:e for e in manifest['datasets']}
    for id,features in [('eia-generators',records),('eia-power-plants',list(plants.values()))]:
        raw=json.dumps({'type':'FeatureCollection','features':features},separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
        target=DEST/(id+'.json');tmp=target.with_suffix('.json.tmp');tmp.write_bytes(raw);tmp.replace(target)
        cs=[f['geometry']['coordinates'] for f in features]
        entries[id]={'id':id,'title':'EIA August 2026 '+('generator inventory' if id=='eia-generators' else 'power plant summaries'),
                     'file':'data/'+id+'.json','format':'GeoJSON','featureCount':len(features),'sourceFeatureCount':total,
                     'bounds':[min(c[0] for c in cs),min(c[1] for c in cs),max(c[0] for c in cs),max(c[1] for c in cs)],'geometry':['Point'],
                     'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
                     'properties':{'i':'EIA Plant ID','name':'EIA Plant Name','operator':'EIA Entity Name','mw':'nameplate MW in Operating sheet, including backup or out-of-service units',
                                   'g':'Generator ID','stage':'source workbook sheet','status':'verbatim unit status or plant inventory category',
                                   'fuel':'EIA Energy Source Code','technology':'EIA Technology','units':'complete selected generator records at plant',
                                   'plannedMW':'planned generator nameplate MW','retiredMW':'retired generator nameplate MW','fuels':'Operating-sheet energy source codes','technologies':'Operating-sheet technology labels'},
                     'source':{'url':'https://www.eia.gov/electricity/data/eia860m/','downloadUrl':URL,'sourceDate':'2026-08, released 2026-09-24',
                               'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'coverage':'Plants with published coordinates in metro box; federal inventory covers sites of at least 1 MW combined nameplate capacity',
                               'license':'U.S. government public domain; acknowledge EIA and publication date.',
                               'licenseUrl':'https://www.eia.gov/about/copyrights_reuse.php','attribution':'U.S. Energy Information Administration, EIA-860M, August 2026 (released September 24, 2026)',
                               'caveats':['Preliminary monthly inventory, subject to later correction; not live generation output.',
                                          'Operating inventory includes standby, backup and some out-of-service units; individual status is retained.',
                                          'Plant nameplate total is installed rated capacity, not assured output or generation available at this moment.',
                                          'Planned retirement dates are reported plans, not confirmation that retirement happened.',
                                          'Retired inventory begins with retirements since 2002; earlier historic plants are not a complete inventory.',
                                          'Reported plant coordinates can be approximate. OSM geometry and source names are separate inventories and should not be joined by proximity alone.']},
                     'reproduce':{'command':'python3 tools/under-street/acquire-eia-plants.py /path/to/scratch'}}
        print(f'{id}: {len(features):,}, {len(raw):,} bytes',flush=True)
    manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    tmp=MANIFEST.with_suffix('.json.tmp');tmp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');tmp.replace(MANIFEST)

if __name__=='__main__':main()
