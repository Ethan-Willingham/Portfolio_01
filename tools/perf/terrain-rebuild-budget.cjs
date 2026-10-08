// Exercise the production cache and strip painter across live scale changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/sluice/130-render-mine-break.js'), 'utf8');
const resize = fs.readFileSync(path.join(root, 'js/sluice/040-init-resize-resolution.js'), 'utf8');
const start = source.indexOf('  function getTerrainChunk(');
const end = source.indexOf('  function drawTerrainClearOverlays(', start);
const sync = resize.slice(resize.indexOf('  function syncTerrainChunkRenderScale('), resize.indexOf('\n  var viewW'));
assert(start >= 0 && end > start);
function factory(scale) {
  return new Function('initial', `
    var TILE=8,TERRAIN_CHUNK_TILES=8,TERRAIN_CHUNK_PX=64,TERRAIN_CHUNK_PAD=2;
    var TERRAIN_CHUNK_RENDER_SCALE=initial,desired=initial,TERRAIN_CHUNK_REBUILDS_PER_FRAME=1;
    var terrainChunkCache={},terrainChunkCount=0,terrainChunkUseTick=0;
    var terrainChunkRebuildsThisFrame=0,terrainChunkPendingThisFrame=0,terrainHiddenChunks=0;
    var terrainWarmupFrames=2,terrainChunkRebuildBoostFrames=0,introPhase='warmup';
    var paints=0,draws=[];
    function context(){return {imageSmoothingEnabled:false,imageSmoothingQuality:'low',
      clearRect(){},drawImage(cv,...args){
        if(cv.kind==='chunk'){
          if(args[0] !== cv.paintedScale || args[2] !== 66*cv.paintedScale)
            throw Error('Chunk cropped using a different bitmap scale');
          if(args[0]+args[2]>cv.width || args[1]+args[3]>cv.height)
            throw Error('Chunk crop exceeds the bitmap');
        }
        draws.push({canvas:cv,args});
      }};}
    var ctx=context(),document={createElement(){return {width:0,height:0,getContext:context};}};
    function terrainChunkKey(r,c){return r+':'+c;}
    function terrainDesiredChunkRenderScale(){return desired;}
    function renderTerrainChunk(r,c,chunk){chunk.canvas.kind='chunk';chunk.canvas.paintedScale=chunk.scale;
      chunk.dirty=false;chunk.ready=true;chunk.paintVersion=(chunk.paintVersion||0)+1;paints++;}
    function trimTerrainChunkCache(){}
    function lightFogFullyCovers(){return false;}
    ${sync}
    ${source.slice(start, end)}
    return {cache:()=>terrainChunkCache,
      scale(value){desired=value;syncTerrainChunkRenderScale();},
      mode(phase,warm,boost){introPhase=phase;terrainWarmupFrames=warm;terrainChunkRebuildBoostFrames=boost;},
      dirty(){for(var key in terrainChunkCache)terrainChunkCache[key].dirty=true;},
      frame(){draws=[];drawTerrainChunks(1,46,1,46);return {rebuilds:terrainChunkRebuildsThisFrame,
        pending:terrainChunkPendingThisFrame,ready:Object.values(terrainChunkCache).filter(c=>c.ready).length,
        scales:Object.values(terrainChunkCache).map(c=>c.scale),paints,draws:draws.length};}};
  `)(scale);
}
let frames = 0, transitions = 0;
for (const from of [1,1.5,2,2.5,3]) for (const to of [1,1.5,2,2.5,3]) {
  const game = factory(from);
  const cold = game.frame(); frames++;
  assert.equal(cold.rebuilds,36,'Loading prepares the complete view under its cover');
  assert.equal(cold.pending,0);
  const cache = game.cache(), identities = Object.values(cache);
  game.mode('done',100,100); // Neither warmup nor boost may override the live budget.
  game.scale(to);
  assert.equal(game.cache(),cache,'Scale changes retain the cache');
  assert.deepEqual(Object.values(game.cache()),identities,'Scale changes retain ready bitmaps');
  let pending = 36;
  for(let i=0;i<37;i++){
    const frame=game.frame();frames++;
    assert(frame.rebuilds<=1,'At most one chunk rebuilt per live frame');
    assert.equal(frame.ready,36,'Old terrain remains available throughout the transition');
    assert(frame.pending<=pending,'Transition converges');pending=frame.pending;
  }
  assert.equal(pending,0);
  assert(Object.values(cache).every(c=>c.scale===to));
  game.dirty();
  const changed=game.frame();frames++;
  assert.equal(changed.rebuilds,1,'Mining and activation also respect the live budget');
  assert.equal(changed.pending,35);
  transitions++;
}
const flutter=factory(2);flutter.frame();flutter.mode('done',0,3);
for(let i=0;i<40;i++){
  flutter.scale(i%2?3:1.5);const frame=flutter.frame();frames++;
  assert(frame.rebuilds<=1);assert.equal(frame.ready,36);
}
flutter.scale(2.5);
for(let i=0;i<37;i++){const frame=flutter.frame();frames++;assert(frame.rebuilds<=1);}
assert(flutter.frame().scales.every(s=>s===2.5));
const liveCold=factory(2);liveCold.mode('done',0,3);
assert.equal(liveCold.frame().rebuilds,1,'Cold live views cannot request the loading burst');
console.log(JSON.stringify({passed:true,transitions,frames,liveRebuildLimit:1,loadingRebuilds:36}));
