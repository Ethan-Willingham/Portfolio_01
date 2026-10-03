#!/usr/bin/env python3
"""Document legacy browser files and attach complete publisher metadata.

Usage: python3 tools/under-street/complete-source-manifest.py /path/to/research/raw
Legacy files remain unchanged. Current acquisitions keep their own entries.
Source data dates, retrieval dates and publisher metadata dates are distinct.
"""
import datetime as dt
import gzip
import hashlib
import json
import pathlib
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE=ROOT/'archive/under-the-street/assets/map'
DEST=BASE/'data'
MANIFEST=BASE/'datasets.json'
MPLS='https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/'
MCES='https://arcgis.metc.state.mn.us/data1/rest/services/utility/ES_Utility_Asset_Public/FeatureServer/'
OSM='https://www.openstreetmap.org'
LEGACY={
 'interceptors':('MCES legacy interceptor sections',MCES+'4','int.zip','Regional sections; public source omits pipe diameter. Use the refreshed inventory for names and status.'),
 'lifts':('MCES legacy lift stations',MCES+'0','lifts.zip','Legacy selected station points. Refreshed inventory includes additional statuses.'),
 'meters':('MCES legacy sewer meters',MCES+'2','mces-meters.zip','Legacy snapshot; current public inventory is available separately.'),
 'plants':('MCES current and historic treatment plants',MCES+'3','plants.zip','Includes historic, closed or reconveyed facilities. Do not treat every point as operating.'),
 'sewersheds':('MCES wastewater plant service areas','https://arcgis.metc.state.mn.us/data1/rest/services/utility/ES_Utility_Area_Public/FeatureServer/2','shed.zip','Eleven generalized plant service areas, not all local collection pipes or individual metersheds.'),
 'roads':('Metro road context','https://gis.data.mn.gov/datasets/mndot::federal-functional-class-in-minnesota/about','roads.zip','Selected major roads for context, not every street.'),
 'roads-context':('Secondary road context','https://gis.data.mn.gov/datasets/mndot::federal-functional-class-in-minnesota/about','roads.zip','Selected secondary streets for context.'),
 'counties':('Seven metro county boundaries','https://arcgis.metc.state.mn.us/data1/rest/services/boundary/Counties_CTUs/FeatureServer/2','bdry.zip','Metro county context; boundaries are generalized for display.'),
 'cities':('Minneapolis and Saint Paul boundaries','https://arcgis.metc.state.mn.us/data1/rest/services/boundary/Counties_CTUs/FeatureServer/0','bdry.zip','Only the two core city outlines are included in this file.'),
 'water':('Lakes and rivers context','https://arcgis.metc.state.mn.us/data1/rest/services/water/Water_Body/FeatureServer/0','water.zip','Selected generalized open-water features, not every water body or stream.'),
 'bedrock':('MGS S-21 Paleozoic bedrock geology','https://conservancy.umn.edu/handle/11299/101466','bedrock-fgdb.zip','2011 regional geology compilation; display polygons are generalized, not engineering-scale boundaries.'),
 'bedrockfaults':('MGS S-21 mapped faults','https://conservancy.umn.edu/handle/11299/101466','bedrock-fgdb.zip','2011 regional mapped faults; stripped legacy properties provide no fault characterization.'),
 'bedrockdepth':('Deprecated median-well depth grid','https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_health/water_well_information_non_pws/FeatureServer/1','wells-nonpws.zip','Derived median depth in approximately 300 m cells from reported well records and geologic interpretations; replaced by the official MGS D-03 model.'),
 'wells':('Decimated well sample','https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_health/water_well_information_non_pws/FeatureServer/1','wells-nonpws.zip','One-in-18 sample of wells with recorded drill depth, not a complete well inventory. Public water-supply wells are excluded by MDH.'),
 'streamsug':('DNR selected hydrographic conduit segments','https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/water_dnr_hydrography/FeatureServer/0','dnr-hydrography.zip','Includes road culverts, underground storm sewer, force main, aqueduct/tunnel and superseded channels. These are distinct published types, not all buried creeks.'),
 'hydrants':('Minneapolis published hydrants',MPLS+'Hydrants/FeatureServer/0',None,'Source data last edited in 2020 despite advertised weekly updates. All published BuryDepth values are null; this file records locations and installation years only.'),
 'inlets':('Minneapolis published storm catch basins',MPLS+'Stormwater_Catch_Basins/FeatureServer/0',None,'The public service contains exactly 6,000 points. The city describes nearly 29,000 storm inlets, so this is a published subset.'),
 'pavement':('Minneapolis rated pavement subset',MPLS+'PWStreetPavementMgmt/FeatureServer/0',None,'Only 3,485 rated segments of 12,184 published segments. Historical inventory last edited in 2015; unrecorded ratings are not zero.'),
 'power':('OSM legacy transmission routes',OSM,None,'Incomplete community mapping; underground/location and other source tags were stripped. Use refreshed files to distinguish source tags.'),
 'powerminor':('OSM legacy distribution routes',OSM,None,'Partial community mapping, not the full distribution grid.'),
 'substations':('OSM legacy substations',OSM,None,'Legacy names and voltage can be absent or stale; source tags are preserved in the refreshed inventory.'),
 'powerplants':('OSM legacy power plants',OSM,None,'Capacity and fuel tags are a community snapshot, not verified current operations. Use EIA inventory for reported current generator status.'),
 'pipelines':('OSM legacy classified pipelines',OSM,None,'Most source pipelines were excluded as unclassified. Old classification inferred some gas from operator names; the refreshed export uses substance only.'),
 'pipestations':('OSM legacy pipeline stations',OSM,None,'Community-mapped substations; not a complete pipeline operator inventory.'),
 'watertowers':('OSM legacy water towers',OSM,None,'Operating status is not established; includes historic towers.'),
 'waterworks':('OSM legacy named waterworks',OSM,None,'Selected named facilities, not a complete water system. Waterworks and wastewater plants are separated in refreshed files.'),
 'damslocks':('OSM legacy named dams and locks',OSM,None,'Selected facilities, not every river barrier. Refreshed source tags distinguish dams and locks.'),
 'exchanges':('OSM legacy telephone exchanges',OSM,None,'Historic exchange tags can outlive building use. Great River Endodontics is preserved by the source but should not be presented as a confirmed current central office.'),
 'comms':('Legacy communications facilities',OSM,None,'Selected OSM facilities with editorial PeeringDB context. Private carrier routes are not supplied; 511 is an interconnection facility, not a mapped fiber alignment.')
}
ITEMS={'mces-interceptors':'29edded7482647ac9c2926cf56aa0164','mces-flow-meters':'f8b8526a4e4f4fb4ad4c44f8a78f4318',
       'mces-lift-stations':'f2f0e3b2234d45f1a90d4b84a3cdff44','mces-treatment-plants':'b76ef586d87c4d2a97447fefec8da819',
       'community-water-sources':'c456bf8b292d4962b10a358045e922cb'}

def cs(c):
    if c and isinstance(c[0],(int,float)):yield c
    else:
        for a in c:yield from cs(a)

def main():
    rawdir=pathlib.Path(sys.argv[1]);manifest=json.loads(MANIFEST.read_text());entries={d['id']:d for d in manifest['datasets']}
    # Current compressed downloads remain current entries. Legacy documentation
    # must not replace their paths or treat compressed bytes as plain JSON.
    for entry in entries.values():
        if entry.get('contentEncoding')!='gzip':continue
        stored=(BASE/entry['file']).read_bytes();decoded=gzip.decompress(stored)
        assert len(stored)==entry['bytes'] and hashlib.sha256(stored).hexdigest()==entry['sha256']
        assert len(decoded)==entry['uncompressedBytes'] and hashlib.sha256(decoded).hexdigest()==entry['uncompressedSha256']
    metadata={}
    for zname in {v[2] for v in LEGACY.values() if v[2]}:
        p=rawdir/zname
        if not p.exists():continue
        with zipfile.ZipFile(p) as z:
            names=[n for n in z.namelist() if n.startswith('metadata/') and n.endswith('.xml') and n!='metadata/metadata.xml']
            name=names[0] if zname=='roads.zip' and names else 'metadata/metadata.xml'
            data=z.read(name)
            target='source-'+zname.replace('.zip','')+'-metadata.xml';(DEST/target).write_bytes(data)
            tree=ET.fromstring(data)
            metadata[zname]={'file':'data/'+target,'use':tree.findtext('.//useconst'),'date':tree.findtext('.//caldate'),'disclaimer':tree.findtext('.//distliab')}
    for id,(title,url,zname,caveat) in LEGACY.items():
        file=BASE/(id+'.json')
        if not file.exists():continue
        encoded=file.read_bytes();data=json.loads(encoded);features=data['features'];coords=[c for f in features if f.get('geometry') for c in cs(f['geometry']['coordinates'])]
        md=metadata.get(zname,{})
        source={'url':url,'sourceDate':md.get('date'),'retrievedAt':'2026-07-12 acquisition archive; legacy geometry retained',
                'coverage':'Legacy selected and generalized browser display within the Twin Cities area','license':md.get('use') or
                    ('Open Database License (ODbL) 1.0' if url==OSM else 'Publisher public data; retain complete source terms and attribution.'),
                'attribution':'OpenStreetMap contributors' if url==OSM else 'Original public publisher, identified in linked source and complete metadata',
                'caveats':[caveat]}
        if md.get('file'):source['metadataFile']=md['file']
        if url==OSM:
            source['licenseUrl']='https://www.openstreetmap.org/copyright';source['sourceDate']='2026-06-12' if id in ['power','powerminor','substations','powerplants'] else '2026-07-12'
        if id in ['hydrants','inlets','pavement']:
            try:
                current=json.load(urllib.request.urlopen(url+'?f=json',timeout=30));date=current.get('editingInfo',{}).get('dataLastEditDate')
                source['sourceDate']=dt.datetime.fromtimestamp(date/1000,dt.timezone.utc).isoformat() if date else None
            except Exception:pass
        entries[id]={'id':id,'title':title,'file':id+'.json','format':'GeoJSON','legacy':True,'featureCount':len(features),
                     'bounds':[min(c[0] for c in coords),min(c[1] for c in coords),max(c[0] for c in coords),max(c[1] for c in coords)],
                     'geometry':sorted({f['geometry']['type'] for f in features if f.get('geometry')}),'properties':{k:'Legacy compact property; see renderer' for f in features for k in f['properties']},
                     'bytes':len(encoded),'sha256':hashlib.sha256(encoded).hexdigest(),'source':source}
    for id,item in ITEMS.items():
        if id not in entries:continue
        data=json.load(urllib.request.urlopen('https://www.arcgis.com/sharing/rest/content/items/'+item+'?f=json',timeout=30))
        source=entries[id]['source'];source['itemUrl']='https://www.arcgis.com/home/item.html?id='+item;source['termsHtml']=data.get('licenseInfo')
        if id.startswith('mces-'):
            zname={'mces-interceptors':'int.zip','mces-flow-meters':'mces-meters.zip','mces-lift-stations':'lifts.zip','mces-treatment-plants':'plants.zip'}[id]
            source['license']=data.get('licenseInfo') or metadata.get(zname,{}).get('use')
            source['metadataFile']=metadata[zname]['file']
            caveat='Publisher requests users obtain current copies directly from Met Council; complete original metadata and disclaimers accompany this educational export.'
            if caveat not in source['caveats']:source['caveats'].append(caveat)
    for id,entry in entries.items():
        if id.startswith('groundwater-'):
            entry['source']['metadataFile']='data/groundwater-boundaries-metadata.xml'
            entry['source']['license']='MPCA permits redistribution for any purpose when complete original documentation and metadata accompany the data; retain attribution and no-warranty terms.'
        if id=='community-water-sources':
            entry['source']['coverage']='193 metro water-source planning records: 186 municipalities with CTU_ID join keys and seven county summary records'
            entry['source']['caveats']=['Published table, not geometries. Source codes and system-type integers need their source documentation before interpretation.',
                                      'Seven county summary records have no CTU_ID and must not be mapped as municipalities.']
        if id=='service-lines':
            entry['source']['license']='City of Minneapolis published public data; city Open Data policy permits reuse. No item-specific CC license is supplied.'
            entry['source']['licenseUrl']='https://lims.minneapolismn.gov/Download/FileV2/20160/2018-Open-Data-Portal.pdf'
    manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    manifest['coverageNotes']=['Acquisition box is regional, not the seven-county boundary. Intersecting geometry can extend beyond the box unless explicitly clipped.',
                               'Complete exports mean all published records returned in the stated coverage, not every physical asset.',
                               'Absence from a public export does not establish absence of infrastructure. Retrieval date is not a source-data update date.',
                               'Material inventory, groundwater vulnerability and cleanup-program enrollment are not water quality or neighborhood health-risk measurements.']
    temporary=MANIFEST.with_suffix('.json.tmp');temporary.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');temporary.replace(MANIFEST)
    print(f'{len(entries)} documented datasets; legacy files unchanged')

if __name__=='__main__':main()
