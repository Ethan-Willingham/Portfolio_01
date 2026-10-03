#!/usr/bin/env python3
"""Export MGS D-03 (2025) into an integer-foot browser raster.

Usage: python3 tools/under-street/acquire-bedrock-depth.py /path/to/scratch
Requires GDAL's gdal_translate executable. Keeps the Float32 GeoTIFF in scratch.
The source model is about 30 m; the browser copy samples about 120 m at metro
latitude. A one-foot storage increment does not imply one-foot model accuracy.
"""
import datetime as dt
import hashlib
import json
import math
import pathlib
import struct
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[2]
DEST=ROOT/'archive/under-the-street/assets/map/data'
MANIFEST=DEST.parent/'datasets.json'
SOURCE='https://mgs-gispub.mngs.umn.edu/arcgis/rest/services/mosaics/D_03_Depth_to_Bedrock_2025/ImageServer'
BBOX=[-94.05,44.47,-92.52,45.42]
WIDTH,HEIGHT=1000,875

def atomic_write(target, raw):
    temporary=target.with_suffix(target.suffix+'.tmp')
    temporary.write_bytes(raw)
    temporary.replace(target)

def main():
    scratch=pathlib.Path(sys.argv[1]);scratch.mkdir(parents=True,exist_ok=True)
    params={'f':'pjson','bbox':','.join(map(str,BBOX)),'bboxSR':4326,'imageSR':3857,
            'size':f'{WIDTH},{HEIGHT}','format':'tiff','pixelType':'F32',
            'renderingRule':json.dumps({'rasterFunction':'None'}),'interpolation':'RSP_BilinearInterpolation'}
    url=SOURCE+'/exportImage?'+urllib.parse.urlencode(params)
    response=json.load(urllib.request.urlopen(url,timeout=120))
    if 'error' in response:raise RuntimeError(response['error'])
    tif=scratch/'bedrock-depth-2025-browser-source.tif'
    urllib.request.urlretrieve(response['href'],tif)
    binary=scratch/'bedrock-depth-2025-browser-source.bin'
    subprocess.run(['gdal_translate','-q','-of','ENVI','-co','INTERLEAVE=BSQ',str(tif),str(binary)],check=True)
    floats=struct.unpack('<'+'f'*(WIDTH*HEIGHT),binary.read_bytes())
    values=[round(v) if math.isfinite(v) and 0<=v<=3000 else None for v in floats]
    valid=[v for v in values if v is not None]
    extent=response['extent']; meters=[extent[k] for k in ['xmin','ymin','xmax','ymax']]
    def lon(x):return x/6378137*180/math.pi
    def lat(y):return (2*math.atan(math.exp(y/6378137))-math.pi/2)*180/math.pi
    bounds=[lon(meters[0]),lat(meters[1]),lon(meters[2]),lat(meters[3])]
    payload={'type':'DepthRaster','width':WIDTH,'height':HEIGHT,'crs':'EPSG:3857','bounds':bounds,
             'extentMeters':meters,'unit':'ft','nodata':None,'order':'row-major, north to south',
             'sourceResolutionMeters':29.99943121626573,'values':values}
    raw=json.dumps(payload,separators=(',',':'),allow_nan=False).encode()
    DEST.mkdir(parents=True,exist_ok=True);atomic_write(DEST/'bedrock-depth-2025.json',raw)
    manifest=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'version':1,'bbox':BBOX,'datasets':[]}
    entry={'id':'bedrock-depth-2025','title':'MGS modeled depth to bedrock (2025)',
           'file':'data/bedrock-depth-2025.json','format':'DepthRaster','geometry':['Raster'],
           'featureCount':WIDTH*HEIGHT,'validCellCount':len(valid),'bounds':bounds,
           'rangeFeet':[min(valid),max(valid)],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
           'source':{'url':SOURCE,'itemUrl':'https://www.arcgis.com/home/item.html?id=909f7265fe4040629ecee6ed742444a8',
                     'sourceDate':'2025 model version; item updated 2026-05-18',
                     'retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
                     'coverage':'MGS statewide depth model, exported over the metro bounding box',
                     'license':'Minnesota Geological Survey; public item asks users to reference MGS.',
                     'attribution':'Minnesota Geological Survey, D-03 Depth to Bedrock, 2025',
                     'caveats':['Regional geologic model, not a measured depth at each property.',
                                'Native raster is approximately 30 m. Browser copy samples about 120 m at metro latitude.',
                                'Source values are feet despite service heightModelInfo referring to meters.',
                                'Values are stored in integer feet; model uncertainty is substantially larger and varies spatially.',
                                'No-data areas remain null. Certain Tribal Nations elected not to be included in the statewide model.',
                                'This replaces the old approximately 300 m median-well grid, which was a sparse local derivation.']},
           'raster':{'width':WIDTH,'height':HEIGHT,'crs':'EPSG:3857','extentMeters':meters,'rowOrder':'north to south',
                     'sourceResolutionMeters':29.99943121626573,'storageIncrementFeet':1},
           'reproduce':{'exportUrl':url,'command':'python3 tools/under-street/acquire-bedrock-depth.py /path/to/scratch'}}
    entries={d['id']:d for d in manifest['datasets']};entries[entry['id']]=entry
    manifest['datasets']=list(entries.values());manifest['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    atomic_write(MANIFEST,(json.dumps(manifest,indent=2)+'\n').encode())
    print(f'{len(valid):,} valid cells; {min(valid)} to {max(valid)} feet; {len(raw):,} bytes')

if __name__=='__main__':main()
