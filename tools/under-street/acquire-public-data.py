#!/usr/bin/env python3
"""Fetch documented public ArcGIS layers and preserve a small source manifest.

Usage: python3 tools/under-street/acquire-public-data.py [dataset-id ...]
Requires only Python's standard library. Complete point exports over 10 MB also
receive 0.05-degree spatial tiles. Raw selected properties, source counts, dates,
domains, bounds and hashes are recorded; no property-owner names are requested.
Well and service complete downloads use deterministic gzip; browser tiles remain JSON.
"""
import concurrent.futures
import datetime as dt
import gzip
import hashlib
import io
import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / 'archive/under-the-street/assets/map/data'
MANIFEST = DEST.parent / 'datasets.json'
BBOX = [-94.05, 44.47, -92.52, 45.42]
MPLS = 'https://services.arcgis.com/afSMGVsC7QlRK1kZ/ArcGIS/rest/services/'
WSP = 'https://services7.arcgis.com/oGa6NME3fsJnxTjN/ArcGIS/rest/services/'
STATE = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/'
MCES = 'https://arcgis.metc.state.mn.us/data1/rest/services/utility/ES_Utility_Asset_Public/FeatureServer/'

def spec(id, title, url, fields, properties, coverage, caveat, license, clip=True):
    return dict(id=id, title=title, url=url, fields=fields, properties=properties,
                coverage=coverage, caveats=caveat, license=license, clip=clip)

SPECS = [
    spec('service-lines', 'Minneapolis water service-line inventory',
         MPLS+'ServiceLineInventory_Public/FeatureServer/0',
         'OBJECTID,Classification,ServiceType,Diameter1,Diameter2,Discontinued',
         {'i':'OBJECTID','c':'Classification','t':'ServiceType','d':'Diameter1','d2':'Diameter2','x':'Discontinued'},
         'City of Minneapolis published service connection locations',
         ['Inventory points are service connections, not water-main or service-pipe alignments.',
          'Classification records material status, not a measurement of lead in drinking water.',
          'Full published inventory includes discontinued or non-water service records; use x and t to filter.',
          'Addresses, inspection comments and property-owner information are omitted.'],
         'City of Minneapolis published public data; city Open Data policy permits reuse. No item-specific CC license is supplied.', False),
    spec('wsp-sanitary-pipes', 'West Saint Paul sanitary pipes',
         WSP+'Sanitary_Sewer_System_View/FeatureServer/2',
         'OBJECTID,PIPE_NUM,PIPE_SZ,PIPE_MAT,YR_INST,PIPE_GR,ABANDONED,PIPE_LENGTH',
         {'n':'PIPE_NUM','d':'PIPE_SZ','m':'PIPE_MAT','y':'YR_INST','g':'PIPE_GR','a':'ABANDONED','l':'PIPE_LENGTH'},
         'City of West Saint Paul', ['Published city collection pipes only; does not fill the Minneapolis or Saint Paul local-network gaps.'],
         'City of West Saint Paul public GIS; item terms and city GIS disclaimer apply.'),
    spec('wsp-storm-pipes', 'West Saint Paul storm pipes',
         WSP+'Storm_Sewer_view/FeatureServer/3', 'OBJECTID,Width,Length,Enabled',
         {'d':'Width','l':'Length','e':'Enabled'}, 'City of West Saint Paul',
         ['d is the published Width field; units are not documented in the public layer and must not be inferred.',
          'Published city storm pipes only; not a metro-wide storm network.'],
         'City of West Saint Paul public GIS; item terms and city GIS disclaimer apply.'),
    spec('wsp-sanitary-manhole', 'West Saint Paul sanitary manholes',
         WSP+'Sanitary_Sewer_System_View/FeatureServer/0', 'OBJECTID,MH_NUM,YR_INST,ABANDONED',
         {'n':'MH_NUM','y':'YR_INST','a':'ABANDONED'}, 'City of West Saint Paul',
         ['Locations identify published municipal access structures.'],
         'City of West Saint Paul public GIS; item terms and city GIS disclaimer apply.'),
    spec('wsp-storm-inlets', 'West Saint Paul street catch basins',
         WSP+'Storm_Sewer_view/FeatureServer/7', 'OBJECTID,Type,Enabled',
         {'t':'Type','e':'Enabled'}, 'City of West Saint Paul',
         ['Street catch basins only; special and yard catch basins are separate source layers.'],
         'City of West Saint Paul public GIS; item terms and city GIS disclaimer apply.'),
    spec('wsp-storm-manhole', 'West Saint Paul storm manholes',
         WSP+'Storm_Sewer_view/FeatureServer/2', 'OBJECTID,Structure_Number,Type,Enabled',
         {'n':'Structure_Number','t':'Type','e':'Enabled'}, 'City of West Saint Paul',
         ['Public view has a separate inventory from sanitary manholes.'],
         'City of West Saint Paul public GIS; item terms and city GIS disclaimer apply.'),
    spec('wells-complete', 'County Well Index located non-public-supply wells',
         STATE+'us_mn_state_health/water_well_information_non_pws/FeatureServer/1',
         'objectid,unique_no,depth_drll,depth2bdrk,aquifer,status_c,use_c,date_drll,updt_date,loc_mc,gcm_code,strat_mc,logurl',
         {'i':'unique_no','d':'depth_drll','b':'depth2bdrk','a':'aquifer','s':'status_c','u':'use_c','y':'date_drll','updated':'updt_date','q':'loc_mc','coordinateMethod':'gcm_code','geologyMethod':'strat_mc','url':'logurl'},
         'Located CWI records within the metro bounding box; public water-supply wells are excluded by MDH from this source',
         ['Includes active, sealed and other well statuses. Some depths, aquifers and drill dates are missing.',
          'q (LOC_MC) verifies the well unique number, not the geographic coordinates.',
          'coordinateMethod (GCM_CODE) preserves the source method used to derive coordinates; code precision classes are not measured errors for each point.',
          'geologyMethod (STRAT_MC) identifies the geologic interpretation method, which can use logs, samples, a map or only an aquifer code.',
          'Complete means all located records returned within this bounding box, not every well ever drilled.',
          'Reported depth to bedrock can depend on interpreted stratigraphy; it is not necessarily a field measurement. The regional depth layer is a separate MGS model.'],
         'Minnesota Department of Health and Minnesota Geological Survey public GIS; source attribution and no-warranty terms apply.'),
    spec('groundwater-areas', 'MPCA groundwater contamination areas of concern',
         STATE+'us_mn_state_pca/env_mn_gw_contamination_atlas/FeatureServer/5',
         'objectid,item_id,project_id,project_name,project_type,status,media_type,draw_date,method',
         {'i':'item_id','n':'project_name','id':'project_id','t':'project_type','s':'status','media':'media_type','date':'draw_date','method':'method'},
         'Published MPCA remediation areas intersecting the metro bounding box',
         ['Areas of concern are not maps of health risk to a neighborhood.',
          'Boundaries are interpreted from reports and sampling. Use groundwater-boundaries for published certainty.',
          'Not every contamination site has a mapped area; individual areas have different mapping dates.'],
         'Minnesota Pollution Control Agency public GIS; attribution and source no-warranty terms apply.'),
    spec('groundwater-boundaries', 'MPCA groundwater boundary certainty',
         STATE+'us_mn_state_pca/env_mn_gw_contamination_atlas/FeatureServer/3', '*',
         {'n':'project_na','id':'project_id','certainty':'type','t':'project_ty','date':'draw_date','s':'status'},
         'Published MPCA boundaries intersecting the metro bounding box',
         ['Preserves published certainty attributes when supplied; source schema is recorded in this manifest.'],
         'Minnesota Pollution Control Agency public GIS; attribution and source no-warranty terms apply.'),
    spec('groundwater-sites', 'MPCA groundwater atlas source sites',
         STATE+'us_mn_state_pca/env_mn_gw_contamination_atlas/FeatureServer/2', '*',
         {'n':'name','id':'project_id','project':'project_name','t':'project_type','i':'item_id'},
         'Published MPCA atlas site locations in the metro bounding box',
         ['A source-site point is not a plume boundary or a map of exposure.'],
         'Minnesota Pollution Control Agency public GIS; attribution and source no-warranty terms apply.'),
    spec('groundwater-sites-unmapped', 'MPCA groundwater atlas sites without mapped areas',
         STATE+'us_mn_state_pca/env_mn_gw_contamination_atlas/FeatureServer/1', '*',
         {'n':'name','id':'project_id','project':'project_name','t':'project_type','i':'item_id'},
         'Published MPCA atlas site locations in the metro bounding box',
         ['Source explicitly has no mapped contamination area for these sites.'],
         'Minnesota Pollution Control Agency public GIS; attribution and source no-warranty terms apply.'),
    spec('groundwater-source-areas', 'MPCA potential contamination source areas',
         STATE+'us_mn_state_pca/env_mn_gw_contamination_atlas/FeatureServer/4', '*',
         {'n':'project_name','id':'project_id','t':'project_type','s':'status','date':'draw_date','i':'item_id'},
         'Published MPCA potential source areas intersecting the metro bounding box',
         ['Potential source areas and groundwater areas of concern are different datasets.'],
         'Minnesota Pollution Control Agency public GIS; attribution and source no-warranty terms apply.'),
    spec('cleanup-sites', 'MPCA investigation, cleanup and tank sites',
         STATE+'us_mn_state_pca/env_my_neighborhood/FeatureServer/0', '*',
         {'n':'name','id':'site_id','p':'program_name','a':'activity','s':'active_flag','url':'site_url'},
         'MPCA regulated sites in the metro bounding box; on-theme programs selected after acquisition',
         ['A regulated tank or cleanup site is not evidence of an exposure or current contamination.',
          'Multiple program records can describe the same location; source features are preserved.'],
         'Minnesota Pollution Control Agency permits redistribution with complete source metadata and attribution.'),
    spec('pavement-all', 'Minneapolis historical pavement inventory',
         MPLS+'PWStreetPavementMgmt/FeatureServer/0',
         'OBJECTID,STREET_O_NAME_1,PCI,INSPECTION_DATE,CONST_YR,RENOVATION_YR,PAVEMENT',
         {'n':'STREET_O_NAME_1','pci':'PCI','date':'INSPECTION_DATE','y':'CONST_YR','r':'RENOVATION_YR','t':'PAVEMENT'},
         'City of Minneapolis published street segments',
         ['Historical inventory last edited in 2015; this does not describe current pavement condition.',
          'Most segments do not have a published PCI rating; null remains unknown, never zero.'],
         'City of Minneapolis published public data; city Open Data policy permits reuse. No item-specific CC license is supplied.', False),
    spec('surface-streams', 'DNR rivers and streams',
         STATE+'us_mn_state_dnr/water_dnr_hydrography/FeatureServer/0',
         'objectid,dnr_hydro_id,kittle_name,label,strm_type,strm_type_desc,content_date,publish_date',
         {'i':'dnr_hydro_id','n':'kittle_name','label':'label','t':'strm_type','type':'strm_type_desc','date':'content_date','published':'publish_date'},
         'DNR mapped hydrographic stream segments intersecting the metro bounding box',
         ['Includes perennial and intermittent streams, connectors, culverts and other mapped hydrographic segment types.',
          'The source combines multiple mapping scales and dates; individual geometries can extend outside the acquisition box.',
          'A culvert, force main or superseded channel is not automatically a buried creek. Preserve the published type.'],
         'Minnesota DNR public GIS; no use constraints. DNR General Geographic Data License and attribution apply.'),
    spec('surficial-geology', 'MGS D-01 surficial geology',
         'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/D_01_Surficial_Geology_WFL1/FeatureServer/0',
         'OBJECTID,Name,Fullname,Description,MapUnit,lithology,USDAtexture,Environment,DepositType,age,formation,lobe,last_edited_date',
         {'n':'Name','name':'Fullname','description':'Description','unit':'MapUnit','lithology':'lithology','texture':'USDAtexture','environment':'Environment','deposit':'DepositType','age':'age','formation':'formation','lobe':'lobe','date':'last_edited_date'},
         'Latest public MGS D-01 polygons intersecting the metro bounding box',
         ['Surficial sediment units, separate from bedrock geology and modeled depth to bedrock.',
          'Regional compilation from maps with different scales and dates; not a geotechnical survey of a property.'],
         'Minnesota Geological Survey public data; reference the MGS and retain item terms.'),
    spec('electric-service-areas', 'Minnesota electric utility service areas',
         STATE+'us_mn_state_mngeo/util_eusa/FeatureServer/0',
         'objectid,elec_comp,full_name,mpuc_name,type,municipal,edited,website',
         {'n':'elec_comp','name':'full_name','utility':'mpuc_name','t':'type','municipal':'municipal','date':'edited','url':'website'},
         'Minnesota utility service areas intersecting the metro bounding box',
         ['Service territories identify the responsible utility, not wires, substations or underground electric routes.',
          'The source states boundaries are approximate and not suitable for legal determinations.'],
         'Minnesota public utility service-area data; attribution and source no-warranty terms apply.'),
    spec('telephone-service-areas', 'Minnesota telephone exchange service areas',
         STATE+'us_mn_state_mngeo/util_telephone_exchange/FeatureServer/0',
         'objectid_1,co_name,exchange,wirecenter,frozen,bound_type',
         {'operator':'co_name','n':'exchange','wirecenter':'wirecenter','frozen':'frozen','boundary':'bound_type'},
         'Public telephone exchange polygons intersecting the metro bounding box',
         ['Historic telephone exchange boundaries are service areas, not fiber routes or proof of current broadband availability.',
          'Source publication dates and legacy operator names can predate current providers.'],
         'Minnesota public telephone exchange data; attribution and source no-warranty terms apply.'),
    spec('community-water-sources', 'Metro community water supply types and sources',
         'https://arcgis.metc.state.mn.us/data1/rest/services/water/Water_Supply/FeatureServer/0', '*',
         {'n':'CTU_NAME','ctu':'CTU_ID','county':'County','t':'MWSP_SystemType','source':'Source_MunicipalWater','id':'MDH_PWSID','subregion':'Subregion_MetCouncil'},
         'Metropolitan Council community planning records, joined by CTU_ID in the publisher map',
         ['Published table, not geometries. Source codes and system-type integers need their source documentation before interpretation.'],
         'Metropolitan Council public data; source attribution and no-warranty terms apply.'),
    spec('mces-interceptors', 'MCES current public interceptor inventory', MCES+'4', '*',
         {'n':'InterceptorName','i':'InterceptorSection','s':'FeatureStatus','operator':'FeatureOwner','l':'LengthFt','shape':'FeatureShape','date':'DataSourceDate','type':'Symbology'},
         'Regional interceptor sections intersecting the metro bounding box',
         ['Includes abandoned and other non-operating sections; preserve published status.',
          'The public service has no diameter field. These are regional interceptors, not every municipal collection pipe.'],
         'Metropolitan Council public utility inventory; complete item terms and source disclaimer apply.'),
    spec('mces-flow-meters', 'MCES current public sewer flow meters', MCES+'2', '*',
         {'i':'UniqueID','n':'FeatureLabel','s':'FeatureStatus','interceptor':'InterceptorName','date':'DataSourceDate'},
         'Regional sewer flow meters in the metro bounding box',
         ['Includes all published statuses, not only online meters.'],
         'Metropolitan Council public utility inventory; complete item terms and source disclaimer apply.'),
    spec('mces-lift-stations', 'MCES current public lift stations', MCES+'0', '*',
         {'i':'UniqueID','n':'FeatureLabel','s':'FeatureStatus','operator':'FeatureOwner','interceptor':'InterceptorName','date':'DataSourceDate'},
         'Regional lift stations in the metro bounding box',
         ['Regional lift stations only; published statuses include facilities that are not online.'],
         'Metropolitan Council public utility inventory; complete item terms and source disclaimer apply.'),
    spec('mces-treatment-plants', 'MCES current and historic treatment plants', MCES+'3', '*',
         {'i':'UniqueID','n':'FeatureLabel','abbr':'Abbreviation','s':'FeatureStatus','city':'CTU_NAME','county':'CO_NAME','opened':'YearOpened','abandoned':'YearAbandoned','closed':'YearClosed','date':'DataSourceDate'},
         'MCES current and historic facilities in the metro bounding box',
         ['Includes closed, abandoned or reconveyed facilities; status is part of the record.',
          'OSM wastewater plants are a separate supplementary dataset and can duplicate these facilities.'],
         'Metropolitan Council public utility inventory; complete item terms and source disclaimer apply.'),
    spec('drinking-water-protection', 'MDH drinking water supply management areas',
         STATE+'us_mn_state_health/water_drinking_water_supply/FeatureServer/0', '*',
         {'i':'dws_id','n':'dws_name','t':'whp_type_c','zone':'cz_type_c','date':'dwsa_d','s':'dws_stat_c','pws':'pwsid'},
         'MDH-approved groundwater protection planning areas intersecting the metro bounding box',
         ['Protection planning boundaries, not contamination plumes, actual pipe routes or drinking-water service boundaries.'],
         'Minnesota Department of Health public GIS; source no-warranty terms and attribution apply.'),
    spec('drinking-water-vulnerability', 'MDH revised groundwater supply vulnerability',
         STATE+'us_mn_state_health/water_drinking_water_supply_vuln/FeatureServer/0', '*',
         {'i':'dwsvul_id','n':'dws_name','v':'dws_vul','code':'dws_vul_c','area':'dws_id','s':'dws_stat_c','source':'source','notes':'notes'},
         'Revised MDH groundwater supply vulnerability polygons intersecting the metro bounding box',
         ['Vulnerability is a planning classification of susceptibility to contamination, not evidence of contamination or exposure.',
          'Use the published text classification; do not interpret raw codes without their documentation.'],
         'Minnesota Department of Health public GIS; source no-warranty terms and attribution apply.'),
    spec('surface-water-protection', 'MDH surface water supply management areas',
         STATE+'us_mn_state_health/water_drinking_water_supply_sw/FeatureServer/0', '*',
         {'n':'surwa_name','i':'swa_id','pws':'pwss_id','date':'surwa_d','t':'surfwa_typ','s':'sur_stat_c','method':'delin_type','watershed':'huc_8_name'},
         'Revised MDH surface-water source protection areas intersecting the metro bounding box',
         ['Source-protection planning areas can extend far upstream from a city. They are not utility service boundaries.'],
         'Minnesota Department of Health public GIS; source no-warranty terms and attribution apply.'),
    spec('rail-routes', 'MnDOT public rail route characteristics',
         'https://services.arcgis.com/qWbGMYB49y8mLbRt/arcgis/rest/services/Rail_Route_Characteristics_Public/FeatureServer/0',
         'OBJECTID,CROSSINGID,RAILROAD,RRMAIN,RRSUBDIV,YEARTRNMOV,MAXSPD,TOTALTRAINS,LENGTH_MILES',
         {'i':'CROSSINGID','operator':'RAILROAD','parent':'RRMAIN','n':'RRSUBDIV','year':'YEARTRNMOV','speed':'MAXSPD','trains':'TOTALTRAINS','mi':'LENGTH_MILES'},
         'MnDOT public rail route sections intersecting the metro bounding box',
         ['Surface rail context, not underground utility routes.',
          'Train counts and speeds are published inventory characteristics with their own dates; they are not live schedules.',
          'The source includes a crossing inventory identifier because characteristics are associated with public rail crossings.'],
         'MnDOT public data; complete item terms and state data disclaimer apply.')
]

def get_json(url, params=None):
    data=None
    if params:
        encoded=urllib.parse.urlencode(params)
        if len(encoded)>1800:
            data=encoded.encode()
        else:
            url += ('&' if '?' in url else '?')+encoded
    for attempt in range(5):
        try:
            request=urllib.request.Request(url,data=data,headers={'User-Agent':'TwinCitiesPublicData/1.0'})
            with urllib.request.urlopen(request, timeout=90) as r:
                data = json.load(r)
            if data.get('error'):
                raise RuntimeError(json.dumps(data['error']))
            return data
        except Exception:
            if attempt == 4: raise
            time.sleep(min(2**attempt, 12))

def compact_coordinates(c,precision=5):
    if c and isinstance(c[0], (float, int)):
        return [round(c[0],precision),round(c[1],precision)]
    return [compact_coordinates(v,precision) for v in c]

def points(c):
    if c and isinstance(c[0], (float,int)):
        yield c
    else:
        for v in c: yield from points(v)

def bounds(features):
    coords=[c for f in features for c in points(f['geometry']['coordinates'])]
    if not coords:return None
    return [min(c[0] for c in coords),min(c[1] for c in coords),max(c[0] for c in coords),max(c[1] for c in coords)]

def save(name, data, compressed=False):
    target=DEST/name
    target.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(data,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
    stored=raw
    if compressed:
        buffer=io.BytesIO()
        with gzip.GzipFile(filename='',mode='wb',fileobj=buffer,compresslevel=9,mtime=0) as writer:
            writer.write(raw)
        stored=buffer.getvalue()
        assert gzip.decompress(stored)==raw
    temporary=target.with_suffix(target.suffix+'.tmp');temporary.write_bytes(stored);temporary.replace(target)
    stats=dict(bytes=len(stored),sha256=hashlib.sha256(stored).hexdigest())
    if compressed:stats.update(contentEncoding='gzip',uncompressedBytes=len(raw),uncompressedSha256=hashlib.sha256(raw).hexdigest())
    return stats

def tile_points(id, features):
    if not features or any(f['geometry']['type']!='Point' for f in features):return None
    cells={}
    for f in features:
        x,y=f['geometry']['coordinates']
        ix,iy=math.floor(x/0.05),math.floor(y/0.05)
        cells.setdefault((ix,iy),[]).append(f)
    tiles=[]
    for (ix,iy),fs in sorted(cells.items()):
        name=f'{id}-tiles/{ix}_{iy}.json'
        save(name,{'type':'FeatureCollection','features':fs})
        tiles.append({'file':name,'bounds':[round(ix*.05,5),round(iy*.05,5),round((ix+1)*.05,5),round((iy+1)*.05,5)],'count':len(fs)})
    index=id+'-tiles.json'
    save(index,{'type':'SpatialTileIndex','tileSizeDegrees':.05,'featureCount':len(features),'tiles':tiles})
    return {'index':'data/'+index,'tileSizeDegrees':.05,'tileCount':len(tiles)}

def acquire(cfg):
    url=cfg['url'];md=get_json(url,{'f':'json'})
    is_table=md.get('type')=='Table'
    params={'where':'1=1','f':'json'}
    if cfg['clip'] and not is_table:
        params.update(geometry=','.join(map(str,BBOX)),geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects')
    count=get_json(url+'/query',dict(params,returnCountOnly='true'))['count']
    oid=md.get('objectIdField') or md.get('objectIdFieldName') or 'OBJECTID'
    size=min(md.get('maxRecordCount',2000),4000)
    fields=cfg['fields']
    if fields!='*' and oid.lower() not in fields.lower().split(','):fields=oid+','+fields
    source_ids=get_json(url+'/query',dict(params,returnIdsOnly='true'))['objectIds'] or []
    if len(source_ids)!=count or len(set(source_ids))!=count:
        raise RuntimeError(f'{cfg["id"]}: source object-ID inventory does not match count')
    source_ids.sort()
    # Some services return short pages despite exceededTransferLimit=true.
    # Request explicit IDs so fixed result offsets cannot silently skip rows.
    size=min(size,750)
    chunks=[source_ids[i:i+size] for i in range(0,count,size)]
    def page(ids):
        result=get_json(url+'/query',{'where':'1=1','f':'json' if is_table else 'geojson','objectIds':','.join(map(str,ids)),
                        'outFields':fields,'outSR':4326,'orderByFields':oid,'resultRecordCount':size})['features']
        return [{'id':f['attributes'][oid],'properties':f['attributes'],'geometry':None} for f in result] if is_table else result
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages=list(pool.map(page,chunks))
    source=[f for pg in pages for f in pg]
    ids=[f.get('id',f['properties'].get(oid)) for f in source]
    if len(source)!=count or len(set(ids))!=count:
        raise RuntimeError(f'{cfg["id"]}: count/unique-ID mismatch {len(source)}/{len(set(ids))}, expected {count}')
    if cfg['id']=='cleanup-sites':
        source=[f for f in source if f['properties'].get('program_name') in ['Investigation and Cleanup','Tanks']]
    fs=[]
    for f in source:
        if not f.get('geometry') and not is_table:continue
        props={k:f['properties'][v] for k,v in cfg['properties'].items() if f['properties'].get(v) is not None and f['properties'][v]!=''}
        if is_table:fs.append(props)
        else:fs.append({'type':'Feature','geometry':{'type':f['geometry']['type'],'coordinates':compact_coordinates(f['geometry']['coordinates'],7 if cfg['id']=='surficial-geology' else 5)},'properties':props})
    compressed=cfg['id'] in ['wells-complete','service-lines']
    filename=cfg['id']+('.json.gz' if compressed else '.json')
    stats=save(filename,{'type':'Table','records':fs} if is_table else {'type':'FeatureCollection','features':fs},compressed=compressed)
    service=get_json(url.rsplit('/',1)[0],{'f':'json'})
    item_id=service.get('serviceItemId');item={}
    if item_id:
        try:item=get_json('https://www.arcgis.com/sharing/rest/content/items/'+item_id,{'f':'json'})
        except Exception:pass
    date=md.get('editingInfo',{}).get('dataLastEditDate')
    entry={'id':cfg['id'],'title':cfg['title'],'file':'data/'+filename,'format':'Table' if is_table else ('GeoJSON (gzip)' if compressed else 'GeoJSON'),'featureCount':len(fs),'sourceFeatureCount':count,'bounds':None if is_table else bounds(fs),'geometry':[] if is_table else sorted({f['geometry']['type'] for f in fs}),'properties':cfg['properties'],'source':{'url':url,'itemUrl':'https://www.arcgis.com/home/item.html?id='+item_id if item_id else None,'sourceDate':dt.datetime.fromtimestamp(date/1000,dt.timezone.utc).isoformat() if date else None,'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'coverage':cfg['coverage'],'license':cfg['license'],'termsHtml':item.get('licenseInfo'),'attribution':item.get('accessInformation') or service.get('copyrightText'),'caveats':cfg['caveats']},'fieldDomains':{f['name']:f['domain'] for f in md.get('fields',[]) if f.get('domain') and f['name'] in cfg['properties'].values()},'sourceFields':[{k:f.get(k) for k in ['name','alias','type']} for f in md.get('fields',[])],**stats}
    if url.startswith(MPLS):
        entry['source']['licenseUrl']='https://lims.minneapolismn.gov/Download/FileV2/20160/2018-Open-Data-Portal.pdf'
    if cfg['id']=='wells-complete':
        entry['source']['definitionUrls']={key:'https://mgsweb2.mngs.umn.edu/cwi_doc/'+page for key,page in [('q','loc_mc.asp'),('coordinateMethod','gcmcode.asp'),('geologyMethod','str_meth.asp')]}
    if item_id:
        try:
            metadata=urllib.request.urlopen('https://www.arcgis.com/sharing/rest/content/items/'+item_id+'/info/metadata/metadata.xml',timeout=30).read()
            metadata_name=cfg['id']+'-metadata.xml'
            (DEST/metadata_name).write_bytes(metadata)
            entry['source']['metadataFile']='data/'+metadata_name
        except Exception:pass
    if stats.get('uncompressedBytes',stats['bytes'])>10000000:entry['tiles']=tile_points(cfg['id'],fs)
    print(f'{cfg["id"]}: {len(fs):,} features, {stats["bytes"]:,} bytes',flush=True)
    return entry

def main():
    selected=set(sys.argv[1:]); chosen=[s for s in SPECS if not selected or s['id'] in selected]
    if selected-set(s['id'] for s in chosen):raise SystemExit('Unknown dataset id')
    DEST.mkdir(parents=True,exist_ok=True)
    manifest=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'version':1,'bbox':BBOX,'datasets':[]}
    entries={d['id']:d for d in manifest['datasets']}
    for cfg in chosen:
        entries[cfg['id']]=acquire(cfg)
        manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        temporary=MANIFEST.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');temporary.replace(MANIFEST)

if __name__=='__main__':main()
