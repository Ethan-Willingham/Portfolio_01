#!/usr/bin/env python3
"""Build city-only exports from a source archive and anonymous public GIS.

Requires shapely and pyproj. Pass the earlier acquisition directory as --input.
No geometry is inferred from drawings, drain locations or neighboring pipes.
"""
import argparse
import concurrent.futures
import copy
import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

from pyproj import Transformer
from shapely import make_valid
from shapely.geometry import Point, box, mapping, shape

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'archive/under-the-street/assets/map'
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
BOUNDARY_URL = 'https://arcgis.metc.state.mn.us/data1/rest/services/boundary/Counties_CTUs/FeatureServer/0'
DISTRICT = 'https://services1.arcgis.com/akJvlMqEfOC1yVhp/arcgis/rest/services/Infrastructure_DistOwned/FeatureServer/'
CITY = 'https://services1.arcgis.com/9meaaHE3uiba0zr8/arcgis/rest/services/'
NEW = [
    ('trout-brook', 'Trout Brook storm interceptor', 'https://services1.arcgis.com/7OeMclmTSGm7zTuf/arcgis/rest/services/TroutBrookInterceptor_Public_view/FeatureServer/2', None, 'Capitol Region Watershed District', '2023-10-04'),
    ('rwmwd-pipes', 'District storm pipes in Saint Paul', DISTRICT+'0', None, 'Ramsey-Washington Metro Watershed District', None),
    ('rwmwd-structures', 'District storm structures in Saint Paul', DISTRICT+'1', None, 'Ramsey-Washington Metro Watershed District', None),
    ('rwmwd-ponds', 'District stormwater ponds in Saint Paul', DISTRICT+'4', None, 'Ramsey-Washington Metro Watershed District', None),
    ('saint-paul-hydrants', 'Saint Paul public hydrants, 2021', 'https://services9.arcgis.com/OhApV2tSBivqSpuX/arcgis/rest/services/Public_Hydrants_2021_View/FeatureServer/0', ['FID','OBJECTID','LOCATION','ASSET_ID'], 'Saint Paul Regional Water Services', '2021-12-08'),
    ('saint-paul-signals', 'Saint Paul traffic-signal connections', CITY+'pwTrafficSignalLines_COPY/FeatureServer/35', ['OBJECTID','TYPE'], 'City of Saint Paul', '2025-04-18'),
]
KEEP = {
    'osm-waterworks','osm-water-towers','drinking-water-protection','drinking-water-vulnerability',
    'mces-interceptors','mces-treatment-plants','mces-lift-stations','mces-flow-meters','sewersheds','osm-wastewater-plants',
    'streamsug','surface-streams','osm-dams-locks','osm-power-lines','osm-substations','eia-power-plants','eia-generators',
    'osm-power-plants','osm-power-minor','osm-power-cables','electric-service-areas','osm-pipelines','osm-pipeline-stations',
    'osm-data-centers','osm-telephone-exchanges','telephone-service-areas','rail-routes','bedrock-depth-2025','bedrock',
    'bedrockfaults','surficial-geology','wells-complete','groundwater-areas','groundwater-boundaries','groundwater-source-areas',
    'groundwater-sites','groundwater-sites-unmapped','cleanup-sites','roads-context','water','context-streets'
}
MEDIA_TYPES = set('bedrock-Cu bedrock-Ol bedrock-Omu abandonedsewer biomassplant cleanup coalplant culvert dam dc distribution districtheat effluent electricarea emptyconduit exch forcemain gas gasplant gravity groundwater groundwaterBoundary groundwaterSite groundwaterSource hydrant hydroplant lift meter oilplant pipeline pplant protection rail sewershed signalconnection signalcopper signalfiber signalradio siphon storminlet stormmanhole stormoutfall stormpond stormsewer stormstructure sub surfacewater surficial tank telephonearea tower tplant transmission undergroundtank vulnerability well'.split())

def get(url, **params):
    query = urllib.parse.urlencode(params or {'f':'json'})
    with urllib.request.urlopen(url+'?'+query, timeout=60) as response:
        data = json.load(response)
    if data.get('error'):
        raise RuntimeError(f"Public query failed: {url}: {data['error']}")
    return data

def read(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)

def write(relative, data):
    path = DEST / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, separators=(',',':'), ensure_ascii=False).encode()
    path.write_bytes(gzip.compress(raw, mtime=0) if path.suffix == '.gz' else raw)
    return len(raw)

def features_inside(data, boundary):
    result = []
    for feature in data.get('features', []):
        if not feature.get('geometry'):
            continue
        geom = shape(feature['geometry'])
        original_dimension = 'Polygon' if 'Polygon' in geom.geom_type else 'LineString' if 'LineString' in geom.geom_type else 'Point'
        if not geom.is_valid:
            geom = make_valid(geom)
        if geom.is_empty or not geom.intersects(boundary):
            continue
        clipped = geom if boundary.covers(geom) else geom.intersection(boundary)
        # A point touch does not create a pipe segment; collections keep only
        # components of the original dimension.
        if clipped.geom_type == 'GeometryCollection':
            parts = [p for p in clipped.geoms if original_dimension in p.geom_type]
            if not parts:
                continue
            from shapely.ops import unary_union
            clipped = unary_union(parts)
        if clipped.is_empty or original_dimension not in clipped.geom_type:
            continue
        item = copy.deepcopy(feature)
        item['geometry'] = mapping(clipped)
        if 'Point' not in clipped.geom_type:
            anchor = clipped.interpolate(.5, normalized=True) if 'LineString' in clipped.geom_type else clipped.representative_point()
            item['displayAnchor'] = [anchor.x,anchor.y]
        result.append(item)
    return {'type':'FeatureCollection','features':result}

def stamp(entry, data, original_count=None):
    entry.pop('legacy', None)
    for key in ['statistics','tiles','bounds','raster','rangeFeet','validCellCount','reproduce']:
        entry.pop(key, None)
    source = entry['source']
    source['coverage'] = 'Saint Paul city limits. Crossing geometry is clipped to the city boundary.'
    source['caveats'] = [s for s in source.get('caveats',[]) if not any(t in s.lower() for t in ['no clipping','entire source','whole segment','seven-county','minneapolis','bassett','west saint paul','bloomington','eagan'])]
    source['caveats'].append('Only the Saint Paul portion is included. Clipped geometry does not change the original source attributes; a published length can describe the complete original segment.')
    entry['scope'] = {'city':'Saint Paul','boundaryFile':'cities.json','operation':'intersection','originalFeatureCount':original_count}
    if data.get('type') == 'FeatureCollection':
        entry['featureCount'] = len(data['features'])
        entry['geometry'] = sorted(set(f['geometry']['type'] for f in data['features']))
        if data['features']:
            all_bounds = [shape(f['geometry']).bounds for f in data['features']]
            entry['bounds'] = [min(b[0] for b in all_bounds),min(b[1] for b in all_bounds),max(b[2] for b in all_bounds),max(b[3] for b in all_bounds)]
    raw_size = write(entry['file'], data)
    raw = (DEST / entry['file']).read_bytes()
    entry['bytes'] = len(raw)
    entry['sha256'] = hashlib.sha256(raw).hexdigest()
    if entry['file'].endswith('.gz'):
        entry.update(contentEncoding='gzip', format='GeoJSON (gzip)', uncompressedBytes=raw_size)
    print(entry['id'], entry.get('featureCount'), flush=True)
    return entry

def acquire(spec, boundary):
    identifier, title, url, selected, attribution, date = spec
    meta = get(url, f='json')
    oid = meta.get('objectIdField') or next(f['name'] for f in meta['fields'] if f['type']=='esriFieldTypeOID')
    xmin,ymin,xmax,ymax = boundary.bounds
    ids = get(url+'/query', f='json', where='1=1', geometry=f'{xmin},{ymin},{xmax},{ymax}', geometryType='esriGeometryEnvelope', inSR=4326, spatialRel='esriSpatialRelIntersects', returnIdsOnly='true').get('objectIds') or []
    fields = selected or [f['name'] for f in meta['fields'] if not any(t in f['name'].lower() for t in ['editedby','editor','edited_by','file_lzrfch','globalid','shape__','x_decdeg','y_decdeg'])]
    if oid not in fields:
        fields.append(oid)
    records = []
    for start in range(0,len(ids),100):
        page = get(url+'/query', f='geojson', objectIds=','.join(map(str,ids[start:start+100])), outFields=','.join(fields), returnGeometry='true', outSR=4326)
        assert not page.get('exceededTransferLimit'), title+' was truncated'
        records.extend(page.get('features',[]))
    assert len(records)==len(ids), title+' did not return every requested record'
    data = features_inside({'features':records}, boundary)
    edit = meta.get('editingInfo',{}).get('lastEditDate')
    entry = {'id':identifier,'title':title,'file':'data/'+identifier+'.json','format':'GeoJSON',
        'properties':{f['name']:f.get('alias') or f['name'] for f in meta['fields'] if f['name'] in fields},
        'sourceFields':[{k:f[k] for k in ['name','alias','type','domain'] if k in f} for f in meta['fields'] if f['name'] in fields],
        'source':{'url':url,'sourceDate':date or (datetime.datetime.fromtimestamp(edit/1000,datetime.timezone.utc).date().isoformat() if edit else 'Source date not supplied'),'retrievedAt':NOW,'attribution':attribution,'license':'Publicly shared ArcGIS layer. No explicit reuse license is supplied in the service metadata.','caveats':[]}}
    if identifier.startswith('rwmwd-'):
        entry['source']['caveats'].append('District-owned infrastructure only, not the complete municipal storm-drain network. Missing values and source codes are retained.')
        entry['source']['caveats'].append('Size and elevation field units and vertical datum are not supplied in this layer metadata. They are displayed without inferred units.')
    if identifier=='trout-brook':
        entry['source']['caveats'].append('Published storm-interceptor alignment. The public view supplies ObjectID and geometry, without per-segment diameter, depth or material.')
    if identifier=='saint-paul-signals':
        entry['source']['caveats'].append('Traffic-signal connections include fiber, copper, low-voltage, overhead, radio, empty and abandoned records. A line does not by itself establish a buried cable or residential internet service.')
    if identifier=='saint-paul-hydrants':
        entry['source']['caveats'].append('December 2021 public-hydrant snapshot. Hydrant points do not establish the route or present condition of a water main.')
    return stamp(entry, data, len(ids))

def clip_raster(data, boundary):
    transform = Transformer.from_crs(4326,3857,always_xy=True)
    inverse = Transformer.from_crs(3857,4326,always_xy=True)
    e=data['extentMeters']; e=[e['xmin'],e['ymin'],e['xmax'],e['ymax']] if isinstance(e,dict) else e
    dx=(e[2]-e[0])/data['width'];dy=(e[3]-e[1])/data['height']
    xmin,ymin=transform.transform(*boundary.bounds[:2]);xmax,ymax=transform.transform(*boundary.bounds[2:])
    c0=max(0,math.floor((xmin-e[0])/dx));c1=min(data['width'],math.ceil((xmax-e[0])/dx))
    r0=max(0,math.floor((e[3]-ymax)/dy));r1=min(data['height'],math.ceil((e[3]-ymin)/dy))
    values=[]
    for row in range(r0,r1):
        for col in range(c0,c1):
            lon,lat=inverse.transform(e[0]+(col+.5)*dx,e[3]-(row+.5)*dy)
            values.append(data['values'][row*data['width']+col] if boundary.covers(Point(lon,lat)) else None)
    out=copy.deepcopy(data)
    out.update(width=c1-c0,height=r1-r0,values=values,extentMeters=[e[0]+c0*dx,e[3]-r1*dy,e[0]+c1*dx,e[3]-r0*dy],bounds=list(boundary.bounds))
    return out

def build(args):
    source=Path(args.input)
    old=read(source/'datasets.json')
    border=get(BOUNDARY_URL+'/query',f='geojson',where="CTU_NAME = 'St. Paul'",outFields='CTU_NAME,CTU_ID',outSR=4326)
    assert len(border['features'])==1
    boundary=shape(border['features'][0]['geometry'])
    assert boundary.is_valid
    entries=[]
    bentry=copy.deepcopy(next(d for d in old['datasets'] if d['id']=='cities'))
    bentry.update(title='Saint Paul city boundary',properties={'CTU_NAME':'Municipality name','CTU_ID':'Source municipality identifier'})
    bentry['source'].update(sourceDate='2026 public boundary service',retrievedAt=NOW,caveats=['Published municipal boundary; not a parcel survey.'])
    entries.append(stamp(bentry,border,1))
    (DEST/'city-boundary.js').write_text('window.UnderStreetBoundary='+json.dumps(border,separators=(',',':'))+';\n')
    for original in old['datasets']:
        if original['id'] not in KEEP:
            continue
        entry=copy.deepcopy(original); data=read(source/entry['file'])
        if original['format']=='DepthRaster':
            out=clip_raster(data,boundary)
            stamp(entry,out)
            entry.update(featureCount=out['width']*out['height'],validCellCount=sum(v is not None for v in out['values']),bounds=list(boundary.bounds),rangeFeet=[min(v for v in out['values'] if v is not None),max(v for v in out['values'] if v is not None)],raster={k:out[k] for k in ['width','height','extentMeters']})
        else:
            out=features_inside(data,boundary)
            if not out['features']:
                continue
            entry['title']=entry['title'].replace('Named seven-county street centerlines','Saint Paul street centerlines')
            stamp(entry,out,len(data.get('features',[])))
        if entry['source'].get('metadataFile'):
            relative=entry['source']['metadataFile'];(DEST/relative).parent.mkdir(parents=True,exist_ok=True);(DEST/relative).write_bytes((source/relative).read_bytes())
        entries.append(entry)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        entries.extend(executor.map(lambda s:acquire(s,boundary),NEW))
    # City extracts are small enough to load whole. Street tiles retain the
    # renderer's existing disjoint cache and share exact source IDs.
    streets=next(d for d in entries if d['id']=='context-streets')
    data=read(DEST/streets['file']);groups={}
    for f in data['features']:
        b=shape(f['geometry']).bounds;x=math.floor((b[0]+b[2])/2/.02);y=math.floor((b[1]+b[3])/2/.02)
        groups.setdefault((x,y),[]).append(f)
    index={'schemaVersion':1,'featureCount':len(data['features']),'tiles':[]}
    for (x,y),fs in sorted(groups.items()):
        relative=f'data/context-streets-tiles/{x}_{y}.json.gz';write(relative,{'type':'FeatureCollection','features':fs})
        bs=[shape(f['geometry']).bounds for f in fs]
        index['tiles'].append({'file':relative.removeprefix('data/'),'count':len(fs),'bounds':[min(b[0] for b in bs),min(b[1] for b in bs),max(b[2] for b in bs),max(b[3] for b in bs)]})
    write('data/context-streets-tiles.json',index)
    streets['tiles']={'index':'data/context-streets-tiles.json','tileCount':len(groups),'disjoint':True,'assignment':'geometryBoundsCenter','minZoom':13.2}
    manifest={'schemaVersion':2,'updatedAt':NOW,'scope':'Saint Paul city limits only','boundaryFile':'cities.json','datasets':entries}
    write('datasets.json',manifest)
    # Keep exact photographs only when their named site is inside the city.
    media=read(source/'media.json')
    media['verifiedAt']=NOW[:10]
    media['photoPolicy']='Only photographs of verified mapped subjects inside Saint Paul are included. No generic photograph stands in for a selected record.'
    media['photos']=[p for p in media['photos'] if not p.get('illustrative') and p.get('match',{}).get('near') and boundary.covers(Point(*p['match']['near']))]
    media['types']={k:{a:b for a,b in v.items() if a!='illustrativePhoto'} for k,v in media['types'].items() if k in MEDIA_TYPES}
    write('media.json',media)
    keep={'datasets.json','media.json','city-boundary.js','vendor/fflate-0.8.3.min.js','vendor/fflate-LICENSE.txt','vendor/README.md','data/context-streets-tiles.json'}
    for relative in ['vendor/fflate-LICENSE.txt','vendor/README.md']:
        (DEST/relative).write_bytes((source/relative).read_bytes())
    for entry in entries:
        keep.add(entry['file'])
        if entry['source'].get('metadataFile'):keep.add(entry['source']['metadataFile'])
    keep.update('data/'+t['file'] for t in index['tiles'])
    for photo in media['photos']:
        for key in ['src','webp']:
            if photo.get(key):keep.add(photo[key].removeprefix('assets/map/'))
    for file in DEST.rglob('*'):
        if file.is_file() and str(file.relative_to(DEST)) not in keep:file.unlink()
    write('saint-paul-scope.json',{'city':'Saint Paul','bounds':list(boundary.bounds),'datasets':len(entries),'photos':len(media['photos']),'boundarySource':BOUNDARY_URL})
    print('Complete:',len(entries),'datasets;',len(media['photos']),'exact-site photographs')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    build(parser.parse_args())
