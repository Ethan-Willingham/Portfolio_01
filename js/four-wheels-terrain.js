/* Height fields and six-degree cart dynamics. Ground contacts are unilateral:
 * they can push, never pull. Lost tire support changes the actual contact torque;
 * no boundary crossing switches off recovery. All geometry stays in world space.
 */
(function(root){
  'use strict';
  const G=200, PITCH_INERTIA=480, ROLL_INERTIA=230, YAW_INERTIA=470;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const normalize=p=>{const d=Math.hypot(p.x,p.y,p.z)||1;return {x:p.x/d,y:p.y/d,z:p.z/d};};
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function configure(level){
    level.terrain={
      profiles:[
        {chapter:0,knots:[[0,0],[.14,0],[.28,10],[.4,0],[1,0]]},
        {chapter:3,knots:[[0,0],[.2,0],[.42,18],[.68,18],[.9,0],[1,0]]},
        {chapter:4,knots:[[0,0],[.15,25],[.38,72],[.63,72],[.88,12],[1,0]]},
        {chapter:11,knots:[[0,0],[.1,0],[.75,60],[1,60]]}
      ],
      bumps:{x:590,y:1230,a:-Math.PI/2,width:154,centers:[46,80,114,148],length:30,height:4.5},
      boost:{x:1350,y:410,a:Math.PI,length:45,width:104,acceleration:165},
      ramp:{x:1305,y:410,a:Math.PI,length:55,width:234,height:18},
      gap:{x:1250,y:410,a:Math.PI,length:70,width:248},
      ice:{x:2110,y:495,a:Math.PI/2,length:168,width:76},
      circuit:{table:6,tray:{x:882,y:270,w:50,h:40},terminals:[{x:899,y:290},{x:919,y:290}],
        shutter:{x:947,y:235,w:6,h:110,side:'shutter',poly:[{x:947,y:235},{x:953,y:235},{x:953,y:345},{x:947,y:345}]}}
    };
    for(const f of level.terrain.profiles){const s=level.sections[f.chapter];f.legs=level.legs.filter(l=>l.chapter===f.chapter);f.start=s.startDistance;f.length=s.endDistance-s.startDistance;f.width=s.width/2+s.shoulder+25;f.box={left:Math.min(...s.path.map(p=>p.x))-f.width,right:Math.max(...s.path.map(p=>p.x))+f.width,top:Math.min(...s.path.map(p=>p.y))-f.width,bottom:Math.max(...s.path.map(p=>p.y))+f.width};}
  }
  function coordinates(p,f){const c=Math.cos(f.a),s=Math.sin(f.a),x=p.x-f.x,y=p.y-f.y;return {u:x*c+y*s,v:-x*s+y*c};}
  function inStrip(p,f,margin=0){const q=coordinates(p,f);return q.u>=-margin&&q.u<=f.length+margin&&Math.abs(q.v)<=f.width/2+margin;}
  function profile(p,f){
    let best=null;
    for(const l of f.legs){const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,t=clamp(((p.x-l.a.x)*dx+(p.y-l.a.y)*dy)/(l.length*l.length),0,1),d=Math.hypot(p.x-l.a.x-t*dx,p.y-l.a.y-t*dy);if(!best||d<best.d)best={d,t,l};}
    if(!best||best.d>f.width)return 0;
    const at=clamp((best.l.distance+best.l.length*best.t-f.start)/f.length,0,1);
    for(let i=1;i<f.knots.length;i++)if(at<=f.knots[i][0]){const a=f.knots[i-1],b=f.knots[i],u=clamp((at-a[0])/(b[0]-a[0]),0,1),t=u*u*(3-2*u);return a[1]+(b[1]-a[1])*t;}
    return f.knots.at(-1)[1];
  }
  function height(level,p){
    const t=level.terrain;if(!t)return 0;
    let z=0;for(const f of t.profiles)if(p.x>=f.box.left&&p.x<=f.box.right&&p.y>=f.box.top&&p.y<=f.box.bottom)z=Math.max(z,profile(p,f));
    const b=t.bumps,q=coordinates(p,b);
    if(Math.abs(q.v)<b.width/2)for(const center of b.centers){const u=(q.u-center)/(b.length/2);if(Math.abs(u)<1)z+=b.height*(1+Math.cos(u*Math.PI))/2;}
    if(inStrip(p,t.ramp)){const q=coordinates(p,t.ramp);z+=t.ramp.height*q.u/t.ramp.length;}
    return z;
  }
  function sample(level,p,base,gradient=true){
    const t=level.terrain;if(!t)return {...base,height:0,gx:0,gy:0};
    if(inStrip(p,t.gap)&&coordinates(p,t.gap).u>.01&&coordinates(p,t.gap).u<t.gap.length-.01)return null;
    const h=height(level,p),d=.3,gx=gradient?(height(level,{x:p.x+d,y:p.y})-height(level,{x:p.x-d,y:p.y}))/(2*d):0,gy=gradient?(height(level,{x:p.x,y:p.y+d})-height(level,{x:p.x,y:p.y-d}))/(2*d):0;
    const ice=inStrip(p,t.ice),boost=inStrip(p,t.boost);
    return {...base,kind:ice?'ice':base.kind,grip:ice?.07:base.grip,drag:ice?.085:base.drag,height:h,gx,gy,boost};
  }
  // Position and analytic Jacobian of a point on the pitch/roll/yaw body.
  // These are also exported to the cart geometry and renderer.
  function kinematics(b,x,y,z=0){
    const c=Math.cos(b.a),s=Math.sin(b.a),cp=Math.cos(b.pitch||0),sp=Math.sin(b.pitch||0),cr=Math.cos(b.rollTilt||0),sr=Math.sin(b.rollTilt||0);
    z-=b.comHeight||0;
    const X=x*cp+z*sp,Z0=z*cp-x*sp,Y=y*cr-Z0*sr,Z=Z0*cr+y*sr;
    return {p:{x:b.x+X*c-Y*s,y:b.y+X*s+Y*c,z:(b.z||0)+(b.comHeight||0)+Z},
      pitch:{x:c*Z0-s*X*sr,y:s*Z0+c*X*sr,z:-X*cr},roll:{x:s*Z,y:-c*Z,z:Y},yaw:{x:-X*s-Y*c,y:X*c-Y*s,z:0}};
  }
  function init(w,geometry){
    w.terrainGeometry=geometry;
    const b=w.body,ground=w.floorAt(b),c=Math.cos(b.a),s=Math.sin(b.a);
    Object.assign(b,{comHeight:22,z:(ground?.height||0)+22*(Math.sqrt(1+(ground?.gx||0)**2+(ground?.gy||0)**2)-1),vz:0,pitch:ground?-Math.atan(ground.gx*c+ground.gy*s):0,rollTilt:ground?Math.atan(-ground.gx*s+ground.gy*c):0,pitchRate:0,rollRate:0});
    w.wheels.forEach(q=>{q.load=1;q.groundZ=b.z;});
    w.ground={feet:1,count:6,airborne:false,lastHeight:b.z,hangTime:0,flightTime:0,impact:0,boosting:false};
    w.edge={risk:0,count:4,threat:false};w.circuit={powered:false,connected:false,charge:0,lift:0,clock:0,refillTime:0,path:[]};
    w.level.circuitState=w.circuit;w.terrainStats={jumps:0,landings:0,saves:0,maxHeight:b.z,boosts:0};
  }
  function contacts(w){
    const b=w.body,g=w.terrainGeometry;
    return [...w.wheels.map((q,i)=>{const a=q.a-b.a,side=(i%2?-1:1)*g.CASTER.axleOffset;return {x:g.WHEELS[i][0]-g.CASTER.trail*Math.cos(a)-side*Math.sin(a),y:g.WHEELS[i][1]-g.CASTER.trail*Math.sin(a)+side*Math.cos(a),wheel:i};}),{x:g.BODY.personX,y:-3,wheel:-1},{x:g.BODY.personX,y:3,wheel:-1}];
  }
  function impulse(b,q,j){
    b.vx+=j*q.n.x;b.vy+=j*q.n.y;b.vz+=j*q.n.z;
    b.pitchRate+=j*q.jp/PITCH_INERTIA;b.rollRate+=j*q.jr/ROLL_INERTIA;b.omega+=j*q.ja/YAW_INERTIA;if(q.caster)q.caster.omega+=j*q.js*q.casterInverse;
  }
  function advance(w,dt,input={}){
    const b=w.body,ground=w.ground,wasAirborne=ground.airborne;
    b.vz-=G*dt;b.z+=b.vz*dt;b.pitch=wrap(b.pitch+b.pitchRate*dt);b.rollTilt=wrap(b.rollTilt+b.rollRate*dt);
    b.pitchRate*=Math.exp(-(ground.airborne?.15:2.8)*dt);b.rollRate*=Math.exp(-(ground.airborne?.15:5)*dt);
    const list=contacts(w),active=[];let spatial=0,boostCount=0,impact=0;
    w.wheels.forEach(q=>q.load=0);
    for(const q of list){
      let k=kinematics(b,q.x,q.y);const floor=w.floorAt(k.p);
      // Knees can extend a little while the basket rides over a bump.
      if(q.wheel<0&&floor&&k.p.z-floor.height>0&&k.p.z-floor.height<6)k=kinematics(b,q.x,q.y,-(k.p.z-floor.height));q.k=k;q.floor=floor;
      if(q.wheel>=0&&floor){spatial++;w.wheels[q.wheel].groundZ=floor.height;}
      if(w.fall||!floor)continue;
      const gap=k.p.z-floor.height;
      // A tire can roll back over the lip while within its radius. A body far
      // below the top cannot teleport through the underside of the platform.
      if(gap>1.3||gap< -4)continue;
      q.n=normalize({x:-floor.gx,y:-floor.gy,z:1});q.jp=dot(k.pitch,q.n);q.jr=dot(k.roll,q.n);q.ja=dot(k.yaw,q.n);
      // Swivel changes tire height on a tilted chassis. Its contact impulse
      // exchanges angular momentum with the fork and the body.
      q.js=0;q.casterInverse=0;if(q.wheel>=0){const pivot=w.terrainGeometry.WHEELS[q.wheel],v=kinematics(b,-(q.y-pivot[1]),q.x-pivot[0],b.comHeight).p;q.js=dot({x:v.x-b.x,y:v.y-b.y,z:v.z-b.z-b.comHeight},q.n);q.caster=w.wheels[q.wheel];q.casterInverse=1/w.terrainGeometry.CASTER.inertia;q.ja-=q.js;}
      q.mass=1+q.js*q.js*q.casterInverse+q.jp*q.jp/PITCH_INERTIA+q.jr*q.jr/ROLL_INERTIA+q.ja*q.ja/YAW_INERTIA;
      const velocity=b.vx*q.n.x+b.vy*q.n.y+b.vz*q.n.z+b.pitchRate*q.jp+b.rollRate*q.jr+b.omega*q.ja+(q.caster?.omega||0)*q.js;
      q.target=gap<0?Math.min(65,-gap*.18/dt):-gap/dt;
      if(velocity< -24)q.target=Math.max(q.target,-velocity*.045);
      q.impulse=0;active.push(q);impact=Math.max(impact,-velocity);
    }
    for(let pass=0;pass<10;pass++)for(const q of active){
      const velocity=b.vx*q.n.x+b.vy*q.n.y+b.vz*q.n.z+b.pitchRate*q.jp+b.rollRate*q.jr+b.omega*q.ja+(q.caster?.omega||0)*q.js;
      const next=Math.max(0,q.impulse+(q.target-velocity)/q.mass),j=next-q.impulse;q.impulse=next;impulse(b,q,j);
    }
    for(const q of active){
      if(q.wheel>=0){w.wheels[q.wheel].load=clamp(q.impulse/(G*dt*.133333),0,2);if(q.floor.boost&&q.impulse>0)boostCount++;}
    }
    ground.feet=active.some(q=>q.wheel<0)?Math.sqrt(Math.max(...active.filter(q=>q.wheel<0).map(q=>q.floor.grip))):0;
    ground.count=active.filter(q=>q.impulse>1e-5).length;ground.airborne=ground.count===0;
    ground.flightTime=ground.airborne?ground.flightTime+dt:0;
    if(ground.count){
      ground.lastHeight=active.reduce((sum,q)=>sum+q.floor.height,0)/active.length;
      if(wasAirborne&&ground.hangTime>.12){w.terrainStats.landings++;w.emit('land',{x:b.x,y:b.y,impact});}
      ground.hangTime=0;
    }else ground.hangTime+=dt;
    if(!wasAirborne&&ground.airborne&&b.vz>8){w.terrainStats.jumps++;w.emit('jump',{x:b.x,y:b.y,vz:b.vz});}
    if(boostCount){const f=w.level.terrain.boost,force=f.acceleration*boostCount/4;b.vx+=Math.cos(f.a)*force*dt;b.vy+=Math.sin(f.a)*force*dt;if(!ground.boosting){w.terrainStats.boosts++;w.emit('boost',{x:b.x,y:b.y});}}
    ground.boosting=boostCount>0;ground.impact=impact;w.terrainStats.maxHeight=Math.max(w.terrainStats.maxHeight,b.z);
    w.unsupported=w.wheels.map(q=>q.load<.02);
    const risk=spatial<4&&!ground.airborne?clamp((4-spatial)/3+Math.abs(b.rollTilt)*.3,0,1):0;
    let threat=w.edge.threat||risk>.3;if(threat&&spatial===4&&ground.count>=3){w.terrainStats.saves++;w.emit('save-edge',{x:b.x,y:b.y});threat=false;}
    w.edge={risk,count:spatial,threat};
    // Falls become committed only after the body really drops beneath the lip.
    // Until then the usual drive, pull, brake and contact forces remain active.
    if(!w.fall&&((b.z<ground.lastHeight-26&&ground.count===0)||(Math.max(Math.abs(b.pitch),Math.abs(b.rollTilt))>1.55&&ground.count<2))){
      const hazard=w.hazardAt(b),back=w.catchPose();w.fall={kind:hazard.kind,time:0,vz:b.vz,pitch:b.pitch,roll:b.rollTilt,catch:back,impactTime:null,plane:hazard.kind==='lake'?-50:-100};
      w.falls++;w.messes++;w.lostDistance=Math.max(0,w.distance-back.distance);w.emit('fall',{kind:hazard.kind,x:b.x,y:b.y,seconds:0,lost:w.lostDistance,catch:back.chapter});
    }
    if(w.fall){const f=w.fall;f.time+=dt;f.vz=b.vz;
      if(f.impactTime===null&&b.z<=f.plane){f.impactTime=0;f.impactSpeed=Math.abs(b.vz);b.z=f.plane;b.vz=-b.vz*.08;b.vx*=.45;b.vy*=.45;w.emit('fall-impact',{kind:f.kind,x:b.x,y:b.y,impact:f.impactSpeed});}
      if(f.impactTime!==null){f.impactTime+=dt;if(b.z<f.plane){b.z=f.plane;b.vz=0;}b.vx*=Math.exp(-5*dt);b.vy*=Math.exp(-5*dt);b.pitchRate*=Math.exp(-3*dt);b.rollRate*=Math.exp(-3*dt);}
      if(f.impactTime!==null&&f.impactTime>.6)recover(w);
    }
  }
  function recover(w){
    const pose=w.fall.catch;Object.assign(w.body,{...pose.pose,vx:0,vy:0,omega:0});w.gate=pose.gate;w.roomIndex=pose.chapter;w.distance=pose.distance;
    w.wheels.forEach(q=>Object.assign(q,{a:w.body.a,omega:0,speed:0}));const circuit=w.circuit,stats=w.terrainStats;init(w,w.terrainGeometry);w.circuit=circuit;w.level.circuitState=circuit;w.terrainStats=stats;
    Object.assign(w.gait,{stride:0,leanX:0,leanY:0,speed:0});w.fall=null;w.unsupported=[];w.boundaryContacts=[];w.emit('respawn',{room:w.roomIndex});
  }
  function circuitConnection(w){
    const cells=w.stock.liquids.get('water')?.cells;if(!cells)return [];
    const t=w.level.terrain.circuit,cols=w.stock.cols,CELL=4,wet=new Set();
    for(let y=Math.floor(t.tray.y/CELL)-2;y<=Math.ceil((t.tray.y+t.tray.h)/CELL)+2;y++)for(let x=Math.floor(t.tray.x/CELL)-2;x<=Math.ceil((t.tray.x+t.tray.w)/CELL)+2;x++){const key=y*cols+x;if((cells.get(key)||0)>=.035)wet.add(key);}
    const near=(key,p)=>Math.hypot((key%cols+.5)*CELL-p.x,(Math.floor(key/cols)+.5)*CELL-p.y)<=5;
    const queue=[...wet].filter(k=>near(k,t.terminals[0])),seen=new Set(queue),parents=new Map();
    for(let i=0;i<queue.length;i++){const k=queue[i];if(near(k,t.terminals[1])){const path=[];let at=k;while(at!==undefined){path.push(at);at=parents.get(at);}return path;}
      for(const next of [k-1,k+1,k-cols,k+cols])if(wet.has(next)&&!seen.has(next)){seen.add(next);parents.set(next,k);queue.push(next);}
    }return [];
  }
  function circuitStep(w,dt){
    const c=w.circuit;c.clock+=dt;if(c.clock>=.05){c.clock=0;c.path=circuitConnection(w);c.connected=c.path.length>0;}
    c.charge=clamp(c.charge+(c.connected?dt:-dt*2),0,.3);
    if(!c.powered&&c.charge>=.3){c.powered=true;w.emit('circuit',{x:919,y:290});}
    if(c.powered)c.lift=Math.min(1,c.lift+dt*.8);
  }
  const api={G,PITCH_INERTIA,ROLL_INERTIA,configure,height,sample,coordinates,inStrip,kinematics,init,advance,recover,circuitStep,circuitConnection};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartTerrain=api;
})(typeof globalThis!=='undefined'?globalThis:this);
