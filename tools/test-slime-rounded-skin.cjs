// Geometry safeguards for the shared game/demo skin. No browser or live save.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const jello = fs.readFileSync(path.join(root, 'js/sluice/340-jello.js'), 'utf8');
const surface = fs.readFileSync(path.join(root, 'js/sluice/347-surface-slimes.js'), 'utf8');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/slime-skin-poses.json'))).poses;
function between(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}
class Curve {
  constructor() { this.points = []; }
  moveTo(x, y) { this.last = [x, y]; }
  quadraticCurveTo(cx, cy, x, y) {
    const [sx, sy] = this.last;
    for (let k = 0; k < 64; k++) {
      const t = k / 64, u = 1 - t;
      this.points.push([u*u*sx + 2*u*t*cx + t*t*x, u*u*sy + 2*u*t*cy + t*t*y]);
    }
    this.last = [x, y];
  }
  closePath() {}
}
const w = vm.createContext({ Path2D: Curve, jelloContactAlloc() {},
  skySlimeClamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  jelloROX: new Float64Array(6000), jelloROY: new Float64Array(6000),
  jelloRSX: new Float64Array(6000), jelloRSY: new Float64Array(6000),
  TILE: 32, JELLO_NPT: 3, JELLO_RENDER_OUTSET: 1, JELLO_CONTACT_R_FRAC: .5,
  JELLO_RIPPLE: 0, JELLO_EDGE_STYLE: 1, JELLO_MAX_POINTS: 6000 });
vm.runInContext(between(jello, '  function jelloRingBake(b)', '  function jelloRingPath(') +
  between(surface, '  var SURFACE_SLIME_ROUND_SKIN', '  function surfaceSlimeDraw(b)'), w);
function body(points, scale = 1, angle = 0) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const pts = points.map(([x,y]) => [(x*c-y*s)*scale, (x*s+y*c)*scale]);
  return { n: pts.length, ringN: pts.length, ring: pts.map((_, i) => i),
    px: Float64Array.from(pts, p => p[0]), py: Float64Array.from(pts, p => p[1]),
    ox: Float64Array.from(pts, p => p[0] - .13), oy: Float64Array.from(pts, p => p[1] + .07),
    cx: 0, cy: 0, spacing: 8 * scale, ringSign: 1, surfaceSlime: { radius: 25 * scale } };
}
function draw(b, enabled) {
  const physics = [b.px, b.py, b.ox, b.oy].map(a => Buffer.from(a.buffer).toString('hex'));
  w.SURFACE_SLIME_ROUND_SKIN = enabled;
  w.jelloRingBake(b);
  const curve = w.surfaceSlimeSkinPath().points;
  assert.deepEqual([b.px, b.py, b.ox, b.oy].map(a => Buffer.from(a.buffer).toString('hex')), physics, 'drawing preserves every physical bit');
  assert(curve.every(p => p.every(Number.isFinite)), 'finite drawn curve');
  return curve;
}
function area(points) {
  return Math.abs(points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]; return sum + a[0]*b[1] - a[1]*b[0];
  }, 0) / 2);
}
function resample(points, step) {
  const lengths = points.map((p,i) => Math.hypot(p[0]-points[(i+1)%points.length][0], p[1]-points[(i+1)%points.length][1]));
  const perimeter = lengths.reduce((a,b) => a+b,0), count = Math.ceil(perimeter / step), out = [];
  let edge = 0, travelled = 0;
  for(let k=0;k<count;k++) {
    const distance=k*perimeter/count;
    while(edge<points.length-1 && travelled+lengths[edge]<distance)travelled+=lengths[edge++];
    const t=lengths[edge]?(distance-travelled)/lengths[edge]:0, a=points[edge],b=points[(edge+1)%points.length];
    out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
  return out;
}
// Turn over a fixed visible distance, so clustered parametric samples cannot
// hide a sharp bend by taking vanishingly small steps around it.
function sharpest(points) {
  const p=resample(points,1);
  return Math.max(...p.map((b,i)=>{
    const a=p[(i+p.length-1)%p.length],c=p[(i+1)%p.length];
    const ax=b[0]-a[0],ay=b[1]-a[1],bx=c[0]-b[0],by=c[1]-b[1];
    return Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1))))*180/Math.PI;
  }));
}
const circle=Array.from({length:18},(_,i)=>[24*Math.cos(i*Math.PI/9),24*Math.sin(i*Math.PI/9)]);
const rows=[];
for(const fixture of [{name:'round',points:circle},...fixtures]) {
  const b=body(fixture.points),before=draw(b,false),after=draw(b,true);
  const ratio=area(after)/area(before),oldTurn=sharpest(before),newTurn=sharpest(after);
  assert(ratio>.97&&ratio<1.01,fixture.name+' retains visible area');
  assert.equal(after.length,b.ringN*128,'fixed draw complexity');
  for(let k=0;k<b.ringN;k++) {
    const weights=Array.from(b.surfaceSlime.skinRoundWeights.slice(k*6,k*6+6));
    assert(weights.every(v=>v>=0&&v<=1),'no extrapolating filter weights');
    assert(Math.abs(weights.reduce((a,c)=>a+c,0)-1)<1e-12,'material weights sum to one');
  }
  const rotated=draw(body(fixture.points,2,.73),true),c=Math.cos(.73),s=Math.sin(.73);
  assert(Math.max(...after.map(([x,y],i)=>Math.hypot(rotated[i][0]-2*(x*c-y*s),rotated[i][1]-2*(x*s+y*c))))<1e-9,'scale and rotation do not change the smoothing');
  const reverse=draw(body(fixture.points.slice().reverse()),true);
  assert(Math.abs(area(reverse)-area(after))<1e-4,'both windings preserve area within dense-curve integration error');
  rows.push({name:fixture.name,areaRatio:ratio,beforeTurnDegrees:oldTurn,afterTurnDegrees:newTurn});
}
for(const points of [Array.from({length:18},()=>[0,0]),circle.map(([x])=>[x,0]),circle.map((p,i)=>i%3?p:circle[(i+1)%18])])draw(body(points),true);
const ordinary=body(circle);delete ordinary.surfaceSlime;
assert.deepEqual(draw(ordinary,false),draw(ordinary,true),'non-resident jello keeps its existing skin');
const membrane=body(fixtures[3].points);membrane.surfaceSlime.skinRoundingLocked=true;
assert.deepEqual(draw(membrane,false),draw(membrane,true),'physical membrane geometry stays unchanged');
for(const name of ['flung-tip','bunched-landing']) {
  const row=rows.find(r=>r.name===name);
  assert(row.afterTurnDegrees<row.beforeTurnDegrees*.7,name+' removes at least 30% of the sharpest visible turn');
}
console.log(JSON.stringify({pass:true,rows},null,2));
