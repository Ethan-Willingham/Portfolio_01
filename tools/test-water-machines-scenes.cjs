'use strict';
// Declarative geometry and initialization checks, not a fluid acceptance test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Builder = require('../js/water-machines-builder.js');
const Scenes = require('../js/water-machines-scenes.js');
const worlds = [{ w: 320, h: 320 }, { w: 390, h: 504 }, { w: 640, h: 320 }, { w: 844, h: 320 }, { w: 960, h: 576 }, { w: 1120, h: 672 }];
const seeds = [17, 42, 913], results = [];
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
function border(walls, width, height) {
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (c === 0 || r === 0 || c === width - 1 || r === height - 1) walls[r * width + c] = 1;
}
const {fixture,connected,pipeInterior}=require('./water-machines-geometry-fixture.cjs');
for (const world of worlds) for (const seed of seeds) for (const name of ['siphon', 'cup', 'heron']) {
  const f = fixture(name, world, seed), d = f.definition;
  check(f.points.length > 0, 'initial water exists');
  check(d.caption.split(/[.!?]+/).filter(sentence => sentence.trim()).length === 2, 'two caption sentences');
  for (const part of f.builder.getParts().filter(part => part.type === 'pipe')) {
    const requested = d.pipes.find(pipe => JSON.stringify(pipe.points) === JSON.stringify(part.points));
    check(!!requested, 'builder uses the exact declared pipe points');
  }
  for (let r = 0; r < f.height; r++) for (let c = 0; c < f.width; c++) if (r === 0 || c === 0 || r === f.height - 1 || c === f.width - 1) check(f.walls[r * f.width + c] === 1, 'permanent border retained');
  let extra = {};
  if (name === 'siphon') {
    check(d.parts[0].open === false, 'stock primary valve starts closed');
    const open = fixture(name, world, seed, { open: true });
    check(open.definition.parts[0].open, 'a distinct physical open initial state is available');
    const pipe = d.pipes[0];
    const waterBlocked = Uint8Array.from(open.walls, (solid, i) => solid || !open.liquid[i] ? 1 : 0);
    const filled = connected(waterBlocked, f.width, f.height, f.index(pipe.points[0].x, pipe.points[0].y));
    check(filled.has(f.index(pipe.points[pipe.points.length - 1].x, pipe.points[pipe.points.length - 1].y)), 'primed water is continuous through the crest');
    check(d.measure.crest < d.marks[0].y, 'crest is above source water');
    const seat = d.parts[0].rect, row = seat.y / 8, c0 = seat.x / 8;
    check(f.walls[row * f.width + c0] === 0 && f.walls[row * f.width + c0 + 2] === 0, 'seat spans the actual clear bore');
    check(f.walls[row * f.width + c0 - 1] === 1 && f.walls[row * f.width + c0 + 3] === 1, 'seat reaches both pipe walls');
    check(d.parts[0].direction==='down' && seat.x+12===pipe.points.at(-1).x, 'manual valve holds the outlet leg rather than isolating the intake');
    const heldWater = Uint8Array.from(f.blocked,(solid,i)=>solid || !f.liquid[i] ? 1 : 0);
    const heldPrimer = connected(heldWater,f.width,f.height,f.index(pipe.points[0].x,pipe.points[0].y));
    check(heldPrimer.has(f.index(pipe.points[1].x,pipe.points[1].y)), 'closed outlet preserves the source-connected crest primer');
    check(!heldPrimer.has(f.index(pipe.points.at(-1).x,pipe.points.at(-1).y)), 'closed outlet physically blocks release of the primer');
    const room = connected(f.gasBlocked, f.width, f.height, f.width + 1);
    const source = d.measure.source;
    let openHeadspace = 0;
    for(let y=source.y+4;y<d.measure.sourceLevel;y+=8)for(let x=source.x+12;x<source.x+source.width-8;x+=8){
      const i=f.index(x,y);if(f.gasBlocked[i])continue;
      openHeadspace++;check(room.has(i), 'every free source headspace cell is open to room air');
    }
    check(openHeadspace>0, 'source has a vented gas space above its water');
    extra = { openParticles: open.points.length, crest: d.measure.crest, sourceLevel: d.marks[0].y, seat };
  } else if (name === 'cup') {
    const cup = d.measure.source, level = d.initial[0].rect.y;
    const waterSide = f.index(cup.x + 12, level + 12), receiver = f.index(d.measure.receiver.x + 12, d.measure.receiver.y + 12);
    const held = connected(f.walls, f.width, f.height, waterSide, i => (Math.floor(i / f.width) + .5) * 8 >= level);
    check(!held.has(receiver), 'no downhill geometry leak before the bend floods');
    const flooded = connected(f.walls, f.width, f.height, waterSide, i => (Math.floor(i / f.width) + .5) * 8 >= d.measure.trigger - 8);
    check(flooded.has(receiver), 'raising water over the bend opens the same physical route');
    const stemX = d.measure.outlet.x;
    check(!f.liquid[f.index(stemX, Math.min(cup.y + cup.height - 24, level + 24))], 'descending stem starts dry');
    check(d.slimes[0].radius > 12, 'passive slime has a useful physical size');
    const outlet = d.pipes[0].points.at(-1), elbow = d.pipes[0].points.at(-2);
    check(outlet.y > elbow.y && outlet.x === elbow.x, 'cup outlet descends straight from the crest');
    for(let y=d.measure.trigger+4;y<d.measure.outlet.y;y+=8){
      check(!f.walls[f.index(stemX,y)], 'straight stem has an open continuous bore');
      check(f.walls[f.index(stemX-8,y)] && f.walls[f.index(stemX+8,y)], 'straight stem is one wall cell wide throughout');
    }
    check(outlet.x + d.pipes[0].bore / 2 + 8 < world.w - 8, 'outlet wall fits inside the permanent border');
    const shelf = d.solids.filter(r => r.y + r.height < d.measure.intake.y);
    check(shelf.length > 0 && shelf.every(r => r.y + r.height < d.measure.intake.y - 8), 'shelf leaves an open intake plenum');
    const plenum = connected(f.walls, f.width, f.height, f.index(cup.x + 12, cup.y + cup.height - 20),
      i => (Math.floor(i / f.width) + .5) * 8 > shelf[0].y + 8);
    check(plenum.has(f.index(d.measure.intake.x, d.measure.intake.y)), 'water below a resting slime can reach the intake');
    check(shelf.every(r => f.walls[f.index(r.x + 4, r.y + 4)] &&
      (!f.walls[f.index(r.x + r.width + 4, r.y + 4)] || !f.walls[f.index(r.x - 4, r.y + 4)])),
      'every shelf slat has the declared physical wall and an adjacent open slot');
    extra = { holdLevel: level, trigger: d.measure.trigger, slime: d.slimes[0], floor: cup.y + cup.height - 8 };
  } else {
    const air = d.pipes.find(pipe => pipe.id === 'air-link'), waterPipes = d.pipes.filter(pipe => pipe.id !== 'air-link');
    const airInterior = pipeInterior(air, world);
    for (const pipe of waterPipes) {
      const wetInterior = pipeInterior(pipe, world);
      check(!Array.from(airInterior).some(i => wetInterior.has(i)), 'dry gas tube does not intersect a water pipe');
    }
    const pocket = connected(f.gasBlocked, f.width, f.height, f.index(air.points[0].x, air.points[0].y));
    check(pocket.has(f.index(air.points[air.points.length - 1].x, air.points[air.points.length - 1].y)), 'both gas spaces share the dry physical link');
    check(!pocket.has(f.width + 1), 'connected gas pocket is sealed from the room');
    const sourceFill = d.initial.find(shape => shape.vessel === 'middle').rect, bottomFill = d.initial.find(shape => shape.vessel === 'bottom').rect;
    const sourceWaterArea = f.points.filter(p => p.x >= sourceFill.x && p.x < sourceFill.x + sourceFill.width && p.y >= sourceFill.y && p.y < sourceFill.y + sourceFill.height).length * 1.25 ** 2;
    const gasMouthBottom = air.points[0].y + air.bore * .5;
    const receivingCapacity = (bottomFill.y - gasMouthBottom) * (d.measure.bottom.width - 16);
    check(receivingCapacity > sourceWaterArea, 'bottom has capacity below its gas mouth for the source water');
    const basinLevel = d.initial.find(shape => shape.vessel === 'basin').rect.y;
    const idealHead = bottomFill.y - basinLevel + d.measure.nozzle.y - sourceFill.y;
    check(idealHead > 0, 'initial two-head fountain prediction is positive');
    extra = { gasCells: pocket.size, sourceWaterArea, receivingCapacity, idealHead, gasBore: air.bore };
  }
  results.push({ name, world, seed, particles: f.points.length, ...extra });
}
const variantWorld = { w: 960, h: 576 }, variants = [];
for(const setup of ['filled','empty','raised']){
  const f=fixture('siphon',{w:1120,h:664},17,{setup}),d=f.definition;
  check(d.setup===setup,'Siphon setup is retained by the definition');
  check(d.pipes[0].primed===(setup!=='empty'),'Empty setup seeds no tube primer');
  check(d.initial.some(s=>s.kind==='pipe')===(setup!=='empty'),'Priming uses actual initial water');
  check((d.measure.outlet.y>d.measure.sourceLevel)===(setup!=='raised'),'Raised setup reverses the head');
  check(d.settings.particlePressure && d.settings.boundaryReconstruction && d.settings.redBlack,
    'Siphon opts into the coupled native pressure transfer');
  if(setup==='empty')check(!f.liquid[f.index(d.pipes[0].points[1].x,d.measure.crest)],'The empty crest remains air');
  check(d.caption.split(/[.!?]+/).filter(s=>s.trim()).length===2,'Every setup has two caption sentences');
}
assert.throws(()=>Scenes.make('siphon',{w:1120,h:664},{setup:'unknown'}));checks++;
for(const world of worlds)for(const bore of [8,16,24,32]){
  const f=fixture('cup',world,17,{bore}),m=f.definition.measure;
  const start=f.index(m.source.x+12,m.sourceLevel+12),end=f.index(m.receiver.x+12,m.receiver.y+12);
  check(!connected(f.walls,f.width,f.height,start,i=>(Math.floor(i/f.width)+.5)*8>=m.sourceLevel).has(end),
    'every supported cup bore holds below its line');
  check(connected(f.walls,f.width,f.height,start,i=>(Math.floor(i/f.width)+.5)*8>=m.sourceLevel-8).has(end),
    'every supported cup bore connects to the receiver above its bend');
  check(f.definition.solids.every(r=>r.width>0 && r.height>0),'cup bore never creates an empty wall rectangle');
}
for (const seed of seeds) {
  const base = fixture('siphon', variantWorld, seed, { open: true });
  const head = base.definition.measure.outlet.y - base.definition.measure.sourceLevel;
  const half = fixture('siphon', variantWorld, seed, { open: true, outletHeight: base.definition.measure.sourceLevel + head * .5 - 4 });
  const halfHead = half.definition.measure.outlet.y - half.definition.measure.sourceLevel;
  check(Math.abs(head / halfHead - 2) < .1, 'outlet-height pair provides approximately doubled geometric head');
  const lowerSource = fixture('siphon', variantWorld, seed, { open: true, sourceLevel: base.definition.measure.sourceLevel + 32 });
  check(lowerSource.definition.measure.sourceLevel === base.definition.measure.sourceLevel + 32, 'source-level variant changes only the physical initial fill');
  check(JSON.stringify(lowerSource.definition.pipes) === JSON.stringify(base.definition.pipes), 'source-level variant preserves the physical pipe');
  const raisedOutlet = fixture('siphon', variantWorld, seed, { open: true, outletHeight: base.definition.measure.sourceLevel - 12 });
  check(raisedOutlet.definition.measure.outlet.y < raisedOutlet.definition.measure.sourceLevel, 'raised outlet permits a reversed geometric head test');
  const fountain = fixture('heron', variantWorld, seed);
  const short = fixture('heron', variantWorld, seed, { bottomHeight: fountain.definition.measure.bottomHeight - 32 });
  check(short.definition.measure.bottom.height === fountain.definition.measure.bottom.height - 32, 'Heron variant physically raises receiving floor and initial surface');
  check(short.definition.measure.bottom.y === fountain.definition.measure.bottom.y, 'Heron receiving top and dry gas mouth stay fixed');
  const gas = short.definition.pipes.find(pipe => pipe.id === 'air-link');
  const pocket = connected(short.gasBlocked, short.width, short.height, short.index(gas.points[0].x, gas.points[0].y));
  check(pocket.has(short.index(gas.points.at(-1).x, gas.points.at(-1).y)) && !pocket.has(short.width + 1), 'Heron variant retains the shared sealed gas path');
  variants.push({seed,baseHead:head,halfHead,raisedHead:raisedOutlet.definition.measure.outlet.y-raisedOutlet.definition.measure.sourceLevel,bottomHeight:fountain.definition.measure.bottomHeight,shortBottomHeight:short.definition.measure.bottomHeight});
}
const finiteWorld={w:1600,h:512},finiteOptions={
  source:{x:16,y:112,width:1528,height:96},receiver:{x:16,y:288,width:1576,height:176},
  inletX:1484,outletX:1564,sourceLevel:120,crest:84,outletHeight:316,bore:16
},finiteResults=[];
for(const seed of seeds)for(const open of [false,true]){
  const f=fixture('siphon',finiteWorld,seed,{...finiteOptions,open}),d=f.definition;
  check(f.points.length>0 && f.points.length<100000,'finite apparatus has nonempty untruncated inventory below the native budget');
  check(d.measure.source.width===finiteOptions.source.width && d.measure.receiver.width===finiteOptions.receiver.width,'custom finite reservoir options preserve their requested dimensions');
  check(JSON.stringify(d.parts[0].rect)===JSON.stringify({x:1560,y:296,width:16,height:8}),'finite valve covers the actual asymmetric bore');
  check(d.meters[0].a.y===80 && d.meters[0].b.y===96,'finite meter uses the entire clear bore');
  const wet=Uint8Array.from(f.blocked,(solid,i)=>solid || !f.liquid[i] ? 1 : 0),
    route=d.pipes[0].points,path=connected(wet,f.width,f.height,f.index(route[0].x,route[0].y));
  check(path.has(f.index(route[1].x,route[1].y)),'finite primer reaches the crest with either seat state');
  check(path.has(f.index(route.at(-1).x,route.at(-1).y))===open,'finite outlet seat controls the physical wet path');
  const room=connected(f.gasBlocked,f.width,f.height,f.width+1);
  for(const r of [d.measure.source,d.measure.receiver]){
    const level=r===d.measure.source ? d.measure.sourceLevel : r.y+r.height-8;
    for(let y=r.y+4;y<level;y+=8)for(let x=r.x+12;x<r.x+r.width-8;x+=8){
      const i=f.index(x,y);if(!f.gasBlocked[i])check(room.has(i),'finite source and receiver gas spaces reach the room');
    }
  }
  const share=f.builder.share('https://example.test/toy'),restored=Builder.decode(share);
  check(restored.width===200 && restored.height===64,'finite shared grid preserves original dimensions');
  const cloneWalls=new Uint8Array(200*64);border(cloneWalls,200,64);
  const clone=Builder.create({width:200,height:64,tile:8,walls:cloneWalls});clone.fromShare(share);
  check(Buffer.from(clone.walls).equals(Buffer.from(f.walls)) &&
    JSON.stringify(clone.getParts())===JSON.stringify(f.builder.getParts()),'finite share preserves exact walls and parts');
  finiteResults.push({seed,open,particles:f.points.length,tokenLength:new URL(share).searchParams.get('build').length});
}
for(const options of [
  {source:{...finiteOptions.source,width:1600}},
  {source:{...finiteOptions.source,x:NaN}},
  {receiver:{...finiteOptions.source}},
  {inletX:24},{outletX:1596},{outletX:500},{bore:8},{bore:40},{bore:Infinity},{crest:100}
]){
  assert.throws(()=>Scenes.make('siphon',finiteWorld,{...finiteOptions,...options}));checks++;
}
for(const [name, options] of [['siphon',{sourceLevel:NaN}],['siphon',{outletHeight:Infinity}],['siphon',{sourceLevel:560}],['siphon',{outletHeight:560}],['heron',{bottomHeight:Infinity}],['heron',{bottomHeight:16}],['heron',{bottomHeight:560}]]) {
  assert.throws(()=>Scenes.make(name,variantWorld,options)); checks++;
}
const output = process.env.DUMP;
if (output) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'GEOMETRY_FIXTURES.json'), JSON.stringify({ kind: 'CPU geometry/initialization only, no fluid acceptance', pitch: 1.25, wallTile: 8, seeds, checks, results, variants, finiteResults }, null, 2) + '\n');
}
console.log('PASS declarative machine geometry: ' + results.length + ' fixtures, three seeds, six worlds, bounds/valve/priming/gas/cup checks.');
console.log('PASS finite siphon apparatus: '+finiteResults.length+' seed/seat fixtures, asymmetric bore, room connection, capacity and exact sharing.');
console.log('These checks do not establish flow, displacement, fountain startup or 95 percent drainage.');

// Screen y increases downward. A raised crest must use a smaller y and
// leave the initial free surface physically below the trigger.
const raisedCup=fixture('cup',{w:1120,h:664},17,{crest:84,level:192});
const stockCup=fixture('cup',{w:1120,h:664},17);
check(raisedCup.definition.measure.crest<stockCup.definition.measure.crest,'raised bend is physically higher');
check(raisedCup.definition.measure.sourceLevel>raisedCup.definition.measure.trigger,'raised bend starts above the source surface');
check(raisedCup.definition.measure.trigger<raisedCup.definition.measure.source.y,'raised bend is above the open cup rim');
console.log('Raised cup control uses a higher physical crest with an initially dry route.');
