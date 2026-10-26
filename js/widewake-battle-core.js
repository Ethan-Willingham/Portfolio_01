/* Ocean combat foundation. No DOM, renderer, wall clock, or campaign storage. */
(function(root){
  'use strict';
  const Waves=root.WidewakeWaves||(typeof require==='function'?require('./widewake-waves.js'):null);
  const Contacts=root.WidewakeContacts||(typeof require==='function'?require('./widewake-contacts.js'):null);
  const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const LIMITS=Object.freeze({raiders:32768,shots:8192,hostileReserve:1024,effects:2048,cells:32768,cellSize:48});
  const BLAST=Object.freeze({reach:1.4,drag:2.8,maxSpeed:140,hullResponse:Object.freeze([1,.86,.5,.32])});
  function random(seed){let s=seed>>>0;const f=()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};f.state=()=>s;return f;}
  const hash=(x,y)=>(Math.imul(x,73856093)^Math.imul(y,19349663))&(LIMITS.cells-1);
  const roles=Object.freeze({
    flagship:{length:86,width:27,height:15,hp:6000,speed:26,radius:22},
    gunboat:{length:38,width:12,height:7,hp:1500,speed:31,radius:12},
    battery:{length:59,width:21,height:10,hp:2100,speed:24,radius:18},
    screen:{length:49,width:18,height:10,hp:1900,speed:28,radius:16},
    trawler:{length:47,width:19,height:13,hp:2400,speed:20,radius:17},
    oilrig:{length:61,width:32,height:30,hp:3400,speed:16,radius:23},
    repair:{length:36,width:15,height:9,hp:1700,speed:29,radius:13}
  });
  const weapons=Object.freeze({
    gun:{range:730,interval:.075,speed:1000,damage:32,splash:0,pierce:2,kind:0},
    guard:{range:440,interval:.15,speed:850,damage:30,splash:0,pierce:1,kind:0},
    flak:{range:830,interval:.32,speed:780,damage:60,splash:64,pierce:1,kind:1},
    mortar:{range:1370,interval:2.6,speed:0,damage:135,splash:125,pierce:1,kind:2},
    hostile:{range:480,interval:5,speed:290,damage:13,splash:0,pierce:1,kind:3}
  });
  const BROADSIDE=Object.freeze({rounds:48,interval:1/60,cooldown:12,range:1250,damage:140,splash:110,pierce:1,speed:690,kind:1});
  const enemies=Object.freeze([
    {length:13,width:5,height:4,hp:24},
    {length:16,width:5,height:4,hp:38},
    {length:23,width:8,height:5,hp:95},
    {length:34,width:12,height:7,hp:1800}
  ]);
  // The renderer and hit tests share the same full-length hull outline.
  const HULL_OUTLINE=Object.freeze([[-.47,-.29],[-.42,-.42],[-.26,-.49],[.05,-.47],[.28,-.36],[.44,-.19],[.5,0],[.44,.19],[.28,.36],[.05,.47],[-.26,.49],[-.42,.42],[-.47,.29]].map(Object.freeze));
  const collisionHulls=new WeakMap();
  function collisionHull(spec){
    let hull=collisionHulls.get(spec);if(hull)return hull;
    const points=HULL_OUTLINE.map(([x,y])=>[x*spec.length,y*spec.width]);
    if(spec===enemies[3])points[6][0]=spec.length*.56;
    const planes=new Float64Array(points.length*3);let radius=0;
    for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],dx=q[0]-p[0],dy=q[1]-p[1],n=Math.hypot(dx,dy),nx=dy/n,ny=-dx/n;planes[i*3]=nx;planes[i*3+1]=ny;planes[i*3+2]=nx*p[0]+ny*p[1];radius=Math.max(radius,Math.hypot(...p));}
    hull={planes,radius};collisionHulls.set(spec,hull);return hull;
  }
  function hullFraction(x0,y0,x1,y1,hull,radius){
    const dx=x1-x0,dy=y1-y0,d2=dx*dx+dy*dy,t=clamp(-(x0*dx+y0*dy)/(d2||1),0,1);
    if((x0+dx*t)**2+(y0+dy*t)**2>(hull.radius+radius)**2)return Infinity;
    let enter=0,leave=1;const planes=hull.planes;
    for(let i=0;i<planes.length;i+=3){const nx=planes[i],ny=planes[i+1],gap=planes[i+2]+radius-nx*x0-ny*y0,along=nx*dx+ny*dy;
      if(Math.abs(along)<1e-10){if(gap<0)return Infinity;continue;}
      const at=gap/along;if(along<0)enter=Math.max(enter,at);else leave=Math.min(leave,at);if(enter>leave)return Infinity;
    }return enter;
  }
  const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
  // Stable crew differences do not consume the combat random stream.
  const crewPace=id=>.92+((id*7)%11)*.008;
  function crewStep(s,input,dt,tick,channel=false){
    // Captains hold a decision for a few beats instead of copying the helm at
    // 60 Hz. Channel pilots check more often.
    const period=channel?8+(s.id*7)%9:16+(s.id*7)%19;
    if(!s.helm||(tick+s.id*11)%period===0){
      s.helm={x:input.x||0,y:input.y||0};
    }
    helmStep(s,s.helm,dt);
  }
  function spawnVisible(battle,x,y){
    const b=battle.spawnBounds;if(!b)return false;
    const u=(x-y)*Math.SQRT1_2,v=(x+y)*Math.SQRT1_2*.5;
    return u>=b.left&&u<=b.right&&v>=b.top&&v<=b.bottom;
  }
  function spawnRadius(battle,origin,angle,radius,clearance=600){
    const c=Math.cos(angle),s=Math.sin(angle),b=battle.spawnBounds;
    // Exit the entire padded camera rectangle along the incoming front. This
    // also works when the player pans past its usual entry point.
    if(b){
      const u=(origin.x-origin.y)*Math.SQRT1_2,v=(origin.x+origin.y)*Math.SQRT1_2*.5,du=(c-s)*Math.SQRT1_2,dv=(c+s)*Math.SQRT1_2*.5;
      let near=0,far=Infinity;
      for(const [p,d,lo,hi]of [[u,du,b.left,b.right],[v,dv,b.top,b.bottom]]){
        if(Math.abs(d)<1e-8){if(p<lo||p>hi){far=-1;break;}}
        else{const a=(lo-p)/d,z=(hi-p)/d;near=Math.max(near,Math.min(a,z));far=Math.min(far,Math.max(a,z));}
      }
      if(far>=near)radius=Math.max(radius,far+64);
    }
    // Detached escorts and a flagship sailing away from the work station must
    // not find a new enemy materializing beside their hull either.
    for(const ship of battle.ships){if(ship.hp<=0)continue;const x=ship.x-origin.x,y=ship.y-origin.y,along=x*c+y*s,across=x*s-y*c;
      if(Math.abs(across)<clearance)radius=Math.max(radius,along+Math.sqrt(clearance*clearance-across*across));
    }
    return radius;
  }
  function driveHelm(s,input,dt){
    s.helmLateralAccel=0;
    if(!(dt>0))return;
    if(s.sea?.airborne){
      // A dry rudder and propeller supply no steering, brakes or thrust.
      // Existing linear and angular momentum carry through the flight.
      const scale=Math.sqrt(s.length/6)*(1+.45*clamp((s.cargo||0)/(s.hold||1),0,1)),rate=.06/scale,turn=s.turn||0,decay=Math.exp(-dt*rate);s.turn=turn*decay;
      s.angle=angleDelta(s.angle+turn*(1-decay)/rate,0);const drag=Math.exp(-dt*.035/scale);s.vx*=drag;s.vy*=drag;s.x+=s.vx*dt;s.y+=s.vy*dt;return;
    }
    // The player's throttle follows the bow. Rudder input is relative to the
    // hull, independent of the camera and of the direction of its momentum.
    const throttle=clamp(input.throttle||0,-1,1),steer=clamp(input.steer||0,-1,1),braking=throttle<-.04;
    const target=Math.max(0,throttle)*(input.boost?1.35:1),powered=target>.04;
    const size=clamp(Math.sqrt(18/s.length),.7,1.4),mass=1+.28*clamp((s.cargo||0)/(s.hold||1),0,1),wet=clamp(s.sea?.contact??1,0,1);
    // Integrate torque and water forces at a fixed upper step. Holding the helm
    // adds angular momentum; no target turn rate or special countersteer servo
    // pulls it into a safe arc. Damping opposes motion regardless of the input.
    const steps=Math.max(1,Math.ceil(dt*120-1e-8)),h=dt/steps;
    for(let i=0;i<steps;i++){
      const speed=Math.hypot(s.vx,s.vy),fraction=clamp(speed/s.speed,0,1),turn=s.turn||0;
      const authority=(.35+.65*Math.min(1,fraction*2+target))*wet,torque=steer*Math.abs(steer)*3.8*size*size*authority/mass;
      const drag=(.65+1.15*(1-fraction)+(braking?2.5:0))*size/mass*wet+.06*(1-wet),quadratic=.7*wet/mass;
      // Implicit quadratic resistance dissipates energy even at a large rate.
      const driven=turn+torque*h,linear=1+drag*h;
      s.turn=2*driven/(linear+Math.sqrt(linear*linear+4*h*quadratic*Math.abs(driven)));
      s.angle=angleDelta(s.angle+(turn+s.turn)*h*.5,0);
      const c=Math.cos(s.angle),sn=Math.sin(s.angle),forward=s.vx*c+s.vy*sn,side=-s.vx*sn+s.vy*c,slip=Math.abs(side)/Math.max(1,speed);
      s.throttle=(s.throttle||0)+(target-(s.throttle||0))*(1-Math.exp(-h*8*size));
      const gain=(braking?5:powered?3.2:.28)*size/mass*wet,acceleration=s.speed*(braking?1.3:.8)*size/mass*wet;
      // Sideways flow sheds drive efficiency and adds resistance. A broadside
      // skid cannot receive the same forward acceleration as a settled hull.
      const efficiency=braking?1:1/(1+3*slip*slip),crossDrag=.8*Math.abs(side)/(s.speed*.2+Math.abs(forward))*size/mass*wet;
      const engine=clamp(((braking?0:s.speed*s.throttle)-forward)*(1-Math.exp(-h*gain)),-acceleration*h,acceleration*h)*efficiency;
      const surge=(forward+engine)*Math.exp(-h*crossDrag),grip=(braking?5.8:powered?2.2:.65)*size/mass*wet;
      // Water can supply only finite lateral acceleration. Beyond that load the
      // bow keeps rotating across the travel direction instead of towing it round.
      const capacity=(24+8*(1-fraction))*(braking?2.4:1)*wet/mass;
      const removed=clamp(side*(1-Math.exp(-h*grip)),-capacity*h,capacity*h),sway=side-removed;
      s.helmLateralAccel-=removed/h/steps;
      s.vx=c*surge-sn*sway;s.vy=sn*surge+c*sway;
      if(!powered&&Math.hypot(s.vx,s.vy)<.03)s.vx=s.vy=s.throttle=0;
      s.x+=s.vx*h;s.y+=s.vy*h;
    }
  }
  function helmStep(s,input,dt){
    if(s.sea?.airborne&&!Number.isFinite(input.throttle)&&!Number.isFinite(input.steer)){
      const x=input.x||0,y=input.y||0;driveHelm(s,{steer:Math.hypot(x,y)>.04?clamp(angleDelta(Math.atan2(y,x),s.angle)*2,-1,1):0},dt);return;
    }
    if(Number.isFinite(input.throttle)||Number.isFinite(input.steer)){driveHelm(s,input,dt);return;}
    s.helmLateralAccel=undefined;
    // Surge, sway and yaw, for the bounded friendly fleet only. Velocity stays
    // in world space when the hull turns; lateral water resistance bends its path.
    const x=input.x||0,y=input.y||0,amount=Math.min(1,Math.hypot(x,y)),moving=amount>.045;
    const hullSize=clamp(Math.sqrt(38/s.length),.65,2.05),size=s.id===0?Math.max(1.45,hullSize*1.25):hullSize,mass=1+.28*clamp((s.cargo||0)/(s.hold||1),0,1),velocity=Math.hypot(s.vx,s.vy),fraction=clamp(velocity/s.speed,0,1),wet=clamp(s.sea?.contact??1,0,1);
    const error=moving?angleDelta(Math.atan2(y,x),s.angle):0,limit=(1.65-.95*fraction)*size/Math.sqrt(mass),targetTurn=moving?clamp(error*3,-limit,limit):0;
    s.turn=(s.turn||0)+(targetTurn*wet-(s.turn||0))*(1-Math.exp(-dt*6*size/mass*wet));
    s.angle=angleDelta(s.angle+s.turn*dt,0);
    const c=Math.cos(s.angle),sn=Math.sin(s.angle),forward=s.vx*c+s.vy*sn,side=-s.vx*sn+s.vy*c;
    const alignment=moving?Math.max(0,Math.cos(angleDelta(Math.atan2(y,x),s.angle))):0,target=moving?amount*alignment*(input.boost?1.35:1):0;
    s.throttle=(s.throttle||0)+(target-(s.throttle||0))*(1-Math.exp(-dt*5*size));
    // Releasing the helm lets the hull coast down under water resistance.
    const desired=s.speed*s.throttle,gain=(moving?2.4:.95)*size/mass*wet;
    const surge=forward+clamp((desired-forward)*(1-Math.exp(-dt*gain)),-12*size/mass*dt*wet,9*size/mass*dt*wet);
    const sway=side*Math.exp(-dt*2.7*size/mass*wet);
    s.vx=c*surge-sn*sway;s.vy=sn*surge+c*sway;
    if(!moving&&Math.hypot(s.vx,s.vy)<.03){s.vx=s.vy=s.throttle=0;}
    s.x+=s.vx*dt;s.y+=s.vy*dt;
  }
  function hullPoint(ship,wx,wy,wz,out={},pose=null){
    const bodyAngle=pose?.angle??ship.angle,pitch=pose?.pitch??ship.sea?.pitch??0,roll=pose?.roll??ship.sea?.roll??0,c=Math.cos(bodyAngle),s=Math.sin(bodyAngle),gx=pitch*c-roll*s,gy=pitch*s+roll*c,norm=Math.sqrt(1+gx*gx+gy*gy),nx=-gx/norm,ny=-gy/norm,nz=1/norm;
    const cx=nx*wz,cy=ny*wz,cz=-ny*wy-nx*wx,den=1+nz;
    out.x=(pose?.x??ship.x)+wx+cx+nx*cz/den;out.y=(pose?.y??ship.y)+wy+cy+ny*cz/den;out.z=(pose?.z??ship.sea?.z??0)+wz+cz+(-ny*cy-nx*cx)/den;return out;
  }
  function broadsideRound(ship,index){
    const side=index%2?-1:1,j=Math.floor(index/2),lane=j%8,wave=Math.floor(j/8),along=(lane/7-.5)*ship.length*.7,across=side*ship.width*.48,cos=Math.cos(ship.angle),sin=Math.sin(ship.angle);
    const point=hullPoint(ship,cos*along-sin*across,sin*along+cos*across,Math.max(.7,Math.min(4,ship.height*.18)));point.angle=ship.angle+side*Math.PI/2+(lane/7-.5)*.5+(wave-1)*.035;return point;
  }
  function broadsideFootprint(ship,side){
    const points=[],reach=BROADSIDE.range+120;for(let i=side;i<BROADSIDE.rounds;i+=2){const s=broadsideRound(ship,i);points.push({x:s.x,y:s.y},{x:s.x+Math.cos(s.angle)*reach,y:s.y+Math.sin(s.angle)*reach});}points.sort((a,b)=>a.x-b.x||a.y-b.y);
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),half=[];
    for(const p of points){while(half.length>1&&cross(half.at(-2),half.at(-1),p)<=0)half.pop();half.push(p);}const lower=half.length;
    for(let i=points.length-2;i>=0;i--){const p=points[i];while(half.length>lower&&cross(half.at(-2),half.at(-1),p)<=0)half.pop();half.push(p);}half.pop();return half;
  }
  function rayReach(x,y,angle,ship,range){const dx=x-ship.x,dy=y-ship.y,dot=dx*Math.cos(angle)+dy*Math.sin(angle);return Math.max(0,-dot+Math.sqrt(Math.max(0,dot*dot+range*range-dx*dx-dy*dy)));}
  class Effects{
    constructor(){this.count=0;for(const k of ['x','y','size','life','total','kind','angle','height','vx','vy','variant'])this[k]=new Float32Array(LIMITS.effects);this.cursor=0;}
    add(x,y,size,kind=0,height=kind===2||kind===3?.2:5,angle=NaN,vx=0,vy=0,variant=0){let i=this.count<LIMITS.effects?this.count++:this.cursor++%LIMITS.effects;this.x[i]=x;this.y[i]=y;this.height[i]=height;this.size[i]=size;this.life[i]=this.total[i]=kind===7?.65:kind===6?4.8:kind===5?.85:kind===4?.38:kind===3?1.35:kind===0?.7:kind===1?.12:1.6;this.kind[i]=kind;this.angle[i]=Number.isFinite(angle)?angle:(i*2.39996)%TAU;this.vx[i]=vx;this.vy[i]=vy;this.variant[i]=variant;return i;}
    step(dt){for(let i=this.count-1;i>=0;i--)if((this.life[i]-=dt)<=0){const last=--this.count;for(const k of ['x','y','size','life','total','kind','angle','height','vx','vy','variant'])this[k][i]=this[k][last];}}
  }
  class Raiders{
    constructor(capacity=LIMITS.raiders){
      this.capacity=Math.min(LIMITS.raiders,capacity);this.count=0;this.dead=0;this.sequence=1;
      for(const key of ['x','y','px','py','vx','vy','pushX','pushY','waveX','waveY','hp','cooldown','hitUntil','charge','chargeX','chargeY','reserved','angle','previousAngle','turn','desiredAngle','desiredSpeed','drive','fireAt','gunAngle','surface','forwardX','forwardY','passX','passY'])this[key]=new Float32Array(this.capacity);
      this.id=new Uint32Array(this.capacity);this.kind=new Uint8Array(this.capacity);this.target=new Uint8Array(this.capacity);this.steeringReady=new Uint8Array(this.capacity);this.surfaceReady=new Uint8Array(this.capacity);this.attackPhase=new Uint8Array(this.capacity);
      this.next=new Int32Array(this.capacity);this.head=new Int32Array(LIMITS.cells);this.population=new Uint16Array(LIMITS.cells);
      this.cellX=new Int16Array(LIMITS.cells);this.cellY=new Int16Array(LIMITS.cells);this.targetCell=new Uint8Array(LIMITS.cells);this.stamp=new Int32Array(LIMITS.cells);this.stamp.fill(-1);
      this.head.fill(-1);this.peak=0;this.hits=new Int32Array(64);this.hitDistances=new Float32Array(64);
      this.blastUntil=new Float32Array(LIMITS.cells);
      this.neighborOffsets=new Int8Array([0,0,1,0,-1,0,0,1,0,-1,1,1,1,-1,-1,1,-1,-1]);this.avoidance={x:0,y:0,speed:0};this.avoidChecks=0;this.contactChecks=0;
    }
    add(x,y,kind,rand){if(this.count>=this.capacity)return false;const i=this.count++;this.x[i]=this.px[i]=x;this.y[i]=this.py[i]=y;this.vx[i]=this.vy[i]=this.pushX[i]=this.pushY[i]=this.waveX[i]=this.waveY[i]=0;this.kind[i]=kind;this.hp[i]=enemies[kind].hp;this.id[i]=this.sequence++;this.cooldown[i]=.4+rand()*4;this.target[i]=0;this.hitUntil[i]=this.charge[i]=this.chargeX[i]=this.chargeY[i]=this.reserved[i]=0;this.angle[i]=this.previousAngle[i]=this.desiredAngle[i]=this.gunAngle[i]=Math.atan2(-y,-x);this.forwardX[i]=Math.cos(this.angle[i]);this.forwardY[i]=Math.sin(this.angle[i]);this.turn[i]=this.drive[i]=this.desiredSpeed[i]=this.steeringReady[i]=this.surface[i]=this.surfaceReady[i]=this.passX[i]=this.passY[i]=this.attackPhase[i]=0;this.fireAt[i]=-1000;this.peak=Math.max(this.peak,this.count);return true;}
    compact(){for(let i=this.count-1;i>=0;i--)if(this.hp[i]<=0){const last=--this.count;for(const k of ['x','y','px','py','vx','vy','pushX','pushY','waveX','waveY','hp','cooldown','id','kind','target','hitUntil','charge','chargeX','chargeY','reserved','angle','previousAngle','turn','desiredAngle','desiredSpeed','drive','steeringReady','fireAt','gunAngle','surface','surfaceReady','forwardX','forwardY','passX','passY','attackPhase'])this[k][i]=this[k][last];}this.dead=0;}
    index(){this.head.fill(-1);this.population.fill(0);this.motion=0;const inv=1/LIMITS.cellSize;for(let i=0;i<this.count;i++){if(this.hp[i]<=0)continue;const cx=Math.floor(this.x[i]*inv),cy=Math.floor(this.y[i]*inv),key=hash(cx,cy);this.next[i]=this.head[key];this.head[key]=i;this.population[key]++;this.motion=Math.max(this.motion,Math.abs(this.x[i]-this.px[i]),Math.abs(this.y[i]-this.py[i]));}}
    nearest(x,y,r,available=false){let best=-1,distance=r*r;const cell=LIMITS.cellSize;for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){if(this.hp[i]<=0||available&&this.reserved[i]>=this.hp[i]||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;const dx=this.x[i]-x,dy=this.y[i]-y,d=dx*dx+dy*dy;if(d<distance){distance=d;best=i;}}return best;}
    denseTarget(x,y,r,time=-1){
      const cell=LIMITS.cellSize,r2=r*r;let best=-1,score=0;
      for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++){
        const key=hash(cx,cy),dx=(cx+.5)*cell-x,dy=(cy+.5)*cell-y,d2=dx*dx+dy*dy,value=this.population[key]/(1+d2/r2)*(time>=0&&this.blastUntil[key]>time?.08:1);
        if(d2>r2||value<=score)continue;
        for(let i=this.head[key];i!==-1;i=this.next[i])if(this.hp[i]>0&&Math.floor(this.x[i]/cell)===cx&&Math.floor(this.y[i]/cell)===cy&&(this.x[i]-x)**2+(this.y[i]-y)**2<r2){best=i;score=value;break;}
      }return best;
    }
    reserveBlast(x,y,r,until){const cell=LIMITS.cellSize;for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++)this.blastUntil[hash(cx,cy)]=until;}
    acquire(x,y,ships,tick){
      const cx=Math.floor(x/LIMITS.cellSize),cy=Math.floor(y/LIMITS.cellSize),key=hash(cx,cy),stamp=Math.floor(tick/8);
      if(this.stamp[key]===stamp&&this.cellX[key]===cx&&this.cellY[key]===cy&&ships[this.targetCell[key]]?.hp>0)return this.targetCell[key];
      let target=0,best=Infinity;const px=(cx+.5)*LIMITS.cellSize,py=(cy+.5)*LIMITS.cellSize;
      for(let n=0;n<ships.length;n++){const s=ships[n];if(s.hp<=0)continue;const dx=s.x-px,dy=s.y-py,d=dx*dx+dy*dy;if(d<best){best=d;target=n;}}
      this.stamp[key]=stamp;this.cellX[key]=cx;this.cellY[key]=cy;this.targetCell[key]=target;return target;
    }
    step(dt,battle){
      const ships=battle.ships,cell=LIMITS.cellSize;
      this.avoidChecks=this.contactChecks=0;
      this.pushDecay=Math.exp(-BLAST.drag*dt);this.pushTravel=dt?(1-this.pushDecay)/(BLAST.drag*dt):1;
      for(let i=0;i<this.count;i++){
        if(this.hp[i]<=0)continue;this.px[i]=this.x[i];this.py[i]=this.y[i];this.previousAngle[i]=this.angle[i];const target=this.acquire(this.x[i],this.y[i],ships,battle.tick),s=ships[target];this.target[i]=target;if(!s||s.hp<=0)continue;
        const dx=s.x-this.x[i],dy=s.y-this.y[i],d2=dx*dx+dy*dy,d=Math.sqrt(d2)||1;this.cooldown[i]-=dt;
        if(this.kind[i]===3){this.ram(i,s,d,dt,battle);continue;}
        if(!battle.contacts&&d<(s.length+enemies[this.kind[i]].length)*.56&&this.contact(i,s)){if(this.cooldown[i]<=0){battle.hurt(s,this.kind[i]===1?16:8);this.cooldown[i]=1.2;battle.kill(i,false);}continue;}
        // Decide a course at 15 Hz. Hull yaw and water momentum keep moving at
        // 60 Hz; changing a target cannot snap a bow or reverse the propeller.
        if(!this.steeringReady[i]||(battle.tick+this.id[i])%4===0){
          const waypoint=battle.enemyWaypoint?.(this.x[i],this.y[i],s)||s,dx=waypoint.x-this.x[i],dy=waypoint.y-this.y[i],distance=Math.hypot(dx,dy)||1;
          const cx=Math.floor(this.x[i]/cell),cy=Math.floor(this.y[i]/cell);
          const gx=clamp((this.population[hash(cx-1,cy)]-this.population[hash(cx+1,cy)])*.022,-.45,.45),gy=clamp((this.population[hash(cx,cy-1)]-this.population[hash(cx,cy+1)])*.022,-.45,.45);
          const kind=this.kind[i],hand=this.id[i]%2?1:-1,direct=waypoint===s,tangent=((this.id[i]%13)-6)*.012;
          let ux=dx/distance+gx-dy/distance*tangent,uy=dy/distance+gy+dx/distance*tangent;
          if(direct){
            const pace=kind===1?66:kind===2?39:49,svx=s.vx||0,svy=s.vy||0;
            let lead=Math.min(.8,d/pace*.18);
            if(kind<2){const quadratic=svx*svx+svy*svy-pace*pace,closing=dx*svx+dy*svy,discriminant=closing*closing-quadratic*d2;if(quadratic<-.01&&discriminant>=0)lead=clamp((-closing-Math.sqrt(discriminant))/quadratic,0,6);}
            const tx=s.x+svx*lead,ty=s.y+svy*lead;
            let aimX=tx-this.x[i],aimY=ty-this.y[i],length=Math.hypot(aimX,aimY)||1,nx=aimX/length,ny=aimY/length;
            if(kind===2){
              // A gunner commits to a drive-by, carrying speed through the
              // engagement and turning back only after clearing the target.
              if(this.attackPhase[i]&&((this.x[i]-s.x)*this.passX[i]+(this.y[i]-s.y)*this.passY[i]>320||d>800))this.attackPhase[i]=0;
              if(!this.attackPhase[i]&&d<165){this.attackPhase[i]=1;this.passX[i]=nx;this.passY[i]=ny;}
              if(this.attackPhase[i]){nx=this.passX[i];ny=this.passY[i];aimX=tx+nx*460-ny*hand*52-this.x[i];aimY=ty+ny*460+nx*hand*52-this.y[i];}
              else{const offset=hand*52*Math.min(1,d/220);aimX-=ny*offset;aimY+=nx*offset;}
            }else{
              // Light boats need a run through the target. Point pursuit alone
              // traps a fast hull in a harmless circle around a small launch.
              const clear=kind===1?260:220;
              if(this.attackPhase[i]&&((this.x[i]-s.x)*this.passX[i]+(this.y[i]-s.y)*this.passY[i]>clear||d>800))this.attackPhase[i]=0;
              if(!this.attackPhase[i]&&d<170){this.attackPhase[i]=1;this.passX[i]=nx;this.passY[i]=ny;}
              if(this.attackPhase[i]&&dx*this.passX[i]+dy*this.passY[i]>0&&d<(s.length+enemies[kind].length)*.6&&this.pushX[i]*this.pushX[i]+this.pushY[i]*this.pushY[i]>36&&this.contact(i,s)){
                // A solid hull can deflect a run. Clear its side under power
                // before reacquiring, rather than pushing its stern forever.
                const side=dx*this.forwardY[i]-dy*this.forwardX[i]>=0?1:-1,ex=-dx/d-this.forwardY[i]*side*1.3,ey=-dy/d+this.forwardX[i]*side*1.3,n=Math.hypot(ex,ey)||1;this.passX[i]=ex/n;this.passY[i]=ey/n;
              }
              if(this.attackPhase[i]){nx=this.passX[i];ny=this.passY[i];const arrival=clamp((dx*nx+dy*ny)/Math.max(8,pace-svx*nx-svy*ny),0,6),ax=dx+svx*arrival,ay=dy+svy*arrival,extend=Math.max(0,80-ax*nx-ay*ny);aimX=ax+nx*extend;aimY=ay+ny*extend;}
              else if(kind===1){const offset=hand*Math.min(82,Math.max(0,d-170)*.3);aimX-=ny*offset;aimY+=nx*offset;}
            }
            length=Math.hypot(aimX,aimY)||1;ux=aimX/length+gx;uy=aimY/length+gy;
          }else this.attackPhase[i]=0;
          const speed=kind===1?66:kind===2?39:49;
          let desiredSpeed=speed;
          if(this.count<256||d<1000){const avoid=this.avoid(i,ux,uy,desiredSpeed);ux=avoid.x;uy=avoid.y;desiredSpeed=avoid.speed;}
          this.desiredAngle[i]=Math.atan2(uy,ux);this.desiredSpeed[i]=desiredSpeed;
          // Campaign banks are checked only for this staggered decision, using
          // the existing conservative cached water cells. Open sea has no probes.
          if(battle.enemyWater){const look=Math.max(14,this.desiredSpeed[i]*.7),angle=this.desiredAngle[i];if(!battle.enemyWater(this.x[i]+Math.cos(angle)*look,this.y[i]+Math.sin(angle)*look)){
            this.desiredSpeed[i]*=.45;for(const offset of [hand*.55,-hand*.55,hand*1.05,-hand*1.05,hand*1.65,-hand*1.65]){const a=angle+offset;if(battle.enemyWater(this.x[i]+Math.cos(a)*look,this.y[i]+Math.sin(a)*look)){this.desiredAngle[i]=a;break;}}
          }}
          if(!this.steeringReady[i]){this.angle[i]=this.previousAngle[i]=this.desiredAngle[i];this.drive[i]=Math.max(0,this.vx[i]*Math.cos(this.angle[i])+this.vy[i]*Math.sin(this.angle[i]));this.steeringReady[i]=1;}
          if(kind===2)this.gunAngle[i]=Math.atan2(s.y-this.y[i],s.x-this.x[i]);
        }
        this.helm(i,dt);
        this.move(i,dt,battle);
        if(this.kind[i]===2&&d<480&&this.cooldown[i]<=0&&(!battle.clearShot||battle.clearShot(this.x[i],this.y[i],s.x,s.y))){
          const spec=enemies[2],scale=clamp(spec.width/24,.12,.85),x=this.x[i]+Math.cos(this.angle[i])*spec.length*.16,y=this.y[i]+Math.sin(this.angle[i])*spec.length*.16,aim=this._aim||(this._aim={}),source=this._shotSource||(this._shotSource={});
          source.vx=dt?(this.x[i]-this.px[i])/dt:0;source.vy=dt?(this.y[i]-this.py[i])/dt:0;intercept(aim,x,y,s.x,s.y,s.vx-source.vx,s.vy-source.vy,weapons.hostile.speed);this.gunAngle[i]=Math.atan2(aim.y-y,aim.x-x);
          if(battle.shots.fire(x+Math.cos(this.gunAngle[i])*13*scale,y+Math.sin(this.gunAngle[i])*13*scale,aim.x,aim.y,weapons.hostile,0,255,weapons.hostile.range+120,this.surface[i]+spec.height*.28+.2+4*scale,(s.sea?.z||0)+s.height*.28*.7,source)){this.fireAt[i]=battle.time;battle.sound('enemy-shot',x,y);}
          this.cooldown[i]=4+(this.id[i]%7)*.2;
        }
      }
    }
    avoid(i,ux,uy,speed){
      const n=Math.hypot(ux,uy)||1,nx=ux/n,ny=uy/n,cell=LIMITS.cellSize,cx=Math.floor(this.x[i]/cell),cy=Math.floor(this.y[i]/cell),fx=Math.floor((this.x[i]+nx*Math.min(55,speed*.9))/cell),fy=Math.floor((this.y[i]+ny*Math.min(55,speed*.9))/cell),spec=enemies[this.kind[i]],out=this.avoidance;
      let steer=0,brake=1,checked=0;const ownSpeed=Math.hypot(this.vx[i],this.vy[i]),ownVx=ownSpeed>speed*.3?this.vx[i]:nx*speed,ownVy=ownSpeed>speed*.3?this.vy[i]:ny*speed;
      for(let pass=0;pass<2&&checked<20;pass++)for(let o=0;o<this.neighborOffsets.length&&checked<20;o+=2){
        const x=(pass?fx:cx)+this.neighborOffsets[o],y=(pass?fy:cy)+this.neighborOffsets[o+1];if(pass&&Math.abs(x-cx)<=1&&Math.abs(y-cy)<=1)continue;
        for(let j=this.head[hash(x,y)];j!==-1&&checked<20;j=this.next[j]){
          checked++;this.avoidChecks++;if(j===i||this.hp[j]<=0||Math.floor(this.x[j]/cell)!==x||Math.floor(this.y[j]/cell)!==y)continue;
          const dx=this.x[j]-this.x[i],dy=this.y[j]-this.y[i],along=dx*nx+dy*ny,side=-dx*ny+dy*nx,safe=(spec.length+enemies[this.kind[j]].length)*.5+2,distance2=dx*dx+dy*dy;
          if(along<-safe*.5||distance2>(speed*1.4+safe)**2)continue;
          const rvx=ownVx-this.vx[j],rvy=ownVy-this.vy[j],v2=rvx*rvx+rvy*rvy,t=clamp((dx*rvx+dy*rvy)/(v2||1),0,1.3),px=dx-rvx*t,py=dy-rvy*t;
          if(px*px+py*py>safe*safe&&distance2>safe*safe)continue;
          const distance=Math.sqrt(distance2),closing=Math.max(0,rvx*nx+rvy*ny),weight=clamp((safe-Math.sqrt(px*px+py*py))/safe,0,1),headOn=this.vx[j]*nx+this.vy[j]*ny<-4;
          // Consistent starboard passing prevents opposite crews choosing the
          // same patch of water. Following boats brake instead of weaving.
          const aligned=this.vx[j]*nx+this.vy[j]*ny>4&&Math.abs(side)<safe*.65;
          if(!aligned)steer+=(headOn||Math.abs(side)<.8?1:side>0?-1:1)*weight*.72;
          if(along>0&&Math.abs(side)<safe)brake=Math.min(brake,clamp((distance-safe)/Math.max(8,closing*1.5+speed*.4),.05,1));
        }
      }
      steer=clamp(steer,-1.15,1.15);out.x=ux-ny*steer;out.y=uy+nx*steer;out.speed=speed*brake;return out;
    }
    traffic(i,vx,vy,dt){
      const cell=LIMITS.cellSize,cx=Math.floor(this.x[i]/cell),cy=Math.floor(this.y[i]/cell),spec=enemies[this.kind[i]],c=this.forwardX[i],s=this.forwardY[i];
      let mx=vx*dt,my=vy*dt,checked=0;
      for(let o=0;o<this.neighborOffsets.length&&checked<16;o+=2){const x=cx+this.neighborOffsets[o],y=cy+this.neighborOffsets[o+1];for(let j=this.head[hash(x,y)];j!==-1&&checked<16;j=this.next[j]){
        checked++;this.contactChecks++;if(j===i||this.hp[j]<=0||Math.floor(this.x[j]/cell)!==x||Math.floor(this.y[j]/cell)!==y)continue;
        const dx=this.x[i]+mx-this.x[j],dy=this.y[i]+my-this.y[j],d2=dx*dx+dy*dy,other=enemies[this.kind[j]];
        if(d2<.000001||d2>((spec.length+other.length)*.57+1)**2)continue;
        const d=Math.sqrt(d2),nx=dx/d,ny=dy/d,oc=this.forwardX[j],os=this.forwardY[j],support=(Math.abs(nx*c+ny*s)*spec.length+Math.abs(-nx*s+ny*c)*spec.width+Math.abs(nx*oc+ny*os)*other.length+Math.abs(-nx*os+ny*oc)*other.width)*.5+.35;
        if(d>=support)continue;const toward=mx*nx+my*ny;if(toward>=0)continue;
        const remove=Math.min(-toward,support-d);mx+=nx*remove;my+=ny*remove;
        const closing=this.vx[i]*nx+this.vy[i]*ny;if(closing<0){this.vx[i]-=nx*closing*.85;this.vy[i]-=ny*closing*.85;this.drive[i]*=.96;}
      }}
      this.trafficX=dt?mx/dt:0;this.trafficY=dt?my/dt:0;
    }
    helm(i,dt,charging=false){
      const kind=this.kind[i],rate=kind===1?1.9:kind===2?.98:kind===3?.7:1.55,acceleration=kind===1?4.6:kind===2?2.3:kind===3?1.5:3.6;
      if(this.helmDt!==dt){this.helmDt=dt;this.lightGrip=Math.exp(-dt*3.7);this.heavyGrip=Math.exp(-dt*2.7);this.lightDrive=1-Math.exp(-dt/.4);this.heavyDrive=1-Math.exp(-dt/.56);this.chargeDrive=1-Math.exp(-dt/.12);}
      let error=this.desiredAngle[i]-this.angle[i];if(error>Math.PI)error-=TAU;else if(error<-Math.PI)error+=TAU;const targetTurn=clamp(error*2.8,-rate,rate);
      this.turn[i]+=clamp(targetTurn-this.turn[i],-acceleration*dt,acceleration*dt);let angle=this.angle[i]+this.turn[i]*dt;if(angle>Math.PI)angle-=TAU;else if(angle<-Math.PI)angle+=TAU;this.angle[i]=angle;
      const nx=Math.cos(this.angle[i]),ny=Math.sin(this.angle[i]),target=this.desiredSpeed[i],accel=charging?380:kind===1?48:kind===2?25:kind===3?29:36;this.forwardX[i]=nx;this.forwardY[i]=ny;
      this.drive[i]+=clamp(target-this.drive[i],-accel*1.5*dt,accel*dt);
      let forward=this.vx[i]*nx+this.vy[i]*ny,side=-this.vx[i]*ny+this.vy[i]*nx;
      forward+=(this.drive[i]-forward)*(charging?this.chargeDrive:kind===2?this.heavyDrive:this.lightDrive);side*=kind===2?this.heavyGrip:this.lightGrip;
      this.vx[i]=nx*forward-ny*side;this.vy[i]=ny*forward+nx*side;
    }
    contact(i,s){
      const spec=enemies[this.kind[i]],heading=this.steeringReady[i]?this.angle[i]:Math.atan2(this.vy[i],this.vx[i]),previous=this.steeringReady[i]?this.previousAngle[i]:heading,reach=spec.length*.45;
      const x0=this.px[i]+Math.cos(previous)*reach-(s.px??s.x),y0=this.py[i]+Math.sin(previous)*reach-(s.py??s.y),x1=this.x[i]+Math.cos(heading)*reach-s.x,y1=this.y[i]+Math.sin(heading)*reach-s.y,c=Math.cos(s.angle),sn=Math.sin(s.angle),pc=Math.cos(s.previousAngle??s.angle),ps=Math.sin(s.previousAngle??s.angle);
      return Number.isFinite(hullFraction(x0*pc+y0*ps,-x0*ps+y0*pc,x1*c+y1*sn,-x1*sn+y1*c,collisionHull(s),spec.width*.3));
    }
    move(i,dt,battle){
      // The helm keeps its heading while pressure slides the hull sideways.
      // Integrate exponential water drag once per tick, without a physics body.
      if(battle.sea&&(!this.surfaceReady[i]||(battle.tick+this.id[i])%4===0)){const q=battle.sea.at(this.x[i],this.y[i],battle.time,battle._enemySea||(battle._enemySea={}),-1,false),mass=this.kind[i]===0?1:this.kind[i]===1?.9:this.kind[i]===2?.65:.42;this.waveX[i]=(-q.dx*2+q.vx*.4)*mass;this.waveY[i]=(-q.dy*2+q.vy*.4)*mass;this.surface[i]=q.height;this.surfaceReady[i]=1;}
      let vx=this.vx[i]+this.pushX[i]*this.pushTravel+this.waveX[i],vy=this.vy[i]+this.pushY[i]*this.pushTravel+this.waveY[i];
      const target=battle.ships[this.target[i]],dx=target?target.x-this.x[i]:0,dy=target?target.y-this.y[i]:0;
      // Reinforcements use the shared density flow until reaching an engagement.
      // Full hull constraints matter at the front, not kilometres behind it.
      if(this.count<256||dx*dx+dy*dy<500*500){this.traffic(i,vx,vy,dt);vx=this.trafficX;vy=this.trafficY;}
      if(battle.moveEnemy){if(battle.moveEnemy(i,dt,vx,vy)===false)this.pushX[i]=this.pushY[i]=0;}
      else{this.x[i]+=vx*dt;this.y[i]+=vy*dt;}
      this.pushX[i]=Math.abs(this.pushX[i])<.05?0:this.pushX[i]*this.pushDecay;
      this.pushY[i]=Math.abs(this.pushY[i])<.05?0:this.pushY[i]*this.pushDecay;
    }
    ram(i,s,d,dt,battle){
      // A ram commits to one visible heading. It cannot bend toward the player
      // during the dash. Only this sparse enemy class has an attack state.
      if(!battle.contacts&&battle.endgame){
        let nearest=Infinity;for(const boat of battle.ships){if(boat.hp<=0)continue;const distance=Math.hypot(boat.x-this.x[i],boat.y-this.y[i]);if(distance<(boat.length+enemies[3].length)*.56&&this.contact(i,boat)){battle.hurt(boat,360);battle.kill(i,false);return;}if(boat.working&&distance<nearest){s=boat;d=nearest=distance;}}
      }else if(!battle.contacts&&d<(s.length+enemies[3].length)*.56&&this.contact(i,s)){battle.hurt(s,180);battle.kill(i,false);return;}
      if(!this.steeringReady[i]){this.angle[i]=this.previousAngle[i]=this.desiredAngle[i]=Math.atan2(s.y-this.y[i],s.x-this.x[i]);this.steeringReady[i]=1;}
      if(this.charge[i]<=0&&this.cooldown[i]<=0&&d<620&&Math.abs(angleDelta(Math.atan2(s.y-this.y[i],s.x-this.x[i]),this.angle[i]))<.4){
        const dx=s.x+s.vx*.6-this.x[i],dy=s.y+s.vy*.6-this.y[i],length=Math.hypot(dx,dy)||1;
        this.chargeX[i]=dx/length;this.chargeY[i]=dy/length;this.charge[i]=1.8;
      }
      if(this.charge[i]>0){this.charge[i]=Math.max(0,this.charge[i]-dt);this.desiredAngle[i]=Math.atan2(this.chargeY[i],this.chargeX[i]);this.desiredSpeed[i]=this.charge[i]>1?3:145;if(!this.charge[i])this.cooldown[i]=2.8;}
      else{this.desiredAngle[i]=Math.atan2(s.y-this.y[i],s.x-this.x[i]);this.desiredSpeed[i]=48;}
      this.helm(i,dt,this.charge[i]>0&&this.charge[i]<=1);
      this.move(i,dt,battle);
    }
    segment(x0,y0,x1,y1,radius,z0=0,z1=0){
      const cell=LIMITS.cellSize,pad=radius+20+(this.motion||0),minX=Math.floor((Math.min(x0,x1)-pad)/cell),maxX=Math.floor((Math.max(x0,x1)+pad)/cell),minY=Math.floor((Math.min(y0,y1)-pad)/cell),maxY=Math.floor((Math.max(y0,y1)+pad)/cell);let count=0;
      for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){
        if(this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;
        const spec=enemies[this.kind[i]],deck=this.surface[i]+spec.height*.28+.3;if(Math.min(z0,z1)>deck)continue;
        const from=z0>deck?(z0-deck)/(z0-z1):0,dx0=x0-this.px[i],dy0=y0-this.py[i],dx1=x1-this.x[i],dy1=y1-this.y[i],speed=Math.hypot(this.vx[i],this.vy[i]),heading=this.steeringReady[i]?this.angle[i]:speed?Math.atan2(this.vy[i],this.vx[i]):this.angle[i],previous=this.steeringReady[i]?this.previousAngle[i]:heading,c=Math.cos(heading),s=Math.sin(heading),pc=Math.cos(previous),ps=Math.sin(previous);
        const lx0=dx0*pc+dy0*ps,ly0=-dx0*ps+dy0*pc,lx1=dx1*c+dy1*s,ly1=-dx1*s+dy1*c;
        const fraction=hullFraction(lx0+(lx1-lx0)*from,ly0+(ly1-ly0)*from,lx1,ly1,collisionHull(spec),radius),t=from+(1-from)*fraction;
        if(!Number.isFinite(t))continue;
        // Only the nearest few contacts matter to a piercing round. Insert in
        // travel order, independent of the grid's linked-list order.
        if(count===64&&t>=this.hitDistances[63])continue;let at=Math.min(count,63);while(at>0&&t<this.hitDistances[at-1]){if(at<64){this.hits[at]=this.hits[at-1];this.hitDistances[at]=this.hitDistances[at-1];}at--;}
        if(at<64){this.hits[at]=i;this.hitDistances[at]=t;}count=Math.min(64,count+1);
      }return count;
    }
    splash(x,y,r,damage,battle,exclude=-1){const cell=LIMITS.cellSize,r2=r*r;let hits=0;for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){if(i===exclude||this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;const dx=this.x[i]-x,dy=this.y[i]-y;if(dx*dx+dy*dy<r2){battle.damage(i,damage);hits++;}}return hits;}
    blast(x,y,r,damage,battle,heading=0,exclude=-1){
      // One local grid walk handles damage and the nonlethal pressure shoulder.
      // Positions stay unchanged until movement, keeping this tick's hash valid.
      if(r<=0||battle.clearShot&&!battle.clearShot(x,y,x,y))return 0;
      const reach=r*BLAST.reach,reach2=reach*reach,r2=r*r,cell=LIMITS.cellSize,force=clamp(r*.95,55,120);let hits=0;
      for(let cy=Math.floor((y-reach)/cell);cy<=Math.floor((y+reach)/cell);cy++)for(let cx=Math.floor((x-reach)/cell);cx<=Math.floor((x+reach)/cell);cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){
        if(this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;
        const dx=this.x[i]-x,dy=this.y[i]-y,d2=dx*dx+dy*dy;if(d2>=reach2)continue;
        if(battle.clearShot&&!battle.clearShot(x,y,this.x[i],this.y[i]))continue;
        if(d2<r2&&i!==exclude){battle.damage(i,damage);hits++;}if(this.hp[i]<=0)continue;
        const d=Math.sqrt(d2),impulse=force*(1-d/reach)*BLAST.hullResponse[this.kind[i]],nx=d>.01?dx/d:Math.cos(heading),ny=d>.01?dy/d:Math.sin(heading);
        let px=this.pushX[i]+nx*impulse,py=this.pushY[i]+ny*impulse;const speed2=px*px+py*py;
        if(speed2>BLAST.maxSpeed*BLAST.maxSpeed){const scale=BLAST.maxSpeed/Math.sqrt(speed2);px*=scale;py*=scale;}
        this.pushX[i]=px;this.pushY[i]=py;
      }
      const sea=battle.sea?.at(x,y,battle.time,battle._blastWater||(battle._blastWater={}),-1,false);battle.effects.add(x,y,reach,3,sea?.height||0);return hits;
    }
  }
  class Shots{
    constructor(){this.count=0;this.hostile=0;this.rejected=0;this.peak=0;this.contacts=0;this.blastHits=0;this.detonations=0;for(const key of ['x','y','px','py','vx','vy','life','total','damage','splash','height','previousHeight','startHeight','verticalSpeed','targetHeight','pierce','kind','startX','startY','endX','endY'])this[key]=new Float32Array(LIMITS.shots);this.previousHit=new Uint32Array(LIMITS.shots);this.owner=new Uint8Array(LIMITS.shots);}
    static launchVertical(height,targetHeight,distance,speed){const flight=Math.max(.001,distance/Math.max(1,speed));return(targetHeight-height)/flight+4.905*flight;}
    fire(x,y,tx,ty,spec,offset=0,owner=255,travel=spec.range+120,height=8,targetHeight=1.05,source=null){
      if(this.count>=LIMITS.shots||spec.kind!==3&&this.count-this.hostile>=LIMITS.shots-LIMITS.hostileReserve){this.rejected++;return false;}
      const i=this.count++,dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx)+offset;
      this.kind[i]=spec.kind;this.x[i]=this.px[i]=this.startX[i]=x;this.y[i]=this.py[i]=this.startY[i]=y;this.endX[i]=tx;this.endY[i]=ty;
      this.vx[i]=Math.cos(a)*spec.speed+(spec.kind===2?0:source?.vx||0);this.vy[i]=Math.sin(a)*spec.speed+(spec.kind===2?0:source?.vy||0);this.life[i]=this.total[i]=spec.kind===2?.75+d/900:travel/spec.speed;
      this.damage[i]=spec.damage;this.splash[i]=spec.splash;this.pierce[i]=spec.pierce;this.previousHit[i]=0;this.owner[i]=owner;this.height[i]=this.previousHeight[i]=this.startHeight[i]=height;this.targetHeight[i]=targetHeight;this.verticalSpeed[i]=spec.kind===2?0:Shots.launchVertical(height,targetHeight,d,spec.speed);if(spec.kind===3)this.hostile++;this.peak=Math.max(this.peak,this.count);return true;
    }
    remove(i){if(this.kind[i]===3)this.hostile--;const last=--this.count;for(const k of ['x','y','px','py','vx','vy','life','total','damage','splash','height','previousHeight','startHeight','verticalSpeed','targetHeight','pierce','kind','startX','startY','endX','endY','previousHit','owner'])this[k][i]=this[k][last];}
    strike(i,battle,target,x,y,z){
      const a=battle.raiders,spec=enemies[a.kind[target]],speed=Math.hypot(this.vx[i],this.vy[i])||1,ux=this.vx[i]/speed,uy=this.vy[i]/speed,kick=clamp(this.damage[i]*.07,.4,4.5)*BLAST.hullResponse[a.kind[target]];
      // A contact transfers a small amount of momentum even if visual slots are
      // exhausted. A glancing hit turns the hull instead of merely tinting it.
      let px=a.pushX[target]+ux*kick,py=a.pushY[target]+uy*kick,scale=Math.min(1,BLAST.maxSpeed/(Math.hypot(px,py)||1));a.pushX[target]=px*scale;a.pushY[target]=py*scale;
      if(a.turn){const lever=(x-a.x[target])*uy-(y-a.y[target])*ux;a.turn[target]=clamp(a.turn[target]+clamp(lever/(spec.length*.5),-1,1)*kick/(spec.length*.35),-2.2,2.2);}
      if(this.splash[i])this.detonate(i,battle,x,y,z,target);else{battle.damage(target,this.damage[i]);this.contacts++;}
      battle.impact(x,y,this.owner[i]===0,z,Math.atan2(uy,ux),this.kind[i]);
    }
    water(i,battle,x,y,z){
      if(this.splash[i]){this.detonate(i,battle,x,y,z);return;}
      if(battle.impactBudget++<16){const speed=Math.hypot(this.vx[i],this.vy[i])||1;battle.effects.add(x,y,this.kind[i]===3?5.5:4,5,z,Math.atan2(this.vy[i],this.vx[i]),this.vx[i]/speed*3,this.vy[i]/speed*3,this.kind[i]);battle.sound('water-hit',x,y);}
    }
    detonate(i,battle,x,y,height,target=-1){
      const swarm=battle.raiders;
      if(target>=0){battle.damage(target,this.damage[i]);this.contacts++;}
      this.blastHits+=swarm.blast(x,y,this.splash[i],this.damage[i]*(this.kind[i]===2?1:.65),battle,Math.atan2(this.vy[i],this.vx[i]),target);
      this.detonations++;if(target>=0&&this.kind[i]===2)battle.impact(x,y,false,height);
      if(this.kind[i]===2)battle.sound('mortar-hit',x,y);
    }
    step(dt,battle){const swarm=battle.raiders;
      for(let i=this.count-1;i>=0;i--){
        const travelDt=Math.min(dt,Math.max(0,this.life[i]));this.life[i]-=dt;this.px[i]=this.x[i];this.py[i]=this.y[i];this.previousHeight[i]=this.height[i];const kind=this.kind[i];let done=false;
        if(kind===2){
          const t=clamp(1-this.life[i]/this.total[i],0,1);this.x[i]=this.startX[i]+(this.endX[i]-this.startX[i])*t;this.y[i]=this.startY[i]+(this.endY[i]-this.startY[i])*t;this.height[i]=this.startHeight[i]*(1-t)+this.targetHeight[i]*t+360*t*(1-t);
          if(battle.clearShot&&!battle.clearShot(this.px[i],this.py[i],this.x[i],this.y[i])){this.remove(i);continue;}
          // Lobbed shells pass above boats, then hit a deck on descent or water.
          const hits=this.height[i]<this.previousHeight[i]&&this.height[i]<12?swarm.segment(this.px[i],this.py[i],this.x[i],this.y[i],.18,this.previousHeight[i],this.height[i]):0;
          if(hits){const t=swarm.hitDistances[0],x=this.px[i]+(this.x[i]-this.px[i])*t,y=this.py[i]+(this.y[i]-this.py[i])*t,z=this.previousHeight[i]+(this.height[i]-this.previousHeight[i])*t;this.detonate(i,battle,x,y,z,swarm.hits[0]);done=true;}
          else if(this.life[i]<=0){const sea=battle.sea?.at(this.x[i],this.y[i],battle.time,battle._shotWater||(battle._shotWater={}),-1,false);this.height[i]=sea?.height||0;this.detonate(i,battle,this.x[i],this.y[i],this.height[i]);done=true;}
        }else{
          this.x[i]+=this.vx[i]*travelDt;this.y[i]+=this.vy[i]*travelDt;
          const age=Math.min(this.total[i],this.total[i]-this.life[i]);this.height[i]=this.startHeight[i]+this.verticalSpeed[i]*age-4.905*age*age;
          // Stop the swept path at the actual water crossing. Hull contacts are
          // ordered before that point; neither a tracer nor damage continues
          // underwater. Sea samples are needed only near the descending surface.
          let waterContact=false;
          if(this.height[i]<6&&this.height[i]<=this.previousHeight[i]){
            const sea=battle.sea?.at(this.x[i],this.y[i],battle.time,battle._shotWater||(battle._shotWater={}),-1,false),surface=sea?.height||0;
            if(this.height[i]<=surface){let lo=0,hi=1;const dx=this.x[i]-this.px[i],dy=this.y[i]-this.py[i],dz=this.height[i]-this.previousHeight[i];for(let n=0;n<8;n++){const t=(lo+hi)*.5,x=this.px[i]+dx*t,y=this.py[i]+dy*t,q=battle.sea?.at(x,y,battle.time,battle._shotWater,-1,false);if(this.previousHeight[i]+dz*t>(q?.height||0))lo=t;else hi=t;}this.x[i]=this.px[i]+dx*hi;this.y[i]=this.py[i]+dy*hi;this.height[i]=battle.sea?.at(this.x[i],this.y[i],battle.time,battle._shotWater,-1,false).height||0;waterContact=true;}
          }
          if(kind===3){
            let target=null,nearest=Infinity;
            for(const s of battle.ships){if(s.hp<=0)continue;const c=Math.cos(s.angle),sn=Math.sin(s.angle),pc=Math.cos(s.previousAngle??s.angle),ps=Math.sin(s.previousAngle??s.angle),x0=this.px[i]-(s.px??s.x),y0=this.py[i]-(s.py??s.y),x1=this.x[i]-s.x,y1=this.y[i]-s.y;
              const deck=(s.sea?.z||0)+s.height*.28+.3;if(Math.min(this.previousHeight[i],this.height[i])>deck)continue;
              const from=this.previousHeight[i]>deck?(this.previousHeight[i]-deck)/(this.previousHeight[i]-this.height[i]):0,lx0=x0*pc+y0*ps,ly0=-x0*ps+y0*pc,lx1=x1*c+y1*sn,ly1=-x1*sn+y1*c;
              const t=from+(1-from)*hullFraction(lx0+(lx1-lx0)*from,ly0+(ly1-ly0)*from,lx1,ly1,collisionHull(s),.12);if(t<nearest){nearest=t;target=s;}
            }
            if(target){const x=this.px[i]+(this.x[i]-this.px[i])*nearest,y=this.py[i]+(this.y[i]-this.py[i])*nearest;if(!battle.clearShot||battle.clearShot(this.px[i],this.py[i],x,y)){battle.hurt(target,this.damage[i]);this.contacts++;battle.impact(x,y,false,this.previousHeight[i]+(this.height[i]-this.previousHeight[i])*nearest,Math.atan2(this.vy[i],this.vx[i]),kind);}done=true;}
          }else{
            const hits=swarm.segment(this.px[i],this.py[i],this.x[i],this.y[i],kind===1?.18:.09,this.previousHeight[i],this.height[i]);
            for(let h=0;h<hits;h++){
              const j=swarm.hits[h];if(swarm.hp[j]<=0||swarm.id[j]===this.previousHit[i])continue;
              const t=swarm.hitDistances[h],x=this.px[i]+(this.x[i]-this.px[i])*t,y=this.py[i]+(this.y[i]-this.py[i])*t,z=this.previousHeight[i]+(this.height[i]-this.previousHeight[i])*t;
              if(battle.clearShot&&!battle.clearShot(this.px[i],this.py[i],x,y)){done=true;break;}
              this.previousHit[i]=swarm.id[j];
              this.strike(i,battle,j,x,y,z);
              if(--this.pierce[i]<=0){done=true;break;}
            }
          }
          if(!done&&battle.clearShot&&!battle.clearShot(this.px[i],this.py[i],this.x[i],this.y[i]))done=true;
          if(!done&&waterContact){this.water(i,battle,this.x[i],this.y[i],this.height[i]);done=true;}
        }
        if(!done&&this.life[i]<=0&&kind===1&&this.splash[i])this.detonate(i,battle,this.x[i],this.y[i],.2);
        if(done||this.life[i]<=0)this.remove(i);
      }
    }
  }
  function intercept(out,x,y,tx,ty,vx,vy,speed,mortar=false){
    const dx=tx-x,dy=ty-y,a=vx*vx+vy*vy-speed*speed,b=2*(dx*vx+dy*vy),c=dx*dx+dy*dy;
    let t=mortar?.75+Math.sqrt(c)/900:Math.sqrt(c)/Math.max(1,speed);
    if(!mortar&&Math.abs(a)>.001){const discriminant=b*b-4*a*c;if(discriminant>=0){const root=Math.sqrt(discriminant),first=(-b-root)/(2*a),second=(-b+root)/(2*a);t=first>0?first:second>0?second:t;}}
    t=clamp(t,0,2.5);out.x=tx+vx*t*(mortar?.65:1);out.y=ty+vy*t*(mortar?.65:1);out.flight=t;return out;
  }
  function muzzlePoint(ship,mount,out={},pose=null){
    const bodyAngle=pose?.angle??ship.angle,scale=clamp(ship.width/24,.12,.85),c=Math.cos(bodyAngle),s=Math.sin(bodyAngle);
    const reach=((mount.weapon==='mortar'?13.5:13)-(mount.recoil||0))*scale,wx=c*mount.along+Math.cos(mount.angle)*reach,wy=s*mount.along+Math.sin(mount.angle)*reach,wz=Math.min(8,ship.height*.28)+.2+4*scale;
    // The same length-preserving tilt as the hull and barrel geometry. A shot
    // begins at its actual muzzle while the boat heaves and rolls beneath it.
    hullPoint(ship,wx,wy,wz,out,pose);out.angle=mount.angle;return out;
  }
  function fireFleet(battle,dt){
    const a=battle.raiders,point=battle.aimPoint||(battle.aimPoint={x:0,y:0,flight:0}),muzzle=battle._muzzlePoint||(battle._muzzlePoint={});
    a.reserved.fill(0,0,a.count);
    for(const m of battle.mounts){
      m.flash=Math.max(0,m.flash-dt);m.recoil*=Math.exp(-dt*15);m.cooldown-=dt;
      const s=battle.ships[m.ship],traverse=(m.weapon==='mortar'?2.4:m.weapon==='flak'?3.2:5.5)*dt;if(s.hp<=0)continue;
      if(m.cooldown>0){if(Number.isFinite(m.desiredAngle))m.angle=angleDelta(m.angle+clamp(angleDelta(m.desiredAngle,m.angle),-traverse,traverse),0);continue;}
      const spec=battle.weaponSpec?.(m,s)||weapons[m.weapon],area=m.weapon==='mortar'||m.weapon==='flak';
      let target=area?a.denseTarget(s.x,s.y,spec.range,battle.time):a.nearest(s.x,s.y,spec.range,true);
      if(target<0&&!area)target=a.nearest(s.x,s.y,spec.range);
      if(target<0){m.cooldown=.1+(m.ship%3)*.015;continue;}
      const x=s.x+Math.cos(s.angle)*m.along,y=s.y+Math.sin(s.angle)*m.along;
      intercept(point,x,y,a.x[target],a.y[target],a.vx[target]-(m.weapon==='mortar'?0:s.vx),a.vy[target]-(m.weapon==='mortar'?0:s.vy),spec.speed,m.weapon==='mortar');
      const driftTime=(1-Math.exp(-BLAST.drag*point.flight))/BLAST.drag;point.x+=a.pushX[target]*driftTime;point.y+=a.pushY[target]*driftTime;
      if(battle.clearShot&&!battle.clearShot(x,y,point.x,point.y)){m.cooldown=.15;continue;}
      m.desiredAngle=Math.atan2(point.y-y,point.x-x);m.angle=angleDelta(m.angle+clamp(angleDelta(m.desiredAngle,m.angle),-traverse,traverse),0);
      if(Math.abs(angleDelta(m.desiredAngle,m.angle))>.006){m.cooldown=.025;continue;}
      muzzlePoint(s,m,muzzle);const water=a.surfaceReady?.[target]?a.surface[target]:battle.sea?.at(a.x[target],a.y[target],battle.time,battle._targetWater||(battle._targetWater={}),-1,false).height||0,targetHeight=water+(m.weapon==='mortar'?0:(enemies[a.kind[target]].height*.28+.3)*.72);
      const barrelOffset=angleDelta(m.angle,Math.atan2(point.y-muzzle.y,point.x-muzzle.x));
      if(battle.shots.fire(muzzle.x,muzzle.y,point.x,point.y,spec,barrelOffset,s.id,spec.range+120,muzzle.z,targetHeight,s)){
        a.reserved[target]+=spec.damage;
        if(area)a.reserveBlast(point.x,point.y,spec.splash*.7,battle.time+point.flight+.1);
        m.flash=m.flashTotal=.055;m.firedAt=battle.time;m.muzzleX=muzzle.x;m.muzzleY=muzzle.y;m.muzzleZ=muzzle.z;m.fireAngle=m.angle;m.recoil=area?5:2.8;s.flash=.055;s.turret=m.angle;
        if(battle.fired){battle.fired[s.id]++;battle.weaponShots[spec.kind]++;}
        if(area||m.along<=0||s.id===0)battle.sound(m.weapon,x,y);
      }
      if(spec.burst){m.burstLeft=(m.burstLeft||spec.burst)-1;m.cooldown+=m.burstLeft?spec.spacing:spec.interval;}
      else m.cooldown+=spec.interval;
    }
  }
  function autoBroadside(battle){
    const s=battle.player,a=battle.raiders;
    if(s.type==='launch'||s.hp<=0||battle.burstCooldown>0||battle.tick%12)return;
    const c=Math.cos(s.angle),sn=Math.sin(s.angle),range=BROADSIDE.range*.75;
    for(const side of [-1,1]){const i=a.nearest(s.x-sn*range*.5*side,s.y+c*range*.5*side,range*.5);if(i<0)continue;
      const dx=a.x[i]-s.x,dy=a.y[i]-s.y,d=Math.hypot(dx,dy);
      if(d<range&&Math.abs(dx*c+dy*sn)<d*.4&&(!battle.clearShot||battle.clearShot(s.x,s.y,a.x[i],a.y[i]))){battle.broadside();break;}
    }
  }
  const shipNames=['Flagship','Wren','Kestrel','Pipit','Gannet','Tern','Moth','Nettle','Plover','Curlew','Heron','Finch','Snipe','Thunder','Cinder','Ash','Rook','Ward','Sparrow','Minnow','Lark','Petrel','Cormorant','Mender'];
  class Battle{
    constructor({population=16384,seed=48476,duration=180}={}){
      this.contacts=Contacts?new Contacts.World():null;
      this.sea=new Waves.Sea();this.random=random(seed);this.population=clamp(Math.floor(population),0,LIMITS.raiders);this.duration=duration;this.time=0;this.tick=0;this.kills=0;this.spawned=0;this.lost=0;this.burstCooldown=0;this.burstCursor=BROADSIDE.rounds;this.burstTimer=0;this.lastHit={x:0,y:0,time:-10};this.impactBudget=0;this.work=true;this.workTime=0;this.produced={fish:0,oil:0};this.result=null;this.sounds=[];this.soundBudget=0;this.deathBudget=0;this.shots=new Shots();this.effects=new Effects();this.raiders=new Raiders();this.ships=[];this.mounts=[];this.center={x:0,y:0};this.control={x:0,y:0,boost:false,fire:false,aim:null};
      const types=['flagship',...Array(12).fill('gunboat'),...Array(4).fill('battery'),...Array(2).fill('screen'),'trawler','trawler','oilrig','oilrig','repair'];
      for(let i=0;i<types.length;i++){
        const type=types[i],spec=roles[type],angle=(i-1)/18*TAU,working=type==='trawler'||type==='oilrig',slot=working?{x:(i%2?1:-1)*95,y:(i<21?-1:1)*105}:type==='repair'?{x:0,y:0}:i===0?{x:0,y:260}:{x:Math.cos(angle)*390,y:Math.sin(angle)*390};
        const ship={id:i,type,name:shipNames[i],...spec,speed:i===0?72:spec.speed*1.65*crewPace(i),maxHp:spec.hp,x:slot.x,y:slot.y,vx:0,vy:0,angle:i===0?-Math.PI/2:angle+Math.PI,slot,working,cargo:0,hold:type==='trawler'?640:type==='oilrig'?440:0,hit:0,flash:0,turret:angle};ship.px=ship.x;ship.py=ship.y;ship.previousAngle=ship.angle;this.ships.push(ship);
        const weapon=type==='battery'?'mortar':type==='screen'?'flak':'gun',n=type==='flagship'?4:type==='battery'?3:type==='gunboat'?2:1;
        if(type!=='repair')for(let j=0;j<n;j++)this.mounts.push({ship:i,weapon,along:working?spec.length*.32:(j-(n-1)/2)*12,angle,flash:0,recoil:0,cooldown:(i*.131+j*.21)%weapons[weapon].interval});
        if(type==='battery'||type==='screen')this.mounts.push({ship:i,weapon:'guard',along:-spec.length*.37,angle,flash:0,recoil:0,cooldown:i*.013});
      }
      // A reproducible load, with a nearby vanguard and deep incoming fronts.
      for(let i=0;i<this.population;i++)this.spawn(true,i);this.raiders.index();
    }
    get player(){return this.ships[0];}
    spawn(initial=false,index=0){
      const r=this.random,front=initial?index%5:Math.floor(r()*5),base=[-2.3,-.7,.9,2.8,-1.5][front],a=base+(r()-.5)*(front===4?.45:.95),radius=initial?(index<600?650+r()*320:1050+r()*1550):spawnRadius(this,this.center,a,3200+r()*480);
      const x=this.center.x+Math.cos(a)*radius,y=this.center.y+Math.sin(a)*radius,kind=r()<.035?2:r()<.2?1:0;
      if(this.raiders.add(x,y,kind,r))this.spawned++;
    }
    sound(kind,x,y){const priority=kind==='hurt'||kind==='loss'?3:kind==='metal-hit'||kind==='water-hit'||kind==='hull-contact'?2:1;if(this.soundBudget>=8){const replace=priority>1?this.sounds.findIndex(c=>(c.priority||1)<priority):-1;if(replace>=0)this.sounds[replace]={kind,x,y,priority};return;}this.soundBudget++;this.sounds.push({kind,x,y,priority});}
    impact(x,y,player=false,height=5,angle=0,weapon=0){if(this.impactBudget++<16){this.effects.add(x,y,weapon===1?5.5:3.8,4,height,angle,Math.cos(angle)*2,Math.sin(angle)*2,weapon);this.sound('metal-hit',x,y);}if(player){this.lastHit.x=x;this.lastHit.y=y;this.lastHit.time=this.time;}}
    damage(i,n){if(this.raiders.hp[i]<=0)return;this.raiders.hitUntil[i]=this.time+.09;if(n>=this.raiders.hp[i])this.kill(i,true);else this.raiders.hp[i]-=n;}
    kill(i,reward=true){const a=this.raiders;if(a.hp[i]===-999)return;a.hp[i]=-999;a.dead++;if(reward)this.kills++;
      if(this.deathBudget<24){this.deathBudget++;const heading=a.steeringReady?.[i]?a.angle[i]:Math.atan2(a.vy[i],a.vx[i]);this.effects.add(a.x[i],a.y[i],enemies[a.kind[i]].length,6,a.surface?.[i]||0,heading,a.vx[i]+a.pushX[i],a.vy[i]+a.pushY[i],a.kind[i]);}if(reward&&this.kills%32===0)this.sound('sink',a.x[i],a.y[i]);
    }
    hurt(s,n){if(s.hp<=0)return;s.hp=Math.max(0,s.hp-n);s.hit=.16;if(s.hp<=0){this.lost++;if(s.working){this.produced[s.type==='trawler'?'fish':'oil']-=s.cargo;s.cargo=0;}this.effects.add(s.x,s.y,s.length,0);this.sound('loss',s.x,s.y);}else if(s.id===0)this.sound('hurt',s.x,s.y);}
    broadside(){if(this.result||this.burstCooldown>0||this.player.hp<=0)return false;this.burstCooldown=BROADSIDE.cooldown;this.burstCursor=0;this.burstTimer=BROADSIDE.interval;this.emitBroadside();this.sound('broadside',this.player.x,this.player.y);return true;}
    emitBroadside(){for(let n=0;n<2&&this.burstCursor<BROADSIDE.rounds;n++){
      const shot=broadsideRound(this.player,this.burstCursor++),c=Math.cos(shot.angle),s=Math.sin(shot.angle),a=this.raiders,target=a.nearest(shot.x+c*450,shot.y+s*450,450);let distance=BROADSIDE.range;
      if(target>=0){const dx=a.x[target]-shot.x,dy=a.y[target]-shot.y,along=dx*c+dy*s,across=Math.abs(dx*s-dy*c);if(along>40&&across<100+along*.12)distance=clamp(along,60,BROADSIDE.range);}
      const x=shot.x+c*distance,y=shot.y+s*distance,water=this.sea.at(x,y,this.time,this._targetWater||(this._targetWater={}),-1,false).height;
      this.shots.fire(shot.x,shot.y,x,y,BROADSIDE,0,0,BROADSIDE.range+120,shot.z,water+1.05,this.player);this.effects.add(shot.x,shot.y,5,1,shot.z,shot.angle);
    }}
    toggleWork(){this.work=!this.work;this.workActive=false;if(this.work){this.center.x=this.player.x;this.center.y=this.player.y;}return this.work;}
    step(dt,input=this.control){
      if(this.result)return;dt=clamp(dt,0,1/30);this.time+=dt;this.tick++;this.soundBudget=0;this.deathBudget=0;this.impactBudget=0;this.sounds.length=0;this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.control=input;this.sea.begin(this.time);
      for(const s of this.ships){s.px=s.x;s.py=s.y;s.previousAngle=s.angle;}
      const p=this.player;helmStep(p,input,dt);this.sea.stepShip(p,dt);
      if(this.burstCursor<BROADSIDE.rounds){this.burstTimer-=dt;while(this.burstTimer<=0&&this.burstCursor<BROADSIDE.rounds){this.emitBroadside();this.burstTimer+=BROADSIDE.interval;}}
      if(!this.work){this.center.x+=(p.x-this.center.x)*dt*.4;this.center.y+=(p.y-this.center.y)*dt*.4;}
      for(const s of this.ships){if(s.hp<=0)continue;s.hit=Math.max(0,s.hit-dt);s.flash=Math.max(0,s.flash-dt);if(s===p)continue;
        const anchor=s.followAnchor||(s.followAnchor={x:this.center.x,y:this.center.y}),lag=.65+(s.id*5%13)*.13,gain=1-Math.exp(-dt/lag);
        anchor.x+=(this.center.x-anchor.x)*gain;anchor.y+=(this.center.y-anchor.y)*gain;
        const target=this.work?this.center:anchor,dx=target.x+s.slot.x-s.x,dy=target.y+s.slot.y-s.y,d=Math.hypot(dx,dy),slack=s.working?5:10+(s.id*3%11);
        // A settled crew tolerates small position errors. Workers still berth
        // inside the production radius; a new order can pull them off station.
        s.onStation=s.onStation?d<slack*1.8:d<slack;
        const amount=s.onStation?0:Math.min(1,Math.max(0,d-slack*.5)/(s.speed*(1.35+(s.id%4)*.12)));
        crewStep(s,this.contacts?this.contacts.steer(s,dx,dy,amount,this):{x:d?dx/d*amount:0,y:d?dy/d*amount:0},dt,this.tick);this.sea.stepShip(s,dt);
        if(s.type==='repair')for(const other of this.ships)if(other.hp>0&&(other.x-s.x)**2+(other.y-s.y)**2<550**2)other.hp=Math.min(other.maxHp,other.hp+dt*5);
      }
      this.raiders.compact();
      // Replacements are actual new vessels, not healed targets. Limit admission
      // per tick so clearing a large pocket cannot create one expensive spike.
      if(this.reinforce)this.reinforce(dt);else for(let n=0,missing=this.population-this.raiders.count;n<Math.min(48,missing);n++)this.spawn();
      this.raiders.index();this.raiders.step(dt,this);this.raiders.index();this.contacts?.solve(this,dt);
      const a=this.raiders;
      if(this.automatic){autoBroadside(this);fireFleet(this,dt);}else for(const mount of this.mounts){const s=this.ships[mount.ship];mount.flash=Math.max(0,mount.flash-dt);mount.recoil*=Math.exp(-dt*15);if(s.hp<=0)continue;const spec=weapons[mount.weapon];mount.cooldown-=dt;if(mount.cooldown>0)continue;
        const manual=s===p&&input.fire&&input.aim;let target=-1;
        if(!manual)target=mount.weapon==='mortar'||mount.weapon==='flak'?a.denseTarget(s.x,s.y,spec.range):a.nearest(s.x,s.y,spec.range);
        if(!manual&&target<0){mount.cooldown=.12;continue;}
        const tx=manual?input.aim.x:a.x[target],ty=manual?input.aim.y:a.y[target],point=this.aimPoint||(this.aimPoint={x:0,y:0,flight:0});
        if(manual){point.x=tx;point.y=ty;}else intercept(point,s.x,s.y,tx,ty,a.vx[target]-(mount.weapon==='mortar'?0:s.vx),a.vy[target]-(mount.weapon==='mortar'?0:s.vy),spec.speed,mount.weapon==='mortar');
        const ax=point.x,ay=point.y,angle=Math.atan2(ay-s.y,ax-s.x);mount.angle=angle;const muzzle=muzzlePoint(s,mount,this._muzzlePoint||(this._muzzlePoint={})),x=muzzle.x,y=muzzle.y;
        const offset=(mount.weapon==='gun'?(this.random()-.5)*.018:0)+angleDelta(angle,Math.atan2(ay-y,ax-x)),travel=manual?rayReach(x,y,angle+offset,p,spec.range+120):spec.range+120,water=manual?this.sea.at(ax,ay,this.time,this._targetWater||(this._targetWater={}),-1,false).height:a.surfaceReady?.[target]?a.surface[target]:this.sea.at(tx,ty,this.time,this._targetWater||(this._targetWater={}),-1,false).height,targetHeight=water+(mount.weapon==='mortar'?0:manual?1.05:(enemies[a.kind[target]].height*.28+.3)*.72);
        if(this.shots.fire(x,y,ax,ay,spec,offset,s.id,travel,muzzle.z,targetHeight,s)){mount.flash=mount.flashTotal=.07;mount.firedAt=this.time;mount.muzzleX=x;mount.muzzleY=y;mount.muzzleZ=muzzle.z;mount.fireAngle=angle;mount.recoil=mount.weapon==='mortar'?5:2.8;s.flash=.07;s.turret=angle;if(mount.along<=0&&this.tick%3===0)this.sound(mount.weapon,x,y);}
        mount.cooldown+=spec.interval*(s.working?9:1);
      }
      this.shots.step(dt,this);this.effects.step(dt);
      const workers=this.ships.filter(s=>s.working&&s.hp>0);
      const ready=this.work?workers.filter(s=>(s.x-this.center.x-s.slot.x)**2+(s.y-this.center.y-s.slot.y)**2<30**2):[];this.workActive=ready.length>0;
      if(ready.length){const old=Math.floor(this.workTime);this.workTime+=dt;if(Math.floor(this.workTime)>old)for(const s of ready){const qty=Math.min(s.hold-s.cargo,s.type==='trawler'?3:2);s.cargo+=qty;this.produced[s.type==='trawler'?'fish':'oil']+=qty;}}
      if(p.hp<=0)this.result='Flagship lost';else if(!workers.length)this.result='Workboats lost';else if(this.workTime>=this.duration)this.result='Holds secured';
    }
    memoryBytes(){let n=this.contacts?.bytes||0;for(const part of [this.raiders,this.shots,this.effects])for(const value of Object.values(part))if(ArrayBuffer.isView(value))n+=value.byteLength;return n;}
    report(){return{seconds:this.time,workSeconds:this.workTime,raiders:this.raiders.count-this.raiders.dead,targetRaiders:this.population,peakRaiders:this.raiders.peak,kills:this.kills,spawned:this.spawned,ships:this.ships.filter(s=>s.hp>0).length,lost:this.lost,shots:this.shots.count,peakShots:this.shots.peak,projectileContacts:this.shots.contacts,blastHits:this.shots.blastHits,detonations:this.shots.detonations,rejectedShots:this.shots.rejected,effects:this.effects.count,hullContacts:this.contacts?.total||0,hullContactChecks:this.contacts?.enemyChecks||0,bufferBytes:this.memoryBytes(),produced:{...this.produced},result:this.result};}
  }
  const api={Battle,Raiders,Shots,Effects,roles,enemies,weapons,LIMITS,BLAST,BROADSIDE,HULL_OUTLINE,helmStep,crewStep,crewPace,broadsideRound,broadsideFootprint,rayReach,angleDelta,random,intercept,muzzlePoint,fireFleet,autoBroadside,spawnVisible,spawnRadius};root.WidewakeBattle=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
