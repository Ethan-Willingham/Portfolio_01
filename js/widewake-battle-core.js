/* Ocean combat foundation. No DOM, renderer, wall clock, or campaign storage. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const LIMITS=Object.freeze({raiders:32768,shots:8192,hostileReserve:1024,effects:2048,cells:32768,cellSize:48});
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
  const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
  function helmStep(s,input,dt){
    // Surge, sway and yaw, for the bounded friendly fleet only. Velocity stays
    // in world space when the hull turns; lateral water resistance bends its path.
    const x=input.x||0,y=input.y||0,amount=Math.min(1,Math.hypot(x,y)),moving=amount>.045;
    const size=clamp(Math.sqrt(38/s.length),.65,2.05),mass=1+.28*clamp((s.cargo||0)/(s.hold||1),0,1),velocity=Math.hypot(s.vx,s.vy),fraction=clamp(velocity/s.speed,0,1);
    const error=moving?angleDelta(Math.atan2(y,x),s.angle):0,limit=(1.65-.95*fraction)*size/Math.sqrt(mass),targetTurn=moving?clamp(error*3,-limit,limit):0;
    s.turn=(s.turn||0)+(targetTurn-(s.turn||0))*(1-Math.exp(-dt*6*size/mass));
    s.angle=angleDelta(s.angle+s.turn*dt,0);
    const c=Math.cos(s.angle),sn=Math.sin(s.angle),forward=s.vx*c+s.vy*sn,side=-s.vx*sn+s.vy*c;
    const alignment=moving?Math.max(0,Math.cos(angleDelta(Math.atan2(y,x),s.angle))):0,target=input.reverse?-.3:moving?amount*alignment*(input.boost?1.35:1):0;
    s.throttle=(s.throttle||0)+(target-(s.throttle||0))*(1-Math.exp(-dt*(input.reverse?8:5)*size));
    // Neutral coasts. Reverse applies propeller braking before making sternway.
    const desired=s.speed*s.throttle,gain=(moving||input.reverse?2.4:.95)*size/mass;
    const surge=forward+clamp((desired-forward)*(1-Math.exp(-dt*gain)),-(input.reverse?22:12)*size/mass*dt,9*size/mass*dt);
    const sway=side*Math.exp(-dt*2.7*size/mass);
    s.vx=c*surge-sn*sway;s.vy=sn*surge+c*sway;
    if(!moving&&!input.reverse&&Math.hypot(s.vx,s.vy)<.03){s.vx=s.vy=s.throttle=0;}
    s.x+=s.vx*dt;s.y+=s.vy*dt;
  }
  function broadsideRound(ship,index){
    const side=index%2?-1:1,j=Math.floor(index/2),lane=j%8,wave=Math.floor(j/8),along=(lane/7-.5)*ship.length*.7,across=side*ship.width*.48,cos=Math.cos(ship.angle),sin=Math.sin(ship.angle);
    return{x:ship.x+cos*along-sin*across,y:ship.y+sin*along+cos*across,angle:ship.angle+side*Math.PI/2+(lane/7-.5)*.5+(wave-1)*.035};
  }
  function broadsideFootprint(ship,side){
    const points=[],reach=BROADSIDE.range+120;for(let i=side;i<BROADSIDE.rounds;i+=2){const s=broadsideRound(ship,i);points.push({x:s.x,y:s.y},{x:s.x+Math.cos(s.angle)*reach,y:s.y+Math.sin(s.angle)*reach});}points.sort((a,b)=>a.x-b.x||a.y-b.y);
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),half=[];
    for(const p of points){while(half.length>1&&cross(half.at(-2),half.at(-1),p)<=0)half.pop();half.push(p);}const lower=half.length;
    for(let i=points.length-2;i>=0;i--){const p=points[i];while(half.length>lower&&cross(half.at(-2),half.at(-1),p)<=0)half.pop();half.push(p);}half.pop();return half;
  }
  function rayReach(x,y,angle,ship,range){const dx=x-ship.x,dy=y-ship.y,dot=dx*Math.cos(angle)+dy*Math.sin(angle);return Math.max(0,-dot+Math.sqrt(Math.max(0,dot*dot+range*range-dx*dx-dy*dy)));}
  class Effects{
    constructor(){this.count=0;for(const k of ['x','y','size','life','total','kind','angle'])this[k]=new Float32Array(LIMITS.effects);this.cursor=0;}
    add(x,y,size,kind=0){let i=this.count<LIMITS.effects?this.count++:this.cursor++%LIMITS.effects;this.x[i]=x;this.y[i]=y;this.size[i]=size;this.life[i]=this.total[i]=kind===0?.7:kind===1?.12:1.6;this.kind[i]=kind;this.angle[i]=(i*2.39996)%TAU;}
    step(dt){for(let i=this.count-1;i>=0;i--)if((this.life[i]-=dt)<=0){const last=--this.count;for(const k of ['x','y','size','life','total','kind','angle'])this[k][i]=this[k][last];}}
  }
  class Raiders{
    constructor(capacity=LIMITS.raiders){
      this.capacity=Math.min(LIMITS.raiders,capacity);this.count=0;this.dead=0;this.sequence=1;
      for(const key of ['x','y','px','py','vx','vy','hp','cooldown'])this[key]=new Float32Array(this.capacity);
      this.id=new Uint32Array(this.capacity);this.kind=new Uint8Array(this.capacity);this.target=new Uint8Array(this.capacity);
      this.next=new Int32Array(this.capacity);this.head=new Int32Array(LIMITS.cells);this.population=new Uint16Array(LIMITS.cells);
      this.cellX=new Int16Array(LIMITS.cells);this.cellY=new Int16Array(LIMITS.cells);this.targetCell=new Uint8Array(LIMITS.cells);this.stamp=new Int32Array(LIMITS.cells);this.stamp.fill(-1);
      this.head.fill(-1);this.peak=0;this.hits=new Int32Array(64);this.hitDistances=new Float32Array(64);
    }
    add(x,y,kind,rand){if(this.count>=this.capacity)return false;const i=this.count++;this.x[i]=this.px[i]=x;this.y[i]=this.py[i]=y;this.vx[i]=this.vy[i]=0;this.kind[i]=kind;this.hp[i]=kind===2?95:kind===1?38:24;this.id[i]=this.sequence++;this.cooldown[i]=.4+rand()*4;this.target[i]=0;this.peak=Math.max(this.peak,this.count);return true;}
    compact(){for(let i=this.count-1;i>=0;i--)if(this.hp[i]<=0){const last=--this.count;for(const k of ['x','y','px','py','vx','vy','hp','cooldown','id','kind','target'])this[k][i]=this[k][last];}this.dead=0;}
    index(){this.head.fill(-1);this.population.fill(0);const inv=1/LIMITS.cellSize;for(let i=0;i<this.count;i++){if(this.hp[i]<=0)continue;const cx=Math.floor(this.x[i]*inv),cy=Math.floor(this.y[i]*inv),key=hash(cx,cy);this.next[i]=this.head[key];this.head[key]=i;this.population[key]++;}}
    nearest(x,y,r){let best=-1,distance=r*r;const cell=LIMITS.cellSize;for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){if(this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;const dx=this.x[i]-x,dy=this.y[i]-y,d=dx*dx+dy*dy;if(d<distance){distance=d;best=i;}}return best;}
    denseTarget(x,y,r){
      const cell=LIMITS.cellSize,r2=r*r;let best=-1,score=0;
      for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++){
        const key=hash(cx,cy),dx=(cx+.5)*cell-x,dy=(cy+.5)*cell-y,d2=dx*dx+dy*dy,value=this.population[key]/(1+d2/r2);
        if(d2>r2||value<=score)continue;
        for(let i=this.head[key];i!==-1;i=this.next[i])if(this.hp[i]>0&&Math.floor(this.x[i]/cell)===cx&&Math.floor(this.y[i]/cell)===cy&&(this.x[i]-x)**2+(this.y[i]-y)**2<r2){best=i;score=value;break;}
      }return best;
    }
    acquire(x,y,ships,tick){
      const cx=Math.floor(x/LIMITS.cellSize),cy=Math.floor(y/LIMITS.cellSize),key=hash(cx,cy),stamp=Math.floor(tick/8);
      if(this.stamp[key]===stamp&&this.cellX[key]===cx&&this.cellY[key]===cy&&ships[this.targetCell[key]]?.hp>0)return this.targetCell[key];
      let target=0,best=Infinity;const px=(cx+.5)*LIMITS.cellSize,py=(cy+.5)*LIMITS.cellSize;
      for(let n=0;n<ships.length;n++){const s=ships[n];if(s.hp<=0)continue;const dx=s.x-px,dy=s.y-py,d=dx*dx+dy*dy;if(d<best){best=d;target=n;}}
      this.stamp[key]=stamp;this.cellX[key]=cx;this.cellY[key]=cy;this.targetCell[key]=target;return target;
    }
    step(dt,battle){
      const ships=battle.ships,cell=LIMITS.cellSize;
      for(let i=0;i<this.count;i++){
        if(this.hp[i]<=0)continue;this.px[i]=this.x[i];this.py[i]=this.y[i];const target=this.acquire(this.x[i],this.y[i],ships,battle.tick),s=ships[target];this.target[i]=target;if(!s||s.hp<=0)continue;
        const dx=s.x-this.x[i],dy=s.y-this.y[i],d2=dx*dx+dy*dy,d=Math.sqrt(d2)||1;this.cooldown[i]-=dt;
        if(Math.hypot(s.x-this.x[i],s.y-this.y[i])<s.radius+6){if(this.cooldown[i]<=0){battle.hurt(s,this.kind[i]===1?16:8);this.cooldown[i]=1.2;battle.kill(i,false);}continue;}
        // A shared density gradient, not an all-pairs separation pass. Steering
        // is staggered, while motion and actual collision remain at 60 Hz.
        if((battle.tick+this.id[i])%4===0){
          const waypoint=battle.enemyWaypoint?.(this.x[i],this.y[i],s)||s,dx=waypoint.x-this.x[i],dy=waypoint.y-this.y[i],d=Math.hypot(dx,dy)||1;
          const cx=Math.floor(this.x[i]/cell),cy=Math.floor(this.y[i]/cell);
          const gx=clamp((this.population[hash(cx-1,cy)]-this.population[hash(cx+1,cy)])*.022,-.45,.45),gy=clamp((this.population[hash(cx,cy-1)]-this.population[hash(cx,cy+1)])*.022,-.45,.45);
          const sway=((this.id[i]%13)-6)*.025,speed=this.kind[i]===1?66:this.kind[i]===2?39:49;
          let ux=dx/d+gx-dy/d*sway,uy=dy/d+gy+dx/d*sway;const inv=1/(Math.sqrt(ux*ux+uy*uy)||1),stop=this.kind[i]===2&&d<340?-.18:1;
          this.vx[i]=ux*inv*speed*stop;this.vy[i]=uy*inv*speed*stop;
        }
        if(battle.moveEnemy)battle.moveEnemy(i,dt);else{this.x[i]+=this.vx[i]*dt;this.y[i]+=this.vy[i]*dt;}
        if(this.kind[i]===2&&d<480&&this.cooldown[i]<=0&&(!battle.clearShot||battle.clearShot(this.x[i],this.y[i],s.x,s.y))){battle.shots.fire(this.x[i],this.y[i],s.x,s.y,weapons.hostile,0);this.cooldown[i]=4+(this.id[i]%7)*.2;}
      }
    }
    segment(x0,y0,x1,y1,radius){
      const cell=LIMITS.cellSize,minX=Math.floor((Math.min(x0,x1)-radius-7)/cell),maxX=Math.floor((Math.max(x0,x1)+radius+7)/cell),minY=Math.floor((Math.min(y0,y1)-radius-7)/cell),maxY=Math.floor((Math.max(y0,y1)+radius+7)/cell),vx=x1-x0,vy=y1-y0,v2=vx*vx+vy*vy||1;let count=0;
      for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){
        if(this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;const ex=this.x[i]-x0,ey=this.y[i]-y0,t=clamp((ex*vx+ey*vy)/v2,0,1),rx=ex-vx*t,ry=ey-vy*t;
        if(rx*rx+ry*ry>(radius+(this.kind[i]===2?7:4))**2)continue;
        // Only the nearest few contacts matter to a piercing round. Insert in
        // travel order, independent of the grid's linked-list order.
        if(count===64&&t>=this.hitDistances[63])continue;let at=Math.min(count,63);while(at>0&&t<this.hitDistances[at-1]){if(at<64){this.hits[at]=this.hits[at-1];this.hitDistances[at]=this.hitDistances[at-1];}at--;}
        if(at<64){this.hits[at]=i;this.hitDistances[at]=t;}count=Math.min(64,count+1);
      }return count;
    }
    splash(x,y,r,damage,battle){const cell=LIMITS.cellSize,r2=r*r;for(let cy=Math.floor((y-r)/cell);cy<=Math.floor((y+r)/cell);cy++)for(let cx=Math.floor((x-r)/cell);cx<=Math.floor((x+r)/cell);cx++)for(let i=this.head[hash(cx,cy)];i!==-1;i=this.next[i]){if(this.hp[i]<=0||Math.floor(this.x[i]/cell)!==cx||Math.floor(this.y[i]/cell)!==cy)continue;const dx=this.x[i]-x,dy=this.y[i]-y;if(dx*dx+dy*dy<r2)battle.damage(i,damage);}}
  }
  class Shots{
    constructor(){this.count=0;this.hostile=0;this.rejected=0;this.peak=0;for(const key of ['x','y','px','py','vx','vy','life','total','damage','splash','height','previousHeight','pierce','kind','startX','startY','endX','endY'])this[key]=new Float32Array(LIMITS.shots);this.previousHit=new Uint32Array(LIMITS.shots);this.owner=new Uint8Array(LIMITS.shots);}
    fire(x,y,tx,ty,spec,offset=0,owner=255,travel=spec.range+120,height=8){
      if(this.count>=LIMITS.shots||spec.kind!==3&&this.count-this.hostile>=LIMITS.shots-LIMITS.hostileReserve){this.rejected++;return false;}
      const i=this.count++,dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx)+offset;
      this.kind[i]=spec.kind;this.x[i]=this.px[i]=this.startX[i]=x;this.y[i]=this.py[i]=this.startY[i]=y;this.endX[i]=tx;this.endY[i]=ty;
      this.vx[i]=Math.cos(a)*spec.speed;this.vy[i]=Math.sin(a)*spec.speed;this.life[i]=this.total[i]=spec.kind===2?.75+d/900:travel/spec.speed;
      this.damage[i]=spec.damage;this.splash[i]=spec.splash;this.pierce[i]=spec.pierce;this.previousHit[i]=0;this.owner[i]=owner;this.height[i]=this.previousHeight[i]=height;if(spec.kind===3)this.hostile++;this.peak=Math.max(this.peak,this.count);return true;
    }
    remove(i){if(this.kind[i]===3)this.hostile--;const last=--this.count;for(const k of ['x','y','px','py','vx','vy','life','total','damage','splash','height','previousHeight','pierce','kind','startX','startY','endX','endY','previousHit','owner'])this[k][i]=this[k][last];}
    step(dt,battle){const swarm=battle.raiders;
      for(let i=this.count-1;i>=0;i--){
        const travelDt=Math.min(dt,Math.max(0,this.life[i]));this.life[i]-=dt;this.px[i]=this.x[i];this.py[i]=this.y[i];this.previousHeight[i]=this.height[i];const kind=this.kind[i];let done=false;
        if(kind===2){const t=clamp(1-this.life[i]/this.total[i],0,1);this.x[i]=this.startX[i]+(this.endX[i]-this.startX[i])*t;this.y[i]=this.startY[i]+(this.endY[i]-this.startY[i])*t;this.height[i]=12+360*t*(1-t);
          if(this.life[i]<=0){swarm.splash(this.x[i],this.y[i],this.splash[i],this.damage[i],battle);battle.effects.add(this.x[i],this.y[i],this.splash[i],0);battle.sound('mortar-hit',this.x[i],this.y[i]);done=true;}
        }else{
          this.x[i]+=this.vx[i]*travelDt;this.y[i]+=this.vy[i]*travelDt;
          if(battle.clearShot&&!battle.clearShot(this.px[i],this.py[i],this.x[i],this.y[i])){this.remove(i);continue;}
          if(kind===3){const vx=this.x[i]-this.px[i],vy=this.y[i]-this.py[i],v2=vx*vx+vy*vy||1;for(const s of battle.ships){if(s.hp<=0)continue;const dx=s.x-this.px[i],dy=s.y-this.py[i],t=clamp((dx*vx+dy*vy)/v2,0,1);if((dx-vx*t)**2+(dy-vy*t)**2<(s.radius+2)**2){battle.hurt(s,this.damage[i]);done=true;break;}}}
          else{const hits=swarm.segment(this.px[i],this.py[i],this.x[i],this.y[i],kind===1?5:2);for(let h=0;h<hits;h++){const j=swarm.hits[h];if(swarm.hp[j]<=0||swarm.id[j]===this.previousHit[i])continue;this.previousHit[i]=swarm.id[j];battle.damage(j,this.damage[i]);battle.impact(swarm.x[j],swarm.y[j],this.owner[i]===0&&battle.control.fire);
              if(this.splash[i]){swarm.splash(this.x[i],this.y[i],this.splash[i],this.damage[i]*.65,battle);battle.effects.add(this.x[i],this.y[i],this.splash[i]*.55,0);}
              if(--this.pierce[i]<=0){done=true;break;}
            }}
        }
        if(done||this.life[i]<=0)this.remove(i);
      }
    }
  }
  const shipNames=['Flagship','Wren','Kestrel','Pipit','Gannet','Tern','Moth','Nettle','Plover','Curlew','Heron','Finch','Snipe','Thunder','Cinder','Ash','Rook','Ward','Sparrow','Minnow','Lark','Petrel','Cormorant','Mender'];
  class Battle{
    constructor({population=16384,seed=48476,duration=180}={}){
      this.random=random(seed);this.population=clamp(Math.floor(population),0,LIMITS.raiders);this.duration=duration;this.time=0;this.tick=0;this.kills=0;this.spawned=0;this.lost=0;this.burstCooldown=0;this.burstCursor=BROADSIDE.rounds;this.burstTimer=0;this.lastHit={x:0,y:0,time:-10};this.impactBudget=0;this.work=true;this.workTime=0;this.produced={fish:0,oil:0};this.result=null;this.sounds=[];this.soundBudget=0;this.deathBudget=0;this.shots=new Shots();this.effects=new Effects();this.raiders=new Raiders();this.ships=[];this.mounts=[];this.center={x:0,y:0};this.control={x:0,y:0,boost:false,fire:false,aim:null};
      const types=['flagship',...Array(12).fill('gunboat'),...Array(4).fill('battery'),...Array(2).fill('screen'),'trawler','trawler','oilrig','oilrig','repair'];
      for(let i=0;i<types.length;i++){
        const type=types[i],spec=roles[type],angle=(i-1)/18*TAU,working=type==='trawler'||type==='oilrig',slot=working?{x:(i%2?1:-1)*95,y:(i<21?-1:1)*105}:type==='repair'?{x:0,y:0}:i===0?{x:0,y:260}:{x:Math.cos(angle)*390,y:Math.sin(angle)*390};
        const ship={id:i,type,name:shipNames[i],...spec,maxHp:spec.hp,x:slot.x,y:slot.y,vx:0,vy:0,angle:i===0?-Math.PI/2:angle+Math.PI,slot,working,cargo:0,hold:type==='trawler'?640:type==='oilrig'?440:0,hit:0,flash:0,turret:angle};ship.px=ship.x;ship.py=ship.y;ship.previousAngle=ship.angle;this.ships.push(ship);
        const weapon=type==='battery'?'mortar':type==='screen'?'flak':'gun',n=type==='flagship'?4:type==='battery'?3:type==='gunboat'?2:1;
        if(type!=='repair')for(let j=0;j<n;j++)this.mounts.push({ship:i,weapon,along:working?spec.length*.32:(j-(n-1)/2)*12,angle,flash:0,recoil:0,cooldown:(i*.131+j*.21)%weapons[weapon].interval});
        if(type==='battery'||type==='screen')this.mounts.push({ship:i,weapon:'guard',along:-spec.length*.37,angle,flash:0,recoil:0,cooldown:i*.013});
      }
      // A reproducible load, with a nearby vanguard and deep incoming fronts.
      for(let i=0;i<this.population;i++)this.spawn(true,i);this.raiders.index();
    }
    get player(){return this.ships[0];}
    spawn(initial=false,index=0){
      const r=this.random,front=initial?index%5:Math.floor(r()*5),base=[-2.3,-.7,.9,2.8,-1.5][front],a=base+(r()-.5)*(front===4?.45:.95),radius=initial?(index<600?650+r()*320:1050+r()*1550):2150+r()*480;
      const x=this.center.x+Math.cos(a)*radius,y=this.center.y+Math.sin(a)*radius,kind=r()<.035?2:r()<.2?1:0;
      if(this.raiders.add(x,y,kind,r))this.spawned++;
    }
    sound(kind,x,y){if(this.soundBudget>=8){if(kind==='hurt'||kind==='loss')this.sounds[0]={kind,x,y};return;}this.soundBudget++;this.sounds.push({kind,x,y});}
    impact(x,y,player=false){if(this.impactBudget++<16)this.effects.add(x,y,9,1);if(player){this.lastHit.x=x;this.lastHit.y=y;this.lastHit.time=this.time;this.sound('impact',x,y);}}
    damage(i,n){if(this.raiders.hp[i]<=0)return;this.raiders.hp[i]-=n;if(this.raiders.hp[i]<=0)this.kill(i,true);}
    kill(i,reward=true){const a=this.raiders;if(a.hp[i]===-999)return;a.hp[i]=-999;a.dead++;if(reward)this.kills++;
      if(this.deathBudget<24){this.deathBudget++;this.effects.add(a.x[i],a.y[i],12+(a.kind[i]===2?15:0),2);}if(reward&&this.kills%32===0)this.sound('sink',a.x[i],a.y[i]);
    }
    hurt(s,n){if(s.hp<=0)return;s.hp=Math.max(0,s.hp-n);s.hit=.16;if(s.hp<=0){this.lost++;if(s.working){this.produced[s.type==='trawler'?'fish':'oil']-=s.cargo;s.cargo=0;}this.effects.add(s.x,s.y,s.length,0);this.sound('loss',s.x,s.y);}else if(s.id===0)this.sound('hurt',s.x,s.y);}
    broadside(){if(this.result||this.burstCooldown>0||this.player.hp<=0)return false;this.burstCooldown=BROADSIDE.cooldown;this.burstCursor=0;this.burstTimer=BROADSIDE.interval;this.emitBroadside();this.sound('broadside',this.player.x,this.player.y);return true;}
    emitBroadside(){for(let n=0;n<2&&this.burstCursor<BROADSIDE.rounds;n++){const shot=broadsideRound(this.player,this.burstCursor++);this.shots.fire(shot.x,shot.y,shot.x+Math.cos(shot.angle)*BROADSIDE.range,shot.y+Math.sin(shot.angle)*BROADSIDE.range,BROADSIDE,0,0);this.effects.add(shot.x,shot.y,14,1);}}
    toggleWork(){this.work=!this.work;this.workActive=false;if(this.work){this.center.x=this.player.x;this.center.y=this.player.y;}return this.work;}
    step(dt,input=this.control){
      if(this.result)return;dt=clamp(dt,0,1/30);this.time+=dt;this.tick++;this.soundBudget=0;this.deathBudget=0;this.impactBudget=0;this.sounds.length=0;this.burstCooldown=Math.max(0,this.burstCooldown-dt);this.control=input;
      for(const s of this.ships){s.px=s.x;s.py=s.y;s.previousAngle=s.angle;}
      const p=this.player;helmStep(p,input,dt);
      if(this.burstCursor<BROADSIDE.rounds){this.burstTimer-=dt;while(this.burstTimer<=0&&this.burstCursor<BROADSIDE.rounds){this.emitBroadside();this.burstTimer+=BROADSIDE.interval;}}
      if(!this.work){this.center.x+=(p.x-this.center.x)*dt*.4;this.center.y+=(p.y-this.center.y)*dt*.4;}
      for(const s of this.ships){if(s.hp<=0)continue;s.hit=Math.max(0,s.hit-dt);s.flash=Math.max(0,s.flash-dt);if(s===p)continue;const dx=this.center.x+s.slot.x-s.x,dy=this.center.y+s.slot.y-s.y,d=Math.hypot(dx,dy),amount=d>2?Math.min(1,d/(s.speed*1.4)):0;helmStep(s,{x:d?dx/d*amount:0,y:d?dy/d*amount:0},dt);
        if(s.type==='repair')for(const other of this.ships)if(other.hp>0&&(other.x-s.x)**2+(other.y-s.y)**2<550**2)other.hp=Math.min(other.maxHp,other.hp+dt*5);
      }
      this.raiders.compact();
      // Replacements are actual new vessels, not healed targets. Limit admission
      // per tick so clearing a large pocket cannot create one expensive spike.
      for(let n=0,missing=this.population-this.raiders.count;n<Math.min(48,missing);n++)this.spawn();
      this.raiders.index();this.raiders.step(dt,this);this.raiders.index();
      const a=this.raiders;
      for(const mount of this.mounts){const s=this.ships[mount.ship];mount.flash=Math.max(0,mount.flash-dt);mount.recoil*=Math.exp(-dt*15);if(s.hp<=0)continue;const spec=weapons[mount.weapon];mount.cooldown-=dt;if(mount.cooldown>0)continue;
        const manual=s===p&&input.fire&&input.aim;let target=-1;
        if(!manual)target=mount.weapon==='mortar'||mount.weapon==='flak'?a.denseTarget(s.x,s.y,spec.range):a.nearest(s.x,s.y,spec.range);
        if(!manual&&target<0){mount.cooldown=.12;continue;}
        const tx=manual?input.aim.x:a.x[target],ty=manual?input.aim.y:a.y[target],flight=mount.weapon==='mortar'?.75+Math.hypot(tx-s.x,ty-s.y)/900:Math.hypot(tx-s.x,ty-s.y)/spec.speed;
        const ax=tx+(manual?0:a.vx[target]*flight*.75),ay=ty+(manual?0:a.vy[target]*flight*.75),angle=Math.atan2(ay-s.y,ax-s.x),x=s.x+Math.cos(s.angle)*mount.along+Math.cos(angle)*10,y=s.y+Math.sin(s.angle)*mount.along+Math.sin(angle)*10;
        const offset=mount.weapon==='gun'?(this.random()-.5)*.018:0,travel=manual?rayReach(x,y,angle+offset,p,spec.range+120):spec.range+120;
        mount.angle=angle;if(this.shots.fire(x,y,ax,ay,spec,offset,s.id,travel,Math.min(8,s.height*.28)+.2+4*clamp(s.width/24,.12,.85))){mount.flash=.07;mount.recoil=mount.weapon==='mortar'?5:2.8;s.flash=.07;s.turret=angle;if(mount.along<=0&&this.tick%3===0)this.sound(mount.weapon,x,y);}
        mount.cooldown+=spec.interval*(s.working?9:1);
      }
      this.shots.step(dt,this);this.effects.step(dt);
      const workers=this.ships.filter(s=>s.working&&s.hp>0);
      const ready=this.work?workers.filter(s=>(s.x-this.center.x-s.slot.x)**2+(s.y-this.center.y-s.slot.y)**2<30**2):[];this.workActive=ready.length>0;
      if(ready.length){const old=Math.floor(this.workTime);this.workTime+=dt;if(Math.floor(this.workTime)>old)for(const s of ready){const qty=Math.min(s.hold-s.cargo,s.type==='trawler'?3:2);s.cargo+=qty;this.produced[s.type==='trawler'?'fish':'oil']+=qty;}}
      if(p.hp<=0)this.result='Flagship lost';else if(!workers.length)this.result='Workboats lost';else if(this.workTime>=this.duration)this.result='Holds secured';
    }
    memoryBytes(){let n=0;for(const part of [this.raiders,this.shots,this.effects])for(const value of Object.values(part))if(ArrayBuffer.isView(value))n+=value.byteLength;return n;}
    report(){return{seconds:this.time,workSeconds:this.workTime,raiders:this.raiders.count-this.raiders.dead,targetRaiders:this.population,peakRaiders:this.raiders.peak,kills:this.kills,spawned:this.spawned,ships:this.ships.filter(s=>s.hp>0).length,lost:this.lost,shots:this.shots.count,peakShots:this.shots.peak,rejectedShots:this.shots.rejected,effects:this.effects.count,bufferBytes:this.memoryBytes(),produced:{...this.produced},result:this.result};}
  }
  const api={Battle,Raiders,Shots,Effects,roles,weapons,LIMITS,BROADSIDE,helmStep,broadsideRound,broadsideFootprint,rayReach,angleDelta,random};root.WidewakeBattle=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
