// City-only geometry and source meaning are independently checked before release.
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),zlib=require('zlib'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'archive/under-the-street/assets/map');
function read(file){let bytes=fs.readFileSync(path.join(base,file));return JSON.parse(file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes);}
const manifest=read('datasets.json'),s={window:{},Intl};
vm.runInNewContext(fs.readFileSync(path.join(base,'city-boundary.js'),'utf8'),s);vm.runInNewContext(fs.readFileSync(path.join(root,'archive/under-the-street/under-data.js'),'utf8'),s);
const data=s.window.UnderStreetData;data.applyManifest(manifest);
assert.equal(manifest.scope,'Saint Paul city limits only');assert.equal(manifest.datasets.length,50);
assert.deepEqual(Object.keys(data.topics).sort(),['gas','ground','lines','networks','power','storm','wastewater','water']);
assert.equal(data.topics.lines.layers.length,14);assert.ok(data.topics.lines.layers.every(id=>data.layers[id].kind==='line'));assert.equal(data.lineGroups.find(g=>g.id==='water').layers.length,1);
assert.equal(data.contains(-93.12,44.95),true);for(const p of [[-93.265,44.975],[-93.08,44.904],[-93.1,44.997],[-93.3,44.83]])assert.equal(data.contains(...p),false);
const files=new Set(),ids=new Set();let records=0,vertices=0;
for(const d of manifest.datasets){
 assert.ok(!files.has(d.file));files.add(d.file);assert.ok(!ids.has(d.id));ids.add(d.id);
 assert.equal(d.scope.city,'Saint Paul');const bytes=fs.readFileSync(path.join(base,d.file));assert.equal(bytes.length,d.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),d.sha256);
 assert.ok(/^https?:/.test(d.source.url));assert.match(d.source.coverage,/Saint Paul/);assert.ok(Array.isArray(d.source.caveats));
 const gj=read(d.file);if(d.format==='DepthRaster'){assert.equal(gj.values.length,gj.width*gj.height);assert.equal(gj.values.filter(v=>v!==null).length,d.validCellCount);continue;}
 assert.equal(gj.features.length,d.featureCount);records+=gj.features.length;
 for(const f of gj.features){assert.ok(f.geometry);if(f.displayAnchor)assert.equal(data.contains(...f.displayAnchor),true,'Display anchor in Saint Paul');
  const points=v=>typeof v[0]==='number'?[v]:v.flatMap(points);
  for(const p of points(f.geometry.coordinates)){vertices++;assert.ok(p.every(Number.isFinite));assert.equal(data.contains(p[0],p[1]),true,'Every coordinate in Saint Paul: '+d.id);}
 }
 if(d.file.endsWith('.gz')){assert.equal(bytes.readUInt32LE(4),0);assert.equal(zlib.gunzipSync(bytes).length,d.uncompressedBytes);}
}
for(const [id,cfg] of Object.entries(data.layers)){assert.ok(files.has(cfg.file),'Registered export '+id);assert.ok(cfg.source.url);}
const streets=read('data/context-streets.json.gz'),index=read('data/context-streets-tiles.json'),sign=f=>JSON.stringify(f),wanted=new Set(streets.features.map(sign));
assert.equal(wanted.size,streets.features.length);let tiled=0;const seen=new Set();
for(const tile of index.tiles)for(const f of read('data/'+tile.file).features){const key=sign(f);assert.ok(wanted.has(key));assert.ok(!seen.has(key));seen.add(key);tiled++;}assert.equal(tiled,streets.features.length);
function feature(id,p){return{layer:id,p,kind:data.layers[id].kind};}
const pipe=feature('rwmwdPipes',{OBJECTID:24,PIPE_SIZE:48,PIPE_MAT:'RCP',YEAR_INST_:1981});const facts=data.facts(pipe);
assert.ok(Array.isArray(facts));assert.equal(facts.find(r=>r[0]==='Installation year')[1],'1981');assert.equal(facts.find(r=>r[0]==='Pipe size, source units unspecified')[1],'48');assert.match(data.typeInfo(pipe).wiki,/Reinforced_concrete/);
assert.equal(data.isVisible(feature('signalLines',{TYPE:'ABANDONED'}),false),false);assert.equal(data.isVisible(feature('signalLines',{TYPE:'ABANDONED'}),true),true);
assert.equal(data.type(feature('signalLines',{TYPE:'RADIO'})),'signalradio');assert.equal(data.type(feature('signalLines',{TYPE:'FIBER'})),'signalfiber');
assert.equal(data.type(feature('rwmwdStructures',{STRCT_TYPE:'Manhole'})),'stormmanhole');assert.ok(Array.isArray(data.facts(feature('rwmwdStructures',{OBJECTID:5,STRCT_TYPE:'Manhole'}))));
assert.match(data.recordURL(feature('hydrants',{FID:100,OBJECTID:500})),/FID%3D100/);
for(const [id,cfg] of Object.entries(data.layers)){
 if(cfg.kind==='raster')continue;
 for(const f of read(cfg.file).features){assert.ok(cfg.kind==='line'?/LineString/.test(f.geometry.type):cfg.kind==='polygon'?/Polygon/.test(f.geometry.type):f.geometry.type==='Point','Geometry dimension '+id);const o=feature(id,f.properties);assert.equal(typeof data.name(o),'string');assert.ok(Array.isArray(data.facts(o)),'Facts array '+id);assert.equal(typeof data.isVisible(o,false),'boolean');const info=data.typeInfo(o);if(info)assert.ok(info.wiki.startsWith('https://en.wikipedia.org/wiki/'));}
}
const photos=read('media.json').photos;assert.equal(photos.length,4);for(const p of photos){assert.ok(data.contains(...p.match.near));for(const file of [p.src,p.webp])assert.ok(fs.existsSync(path.join(base,file.replace('assets/map/',''))));assert.ok(p.sourceUrl&&p.license);}
console.log('PASS 50 city-only datasets, '+records+' features, '+vertices+' city-boundary coordinates, '+tiled+' exact street-tile records, native attributes, source URLs, lifecycle and four exact-site photographs');
