'use strict';
const assert=require('node:assert/strict');
const Builder=require('../js/water-machines-builder.js');
const Scenes=require('../js/water-machines-scenes.js');
function border(walls, width, height) {
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) if (c === 0 || r === 0 || c === width - 1 || r === height - 1) walls[r * width + c] = 1;
}
function connected(blocked, width, height, start, predicate = () => true) {
  const seen = new Set(), stack = [start];
  while (stack.length) {
    const i = stack.pop(); if (i < 0 || i >= blocked.length || blocked[i] || seen.has(i) || !predicate(i)) continue;
    seen.add(i); const c = i % width, r = Math.floor(i / width);
    if (c > 0) stack.push(i - 1); if (c < width - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - width); if (r < height - 1) stack.push(i + width);
  }
  return seen;
}
function fixture(name, world, seed, options = {}) {
  const tile = 8, width = Math.ceil(world.w / tile), height = Math.ceil(world.h / tile);
  const walls = new Uint8Array(width * height); border(walls, width, height);
  const builder = Builder.create({ width, height, tile, walls });
  const definition = Scenes.make(name, { ...world, tile }, { ...options, seed });
  builder.begin('construct');
  definition.vessels.forEach(v => builder.vessel(v.rect, v.sealed));
  definition.pipes.forEach(p => builder.strokePipe(p.points, p.bore));
  (definition.solids || []).forEach(r => builder.vent(r, false));
  (definition.vents || []).forEach(r => builder.vent(r, true));
  definition.parts.forEach(part => {
    const settings = { rect: part.rect, direction: part.direction, open: part.open };
    builder.addPart(part.type === 'valve' ? 'flap' : part.type, settings);
  });
  builder.commit();
  const index = (x, y) => Math.floor(y / tile) * width + Math.floor(x / tile);
  const blocked = walls.slice();
  definition.parts.filter(part => !part.open).forEach(part => {
    const r = part.rect;
    for (let row = r.y / tile; row < (r.y + r.height) / tile; row++) for (let col = r.x / tile; col < (r.x + r.width) / tile; col++) blocked[row * width + col] = 1;
  });
  const liquid = new Uint8Array(walls.length), points = [], pitch = 1.25;
  const collisionRadius=2.5*.5*.85,seedRadius=collisionRadius+.0625;
  function clearFootprint(x,y,radius){
    for(let row=Math.floor((y-radius)/tile);row<=Math.floor((y+radius)/tile);row++)
      for(let col=Math.floor((x-radius)/tile);col<=Math.floor((x+radius)/tile);col++)if(blocked[row*width+col]){
        const dx=Math.max(col*tile-x,0,x-(col+1)*tile),dy=Math.max(row*tile-y,0,y-(row+1)*tile);
        if(dx*dx+dy*dy<radius*radius)return false;
      }
    return true;
  }
  let randomState = seed >>> 0;
  function random() { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; }
  for (let y = tile + pitch * .5; y < world.h - tile; y += pitch) for (let x = tile + pitch * .5; x < world.w - tile; x += pitch) {
    if (walls[index(x, y)] || !definition.initial.some(shape => Scenes.contains(shape, x, y))) continue;
    const px = x + (random() - .5) * .12, py = y + (random() - .5) * .12;
    if(!clearFootprint(px,py,seedRadius))continue;
    assert.ok(!blocked[index(px, py)], 'seed perturbation stays out of solids');
    for(let row=Math.floor((py-collisionRadius)/tile);row<=Math.floor((py+collisionRadius)/tile);row++)
      for(let col=Math.floor((px-collisionRadius)/tile);col<=Math.floor((px+collisionRadius)/tile);col++)if(blocked[row*width+col]){
        const dx=Math.max(col*tile-px,0,px-(col+1)*tile),dy=Math.max(row*tile-py,0,py-(row+1)*tile);
        assert.ok(dx*dx+dy*dy>=collisionRadius*collisionRadius,'complete initialized collision footprint clears every solid tile '+JSON.stringify({name,world,seed,px,py,row,col,distance:Math.hypot(dx,dy),collisionRadius}));
      }
    liquid[index(px, py)] = 1; points.push({ x: px, y: py });
  }
  const gasBlocked = Uint8Array.from(blocked, (solid, i) => solid || liquid[i] ? 1 : 0);
  return { definition, walls, blocked, builder, width, height, tile, index, points, liquid, gasBlocked,collisionRadius,seedRadius };
}
function pipeInterior(pipe, world) {
  const width = Math.ceil(world.w / 8), height = Math.ceil(world.h / 8), walls = new Uint8Array(width * height); walls.fill(1);
  Builder.create({ width, height, tile: 8, walls }).strokePipe(pipe.points, pipe.bore);
  return new Set(Array.from(walls, (value, index) => value ? -1 : index).filter(index => index >= 0));
}
module.exports={fixture,connected,pipeInterior};
