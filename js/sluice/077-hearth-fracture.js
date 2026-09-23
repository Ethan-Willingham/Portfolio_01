  /* ---- Load-driven fuel failure and persistent granular mineral ash ---- */
  var HEARTH_FRAGMENT_CAP = 48, HEARTH_ASH_CAP = 128;
  function hearthPolygon(vertices) {
    var area = 0, cx = 0, cy = 0, inertia = 0;
    for (var i = 0; i < vertices.length; i++) {
      var a = vertices[i], b = vertices[(i + 1) % vertices.length], cross = a[0]*b[1]-b[0]*a[1];
      area += cross; cx += (a[0]+b[0])*cross; cy += (a[1]+b[1])*cross;
      inertia += cross*(a[0]*a[0]+a[0]*b[0]+b[0]*b[0]+a[1]*a[1]+a[1]*b[1]+b[1]*b[1]);
    }
    return { vertices: vertices, area: area/2, cx: cx/(3*area), cy: cy/(3*area), inertia: inertia/(6*area) };
  }
  function hearthSplit(bed, body) {
    if (bed.chunks.length >= HEARTH_FRAGMENT_CAP || body.generation >= 2 || body.r < 9) return false;
    var points = hearthWorldHull(body), angle = hearthSeed(body.id*73+11)*1.2-0.6;
    var nx = Math.cos(angle), ny = Math.sin(angle), offset = body.x*nx+body.y*ny, pieces = [];
    for (var side = -1; side <= 1; side += 2) {
      var clipped = [];
      for (var j = 0; j < points.length; j++) {
        var a = points[j], b = points[(j+1)%points.length];
        var da = side*(a[0]*nx+a[1]*ny-offset), db = side*(b[0]*nx+b[1]*ny-offset);
        if (da >= 0) clipped.push(a.slice());
        if ((da >= 0) !== (db >= 0)) { var t = da/(da-db); clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); }
      }
      if (clipped.length < 3) return false;
      var polygon = hearthPolygon(clipped), radius = 0;
      for (j = 0; j < clipped.length; j++) radius = Math.max(radius,Math.hypot(clipped[j][0]-polygon.cx,clipped[j][1]-polygon.cy));
      pieces.push({ polygon: polygon, radius: radius, side: side });
    }
    var area = pieces[0].polygon.area+pieces[1].polygon.area, children = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i], share = p.polygon.area/area, child = Object.assign({},body);
      child.id = bed.nextId++; child.seed = hearthSeed(child.id); child.x = p.polygon.cx; child.y = p.polygon.cy;
      child.vx = body.vx-body.spin*(child.y-body.y); child.vy = body.vy+body.spin*(child.x-body.x);
      child.r = p.radius; child.baseR = p.radius/(body.r/body.baseR); child.angle = 0;
      child.shape = p.polygon.vertices.map(function(v){return [(v[0]-child.x)/child.r,(v[1]-child.y)/child.r];});
      child.massRef = body.massRef*share; child.dryKg = body.dryKg*share; child.fuelShare = body.fuelShare*share;
      child.generation = (body.generation || 0)+1; child.damage = 0; child.load = 0; child.fractureWait = 2;
      delete child.vertices; hearthMass(child); hearthWorldHull(child); children.push(child);
    }
    if (typeof hearthFireOwns === 'function' && hearthFireOwns(bed)) hearthFireGPU.fracture(body,children);
    bed.chunks.splice(bed.chunks.indexOf(body),1,children[0],children[1]); bed.contacts = {};
    hearthSparks(bed,body.x,body.y,body.lit ? 4 : 0,0.45);
    return true;
  }
  function hearthAshMass(bed) {
    var mass = 0; for (var i = 0; i < bed.ash.length; i++) mass += bed.ash[i].kg; return mass;
  }
  function hearthMakeAsh(bed, b) {
    var count = Math.max(4,Math.min(12,Math.ceil(b.r))), kg = b.dryKg*0.16/count;
    for (var i = 0; i < count; i++) {
      var seed = hearthSeed(b.id*197+i*17), angle = seed*Math.PI*2, radius = b.r*Math.sqrt(hearthSeed(b.id*23+i))*0.65;
      var grain = { x: b.x+Math.cos(angle)*radius, y: b.y+Math.sin(angle)*radius,
        vx: b.vx+(seed-0.5)*12, vy: b.vy, kg: kg, heat: b.heat*0.16+b.core*0.84, seed: seed };
      if (bed.ash.length < HEARTH_ASH_CAP) bed.ash.push(grain);
      else {
        // Merge only mineral residue. Its mass and sensible heat persist.
        var nearest = bed.ash[0], distance = Infinity;
        for (var j = 0; j < bed.ash.length; j++) { var d = Math.hypot(bed.ash[j].x-grain.x,bed.ash[j].y-grain.y); if(d<distance){nearest=bed.ash[j];distance=d;} }
        nearest.heat = (nearest.heat*nearest.kg+grain.heat*kg)/(nearest.kg+kg); nearest.kg += kg;
      }
    }
    bed.chunks.splice(bed.chunks.indexOf(b),1); bed.contacts = {};
  }
  function hearthAshStep(bed,h) {
    var grains = bed.ash;
    for (var i = 0; i < grains.length; i++) {
      var g = grains[i], r = Math.max(1.3,Math.sqrt(g.kg/0.00008));
      g.heat *= Math.exp(-h*0.12); g.vy = Math.min(220,g.vy+520*h); g.vx *= Math.exp(-h*2);
      g.x = Math.max(r,Math.min(320-r,g.x+g.vx*h)); g.y += g.vy*h;
      if (g.y > HEARTH_FLOOR-r) { g.y = HEARTH_FLOOR-r; g.vy = 0; g.vx *= 0.75; }
      for (var j = 0; j < bed.chunks.length; j++) {
        var b = bed.chunks[j]; if(b.held || Math.hypot(g.x-b.x,g.y-b.y)>b.r+r)continue;
        var hull = hearthWorldHull(b), gap = -Infinity, nx = 0, ny = 0;
        for (var k = 0; k < hull.length; k++) {
          var a=hull[k],v=hull[(k+1)%hull.length],len=Math.hypot(v[0]-a[0],v[1]-a[1]);
          var ex=(v[1]-a[1])/len,ey=(a[0]-v[0])/len,d=(g.x-a[0])*ex+(g.y-a[1])*ey;
          if(d>gap){gap=d;nx=ex;ny=ey;}
        }
        if(gap<r){g.x+=nx*(r-gap);g.y+=ny*(r-gap);var speed=Math.min(0,g.vx*nx+g.vy*ny);g.vx-=nx*speed;g.vy-=ny*speed;}
      }
    }
    // Short-range grain contacts form a resting pile on the grate.
    for (var pass=0;pass<2;pass++) for(i=0;i<grains.length;i++)for(j=i+1;j<grains.length;j++){
      var a=grains[i],b=grains[j],dx=b.x-a.x,dy=b.y-a.y;
      var radius=Math.max(1.3,Math.sqrt(a.kg/0.00008))+Math.max(1.3,Math.sqrt(b.kg/0.00008));
      if(Math.abs(dx)>=radius || Math.abs(dy)>=radius)continue;
      var d=Math.hypot(dx,dy);if(d>=radius)continue;if(d<0.001){dx=1;dy=0;d=1;}
      var push=(radius-d)*0.5, nx=dx/d,ny=dy/d;
      a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
      if(a.y>HEARTH_FLOOR-Math.max(1.3,Math.sqrt(a.kg/0.00008)))a.y=HEARTH_FLOOR-Math.max(1.3,Math.sqrt(a.kg/0.00008));
      if(b.y>HEARTH_FLOOR-Math.max(1.3,Math.sqrt(b.kg/0.00008)))b.y=HEARTH_FLOOR-Math.max(1.3,Math.sqrt(b.kg/0.00008));
      a.vy*=0.7;b.vy*=0.7;
    }
    bed.ashLoad = Math.min(0.92,hearthAshMass(bed)/0.025);
  }
  function hearthFractureStep(bed,h) {
    for (var i = bed.chunks.length-1; i >= 0; i--) {
      var b=bed.chunks[i];if(b.held)continue;
      b.fractureWait=Math.max(0,(b.fractureWait||0)-h);
      if(b.ash){hearthMakeAsh(bed,b);continue;}
      if(b.fuel>0.85)continue;
      var retained=Math.min(1,b.carbon/(b.material==='wood'?0.24:0.72));
      var strength=0.035+Math.pow(retained,2.8)*5.5;
      var stress=(b.load||0)/Math.max(50,b.massRef*520);
      b.damage=Math.min(1,(b.damage||0)+Math.max(0,stress-strength)*h*0.28);
      if(b.damage>=1 && !b.fractureWait) hearthSplit(bed,b);
    }
  }
