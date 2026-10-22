/* Shared metre-scale sea. Simulation time only, no DOM or random stream. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  // Crossing packets have short, rounded crests. Their cross-wave envelopes
  // bend and drift with slower group motion instead of spanning the whole sea.
  // The same coefficients generate the shader and its analytic surface normals.
  // Short boat-scale chop breaks up the large swells. The asymmetric profile
  // sharpens crests and broadens troughs without adding an unrelated hull bob.
  const bands=Object.freeze([
    {length:72,amplitude:2.4,angle:-3.8,phase:.7,crestLength:137},
    {length:49,amplitude:1.5,angle:-.5,phase:2.4,crestLength:101},
    {length:33,amplitude:1.0,angle:-1.15,phase:4.1,crestLength:64},
    {length:22,amplitude:.45,angle:-2.9,phase:1.2,crestLength:48},
    {length:13,amplitude:.40,angle:-3.6,phase:3.5,crestLength:28},
    {length:8,amplitude:.22,angle:-.8,phase:5.3,crestLength:18}
  ].map(b=>Object.freeze({...b,k:TAU/b.length,crossK:TAU/b.crestLength,omega:Math.sqrt(9.81*TAU/b.length),x:Math.cos(b.angle),y:Math.sin(b.angle)})));
  function exposure(x,y,depth=22,salt=1,open=false){return smooth(.3,2.4,depth)*(.20+.80*(open?1:smooth(700,1800,y))*smooth(3,16,depth))*(.75+.25*salt);}
  function sample(x,y,time,depth=22,salt=1,open=true,out={}){
    const e=exposure(x,y,depth,salt,open);let h=0,dx=0,dy=0,vz=0,vx=0,vy=0;
    for(const b of bands){
      const along=b.x*x+b.y*y,across=-b.y*x+b.x*y,group=along*b.k*.31-time*b.omega*.19+b.phase*2.7,groupCos=Math.cos(group),cross=across*b.crossK+.75*Math.sin(group)-time*b.omega*.11+b.phase*1.3;
      const sx=Math.sin(cross),cx=Math.cos(cross),crossX=-b.y*b.crossK+.75*groupCos*b.k*.31*b.x,crossY=b.x*b.crossK+.75*groupCos*b.k*.31*b.y,crossT=-b.omega*(.11+.75*.19*groupCos);
      const phase=along*b.k+.40*sx-time*b.omega+b.phase,s=Math.sin(phase),c=Math.cos(phase),shape=s+.24*s*c+.35*(s*s-.5),slope=c+.24*(2*c*c-1)+.70*s*c,lobe=.5+.5*cx,envelope=.14+1.16*lobe*lobe,envelopeSlope=-1.16*lobe*sx;
      const phaseX=b.k*b.x+.40*cx*crossX,phaseY=b.k*b.y+.40*cx*crossY,phaseT=-b.omega+.40*cx*crossT,a=b.amplitude;
      h+=a*envelope*shape;dx+=a*(envelopeSlope*crossX*shape+envelope*slope*phaseX);dy+=a*(envelopeSlope*crossY*shape+envelope*slope*phaseY);vz+=a*(envelopeSlope*crossT*shape+envelope*slope*phaseT);
      const orbital=a*envelope*b.omega*s/b.k;vx+=orbital*phaseX;vy+=orbital*phaseY;
    }
    // A smooth, monotone limit bounds rare constructive packets without hard
    // clipping. Apply its derivative to every slope and surface velocity.
    const limit=1/Math.sqrt(1+h*h/16),derivative=limit*limit*limit,height=h*limit,shelter=clamp((y-700)/1100,0,1),ey=open?0:smooth(.3,2.4,depth)*.80*(6*shelter*(1-shelter)/1100)*smooth(3,16,depth)*(.75+.25*salt);
    out.height=height*e;out.dx=dx*derivative*e;out.dy=dy*derivative*e+height*ey;out.vz=vz*derivative*e;out.vx=vx*limit*e;out.vy=vy*limit*e;out.exposure=e;return out;
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
      const speed=Math.hypot(s.vx,s.vy),time=this.time;if(speed<2||time-this.last[id]<(id===0?.18:.6))return;
      // Recovery or a test teleport starts a new trail without a long ghost wake.
      if(this.last[id]>=0&&Math.hypot(s.x-this.lastX[id],s.y-this.lastY[id])>speed*1.5+80)for(let n=0;n<this.count;n++)if(this.wake[n*8+7]===id)this.wake[n*8+2]=-100;
      this.last[id]=time;this.lastX[id]=s.x;this.lastY[id]=s.y;
      const i=this.cursor*8;this.cursor=(this.cursor+1)%CAPACITY;this.count=Math.min(CAPACITY,this.count+1);
      this.wake.set([s.x-Math.cos(s.angle)*s.length*.42,s.y-Math.sin(s.angle)*s.length*.42,time,s.angle,s.width*.48,Math.max(1.6,s.width*.28),Math.min(.55,.11+s.width*.018)*Math.min(1,speed/36),id],i);
    }
    stepShip(s,dt,moving=true){
      const p=this.probes,c=Math.cos(s.angle),sn=Math.sin(s.angle),l=s.length*.38,w=s.width*.42;
      this.at(s.x,s.y,this.time,p[0],s.id);this.at(s.x+c*l,s.y+sn*l,this.time,p[1],s.id);this.at(s.x-c*l,s.y-sn*l,this.time,p[2],s.id);this.at(s.x-sn*w,s.y+c*w,this.time,p[3],s.id);this.at(s.x+sn*w,s.y-c*w,this.time,p[4],s.id);
      const load=clamp((s.cargo||0)/(s.hold||1),0,1),response=clamp(Math.sqrt(12/s.length),.4,1.4)/(1+load*.3),frequency=5.5*response;
      const speed=Math.hypot(s.vx,s.vy),plane=smooth(.25,.85,speed/Math.max(1,s.speed))*response*this.strength,bank=clamp(-(s.turn||0)*speed*.006*response,-.20,.20)*this.strength;
      const target=(p[0].height*2+p[1].height+p[2].height+p[3].height+p[4].height)/6+plane*.18,pitch=clamp((p[1].height-p[2].height)/(2*l)+plane*.065,-.36,.36),roll=clamp((p[3].height-p[4].height)/(2*w)+bank,-.42,.42);
      // Damping follows the surface travelling under the hull. Damping against
      // stationary world space alone makes a fast boat lag below every crest.
      for(const q of p)q.travel=q.vz+q.dx*s.vx+q.dy*s.vy;
      const rise=(p[0].travel*2+p[1].travel+p[2].travel+p[3].travel+p[4].travel)/6,pitchRate=clamp((p[1].travel-p[2].travel)/(2*l),-1.2,1.2),rollRate=clamp((p[3].travel-p[4].travel)/(2*w),-1.5,1.5);
      if(!s.sea||Math.hypot(s.x-s.sea.x,s.y-s.sea.y)>Math.max(80,s.speed*2))s.sea={z:target,pitch,roll,vz:0,vp:0,vr:0,x:s.x,y:s.y};
      const state=s.sea;state.pz=state.z;state.ppitch=state.pitch;state.proll=state.roll;
      for(const [key,velocity,goal,rate]of [['z','vz',target,rise],['pitch','vp',pitch,pitchRate],['roll','vr',roll,rollRate]]){state[velocity]+=(frequency*frequency*(goal-state[key])-1.55*frequency*(state[velocity]-rate*.82))*dt;state[key]+=state[velocity]*dt;}
      const tilt=Math.hypot(state.pitch,state.roll);if(tilt>.48){const limit=.48/tilt;state.pitch*=limit;state.roll*=limit;state.vp*=limit;state.vr*=limit;}
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
    float seaExposure(vec2 p,float depth,float salt,float openSea){return smoothstep(.3,2.4,depth)*(.20+.80*mix(smoothstep(700.,1800.,p.y),1.,openSea)*smoothstep(3.,16.,depth))*(.75+.25*salt);}
    vec3 waveSurface(vec2 p,float time,float depth,float salt,float openSea){vec3 q=vec3(0.);float e=seaExposure(p,depth,salt,openSea)*uSeaStrength;
      ${bands.map(b=>`{vec2 d=vec2(${f(b.x)},${f(b.y)}),n=vec2(-d.y,d.x);float along=dot(p,d),groupPhase=along*${f(b.k*.31)}-time*${f(b.omega*.19)}+${f(b.phase*2.7)},groupCos=cos(groupPhase),crossPhase=dot(p,n)*${f(b.crossK)}+.75*sin(groupPhase)-time*${f(b.omega*.11)}+${f(b.phase*1.3)},sx=sin(crossPhase),cx=cos(crossPhase),phase=along*${f(b.k)}+.40*sx-time*${f(b.omega)}+${f(b.phase)},s=sin(phase),c=cos(phase),shape=s+.24*s*c+.35*(s*s-.5),slope=c+.24*(2.*c*c-1.)+.70*s*c,lobe=.5+.5*cx,envelope=.14+1.16*lobe*lobe,envelopeSlope=-1.16*lobe*sx,a=${f(b.amplitude)};vec2 crossGrad=n*${f(b.crossK)}+.75*groupCos*${f(b.k*.31)}*d,phaseGrad=d*${f(b.k)}+.40*cx*crossGrad;q.x+=a*envelope*shape;q.yz+=a*(envelopeSlope*crossGrad*shape+envelope*slope*phaseGrad);}`).join('\n')}
      float softLimit=inversesqrt(1.+q.x*q.x/16.);q.yz*=softLimit*softLimit*softLimit;q.x*=softLimit;
      float shelter=clamp((p.y-700.)/1100.,0.,1.),ey=smoothstep(.3,2.4,depth)*.80*(1.-openSea)*(6.*shelter*(1.-shelter)/1100.)*smoothstep(3.,16.,depth)*(.75+.25*salt)*uSeaStrength;
      q.yz*=e;q.z+=q.x*ey;q.x*=e;
      return q;
    }
  `;
  const api={Sea,sample,exposure,bands,glsl,CAPACITY,LIFE};root.WidewakeWaves=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
