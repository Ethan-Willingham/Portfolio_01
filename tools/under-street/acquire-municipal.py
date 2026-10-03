#!/usr/bin/env python3
"""Acquire anonymous municipal pipe snapshots with native fields and provenance.

Default output is a scratch directory and does not change the site. Pass
--publish to write the reviewed snapshots and replace only their manifest rows.
No credentials, private endpoints, address fields or editor names are requested.
Python standard library only. Every query is checked against source IDs/counts.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
import pathlib
import shutil
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
MAP = ROOT / 'archive/under-the-street/assets/map'
MAPLEWOOD = 'https://gis.maplewoodmn.gov/arcgis/rest/services/PublicWorks/Cartegraph_MS/MapServer/'
BLOOMINGTON = 'https://gis.bloomingtonmn.gov/arcgis/rest/services/PW_Utilities/GSOCMapping/MapServer/'
MWMO = 'https://services3.arcgis.com/5aiR7gURjh2E0gMd/arcgis/rest/services/N_Minneapolis_Model_Data/FeatureServer/'
EAGAN = 'https://utility.arcgis.com/usrsvcs/servers/767fc45e18f54af18762b00a30514a3c/rest/services/SecuredServices/EA_UtilitiesFeature/FeatureServer/'
EAGAN_MAP = 'https://www.arcgis.com/home/item.html?id=0391652170f14eea9d2084e744adf604'

def spec(id, title, city, role, server, index, fields, identity, units=None, caveats=None):
    return dict(id=id, title=title, city=city, role=role, url=server+str(index),
                fields=fields.split(','), identity=identity, units=units or {}, caveats=caveats or [])

MAPLE_FIELDS = 'OBJECTID,DIS_P_NM,PIPE_MAT,LENGTH,GRADE,BUILT,Diameter,Ownership,Status,CarteID,Sewer_District,MH_Upstream,MH_Downstream,INV_Upstream,INV_Downstream,PLAN_ID,PLAN_ID2,PLAN_ID3,LF_LINK_URL,LF_LINK2_URL,LF_LINK3_URL,created_date,last_edited_date'
SPECS = [
    spec('maplewood-sanitary', 'Maplewood-area sanitary gravity pipe inventory', 'Maplewood', 'sanitary', MAPLEWOOD, 6, MAPLE_FIELDS, 'CarteID', caveats=['Inventory includes MCES, adjacent municipalities and private ownership; it is not exclusively Maplewood-owned pipe.', 'Diameter, as-built length, grade and invert units are unspecified in the public field definitions.', 'Abandoned records remain in the download.']),
    spec('maplewood-force', 'Maplewood-area sanitary force-main inventory', 'Maplewood', 'force', MAPLEWOOD, 7, MAPLE_FIELDS, 'CarteID', caveats=['Published force-main geometry includes abandoned records and private ownership.', 'Diameter, as-built length, grade and invert units are unspecified in the public field definitions.']),
    spec('maplewood-storm', 'Maplewood-area storm pipe inventory', 'Maplewood', 'storm', MAPLEWOOD, 14, 'OBJECTID,PIPE_ID,DIAMETER,TYPE,PIPE_PERF,GRADE,PIPE_SHAPE,YEARBUILT,STATUS,OWNERSHIP,CarteID,created_date,last_edited_date,INV_Upstream,INV_Downstream,PLAN_ID,PLAN_ID2,PLAN_ID3,LF_LINK_URL,LF_LINK2_URL,LF_LINK3_URL,USE_TYPE', 'CarteID', caveats=['Ownership includes city, county, state, private and neighboring systems.', 'Diameter, grade and invert units are unspecified in the public field definitions.']),
    spec('mwmo-north-model', 'MWMO North Minneapolis stormwater-model pipe conduits', 'North Minneapolis model area', 'model', MWMO, 84, 'OBJECTID,MATERIAL,WIDTH_IN,HEIGHT_IN,LINK_ID,CMT_ID,TYPE,USNODE,USINV,CMT_USINV,DSNODE,DSINV,CMT_DSINV,CMT_MAT,ROUGHNESS,CONSHAPE,SWMMSHP1,SWMMSHP2,CMT_SHAPE,DIA_IN,CMT_DIA,SWMMDIA,SEDDEP,SWMMSEDDEP,BARRELS,LENGTH,CMT_LEN,TRAPWIDTH,TRAPLSLP,TRAPRSLP,CONFF,ENTLOSS,EXTLOSS,INLTYP,CITY,SWMM_CONDUIT_ID,CONDUIT_ID', 'CONDUIT_ID', units={'WIDTH_IN':'in','HEIGHT_IN':'in','DIA_IN':'in','SWMMDIA':'ft','SEDDEP':'in','SWMMSEDDEP':'ft','LENGTH':'ft','TRAPWIDTH':'ft'}, caveats=['Stormwater-model geometry, not a surveyed or live municipal asset inventory.', 'Individual source comments distinguish city GIS, as-built plans, modified model links and assumed dimensions or inverts.', 'CITY is a source attribution/jurisdiction field that also contains MnDOT, private, park and county records.', 'Invert elevation units and vertical datum are not stated in the public aliases; they are preserved without conversion.']),
    spec('bloomington-water', 'Bloomington-area water mains', 'Bloomington', 'water', BLOOMINGTON, 138, 'OBJECTID,MainlineID,Type,Node_From,Node_To,Pipe_Diameter,Pipe_Length,Pipe_Material,Date_Installed,Date_Decommissioned,AsBuilt_Num,Site_Plan,Ownership,Maint_Resp,Dead_End_Main,Flushable_Dead_End,Date_Modified,NetType,Enabled,GlobalID,ConstructionStatus,FunctionType', 'GlobalID', units={'Pipe_Diameter':'in'}, caveats=['Includes raw-water, supply, public, private and neighboring-system main types; type and ownership must be read together.', 'Diameter inches are explicit in source coded-value labels; pipe-length units are not stated.', 'Includes proposed, inactive and abandoned records.']),
    spec('bloomington-services', 'Bloomington-area water service alignments', 'Bloomington', 'service', BLOOMINGTON, 141, 'OBJECTID,ServiceID,Type,PipeMaterial,Diameter,InstalledDate,DecommissionDate,DedicatedFireline,DateModified,PRV,Enabled,GlobalID,ServiceType,ConstructionStatus', 'GlobalID', units={'Diameter':'in'}, caveats=['Actual source line geometry, separate from Minneapolis material-inventory points.', 'Diameter inches are explicit in source coded-value labels.', 'Addresses, owner information, tie cards and free-text comments are omitted; material records are not tap-water tests.']),
    spec('bloomington-sanitary', 'Bloomington-area sanitary pipe inventory', 'Bloomington', 'sanitary', BLOOMINGTON, 161, 'OBJECTID,mainline_pipe_id,san_mh_from,san_mh_to,main_type,date_installed,date_decommissioned,pipe_diameter,pipe_material,pipe_length,pipe_slope,Ups_depth,dwn_depth_ft,ups_elevation_ft,dwn_elev_ft,ownership,maint_resp,as_built_num,project_num,site_plan,modeling_id,mannings_n,last_edited_date,NetType,SitePlanLink,Enabled,GlobalID,AEAssetName,ModelStatus,last_cctv_date,ConstructionStatus,created_date', 'GlobalID', units={'pipe_diameter':'in','pipe_slope':'%','Ups_depth':'ft','dwn_depth_ft':'ft','ups_elevation_ft':'ft','dwn_elev_ft':'ft'}, caveats=['Published type separates gravity, force-main, MCES, private, inactive and proposed records.', 'Diameter inches are explicit in coded-value labels; depths/elevations feet and slope percent are explicit in aliases.', 'Pipe-length units and elevation vertical datum are not stated in public definitions.']),
    spec('bloomington-storm', 'Bloomington-area storm sewer pipe inventory', 'Bloomington', 'storm', BLOOMINGTON, 187, 'OBJECTID,MainlineID,Material,DownstreamInvertElev,PipeDiameter,PipeLength,PipeSlope,last_edited_date,PipeFunction,JunctionFrom,JunctionTo,PipeShape,FlowDirection,YearBuilt,LastTVDate,ProjectNumber,PrimaryAncillary,Jurisdiction,LastCCTVYear,UpstreamInvertElev,ConditionScore,Enabled,RuleID_2,GlobalID,ConstructionStatus', 'GlobalID', units={'DownstreamInvertElev':'ft','PipeDiameter':'in','PipeLength':'ft','PipeSlope':'%','UpstreamInvertElev':'ft'}, caveats=['Contains several jurisdictions and pipe functions, including inlet leads and force mains.', 'Lengths/invert elevations feet, diameter inches and slope percent are explicit source aliases.', 'Vertical datum is not stated in public definitions.']),
    spec('bloomington-private-storm', 'Bloomington private storm pipe inventory', 'Bloomington', 'privateStorm', BLOOMINGTON, 188, 'OBJECTID,PvtPipeID,Material,Diameter,PipeLength,last_edited_date,Enabled,GlobalID,ConstructionStatus', 'GlobalID', caveats=['Separate city-published private storm inventory, not proof of complete private-site coverage.', 'Diameter and length units are unspecified in public aliases.']),
    spec('bloomington-culverts', 'Bloomington-area storm culverts', 'Bloomington', 'culvert', BLOOMINGTON, 194, 'OBJECTID,CommonName,Jurisdiction,CulvertType,CulvertShape,PipeSize,PipeLength,Material,UpstreamInvertElevation,DownstreamInvertElevation,PipeSlope,ProjectNumber,InspectionInterval,NextInspection,last_edited_date,Culvert_ID,GlobalID,AEAssetName,ConstructionStatus', 'GlobalID', units={'PipeLength':'ft','UpstreamInvertElevation':'ft','DownstreamInvertElevation':'ft','PipeSlope':'%','InspectionInterval':'months'}, caveats=['Pipe size is a raw source field with unspecified units; do not convert it to an assumed diameter.', 'Lengths/invert elevations feet, slope percent and inspection intervals months are explicit aliases.', 'Vertical datum is not stated in public definitions.']),
    spec('bloomington-drain-tile', 'Bloomington storm drain-tile inventory', 'Bloomington', 'drainTile', BLOOMINGTON, 196, 'OBJECTID,tile_diameter,SurfaceInletID,StormJunctionID,DrainTileCleanoutID,last_edited_date,DrainTileID,GlobalID,ConstructionStatus', 'GlobalID', caveats=['Published drain-tile diameter units are unspecified.']),
    spec('bloomington-conduit', 'Bloomington city underground conduit inventory', 'Bloomington', 'conduit', BLOOMINGTON, 206, 'OBJECTID,id,underground_type,status,calc_length,InstallDate,ASSET_ID', 'ASSET_ID', caveats=['Published underground_type is preserved; no unrecorded contents, fiber route or utility capacity is inferred.', 'Calculated-length units are unspecified in the public aliases.'])
]

# This anonymous server proxy is linked by Eagan's public Storm Drain Locator.
# Its utility layers have different native aliases/domains. Combined system
# exports therefore keep per-component definitions and original layer identity.
EAGAN_PIPE_FIELDS = 'OBJECTID,GlobalID,FacilityID,FACILITYID,Material,MATERIAL,LifecycleStatus,LifeCycleStatus,FieldStatus,WaterType,Diameter,Size,PipeDepth,RecordedLength,Slope,DownStreamInvert,UpStreamInvert,UpstreamInvert,DownstreamInvert,UpstreamDepth,DownstreamDepth,DepthUpstream,DepthDownstream,Depth,FromID,ToID,FROM_ID,TO_ID,Maintenance,MaintenanceResp,Ownership,InstallYear,PlatYear,GeometrySource,SizeSource,InstallYearSource,MaterialSource,ResearchSource,RschSource,PipeShape,PipeUsage,TrunkMain,LiningType,LiningYear,SystemPosition,TracerWire,Enabled,RP1,RP2,RP3,RP4,ProjectNumber,CPUpdateDate,GPSUpdateDate,ABUpdateDate,LPUpdateDate,created_date,last_edited_date'
EAGAN_FIBER_FIELDS = 'OBJECTID,GlobalID,Subtype,subtype,status,cableSize,cableType,cableStatus,conduitNumber,configuration,footage,LocateResponsibility,Ownership,manufacturer,modelNumber,PROJECTNAME,PROJECTNUMBER,RecordPlan,RecordPlan2,RecordPlanDocument,RecordPlanDocument2,class,conduitGuid,DataSouce,Enabled,GPSStatus,RecordPlanStatus,splitGuid,usedAs,CableClass,AdditionalCable,InstallDate,INSTALLATIONDATE,MaintenanceResponsibility,FiberUsage,PathClass,PathType,PathLength,DIAMETER'
def eagan_group(id, title, role, parts):
    return dict(id=id,title=title,city='Eagan',role=role,components=[
        spec(id+'-'+str(layer), label, 'Eagan', native_role, EAGAN, layer,
             EAGAN_FIBER_FIELDS if role in ('fiber','fiberPath') else EAGAN_PIPE_FIELDS,
             'GlobalID', units={'Diameter':'in'} if native_role in ('water','service') else {},
             caveats=['Native lifecycle, ownership/responsibility and geometry/attribute source values are retained.',
                      'Published geometry may be plan-digitized, GPS-derived, owner-supplied or assumed; this is not a uniform survey.',
                      'Measurement units are unspecified unless explicitly recorded in the field definitions.'])
        for layer,label,native_role in parts])

SPECS += [
    eagan_group('eagan-water','Eagan-area pressurized water mains','water',[(42,'Water Pressurized Main','water')]),
    eagan_group('eagan-services','Eagan-area water lateral lines','service',[(43,'Water Lateral Line','service')]),
    eagan_group('eagan-sanitary','Eagan-area sanitary gravity, lateral and force-main pipes','sanitary',[(28,'Sanitary Gravity Main','sanitary'),(29,'Sanitary Lateral Line','sanitaryLateral'),(30,'Sanitary Force Main','force')]),
    eagan_group('eagan-storm','Eagan-area storm gravity, lateral and pressurized pipes','storm',[(60,'Storm Gravity Main','storm'),(59,'Storm Lateral Line','stormLateral'),(61,'Storm Pressurized Main','stormForce')]),
    eagan_group('eagan-fiber-cable','Eagan published fiber cable inventory','fiber',[(123,'CrescentLink - Fiber Cable','fiber')]),
    eagan_group('eagan-fiber-path','Eagan published utility path inventory','fiberPath',[(122,'CrescentLink - Path','fiberPath')])
]

def request(url, params=None):
    body = None
    if params:
        encoded = urllib.parse.urlencode(params)
        if len(encoded) > 1800:
            body = encoded.encode()
        else:
            url += '?' + encoded
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, data=body, timeout=60) as response:
                result = json.load(response)
            if 'error' in result:
                raise RuntimeError(str(result['error']))
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)

def coords(value):
    if value and isinstance(value[0], (int,float)):
        yield value
    else:
        for v in value:
            yield from coords(v)

def rounded(value):
    if isinstance(value, list):
        return [rounded(v) for v in value]
    return round(value, 6) if isinstance(value, float) else value

def acquire(s, dest, audit_dest=None):
    captured = dt.datetime.now(dt.timezone.utc).isoformat()
    meta = request(s['url'], {'f':'json'})
    available = {f['name']:f for f in meta['fields']}
    fields = [f for f in s['fields'] if f in available]
    oid = next(f['name'] for f in meta['fields'] if f['type'] == 'esriFieldTypeOID')
    count = request(s['url']+'/query', {'f':'json','where':'1=1','returnCountOnly':'true'})['count']
    ids = request(s['url']+'/query', {'f':'json','where':'1=1','returnIdsOnly':'true'})['objectIds']
    assert len(set(ids)) == len(ids) == count, 'Source ID/count mismatch'
    rows = []
    for offset in range(0,len(ids),500):
        response = request(s['url']+'/query', {'f':'geojson','objectIds':','.join(map(str,sorted(ids)[offset:offset+500])), 'outFields':','.join(fields),'outSR':4326,'returnGeometry':'true'})
        assert not response.get('exceededTransferLimit'), 'Truncated response'
        rows.extend(response['features'])
    assert len(rows) == count, 'Downloaded feature count mismatch'
    assert set(f['properties'][oid] for f in rows) == set(ids), 'Downloaded IDs differ'
    identity_values = [f['properties'].get(s['identity']) for f in rows]
    use_native = all(v is not None and str(v).strip() for v in identity_values) and len(set(identity_values)) == count
    identity = s['identity'] if use_native else oid
    rows.sort(key=lambda f:f['properties'][oid])
    null_geometry = 0
    for f in rows:
        if f.get('geometry') is None:
            null_geometry += 1
            continue
        f['geometry']['coordinates'] = rounded(f['geometry']['coordinates'])
        f['id'] = str(f['properties'][identity])
        # Keep the source key itself, plus a stable shared key for renderer links.
        f['properties'] = {k:v for k,v in f['properties'].items() if v is not None and v != ''}
        f['properties']['i'] = f['id']
    rows = [f for f in rows if f.get('geometry')]
    positions = [xy for f in rows for xy in coords(f['geometry']['coordinates'])]
    bounds = [min(x[0] for x in positions),min(x[1] for x in positions),max(x[0] for x in positions),max(x[1] for x in positions)]
    geometry = sorted(set(f['geometry']['type'] for f in rows))
    payload = json.dumps({'type':'FeatureCollection','features':rows},ensure_ascii=False,separators=(',',':')).encode()
    relative = 'data/municipal/'+s['id']+'.json'
    output = dest / relative
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(payload)
    aliases = [dict(name=f['name'],alias=f.get('alias'),type=f['type']) for f in meta['fields'] if f['name'] in fields]
    dates = [f['properties'][k] for f in rows for k in fields if available[k]['type']=='esriFieldTypeDate' and ('edit' in k.lower() or 'modif' in k.lower()) and isinstance(f['properties'].get(k),(int,float)) and f['properties'][k] > 0]
    last_edit = max(dates,default=None)
    edit = meta.get('editingInfo',{}).get('dataLastEditDate')
    source_date = dt.datetime.fromtimestamp(edit/1000,dt.timezone.utc).isoformat() if edit else None
    entry = dict(id=s['id'],title=s['title'],file=relative,format='GeoJSON',featureCount=len(rows),sourceFeatureCount=count,bounds=bounds,geometry=geometry,
        properties={k:k for k in fields}|{'i':'Stable '+identity},identityField=identity,fieldUnits=s['units'],sourceFields=aliases,
        fieldDomains={k:available[k]['domain'] for k in fields if available[k].get('domain')},sourceTypes=[dict(id=t['id'],name=t['name']) for t in meta.get('types',[])],
        source=dict(url=s['url'],sourceDate=source_date,retrievedAt=captured,coverage=s['city']+' source inventory and its published neighboring/private records',license='Official anonymous public GIS service. No explicit reuse license is supplied by this service; publisher attribution is retained.',termsHtml=None,attribution='Mississippi Watershed Management Organization' if s['role']=='model' else 'City of '+s['city'],caveats=s['caveats']+(['Source had '+str(null_geometry)+' records without geometry; these are counted above and omitted from map features.'] if null_geometry else [])),
        municipality=s['city'],conduitRole=s['role'],latestRecordEdit=dt.datetime.fromtimestamp(last_edit/1000,dt.timezone.utc).isoformat() if last_edit else None,
        bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest())
    if s['role']=='model':
        entry['source']['itemUrl']='https://www.arcgis.com/home/item.html?id=23853376ee0a45edb3570d5c933d13c6'
        entry['source']['modelContextUrl']='https://www.mwmo.org/learn/storymap/'
    metadata_file = (audit_dest or dest) / 'municipal-source-metadata' / (s['id']+'.json')
    metadata_file.parent.mkdir(parents=True,exist_ok=True)
    metadata_file.write_text(json.dumps(meta,indent=2))
    print(s['id']+': '+str(len(rows))+'/'+str(count)+' features; identity '+identity,flush=True)
    return entry

def acquire_group(s, dest, audit_dest):
    scratch = audit_dest / 'components'
    entries = [acquire(part,scratch,audit_dest) for part in s['components']]
    rows, components = [], []
    for part,entry in zip(s['components'],entries):
        layer = int(part['url'].rstrip('/').split('/')[-1])
        child = json.loads((scratch/entry['file']).read_text())
        for f in child['features']:
            f['properties']['sourceLayer'] = layer
            f['id'] = str(layer)+'/'+f['id']
            f['properties']['i'] = f['id']
            rows.append(f)
        component = {k:v for k,v in entry.items() if k not in ('id','title','file','format','bytes','sha256')}
        component['layer'] = layer
        component['title'] = part['title']
        components.append(component)
    assert len({f['id'] for f in rows}) == len(rows), 'Combined source identity collision'
    payload = json.dumps({'type':'FeatureCollection','features':rows},ensure_ascii=False,separators=(',',':')).encode()
    relative = 'data/municipal/'+s['id']+'.json'
    target = dest/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(payload)
    bounds = [min(e['bounds'][0] for e in entries),min(e['bounds'][1] for e in entries),max(e['bounds'][2] for e in entries),max(e['bounds'][3] for e in entries)]
    fields = {f['name']:f for e in entries for f in e['sourceFields']}
    fields['sourceLayer'] = dict(name='sourceLayer',alias='Source layer',type='Derived source identity')
    fields['i'] = dict(name='i',alias='Combined source identity',type='Derived source identity')
    latest = max((e['latestRecordEdit'] for e in entries if e['latestRecordEdit']),default=None)
    return dict(id=s['id'],title=s['title'],file=relative,format='GeoJSON',featureCount=len(rows),sourceFeatureCount=sum(e['sourceFeatureCount'] for e in entries),bounds=bounds,geometry=sorted({g for e in entries for g in e['geometry']}),
        properties={k:k for k in fields},identityField='i',identityFieldSource='Source layer plus the component native identity field',components=components,sourceFields=list(fields.values()),fieldUnits={},fieldDomains={},sourceTypes=[],municipality='Eagan',conduitRole=s['role'],latestRecordEdit=latest,
        source=dict(url=EAGAN.rstrip('/'),itemUrl=EAGAN_MAP,appUrl='https://cityofeagan.maps.arcgis.com/apps/webappviewer/index.html?id=514dc132f418488d817f6cf71b71bbb7',retrievedAt=max(e['source']['retrievedAt'] for e in entries),sourceDate=None,attribution='City of Eagan',coverage='Eagan city-published inventory and its recorded private, neighboring and regional ownership',license='Official anonymous public GIS proxy linked by the city public viewer. No explicit reuse license is supplied; City of Eagan attribution is retained.',caveats=['Discovered through the current city-published Storm Drain Locator web map; no token or credentials are used.', 'Each source layer keeps its own field aliases, domains, identity, counts and record dates.', 'Planned or proposed removal is a future lifecycle intention, not evidence that removal has occurred.', 'Cable and Path are separate source layers. A published path does not establish a laid fiber cable, burial method, capacity or complete provider coverage.']+[c for e in entries for c in e['source']['caveats']]),bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('datasets',nargs='*')
    parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('/tmp/under-street-municipal/reviewed'))
    parser.add_argument('--publish',action='store_true')
    parser.add_argument('--from-review',action='store_true',help='Publish the existing reviewed snapshots after checking their hashes')
    args=parser.parse_args()
    selected=[s for s in SPECS if not args.datasets or s['id'] in args.datasets]
    assert selected and all(d in [s['id'] for s in SPECS] for d in args.datasets), 'Unknown dataset'
    dest=MAP if args.publish else args.output
    entries=[]
    for s in selected:
        if args.from_review:
            assert args.publish, '--from-review requires --publish'
            audited=json.loads((args.output/'municipal-manifest.json').read_text())
            entry=next(d for d in audited if d['id']==s['id'])
            source=args.output/entry['file']
            payload=source.read_bytes()
            assert len(payload)==entry['bytes'] and hashlib.sha256(payload).hexdigest()==entry['sha256'], 'Reviewed hash mismatch'
            target=dest/entry['file']
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,target)
            print(s['id']+': published reviewed snapshot',flush=True)
        else:
            entry=acquire_group(s,dest,args.output) if s.get('components') else acquire(s,dest,args.output)
        entries.append(entry)
        # A later service failure should not lose successfully audited metadata.
        args.output.mkdir(parents=True,exist_ok=True)
        saved=args.output/'municipal-manifest.json'
        previous=json.loads(saved.read_text()) if saved.exists() else []
        saved.write_text(json.dumps([d for d in previous if d['id']!=entry['id']]+[entry],indent=2,ensure_ascii=False)+'\n')
    if args.publish:
        manifest=json.loads((MAP/'datasets.json').read_text())
        replaced={e['id'] for e in entries}
        manifest['datasets']=[d for d in manifest['datasets'] if d['id'] not in replaced]+entries
        manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        temporary=MAP/'datasets.json.tmp'
        temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
        temporary.replace(MAP/'datasets.json')
    else:
        dest.mkdir(parents=True,exist_ok=True)

if __name__=='__main__':
    main()
