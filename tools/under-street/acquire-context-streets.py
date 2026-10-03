#!/usr/bin/env python3
"""Acquire named seven-county street context from MnGeo's public compilation.

Only Python's standard library is needed. Stage first, inspect review.json, then
publish the same hash-checked export with --publish. No simplification or clipping
is applied. Each whole source segment is assigned once by its geometry-bounds
center; tile bounds cover all retained coordinates, including crossing segments.
"""
import argparse
import collections
import concurrent.futures
import datetime
import gzip
import hashlib
import io
import json
import math
import pathlib
import shutil
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAP = ROOT / 'archive/under-the-street/assets/map'
SERVICE = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/trans_road_centerlines_open/FeatureServer/0'
ITEM = '515028a0cb3a42e0b6470b2af035121c'
METADATA = 'https://www.arcgis.com/sharing/rest/content/items/515028a0cb3a42e0b6470b2af035121c/info/metadata/metadata.xml'
COUNTIES = ['Anoka', 'Carver', 'Dakota', 'Hennepin', 'Ramsey', 'Scott', 'Washington']
WHERE = ' OR '.join("%s IN (%s)" % (field, ','.join("'%s'" % c for c in COUNTIES)) for field in ['co_name_l','co_name_r'])
FIELDS = ['objectid','roadseg_id','st_concat','st_pre_mod','st_pre_dir','st_pre_typ','st_pre_sep','st_name','st_pos_typ','st_pos_dir','st_pos_mod','route_sys','funcls_fed','funcls_met','cartoclass','status','co_name_l','co_name_r','ctu_name_l','ctu_name_r','edit_date']
PROPERTY_FIELDS = {'i':'roadseg_id','n':'st_concat','r':'route_sys','h':'funcls_fed','k':'cartoclass','s':'status','cl':'co_name_l','cr':'co_name_r','ml':'ctu_name_l','mr':'ctu_name_r'}
NAMES = ['st_pre_mod','st_pre_dir','st_pre_typ','st_pre_sep','st_name','st_pos_typ','st_pos_dir','st_pos_mod']
TILE_SIZE = .02


def request(url, params=None, raw=False):
    if params:
        data = urllib.parse.urlencode(params).encode()
        req = urllib.request.Request(url, data=data, headers={'User-Agent':'UnderStreet public snapshot acquisition','Content-Type':'application/x-www-form-urlencoded'})
    else:
        req = urllib.request.Request(url, headers={'User-Agent':'UnderStreet public snapshot acquisition'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                body=response.read()
            result=body if raw else json.loads(body)
            if not raw and 'error' in result:
                raise RuntimeError(str(result['error']))
            return result
        except Exception:
            if attempt==4: raise
            time.sleep(2 ** attempt)


def write_json(file, value):
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_text(json.dumps(value,separators=(',',':'),ensure_ascii=False)+'\n')


def digest(file):
    body=file.read_bytes()
    return {'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}


def gzip_download(file):
    """Write gzip with fixed timestamp and no machine-specific source filename."""
    buffer=io.BytesIO()
    with gzip.GzipFile(filename='',mode='wb',fileobj=buffer,compresslevel=9,mtime=0) as writer:
        writer.write(file.read_bytes())
    target=file.with_suffix(file.suffix+'.gz')
    target.write_bytes(buffer.getvalue())
    assert gzip.decompress(target.read_bytes())==file.read_bytes()
    return target


def points(geometry):
    if geometry['type']=='LineString':
        return geometry['coordinates']
    return [point for line in geometry['coordinates'] for point in line]


def bounds(features):
    xs=[];ys=[]
    for feature in features:
        for x,y in points(feature['geometry']):
            xs.append(x);ys.append(y)
    return [min(xs),min(ys),max(xs),max(ys)]


def road_class(props):
    # Rendering classes describe the source's functional/route hierarchy. They do
    # not infer access, pavement, lane count or current operation from a name.
    code=str(props.get('funcls_fed') or '').strip()
    if code in ['1','2']:return 'highway'
    if code in ['3','4']:return 'arterial'
    if code in ['5','6']:return 'collector'
    if code=='7':return 'local'
    cartographic=str(props.get('cartoclass') or '').strip()
    if cartographic in ['Freeway','Ramp']:return 'highway'
    if cartographic=='Primary':return 'arterial'
    if cartographic=='Secondary':return 'collector'
    if cartographic in ['Local','Private','Service','Alley']:return 'local'
    route=str(props.get('route_sys') or '').strip().zfill(2)
    if route in ['01','02','03','41','42','43','51','52','53']:return 'highway'
    if route in ['08','09','10','21','26','30','70']:return 'local'
    return 'other'


def convert(record):
    original=record['attributes']
    props={key:original[field] for key,field in PROPERTY_FIELDS.items() if original.get(field) is not None and original[field]!=''}
    # Compact keys retain exact native values. The explicit manifest mapping
    # avoids copying the same native UUID/name several times into each record.
    if not str(original.get('st_concat') or '').strip():
        parts={field:original[field] for field in NAMES if original.get(field) is not None and original[field]!=''}
        props['nameParts']=parts
        label=' '.join(str(parts.get(field) or '').strip() for field in NAMES)
        label=' '.join(label.split())
        if label:props['n']=label
    props['c']=road_class(original)
    paths=record['geometry']['paths']
    paths=[[[round(p[0],6),round(p[1],6)] for p in line] for line in paths]
    if not paths or any(len(line)<2 for line in paths):raise ValueError('Invalid source paths '+props['i'])
    geometry={'type':'LineString','coordinates':paths[0]} if len(paths)==1 else {'type':'MultiLineString','coordinates':paths}
    return {'type':'Feature','properties':props,'geometry':geometry}


def stage(review):
    review.mkdir(parents=True,exist_ok=True)
    state_file=review/'acquisition-state.json'
    if state_file.exists():
        retrieved=json.loads(state_file.read_text())['retrievedAt']
    else:
        retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(state_file,{'retrievedAt':retrieved,'sourceUrl':SERVICE,'where':WHERE})
    layer=request(SERVICE,{'f':'json'})
    item=request('https://www.arcgis.com/sharing/rest/content/items/'+ITEM,{'f':'json'})
    write_json(review/'source-layer.json',layer);write_json(review/'source-item.json',item)
    metadata=request(METADATA,raw=True)
    (review/'context-streets-metadata.xml').write_bytes(metadata)
    source_date=ET.fromstring(metadata).findtext('.//pubDate')
    assert source_date,'Primary publication date is missing'
    source_count=request(SERVICE+'/query',{'f':'json','where':WHERE,'returnCountOnly':'true'})['count']
    ids=request(SERVICE+'/query',{'f':'json','where':WHERE,'returnIdsOnly':'true'})['objectIds']
    assert len(ids)==source_count==len(set(ids))
    ids.sort()
    chunks=[ids[i:i+1000] for i in range(0,len(ids),1000)]
    def batch(chunk):
        filename=review/'batches'/('%s-%s.json'%(chunk[0],chunk[-1]))
        if filename.exists():result=json.loads(filename.read_text())
        else:
            result=request(SERVICE+'/query',{'f':'json','objectIds':','.join(map(str,chunk)),'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','returnZ':'false','returnM':'false'})
            assert not result.get('exceededTransferLimit')
            write_json(filename,result)
        records=result['features']
        assert set(f['attributes']['objectid'] for f in records)==set(chunk),'Source IDs changed during acquisition'
        return records
    records=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i,part in enumerate(pool.map(batch,chunks)):
            records.extend(part)
            if (i+1)%10==0:print('Acquired %s/%s records'%(len(records),source_count),flush=True)
    records.sort(key=lambda f:f['attributes']['objectid'])
    road_ids=[f['attributes']['roadseg_id'] for f in records]
    assert all(isinstance(i,str) and i.strip() for i in road_ids),'Missing native road identity'
    assert len(set(road_ids))==len(road_ids),'Native roadseg_id is not globally unique'
    features=[convert(record) for record in records]
    full=review/'context-streets.json'
    write_json(full,{'type':'FeatureCollection','features':features})
    compressed=gzip_download(full)
    assert compressed.stat().st_size<100*1024**2,'Complete download exceeds GitHub per-file limit'
    tiles=collections.defaultdict(list)
    for feature in features:
        b=bounds([feature]);cx=(b[0]+b[2])/2;cy=(b[1]+b[3])/2
        tile=(math.floor(cx/TILE_SIZE),math.floor(cy/TILE_SIZE))
        tiles[tile].append(feature)
    index=[]
    for (tx,ty),part in sorted(tiles.items()):
        name='context-streets-tiles/%s_%s.json'%(tx,ty)
        file=review/name
        write_json(file,{'type':'FeatureCollection','features':part})
        index.append({'file':name,'bounds':bounds(part),'count':len(part),'cell':[tx,ty],**digest(file)})
    tile_index={'type':'SpatialTileIndex','featureCount':len(features),'tileSizeDegrees':TILE_SIZE,'minZoom':13.2,'assignment':'geometryBoundsCenter','boundsMeaning':'unionOfWholeFeatureGeometry','disjoint':True,'bounds':bounds(features),'tiles':index}
    write_json(review/'context-streets-tiles.json',tile_index)
    stats={key:dict(collections.Counter(str(f['properties'].get(key,'[absent]')) for f in features)) for key in ['s','c','k','h','r']}
    source_fields=[field for field in layer['fields'] if field['name'] in list(PROPERTY_FIELDS.values())+NAMES]
    entry = {
        'id': 'context-streets',
        'title': 'Named seven-county street centerlines',
        'file': 'data/context-streets.json.gz',
        'format': 'GeoJSON (gzip)',
        'contentEncoding': 'gzip',
        'uncompressedBytes': full.stat().st_size,
        'uncompressedSha256': digest(full)['sha256'],
        'contextOnly': True,
        'featureCount': len(features),
        'sourceFeatureCount': source_count,
        'bounds': bounds(features),
        'geometry': sorted(set((f['geometry']['type'] for f in features))),
        'identityField': 'roadseg_id',
        'properties': {
            **PROPERTY_FIELDS,
            'n': 'st_concat, or joined native nameParts when st_concat is absent',
            'nameParts': 'Native st_* name components, retained for missing full names only',
            'c': 'Rendering hierarchy derived from funcls_fed, then cartoclass, then route_sys; original codes remain separate',
        },
        'sourceFields': source_fields,
        'source': {
            'url': SERVICE,
            'itemUrl': 'https://www.arcgis.com/home/item.html?id=' + ITEM,
            'sourceDate': source_date,
            'itemModifiedAt': datetime.datetime.fromtimestamp(item['modified'] / 1000, datetime.timezone.utc).isoformat(),
            'retrievedAt': retrieved,
            'coverage': 'Seven metropolitan counties: ' + ', '.join(COUNTIES) + '. Whole segments are selected when either county-side field is in this list; shared border geometry may extend outside.',
            'license': 'MnGeo public opt-in compilation. Its redistribution conditions permit use for any purpose and require downstream users to provide appropriate content, limitation, warranty and liability information. No Creative Commons or public-domain designation is asserted.',
            'licenseUrl': 'https://mn.gov/mngeo/gis-data-and-maps/disclaimer.jsp',
            'metadataFile': 'data/context-streets-metadata.xml',
            'attribution': 'Minnesota Geospatial Information Office, opt-in counties, MetroGIS and Minnesota NG9-1-1 Program',
            'caveats': [
                'Published centerlines provide street navigation context, not underground routes or a surveyed curb line.',
                'Quarterly compilation. Metadata publication and public item modification dates are recorded separately; neither is the survey date of every road.',
                'Quality varies by supplier. Some GAC-only fields are not validated; missing class or lifecycle fields remain absent.',
                'MnGeo supplies data as is, without warranties of accuracy, currency, completeness or suitability. Consult county source data for the most current roads.',
                'Entire source polylines are retained with WGS84 coordinates rounded to six decimal places. No clipping or line simplification is applied.',
                'Native roadseg_id, full street name, class, route system, lifecycle and county/municipal names are preserved with explicit compact property mappings. Each segment appears once in spatial tiles assigned by its geometry-bounds center; tile bounds contain complete geometry.',
                'Street names are source labels. Unnamed records are not given invented names, and lifecycle states are not inferred from route class.',
            ],
        },
        'query': {
            'where': WHERE,
            'outSR': 4326,
            'selectedFields': FIELDS,
        },
        'fieldDomains': {
        },
        'tiles': {
            'index': 'data/context-streets-tiles.json',
            'tileCount': len(index),
            'assignment': 'geometryBoundsCenter',
            'disjoint': True,
            'minZoom': 13.2,
        },
        'statistics': {
            'namedFeatureCount': sum((bool(f['properties'].get('n')) for f in features)),
            'nativeFullNameCount': sum((bool(str(f['attributes'].get('st_concat') or '').strip()) for f in records)),
            'componentNameCount': sum(('nameParts' in f['properties'] for f in features)),
            'sourceCounts': stats,
        },
        **digest(compressed),
    }
    write_json(review/'manifest-entry.json',entry)
    write_json(review/'review.json',{'featureCount':len(features),'namedFeatureCount':entry['statistics']['namedFeatureCount'],'nativeFullNameCount':entry['statistics']['nativeFullNameCount'],'componentNameCount':entry['statistics']['componentNameCount'],'uniqueNativeIDs':len(set(road_ids)),'tileCount':len(index),'totalTileBytes':sum(t['bytes'] for t in index),'largestTileBytes':max(t['bytes'] for t in index),'bounds':entry['bounds'],'fullFile':digest(full),'gzipFile':digest(compressed),'sourceCounts':stats})
    print(json.dumps(json.loads((review/'review.json').read_text()),indent=2),flush=True)


def publish(review):
    entry=json.loads((review/'manifest-entry.json').read_text())
    assert digest(review/'context-streets.json.gz')=={k:entry[k] for k in ['bytes','sha256']}
    assert hashlib.sha256(gzip.decompress((review/'context-streets.json.gz').read_bytes())).hexdigest()==entry['uncompressedSha256']
    index=json.loads((review/'context-streets-tiles.json').read_text())
    for tile in index['tiles']:
        assert digest(review/tile['file'])=={k:tile[k] for k in ['bytes','sha256']}
    for name in ['context-streets.json.gz','context-streets-tiles.json','context-streets-metadata.xml']:
        shutil.copyfile(review/name,MAP/'data'/name)
    shutil.copytree(review/'context-streets-tiles',MAP/'data/context-streets-tiles',dirs_exist_ok=True)
    manifest=json.loads((MAP/'datasets.json').read_text())
    existing=next((i for i,d in enumerate(manifest['datasets']) if d['id']==entry['id']),None)
    if existing is None:
        manifest['datasets'].append(entry)
    else:
        previous=manifest['datasets'][existing]
        assert previous['file'] in [entry['file'],entry['file'].removesuffix('.gz')] and previous['source']['url']==entry['source']['url'],'Refuse to replace an unrelated dataset'
        manifest['datasets'][existing]=entry
    (MAP/'datasets.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print('Published reviewed context-streets: %s segments in %s disjoint tiles'%(entry['featureCount'],entry['tiles']['tileCount']))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-dir',type=pathlib.Path,default=pathlib.Path('/tmp/under-street-context/reviewed'))
    parser.add_argument('--refresh',action='store_true',help='Discard cached staging files and acquire a fresh snapshot')
    parser.add_argument('--publish',action='store_true',help='Publish previously staged/hash-checked review without reacquisition')
    args=parser.parse_args()
    if args.publish:
        assert not args.refresh,'Publishing does not refresh source data'
        publish(args.review_dir)
    else:
        if args.refresh and args.review_dir.exists():
            assert (args.review_dir/'acquisition-state.json').exists(),'Refuse to clear a directory without an acquisition marker'
            assert args.review_dir.resolve()!=MAP.resolve(),'Refuse to clear the published asset directory'
            assert not MAP.resolve().is_relative_to(args.review_dir.resolve()),'Refuse to clear a parent of the published assets'
            shutil.rmtree(args.review_dir)
        stage(args.review_dir)
