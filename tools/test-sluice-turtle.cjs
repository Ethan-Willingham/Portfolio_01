// Actual turtle source: rarity, ground boundaries, departure and world resets.
var fs = require('node:fs'), path = require('node:path');
var vm = require('node:vm'), assert = require('node:assert/strict');
var root = path.resolve(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/sluice/167-surface-turtle.js'), 'utf8');
var treeSource = fs.readFileSync(path.join(root, 'js/sluice/165-render-trees.js'), 'utf8');
function fixture() {
  var c = { Math:Math, isFinite:isFinite, window:{}, COLS:320, TILE:32, SKY_ROWS:4, REGION_TOWN:1,
    PLAYER_W:24, PLAYER_H:26, screenW:800, screenH:600,
    cam:{x:3000,y:-200}, player:{x:3500,y:102,vx:0}, pondCols:new Set(), holes:new Set(), foundations:new Set(),
    world:[], tileAt:function(r,col){return c.holes.has(col)?null:{type:c.foundations.has(col)?'foundation':'dirt'};},
    regionAt:function(){return {kind:1};}, treesInPond:function(col){return c.pondCols.has(col);}
  };
  vm.createContext(c);
  vm.runInContext(treeSource.match(/  function treesHash\(n\) \{[\s\S]*?\n  \}/)[0]+source,c);
  c.surfaceTurtleUpdate(.01); return c;
}
function advance(c,seconds) { for(var i=0;i<Math.round(seconds*60);i++)c.surfaceTurtleUpdate(1/60); }
var c=fixture(), initial=c.surfaceTurtleWait;
assert(initial>=38&&initial<=68,'First sighting is delayed');
c.cam.y=200;advance(c,120);assert.equal(c.surfaceTurtleWait,initial,'Underground time does not advance encounter clock');
c.cam.y=-200;advance(c,initial-.2);assert.equal(c.surfaceTurtle.active,false,'No immediate spawn');
advance(c,.3);assert(c.surfaceTurtle.active,'A surface encounter eventually starts');
var t=c.surfaceTurtle, start=t.x, dir=t.dir;
assert(start<c.cam.x||start>c.cam.x+c.screenW,'Turtle enters from outside the view');
advance(c,5);assert((t.x-start)*dir>10,'Turtle walks into the view at a gentle pace');
var x=t.x;c.player.x=x-12;c.player.vx=180;advance(c,.2);
assert(t.shy>0&&Math.abs(t.x-x)<1,'Nearby fast rig makes the turtle tuck and stop');
c.player.x=3500;c.player.vx=0;advance(c,3);assert.equal(t.shy,0,'Turtle untucks after a pass');
// Entire footprint must be supported, including a tile under just one foot.
t.x=3200-4;var edgeCol=Math.floor((t.x+6)/32);
c.holes.add(edgeCol);assert.equal(c.surfaceTurtleCanStand(t.x),false,'Footprint rejects partial support');
c.surfaceTurtleUpdate(.02);assert.equal(t.active,false,'Excavation never leaves a hovering turtle');
assert(c.surfaceTurtleWait>=120&&c.surfaceTurtleWait<=220,'Long quiet interval follows departure');
var d=fixture();d.surfaceTurtleSpawn();var u=d.surfaceTurtle;
u.x=3200-10;u.dir=1;d.holes.add(100);advance(d,.6);
assert(u.dir<0&&u.x+6<3200,'Turtle turns before stepping into a pit');
advance(d,2);assert(u.x<3190,'Turtle walks away after inspecting the edge');
d.holes.clear();d.pondCols.add(100);assert(!d.surfaceTurtleCanStand(3204),'No pond-bank walking');
d.pondCols.clear();d.foundations.add(100);assert(!d.surfaceTurtleCanStand(3204),'No station foundation spawn');
var e=fixture();e.surfaceTurtleSpawn();advance(e,100);
assert.equal(e.surfaceTurtle.active,false,'An undisturbed visit ends beyond the screen edge');
var f=fixture();f.surfaceTurtleSpawn();f.world=[];f.surfaceTurtleUpdate(.01);
assert.equal(f.surfaceTurtle.active,false,'World replacement clears the old visitor');
assert(f.surfaceTurtleWait>=38,'A new world restarts the rarity delay');
var g=fixture();var wait=g.surfaceTurtleWait;
g.surfaceTurtleUpdate(NaN);g.surfaceTurtleUpdate(Infinity);g.surfaceTurtleUpdate(-1);
assert.equal(g.surfaceTurtleWait,wait,'Invalid time steps do not corrupt state');
g.surfaceTurtleUpdate(600);assert(wait-g.surfaceTurtleWait<=.051,'Long frame hitch is bounded');
console.log('Turtle rarity, entry, walking, rig response, ground edges, departure and reset checks passed.');
