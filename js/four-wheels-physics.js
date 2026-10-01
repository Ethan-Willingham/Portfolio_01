/* All Four Wheels. Positions are in artwork pixels; time is in seconds.
 * A cart and its shopper form one rigid body. Forces change velocity, never
 * heading directly. Steering is a force couple at the handle, so rotating
 * preserves linear momentum apart from small caster reactions. Each free caster
 * has a fixed swivel pivot, a trailing tire contact and its own swivel inertia.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const cross = (x, y, u, v) => x * v - y * u;
  const BODY = Object.freeze({ cartX: 14, halfLength: 17, halfWidth: 11, personX: -16, personRadius: 4, inertia: 470 });
  const WHEELS = [[1, -12], [27, -12], [1, 12], [27, 12]];
  const CASTER = Object.freeze({ trail: 5.5, halfLength: 4, halfWidth: 2, inertia: 0.16, bearingDamping: 1.2, axleOffset: 0.06 });
  const ROOM = Object.freeze({ left: 8, right: 472, top: 8, bottom: 292, width: 480, height: 300 });
  const CHECKPOINT_RADIUS = 20;
  const Stock = typeof module !== 'undefined' && module.exports ? require('./four-wheels-stock.js') : root.CartStock;
  const Tricks = typeof module !== 'undefined' && module.exports ? require('./four-wheels-tricks.js') : root.CartTricks;
  const Terrain = typeof module !== 'undefined' && module.exports ? require('./four-wheels-terrain.js') : root.CartTerrain;
  const Course = typeof module !== 'undefined' && module.exports ? require('./four-wheels-course.js') : root.CartCourse;

  function point(body, x, y) {
    if(body.comHeight)return Terrain.kinematics(body,x,y).p;
    const c = Math.cos(body.a), s = Math.sin(body.a);
    return { x: body.x + x * c - y * s, y: body.y + x * s + y * c };
  }

  function cartTouchesCheckpoint(body, checkpoint, wheels) {
    const states=wheels||WHEELS.map(()=>({a:body.a}));
    return states.some((wheel,i)=>{
      const pose=casterPose(body,wheel,i),c=Math.cos(pose.a),s=Math.sin(pose.a);
      const dx=checkpoint.x-pose.x,dy=checkpoint.y-pose.y;
      const u=dx*c+dy*s,v=-dx*s+dy*c;
      return Math.hypot(u-clamp(u,-CASTER.halfLength,CASTER.halfLength),v-clamp(v,-CASTER.halfWidth,CASTER.halfWidth))<=CHECKPOINT_RADIUS+1e-9;
    });
  }

  function advanceGait(gait, body, dt, input = {}) {
    // The shopper travels around the handle during a turn even if the cart's
    // center is stationary. Measure that velocity, not just the basket speed.
    const c = Math.cos(body.a), s = Math.sin(body.a);
    const vx = body.vx - body.omega * BODY.personX * s;
    const vy = body.vy + body.omega * BODY.personX * c;
    const speed = Math.hypot(vx, vy), moving = speed > .8;
    // Two alternating footfalls per cycle: a walk at normal cart speed and
    // at most three steps a second at a fast jog. Integrating preserves phase.
    const cadence = moving ? Math.min(3, speed / (22 + speed * .1)) : 0;
    gait.phase = (gait.phase + cadence * Math.PI * dt) % TAU;
    const ease = 1 - Math.exp(-12 * dt);
    gait.stride += ((moving ? Math.min(2.8, speed / 18) : 0) - gait.stride) * ease;
    if (moving) {
      gait.forward = (vx * c + vy * s) / speed;
      gait.sideways = (-vx * s + vy * c) / speed;
    }
    gait.speed = speed;
    // Visual posture follows effort and travel at the shopper. The hands stay
    // on the handle; this moves the upper body above the unchanged footprint.
    const forward = vx * c + vy * s, sideways = -vx * s + vy * c;
    const push = clamp(input.push || 0, -1, 1), turn = clamp(input.turn || 0, -1, 1);
    const brake = clamp(input.brake || 0, 0, 1);
    const leanX = clamp(push * 1.9 + forward * .006 - brake * clamp(forward / 40, -1, 1) * 2.5, -2.5, 2.5);
    const leanY = clamp(-turn * 1.4 - body.omega * .55 + sideways * .025 - brake * clamp(sideways / 40, -1, 1) * 2.5, -2.8, 2.8);
    const settle = 1 - Math.exp(-8 * dt);
    gait.leanX = (gait.leanX || 0) + (leanX - (gait.leanX || 0)) * settle;
    gait.leanY = (gait.leanY || 0) + (leanY - (gait.leanY || 0)) * settle;
  }

  function corners(body) {
    return [[-3, -11], [31, -11], [31, 11], [-3, 11]].map(p => point(body, ...p));
  }

  function casterPose(body, wheel, i) {
    const pivot = point(body, ...WHEELS[i]), c = Math.cos(wheel.a), s = Math.sin(wheel.a);
    // The small alternating axle offset also gives rolling resistance a real
    // lever arm, breaking the unstable, perfectly backward caster equilibrium.
    const side = (i % 2 ? -1 : 1) * CASTER.axleOffset;
    if(body.comHeight){const a=wheel.a-body.a,p=casterPoint(body,wheel,i,0,0,0);return {...p,pivot,a:wheel.a};}
    return { pivot, x: pivot.x - CASTER.trail * c - side * s, y: pivot.y - CASTER.trail * s + side * c, a: wheel.a };
  }

  function casterPoint(body,wheel,i,x=0,y=0,z=0){
    const a=wheel.a-body.a,c=Math.cos(a),s=Math.sin(a),side=(i%2?-1:1)*CASTER.axleOffset;
    const X=WHEELS[i][0]+(x-CASTER.trail)*c-(y+side)*s,Y=WHEELS[i][1]+(x-CASTER.trail)*s+(y+side)*c;
    return Terrain.kinematics(body,X,Y,z).p;
  }
  function casterCorners(body, wheel, i) {
    const l = CASTER.halfLength, h = CASTER.halfWidth;
    if(body.comHeight)return [[-l,-h],[l,-h],[l,h],[-l,h]].map(p=>casterPoint(body,wheel,i,...p));
    const pose=casterPose(body,wheel,i);
    return [[-l, -h], [l, -h], [l, h], [-l, h]].map(p => point(pose, ...p));
  }

  function footprint(body, wheels) {
    const p = point(body, BODY.personX, 0), r = BODY.personRadius;
    return [...corners(body), ...wheels.flatMap((w, i) => casterCorners(body, w, i)),
      { x: p.x - r, y: p.y }, { x: p.x + r, y: p.y }, { x: p.x, y: p.y - r }, { x: p.x, y: p.y + r }];
  }

  function exitGeometry(exit) {
    const bounds=exit.bounds||ROOM;
    const vertical = exit.side === 'left' || exit.side === 'right';
    const nx = exit.side === 'left' ? -1 : exit.side === 'right' ? 1 : 0;
    const ny = exit.side === 'top' ? -1 : exit.side === 'bottom' ? 1 : 0;
    const x = vertical ? bounds[exit.side] : exit.center, y = vertical ? exit.center : bounds[exit.side];
    return { ...exit, x, y, nx, ny, a: Math.atan2(ny, nx), vertical,
      low: exit.center - exit.width / 2, high: exit.center + exit.width / 2,
      approach: { x: x - nx * 58, y: y - ny * 58 }, outside: { x: x + nx * 70, y: y + ny * 70 } };
  }

  function roomWalls(exit, open) {
    const walls = [
      { side: 'left', x: -60, y: -60, w: 68, h: 420 },
      { side: 'right', x: 472, y: -60, w: 60, h: 420 },
      { side: 'top', x: 8, y: -60, w: 464, h: 68 },
      { side: 'bottom', x: 8, y: 292, w: 464, h: 60 }
    ];
    if (!open) return walls;
    return walls.flatMap(wall => {
      if (wall.side !== exit.side) return [wall];
      if (exit.vertical) return [{ ...wall, h: exit.low - wall.y }, { ...wall, y: exit.high, h: wall.y + wall.h - exit.high }];
      return [{ ...wall, w: exit.low - wall.x }, { ...wall, x: exit.high, w: wall.x + wall.w - exit.high }];
    });
  }

  // Separating-axis test, with a contact on the cart's face or leading corner.
  function boxContact(body, rect) {
    const center = point(body, BODY.cartX, 0);
    return polygonRectContact(corners(body), center, body.a, rect);
  }

  function polygonRectContact(poly, center, angle, rect) {
    if(rect.poly)return Stock.polygonContact(poly,rect.poly);
    const c = Math.cos(angle), s = Math.sin(angle);
    const rcx = rect.x + rect.w / 2, rcy = rect.y + rect.h / 2;
    let best = Infinity, nx = 0, ny = 0;
    for (const axis of [[1, 0], [0, 1], [c, s], [-s, c]]) {
      let low = Infinity, high = -Infinity;
      for (const p of poly) { const d = p.x * axis[0] + p.y * axis[1]; low = Math.min(low, d); high = Math.max(high, d); }
      const mid = rcx * axis[0] + rcy * axis[1];
      const extent = Math.abs(axis[0]) * rect.w / 2 + Math.abs(axis[1]) * rect.h / 2;
      if (high <= mid - extent || low >= mid + extent) return null;
      // Translation distances, rather than intersection width, handle containment.
      const left = high - (mid - extent), right = mid + extent - low;
      const overlap = Math.min(left, right);
      if (overlap < best) {
        best = overlap;
        const sign = (center.x - rcx) * axis[0] + (center.y - rcy) * axis[1] >= 0 ? 1 : -1;
        nx = axis[0] * sign; ny = axis[1] * sign;
      }
    }
    let min = Infinity;
    for (const p of poly) min = Math.min(min, p.x * nx + p.y * ny);
    const face = poly.filter(p => p.x * nx + p.y * ny < min + 0.01);
    const px = face.reduce((a, p) => a + p.x, 0) / face.length;
    const py = face.reduce((a, p) => a + p.y, 0) / face.length;
    return { nx, ny, depth: best, x: clamp(px, rect.x, rect.x + rect.w), y: clamp(py, rect.y, rect.y + rect.h) };
  }

  function circleRect(x, y, radius, rect) {
    if(rect.poly)return Stock.circlePolygon(x,y,radius,rect.poly);
    const qx = clamp(x, rect.x, rect.x + rect.w), qy = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - qx, dy = y - qy, d = Math.hypot(dx, dy);
    if (d >= radius) return null;
    if (d > 0.001) return { nx: dx / d, ny: dy / d, depth: radius - d, x: qx, y: qy };
    const faces = [[x - rect.x, -1, 0], [rect.x + rect.w - x, 1, 0], [y - rect.y, 0, -1], [rect.y + rect.h - y, 0, 1]].sort((a, b) => a[0] - b[0]);
    const f = faces[0];
    return { nx: f[1], ny: f[2], depth: radius + f[0], x: x + f[1] * f[0], y: y + f[2] * f[0] };
  }

  function cartCircle(body, obj) {
    const c = Math.cos(body.a), s = Math.sin(body.a), dx = obj.x - body.x, dy = obj.y - body.y;
    const x = dx * c + dy * s, y = -dx * s + dy * c;
    const hit = circleRect(x, y, obj.radius, { x: -3, y: -11, w: 34, h: 22 });
    if (hit) {
      const p = point(body, hit.x, hit.y);
      // circleRect's normal points toward the object; this points toward cart.
      return { nx: -hit.nx * c + hit.ny * s, ny: -hit.nx * s - hit.ny * c, depth: hit.depth, x: p.x, y: p.y };
    }
    const person = point(body, BODY.personX, 0);
    const px = person.x - obj.x, py = person.y - obj.y, d = Math.hypot(px, py);
    const radius = BODY.personRadius + obj.radius;
    if (d >= radius) return null;
    const nx = d > 0.001 ? px / d : 1, ny = d > 0.001 ? py / d : 0;
    return { nx, ny, depth: radius - d, x: obj.x + nx * obj.radius, y: obj.y + ny * obj.radius };
  }

  function casterCircle(body, wheel, i, obj) {
    const pose = casterPose(body, wheel, i), c = Math.cos(pose.a), s = Math.sin(pose.a);
    const dx = obj.x - pose.x, dy = obj.y - pose.y;
    const hit = circleRect(dx * c + dy * s, -dx * s + dy * c, obj.radius,
      { x: -CASTER.halfLength, y: -CASTER.halfWidth, w: CASTER.halfLength * 2, h: CASTER.halfWidth * 2 });
    if (!hit) return null;
    const p = point(pose, hit.x, hit.y);
    return { nx: -hit.nx * c + hit.ny * s, ny: -hit.nx * s - hit.ny * c, depth: hit.depth, x: p.x, y: p.y };
  }

  class World {
    constructor(level, practice = false) {
      this.level = level; this.practice = practice;
      this.body = { x: level.start.x, y: level.start.y, a: level.start.a, vx: 0, vy: 0, omega: 0 };
      this.wheels = WHEELS.map(() => ({ a: level.start.a, omega: 0, roll: 0, speed: 0 }));
      this.gait = { phase: 0, stride: 0, forward: 1, sideways: 0, speed: 0, leanX: 0, leanY: 0 };
      this.time = 0; this.penalty = 0; this.bonus = 0; this.messes = 0; this.gate = level.startGate||0;
      this.status = 'running'; this.events = []; this.tracks = []; this.trackTime = 0;
      this.shelves = level.shelves.map((s, i) => Stock.createShelf(s, i));
      this.objects = level.objects.map((o, i) => ({ ...o, id: i, vx: 0, vy: 0, a: i * 1.7, omega: 0, down: false, radius: o.kind === 'cone' ? 5.5 : 8, mass: o.kind === 'cone' ? 0.12 : 0.32 }));
      this.exit = exitGeometry(level.exit);
      this.closedWalls = level.connected?[...level.walls, {...(this.exit.vertical?{x:this.exit.x-2,y:this.exit.low,w:4,h:this.exit.width}:{x:this.exit.low,y:this.exit.y-2,w:this.exit.width,h:4}),side:"checkout"}]:roomWalls(this.exit,false);
      this.openWalls = level.connected?level.walls:roomWalls(this.exit,true);
      this.walls = this.activeWalls();
      this.boundaryContacts = []; this.exiting = false; this.exitEntered = false;
      this.wet = false;
      this.roomIndex=level.startRoom||0;this.safePose={...level.start};this.fall=null;this.falls=0;
      this.hazardEnabled=!!(level.connected||level.hazards?.length);
      this.stock = new Stock.System(this, { point, corners, casterPose, casterCorners, circleRect, cartCircle, casterCircle, BODY, CASTER });
      this.tricks = level.campaign?{score:0,bestCombo:0,counts:{near:0,half:0,full:0,slide:0},claimed:new Set(),block(){},step(){}}:new Tricks.System(this, {point,corners,casterCorners,BODY,Stock});
      if(level.campaign){Course.init(this);Terrain.init(this,{BODY,WHEELS,CASTER});}
    }

    activeWalls() {
      if(this.level.campaign)return Course.wallsNear(this.level,this.body,95);
      const base=this.exitOpen?this.openWalls:this.closedWalls;
      return this.level.connected?[...base,...this.level.portals.filter(p=>this.gate<p.opensAt).map(p=>p.barrier)]:base;
    }
    floorAt(p){return this.level.campaign?Course.sample(this.level,p):this.isFloor(p)?{height:0,gx:0,gy:0}:null;}
    catchPose(){return Course.catchPose(this);}
    wallOverlaps(rect,z,height){if(!this.level.campaign)return true;const floor=this.floorAt({x:rect.x+rect.w/2,y:rect.y+rect.h/2}),base=floor?.height||0;return z+height>(rect.bottom??base)-.5&&z<(rect.top??base+(rect.side==='store'?40:22))+.5;}
    isFloor(p) {
      if(this.level.campaign)return Course.supports(this.level,p);
      const areas=this.level.floorAreas||[{x:8,y:8,w:464,h:284}];
      if(!areas.some(a=>p.x>=a.x&&p.x<=a.x+a.w&&p.y>=a.y&&p.y<=a.y+a.h))return false;
      return !(this.level.hazards||[]).some(h=>((p.x-h.x)/h.rx)**2+((p.y-h.y)/h.ry)**2<1);
    }
    hazardAt(p) {
      return (this.level.hazards||[]).find(h=>((p.x-h.x)/h.rx)**2+((p.y-h.y)/h.ry)**2<1)||{kind:'cliff'};
    }
    checkSupport() {
      if(!this.hazardEnabled||this.level.campaign)return;
      const contacts=this.wheels.map((w,i)=>casterPose(this.body,w,i));
      const missing=contacts.filter(p=>!this.isFloor(p));
      this.unsupported=this.wheels.map((w,i)=>!this.isFloor(contacts[i]));
      if(missing.length<2&&this.isFloor(this.body))return;
      const p=missing[0]||this.body,hazard=this.hazardAt(p),b=this.body;
      const dx=p.x-b.x,dy=p.y-b.y,c=Math.cos(b.a),s=Math.sin(b.a);
      this.fall={kind:hazard.kind,time:0,vz:0,pitch:clamp((dx*c+dy*s)/20,-1,1),roll:clamp((-dx*s+dy*c)/12,-1,1)};
      this.falls++;this.messes++;if(!this.level.campaign)this.penalty+=8;
      if(this.level.campaign){this.fall.catch=Course.catchPose(this);this.lostDistance=Math.max(0,this.distance-this.fall.catch.distance);}
      this.emit('fall',{kind:hazard.kind,x:p.x,y:p.y,seconds:this.level.campaign?0:8,lost:this.lostDistance,catch:this.fall.catch?.chapter});
    }
    fallStep(dt) {
      if(this.level.campaign){const b=this.body;b.x+=b.vx*dt;b.y+=b.vy*dt;b.a=wrap(b.a+b.omega*dt);Terrain.advance(this,dt);this.stock.integrate(dt);this.integrateProps(dt);this.courseDoors(dt);Terrain.circuitStep(this,dt);return;}
      const f=this.fall,b=this.body;f.time+=dt;f.vz-=200*dt;
      b.z=(b.z||0)+f.vz*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.a=wrap(b.a+b.omega*dt);
      b.pitch=f.pitch*Math.min(.9,f.time*1.5);b.rollTilt=f.roll*Math.min(.65,f.time);
      this.wheels.forEach(w=>{w.a=wrap(w.a+w.omega*dt);w.roll+=w.speed*dt;});
      this.stock.integrate(dt);
      if(this.level.campaign){this.integrateProps(dt);this.courseDoors(dt);this.tricks.step(dt,{},true);}
      if(!this.practice&&this.remaining<=0){this.status='lost';this.emit('lost');return;}
      if(f.time>=1.15) {
        const pose=f.catch?.pose||this.safePose;
        Object.assign(b,{x:pose.x,y:pose.y,a:pose.a,vx:0,vy:0,omega:0,z:0,pitch:0,rollTilt:0});
        this.wheels.forEach(w=>Object.assign(w,{a:b.a,omega:0,roll:this.level.campaign?w.roll:0,speed:0}));
        if(f.catch){this.gate=f.catch.gate;this.roomIndex=f.catch.chapter;this.distance=f.catch.distance;}
        Object.assign(this.gait,{stride:0,leanX:0,leanY:0,speed:0});
        this.fall=null;this.unsupported=[];this.boundaryContacts=[];this.emit('respawn',{room:this.roomIndex});
      }
    }
    roomAt(p) {
      return this.level.rooms?.find(r=>p.x>=r.x+8&&p.x<=r.x+472&&p.y>=r.y+8&&p.y<=r.y+292);
    }
    emit(type, data = {}) {
      if(['mess','break','shelf-down','fall'].includes(type))this.trickHit=true;
      this.events.push({ type, ...data });
    }
    get exitOpen() { return this.gate === this.level.gates.length; }
    boundaryContact(rect, hit, part) {
      if (!rect.side) return;
      this.trickHit=true;
      const old = this.boundaryContacts.find(c => c.side === rect.side && c.part === part);
      const contact = { side: rect.side, part, x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, life: .32 };
      if (old) Object.assign(old, contact); else this.boundaryContacts.push(contact);
    }
    mess(kind, x, y) {
      const seconds = kind === 'cone' ? 2 : kind === 'box' ? 3 : 5;
      this.messes++; if(!this.level.campaign)this.penalty += seconds;
      this.emit('mess', { kind, x, y, seconds:this.level.campaign?0:seconds });
    }

    impulse(hit, other) {
      this.trickHit=true;
      if(other)this.tricks.block(other);
      const b = this.body, rx = hit.x - b.x, ry = hit.y - b.y;
      const center = other && { x: other.cx ?? other.x, y: other.cy ?? other.y };
      const qx = other ? hit.x - center.x : 0, qy = other ? hit.y - center.y : 0;
      const velocity = other && other.velocityAt ? other.velocityAt(hit) : { x: other ? other.vx - (other.omega || 0) * qy : 0, y: other ? other.vy + (other.omega || 0) * qx : 0 };
      const ox = velocity.x, oy = velocity.y;
      const vx = b.vx - b.omega * ry - ox, vy = b.vy + b.omega * rx - oy;
      const vn = vx * hit.nx + vy * hit.ny;
      const oi = other ? 1 / other.mass : 0;
      const ii = other ? 1 / (other.inertia || other.mass * 50) : 0;
      const rn = cross(rx, ry, hit.nx, hit.ny), on = cross(qx, qy, hit.nx, hit.ny);
      const denom = 1 + oi + rn * rn / BODY.inertia + on * on * ii + (other?.tiltMass ? other.tiltMass(hit.nx,hit.ny,hit.height) : 0);
      let j = 0;
      if (vn < 0) {
        j = -(1 + (Math.abs(vn) < 3 ? 0 : other?.bounce ?? .12)) * vn / denom;
        b.vx += hit.nx * j; b.vy += hit.ny * j; b.omega += rn * j / BODY.inertia;
        if (other) { other.vx -= hit.nx * j * oi; other.vy -= hit.ny * j * oi; other.omega -= on * j * ii; if(other.tiltImpulse)other.tiltImpulse(-hit.nx*j,-hit.ny*j,hit.height); }
        const tx = -hit.ny, ty = hit.nx, rt = cross(rx, ry, tx, ty);
        const ot = cross(qx, qy, tx, ty), mu = other?.friction ?? .24;
        const ov=other&&other.velocityAt?other.velocityAt(hit):{x:other?other.vx-other.omega*qy:0,y:other?other.vy+other.omega*qx:0};
        const tangent=(b.vx-b.omega*ry-ov.x)*tx+(b.vy+b.omega*rx-ov.y)*ty;
        const friction = clamp(-tangent / (1 + oi + rt * rt / BODY.inertia + ot * ot * ii+(other?.tiltMass?other.tiltMass(tx,ty,hit.height):0)), -j * mu, j * mu);
        b.vx += tx * friction; b.vy += ty * friction; b.omega += rt * friction / BODY.inertia;
        if (other) { other.vx -= tx * friction * oi; other.vy -= ty * friction * oi; other.omega -= ot * friction * ii; if(other.tiltImpulse)other.tiltImpulse(-tx*friction,-ty*friction,hit.height); }
      }
      // Shared positional correction keeps cones light without pushing cart far.
      const correction = Math.max(0, hit.depth - 0.01) / (1 + oi);
      b.x += hit.nx * correction; b.y += hit.ny * correction;
      if (other) {
        if (other.cx !== undefined) { other.cx -= hit.nx * correction * oi; other.cy -= hit.ny * correction * oi; }
        else { other.x -= hit.nx * correction * oi; other.y -= hit.ny * correction * oi; }
      }
      return j;
    }

    casterImpulse(hit, wheel, i, other) {
      this.trickHit=true;
      if(other)this.tricks.block(other);
      const b = this.body, { pivot } = casterPose(b, wheel, i);
      const px = pivot.x - b.x, py = pivot.y - b.y, qx = hit.x - pivot.x, qy = hit.y - pivot.y;
      const nx = hit.nx, ny = hit.ny;
      const rp = cross(px, py, nx, ny), rq = cross(qx, qy, nx, ny);
      const oi = other ? 1 / other.mass : 0;
      const ii = other ? 1 / (other.inertia || other.mass * 50) : 0;
      const ox = other ? hit.x - (other.cx ?? other.x) : 0, oy = other ? hit.y - (other.cy ?? other.y) : 0;
      const on = cross(ox, oy, nx, ny);
      const velocity = other && other.velocityAt ? other.velocityAt(hit) : { x: other ? other.vx - (other.omega || 0) * oy : 0, y: other ? other.vy + (other.omega || 0) * ox : 0 };
      const mass = 1 + oi + rp * rp / BODY.inertia + rq * rq / CASTER.inertia + on * on * ii+(other?.tiltMass?other.tiltMass(nx,ny,hit.height):0);
      const vx = b.vx - b.omega * py - wheel.omega * qy - velocity.x;
      const vy = b.vy + b.omega * px + wheel.omega * qx - velocity.y;
      const vn = vx * nx + vy * ny;
      const j = vn < 0 ? -1.08 * vn / mass : 0;
      b.vx += nx * j; b.vy += ny * j; b.omega += rp * j / BODY.inertia;
      wheel.omega += rq * j / CASTER.inertia;
      if (other) { other.vx -= nx * j * oi; other.vy -= ny * j * oi; other.omega -= on * j * ii; if(other.tiltImpulse)other.tiltImpulse(-nx*j,-ny*j,hit.height); }
      const correction = Math.max(0, hit.depth - .01) / mass;
      b.x += nx * correction; b.y += ny * correction;
      b.a = wrap(b.a + clamp(rp * correction / BODY.inertia, -.1, .1));
      wheel.a = wrap(wheel.a + clamp(rq * correction / CASTER.inertia, -.25, .25));
      if (other) {
        if (other.cx !== undefined) { other.cx -= nx * correction * oi; other.cy -= ny * correction * oi; }
        else { other.x -= nx * correction * oi; other.y -= ny * correction * oi; }
      }
      return j;
    }

    casterForces(dt, rolling) {
      const b = this.body;
      this.wheels.forEach((w, i) => {
        const pose = casterPose(b, w, i), rx = pose.pivot.x - b.x, ry = pose.pivot.y - b.y;
        const vx = b.vx - b.omega * ry, vy = b.vy + b.omega * rx;
        const side = (i % 2 ? -1 : 1) * CASTER.axleOffset;
        const along = vx * Math.cos(w.a) + vy * Math.sin(w.a) - side * w.omega;
        // Rolling resistance at the offset axle acts on the fork. The tiny
        // lateral offset is mirrored across wheels, rather than random noise.
        const torque = (i % 2 ? -1 : 1) * CASTER.axleOffset * rolling / 4 * (w.surface?.drag ?? 1) * clamp(along, -1, 1);
        w.omega += torque * dt / CASTER.inertia; b.omega -= torque * dt / BODY.inertia;
        // Bearing drag exchanges angular momentum with the chassis; an idle
        // caster retains its orientation instead of returning to cart heading.
        const j = -(w.omega - b.omega) * (1 - Math.exp(-CASTER.bearingDamping * dt)) / (1 / CASTER.inertia + 1 / BODY.inertia);
        w.omega += j / CASTER.inertia; b.omega -= j / BODY.inertia;
      });
    }

    solveCasters() {
      const b = this.body;
      // Contact C = pivot P - trail * heading. Its lateral velocity is
      // V(P).normal - trail * swivelRate. Ground impulses remove that slip,
      // exchanging momentum with both the chassis and the independent fork.
      for (let pass = 0; pass < 4; pass++) this.wheels.forEach((w, i) => {
        const { pivot } = casterPose(b, w, i), rx = pivot.x - b.x, ry = pivot.y - b.y;
        const nx = -Math.sin(w.a), ny = Math.cos(w.a), lever = cross(rx, ry, nx, ny);
        const lateral = (b.vx - b.omega * ry) * nx + (b.vy + b.omega * rx) * ny - CASTER.trail * w.omega;
        const j = -lateral * (w.surface?.grip ?? 1) / (1 + lever * lever / BODY.inertia + CASTER.trail ** 2 / CASTER.inertia);
        b.vx += nx * j; b.vy += ny * j; b.omega += lever * j / BODY.inertia;
        w.omega -= CASTER.trail * j / CASTER.inertia;
      });
    }

    step(dt, input = {}) {
      if (this.status !== 'running') return;
      // Caller uses a 120 Hz fixed step. Clamp external steps to avoid tunneling.
      dt = clamp(dt, 0, 1 / 120);
      const b = this.body;
      this.trickHit=false;
      this.time += dt;
      if(this.fall){this.fallStep(dt);this.tricks.step(dt,{},true);return;}
      this.walls = this.activeWalls();
      this.boundaryContacts.forEach(c => { c.life -= dt; });
      this.boundaryContacts = this.boundaryContacts.filter(c => c.life > 0);
      this.stock.wheels(dt);
      const grip = this.wheels.reduce((n, w) => n + w.surface.grip, 0) / 4;
      const resistance = this.wheels.reduce((n, w) => n + w.surface.drag, 0) / 4;
      this.wet = grip < .95;
      const push = clamp(input.push || 0, -1, 1), turn = clamp(input.turn || 0, -1, 1);
      const traction=this.level.campaign?this.ground.feet:1;
      const force = push * (push >= 0 ? 78 : 50)*traction;
      b.vx += Math.cos(b.a) * force * dt; b.vy += Math.sin(b.a) * force * dt;
      b.omega += turn * 8.8 * traction * dt;
      b.omega *= Math.exp(-(this.level.campaign?4.2*traction:4.2) * dt);
      const speed = Math.hypot(b.vx, b.vy);
      const brake = clamp(input.brake || 0, 0, 1);
      const drag = .34 * resistance;
      const rolling = 4 * resistance;
      const reduction = Math.exp(-drag * dt) * Math.max(0, 1 - (rolling + brake * 175 * grip) * dt / Math.max(speed, 0.001));
      b.vx *= reduction; b.vy *= reduction;
      if (brake) b.omega *= Math.exp(-6 * brake * (this.level.campaign?grip:1) * dt);
      // Unequal grip at the four ground contacts creates a braking yaw moment.
      // The mean force is applied above; these deviations sum to zero on a dry
      // floor and preserve the original handling when all tires see one surface.
      this.wheels.forEach((w, i) => {
        const p = casterPose(b,w,i), rx=p.x-b.x, ry=p.y-b.y;
        const vx=b.vx-b.omega*ry,vy=b.vy+b.omega*rx,d=Math.hypot(vx,vy);
        if(d<1) return;
        const difference=(175*brake*(w.surface.grip-grip)+4*(w.surface.drag-resistance))*dt/4;
        const ix=-vx/d*difference,iy=-vy/d*difference;
        b.vx+=ix;b.vy+=iy;b.omega+=cross(rx,ry,ix,iy)/BODY.inertia;
      });
      // Air/rolling resistance rises smoothly above a comfortable walking run.
      const limit = Math.hypot(b.vx, b.vy);
      const maxSpeed=this.level.campaign?210:135;
      if (limit > maxSpeed) { b.vx *= maxSpeed / limit; b.vy *= maxSpeed / limit; }
      this.casterForces(dt, rolling);
      this.solveCasters();
      b.x += b.vx * dt; b.y += b.vy * dt; b.a = wrap(b.a + b.omega * dt);
      this.wheels.forEach(w => { w.a = wrap(w.a + w.omega * dt); });
      if(this.level.campaign){Terrain.advance(this,dt,input);Terrain.circuitStep(this,dt);}
      this.stock.integrate(dt);
      if(this.level.campaign)this.courseDoors(dt);
      this.integrateProps(dt);
      for (let pass = 0; pass < 4; pass++) {
        for (const rect of this.walls) {
          const hits = [this.wallOverlaps(rect,b.z||0,23)?boxContact(b, rect):null];
          const person = point(b, BODY.personX, 0);
          hits.push(this.wallOverlaps(rect,person.z||0,29)?circleRect(person.x, person.y, BODY.personRadius, rect):null);
          for (let k = 0; k < hits.length; k++) {
            const h = hits[k];
            if (!h) continue;
            this.boundaryContact(rect, h, k === 0 ? 'cart' : 'shopper');
            const impact = this.impulse(h);
            if (impact > 14 && pass === 0 && !rect.side) this.emit('bump', { x: h.x, y: h.y, impact });
          }
          this.wheels.forEach((wheel, i) => {
            const pose = casterPose(b, wheel, i);
            if(!this.wallOverlaps(rect,pose.z||0,7))return;
            const h = polygonRectContact(casterCorners(b, wheel, i), pose, wheel.a, rect);
            if (!h) return;
            this.boundaryContact(rect, h, 'wheel:' + i);
            const impact = this.casterImpulse(h, wheel, i);
          });
        }
        this.stock.shelfContacts(pass);
        for (const o of this.objects) {
          if(o.gone||o.falling||(this.level.campaign&&Math.abs((b.z||0)-(o.z||0))>19))continue;
          const h = cartCircle(b, o);
          if (h) {
            const impact = this.impulse(h, o);
            if (!o.down && impact > 1.8) { o.down = true; this.mess(o.kind, o.x, o.y); }
          }
          this.wheels.forEach((wheel, i) => {
            const contact = casterCircle(b, wheel, i, o);
            if (!contact) return;
            const impact = this.casterImpulse(contact, wheel, i, o);
            if (!o.down && impact > 1.8) { o.down = true; this.mess(o.kind, o.x, o.y); }
          });
        }
        for (let i = 0; i < this.objects.length; i++) for (let k = i + 1; k < this.objects.length; k++) {
          const a = this.objects[i], z = this.objects[k];if(a.gone||z.gone||a.falling||z.falling)continue;
          const dx = a.x - z.x, dy = a.y - z.y, d = Math.hypot(dx, dy);
          const overlap = a.radius + z.radius - d;
          if (overlap <= 0 || d < 0.001) continue;
          const nx = dx / d, ny = dy / d, total = 1 / a.mass + 1 / z.mass;
          a.x += nx * overlap / a.mass / total; a.y += ny * overlap / a.mass / total;
          z.x -= nx * overlap / z.mass / total; z.y -= ny * overlap / z.mass / total;
          const vn = (a.vx - z.vx) * nx + (a.vy - z.vy) * ny;
          if (vn < 0) {
            const j = -1.1 * vn / total;
            a.vx += nx * j / a.mass; a.vy += ny * j / a.mass;
            z.vx -= nx * j / z.mass; z.vy -= ny * j / z.mass;
            if (j > 1.8) for (const o of [a, z]) if (!o.down) { o.down = true; this.mess(o.kind, o.x, o.y); }
          }
        }
      }
      // A settled contact can have zero penetration and zero speed. The tiny
      // tolerance catches actual touching without requiring an impact impulse.
      for (const wall of this.walls) {
        if(!this.wallOverlaps(wall,b.z||0,23))continue;
        const touch = { ...wall, x: wall.x - .04, y: wall.y - .04, w: wall.w + .08, h: wall.h + .08 };
        if(wall.poly){const x=wall.x+wall.w/2,y=wall.y+wall.h/2;touch.poly=wall.poly.map(p=>({x:p.x+Math.sign(p.x-x)*.04,y:p.y+Math.sign(p.y-y)*.04}));}
        const cart = boxContact(b, touch), person = point(b, BODY.personX, 0);
        if (cart) this.boundaryContact(wall, cart, 'cart');
        const shopper = circleRect(person.x, person.y, BODY.personRadius, touch);
        if (shopper) this.boundaryContact(wall, shopper, 'shopper');
        this.wheels.forEach((wheel, i) => {
          const pose = casterPose(b, wheel, i), hit = polygonRectContact(casterCorners(b, wheel, i), pose, wheel.a, touch);
          if (hit) this.boundaryContact(wall, hit, 'wheel:' + i);
        });
      }
      this.solveCasters();
      this.wheels.forEach((w, i) => {
        const p = casterPose(b, w, i).pivot, rx = p.x - b.x, ry = p.y - b.y;
        const vx = b.vx - b.omega * ry, vy = b.vy + b.omega * rx;
        w.speed = vx * Math.cos(w.a) + vy * Math.sin(w.a) - (i % 2 ? -1 : 1) * CASTER.axleOffset * w.omega;
        w.roll += w.speed * dt;
      });
      advanceGait(this.gait, b, dt, input);
      this.trackTime += dt;
      if ((!this.level.campaign||!this.ground.airborne)&&Math.hypot(b.vx, b.vy) > 35 && this.trackTime > 0.065) {
        this.trackTime = 0;
        for (const i of [0, 2]) { const p = casterPose(b, this.wheels[i], i); this.tracks.push({ x: p.x, y: p.y, a: p.a, life: 3 }); }
      }
      this.tracks.forEach(t => { t.life -= dt; }); this.tracks = this.tracks.filter(t => t.life > 0);
      const target = this.level.gates[this.gate];
      if (target && (!this.level.campaign||this.wheels.some(w=>w.load>.01)) && cartTouchesCheckpoint(b, target, this.wheels)) { this.emit('gate', { index: this.gate, x: target.x, y: target.y }); this.gate++; }
      const room=this.level.campaign?null:this.roomAt(b);
      if(room&&room.index!==this.roomIndex){this.roomIndex=room.index;this.safePose={...room.spawn};this.emit('room',{index:room.index});}
      if(this.level.campaign)Course.update(this);
      this.checkSupport();
      const expired=!this.practice&&this.remaining<=0;
      this.tricks.step(dt,input,this.trickHit||expired);
      if(this.fall){if(!this.practice&&this.remaining<=0){this.status='lost';this.emit('lost');}return;}
      if(this.level.campaign){
        const f=this.level.finish;
        if(this.gate===this.level.gates.length&&Math.hypot(point(b,BODY.personX,0).x-f.x,point(b,BODY.personX,0).y-f.y)+BODY.personRadius<=f.radius&&footprint(b,this.wheels).every(p=>Math.hypot(p.x-f.x,p.y-f.y)<=f.radius)){this.distance=this.peak=this.level.totalDistance;this.status='won';this.emit('won');}
        return;
      }
      const e = this.exit, shape = footprint(b, this.wheels), tangent = e.vertical ? b.y : b.x;
      const distance = p => (p.x - e.x) * e.nx + (p.y - e.y) * e.ny;
      this.exiting = this.exitOpen && tangent >= e.low && tangent <= e.high && shape.some(p => distance(p) > 0);
      if (this.exiting) this.exitEntered = true;
      const cleared = this.exitOpen && this.exitEntered && shape.every(p => distance(p) > 8);
      this.walls = this.activeWalls();
      // An expired clock cannot be rescued by finishing on the same step.
      if (expired) { this.status = 'lost'; this.emit('lost'); }
      else if (cleared) { this.status = 'won'; this.emit('won'); }
    }
    integrateProps(dt) {
      for (const o of this.objects) {
        if(o.gone)continue;
        if(o.falling){o.vz-=200*dt;o.z+=o.vz*dt;o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.z< -55)o.gone=true;continue;}
        if(this.hazardEnabled&&!this.isFloor(o)){o.falling=true;o.z=o.z||0;o.vz=0;continue;}
        if(this.level.campaign)o.z=this.floorAt(o)?.height??o.z??0;
        const decay = Math.exp(-(o.kind === 'cone' ? 2.0 : 2.8) * dt);
        o.vx *= decay; o.vy *= decay; o.omega *= Math.exp(-3 * dt);
        o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.omega * dt;
        for (const rect of this.level.campaign?Course.wallsNear(this.level,o,25):this.walls) {
          const h = circleRect(o.x, o.y, o.radius, rect);
          if (!h) continue;
          o.x += h.nx * h.depth; o.y += h.ny * h.depth;
          const vn = o.vx * h.nx + o.vy * h.ny;
          if (vn < 0) { o.vx -= 1.18 * vn * h.nx; o.vy -= 1.18 * vn * h.ny; }
        }
      }
    }
    courseDoors(dt) {
      for(const d of this.trackDoors){
        if(d.broken)continue;
        d.omega+=-2.5*wrap(d.a-d.rest)*dt;d.omega*=Math.exp(-1.8*dt);d.a=wrap(d.a+d.omega*dt);
        if(Math.abs(wrap(d.a-d.rest))>1.65){d.a=wrap(d.rest+Math.sign(wrap(d.a-d.rest))*1.65);d.omega*= -.08;}
        if(this.fall||Math.hypot(this.body.x-d.cx,this.body.y-d.cy)>d.length+65)continue;
        const poly=Course.doorPolygon(d),hits=[Stock.polygonContact(corners(this.body),poly)],person=point(this.body,BODY.personX,0);
        hits.push(Stock.circlePolygon(person.x,person.y,BODY.personRadius,poly));
        let impact=0;
        for(const h of hits)if(h)impact=Math.max(impact,this.impulse(h,d));
        this.wheels.forEach((q,i)=>{const h=Stock.polygonContact(casterCorners(this.body,q,i),poly);if(h)impact=Math.max(impact,this.casterImpulse(h,q,i,d));});
        if(impact>12){d.broken=true;this.emit('break',{kind:'door',material:'glass',x:d.cx,y:d.cy,impact});const count=Math.min(10,Stock.MAX_FRAGMENTS-this.stock.fragments);this.stock.fragments+=count;for(let i=0;i<count;i++){const a=i*2.399;this.stock.addProduct('shard',d.cx+Math.cos(d.a)*d.length*.5,d.cy+Math.sin(d.a)*d.length*.5,{z:8+i%4*5,vz:12+i,vx:Math.cos(a)*25,vy:Math.sin(a)*25,a,material:'glass',color:1});}}
      }
    }
    get remaining() { return this.level.campaign?Infinity:Math.max(0, this.level.limit - this.time - this.penalty + this.bonus); }
    get result() {
      const elapsed = Math.max(.1,this.time + this.penalty - this.bonus);
      return { time: elapsed, driving: this.time, penalty: this.penalty, bonus: this.bonus, style: this.tricks.score, bestCombo: this.tricks.bestCombo, tricks: {...this.tricks.counts}, messes: this.messes, stars: this.messes === 0 && elapsed <= this.level.par ? 3 : this.messes <= 2 ? 2 : 1 };
    }
  }
  const api = { World, casterPoint, BODY, WHEELS, CASTER, ROOM, CHECKPOINT_RADIUS, cartTouchesCheckpoint, point, advanceGait, corners, casterPose, casterCorners, footprint, exitGeometry, boxContact, circleRect, cartCircle, casterCircle, wrap, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CartPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
