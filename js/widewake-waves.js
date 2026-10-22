/* Shared metre-scale sea. Simulation time only, no DOM or random stream. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  // Long swell, crossing sea, wind waves and short chop. The same coefficients
  // generate the shader below, so painted crests and buoyancy cannot diverge.
  const bands=Object.freeze([
    {length:84,amplitude:1.15,angle:-2.12,phase:.7},
    {length:38,amplitude:.48,angle:-1.76,phase:2.4},
    {length:17,amplitude:.13,angle:-2.86,phase:4.1},
    {length:7.5,amplitude:.032,angle:-1.35,phase:1.2}
  ].map(b=>Object.freeze({...b,k:TAU/b.length,omega:Math.sqrt(9.81*TAU/b.length),x:Math.cos(b.angle),y:Math.sin(b.angle)})));
  function exposure(x,y,depth=22,salt=1,open=false){return smooth(.3,2.4,depth)*(.13+.87*(open?1:smooth(700,1800,y))*smooth(3,16,depth))*(.75+.25*salt);}
  function sample(x,y,time,depth=22,salt=1,open=true,out={}){
    const e=exposure(x,y,depth,salt,open);let h=0,dx=0,dy=0,vz=0,vx=0,vy=0;
    for(const b of bands){const cross=(-b.y*x+b.x*y)*.009+b.phase*2,warp=.55*Math.sin(cross),bend=.00495*Math.cos(cross),p=b.k*(b.x*x+b.y*y)+warp-b.omega*time+b.phase,s=Math.sin(p),c=Math.cos(p),c2=Math.cos(2*p),a=b.amplitude*e;
      h+=a*(s+.16*Math.sin(2*p));const slope=a*(c+.32*c2);dx+=slope*(b.k*b.x-bend*b.y);dy+=slope*(b.k*b.y+bend*b.x);vz-=a*b.omega*(c+.32*c2);vx+=a*b.omega*s*b.x;vy+=a*b.omega*s*b.y;
    }
    out.height=h;out.dx=dx;out.dy=dy;out.vz=vz;out.vx=vx;out.vy=vy;out.exposure=e;return out;
  }
  const CAPACITY=384,LIFE=8;
  class Sea{
    constructor(field=null){this.field=field;this.time=0;this.cursor=0;this.count=0;this.water={};this.probes=Array.from({length:5},()=>({}));this.last=new Float64Array(24).fill(-1);this.lastX=new Float64Array(24);this.lastY=new Float64Array(24);this.wake=new Float64Array(CAPACITY*8);this.strength=1;}
    at(x,y,time=this.time,out={},owner=-1,wakes=true){
      const w=this.field?.sample(x,y,this.water);sample(x,y,time,w?.depth??22,w?.salinity??1,!this.field,out);
      out.height*=this.strength;out.dx*=this.strength;out.dy*=this.strength;out.vz*=this.strength;out.vx*=this.strength;out.vy*=this.strength;
      if(wakes&&(!w||w.depth>.3))for(let n=0;n<this.count;n++){
        const i=n*8,a=time-this.wake[i+2];if(a<0||a>LIFE||this.wake[i+7]===owner)continue;
        const dx=x-this.wake[i],dy=y-this.wake[i+1],r=Math.hypot(dx,dy),front=this.wake[i+4]+a*3.5,q=r-front,width=this.wake[i+5];if(Math.abs(q)>width*2||r<.01)continue;
        // Only the aft-facing arc spreads out from the stern. Turn history stays
        // where it was emitted and can rock another boat crossing the wake.
        const aft=-(dx*Math.cos(this.wake[i+3])+dy*Math.sin(this.wake[i+3]))/r,mask=smooth(-.25,.25,aft),amp=this.wake[i+6]*(1-a/LIFE)**2*mask*this.strength;
        const u=q/width,g=Math.exp(-u*u*2),phase=u*Math.PI,h=amp*g*Math.cos(phase),slope=amp*g*(-4*u*Math.cos(phase)-Math.PI*Math.sin(phase))/width;
        out.height+=h;out.dx+=slope*dx/r;out.dy+=slope*dy/r;out.vz-=slope*3.5;out.vx+=h*dx/r;out.vy+=h*dy/r;
      }
      return out;
    }
    begin(time){this.time=time;}
    emit(s){
      const id=s.id;if(id<0||id>=24||s.hp<=0)return;
      const speed=Math.hypot(s.vx,s.vy),time=this.time;if(speed<2||time-this.last[id]<.45)return;
      // Recovery or a test teleport starts a new trail without a long ghost wake.
      if(this.last[id]>=0&&Math.hypot(s.x-this.lastX[id],s.y-this.lastY[id])>speed*1.5+80)for(let n=0;n<this.count;n++)if(this.wake[n*8+7]===id)this.wake[n*8+2]=-100;
      this.last[id]=time;this.lastX[id]=s.x;this.lastY[id]=s.y;
      const i=this.cursor*8;this.cursor=(this.cursor+1)%CAPACITY;this.count=Math.min(CAPACITY,this.count+1);
      this.wake.set([s.x-Math.cos(s.angle)*s.length*.42,s.y-Math.sin(s.angle)*s.length*.42,time,s.angle,s.width*.48,Math.max(1.4,s.width*.25),Math.min(.32,.045+s.width*.012)*Math.min(1,speed/15),id],i);
    }
    stepShip(s,dt,moving=true){
      const p=this.probes,c=Math.cos(s.angle),sn=Math.sin(s.angle),l=s.length*.38,w=s.width*.42;
      this.at(s.x,s.y,this.time,p[0],s.id);this.at(s.x+c*l,s.y+sn*l,this.time,p[1],s.id);this.at(s.x-c*l,s.y-sn*l,this.time,p[2],s.id);this.at(s.x-sn*w,s.y+c*w,this.time,p[3],s.id);this.at(s.x+sn*w,s.y-c*w,this.time,p[4],s.id);
      const target=(p[0].height*2+p[1].height+p[2].height+p[3].height+p[4].height)/6,pitch=clamp((p[1].height-p[2].height)/(2*l),-.25,.25),roll=clamp((p[3].height-p[4].height)/(2*w),-.3,.3);
      const load=clamp((s.cargo||0)/(s.hold||1),0,1),response=clamp(Math.sqrt(12/s.length),.4,1.4)/(1+load*.3),frequency=4.8*response;
      if(!s.sea||Math.hypot(s.x-s.sea.x,s.y-s.sea.y)>Math.max(80,s.speed*2))s.sea={z:target,pitch,roll,vz:0,vp:0,vr:0,x:s.x,y:s.y};
      const state=s.sea;state.pz=state.z;state.ppitch=state.pitch;state.proll=state.roll;
      for(const [key,velocity,goal]of [['z','vz',target],['pitch','vp',pitch],['roll','vr',roll]]){state[velocity]+=(frequency*frequency*(goal-state[key])-1.65*frequency*state[velocity])*dt;state[key]+=state[velocity]*dt;}
      state.x=s.x;state.y=s.y;state.surface=target;state.exposure=p[0].exposure;
      if(moving){
        // Orbital water and gravity on the face act on world momentum. A bow
        // meeting a rising face loses a little speed; a following face can surf.
        const forward=s.vx*c+s.vy*sn,head=p[0].dx*c+p[0].dy*sn,drag=Math.max(0,head)*Math.abs(forward)*.9*response;
        const ax=(-p[0].dx*6.5+p[0].vx*.6)*response-c*drag,ay=(-p[0].dy*6.5+p[0].vy*.6)*response-sn*drag;
        s.vx+=ax*dt;s.vy+=ay*dt;s.x+=ax*dt*dt;s.y+=ay*dt*dt;
        const yaw=clamp((p[1].dy-p[2].dy)*c-(p[1].dx-p[2].dx)*sn,-.15,.15)*response;
        s.turn=(s.turn||0)+yaw*dt;s.angle+=yaw*dt*dt;
      }
      this.emit(s);return state;
    }
    pose(s,alpha=1,out={}){const p=s.sea;out.z=p?p.pz+(p.z-p.pz)*alpha:0;out.pitch=p?p.ppitch+(p.pitch-p.ppitch)*alpha:0;out.roll=p?p.proll+(p.roll-p.proll)*alpha:0;return out;}
    snapshot(){return{time:this.time,cursor:this.cursor,count:this.count,strength:this.strength,wake:Array.from(this.wake),last:Array.from(this.last),lastX:Array.from(this.lastX),lastY:Array.from(this.lastY)};}
    restore(data){
      if(!data)return;
      const valid=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
      if(!valid(data.time,0,1e9)||!Number.isInteger(data.cursor)||!valid(data.cursor,0,CAPACITY-1)||!Number.isInteger(data.count)||!valid(data.count,0,CAPACITY)||!valid(data.strength,0,2))throw Error('Invalid wave state');
      for(const key of ['wake','last','lastX','lastY']){const a=data[key];if(!Array.isArray(a)||a.length!==this[key].length||a.some(n=>!valid(n,-1e9,1e9)))throw Error('Invalid wave state');this[key].set(a);}
      for(let n=0;n<data.count;n++){const i=n*8;if(!valid(this.wake[i+4],0,100)||!valid(this.wake[i+5],.1,30)||!valid(this.wake[i+6],0,1)||!Number.isInteger(this.wake[i+7])||!valid(this.wake[i+7],0,23))throw Error('Invalid wave state');}
      this.time=data.time;this.cursor=data.cursor;this.count=data.count;this.strength=data.strength;
    }
    get bytes(){return this.wake.byteLength+this.last.byteLength+this.lastX.byteLength+this.lastY.byteLength;}
  }
  const f=n=>Number(n).toFixed(10);
  const glsl=`
    uniform float uSeaStrength;
    float seaExposure(vec2 p,float depth,float salt,float openSea){return smoothstep(.3,2.4,depth)*(.13+.87*mix(smoothstep(700.,1800.,p.y),1.,openSea)*smoothstep(3.,16.,depth))*(.75+.25*salt);}
    vec3 waveSurface(vec2 p,float time,float depth,float salt,float openSea){vec3 q=vec3(0.);float e=seaExposure(p,depth,salt,openSea)*uSeaStrength;
      ${bands.map(b=>`{vec2 d=vec2(${f(b.x)},${f(b.y)});float crossPhase=dot(p,vec2(-d.y,d.x))*.009+${f(b.phase*2)},bend=.00495*cos(crossPhase),p0=dot(p,d)*${f(b.k)}+.55*sin(crossPhase)-time*${f(b.omega)}+${f(b.phase)},a=${f(b.amplitude)}*e;q.x+=a*(sin(p0)+.16*sin(2.*p0));q.yz+=(d*${f(b.k)}+vec2(-d.y,d.x)*bend)*a*(cos(p0)+.32*cos(2.*p0));}`).join('\n')}
      return q;
    }
  `;
  const api={Sea,sample,exposure,bands,glsl,CAPACITY,LIFE};root.WidewakeWaves=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
