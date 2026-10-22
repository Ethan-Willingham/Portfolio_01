/* Shared metre-scale sea. Simulation time only, no DOM or random stream. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  // A dominant long swell gives a fast captain time to read each approaching
  // face. Quiet companion packets vary its height without adding rapid jolts.
  // Cross-wave envelopes bend and drift rather than spanning the whole sea.
  // The same coefficients generate the shader and its analytic surface normals.
  // Small ripples keep the surface alive but contribute very little hull motion.
  // The asymmetric profile sharpens crests and broadens the water between them.
  const bands=Object.freeze([
    {length:144,amplitude:3.2,angle:-3.8,phase:.7,crestLength:190},
    {length:208,amplitude:.72,angle:-3.52,phase:2.4,crestLength:240},
    {length:96,amplitude:.30,angle:-4.05,phase:4.1,crestLength:142},
    {length:42,amplitude:.08,angle:-2.9,phase:1.2,crestLength:72},
    {length:24,amplitude:.035,angle:-3.6,phase:3.5,crestLength:45},
    {length:14,amplitude:.015,angle:-.8,phase:5.3,crestLength:32}
  ].map(b=>Object.freeze({...b,k:TAU/b.length,crossK:TAU/b.crestLength,omega:Math.sqrt(9.81*TAU/b.length),x:Math.cos(b.angle),y:Math.sin(b.angle)})));
  // Crest decoration travels in the dominant packet's frame, so its tapered
  // ends and foam stay attached to the water that actually lifts the hull.
  function swellFrame(x,y,time,out={}){
    const b=bands[0],along=b.x*x+b.y*y,across=-b.y*x+b.x*y;
    const group=along*b.k*.31-time*b.omega*.19+b.phase*2.7,cross=across*b.crossK+.75*Math.sin(group)-time*b.omega*.11+b.phase*1.3;
    const lobe=.5+.5*Math.cos(cross);
    out.phase=along*b.k+.40*Math.sin(cross)-time*b.omega+b.phase;out.envelope=.14+1.16*lobe*lobe;out.across=across;return out;
  }
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
      const speed=Math.hypot(s.vx,s.vy),time=this.time;if(s.sea?.airborne||speed<2||time-this.last[id]<(id===0?.18:.6))return;
      // Recovery or a test teleport starts a new trail without a long ghost wake.
      if(this.last[id]>=0&&Math.hypot(s.x-this.lastX[id],s.y-this.lastY[id])>speed*1.5+80)for(let n=0;n<this.count;n++)if(this.wake[n*8+7]===id)this.wake[n*8+2]=-100;
      this.last[id]=time;this.lastX[id]=s.x;this.lastY[id]=s.y;
      const i=this.cursor*8;this.cursor=(this.cursor+1)%CAPACITY;this.count=Math.min(CAPACITY,this.count+1);
      this.wake.set([s.x-Math.cos(s.angle)*s.length*.42,s.y-Math.sin(s.angle)*s.length*.42,time,s.angle,s.width*.48,Math.max(1.6,s.width*.28),Math.min(.55,.11+s.width*.018)*Math.min(1,speed/36),id],i);
    }
    stepShip(s,dt,moving=true){
      const p=this.probes,c=Math.cos(s.angle),sn=Math.sin(s.angle),l=s.length*.38,w=s.width*.42;
      this.at(s.x,s.y,this.time,p[0],s.id);this.at(s.x+c*l,s.y+sn*l,this.time,p[1],s.id);this.at(s.x-c*l,s.y-sn*l,this.time,p[2],s.id);this.at(s.x-sn*w,s.y+c*w,this.time,p[3],s.id);this.at(s.x+sn*w,s.y-c*w,this.time,p[4],s.id);
      const load=clamp((s.cargo||0)/(s.hold||1),0,1),mass=1+load*.45,draft=s.draft||s.width*.18,gravity=9.81;
      const target=(p[0].height*2+p[1].height+p[2].height+p[3].height+p[4].height)/6-draft*(mass-1);
      for(const q of p)q.travel=q.vz+q.dx*s.vx+q.dy*s.vy;
      const rise=(p[0].travel*2+p[1].travel+p[2].travel+p[3].travel+p[4].travel)/6;
      if(!s.sea||Math.hypot(s.x-s.sea.x,s.y-s.sea.y)>Math.max(80,s.speed*2))s.sea={z:target,pitch:(p[1].height-p[2].height)/(2*l),roll:(p[3].height-p[4].height)/(2*w),vz:rise,vp:0,vr:0,x:s.x,y:s.y,contact:1,airborne:false,jumpAt:-100,landAt:-100,landCount:0};
      const state=s.sea;state.pz=state.z;state.ppitch=state.pitch;state.proll=state.roll;
      // Five unilateral pressure patches support a single rigid body. Their
      // buoyancy depends on displaced water; damping opposes relative contact
      // velocity. Dry water patches exert no force and cannot pull the hull down.
      // There is no crest trigger, launch impulse, prescribed pitch or landing snap.
      const inertiaPitch=(s.length*s.length+draft*draft)/12,inertiaRoll=(s.width*s.width+draft*draft)/12;
      const damping=1.35*Math.sqrt(gravity/(draft*mass)),steps=Math.max(1,Math.ceil(dt*180/Math.sqrt(s.length/6))),h=dt/steps,airDrag=Math.exp(-h*.06/Math.sqrt(s.length/6)/mass);
      let horizontalX=0,horizontalY=0;
      for(let step=0;step<steps;step++){
        let az=0,ap=0,ar=0,wet=0,closing=0,contactX=0,contactY=0,fx=0,fy=0;
        const offset=(step+.5)*h-dt;
        for(let i=0;i<5;i++){
          const q=p[i],a=i===1?l:i===2?-l:0,b=i===3?w:i===4?-w:0,weight=i===0?1/3:1/6;
          const level=q.height+q.travel*offset,keel=state.z+state.pitch*a+state.roll*b-draft,immersion=Math.max(0,level-keel);
          const touching=clamp(immersion/(draft*mass),0,1),relative=q.travel-state.vz-state.vp*a-state.vr*b;
          const pressure=immersion>0?Math.max(0,gravity*immersion/(draft*mass)+damping*relative*touching):0;
          az+=(pressure-gravity)*weight;ap+=pressure*weight*a/inertiaPitch;ar+=pressure*weight*b/inertiaRoll;
          wet+=touching*weight;fx-=q.dx*pressure*weight;fy-=q.dy*pressure*weight;
          if(immersion>0&&relative>closing){closing=relative;contactX=s.x+c*a-sn*b;contactY=s.y+sn*a+c*b;}
        }
        // Lateral water force acts below the centre of mass, banking a turning
        // hull. Angular momentum otherwise persists, including through flight.
        ar-=(s.turn||0)*(s.vx*c+s.vy*sn)*draft*.12*wet/inertiaRoll;
        state.z+=state.vz*h+az*h*h*.5;state.vz+=az*h;state.pitch+=state.vp*h+ap*h*h*.5;state.roll+=state.vr*h+ar*h*h*.5;state.vp=(state.vp+ap*h)*airDrag;state.vr=(state.vr+ar*h)*airDrag;
        const airborne=wet===0;
        if(airborne&&!state.airborne)state.jumpAt=this.time;
        if(!airborne&&state.airborne&&closing>.8){state.landAt=this.time;state.landX=contactX;state.landY=contactY;state.landAngle=s.angle;state.landSpeed=Math.hypot(s.vx,s.vy);state.impact=closing;state.landCount=(state.landCount||0)+1;}
        state.airborne=airborne;state.contact=wet;horizontalX+=fx/steps;horizontalY+=fy/steps;
        // Keep the existing non-inverting projection envelope. This constraint
        // applies equally to every hull and never supplies takeoff velocity.
        const tilt=Math.hypot(state.pitch,state.roll);if(tilt>.48){const limit=.48/tilt;state.pitch*=limit;state.roll*=limit;state.vp*=limit;state.vr*=limit;}
      }
      state.x=s.x;state.y=s.y;state.surface=target;state.exposure=p[0].exposure;
      if(moving){
        const response=clamp(Math.sqrt(12/s.length),.4,1.4)/mass,grip=state.contact;
        const ax=horizontalX*response*.55+p[0].vx*.6*response*grip,ay=horizontalY*response*.55+p[0].vy*.6*response*grip;
        s.vx+=ax*dt;s.vy+=ay*dt;s.x+=ax*dt*dt;s.y+=ay*dt*dt;
        const yaw=clamp((p[1].dy-p[2].dy)*c-(p[1].dx-p[2].dx)*sn,-.15,.15)*response*grip;
        s.turn=(s.turn||0)+yaw*dt;s.angle+=yaw*dt*dt;
      }
      this.emit(s);return state;
    }
    pose(s,alpha=1,out={}){const p=s.sea;out.z=p?p.pz+(p.z-p.pz)*alpha:0;out.pitch=p?p.ppitch+(p.pitch-p.ppitch)*alpha:0;out.roll=p?p.proll+(p.roll-p.proll)*alpha:0;out.airborne=!!p?.airborne;return out;}
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
    vec3 swellFrame(vec2 p,float time){
      ${(()=>{const b=bands[0];return`vec2 d=vec2(${f(b.x)},${f(b.y)});float along=dot(p,d),across=dot(p,vec2(-d.y,d.x)),groupPhase=along*${f(b.k*.31)}-time*${f(b.omega*.19)}+${f(b.phase*2.7)},crossPhase=across*${f(b.crossK)}+.75*sin(groupPhase)-time*${f(b.omega*.11)}+${f(b.phase*1.3)},lobe=.5+.5*cos(crossPhase);return vec3(along*${f(b.k)}+.40*sin(crossPhase)-time*${f(b.omega)}+${f(b.phase)},.14+1.16*lobe*lobe,across);`;})()}
    }
    float seaExposure(vec2 p,float depth,float salt,float openSea){return smoothstep(.3,2.4,depth)*(.20+.80*mix(smoothstep(700.,1800.,p.y),1.,openSea)*smoothstep(3.,16.,depth))*(.75+.25*salt);}
    vec3 waveSurface(vec2 p,float time,float depth,float salt,float openSea){vec3 q=vec3(0.);float e=seaExposure(p,depth,salt,openSea)*uSeaStrength;
      ${bands.map(b=>`{vec2 d=vec2(${f(b.x)},${f(b.y)}),n=vec2(-d.y,d.x);float along=dot(p,d),groupPhase=along*${f(b.k*.31)}-time*${f(b.omega*.19)}+${f(b.phase*2.7)},groupCos=cos(groupPhase),crossPhase=dot(p,n)*${f(b.crossK)}+.75*sin(groupPhase)-time*${f(b.omega*.11)}+${f(b.phase*1.3)},sx=sin(crossPhase),cx=cos(crossPhase),phase=along*${f(b.k)}+.40*sx-time*${f(b.omega)}+${f(b.phase)},s=sin(phase),c=cos(phase),shape=s+.24*s*c+.35*(s*s-.5),slope=c+.24*(2.*c*c-1.)+.70*s*c,lobe=.5+.5*cx,envelope=.14+1.16*lobe*lobe,envelopeSlope=-1.16*lobe*sx,a=${f(b.amplitude)};vec2 crossGrad=n*${f(b.crossK)}+.75*groupCos*${f(b.k*.31)}*d,phaseGrad=d*${f(b.k)}+.40*cx*crossGrad;q.x+=a*envelope*shape;q.yz+=a*(envelopeSlope*crossGrad*shape+envelope*slope*phaseGrad);}`).join('\n')}
      float softLimit=inversesqrt(1.+q.x*q.x/16.);q.yz*=softLimit*softLimit*softLimit;q.x*=softLimit;
      float shelter=clamp((p.y-700.)/1100.,0.,1.),ey=smoothstep(.3,2.4,depth)*.80*(1.-openSea)*(6.*shelter*(1.-shelter)/1100.)*smoothstep(3.,16.,depth)*(.75+.25*salt)*uSeaStrength;
      q.yz*=e;q.z+=q.x*ey;q.x*=e;
      return q;
    }
  `;
  const api={Sea,sample,swellFrame,exposure,bands,glsl,CAPACITY,LIFE};root.WidewakeWaves=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
