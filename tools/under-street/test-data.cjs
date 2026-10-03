#!/usr/bin/env node
/* Offline contracts for the published snapshots and their browser adapter.
 * Run from any directory: node tools/under-street/test-data.cjs
 * Requires only Node built-ins. URLs are checked structurally, not fetched.
 * Browser interaction and rendering belong in test-explorer.cjs.
 */
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '../..');
const mapRoot = path.join(root, 'archive/under-the-street/assets/map');
const adapterFile = path.join(root, 'archive/under-the-street/under-data.js');
const manifest = readJSON('datasets.json');
const media = readJSON('media.json');
const sandbox = { window:{}, Intl };
vm.runInNewContext(fs.readFileSync(adapterFile, 'utf8'), sandbox, { filename:adapterFile });
const data = sandbox.window.UnderStreetData;
const failures = [];
const report = [];
const domainFiles = new Map();
let featuresChecked = 0;
let coordinatePairs = 0;
let tileRecords = 0;
let urlContracts = 0;

function localFile(relative) {
  assert.equal(typeof relative, 'string', 'Asset path must be a string');
  assert.ok(relative && !path.isAbsolute(relative), 'Asset path must be relative: ' + relative);
  const file = path.resolve(mapRoot, relative);
  assert.ok(file.startsWith(mapRoot + path.sep), 'Asset path escapes the map directory: ' + relative);
  assert.ok(fs.statSync(file).isFile(), 'Missing asset: ' + relative);
  return file;
}
function readJSON(relative) {
  const raw=fs.readFileSync(localFile(relative));
  return JSON.parse(relative.endsWith('.gz') ? zlib.gunzipSync(raw) : raw);
}
function check(label, action) {
  try { action(); } catch (error) { failures.push(label + ': ' + error.message); }
}
function validURL(value, label, wikipedia) {
  assert.equal(typeof value, 'string', label + ' must be text');
  const url = new URL(value);
  assert.ok(['https:','http:'].includes(url.protocol), label + ' must use HTTP(S)');
  assert.ok(!url.username && !url.password, label + ' must not contain credentials');
  if (wikipedia) assert.ok(/^[a-z-]+\.wikipedia\.org$/.test(url.hostname) && url.pathname.startsWith('/wiki/'), label + ' must be a Wikipedia article');
  urlContracts++;
}
function coordinates(value) {
  assert.ok(Array.isArray(value), 'Geometry coordinates must be arrays');
  if (typeof value[0] === 'number') {
    assert.ok(value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]), 'Non-finite coordinate');
    assert.ok(Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90, 'Coordinate is outside longitude/latitude ranges');
    coordinatePairs++;
  } else value.forEach(coordinates);
}
function feature(layer, properties) { return { layer, p:properties, kind:data.layers[layer].kind }; }
function fromExport(layer, source) { return feature(layer, source.properties || {}); }
function row(f, label) { return data.facts(f).find(value => value[0] === label)?.[1]; }
function signature(f) { return crypto.createHash('sha256').update(JSON.stringify(f)).digest('hex'); }
function recordsFor(layer) {
  const file = data.layers[layer].file;
  return domainFiles.get(file) || readJSON(file);
}
function find(layer, predicate) {
  const source = recordsFor(layer).features.find(f => predicate(f.properties || {}, f));
  assert.ok(source, 'No source record for ' + layer + ' domain example');
  return fromExport(layer, source);
}

check('Adapter public API', () => {
  for (const name of ['name','type','facts','wiki','isNamed','status','isVisible','typeInfo','recordURL','primarySources','color','lineStyle','sourceNotes','applyManifest','displayDate']) assert.equal(typeof data[name], 'function', name);
  assert.equal(Object.keys(data.topics).sort().join(','), 'gas,ground,networks,power,storm,tour,wastewater,water');
  data.applyManifest(manifest);
});

const configuredByFile = new Map(Object.entries(data.layers).map(([id,cfg]) => [cfg.file,id]));
const seenIDs = new Set();
const seenFiles = new Set();
const keepDomains = new Set(['plants','interceptors','generators','powerplants','towers','cables','pipelines','dams','wspStorm','wspSanitary','groundwaterBounds']);

for (const entry of manifest.datasets) {
  check('Manifest ' + entry.id, () => {
    assert.ok(!seenIDs.has(entry.id), 'Duplicate dataset ID'); seenIDs.add(entry.id);
    assert.ok(!seenFiles.has(entry.file), 'Duplicate dataset file'); seenFiles.add(entry.file);
    const bytes = fs.readFileSync(localFile(entry.file));
    assert.equal(bytes.byteLength, entry.bytes, 'Recorded byte size');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, 'Recorded SHA256');
    validURL(entry.source.url, 'Source URL');
    for (const key of ['itemUrl','downloadUrl','licenseUrl']) if (entry.source[key]) validURL(entry.source[key], key);
    for (const value of Object.values(entry.source.definitionUrls || {})) validURL(value, 'Source definition URL');
    if (entry.source.metadataFile) localFile(entry.source.metadataFile);
    assert.equal(typeof entry.source.coverage, 'string', 'Coverage text');
    assert.equal(typeof entry.source.license, 'string', 'License text');
    assert.ok(Array.isArray(entry.source.caveats), 'Source caveats array');
    const decoded=entry.contentEncoding==='gzip' ? zlib.gunzipSync(bytes) : bytes;
    if (entry.contentEncoding==='gzip') {
      assert.ok(entry.file.endsWith('.json.gz'),'Compressed source has an explicit gzip extension');
      assert.equal(entry.format,'GeoJSON (gzip)','Explicit compressed download format');
      assert.equal(bytes.readUInt32LE(4),0,'Deterministic gzip has no source timestamp');
      assert.equal(bytes[3]&8,0,'Deterministic gzip has no machine-specific filename');
      assert.equal(decoded.length,entry.uncompressedBytes,'Complete decoded byte size');
      assert.equal(crypto.createHash('sha256').update(decoded).digest('hex'),entry.uncompressedSha256,'Complete decoded SHA256');
    }
    const exportData = JSON.parse(decoded);
    const layer = configuredByFile.get(entry.file);
    if (keepDomains.has(layer)) domainFiles.set(entry.file, exportData);
    if (exportData.type === 'DepthRaster') {
      assert.equal(exportData.values.length, exportData.width * exportData.height, 'Raster dimensions');
      assert.equal(exportData.values.length, entry.featureCount, 'Raster cell count');
      assert.equal(exportData.unit, 'ft', 'Raster depth units');
      assert.equal(exportData.crs, 'EPSG:3857', 'Raster coordinate system');
      let valid = 0, min = Infinity, max = -Infinity;
      for (const value of exportData.values) if (value !== null) {
        assert.ok(Number.isFinite(value) && value >= 0, 'Depth must be finite and nonnegative');
        valid++; min = Math.min(min,value); max = Math.max(max,value);
      }
      assert.equal(valid, entry.validCellCount, 'Valid-cell count');
      assert.equal([min,max].join(','), entry.rangeFeet.join(','), 'Raster depth range');
    } else if (Array.isArray(exportData.records)) {
      assert.equal(exportData.records.length, entry.featureCount ?? entry.recordCount, 'Table record count');
      assert.ok(!layer, 'Nonspatial table must not be rendered as a place');
    } else {
      assert.ok(Array.isArray(exportData.features), 'GeoJSON feature array');
      assert.equal(exportData.features.length, entry.featureCount, 'Feature count');
      if (entry.conduitRole) {
        assert.ok(data.layers[layer].municipal,'Municipal export has a municipal adapter');
        const keys=exportData.features.map(f=>f.id);
        assert.ok(keys.every(k=>typeof k==='string' && k.trim()),'Native feature IDs');
        assert.equal(new Set(keys).size,keys.length,'Municipal IDs must be unique');
        assert.ok(entry.identityField && entry.sourceFields.some(f=>f.name===entry.identityField),'Identity has a primary source field');
        for (const source of exportData.features) {
          assert.equal(source.id,String(source.properties[entry.identityField]),'Feature ID preserves native identity');
          assert.equal(source.properties.i,source.id,'Shared identity preserves native ID');
          if (entry.components) {
            const component=entry.components.find(c=>c.layer===source.properties.sourceLayer);
            assert.ok(component,'Combined record points to an exact native source layer');
            assert.equal(source.id,component.layer+'/'+source.properties[component.identityField],'Combined ID preserves source-layer/native-ID pair');
            assert.ok(component.sourceFields.some(field=>field.name===component.identityField),'Component identity is a real source field');
          }
          assert.ok(!Object.keys(source.properties).some(k=>/username|edited_user|created_user|address|legaladdress/i.test(k)),'No editor or address properties');
        }
      }
      for (const source of exportData.features) {
        if (source.geometry) coordinates(source.geometry.coordinates);
        else assert.ok(entry.legacy, 'New export must not have a null geometry');
      }
      if (entry.contextOnly) validateStreetContext(entry, exportData.features);
      if (layer) validateFeatures(layer, exportData.features);
      if (entry.tiles) validateTiles(entry, exportData.features);
    }
  });
}

function validateFeatures(layer, features) {
  let visible = 0;
  for (let index = 0; index < features.length; index++) {
    const f = fromExport(layer, features[index]);
    check(layer + ' feature ' + index, () => {
      const name = data.name(f), kind = data.type(f), info = data.typeInfo(f) || media.types[kind];
      assert.ok(typeof name === 'string' && name.trim(), 'Nonempty readable name');
      assert.ok(typeof kind === 'string' && kind, 'Feature kind');
      assert.ok(info, 'Missing media or adapter kind: ' + kind);
      assert.ok(info.label && info.description, 'Kind label and description');
      validURL(info.wiki || info.wikipedia, 'Kind Wikipedia URL', true);
      const facts = data.facts(f);
      assert.ok(Array.isArray(facts), 'Facts array');
      for (const value of facts) {
        assert.equal(value.length, 2, 'Fact row shape');
        assert.ok(typeof value[0] === 'string' && value[0], 'Fact label');
        assert.ok(typeof value[1] === 'string' && value[1], 'Fact value');
        assert.ok(!/^(undefined|null|NaN)$/.test(value[1]), 'Missing values must have readable meaning');
      }
      assert.equal(typeof data.isNamed(f), 'boolean', 'Named flag');
      assert.equal(typeof data.status(f), 'string', 'Status text');
      assert.equal(typeof data.isVisible(f,false), 'boolean', 'Default visibility');
      assert.equal(data.isVisible(f,true), true, 'All records can be included');
      if (data.isVisible(f,false)) visible++;
      const wiki = data.wiki(f), record = data.recordURL(f);
      if (wiki) validURL(wiki, 'Place Wikipedia URL', true);
      if (record) validURL(record, 'Source record URL');
      if (/^(node|way|relation)\/\d+$/.test(String(f.p.i || ''))) assert.equal(record, 'https://www.openstreetmap.org/' + f.p.i, 'OSM record identity');
      if (/^https?:\/\//i.test(f.p.url || '')) assert.equal(record,f.p.url,'Published record URL is retained');
      const primary = data.primarySources(f);
      assert.ok(Array.isArray(primary), 'Primary source array');
      primary.forEach(link => { assert.ok(link.label,'Primary source label');validURL(link.url,'Primary source URL'); });
      assert.match(data.color(f), /^#[0-9a-f]{6}$/i, 'Feature color');
      const style = data.lineStyle(f);
      assert.ok(Array.isArray(style.dash) && style.dash.every(n => Number.isFinite(n) && n >= 0), 'Line dash contract');
      assert.ok(Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity <= 1, 'Line opacity contract');
      assert.ok(Array.isArray(data.sourceNotes(f)), 'Source note array');
      featuresChecked++;
    });
  }
  report.push(layer + ': ' + visible.toLocaleString('en-US') + '/' + features.length.toLocaleString('en-US') + ' default-visible');
}

function validateTiles(entry, features) {
  const index = readJSON(entry.tiles.index);
  assert.equal(index.featureCount, features.length, 'Tile index total');
  assert.equal(index.tiles.length, entry.tiles.tileCount, 'Tile count');
  const remaining = new Map();
  const identities = new Set();
  for (const f of features) {
    const identity = f.properties.i ?? f.id;
    assert.ok(identity !== undefined && String(identity).trim(), 'Tiled record has a stable source identity');
    assert.ok(!identities.has(String(identity)), 'Tiled source identity is unique across every tile');
    identities.add(String(identity));
  }
  for (const f of features) { const key = signature(f);remaining.set(key,(remaining.get(key) || 0) + 1); }
  let total = 0;
  for (const tile of index.tiles) {
    const file = path.posix.join(path.posix.dirname(entry.tiles.index), tile.file);
    const part = readJSON(file);
    assert.equal(part.features.length,tile.count,'Tile feature count: ' + tile.file);
    if (tile.sha256) {
      const bytes=fs.readFileSync(localFile(file));
      assert.equal(bytes.length,tile.bytes,'Tile bytes: ' + tile.file);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),tile.sha256,'Tile SHA256: ' + tile.file);
    }
    if (entry.contextOnly) {
      assert.deepEqual(geometryBounds(part.features),tile.bounds,'Street tile bounds contain actual complete geometry');
      for (const f of part.features) {
        const b=geometryBounds([f]);
        const cell=[Math.floor((b[0]+b[2])/2/index.tileSizeDegrees),Math.floor((b[1]+b[3])/2/index.tileSizeDegrees)];
        assert.deepEqual(cell,tile.cell,'Street feature is assigned by whole-geometry bounds center');
      }
    }
    for (const f of part.features) {
      const key = signature(f), count = remaining.get(key) || 0;
      assert.ok(count > 0,'Tile has an extra or modified record: ' + tile.file);
      if (count === 1) remaining.delete(key); else remaining.set(key,count - 1);
      total++; tileRecords++;
    }
  }
  assert.equal(total, features.length, 'Tile record total');
  assert.equal(remaining.size,0,'Tiles reproduce complete records including duplicate multiplicity');
}

function geometryBounds(features) {
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  function visit(value) {
    if (typeof value[0]==='number') {
      bounds[0]=Math.min(bounds[0],value[0]);bounds[1]=Math.min(bounds[1],value[1]);
      bounds[2]=Math.max(bounds[2],value[0]);bounds[3]=Math.max(bounds[3],value[1]);
    } else value.forEach(visit);
  }
  features.forEach(f=>visit(f.geometry.coordinates));
  return bounds;
}

function validateStreetContext(entry, features) {
  assert.equal(entry.id,'context-streets','Only named street context uses context-only contract');
  assert.ok(!configuredByFile.has(entry.file),'Street context does not become an infrastructure layer');
  assert.equal(entry.identityField,'roadseg_id','Native street identity');
  assert.equal(entry.tiles.minZoom,13.2,'Neighborhood-only street loading');
  assert.equal(entry.tiles.assignment,'geometryBoundsCenter','Whole-line center assignment');
  assert.equal(entry.tiles.disjoint,true,'Disjoint context tiles');
  const index=readJSON(entry.tiles.index);
  assert.equal(index.assignment,'geometryBoundsCenter');
  assert.equal(index.boundsMeaning,'unionOfWholeFeatureGeometry');
  assert.equal(index.disjoint,true);
  assert.deepEqual(geometryBounds(features),entry.bounds,'Full street export bounds');
  assert.deepEqual(index.bounds,entry.bounds,'Index describes actual source geometry bounds');
  const counties=['Anoka','Carver','Dakota','Hennepin','Ramsey','Scott','Washington'];
  const identities=new Set();
  let named=0, components=0;
  for (const f of features) {
    const p=f.properties;
    assert.ok(['LineString','MultiLineString'].includes(f.geometry.type),'Street segment is a line');
    assert.equal(entry.properties.i,'roadseg_id','Street identity has an explicit native field mapping');
    assert.ok(typeof p.i==='string' && p.i.trim(),'Nonempty native street ID');
    assert.ok(!identities.has(p.i),'Street native IDs are globally unique');identities.add(p.i);
    assert.ok(counties.includes(p.cl) || counties.includes(p.cr),'Every whole segment touches a selected county');
    assert.ok(['highway','arterial','collector','local','other'].includes(p.c),'Defined rendering hierarchy');
    assert.ok(entry.properties.n.startsWith('st_concat'),'Street name has an explicit native field mapping');
    assert.ok(typeof p.n==='string' && p.n.trim(),'Native full street name');
    if (p.nameParts) {
      const fields=['st_pre_mod','st_pre_dir','st_pre_typ','st_pre_sep','st_name','st_pos_typ','st_pos_dir','st_pos_mod'];
      assert.ok(Object.keys(p.nameParts).every(k=>fields.includes(k)),'Fallback names retain actual native components');
      assert.equal(p.n,fields.map(k=>String(p.nameParts[k] || '').trim()).join(' ').trim().replace(/\s+/g,' '),'Fallback label is derived only from preserved native name parts');
      components++;
    }
    if (p.n) named++;
    assert.ok(!Object.keys(p).some(k=>/address|l_f_add|r_f_add|username|gis911poc|comment/i.test(k)),'Street context excludes address ranges, contacts and unrestricted comments');
  }
  assert.equal(named,entry.statistics.namedFeatureCount,'Exact named-street count');
  assert.equal(components,entry.statistics.componentNameCount,'Exact fallback-name count');
  assert.equal(named-components,entry.statistics.nativeFullNameCount,'Exact native full-name count');
  assert.ok(named>features.length*.9,'Street context materially supplies neighborhood names');
}

check('Topic and layer paths', () => {
  assert.equal(data.topics.tour.layers.length,0,'Opening tour does not load system data');
  const used = new Set();
  for (const [id,topic] of Object.entries(data.topics)) {
    assert.ok(topic.title && topic.text,'Topic copy ' + id);
    for (const layer of topic.layers) { assert.ok(data.layers[layer],'Unknown layer ' + layer);used.add(layer); }
  }
  for (const [id,cfg] of Object.entries(data.layers)) {
    assert.ok(used.has(id),'Unreachable layer ' + id);localFile(cfg.file);
    assert.ok(cfg.title && cfg.note && cfg.type,'Layer presentation fields ' + id);
    assert.ok(['point','line','polygon','raster'].includes(cfg.kind),'Geometry contract ' + id);
    assert.ok(Number.isFinite(cfg.minZ) && typeof cfg.on === 'boolean','Layer visibility config ' + id);
    const entry = manifest.datasets.find(d => d.file === cfg.file);
    assert.ok(entry,'Missing manifest association ' + id);
    assert.equal(cfg.count,entry.featureCount ?? entry.recordCount,'Manifest count association ' + id);
    if(cfg.tileIndex) {localFile(cfg.tileIndex);assert.equal(cfg.tileIndex,entry.tiles.index,'Registry tile index ' + id);}
  }
  for (const entry of manifest.datasets) if(!entry.legacy && !entry.contextOnly && entry.format.startsWith('GeoJSON')) assert.ok(configuredByFile.has(entry.file),'Current spatial dataset omitted from map: ' + entry.id);
});

check('Wastewater lifecycle semantics', () => {
  for(const layer of ['plants','interceptors','lifts','meters']) {
    const records = recordsFor(layer).features;
    assert.ok(records.some(f => f.properties.s !== 'Online'),'Fixture includes non-online ' + layer);
    for(const source of records) {
      const f=fromExport(layer,source);
      if(/^(Offline|Abandoned|Removed|Closed)$/.test(f.p.s)) assert.equal(data.isVisible(f,false),false,'Non-online records hidden: ' + layer);
      if(f.p.s === 'Online') assert.equal(data.isVisible(f,false),true,'Online record visible: ' + layer);
    }
  }
  assert.equal(data.type(find('plants',p => p.s === 'Abandoned')),'tplantGhost');
  assert.equal(data.type(find('interceptors',p => p.s === 'Online' && p.type === 'Forcemain')),'forcemain');
  assert.equal(data.type(find('interceptors',p => p.s === 'Online' && p.type === 'Effluent - Gravity')),'effluent');
});

check('Retired tower evidence', () => {
  for(const id of ['way/88405612','way/95763640','way/175087241','way/230142974','way/896291899']) {
    const f=find('towers',p=>p.i === id);
    assert.match(row(f,'Confirmed storage status'),/no longer|ended|replaced/i);
    assert.ok(data.primarySources(f).length,'Historic storage status has a primary source');
    assert.match(data.typeInfo(f).description,/storage service ended/);
  }
});

check('Water-facility tags do not establish treatment', () => {
  for(const [id,photoID] of [['way/128646413','water-fridley'],['way/217164192','aerial-water-columbiaheights'],['way/1319645735','aerial-water-mccarrons'],['way/1323221824','aerial-water-bloomington']]) {
    const f=find('waterworks',p=>p.i===id),photo=media.photos.find(p=>p.id===photoID);
    assert.equal(data.type(f),'ww','Only exact primary-verified plants receive this type');
    assert.ok(photo.match.kinds.includes(data.type(f)),'Verified plant keeps compatible photograph');
    assert.ok(data.primarySources(f).length,'Verified plant has a primary purpose source');
    assert.match(row(f,'Facility purpose'),/treatment|filtration/i);
  }
  const pumping=find('waterworks',p=>p.i==='way/1039251010');
  assert.equal(data.type(pumping),'waterpump');assert.ok(data.primarySources(pumping).length);
  const lift=find('waterworks',p=>p.i==='way/704378267');
  assert.equal(data.type(lift),'waterfacility');assert.equal(lift.layer,'waterworks','Original source-layer membership retained');
  assert.match(row(lift,'Facility purpose'),/Not confirmed/);
  assert.equal(data.type(feature('waterworks',{man_made:'water_works',name:'Water Treatment Plant'})),'waterfacility','A treatment-like name alone does not establish primary identity');
  assert.equal(data.name(feature('waterworks',{man_made:'water_works'})),'Mapped water facility','Unnamed generic record is not called a drinking-water plant');
  assert.match(data.typeInfo(feature('waterworks',{})).description,/does not establish treatment/);
  assert.equal(data.typeInfo(feature('eaganFiberCable',{})).wiki,'https://en.wikipedia.org/wiki/Optical_fiber_cable');
});

check('Water inventory interpretations and missing values', () => {
  const sourceObject=find('services',p=>p.i===1);
  assert.equal(row(sourceObject,'City source ObjectID'),'1','Known official ObjectID remains a stable inspector identity');
  assert.equal(new URL(data.recordURL(sourceObject)).searchParams.get('objectIds'),'1','Known service record query uses official ObjectID');
  for(const purpose of ['NotaWaterService','Storm']) {
    const f=feature('services',{c:1,t:purpose});
    assert.equal(data.type(f),'nonwaterservice');assert.ok(!/lead service/i.test(data.name(f)));
    assert.equal(data.color(f),data.color(feature('services',{c:2,t:purpose})),'Non-water material is not given lead color');
  }
  assert.equal(data.type(feature('services',{c:1,t:'Domestic'})),'leadservice');
  assert.equal(data.type(feature('services',{t:'Domestic'})),'unknownservice');
  assert.equal(row(feature('wells',{b:0}),'Reported depth to bedrock'),'0 ft');
  assert.equal(row(feature('wells',{d:0}),'Drilled depth'),'0 in source; depth unreported');
  assert.equal(row(feature('wells',{q:'T'}),'Well-ID verification method'),'Tag on well (T)');
  assert.ok(row(feature('wells',{coordinateMethod:'G3 '}),'Coordinate derivation method').includes('Differentially corrected GPS'),'Trim padded coordinate codes for lookup');
  assert.ok(row(feature('wells',{geologyMethod:'A'}),'Geologic interpretation method').includes('Inferred from geologic map'),'Depth interpretation is not always a field observation');
  assert.equal(row(feature('pavement',{pci:0}),'Historical condition index'),'0 / 100');
  assert.equal(row(feature('pavement',{}),'Historical condition index'),'Unrated');
  assert.equal(data.displayDate(19850620),'Jun 20, 1985');
  assert.equal(row(feature('wells',{u:'DO'}),'Recorded use'),'Domestic (DO)');
  assert.equal(row(feature('wells',{s:'S'}),'Recorded well status'),'Sealed (S)');
  assert.equal(row(feature('wells',{u:'NEW'}),'Recorded use'),'Unmapped code (NEW)');
});

check('Municipal lifecycle, units, ownership and model contracts', () => {
  for(const [layer,key] of [['maplewoodSanitary','Status'],['maplewoodForce','Status'],['maplewoodStorm','STATUS']]) {
    const inactive=find(layer,p=>p[key]==='Abandoned');
    assert.equal(data.isVisible(inactive,false),false,'Explicit abandoned municipal pipe hidden');
    assert.equal(data.isVisible(inactive,true),true,'Abandoned record remains accessible');
    const active=find(layer,p=>p[key]==='Active');
    assert.equal(data.isVisible(active,false),true);
    assert.ok(data.facts(active).some(r=>/source units unspecified/.test(r[0])),'Maplewood units are not guessed');
  }
  const owned=find('maplewoodSanitary',p=>p.Ownership==='MCES');
  assert.equal(row(owned,'Ownership'),'MCES','Regional ownership is retained inside local export');
  const built=feature('maplewoodSanitary',{BUILT:2010,OBJECTID:123456});
  assert.ok(data.facts(built).some(r=>r[1]==='2010'),'Construction years remain plain text');
  assert.ok(data.facts(built).some(r=>r[1]==='123456'),'Technical record IDs remain plain text');
  const snapshot=Date.parse(data.layers.bloomWater.source.retrievedAt);
  assert.ok(Number.isFinite(snapshot),'City lifecycle snapshot date is supplied');
  assert.equal(data.isVisible(feature('bloomWater',{Date_Decommissioned:snapshot+86400000}),false),true,'A future decommission date remains a plan at this snapshot');
  assert.equal(data.isVisible(feature('bloomWater',{Date_Decommissioned:snapshot-86400000}),false),false,'A past reported decommission date is retained');
  for(const layer of ['bloomWater','bloomServices','bloomSanitary']) {
    const inactive=find(layer,p=>/abandoned|inactive/i.test(p.Type||p.main_type||''));
    assert.equal(data.isVisible(inactive,false),false,'Published inactive municipal water/sewer hidden');
  }
  assert.equal(data.isVisible(feature('bloomWater',{Enabled:0,ConstructionStatus:'Complete'}),false),true,'GIS Enabled alone is not a lifecycle state');
  assert.equal(data.isVisible(feature('bloomStorm',{ConstructionStatus:'Proposed'}),false),false,'Proposed pipe hidden by default');
  assert.equal(data.type(feature('bloomWater',{Type:'Raw Water'})),'rawwatermain','Raw water is distinguished from customer distribution');
  assert.equal(data.type(feature('bloomSanitary',{main_type:'Private Forcemain'})),'forcemain','Pumped source type retained');
  const storm=find('bloomStorm',p=>p.PipeDiameter && p.PipeLength);
  assert.ok(row(storm,'Pipe Diameter (in)') && row(storm,'Pipe Length (ft)'),'Explicit city storm units preserved');
  const privateStorm=find('bloomPrivateStorm',p=>p.Diameter && p.PipeLength);
  assert.ok(row(privateStorm,'Diameter (source units unspecified)') && row(privateStorm,'Pipe Length (source units unspecified)'),'Separate private storm units remain unknown');
  const model=find('mwmoNorthModel',p=>/assum/i.test(p.CMT_USINV||''));
  assert.equal(data.type(model),'stormmodel');
  assert.ok(/^Model conduit /.test(data.name(model)));
  assert.ok(/model/i.test(data.status(model)),'A model has no invented operating status');
  assert.ok(data.facts(model).some(r=>r[1]===model.p.CMT_USINV),'Exact source assumption retained');
  for(const contents of ['Phone Service','City Installed Telecom']) {
    const telecom=find('bloomConduit',p=>p.underground_type===contents);
    assert.equal(data.type(telecom),'citytelecom');
    assert.ok(!/fiber/i.test(data.name(telecom)),'Telecom contents do not infer fiber');
  }
  assert.equal(data.type(feature('bloomConduit',{underground_type:'Spare/Empty 2\" Conduit'})),'cityconduit','Empty conduit does not become installed telecom');
  const well=find('wells',p=>p.coordinateMethod && p.geologyMethod);
  assert.ok(row(well,'Coordinate derivation method') && row(well,'Geologic interpretation method'),'Both source methods are acquired');
  assert.ok(!row(well,'Location verification method'),'LOC_MC is not mislabeled as coordinate verification');
});

check('Eagan component provenance and lifecycle domains', () => {
  for(const layer of ['eaganWater','eaganServices','eaganSanitary','eaganStorm','eaganFiberCable','eaganFiberPath']) {
    const cfg=data.layers[layer],source=recordsFor(layer).features;
    assert.equal(source.length,cfg.count);
    assert.equal(new Set(source.map(f=>f.id)).size,source.length,'Every combined identity is unique');
    for(const component of cfg.metadata.components) {
      const rows=source.filter(f=>f.properties.sourceLayer===component.layer);
      assert.equal(rows.length,component.featureCount,'Exact source component count');
      const f=fromExport(layer,rows[0]);
      assert.ok(data.recordURL(f).startsWith(component.source.url+'/query?'),'Record query retains native source layer');
      assert.equal(row(f,'Native source layer'),component.title);
    }
  }
  const abandoned=find('eaganSanitary',p=>p.LifecycleStatus==='ABN');
  const removed=find('eaganStorm',p=>p.LifeCycleStatus==='RMVNE');
  assert.equal(data.isVisible(abandoned,false),false);assert.match(data.status(abandoned),/Abandoned/);
  assert.equal(data.isVisible(removed,false),false);assert.match(data.status(removed),/Never Existed/);
  for(const [layer,key] of [['eaganSanitary','LifecycleStatus'],['eaganStorm','LifeCycleStatus']]) {
    const future=find(layer,p=>p[key]==='PRMV');
    assert.equal(data.isVisible(future,false),true,'A planned removal is not accomplished removal');
    assert.match(data.status(future),/removal/i);
  }
  assert.equal(data.type(find('eaganSanitary',p=>p.sourceLayer===30)),'forcemain');
  assert.equal(data.type(find('eaganSanitary',p=>p.sourceLayer===29)),'sanitarylateral');
  assert.equal(data.type(find('eaganStorm',p=>p.sourceLayer===61)),'stormpressure');
  assert.equal(data.type(find('eaganStorm',p=>p.sourceLayer===59)),'stormlateral');
  assert.equal(data.type(find('eaganWater',p=>p.WaterType==='Raw')),'rawwatermain');
  const assumed=find('eaganServices',p=>p.GeometrySource==='Assumed');
  assert.ok(data.facts(assumed).some(r=>r[1]==='Assumed'),'Record-specific assumed geometry remains explicit');
  const conflict=find('eaganFiberCable',p=>p.status===101 && p.cableStatus==='Proposed');
  assert.equal(data.isVisible(conflict,false),false,'A proposed cable field is retained despite Existing general status');
  assert.match(data.status(conflict),/source fields differ/);
  assert.equal(data.type(conflict),'fibercable');
  const route=find('eaganFiberPath',p=>p.status===101);
  assert.equal(data.type(route),'fiberpath');assert.match(row(route,'Path interpretation'),/does not establish/);
});

check('Pipeline and electric-cable semantics', () => {
  for(const [classification,kind] of Object.entries({g:'gas',h:'steam',w:'waterpipe',f:'fuelpipe',a:'ammoniapipe','?':'pipeline'})) {
    const f=find('pipelines',p=>p.k === classification);assert.equal(data.type(f),kind);
    if(classification === '?') assert.equal(row(f,'Substance tag'),'Not reported');
  }
  assert.equal(data.type(feature('pipelines',{k:'?',operator:'A gas utility'})),'pipeline','Operator is not a substance classifier');
  const missing=find('cables',p=>!p.location),buried=find('cables',p=>p.location === 'underground');
  assert.equal(data.type(missing),'powercable');assert.ok(!/underground/i.test(data.name(missing)));
  assert.equal(data.type(buried),'undergroundpower');
  for(const source of recordsFor('dams').features) assert.equal(data.type(fromExport('dams',source)),source.properties.lock === 'yes' ? 'lock' : 'dam','Preserved structure tags distinguish dams and locks');
});

check('Groundwater and municipal pipe contracts', () => {
  assert.equal(data.layers.groundwaterBounds.kind,'line');
  for(const source of recordsFor('groundwaterBounds').features) assert.ok(['LineString','MultiLineString'].includes(source.geometry.type));
  const storm=find('wspStorm',p=>p.d != null && p.l != null);
  assert.ok(row(storm,'Width, source units unspecified') && row(storm,'Length, source units unspecified'),'Undocumented storm units remain unspecified');
  const sanitary=find('wspSanitary',p=>p.g && p.d);
  assert.equal(row(sanitary,'Published pipe size'),String(sanitary.p.d),'Pipe size remains the published string');
  assert.equal(row(sanitary,'Published grade'),String(sanitary.p.g),'Grade remains the published string');
});

check('EIA unit status and capacity meaning', () => {
  const units=recordsFor('generators').features;
  for(const source of units) {
    const f=fromExport('generators',source);
    assert.equal(data.isVisible(f,false),f.p.stage === 'Operating' && /^\((OP|SB)\)/.test(f.p.status),'Operating/standby visibility');
    assert.equal(row(f,'Nameplate capacity'),new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(f.p.mw) + ' MW','Unit nameplate capacity');
    if(f.p.plannedOperation) assert.equal(row(f,'Planned operation'),f.p.plannedOperation,'Planned operation date retained');
    if(f.p.plannedRetirement) assert.equal(row(f,'Planned retirement'),f.p.plannedRetirement,'Planned retirement date retained');
  }
  for(const status of ['Retired','Canceled or Postponed','(OA) Out of service but expected to return to service in next calendar year']) {
    const f=find('generators',p=>p.status === status);assert.equal(data.isVisible(f,false),false);assert.equal(data.isVisible(f,true),true);
  }
  const sherco=find('powerplants',p=>p.i === 6090);
  assert.match(row(sherco,'Capacity meaning'),/standby.*out-of-service/);
  assert.ok(sherco.p.units.some(u=>u.g === '2' && u.stage === 'Retired'),'Sherco unit 2 remains retired');
  assert.ok(data.facts(sherco).some(r=>r[0] === 'Generator 1' && /planned retirement 2026-12/.test(r[1])),'Planned retirement remains a plan');
  const cancelled=find('powerplants',p=>p.status === 'Canceled or Postponed');assert.equal(data.isVisible(cancelled,false),false);
});

check('Federal plant photograph identity and kind compatibility', () => {
  const examples=[[1922,'pp-monticello'],[1927,'aerial-pp-riverside'],[6090,'pp-sherco']];
  for(const [id,photoID] of examples) {
    const f=find('powerplants',p=>p.i===id),photo=media.photos.find(p=>p.id===photoID);
    assert.ok(photo,'Known facility photograph '+photoID);
    assert.ok(photo.match.names.includes(data.name(f)),'Exact federal facility alias '+id);
    assert.ok(photo.match.kinds.includes(data.type(f)),'Renderer-compatible facility kind '+id);
    assert.ok(photo.identitySources.some(s=>s.claim.includes(String(id))),'Primary federal identity evidence '+id);
    photo.identitySources.forEach(s=>validURL(s.url,'Photo identity source'));
  }
  const sherco=media.photos.find(p=>p.id==='pp-sherco');
  for(const source of recordsFor('powerplants').features) {
    const f=fromExport('powerplants',source);
    if(/solar|battery/i.test(data.type(f))) assert.ok(!(sherco.match.names.includes(data.name(f)) && sherco.match.kinds.includes(data.type(f))),'Solar/storage sites do not inherit the coal-station photograph');
  }
});

if(failures.length) {
  console.error('FAIL ' + failures.length + ' contract checks');
  const groups=new Map();
  failures.forEach(message=>{
    const key=message.replace(/ feature \d+/,' feature');
    const group=groups.get(key) || {count:0,example:message};
    group.count++;groups.set(key,group);
  });
  Array.from(groups.values()).slice(0,40).forEach(group=>console.error(group.count + ' occurrence(s): ' + group.example));
  if(groups.size > 40) console.error('Additional failure groups omitted: ' + (groups.size-40));
  process.exitCode=1;
} else {
  console.log('PASS ' + manifest.datasets.length + ' dataset hashes/counts, ' + Object.keys(data.layers).length + ' layers, ' + featuresChecked.toLocaleString('en-US') + ' adapter records');
  console.log('PASS ' + coordinatePairs.toLocaleString('en-US') + ' coordinate pairs, ' + tileRecords.toLocaleString('en-US') + ' exact tiled records, ' + urlContracts.toLocaleString('en-US') + ' URL contracts');
  console.log('PASS lifecycle, tower evidence, water purpose, pipeline substances, cable location, groundwater, EIA, exact photographs, municipal units/model assumptions and well-method examples');
  if(process.argv.includes('--verbose')) report.forEach(line=>console.log(line));
}
