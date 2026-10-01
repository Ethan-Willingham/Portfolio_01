/* Read-only observations of the real cart pose and obstacle geometry.
 * Style never changes forces, velocity, wheel alignment or collision handling. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, BONUS_CAP = 12, COMBO_WINDOW = 5;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function closest(p, a, b) {
    const x = b.x-a.x, y = b.y-a.y, t = clamp(((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y || 1), 0, 1);
    return {x:a.x+t*x, y:a.y+t*y};
  }
  function inside(p, poly) {
    let value = false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i], b=poly[j];
      if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) value=!value;
    }
    return value;
  }
  function polygonGap(a, b, contact) {
    if (contact(a,b)) return {gap:0, x:a[0].x, y:a[0].y};
    let best={gap:Infinity};
    for (const [points,edges] of [[a,b],[b,a]]) for (const p of points) for (let i=0;i<edges.length;i++) {
      const q=closest(p,edges[i],edges[(i+1)%edges.length]), gap=Math.hypot(p.x-q.x,p.y-q.y);
      if(gap<best.gap) best={gap,x:(p.x+q.x)/2,y:(p.y+q.y)/2};
    }
    return best;
  }
  function circleGap(p, radius, poly) {
    if (inside(p,poly)) return {gap:0,x:p.x,y:p.y};
    let best={gap:Infinity};
    for (let i=0;i<poly.length;i++) {
      const q=closest(p,poly[i],poly[(i+1)%poly.length]), d=Math.hypot(p.x-q.x,p.y-q.y), gap=Math.max(0,d-radius);
      if(gap<best.gap) best={gap,x:q.x,y:q.y};
    }
    return best;
  }
  class System {
    constructor(world, geometry) {
      this.world=world;this.geometry=geometry;
      this.score=0;this.combo=0;this.bestCombo=0;this.chainLife=0;
      this.counts={near:0,half:0,full:0,slide:0};
      this.spin=null;this.slide=null;this.effects=[];this.claimed=new Set();this.dirty=new Set();this.pending=new Map();
      this.distance=0;this.nearClock=0;this.blockedUntil=0;this.nextSpinDistance=0;this.nextSlideDistance=0;
      this.previous={...world.body};
    }
    interrupt() {
      if(this.combo>1)this.world.emit('combo-break',{combo:this.combo});
      for(const key of this.pending.keys())this.dirty.add(key);
      this.spin=null;this.slide=null;this.pending.clear();this.combo=0;this.chainLife=0;
      this.blockedUntil=this.world.time+.45;
    }
    block(obstacle) {
      const key=obstacle.cx!==undefined&&obstacle.kind!=='door'?'shelf:'+obstacle.id:['cone','box'].includes(obstacle.kind)?'prop:'+obstacle.id:null;
      if(key){this.dirty.add(key);this.pending.delete(key);}
    }
    award(kind, x, y, upgrade=false, detail={}) {
      const w=this.world;
      if (!w.practice && w.remaining<=0) return;
      this.combo=upgrade?Math.max(1,this.combo):this.chainLife>0?Math.min(4,this.combo+1):1;
      this.bestCombo=Math.max(this.bestCombo,this.combo);this.chainLife=COMBO_WINDOW;
      const spec={near:{name:'Close call',points:75,seconds:1},half:{name:'180° swivel',points:100,seconds:1},full:{name:'360° swivel',points:250,seconds:2},slide:{name:'Power slide',points:75,seconds:1}}[kind];
      const points=spec.points*this.combo, seconds=w.practice||w.level.campaign?0:Math.min(spec.seconds,BONUS_CAP-w.bonus);
      this.score+=points;w.bonus+=seconds;this.counts[kind]++;
      if(upgrade)this.counts.half--;
      const effect={kind,x,y,life:1,maxLife:1,...detail};this.effects.push(effect);
      w.emit('trick',{kind,name:spec.name,x,y,points,seconds,combo:this.combo,upgrade,...detail});
    }
    gapTo(obstacle, parts, person) {
      const {Stock,BODY}=this.geometry;
      if(obstacle.radius!==undefined) {
        let best=circleGap(obstacle,obstacle.radius,parts[0]);
        for (const poly of parts.slice(1)) {const q=circleGap(obstacle,obstacle.radius,poly);if(q.gap<best.gap)best=q;}
        const d=Math.hypot(person.x-obstacle.x,person.y-obstacle.y),gap=Math.max(0,d-BODY.personRadius-obstacle.radius);
        if(gap<best.gap)best={gap,x:person.x,y:person.y};
        return best;
      }
      const poly=Stock.shelfPolygon(obstacle);let best=circleGap(person,BODY.personRadius,poly);
      for(const part of parts){const q=polygonGap(part,poly,Stock.polygonContact);if(q.gap<best.gap)best=q;}
      return best;
    }
    nearMisses(speed) {
      const w=this.world,g=this.geometry,b=w.body;
      const parts=[g.corners(b),...w.wheels.map((q,i)=>g.casterCorners(b,q,i))],person=g.point(b,g.BODY.personX,0);
      const obstacles=[...w.shelves.map(o=>({o,key:'shelf:'+o.id})),...w.objects.map(o=>({o,key:'prop:'+o.id}))];
      for(const {o,key} of obstacles) {
        if(this.claimed.has(key)||o.down||o.gone||o.falling||o.spilled||o.tilt>.2){this.pending.delete(key);continue;}
        const radius=o.radius??Math.hypot(o.w,o.h)/2, center={x:o.cx??o.x,y:o.cy??o.y};
        let gap={gap:Infinity};
        if(Math.hypot(b.x-center.x,b.y-center.y)<radius+70)gap=this.gapTo(o,parts,person);
        if(this.dirty.has(key)){if(gap.gap>16)this.dirty.delete(key);this.pending.delete(key);continue;}
        if(gap.gap<=.15){this.pending.delete(key);continue;}
        let pass=this.pending.get(key);
        if(gap.gap<=6&&speed>=22) {
          if(!pass){pass={...gap,started:w.time,distance:this.distance};this.pending.set(key,pass);}
          else if(gap.gap<pass.gap)Object.assign(pass,gap);
        }
        if(pass&&gap.gap>12) {
          this.pending.delete(key);
          if(speed>=16&&w.time-pass.started>=.12&&this.distance-pass.distance>=14) {
            this.claimed.add(key);this.award('near',pass.x,pass.y,false,{obstacle:key,clearance:pass.gap});
          }
        }
        if(pass&&w.time-pass.started>3)this.pending.delete(key);
      }
    }
    step(dt, input={}, hit=false) {
      const w=this.world,b=w.body,old=this.previous,travel=Math.hypot(b.x-old.x,b.y-old.y),rotation=wrap(b.a-old.a),speed=Math.hypot(b.vx,b.vy);
      this.previous={x:b.x,y:b.y,a:b.a};
      this.chainLife=Math.max(0,this.chainLife-dt);if(!this.chainLife)this.combo=0;
      for(const e of this.effects)e.life-=dt;this.effects=this.effects.filter(e=>e.life>0);
      // Pose jumps, contacts and unsupported wheels cannot complete a clean trick.
      const invalid=hit||w.fall||w.unsupported?.some(Boolean)||travel>Math.max(4,speed*dt*2+1)||Math.abs(rotation)>.15||!w.practice&&w.remaining<=0;
      if(invalid){this.interrupt();return;}
      this.distance+=travel;
      if(w.time<this.blockedUntil)return;
      const turning=Math.abs(b.omega)>.35&&Math.abs(input.turn||0)>.15;
      if(!this.spin&&turning&&speed>=14&&this.distance>=this.nextSpinDistance) {
        this.spin={direction:Math.sign(b.omega),angle:0,distance:0,opposite:0,quiet:0,tier:0,startAngle:b.a-rotation};
      }
      const spin=this.spin;
      if(spin) {
        spin.distance+=travel;const advance=rotation*spin.direction;
        spin.angle=Math.max(0,spin.angle+advance);spin.opposite=advance<0?spin.opposite-advance:Math.max(0,spin.opposite-advance);
        spin.quiet=speed<8||Math.abs(b.omega)<.25?spin.quiet+dt:0;
        if(spin.quiet>.35||spin.opposite>.12) {
          if(spin.tier)this.nextSpinDistance=this.distance+45;
          this.spin=null;
        }else {
          if(spin.tier===0&&spin.angle>=Math.PI&&spin.distance>=20){spin.tier=1;this.award('half',b.x,b.y,false,{direction:spin.direction,startAngle:spin.startAngle});}
          if(spin.tier===1&&spin.angle>=TAU&&spin.distance>=45){spin.tier=2;this.award('full',b.x,b.y,true,{direction:spin.direction,startAngle:spin.startAngle});}
        }
      }
      const sideways=Math.abs(-b.vx*Math.sin(b.a)+b.vy*Math.cos(b.a)),sliding=speed>=28&&sideways/speed>.86&&Math.abs(b.omega)<.8&&!input.brake&&!this.spin;
      if(sliding&&this.distance>=this.nextSlideDistance) {
        this.slide||={time:0,distance:0};this.slide.time+=dt;this.slide.distance+=travel;
        if(this.slide.time>=.6&&this.slide.distance>=20){this.award('slide',b.x,b.y);this.nextSlideDistance=this.distance+100;this.slide=null;}
      }else this.slide=null;
      this.nearClock+=dt;
      if(this.nearClock>=.05){this.nearClock=0;this.nearMisses(speed);}
    }
  }
  const api={System,BONUS_CAP,COMBO_WINDOW,polygonGap,circleGap};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartTricks=api;
})(typeof globalThis!=='undefined'?globalThis:this);
