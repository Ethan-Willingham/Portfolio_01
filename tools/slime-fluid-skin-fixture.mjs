// Production render-path oracle and small, deterministic fluid fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

export function polygonTest(points, x, y) {
  let inside = false, distance2 = Infinity, nearest;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const qx = a[0] + dx * t, qy = a[1] + dy * t, d2 = (qx - x) ** 2 + (qy - y) ** 2;
    if (d2 < distance2) { distance2 = d2; nearest = { x: qx, y: qy, edge: j, t }; }
  }
  return { inside, distance: Math.sqrt(distance2), nearest };
}

export function makeSkinFixtures(root) {
  const files = ['js/sluice/340-jello.js', 'js/sluice/347-surface-slimes.js', 'js/sluice/347-slime-fluid-skin.js'];
  const texts = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  const hashes = Object.fromEntries(files.map((file, i) => [file, createHash('sha256').update(texts[i]).digest('hex')]));
  const between = (text, a, b) => { assert.equal(text.split(a).length, 2, a); assert.equal(text.split(b).length, 2, b); return text.slice(text.indexOf(a), text.indexOf(b)); };
  class RecordedPath {
    constructor() { this.points = []; this.segments = []; }
    moveTo(x, y) { this.current = [x, y]; this.points.push([x, y]); }
    quadraticCurveTo(cx, cy, x, y) {
      const [sx, sy] = this.current;
      this.segments.push([[sx,sy],[cx,cy],[x,y]]);
      for (let k = 1; k <= 96; k++) { const t = k / 96, u = 1 - t; this.points.push([u*u*sx+2*u*t*cx+t*t*x, u*u*sy+2*u*t*cy+t*t*y]); }
      this.current = [x, y];
    }
    closePath() {}
  }
  const context = vm.createContext({ Path2D: RecordedPath, console, skySlimeClamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    jelloContactAlloc() {}, jelloROX: new Float64Array(6000), jelloROY: new Float64Array(6000),
    jelloRSX: new Float64Array(6000), jelloRSY: new Float64Array(6000), jelloRingBakeN: 0,
    TILE: 32, jelloFrameNo: 7, jelloAccum: 1/480, jelloStepH: 1/240,
    softWorldBody: b => !!b.physical, softWorldWaterScale: () => 1,
    liquidWorldSolidAt: () => false });
  for (const name of ['JELLO_NPT','JELLO_MAX_POINTS','JELLO_H','JELLO_TIMESCALE','JELLO_CONTACT_R_FRAC','JELLO_RENDER_OUTSET','JELLO_EDGE_STYLE','JELLO_RIPPLE']) {
    const match = texts[0].match(new RegExp('var '+name+'\\s*=\\s*([^;]+);')); assert(match, name);
    context[name] = vm.runInContext(match[1], context);
  }
  const draw = between(texts[1], '  function surfaceSlimeDraw(b)', '    var r = m.radius, hue = m.hue;') + '    return path;\n  }';
  vm.runInContext(between(texts[0], '  function jelloRingBake(b)', '  function jelloRingPath(b, target)') +
    between(texts[1], '  function surfaceSlimeRenderBody(b)', '  function surfaceSlimeDraw(b)') + draw + texts[2], context);
  function body(options = {}) {
    const n = 37, px = new Float64Array(n), py = new Float64Array(n), ox = new Float64Array(n), oy = new Float64Array(n);
    const sign = options.reverse ? -1 : 1, cx = options.cx ?? 100, cy = options.cy ?? 100;
    const previousX = new Float64Array(n), previousY = new Float64Array(n), rippleU = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = sign * i * Math.PI * 2 / n, r = options.foldedCusp && i===0 ? -75 : (options.radius ?? 25) * (1 + (options.deform ?? 0) * Math.cos(3*a));
      px[i] = cx + Math.cos(a) * r * (options.squash ?? 1); py[i] = cy + Math.sin(a) * r;
      if (options.notch) px[i] -= 17 * Math.exp(-((a / .38) ** 2));
      const vx = options.varyVelocity ? 36 + 15 * Math.sin(a) : 36, vy = options.varyVelocity ? -12 + 9 * Math.cos(a) : -12;
      ox[i] = px[i] - vx * context.JELLO_H / context.JELLO_TIMESCALE; oy[i] = py[i] - vy * context.JELLO_H / context.JELLO_TIMESCALE;
      previousX[i] = px[i] - 5 - 2*Math.cos(2*a); previousY[i] = py[i] + 3;
      rippleU[i] = 1.2*Math.sin(5*a);
    }
    return { n, ringN:n, ring:Array.from({length:n}, (_, i) => i), px,py,ox,oy,cx,cy,spacing:32/3,ringSign:sign,
      bboxL:Math.min(...px),bboxR:Math.max(...px),bboxT:Math.min(...py),bboxB:Math.max(...py),
      physical:true,rippleOn:!!options.ripple,rippleU,vx:72,vy:-24,
      surfaceSlime:{radius:25, ...(options.interp ? {previousX,previousY,renderFrame:7} : {})} };
  }
  function geometry(options) {
    context.JELLO_RIPPLE = options.ripple ? .8 : 0; context.JELLO_EDGE_STYLE = options.noChamfer ? 0 : 1;
    const b = body(options), original = [b.px,b.py,b.ox,b.oy,b.rippleU].map(a => Array.from(a));
    const rendered = context.surfaceSlimeDraw(b).points;
    const guest = context.surfaceSlimeFluidGuest(b);
    const pts = Array.from(guest.pts), points = Array.from({length:pts.length/4}, (_, i) => pts.slice(i*4,i*4+2));
    assert.deepEqual([b.px,b.py,b.ox,b.oy,b.rippleU].map(a => Array.from(a)), original, 'render envelope never changes physical arrays');
    const legacyPts = Array.from({length:20}, (_, i) => { const k = Math.floor(i*b.ringN/20); return [b.px[k],b.py[k],pts[i*4+2],pts[i*4+3]]; }).flat();
    const bounds = values => { const xs = values.filter((_,i)=>i%4===0), ys = values.filter((_,i)=>i%4===1); return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,hw:(Math.max(...xs)-Math.min(...xs))/2,hh:(Math.max(...ys)-Math.min(...ys))/2}; };
    // Bake the physical velocity channels as positions, with visual outset and
    // ripple disabled. This independently records the same render interpolation
    // stencil, without calling the fluid helper's velocity interpolation.
    const velocityBody={...b,px:Float64Array.from(b.px,(v,i)=>(v-b.ox[i])*context.JELLO_TIMESCALE/context.jelloStepH),
      py:Float64Array.from(b.py,(v,i)=>(v-b.oy[i])*context.JELLO_TIMESCALE/context.jelloStepH),rippleOn:false};
    const oldOutset=context.JELLO_RENDER_OUTSET;context.JELLO_RENDER_OUTSET=0;
    context.jelloRingBake(velocityBody);const velocityPath=context.surfaceSlimeSkinPath();context.JELLO_RENDER_OUTSET=oldOutset;
    const expectedVelocity=Array.from({length:20},(_,k)=>{
      const s=k*velocityPath.segments.length/20,i=Math.floor(s),t=s-i,u=1-t,q=velocityPath.segments[i];
      return [0,1].map(axis=>u*u*q[0][axis]+2*u*t*q[1][axis]+t*t*q[2][axis]);
    });
    return { body:b, guest:{...bounds(pts),pts,skin:true,convex:guest.convex}, legacy:{...bounds(legacyPts),pts:legacyPts}, points, rendered, options, expectedVelocity };
  }
  const shapes = [
    ['convex',{}], ['deformed',{deform:.15,squash:1.45}], ['concave',{deform:.3}],
    ['deep-concave',{deform:.6}], ['ripple',{ripple:true,deform:.15}],
    ['interpolated',{interp:true,deform:.3}], ['clockwise',{reverse:true,deform:.3}],['clockwise-convex',{reverse:true}],
    ['unchamfered',{noChamfer:true,deform:.3}], ['varying-velocity',{varyVelocity:true,deform:.15}],
    ['folded-cusp',{foldedCusp:true}]
  ].map(([name,options])=>({name,...geometry(options)}));
  const cpu = [];
  for (const shape of shapes) {
    const { guest:g,points,rendered,body:b,options } = shape;
    const outside = rendered.filter(p => !polygonTest(points,...p).inside && polygonTest(points,...p).distance > 1e-7);
    const maxVertexOutset=Math.max(...points.map(p=>polygonTest(rendered,...p).distance));
    const samples=Array.from(b.surfaceSlime.fluidGuest.sample);
    const sampleNormals=Array.from({length:20},(_,i)=>{const j=(i+1)%20,dx=samples[j*4]-samples[i*4],dy=samples[j*4+1]-samples[i*4+1],len=Math.hypot(dx,dy);return [b.ringSign*dy/len,-b.ringSign*dx/len];});
    const minimumAdjacentNormalDot=Math.min(...sampleNormals.map((normal,i)=>{const previous=sampleNormals[(i+19)%20];return normal[0]*previous[0]+normal[1]*previous[1];}));
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    let folded=false;
    for(let i=0;i<20;i++)for(let j=i+2;j<20;j++) {
      if(i===0&&j===19)continue;
      const a=points[i],z=points[(i+1)%20],c=points[j],d=points[(j+1)%20];
      if(cross(a,z,c)*cross(a,z,d)<-1e-10&&cross(c,d,a)*cross(c,d,z)<-1e-10)folded=true;
    }
    const checks = { twentyVertices:g.pts.length===80, finite:g.pts.every(Number.isFinite), curveEnclosed:outside.length===0,
      noFoldedEdges:!folded,noMiterSpike:options.foldedCusp || maxVertexOutset<5,
      foldedCuspActuallyExercised:!options.foldedCusp||minimumAdjacentNormalDot<-.95,
      signedConvexAdmission:shape.name==='convex'?g.convex===1:shape.name==='clockwise-convex'?g.convex===-1:true,
      boundedRenderedAABB:points.every(p=>p[0]>=Math.min(...rendered.map(q=>q[0]))-5 && p[0]<=Math.max(...rendered.map(q=>q[0]))+5 && p[1]>=Math.min(...rendered.map(q=>q[1]))-5 && p[1]<=Math.max(...rendered.map(q=>q[1]))+5),
      exactBounds:points.every(p=>Math.abs(p[0]-g.x)<=g.hw+1e-9 && Math.abs(p[1]-g.y)<=g.hh+1e-9),
      bakedVelocityMatches:g.pts.every((v,i)=>i%4<2 || Math.abs(v-shape.expectedVelocity[Math.floor(i/4)][i%4-2])<1e-8) };
    context.JELLO_RIPPLE=options.ripple?.8:0;context.JELLO_EDGE_STYLE=options.noChamfer?0:1;
    let seed,nx,ny,tx,ty;
    for(let e=0;e<20;e++) {
      const a=points[e],z=points[(e+1)%20],dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy);
      nx=b.ringSign*dy/len;ny=-b.ringSign*dx/len;tx=dx/len;ty=dy/len;
      seed=[(a[0]+z[0])/2-nx*.3,(a[1]+z[1])/2-ny*.3];
      const probe=polygonTest(points,...seed);
      if(probe.inside && probe.nearest.edge===e)break;
    }
    assert(polygonTest(points,...seed).inside,shape.name+' has a usable exterior face');
    context.liquidCount=2; context.liquidX=[seed[0],seed[0]]; context.liquidY=[seed[1],seed[1]];
    context.liquidVX=[36-20*nx+13*tx,123];context.liquidVY=[-12-20*ny+13*ty,234];
    context.liquidFrozen=[0,1];context.liquidSleeping=[1,1];context.liquidRestFrames=[29,29];
    const v0=[context.liquidVX[0],context.liquidVY[0]];
    context.surfaceSlimeFluidCPU(b,true);
    const result=polygonTest(rendered,context.liquidX[0],context.liquidY[0]);
    checks.cpuOutsideRenderedSkin=!result.inside && result.distance>=.9;
    checks.cpuTangentPreserved=Math.abs((context.liquidVX[0]-v0[0])*tx+(context.liquidVY[0]-v0[1])*ty)<1e-7;
    checks.cpuWake=context.liquidSleeping[0]===0&&context.liquidRestFrames[0]===0;
    checks.cpuFrozen=context.liquidX[1]===seed[0]&&context.liquidY[1]===seed[1]&&context.liquidVX[1]===123&&context.liquidVY[1]===234&&context.liquidSleeping[1]===1;
    context.liquidWorldSolidAt=()=>true;context.liquidX[0]=seed[0];context.liquidY[0]=seed[1];
    context.surfaceSlimeFluidCPU(b,true);checks.cpuTerrainVeto=context.liquidX[0]===seed[0]&&context.liquidY[0]===seed[1];context.liquidWorldSolidAt=()=>false;
    cpu.push({name:shape.name,checks,pass:Object.values(checks).every(Boolean),outsidePoints:outside.slice(0,3),denseCurvePoints:rendered.length,maxVertexOutset,minimumAdjacentNormalDot});
  }
  for(const corruption of ['position','bounds','velocity']) {
    const b=body(),originalGuest=context.surfaceSlimeFluidGuest(b);
    assert(originalGuest,'Valid body admitted before nonfinite mutation');
    if(corruption==='position')b.px[4]=NaN;
    if(corruption==='bounds')b.bboxR=Infinity;
    if(corruption==='velocity')b.ox[4]=NaN;
    const checks={nonfiniteBodyRejected:context.surfaceSlimeFluidGuest(b)===null,staleRenderCacheInvalidated:b.surfaceSlime.fluidFrame!==context.jelloFrameNo};
    cpu.push({name:'nonfinite-'+corruption,checks,pass:Object.values(checks).every(Boolean)});
  }
  const particle=(x,y,snow,unchanged=false)=>({pos:[x,y,-13,17],aux:[3.2,.2,x,y],flag:((snow?65:0)|8|(29<<8))>>>0,unchanged});
  const fixtures=[];
  function add(name, shapeList, seeds, snow, options={}) {
    const controls=[particle(100,100,snow,true),particle(20,20,!snow,true)];
    controls[0].flag|=32;
    fixtures.push({name:name+(snow?'-snow':'-water'),particles:seeds.map(p=>particle(...p,snow)).concat(controls),activeCount:seeds.length,
      guests:shapeList.map(s=>s.guest),legacyGuests:shapeList.map(s=>s.legacy),outlines:shapeList.map(s=>s.rendered),
      terrain:'empty',region:[0,-128,256,256],modes:['standalone','shared-encoder'],snowOnly:snow,...options});
  }
  for (const snow of [false,true]) {
    for (const shape of shapes.filter(s=>['convex','concave','ripple','interpolated','clockwise','clockwise-convex','folded-cusp'].includes(s.name))) {
      const probes=[];
      for(let e=0;e<20;e++) {
        const a=shape.points[e],b=shape.points[(e+1)%20],len=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=shape.body.ringSign*(b[1]-a[1])/len,ny=-shape.body.ringSign*(b[0]-a[0])/len;
        for(const depth of e===2?[.03,.08,.3,.8,2]:[.03]) {
          const p=[(a[0]+b[0])/2-nx*depth,(a[1]+b[1])/2-ny*depth];
          if(polygonTest(shape.points,...p).inside)probes.push(p);
        }
      }
      add('skin-'+shape.name,[shape],probes,snow,{clearance:.9,baselineGeometry:'envelope'});
      if(shape.name==='convex')add('skin-convex-ray',[{...shape,guest:{...shape.guest,convex:0}}],probes,snow,{clearance:.9,baselineGeometry:'envelope'});
    }
    const convex=shapes[0], probe=convex.rendered[600],normal=[(probe[0]-100)/Math.hypot(probe[0]-100,probe[1]-100),(probe[1]-100)/Math.hypot(probe[0]-100,probe[1]-100)];
    add('rendered-outset',[convex],[[probe[0]-normal[0]*.15,probe[1]-normal[1]*.15]],snow,{clearance:.9,baselineGeometry:'legacy'});
    const floor=geometry({cx:100,cy:100,radius:26});
    add('terrain-pinch',[floor],[[100,126.8]],snow,{terrain:'floor',clearance:0,requireFallback:true});
    const left=geometry({cx:96,cy:100}),right=geometry({cx:116,cy:100});
    add('union-forward',[left,right],[[106,100],[110,105]],snow,{clearance:.9});
    add('union-reverse',[right,left],[[106,100],[110,105]],snow,{clearance:.9});
    const generic={...convex,guest:{...convex.guest,skin:false},legacy:{...convex.guest,skin:false}};
    const a=generic.points[2],b=generic.points[3],len=Math.hypot(b[0]-a[0],b[1]-a[1]),depth=snow?.03:.3;
    add('ordinary-guest-control',[generic],[[(a[0]+b[0])/2-(b[1]-a[1])/len*depth,(a[1]+b[1])/2+(b[0]-a[0])/len*depth]],snow,{exact:true,keepPosition:true,clearance:null});
  }
  const benchFamilies=[['separate',[[48,70],[120,70],[192,70],[84,145],[156,145]]],['overlap-deformed',[[75,95],[100,95],[125,95],[90,118],[115,118]]]].map(([name,centers])=>{
    const bodies=centers.map(([cx,cy],i)=>geometry({cx,cy,deform:name==='separate'?0:.15+i*.035}));
    return {name,guests:bodies.map(s=>s.guest),legacyGuests:bodies.map(s=>s.legacy)};
  });
  return { cpu,fixtures,benchFamilies,hashes,constants:{JELLO_H:context.JELLO_H,JELLO_TIMESCALE:context.JELLO_TIMESCALE},limitation:'Finite simple 37-node body contours, including substantial concavity and both windings; not arbitrary folded or self-intersecting soft bodies.' };
}
