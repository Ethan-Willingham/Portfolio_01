/* Store furniture, stock and floor materials. Fixed-step, dependency-free.
 * Horizontal contacts use mass/inertia impulses. A rack rocks about its feet;
 * supported products slide relative to the boards before falling under gravity.
 * Height is simulated separately from the overhead floor, not a screen effect.
 */
(function (root) {
  'use strict';
  const G = 160, CELL = 4, MAX_FRAGMENTS = 220;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cross = (x, y, u, v) => x * v - y * u;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const CATALOG = Object.freeze({
    vase: { mass: .065, length: 5, width: 3.5, bounce: .08, friction: .075, drag: 1.5, fragile: 45, liquid: 'water', volume: 32, material: 'glass' },
    wine: { mass: .075, length: 5, width: 1.7, bounce: .16, friction: .22, drag: .75, fragile: 66, liquid: 'wine', volume: 12, material: 'glass' },
    ketchup: { mass: .06, length: 4, width: 2.1, bounce: .18, friction: .4, drag: 1.5, crush: 100, liquid: 'ketchup', volume: 10, material: 'plastic' },
    jar: { mass: .09, length: 3, width: 2.4, bounce: .1, friction: .3, drag: 1.5, fragile: 76, liquid: 'oil', volume: 8, material: 'glass' },
    can: { mass: .085, length: 3.6, width: 2, bounce: .4, friction: .16, drag: .7, material: 'metal' },
    plate: { mass: .055, length: 4, width: 3.3, bounce: .12, friction: .45, drag: 2.4, fragile: 54, material: 'ceramic' },
    pot: { mass: .1, length: 3.8, width: 3.5, bounce: .12, friction: .48, drag: 2, fragile: 65, liquid: 'soil', volume: 7, material: 'terracotta' },
    towel: { mass: .035, length: 4.5, width: 3, bounce: .02, friction: .7, drag: 5, material: 'cloth' },
    carton: { mass: .09, length: 5, width: 3.5, bounce: .07, friction: .5, drag: 3, material: 'cardboard' },
    shard: { mass: .003, length: 1.6, width: .65, bounce: .12, friction: .45, drag: 3, material: 'glass' }
  });
  const MATERIALS = Object.freeze({
    wine: { flow: 6, grip: .32, drag: .55 }, ketchup: { flow: .65, grip: .58, drag: 1.35 },
    oil: { flow: 3.3, grip: .2, drag: .45 }, soil: { flow: .16, grip: .75, drag: 1.7 }, water: { flow: 7, grip: .4, drag: .6 }
  });
  const assortments = { groceries: ['wine', 'ketchup', 'can', 'jar', 'wine', 'ketchup'], wine: ['wine', 'wine', 'jar'], sauces: ['ketchup', 'jar', 'can'], dishes: ['plate', 'jar', 'plate'], plants: ['pot'], towels: ['towel'], boxes: ['carton'], jars: ['jar', 'can', 'wine', 'ketchup'] };
  function shelfBasis(s) {
    const old=s.basis;
    if(old&&old.a===s.a&&old.tilt===s.tilt&&old.nx===s.nx&&old.ny===s.ny) return old;
    const c=Math.cos(s.a),sin=Math.sin(s.a),nx=s.nx*c+s.ny*sin,ny=-s.nx*sin+s.ny*c;
    return s.basis={a:s.a,tilt:s.tilt,nx:s.nx,ny:s.ny,c,s:sin,C:Math.cos(s.tilt),T:Math.sin(s.tilt),
      edge:(Math.abs(nx)*s.w+Math.abs(ny)*s.h)/2,edgeTurn:(Math.sign(nx)*ny*s.w-Math.sign(ny)*nx*s.h)/2};
  }
  function shelfPoint(s, x, y, z = 0) {
    const b=shelfBasis(s),px=b.c*x-b.s*y,py=b.s*x+b.c*y,along=px*s.nx+py*s.ny;
    // Rotate the complete prism about its leading floor edge. Its width turns
    // into vertical depth as it falls; the frame never shears or becomes flat.
    const shift=(b.edge-along)*(1-b.C)+z*b.T;
    return {x:s.cx+px+s.nx*shift,y:s.cy+py+s.ny*shift,z:z*b.C+(b.edge-along)*b.T};
  }
  function shelfVelocity(s, x, y, z, du=0, dv=0) {
    const b=shelfBasis(s),px=b.c*x-b.s*y,py=b.s*x+b.c*y,along=px*s.nx+py*s.ny;
    const vx=-s.omega*py+du*b.c-dv*b.s,vy=s.omega*px+du*b.s+dv*b.c;
    const advance=vx*s.nx+vy*s.ny,edgeV=b.edgeTurn*s.omega;
    const shift=(edgeV-advance)*(1-b.C)+((b.edge-along)*b.T+z*b.C)*s.tiltOmega;
    return {x:s.vx+vx+s.nx*shift,y:s.vy+vy+s.ny*shift,z:(edgeV-advance)*b.T+((b.edge-along)*b.C-z*b.T)*s.tiltOmega};
  }
  function shelfHeight(s) {const b=shelfBasis(s);return s.height*b.C+2*b.edge*b.T;}
  function hull(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const turn = (a, b, c) => cross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    const side = list => {
      const out = [];
      for (const q of list) { while (out.length > 1 && turn(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop(); out.push(q); }
      out.pop(); return out;
    };
    return [...side(p), ...side(p.slice().reverse())];
  }
  function shelfPolygon(s) {
    if(s.shape&&s.shape.cx===s.cx&&s.shape.cy===s.cy&&s.shape.a===s.a&&s.shape.tilt===s.tilt&&s.shape.nx===s.nx&&s.shape.ny===s.ny) return s.shape.poly;
    const corners = [[-s.w / 2, -s.h / 2], [s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2]];
    const poly=hull(corners.flatMap(p => [shelfPoint(s, ...p), shelfPoint(s, ...p, s.height)]));
    poly.bounds=bounds(poly);s.shape={cx:s.cx,cy:s.cy,a:s.a,tilt:s.tilt,nx:s.nx,ny:s.ny,poly};return poly;
  }
  function boxPolygon(b, length, width) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const poly=[[-length, -width], [length, -width], [length, width], [-length, width]].map(([x, y]) => ({ x: b.x + c * x - s * y, y: b.y + s * x + c * y }));
    const ex=Math.abs(c)*length+Math.abs(s)*width,ey=Math.abs(s)*length+Math.abs(c)*width;
    poly.bounds={left:b.x-ex,right:b.x+ex,top:b.y-ey,bottom:b.y+ey};return poly;
  }
  const rectPolygon = r => [{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];
  function bounds(p) {
    if(p.bounds) return p.bounds;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const q of p){left=Math.min(left,q.x);right=Math.max(right,q.x);top=Math.min(top,q.y);bottom=Math.max(bottom,q.y);}
    return {left,right,top,bottom};
  }
  function polygonContact(a, b) {
    const ba = bounds(a), bb = bounds(b);
    if (ba.right <= bb.left || ba.left >= bb.right || ba.bottom <= bb.top || ba.top >= bb.bottom) return null;
    let depth = Infinity, nx = 0, ny = 0;
    for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 1e-8) continue;
      const x = -(q.y - p.y) / d, y = (q.x - p.x) / d;
      let al=Infinity,ah=-Infinity,bl=Infinity,bh=-Infinity;
      for(const v of a){const dot=v.x*x+v.y*y;al=Math.min(al,dot);ah=Math.max(ah,dot);}
      for(const v of b){const dot=v.x*x+v.y*y;bl=Math.min(bl,dot);bh=Math.max(bh,dot);}
      if (ah <= bl || al >= bh) return null;
      const neg = ah - bl, pos = bh - al, overlap = Math.min(neg, pos);
      if (overlap < depth) { depth = overlap; nx = x * (neg < pos ? -1 : 1); ny = y * (neg < pos ? -1 : 1); }
    }
    const amin = Math.min(...a.map(p => p.x * nx + p.y * ny)), bmax = Math.max(...b.map(p => p.x * nx + p.y * ny));
    const af = a.filter(p => p.x * nx + p.y * ny <= amin + .02), bf = b.filter(p => p.x * nx + p.y * ny >= bmax - .02);
    const tangent = p => -p.x * ny + p.y * nx;
    const at = af.map(tangent), bt = bf.map(tangent);
    const low = Math.max(Math.min(...at), Math.min(...bt)), high = Math.min(Math.max(...at), Math.max(...bt));
    const t = low <= high ? (low + high) / 2 : clamp(at.reduce((x, y) => x + y, 0) / at.length, Math.min(...bt), Math.max(...bt));
    const n = (amin + bmax) / 2;
    return { nx, ny, depth, x: nx * n - ny * t, y: ny * n + nx * t };
  }
  function circlePolygon(x, y, radius, poly) {
    const b=bounds(poly);
    if(x+radius<=b.left||x-radius>=b.right||y+radius<=b.top||y-radius>=b.bottom) return null;
    let inside = true, nearest = Infinity, qx = 0, qy = 0, ex=0,ey=0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y;
      if (cross(dx, dy, x - a.x, y - a.y) < 0) inside = false;
      const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      const xx = a.x + dx * t, yy = a.y + dy * t, d = Math.hypot(x - xx, y - yy);
      if (d < nearest) { nearest = d; qx = xx; qy = yy;const edge=Math.hypot(dx,dy);ex=dy/edge;ey=-dx/edge; }
    }
    if (!inside && nearest >= radius) return null;
    const sign = inside ? -1 : 1, d = Math.max(nearest, 1e-8);
    return { nx:nearest<1e-8?ex:(x-qx)/d*sign, ny:nearest<1e-8?ey:(y-qy)/d*sign, depth: inside ? radius + nearest : radius - nearest, x: qx, y: qy };
  }
  function createShelf(spec, id) {
    const s = { ...spec, id, cx: spec.x + spec.w / 2, cy: spec.y + spec.h / 2, a: 0, vx: 0, vy: 0, omega: 0,
      height: spec.height ?? (spec.kind === 'table' ? 22 : 38), frameMass: spec.mass ?? (spec.kind === 'table' ? .5 : .65 + spec.w * spec.h / 10000),
      mass: 2, inertia: 1, comHeight: 18, tilt: 0, tiltOmega: 0, nx: 0, ny: 1,
      support: Math.min(spec.w, spec.h) * (spec.kind === 'table' ? .38 : .06), spilled: false, down: false, wobble: 0, stockItems: [], bounce: .06, friction: .45, impactTime: -1 };
    s.velocityAt = p => {
      const tip = (p.height || 0) * s.tiltOmega;
      return { x: s.vx - s.omega * (p.y - s.cy) + s.nx * tip, y: s.vy + s.omega * (p.x - s.cx) + s.ny * tip };
    };
    s.tiltMass = (nx,ny,height=0) => s.down ? 0 : (height*(nx*s.nx+ny*s.ny))**2/s.tipInertia;
    s.tiltImpulse = (ix,iy,height=0) => { if(!s.down) s.tiltOmega+=height*(ix*s.nx+iy*s.ny)/s.tipInertia; };
    return s;
  }
  function product(kind, id, x, y, a = 0) {
    const p = { ...CATALOG[kind], boardFriction: CATALOG[kind].friction * (kind === 'vase' ? 1 : .35), kind, id, x, y, a, vx: 0, vy: 0, omega: 0, z: 0, vz: 0, tumble: 0, tumbleOmega: 0, state: 'floor', age: 0, broken: false, flat: false, sleep: 0, wheelHits: 0 };
    p.inertia = p.mass * (p.length ** 2 + p.width ** 2) / 3;
    return p;
  }
  // Equal/opposite rigid-body impulses, including rotational point velocity.
  function resolve(a, b, hit, bounce = .12, friction = .3) {
    const ax = a.cx ?? a.x, ay = a.cy ?? a.y, bx = b ? b.cx ?? b.x : hit.x, by = b ? b.cy ?? b.y : hit.y;
    const rx = hit.x - ax, ry = hit.y - ay, qx = hit.x - bx, qy = hit.y - by;
    const av = a.velocityAt ? a.velocityAt({...hit,height:hit.heightA}) : { x: a.vx - a.omega * ry, y: a.vy + a.omega * rx };
    const bv = b ? b.velocityAt ? b.velocityAt({...hit,height:hit.heightB}) : { x: b.vx - b.omega * qy, y: b.vy + b.omega * qx } : {x:0,y:0};
    const im = 1 / a.mass, jm = b ? 1 / b.mass : 0, ii = 1 / a.inertia, ji = b ? 1 / b.inertia : 0;
    const vx = av.x - bv.x, vy = av.y - bv.y, vn = vx * hit.nx + vy * hit.ny;
    const rn = cross(rx, ry, hit.nx, hit.ny), qn = cross(qx, qy, hit.nx, hit.ny);
    const extra=(nx,ny)=>(a.tiltMass?a.tiltMass(nx,ny,hit.heightA):0)+(b?.tiltMass?b.tiltMass(nx,ny,hit.heightB):0);
    const j = vn < 0 ? -(1 + (vn < -3 ? bounce : 0)) * vn / (im + jm + rn * rn * ii + qn * qn * ji+extra(hit.nx,hit.ny)) : 0;
    const tx = -hit.ny, ty = hit.nx, rt = cross(rx, ry, tx, ty), qt = cross(qx, qy, tx, ty);
    const apply=(ix,iy)=>{
      a.vx+=ix*im;a.vy+=iy*im;a.omega+=cross(rx,ry,ix,iy)*ii;
      if(a.tiltImpulse)a.tiltImpulse(ix,iy,hit.heightA);
      if(b){b.vx-=ix*jm;b.vy-=iy*jm;b.omega-=cross(qx,qy,ix,iy)*ji;b.sleep=0;}
      if(b?.tiltImpulse)b.tiltImpulse(-ix,-iy,hit.heightB);
    };
    apply(hit.nx*j,hit.ny*j);
    const aa=a.velocityAt?a.velocityAt({...hit,height:hit.heightA}):{x:a.vx-a.omega*ry,y:a.vy+a.omega*rx};
    const bb=b?b.velocityAt?b.velocityAt({...hit,height:hit.heightB}):{x:b.vx-b.omega*qy,y:b.vy+b.omega*qx}:{x:0,y:0};
    const f=clamp(-((aa.x-bb.x)*tx+(aa.y-bb.y)*ty)/(im+jm+rt*rt*ii+qt*qt*ji+extra(tx,ty)),-j*friction,j*friction);
    apply(tx*f,ty*f);
    const correction = Math.max(0, hit.depth - .015) * .7 / (im + jm);
    const move = (o, x, y) => { if (o.cx !== undefined) { o.cx += x; o.cy += y; } else { o.x += x; o.y += y; } };
    move(a, hit.nx * correction * im, hit.ny * correction * im);
    if (b) move(b, -hit.nx * correction * jm, -hit.ny * correction * jm);
    a.sleep = 0;
    return j;
  }
  class System {
    constructor(world, geometry) {
      this.world = world; this.geometry = geometry;
      this.cols=Math.ceil((world.level.bounds?.right||480)/CELL);this.rows=Math.ceil((world.level.bounds?.bottom||300)/CELL); this.items = []; this.liquids = new Map(); this.smears = []; this.serial = 0;
      this.fluidTime = 0; this.fragments=0; this.stats = { fallen: 0, broken: 0, crushed: 0, toppled: 0, wheelContacts: 0 };
      for (const s of world.shelves) {
        if (s.kind === 'table') {
          const p = product('vase', this.serial++, 0, 0, -Math.PI / 2);
          Object.assign(p, {shelf:s, u:0, v:0, du:0, dv:0, tier:s.height, state:'shelf', color:0});
          s.stockItems.push(p); this.items.push(p); this.positionStock(p); this.weigh(s);
          continue;
        }
        const kinds = assortments[s.stock] || assortments.groceries;
        const cols = Math.max(1, Math.floor((s.w - 10) / 15)), rows = Math.max(1, Math.floor((s.h - 10) / 18));
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          const p = product(kinds[(row * cols + col + s.id) % kinds.length], this.serial++, 0, 0, -Math.PI / 2 + (col % 2 ? .1 : -.1));
          p.shelf = s; p.u = (col + .5) * (s.w - 10) / cols - (s.w - 10) / 2;
          p.v = (row + .5) * (s.h - 10) / rows - (s.h - 10) / 2;
          p.du = 0; p.dv = 0; p.tier = 12 + row % 3 * 10; p.state = 'shelf'; p.color = (row * cols + col + s.id) % 6;
          s.stockItems.push(p); this.items.push(p); this.positionStock(p);
        }
        this.weigh(s);
      }
    }
    weigh(s) {
      const supported = s.stockItems.filter(p => p.state === 'shelf');
      s.mass = s.frameMass + supported.reduce((n, p) => n + p.mass, 0);
      s.comHeight = (s.frameMass * s.height * .45 + supported.reduce((n, p) => n + p.mass * p.tier, 0)) / s.mass;
      s.inertia = s.mass * (s.w ** 2 + s.h ** 2) / 12;
      s.tipInertia = s.mass * (s.comHeight ** 2 + s.support ** 2 + s.height ** 2 / 12);
    }
    positionStock(p) { const q = shelfPoint(p.shelf, p.u, p.v, p.tier); p.x = q.x; p.y = q.y; p.z = q.z; }
    supportedContacts(s) {
      const items=s.stockItems.filter(p=>p.state==='shelf');
      for(let pass=0;pass<2;pass++)for(let i=0;i<items.length;i++)for(let k=i+1;k<items.length;k++) {
        const p=items[i],q=items[k];if(Math.abs(p.tier-q.tier)>3)continue;
        const a={x:p.u,y:p.v,a:p.a,vx:p.du,vy:p.dv,omega:p.omega,mass:p.mass,inertia:p.inertia};
        const b={x:q.u,y:q.v,a:q.a,vx:q.du,vy:q.dv,omega:q.omega,mass:q.mass,inertia:q.inertia};
        const h=polygonContact(boxPolygon(a,p.length,p.width),boxPolygon(b,q.length,q.width));if(!h)continue;
        resolve(a,b,h,.08,Math.sqrt(p.friction*q.friction));
        Object.assign(p,{u:a.x,v:a.y,du:a.vx,dv:a.vy,omega:a.omega});Object.assign(q,{u:b.x,v:b.y,du:b.vx,dv:b.vy,omega:b.omega});
        this.positionStock(p);this.positionStock(q);
      }
    }
    charge(s, x, y) {
      if (s.spilled) return;
      s.spilled = true; this.world.mess(s.kind === 'table' ? 'table' : 'shelf', x, y);
    }
    prepareHit(s,h,height) {
      const nx = -h.nx, ny = -h.ny;
      if (s.tilt < .03 && !s.down) {
        s.nx = nx; s.ny = ny;
        const c = Math.cos(s.a), sin = Math.sin(s.a);
        const lx = nx * c + ny * sin, ly = -nx * sin + ny * c;
        s.support = (Math.abs(lx) * s.w + Math.abs(ly) * s.h) * (s.kind === 'table' ? .38 : .06);
        this.weigh(s);
      }
      h.height=height;return h;
    }
    hitShelf(s, h, j) {
      if (j < .05) return;
      const nx=-h.nx,ny=-h.ny;
      s.wobble = Math.min(1, s.wobble + j / 55);
      const c = Math.cos(s.a), sin = Math.sin(s.a);
      for (const p of s.stockItems) if (p.state === 'shelf') {
        // The stock keeps its pre-impact momentum as the board moves below it.
        const rx = p.x - s.cx, ry = p.y - s.cy, spin = cross(h.x - s.cx, h.y - s.cy, nx * j, ny * j) / s.inertia;
        const dx = nx * j / s.mass - spin * ry, dy = ny * j / s.mass + spin * rx;
        p.du -= dx * c + dy * sin; p.dv -= -dx * sin + dy * c;
      }
      if (j > 7 && this.world.time - s.impactTime > .12) { s.impactTime = this.world.time; this.world.emit('rack-hit', {x:h.x,y:h.y,impact:j}); }
    }
    release(p) {
      if (p.state !== 'shelf') return;
      const s = p.shelf, q = shelfPoint(s, p.u, p.v, p.tier);
      p.x = q.x; p.y = q.y; p.z = Math.max(0, q.z);
      const velocity=shelfVelocity(s,p.u,p.v,p.tier,p.du,p.dv);
      p.vx=velocity.x;p.vy=velocity.y;p.vz=velocity.z;
      p.a += s.a; p.tumbleOmega = clamp((p.du + p.dv) / 7 + s.tiltOmega * 2, -12, 12);
      p.omega = s.omega + (p.id % 2 ? 1 : -1) * Math.hypot(p.du, p.dv) / 15;
      p.state = p.z > 0 ? 'air' : 'floor'; p.sleep = 0; this.stats.fallen++;
      this.charge(s, p.x, p.y); this.weigh(s);
      this.world.emit('product-fall', {kind:p.kind,x:p.x,y:p.y});
    }
    addProduct(kind, x, y, options = {}) {
      const p = Object.assign(product(kind, this.serial++, x, y), options);
      if (p.z > 0) p.state = 'air';
      this.items.push(p); return p;
    }
    breakProduct(p, speed, wheel = false) {
      if (p.broken || p.state === 'shelf' || p.kind === 'shard') return;
      if (p.fragile && speed >= p.fragile || wheel && p.fragile && speed > 3) {
        p.broken = true; p.state = 'broken'; this.stats.broken++;
        this.world.emit('break', {kind:p.kind,material:p.material,x:p.x,y:p.y,impact:speed});
        if (p.liquid) this.spill(p.liquid, p.x, p.y, p.volume, p.vx, p.vy);
        const count = Math.min(p.kind === 'plate' ? 7 : 5, MAX_FRAGMENTS - this.fragments);
        this.fragments+=count;
        for (let i = 0; i < count; i++) {
          const a = p.id * 1.31 + i * 2.399, v = Math.min(32, speed * .16) * (.6 + i / count);
          this.addProduct('shard', p.x + Math.cos(a) * 2, p.y + Math.sin(a) * 2, {
            a, vx:p.vx * .45 + Math.cos(a) * v, vy:p.vy * .45 + Math.sin(a) * v, z:Math.min(p.z, 4), vz:8 + i * 3,
            omega:(i % 2 ? 1 : -1) * 3, material:p.material, color:p.color, source:p.kind, length:1.2 + i % 3 * .4
          });
        }
      } else if (p.crush && !p.flat && (wheel ? speed > 2 : speed > p.crush)) {
        p.flat = true; p.width *= 1.35; p.bounce = .02; p.drag = 3; this.stats.crushed++;
        this.spill(p.liquid, p.x, p.y, p.volume, p.vx, p.vy); p.volume = 0;
        this.world.emit('squash', {kind:p.kind,x:p.x,y:p.y});
      }
    }
    liquid(kind) {
      if (!this.liquids.has(kind)) this.liquids.set(kind, { kind, ...MATERIALS[kind], cells: new Map() });
      return this.liquids.get(kind);
    }
    validCell(col,row) {
      if(col<0||col>=this.cols||row<0||row>=this.rows)return false;
      return this.world.isFloor({x:(col+.5)*CELL,y:(row+.5)*CELL});
    }
    cell(liquid, x, y, amount) {
      const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
      if (!this.validCell(col,row)) return;
      const key = row * this.cols + col, value = liquid.cells.get(key) || 0;
      if (value + amount > 1e-10) liquid.cells.set(key, Math.max(0, value + amount)); else liquid.cells.delete(key);
    }
    spill(kind, x, y, volume, vx = 0, vy = 0) {
      if (!kind || !volume) return;
      const liquid = this.liquid(kind);
      if (kind === 'water') {
        // A pour starts as one contiguous pool rather than separate droplets.
        const radius = Math.max(2, Math.ceil(Math.sqrt(volume) / 2.5)), cells = [];
        for (let row = -radius; row <= radius; row++) for (let col = -radius; col <= radius; col++) {
          const weight = Math.max(0, radius + .5 - Math.hypot(col, row));
          if (weight) cells.push({x:x + col * CELL + vx * .025, y:y + row * CELL + vy * .025, weight});
        }
        const total = cells.reduce((n, c) => n + c.weight, 0);
        for (const c of cells) this.cell(liquid, clamp(c.x, 8, (this.world.level.bounds?.right||480)-8.001), clamp(c.y, 8, (this.world.level.bounds?.bottom||300)-8.001), volume * c.weight / total);
        return;
      }
      const spots = 12;
      for (let i = 0; i < spots; i++) {
        const a = i * 2.399, r = i === 0 ? 0 : 1.5 + Math.sqrt(i) * 1.5;
        this.cell(liquid, x + Math.cos(a) * r + vx * .018 * i / spots, y + Math.sin(a) * r + vy * .018 * i / spots, volume / spots);
      }
    }
    flow(dt) {
      // Conservative thin-film diffusion. Ketchup is viscous; wine spreads.
      // Pairwise exchanges conserve volume, including the cells wet by tires.
      for (const liquid of this.liquids.values()) {
        const delta = new Map(), cells = liquid.cells;
        const add = (k, v) => delta.set(k, (delta.get(k) || 0) + v);
        for (const [key, volume] of cells) {
          if (volume < .025) continue;
          const col = key % this.cols, row = Math.floor(key / this.cols);
          for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            if (!this.validCell(col+dc,row+dr)) continue;
            const next = key + dc + dr * this.cols, neighbor = cells.get(next) || 0;
            const flow = Math.min(volume * .16, Math.max(0, volume - neighbor - .02) * liquid.flow * dt * .16);
            if (flow) { add(key, -flow); add(next, flow); }
          }
        }
        for (const [key, value] of delta) { const v = Math.max(0, (cells.get(key) || 0) + value); if (v > 1e-10) cells.set(key, v); else cells.delete(key); }
      }
    }
    sample(x, y) {
      const key = Math.floor(y / CELL) * this.cols + Math.floor(x / CELL);
      let grip = 1, drag = 1, kind = null, amount = 0;
      for (const l of this.liquids.values()) {
        const v = l.cells.get(key) || 0, coverage = clamp(v * 3, 0, 1);
        if (coverage > amount) { amount = coverage; kind = l.kind; }
        grip = Math.min(grip, 1 + (l.grip - 1) * coverage); drag += (l.drag - 1) * coverage;
      }
      const wet = (this.world.level.puddles||[this.world.level.puddle]).some(p=>p&&((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1);
      if (wet) { grip = Math.min(grip, .4); drag = Math.min(drag, .6); kind ||= 'water'; }
      return { grip, drag:Math.max(.3, drag), kind };
    }
    wheels(dt) {
      const w = this.world, b = w.body;
      w.wheels.forEach((wheel, i) => {
        const p = this.geometry.casterPose(b, wheel, i), speed = Math.hypot(b.vx - b.omega * (p.y - b.y), b.vy + b.omega * (p.x - b.x));
        wheel.surface = this.sample(p.x, p.y); wheel.coating ||= {};
        if(w.hazardEnabled&&!w.isFloor(p)){wheel.surface={grip:0,drag:0,kind:null};return;}
        for(const [kind,volume]of Object.entries(wheel.coating)) {
          const coat=clamp(volume*1.5,0,.65),material=MATERIALS[kind];
          wheel.surface.grip=Math.min(wheel.surface.grip,1+(material.grip-1)*coat);
          wheel.surface.drag+=(material.drag-1)*coat;
        }
        const key = Math.floor(p.y / CELL) * this.cols + Math.floor(p.x / CELL);
        for (const l of this.liquids.values()) {
          const available = l.cells.get(key) || 0;
          const take = Math.min(available, Math.max(0, .45 - (wheel.coating[l.kind] || 0)), speed * dt * .006);
          if (take > 0) { this.cell(l, p.x, p.y, -take); wheel.coating[l.kind] = (wheel.coating[l.kind] || 0) + take; }
        }
        if (speed > 2) for (const [kind, volume] of Object.entries(wheel.coating)) {
          const deposit = Math.min(volume, speed * dt * .0035);
          if (deposit < .0001) continue;
          wheel.coating[kind] = Math.max(0, volume - deposit);
          this.cell(this.liquid(kind), p.x, p.y, deposit);
          if (!wheel.lastSmear || Math.hypot(wheel.lastSmear.x - p.x, wheel.lastSmear.y - p.y) > 1.5) {
            this.smears.push({x:p.x,y:p.y,a:p.a,kind,alpha:clamp(volume * 2, .12, .7)}); wheel.lastSmear = {x:p.x,y:p.y};
          }
        }
      });
      if (this.smears.length > 1200) this.smears.splice(0, this.smears.length - 1200);
    }
    integrate(dt) {
      for (const s of this.world.shelves) {
        s.vx *= Math.exp(-(s.down ? 3.2 : 5) * dt); s.vy *= Math.exp(-(s.down ? 3.2 : 5) * dt);
        s.omega *= Math.exp(-5 * dt); s.cx += s.vx * dt; s.cy += s.vy * dt; s.a = wrap(s.a + s.omega * dt);
        if (!s.down) {
          // Potential about the supporting feet: g * (H sin(theta) - B cos(theta)).
          const torque = s.mass * G * (s.comHeight * Math.sin(s.tilt) - s.support * Math.cos(s.tilt));
          s.tiltOmega += torque / s.tipInertia * dt; s.tiltOmega *= Math.exp(-.65 * dt); s.tilt += s.tiltOmega * dt;
          if (s.tilt <= 0) { s.tilt = 0; s.tiltOmega = s.tiltOmega < -.1 ? -s.tiltOmega * .12 : 0; }
          if (s.tilt >= Math.PI / 2) {
            s.tilt = Math.PI / 2; s.down = true; this.stats.toppled++;
            this.charge(s, s.cx, s.cy); this.world.emit('shelf-down', {kind:s.kind || 'shelf',x:s.cx,y:s.cy,impact:s.tiltOmega * s.height});
            for (const p of s.stockItems) this.release(p);
            s.tiltOmega = 0;
          }
        }
        for (const p of s.stockItems) if (p.state === 'shelf') {
          p.omega*=Math.exp(-2*dt);p.a=wrap(p.a+p.omega*dt);
          const c = Math.cos(s.a), sin = Math.sin(s.a), gravity = G * Math.sin(s.tilt);
          const ax = gravity * (s.nx * c + s.ny * sin), ay = gravity * (-s.nx * sin + s.ny * c);
          const staticFriction = p.boardFriction * G * Math.cos(s.tilt);
          if (Math.hypot(p.du, p.dv) > .1 || gravity > staticFriction) {
            p.du += ax * dt; p.dv += ay * dt;
            const speed = Math.hypot(p.du, p.dv), loss = Math.min(speed, staticFriction * dt);
            if (speed) { p.du *= 1 - loss / speed; p.dv *= 1 - loss / speed; }
            p.u += p.du * dt; p.v += p.dv * dt;
          } else { p.du = 0; p.dv = 0; }
          this.positionStock(p);
          if (Math.abs(p.u) > s.w / 2 - p.width || Math.abs(p.v) > s.h / 2 - p.width || s.tilt > 1.15) this.release(p);
        }
        if(s.stockItems.some(p=>p.state==='shelf'&&(Math.abs(p.du)+Math.abs(p.dv)>.1)))this.supportedContacts(s);
        s.wobble *= Math.exp(-5 * dt);
      }
      // New fragments are not integrated until the next step.
      const active = this.items.slice();
      for (const p of active) {
        if (p.state === 'shelf' || p.broken || p.sleep > .6) continue;
        if(this.world.hazardEnabled&&!this.world.isFloor(p)&&p.z<=0){p.broken=true;p.state='gone';continue;}
        p.age += dt;
        if (p.z > 0 || p.vz > .5) {
          p.vz -= G * dt; p.z += p.vz * dt; p.state = 'air';
          p.tumble += p.tumbleOmega * dt;
          if (p.z <= 0) {
            const landing = -p.vz; p.z = 0; this.breakProduct(p, landing);
            if (p.broken) continue;
            p.vz = landing > 12 ? landing * p.bounce : 0; p.state = p.vz ? 'air' : 'floor';
            p.tumbleOmega *= .45; p.omega += Math.sin(p.tumble) * landing * .03;
            if (landing > 16) this.world.emit('product-land', {x:p.x,y:p.y,kind:p.kind,material:p.material,impact:landing});
          }
        } else {
          p.state = 'floor'; p.vz = 0; p.tumbleOmega *= Math.exp(-7 * dt); p.tumble += p.tumbleOmega * dt;
          const surface = this.sample(p.x, p.y), decay = Math.exp(-p.drag * surface.drag * dt);
          p.vx *= decay; p.vy *= decay; p.omega *= Math.exp(-p.drag * .8 * dt);
          if (Math.hypot(p.vx, p.vy) < .4 && Math.abs(p.omega) < .1) p.sleep += dt; else p.sleep = 0;
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.a = wrap(p.a + p.omega * dt);
      }
      this.items = this.items.filter(p => !p.broken);
      this.fluidTime += dt;
      if (this.fluidTime >= 1 / 20) { this.flow(this.fluidTime); this.fluidTime = 0; }
    }
    shelfContacts(pass) {
      const w = this.world, geo = this.geometry, b = w.body;
      for (const s of w.shelves) {
        let poly = shelfPolygon(s);
        const hits = [polygonContact(geo.corners(b), poly)];
        const p = geo.point(b, geo.BODY.personX, 0); hits.push(circlePolygon(p.x, p.y, geo.BODY.personRadius, poly));
        hits.forEach((h, i) => { if (h) {this.prepareHit(s,h,i===0?22:15);this.hitShelf(s,h,w.impulse(h,s));} });
        w.wheels.forEach((wheel, i) => {
          const h = polygonContact(geo.casterCorners(b, wheel, i), shelfPolygon(s));
          if (h) {this.prepareHit(s,h,3);this.hitShelf(s,h,w.casterImpulse(h,wheel,i,s));}
        });
        poly = shelfPolygon(s);
        for (const wall of w.walls) { const h = polygonContact(poly, rectPolygon(wall)); if (h) resolve(s, null, h, .04, .55); }
        for (const o of w.objects) {
          if(o.gone||o.falling)continue;
          const h = circlePolygon(o.x, o.y, o.radius, poly);
          if (!h) continue;
          o.inertia ||= o.mass * 50;
          this.prepareHit(s,h,5);h.heightB=5;
          const j = resolve(o, s, h, .08, .45); this.hitShelf(s, h, j);
          if (!o.down && j > 1.8) { o.down = true; w.mess(o.kind, o.x, o.y); }
        }
      }
      for (let i = 0; i < w.shelves.length; i++) for (let k = i + 1; k < w.shelves.length; k++) {
        const a = w.shelves[i], b = w.shelves[k], h = polygonContact(shelfPolygon(a), shelfPolygon(b));
        if (!h) continue;
        const reverse={...h,nx:-h.nx,ny:-h.ny};
        this.prepareHit(a,reverse,20);this.prepareHit(b,h,20);h.heightA=20;h.heightB=20;
        const j = resolve(a, b, h, .05, .4); this.hitShelf(b, h, j);
        this.hitShelf(a, reverse, j);
      }
      this.productContacts(pass);
    }
    productContacts(pass) {
      const w = this.world, geo = this.geometry, b = w.body;
      const active = this.items.filter(p => p.state !== 'shelf' && !p.broken);
      for (const p of active) {
        let poly = boxPolygon(p, p.length, p.width);
        // Loose bottles fit under the basket. Airborne stock can strike its rails.
        if (p.z > 6 && p.z < 26) { const h = polygonContact(geo.corners(b), poly); if (h) { const speed = Math.hypot(p.vx - b.vx, p.vy - b.vy); w.impulse(h, p); this.breakProduct(p, speed); } }
        if (p.z < 6) {
          const person = geo.point(b, geo.BODY.personX, 0), shoe = circlePolygon(person.x, person.y, geo.BODY.personRadius, poly);
          if (shoe) w.impulse(shoe, p);
          w.wheels.forEach((wheel, i) => {
            if (p.broken) return;
            const h = polygonContact(geo.casterCorners(b, wheel, i), boxPolygon(p, p.length, p.width));
            if (!h) return;
            const pose = geo.casterPose(b, wheel, i), speed = Math.hypot(b.vx - b.omega * (pose.y - b.y) - p.vx, b.vy + b.omega * (pose.x - b.x) - p.vy);
            w.casterImpulse(h, wheel, i, p); p.sleep = 0;
            if (pass === 0) { p.wheelHits++; this.stats.wheelContacts++; this.breakProduct(p, speed, true); }
            // Climbing a small object dissipates rolling energy at that caster.
            if (pass === 0 && speed > 3) {
              const loss = Math.min(.018, p.mass * .12), c = Math.cos(wheel.a), s = Math.sin(wheel.a), along = b.vx * c + b.vy * s;
              b.vx -= c * along * loss; b.vy -= s * along * loss;
              wheel.omega += cross(h.x - pose.pivot.x, h.y - pose.pivot.y, -h.nx, -h.ny) * Math.min(.18, speed * .002);
              if (p.kind !== 'shard' && w.time - (wheel.rattleTime || -1) > .16) { wheel.rattleTime = w.time; w.emit('wheel-rattle',{x:p.x,y:p.y,kind:p.kind}); }
            }
          });
        }
        if (p.broken) continue;
        if(p.sleep>.6) continue;
        poly = boxPolygon(p, p.length, p.width);
        for (const wall of w.walls) { const h = polygonContact(poly, rectPolygon(wall)); if (h) { const speed = Math.hypot(p.vx, p.vy); resolve(p, null, h, p.bounce, p.friction); this.breakProduct(p, speed); } }
        for (const s of w.shelves) {
          // A falling product outside the rack can hit its side. Products above
          // a standing rack are not trapped by its floor-level footprint.
          if (p.z > shelfHeight(s) + 2 || p.shelf === s && p.age < .18) continue;
          const h = polygonContact(boxPolygon(p,p.length,p.width), shelfPolygon(s));
          if (h) { const speed = Math.hypot(p.vx-s.vx,p.vy-s.vy); resolve(p,s,h,p.bounce,p.friction); this.breakProduct(p,speed); }
        }
        for (const o of w.objects) {
          if(o.gone||o.falling)continue;
          if (p.z > 10) continue;
          const h = circlePolygon(o.x,o.y,o.radius,boxPolygon(p,p.length,p.width));
          if (h) { o.inertia ||= o.mass * 50; resolve(o,p,h,p.bounce,p.friction); }
        }
      }
      // Spatial bins keep a whole aisle of broken glass cheap to simulate.
      const grid = new Map(), pairs = new Set();
      for (const p of active) {
        if (p.broken) continue;
        const r = Math.hypot(p.length,p.width);
        for (let y = Math.floor((p.y-r)/16); y <= Math.floor((p.y+r)/16); y++) for (let x = Math.floor((p.x-r)/16); x <= Math.floor((p.x+r)/16); x++) {
          const key = x + ',' + y, bin = grid.get(key) || [];
          for (const q of bin) {
            if (q.broken || p.kind === 'shard' && q.kind === 'shard' || p.sleep > .6 && q.sleep > .6 || Math.abs(p.z-q.z)>4) continue;
            const pair = Math.min(p.id,q.id) + ':' + Math.max(p.id,q.id);
            if (pairs.has(pair)) continue; pairs.add(pair);
            const h = polygonContact(boxPolygon(p,p.length,p.width),boxPolygon(q,q.length,q.width));
            if (h) { const speed = Math.hypot(p.vx-q.vx,p.vy-q.vy); resolve(p,q,h,Math.min(p.bounce,q.bounce),Math.sqrt(p.friction*q.friction)); this.breakProduct(p,speed); this.breakProduct(q,speed); }
          }
          bin.push(p); grid.set(key,bin);
        }
      }
    }
  }
  const api = { System, createShelf, shelfPoint, shelfVelocity, shelfHeight, shelfPolygon, hull, boxPolygon, polygonContact, circlePolygon, resolve, CATALOG, MATERIALS, G, CELL, MAX_FRAGMENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CartStock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
