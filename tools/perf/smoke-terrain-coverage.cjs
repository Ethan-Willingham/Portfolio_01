// CPU proof for the smoke terrain halo, using the actual painter and tile helpers.
// Canvas commands and coverage are compared with the shipped v28.172 source.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const file = 'js/sluice/189-smoke-terrain-mask.js';
const baseline = cp.execFileSync('git', ['show',
  (process.env.BASE_REF || 'b6dc539759097cdf386ea535692516c37ae81ea6') + ':' + file],
  {cwd: root, encoding: 'utf8'});
const candidate = fs.readFileSync(process.env.SMOKE_TERRAIN_SOURCE || path.join(root, file), 'utf8');
function extract(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const end = source.indexOf('\n  function ', start + 4);
  return source.slice(start, end < 0 ? source.length : end);
}
const collision = fs.readFileSync(path.join(root, 'js/sluice/070-collision-liquids.js'), 'utf8');
const terrain = fs.readFileSync(path.join(root, 'js/sluice/100-render-terrain.js'), 'utf8');
const helpers = extract(collision, 'tileAt') + extract(collision, 'getTileObj') +
  extract(terrain, 'terrainKindAt') + extract(terrain, 'dominantVoidBackingKind');
function factory(source) {
  return new Function(`
    var COLS=80,TOTAL_ROWS=64,TILE=32,SKY_ROWS=4;
    var world=Array.from({length:TOTAL_ROWS},()=>Array(COLS).fill(null));
    var worldScale=2,targetWorldScale=2,smokeFluidDomainWorldW=512,smokeFluidDomainWorldH=384;
    var WOBBLE_AMP_LOW=1.9,paths=new Map(),tape=[];
    ${helpers}
    function context(){return {save(){tape.push(['save']);},restore(){tape.push(['restore']);},
      setTransform(...x){tape.push(['transform',...x]);},clearRect(...x){tape.push(['clear',...x]);},
      fillRect(...x){tape.push(['rect',...x]);},fill(x){tape.push(['fill',x.key]);},
      drawImage(cv,...x){tape.push(['image',cv.width,cv.height,...x]);}};}
    var ctx=context(),document={createElement(){return {width:0,height:0,getContext:context};}};
    // The path builder is unchanged. Model its documented occupancy/tuning
    // certificate while preserving object identity for cache hit decisions.
    function buildVoidContourPath(r0,r1,c0,c1){
      var a=[r0,r1,c0,c1,WOBBLE_AMP_LOW];
      for(var r=r0;r<=r1;r++)for(var c=c0;c<=c1;c++)a.push(tileAt(r,c)===null?1:0);
      var key=a.join(',');if(!paths.has(key))paths.set(key,{key});return paths.get(key);
    }
    function drawSurfaceVoidMouths(a,b){tape.push(['mouth',a,b]);}
    ${source}
    return {world,
      change(p){if(p.scale!==undefined)worldScale=p.scale;if(p.target!==undefined)targetWorldScale=p.target;
        if(p.width!==undefined)smokeFluidDomainWorldW=p.width;if(p.height!==undefined)smokeFluidDomainWorldH=p.height;
        if(p.wobble!==undefined)WOBBLE_AMP_LOW=p.wobble;},
      paint(x,y,sx=.75,sy=.75){tape=[];var ok=smokeTerrainMaskPaint(ctx,x,y,sx,sy);
        return {ok,tape,builds:smokeTerrainMaskBuilds,cells:smokeTerrainMask?Array.from(smokeTerrainMask.cells):null};}};
  `)();
}
const a = factory(baseline), b = factory(candidate);
let seed = 932177, paints = 0, covered = 0;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const values = [null, undefined, {type: 'dirt'}, {type: 'stone'}, {type: 'foundation'}, {type: 'coal'}, 'wall'];
function set(r, c, value) {a.world[r][c] = value; b.world[r][c] = value;}
function compare(x, y, sx, sy) {
  const before = a.paint(x, y, sx, sy), after = b.paint(x, y, sx, sy);
  assert.deepEqual(after, before, 'Painter mismatch at ' + [x,y,sx,sy]);
  paints++; covered += before.cells ? before.cells.length : 0;
}
for (let trial = 0; trial < 24; trial++) {
  for (let r = 0; r < 64; r++) for (let c = 0; c < 80; c++) {
    set(r, c, trial === 0 ? null : trial === 1 ? {type:'dirt'} :
      trial === 2 ? (r < 4 ? null : {type:'stone'}) : values[Math.floor(random() * values.length)]);
  }
  for (const [x,y] of [[1,-600],[350,0],[350.125,.5],[351.5,2],[383.99,0],[384,0],
    [0,1700],[2048,0],[-1,0],[2049,0],[350,500],[350,1600]]) compare(x,y);
  // Direct edits of interior and halo cells, including mutation of tile type.
  compare(350,0);
  const cacheC0 = Math.floor(350 / 128) * 4 - 2;
  for (const [r,c] of [[0,cacheC0-1],[0,cacheC0],[3,cacheC0+6],
    [5,cacheC0+25],[19,cacheC0+10]]) {
    for (const value of values) {set(r,c,value); compare(350,0);}
  }
  const edited = {type:'dirt'};
  set(0,cacheC0-1,edited);compare(350,0);
  for (const kind of ['foundation','stone','coal','dirt']) {edited.type=kind;compare(350,0);}
  for (const state of [{scale:2.01},{scale:2},{wobble:1.9+trial/10},{width:608,height:448},
    {width:512,height:384}]) {a.change(state);b.change(state);compare(350,0);}
  compare(350,0,.82,.77);
}
// Exercise the actual coverage loop exhaustively, independent of the path.
function coverage(source) {
  const end = source.indexOf('    var x = c0 * TILE');
  const start = source.indexOf('    var stride = cols + 2') >= 0 ?
    source.indexOf('    var stride = cols + 2') : source.indexOf('    var i = 0, hasVoids = false;');
  assert(start >= 0 && end > start);
  return new Function('world', `var COLS=3,TOTAL_ROWS=3;${helpers}
    var c0=1,c1=1,r0=1,r1=1,cols=1,rows=1,m={cells:new Uint8Array(1)},changed=false;
    ${source.slice(start,end)} return m.cells[0];`);
}
const oldCoverage = coverage(baseline), newCoverage = coverage(candidate);
const world = Array.from({length:3}, () => Array(3).fill(null));
const neighbors = [[0,0],[0,1],[0,2],[1,0],[1,2],[2,0],[2,1],[2,2]];
const neighborTypes = [null,'wall',{type:'foundation'},{type:'dirt'}];
for (let pattern=0; pattern<65536; pattern++) {
  let bits=pattern;
  for (const [r,c] of neighbors) {world[r][c]=neighborTypes[bits&3];bits>>>=2;}
  for (const value of values) {
    world[1][1]=value;
    assert.equal(newCoverage(world),oldCoverage(world),'Neighbor pattern '+pattern);
    covered++;
  }
}
console.log('PASS: '+paints+' exact painter command/coverage checks; '+covered+
  ' coverage cells, including 65,536 neighbor patterns and seven center types.');
