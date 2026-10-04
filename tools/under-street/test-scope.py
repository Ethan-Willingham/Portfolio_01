"""Independent GEOS intersection check, including segments crossing city holes."""
import gzip,json
from pathlib import Path
from shapely.geometry import shape,Point
from pyproj import Transformer
base=Path(__file__).resolve().parents[2]/'archive/under-the-street/assets/map'
city=shape(json.loads((base/'cities.json').read_text())['features'][0]['geometry'])
manifest=json.loads((base/'datasets.json').read_text());count=0
for d in manifest['datasets']:
 b=(base/d['file']).read_bytes();obj=json.loads(gzip.decompress(b) if d['file'].endswith('.gz') else b)
 if d['format']=='DepthRaster':
  t=Transformer.from_crs(3857,4326,always_xy=True);e=obj['extentMeters'];dx=(e[2]-e[0])/obj['width'];dy=(e[3]-e[1])/obj['height']
  for i,v in enumerate(obj['values']):
   if v is not None:
    col=i%obj['width'];row=i//obj['width'];assert city.covers(Point(*t.transform(e[0]+(col+.5)*dx,e[3]-(row+.5)*dy)))
  continue
 for f in obj['features']:
  geom=shape(f['geometry']);assert geom.is_valid,(d['id'],f.get('id'))
  assert city.buffer(1e-10).covers(geom),(d['id'],f.get('id'),geom.difference(city).wkt)
  count+=1
print('PASS full geometries of',count,'features and every non-null raster center are inside Saint Paul')
