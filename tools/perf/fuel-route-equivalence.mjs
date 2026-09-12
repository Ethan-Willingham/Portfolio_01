import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const file='js/sluice/040-init-resize-resolution.js';
const before=execFileSync('git',['show',(process.env.BASE_REF||'2b587fb')+':'+file],{cwd:root,encoding:'utf8'}),after=fs.readFileSync(path.join(root,file),'utf8');
function engine(source){
  const c=vm.createContext({TILE:32,COLS:80,TOTAL_ROWS:180,SKY_ROWS:4,DECK_ROW:4,PLAYER_H:22,PLAYER_W:30,FUEL_DRAIN:.3,DRILL_FUEL:2.5,DRILL_TIME:.3,performance,player:{x:0,y:0},world:[],speed:180});
  vm.runInContext('function tileAt(r,c){return world[r][c];} function getUndergroundClimbSpeed(){return speed;}',c);
  vm.runInContext(source.slice(source.indexOf('  var _ftsValue'),source.indexOf('  /* ---- Resize ----')),c);return c;
}
let seed=7821;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const a=engine(before),b=engine(after);let checks=0;
for(let scene=0;scene<120;scene++){
  const world=Array.from({length:180},(_,r)=>Array.from({length:80},()=>r<4||rand()<.35?null:{type:rand()<.07?'bedrock':'stone',hp:rand()<.02?999999:10}));
  a.world=b.world=world;a.speed=b.speed=80+scene*3;
  for(let step=0;step<5;step++){
    a.player=b.player={x:(1+Math.floor(rand()*77))*32,y:Math.floor(rand()*178)*32};
    assert.equal(b.computeFuelToSurface(),a.computeFuelToSurface(),'same estimate across terrain/position changes');checks++;
    world[4+scene%170][step+1]=null;
  }
}
// Epoch rollover must not revive stale closed cells.
b.ftsEpoch=2147483646;assert.equal(b.computeFuelToSurface(),a.computeFuelToSurface());
console.log('PASS: '+checks+' route estimates and epoch rollover match the original search exactly.');
