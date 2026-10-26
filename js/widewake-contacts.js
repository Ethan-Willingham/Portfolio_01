/* Bounded hull contacts. No renderer, timers, or global enemy pair pass. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),MAX_FRIENDS=24,MAX_ENEMY_CHECKS=96,MAX_ENEMY_PAIRS=32,PAIR_SLOTS=4096;
  const hash=(x,y)=>(Math.imul(x,73856093)^Math.imul(y,19349663))&32767;
  function geometry(g,spec,outline,ram=false){if(g.length===spec.length&&g.width===spec.width&&g.ram===ram)return g;const points=g.points;let radius=0;for(let i=0;i<outline.length;i++){const x=(ram&&i===6?.56:outline[i][0])*spec.length,y=outline[i][1]*spec.width;points[i*2]=x;points[i*2+1]=y;radius=Math.max(radius,Math.hypot(x,y));}g.radius=radius;g.length=spec.length;g.width=spec.width;g.ram=ram;return g;}
  function body(){return{vertices:new Float64Array(26),x:0,y:0,px:0,py:0,angle:0,previousAngle:0,c:1,s:0,mass:1,invMass:1,invI:1,vx:0,vy:0,turn:0,enemy:-1,ship:null,spec:null,geometry:{points:new Float64Array(26),radius:0,length:0,width:0,ram:false}};}
  function position(b,t){const angle=b.previousAngle+(Math.atan2(Math.sin(b.angle-b.previousAngle),Math.cos(b.angle-b.previousAngle)))*t,c=Math.cos(angle),s=Math.sin(angle),x=b.px+(b.x-b.px)*t,y=b.py+(b.y-b.py)*t,p=b.geometry.points,v=b.vertices;for(let i=0;i<p.length;i+=2){v[i]=x+p[i]*c-p[i+1]*s;v[i+1]=y+p[i]*s+p[i+1]*c;}return v;}
  function sat(a,b,out,t=1){
    const av=position(a,t),bv=position(b,t),dx=(b.px-a.px)+((b.x-b.px)-(a.x-a.px))*t,dy=(b.py-a.py)+((b.y-b.py)-(a.y-a.py))*t;let overlap=Infinity,nx=0,ny=0;
    for(let side=0;side<2;side++){const v=side?bv:av;for(let i=0;i<v.length;i+=2){const j=(i+2)%v.length,ex=v[j]-v[i],ey=v[j+1]-v[i+1],length=Math.hypot(ex,ey)||1,ax=ey/length,ay=-ex/length;let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
      for(let k=0;k<av.length;k+=2){const p=av[k]*ax+av[k+1]*ay,q=bv[k]*ax+bv[k+1]*ay;amin=Math.min(amin,p);amax=Math.max(amax,p);bmin=Math.min(bmin,q);bmax=Math.max(bmax,q);}
      const depth=Math.min(amax,bmax)-Math.max(amin,bmin);if(depth<-.025)return false;if(depth<overlap){overlap=Math.max(0,depth);const sign=dx*ax+dy*ay>=0?1:-1;nx=ax*sign;ny=ay*sign;}
    }}
    let ap=-Infinity,bp=Infinity;for(let i=0;i<av.length;i+=2){ap=Math.max(ap,av[i]*nx+av[i+1]*ny);bp=Math.min(bp,bv[i]*nx+bv[i+1]*ny);}
    const tx=-ny,ty=nx;let al=Infinity,ah=-Infinity,bl=Infinity,bh=-Infinity;
    for(let i=0;i<av.length;i+=2){if(ap-av[i]*nx-av[i+1]*ny<.04){const t=av[i]*tx+av[i+1]*ty;al=Math.min(al,t);ah=Math.max(ah,t);}if(bv[i]*nx+bv[i+1]*ny-bp<.04){const t=bv[i]*tx+bv[i+1]*ty;bl=Math.min(bl,t);bh=Math.max(bh,t);}}
    const along=(clamp((bl+bh)*.5,al,ah)+clamp((al+ah)*.5,bl,bh))*.5,normal=(ap+bp)*.5;
    out.nx=nx;out.ny=ny;out.x=nx*normal+tx*along;out.y=ny*normal+ty*along;out.depth=overlap;out.t=t;return true;
  }
  class World{
    constructor(){this.friends=Array.from({length:MAX_FRIENDS},body);this.enemy=body();this.manifold={};this.oldManifold={};this.steering={x:0,y:0};this.keysA=new Uint32Array(PAIR_SLOTS);this.keysB=new Uint32Array(PAIR_SLOTS);this.nextEffect=new Float32Array(PAIR_SLOTS);this.offsets=new Int8Array([0,0,1,0,-1,0,0,1,0,-1,1,1,1,-1,-1,1,-1,-1,2,0,-2,0,0,2,0,-2,2,1,2,-1,-2,1,-2,-1,1,2,-1,2,1,-2,-1,-2,2,2,-2,2,2,-2,-2,-2]);this.lastContacts=0;this.enemyChecks=0;this.total=0;this.effectBudget=0;this.enemyMoved=false;this.stats={friendly:0,hostile:0,largestImpulse:0};}
    get bytes(){return this.keysA.byteLength+this.keysB.byteLength+this.nextEffect.byteLength+this.offsets.byteLength+(MAX_FRIENDS+1)*26*8*2;}
    steer(s,dx,dy,amount,battle){const out=this.steering,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,tx=-uy,ty=ux;out.x=ux*amount;out.y=uy*amount;if(amount<.001)return out;
      // Crews look only at the small friendly fleet. A detour begins before a
      // bow reaches another hull, so holding station never becomes a tug of war.
      const look=Math.max(s.length*.9,Math.hypot(s.vx,s.vy)*1.25);let obstacle=null,best=Infinity,wide=0,forward=0,across=0;
      for(let i=0;i<battle.ships.length&&i<MAX_FRIENDS;i++){const o=battle.ships[i];if(o===s||o.hp<=0)continue;const rx=o.x-s.x,ry=o.y-s.y,along=rx*ux+ry*uy,side=rx*tx+ry*ty,c=Math.cos(o.angle),sn=Math.sin(o.angle),extent=(Math.abs(c*ux+sn*uy)*o.length+Math.abs(-sn*ux+c*uy)*o.width)*.5+s.length*.5,beam=(Math.abs(c*tx+sn*ty)*o.length+Math.abs(-sn*tx+c*ty)*o.width)*.5+s.width*.7+4;
        if(along< -extent*.55||along>extent+look||along>d+extent*.2||Math.abs(side)>beam)continue;
        const closing=(s.vx-o.vx)*ux+(s.vy-o.vy)*uy;if((o.vx*ux+o.vy*uy)>s.speed*.45&&closing<2&&along>extent+s.width)continue;
        if(along<best){best=along;obstacle=o;wide=beam;forward=extent;across=side;}
      }
      if(!obstacle)return out;const sign=Math.abs(across)>s.width*.12?(across>0?-1:1):-1;
      for(let side=0;side<2;side++){const pass=sign*(side?-1:1),wx=obstacle.x+ux*forward*.65+tx*pass*(wide+s.width*.5),wy=obstacle.y+uy*forward*.65+ty*pass*(wide+s.width*.5),vx=wx-s.x,vy=wy-s.y,n=Math.hypot(vx,vy)||1,nx=vx/n,ny=vy/n;
        if(battle.field){const reach=Math.min(look,Math.max(s.length*.65,20)),angle=Math.atan2(ny,nx);if(battle.field.clearance(s,s.x+nx*reach*.5,s.y+ny*reach*.5,angle)<.3||battle.field.clearance(s,s.x+nx*reach,s.y+ny*reach,angle)<.3)continue;}
        out.x=nx*amount;out.y=ny*amount;return out;
      }
      const pace=clamp((best-forward-s.width*.25)/Math.max(10,s.speed),0,1);out.x*=pace;out.y*=pace;return out;
    }
    prepare(out,ship,battle,enemy=-1){
      const B=root.WidewakeBattle,a=battle.raiders,spec=enemy>=0?B.enemies[a.kind[enemy]]:ship,angle=enemy>=0?(a.steeringReady[enemy]?a.angle[enemy]:Math.atan2(a.vy[enemy],a.vx[enemy])):ship.angle;
      out.enemy=enemy;out.ship=ship;out.spec=spec;out.geometry=geometry(out.geometry,spec,B.HULL_OUTLINE,enemy>=0&&a.kind[enemy]===3);out.angle=angle;out.previousAngle=enemy>=0?(a.previousAngle[enemy]??angle):(ship.previousAngle??angle);out.c=Math.cos(angle);out.s=Math.sin(angle);
      out.x=enemy>=0?a.x[enemy]:ship.x;out.y=enemy>=0?a.y[enemy]:ship.y;out.px=enemy>=0?a.px[enemy]:(ship.px??ship.x);out.py=enemy>=0?a.py[enemy]:(ship.py??ship.y);
      out.vx=enemy>=0?a.vx[enemy]+a.pushX[enemy]+a.waveX[enemy]:ship.vx||0;out.vy=enemy>=0?a.vy[enemy]+a.pushY[enemy]+a.waveY[enemy]:ship.vy||0;out.turn=enemy>=0?a.turn[enemy]:ship.turn||0;
      out.mass=Math.max(28,spec.length*spec.width*(enemy>=0?Math.max(.7,spec.height*.16):Math.max(.5,ship.draft||spec.height*.2)))*(1+Math.min(1,(ship?.cargo||0)/Math.max(1,ship?.hold||1))*.3);out.invMass=1/out.mass;out.invI=12/(out.mass*(spec.length*spec.length+spec.width*spec.width));
      const z=enemy>=0?(a.surface[enemy]||0):(ship.sea?.z||0);out.bottom=z-Math.min(2.5,ship?.draft||spec.height*.2);out.top=z+spec.height*.32;return out;
    }
    moveBody(b,x,y,battle){if(b.enemy>=0){if(battle.enemyWater&&!battle.enemyWater(x,y))return false;battle.raiders.x[b.enemy]=b.x=x;battle.raiders.y[b.enemy]=b.y=y;this.enemyMoved=true;return true;}const s=b.ship;if(battle.field&&battle.field.clearance(s,x,y,s.angle)<.12)return false;s.x=b.x=x;s.y=b.y=y;return true;}
    impulse(b,jx,jy,rx,ry,battle){const yaw=(rx*jy-ry*jx)*b.invI;
      if(b.enemy>=0){const a=battle.raiders,i=b.enemy;a.pushX[i]=clamp(a.pushX[i]+jx*b.invMass,-140,140);a.pushY[i]=clamp(a.pushY[i]+jy*b.invMass,-140,140);const speed=Math.hypot(a.pushX[i],a.pushY[i]);if(speed>140){a.pushX[i]*=140/speed;a.pushY[i]*=140/speed;}a.turn[i]=clamp(a.turn[i]+yaw,-2.4,2.4);}
      else{const s=b.ship;s.vx+=jx*b.invMass;s.vy+=jy*b.invMass;s.turn=clamp((s.turn||0)+yaw,-2.4,2.4);if(s.sea){const across=(-b.s*jx+b.c*jy)*b.invMass,along=(b.c*jx+b.s*jy)*b.invMass;s.sea.vr=clamp((s.sea.vr||0)+across*.012,-.55,.55);s.sea.vp=clamp((s.sea.vp||0)-along*.006,-.4,.4);}}
      b.vx+=jx*b.invMass;b.vy+=jy*b.invMass;b.turn=b.enemy>=0?battle.raiders.turn[b.enemy]:b.ship.turn;
    }
    detect(a,b){const reach=a.geometry.radius+b.geometry.radius+Math.hypot(a.x-a.px,a.y-a.py)+Math.hypot(b.x-b.px,b.y-b.py);if((a.x-b.x)**2+(a.y-b.y)**2>reach*reach||a.bottom>b.top||b.bottom>a.top)return false;
      const hit=this.manifold,current=sat(a,b,hit),was=sat(a,b,this.oldManifold,0);if(was)return current;
      const travel=Math.hypot((a.x-a.px)-(b.x-b.px),(a.y-a.py)-(b.y-b.py)),steps=Math.max(1,Math.min(6,Math.ceil(travel/(Math.min(a.spec.width,b.spec.width)*.4))));let low=0,high=1,found=current;
      for(let k=1;k<=steps;k++){const t=k/steps;if(sat(a,b,hit,t)){low=(k-1)/steps;high=t;found=true;break;}}
      if(!found)return false;for(let k=0;k<6;k++){const t=(low+high)*.5;if(sat(a,b,hit,t))high=t;else low=t;}sat(a,b,hit,high);return true;
    }
    resolve(a,b,battle,dt){if(!this.detect(a,b))return false;const h=this.manifold,nx=h.nx,ny=h.ny,rax=h.x-a.x,ray=h.y-a.y,rbx=h.x-b.x,rby=h.y-b.y,vaX=a.vx-a.turn*ray,vaY=a.vy+a.turn*rax,vbX=b.vx-b.turn*rby,vbY=b.vy+b.turn*rbx,rvx=vbX-vaX,rvy=vbY-vaY,vn=rvx*nx+rvy*ny,closing=Math.max(0,-vn),mass=a.invMass+b.invMass;
      if(h.t<.999){const t=Math.min(1,h.t+.002);this.moveBody(a,a.px+(a.x-a.px)*t,a.py+(a.y-a.py)*t,battle);this.moveBody(b,b.px+(b.x-b.px)*t,b.py+(b.y-b.py)*t,battle);}
      const correction=Math.min(.28,Math.max(0,h.depth-.035)*.65);if(correction>0){this.moveBody(a,a.x-nx*correction*a.invMass/mass,a.y-ny*correction*a.invMass/mass,battle);this.moveBody(b,b.x+nx*correction*b.invMass/mass,b.y+ny*correction*b.invMass/mass,battle);}
      let j=0;if(vn<0){const ca=rax*ny-ray*nx,cb=rbx*ny-rby*nx,den=mass+ca*ca*a.invI+cb*cb*b.invI,restitution=closing>6?.12:.02;j=-(1+restitution)*vn/den;this.impulse(a,-nx*j,-ny*j,rax,ray,battle);this.impulse(b,nx*j,ny*j,rbx,rby,battle);
        const tx=-ny,ty=nx,vt=rvx*tx+rvy*ty,ta=rax*ty-ray*tx,tb=rbx*ty-rby*tx,friction=clamp(-vt/(mass+ta*ta*a.invI+tb*tb*b.invI),-j*.16,j*.16);this.impulse(a,-tx*friction,-ty*friction,rax,ray,battle);this.impulse(b,tx*friction,ty*friction,rbx,rby,battle);
      }
      this.lastContacts++;this.total++;const hostile=b.enemy>=0;this.stats[hostile?'hostile':'friendly']++;this.stats.largestImpulse=Math.max(this.stats.largestImpulse,j);
      if(hostile&&closing>12){const raiders=battle.raiders,i=b.enemy,ram=raiders.kind[i]===3,damage=Math.min(ram?(battle.endgame?360:180):48,(closing-12)**2*(ram?.024:.012)*(b.spec.width/5));if(damage>.5){battle.hurt(a.ship,damage);battle.damage(i,Math.min(ram?420:90,damage*(ram?.9:1.7)));}}
      const tangent=Math.abs(rvx*-ny+rvy*nx),intensity=clamp((closing+tangent*.18)/65,0,1),tag=hostile?((battle.raiders.id[b.enemy]||b.enemy+1)|0x80000000)>>>0:(b.ship.id+1),key=((a.ship.id+1)*73856093^tag*19349663)&(PAIR_SLOTS-1);
      if(intensity>.025&&this.effectBudget<8&&(this.keysA[key]!==a.ship.id+1||this.keysB[key]!==tag||battle.time>=this.nextEffect[key])){this.keysA[key]=a.ship.id+1;this.keysB[key]=tag;this.nextEffect[key]=battle.time+(closing>8?.17:.3);this.effectBudget++;const water=battle.sea?.at(h.x,h.y,battle.time,this.water||(this.water={}),-1,false).height||0;battle.effects.add(h.x,h.y,clamp(2+closing*.13+tangent*.025,2,12),7,water+.04,Math.atan2(ny,nx),(a.vx+b.vx)*.5,(a.vy+b.vy)*.5,intensity);if(intensity>.06)battle.sound('hull-contact',h.x,h.y);}
      return true;
    }
    solve(battle,dt){this.lastContacts=this.enemyChecks=this.effectBudget=0;this.enemyMoved=false;this.stats.friendly=this.stats.hostile=this.stats.largestImpulse=0;const ships=battle.ships,a=battle.raiders;let n=0;
      for(let i=0;i<ships.length&&n<MAX_FRIENDS;i++)if(ships[i].hp>0)this.prepare(this.friends[n++],ships[i],battle);
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)this.resolve(this.friends[i],this.friends[j],battle,dt);
      if(a?.count){const B=root.WidewakeBattle,cell=B.LIMITS.cellSize;
        for(let k=0;k<n;k++){const f=this.friends[k];if(f.ship.hp<=0)continue;const cx=Math.floor(f.x/cell),cy=Math.floor(f.y/cell),travel=Math.hypot(f.x-f.px,f.y-f.py),radius=Math.ceil((f.geometry.radius+23+travel+(a.motion||0)*Math.SQRT2)/cell);let checked=0,pairs=0;
          for(let o=0;o<this.offsets.length&&checked<MAX_ENEMY_CHECKS&&pairs<MAX_ENEMY_PAIRS;o+=2){const ox=this.offsets[o],oy=this.offsets[o+1];if(Math.abs(ox)>radius||Math.abs(oy)>radius)continue;const x=cx+ox,y=cy+oy;for(let i=a.head[hash(x,y)];i!==-1&&checked<MAX_ENEMY_CHECKS&&pairs<MAX_ENEMY_PAIRS;i=a.next[i]){checked++;this.enemyChecks++;if(a.hp[i]<=0||Math.floor(a.x[i]/cell)!==x||Math.floor(a.y[i]/cell)!==y)continue;const spec=B.enemies[a.kind[i]],reach=f.geometry.radius+spec.length*.57+travel+Math.hypot(a.x[i]-a.px[i],a.y[i]-a.py[i])+.1;if((a.x[i]-f.x)**2+(a.y[i]-f.y)**2>reach*reach)continue;pairs++;this.prepare(this.enemy,null,battle,i);this.resolve(f,this.enemy,battle,dt);}}
        }
      }
      if(this.enemyMoved)a.index();return this.lastContacts;
    }
  }
  const api={World,MAX_FRIENDS,MAX_ENEMY_CHECKS,MAX_ENEMY_PAIRS};root.WidewakeContacts=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
