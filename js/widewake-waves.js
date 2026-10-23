/* Shared metre-scale sea. Simulation time only, no DOM or random stream. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  // A directional spectrum: long ocean swell, crossing swell, then wind waves.
  // All offshore energy travels toward the northern mainland, never out of it.
  // Incommensurate wavelengths and independent groups avoid a tiled crest stamp.
  const bands=Object.freeze([
    {length:173,amplitude:1.85,angle:-1.72,phase:.7,crestLength:421},
    {length:119,amplitude:1.12,angle:-1.26,phase:2.4,crestLength:293},
    {length:83,amplitude:.65,angle:-2.12,phase:4.1,crestLength:227},
    {length:251,amplitude:.72,angle:-.68,phase:1.2,crestLength:613},
    {length:53,amplitude:.32,angle:-1.49,phase:3.5,crestLength:137},
    {length:29,amplitude:.19,angle:-2.08,phase:5.3,crestLength:79,wind:true},
    {length:17,amplitude:.10,angle:-1.79,phase:1.9,crestLength:47,wind:true},
    {length:9.7,amplitude:.045,angle:-1.96,phase:4.8,crestLength:31,wind:true}
  ].map(b=>Object.freeze({...b,k:TAU/b.length,crossK:TAU/b.crestLength,omega:Math.sqrt(9.81*TAU/b.length),x:Math.cos(b.angle),y:Math.sin(b.angle)})));
  function exposure(x,y,depth=22,salt=1,open=false){return smooth(.2,8,depth)*(open?1:smooth(900,2100,y)*smooth(.45,.9,salt));}
  function harborExposure(y,depth=22,salt=1,open=false){return smooth(.15,2.4,depth)*(open?1:.25);}
  // A cached chart of upstream water fetch. Land blocks incoming swell; local
  // wind waves grow only over uninterrupted water. No latitude-only river sea.
  // CPU and GPU use the same bounded C1 interpolation and analytic gradients.
  // Linear cell weights keep height continuous but jump its slope at each edge,
  // which lights the chart grid as sharp X shapes in the isometric water.
  const environmentKeys=['swell','wind','travel'];
  class Environment{
    constructor(field){this.field=field;this.step=64;this.left=-4032;this.top=-8064;this.width=127;this.height=190;this.data=new Float32Array(this.width*this.height*4);this.ready=new Uint8Array(this.width*this.height);this.water={};}
    cell(ix,iy){const index=iy*this.width+ix;if(this.ready[index])return index*4;this.ready[index]=1;
      const x=this.left+ix*this.step,y=this.top+iy*this.step,w=this.field.sample(x,y,this.water),depth=w.depth;let swell=0,fetch=0,travel=0;
      if(depth>0){
        for(const angle of [-1.95,-1.57,-1.19]){let transmission=1,delay=0,reached=false;const dx=-Math.cos(angle),dy=-Math.sin(angle);
          for(let distance=0;distance<=4096;distance+=32){const q=this.field.sample(x+dx*distance,y+dy*distance,this.water);if(q.depth<=.1){transmission=0;break;}if(q.channel==='sea'&&q.depth>=12){reached=true;break;}
            transmission=Math.min(transmission,smooth(.1,3,q.depth))*Math.exp(-32*(.00015+.003*(1-smooth(3,14,q.depth))+.0015*(1-smooth(50,250,q.edge))));delay+=32*(Math.sqrt(Math.tanh(bands[0].k*22)/Math.tanh(bands[0].k*Math.max(.8,q.depth)))-1);if(transmission<.001)break;
          }
          if(reached){swell+=transmission/3;travel+=Math.max(0,delay)*transmission/3;}
        }
        // Short fetch inside a bend cannot generate a metre-high ocean packet.
        let alive=1,previous=0;for(const distance of [16,40,80,144,240,384,576]){const q=this.field.sample(x+.35*distance,y+.93675*distance,this.water);alive*=smooth(.05,1.8,q.depth);fetch+=alive*(distance-previous);previous=distance;if(alive<.001)break;}
      }
      // Optical distance increases in shallows. Its spatial gradient bends and
      // compresses the incoming phase without rotating a wave abruptly per cell.
      const at=index*4;this.data[at]=swell;this.data[at+1]=depth>0?.12+.88*Math.sqrt(fetch/576):0;this.data[at+2]=swell>.001?travel/swell:0;this.data[at+3]=0;return at;
    }
    at(x,y,out={}){const u=clamp((x-this.left)/this.step,0,this.width-1.000001),v=clamp((y-this.top)/this.step,0,this.height-1.000001),ix=Math.floor(u),iy=Math.floor(v),tx=u-ix,ty=v-iy,fx=tx*tx*(3-2*tx),fy=ty*ty*(3-2*ty),dx=6*tx*(1-tx)/this.step,dy=6*ty*(1-ty)/this.step,d=this.data;
      const a=this.cell(ix,iy),b=this.cell(ix+1,iy),c=this.cell(ix,iy+1),e=this.cell(ix+1,iy+1);
      for(let i=0;i<3;i++){const key=environmentKeys[i];out[key]=(d[a+i]*(1-fx)+d[b+i]*fx)*(1-fy)+(d[c+i]*(1-fx)+d[e+i]*fx)*fy;out[key+'X']=((d[b+i]-d[a+i])*(1-fy)+(d[e+i]-d[c+i])*fy)*dx;out[key+'Y']=((d[c+i]-d[a+i])*(1-fx)+(d[e+i]-d[b+i])*fx)*dy;}
      return out;
    }
    complete(){for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)this.cell(x,y);return this.data;}
  }
  function swellFrame(x,y,time,out={},depth=22,salt=1,open=true){const b=bands[0];out.phase=(b.x*x+b.y*y)*b.k-time*b.omega+b.phase;out.envelope=1;out.across=-b.y*x+b.x*y;return out;}
  function sample(x,y,time,depth=22,salt=1,open=true,out={},environment=null){
    const wet=smooth(.2,8,depth),windWet=smooth(.15,2.4,depth),e=environment?environment.swell*wet:exposure(x,y,depth,salt,open),localE=environment?environment.wind*windWet:harborExposure(y,depth,salt,open);
    let h=0,dx=0,dy=0,vz=0,vx=0,vy=0,lh=0,ldx=0,ldy=0,lvz=0,lvx=0,lvy=0;
    for(const b of bands){
      const along=b.x*x+b.y*y,across=-b.y*x+b.x*y,groupAlong=b.wind?.37:.23,groupAcross=b.wind?2.1:.71,variation=b.wind?.42:.22;
      const group=along*b.k*groupAlong+across*b.crossK*groupAcross-time*b.omega*.17+b.phase*2.7;
      const groupX=b.x*b.k*groupAlong-b.y*b.crossK*groupAcross,groupY=b.y*b.k*groupAlong+b.x*b.crossK*groupAcross,groupT=-b.omega*.17,envelope=1-variation+variation*Math.sin(group),es=variation*Math.cos(group);
      const travel=!b.wind&&environment?environment.travel:0,tx=!b.wind&&environment?environment.travelX:0,ty=!b.wind&&environment?environment.travelY:0;
      let phase=(along+travel)*b.k-time*b.omega+b.phase,phaseX=b.k*(b.x+tx),phaseY=b.k*(b.y+ty),phaseT=-b.omega;
      if(b.wind){
        // Short, curved wind fronts share the prevailing wind. Two independent
        // phase modulations vary spacing along and across each packet, so three
        // endless plane waves cannot lay a diamond lattice over sheltered water.
        const a=(across*.63+along*.11)*b.k-time*b.omega*.13+b.phase*1.7,c=(across*.27-along*.19)*b.k+time*b.omega*.09+b.phase*3.1;
        const ca=1.25*Math.cos(a),cc=.65*Math.cos(c);phase+=1.25*Math.sin(a)+.65*Math.sin(c);
        phaseX+=b.k*(ca*(-b.y*.63+b.x*.11)+cc*(-b.y*.27-b.x*.19));
        phaseY+=b.k*(ca*(b.x*.63+b.y*.11)+cc*(b.x*.27-b.y*.19));phaseT+=b.omega*(-ca*.13+cc*.09);
      }
      const s=Math.sin(phase),c=Math.cos(phase),shape=s+.16*s*c,slope=c+.16*(2*c*c-1),a=b.amplitude;
      const value=a*envelope*shape,gx=a*(es*groupX*shape+envelope*slope*phaseX),gy=a*(es*groupY*shape+envelope*slope*phaseY),vertical=a*(es*groupT*shape+envelope*slope*phaseT),orbital=-a*envelope*phaseT*s;
      if(b.wind){lh+=value;ldx+=gx;ldy+=gy;lvz+=vertical;lvx+=orbital*b.x;lvy+=orbital*b.y;}
      else{h+=value;dx+=gx;dy+=gy;vz+=vertical;vx+=orbital*b.x;vy+=orbital*b.y;}
    }
    const limit=1/Math.sqrt(1+h*h/25),derivative=limit*limit*limit,height=h*limit;
    let ex=0,ey=0,wx=0,wy=0;if(environment){ex=environment.swellX*wet;ey=environment.swellY*wet;wx=environment.windX*windWet;wy=environment.windY*windWet;}
    else if(!open){const t=clamp((y-900)/1200,0,1);ey=wet*smooth(.45,.9,salt)*6*t*(1-t)/1200;}
    out.height=height*e+lh*localE;out.dx=dx*derivative*e+height*ex+ldx*localE+lh*wx;out.dy=dy*derivative*e+height*ey+ldy*localE+lh*wy;out.vz=vz*derivative*e+lvz*localE;out.vx=vx*limit*e+lvx*localE;out.vy=vy*limit*e+lvy*localE;out.exposure=e;out.chop=localE;return out;
  }
  const CAPACITY=384,LIFE=8;
  class Sea{
    constructor(field=null){this.field=field;this.environment=field?.paths?new Environment(field):null;this.environmentSample={};this.time=0;this.cursor=0;this.count=0;this.water={};this.probes=Array.from({length:9},()=>({}));this.last=new Float64Array(24).fill(-1);this.lastX=new Float64Array(24);this.lastY=new Float64Array(24);this.wake=new Float64Array(CAPACITY*8);this.strength=1;}
    at(x,y,time=this.time,out={},owner=-1,wakes=true){
      const w=this.field?.sample(x,y,this.water);sample(x,y,time,w?.depth??22,w?.salinity??1,!this.field,out,this.environment?.at(x,y,this.environmentSample));
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
      const p=this.probes,c=Math.cos(s.angle),sn=Math.sin(s.angle),l=s.length*Math.sqrt(.6)*.5,w=s.width*Math.sqrt(.6)*.5;
      // Nine area quadrature points see all four quarters, rather than a cross
      // that misses oblique crests. Weights integrate the hull's area and inertia.
      let mean=0,rise=0,pitch=0,roll=0;
      for(let row=0;row<3;row++)for(let col=0;col<3;col++){
        const q=p[row*3+col],a=(row-1)*l,b=(col-1)*w,weight=(row===1?8:5)*(col===1?8:5)/324;
        this.at(s.x+c*a-sn*b,s.y+sn*a+c*b,this.time,q,s.id);q.a=a;q.b=b;q.weight=weight;
        // Each pressure patch moves sideways while the hull yaws.
        q.travel=q.vz+q.dx*(s.vx-(s.turn||0)*(sn*a+c*b))+q.dy*(s.vy+(s.turn||0)*(c*a-sn*b));
        mean+=q.height*weight;rise+=q.travel*weight;pitch+=q.height*a*weight;roll+=q.height*b*weight;
      }
      const load=clamp((s.cargo||0)/(s.hold||1),0,1),mass=1+load*.45,draft=s.draft||s.width*.18,gravity=9.81;
      const target=mean-draft*(mass-1);
      if(!s.sea||Math.hypot(s.x-s.sea.x,s.y-s.sea.y)>Math.max(80,s.speed*2))s.sea={z:target,pitch:pitch/(s.length*s.length/12),roll:roll/(s.width*s.width/12),vz:rise,vp:0,vr:0,x:s.x,y:s.y,contact:1,airborne:false,jumpAt:-100,landAt:-100,landCount:0};
      const state=s.sea;state.pz=state.z;state.ppitch=state.pitch;state.proll=state.roll;
      // Unilateral pressure patches support a single rigid body. Their
      // buoyancy depends on displaced water; damping opposes relative contact
      // velocity. Dry water patches exert no force and cannot pull the hull down.
      // There is no crest trigger, launch impulse, prescribed pitch or landing snap.
      const inertiaPitch=(s.length*s.length+draft*draft)/12,inertiaRoll=(s.width*s.width+draft*draft)/12;
      const damping=.95*Math.sqrt(gravity/(draft*mass)),steps=Math.max(1,Math.ceil(dt*180/Math.sqrt(s.length/6))),h=dt/steps,airDrag=Math.exp(-h*.06/Math.sqrt(s.length/6)/mass);
      let horizontalX=0,horizontalY=0,yawTorque=0;
      for(let step=0;step<steps;step++){
        let az=0,ap=0,ar=0,wet=0,closing=0,contactX=0,contactY=0,fx=0,fy=0;
        const offset=(step+.5)*h-dt;
        for(let i=0;i<9;i++){
          const q=p[i],a=q.a,b=q.b,weight=q.weight;
          const level=q.height+q.travel*offset,keel=state.z+state.pitch*a+state.roll*b-draft,immersion=Math.max(0,level-keel);
          const touching=clamp(immersion/(draft*mass),0,1),relative=q.travel-state.vz-state.vp*a-state.vr*b;
          const pressure=immersion>0?Math.max(0,gravity*immersion/(draft*mass)+damping*relative*touching):0;
          az+=(pressure-gravity)*weight;ap+=pressure*weight*a/inertiaPitch;ar+=pressure*weight*b/inertiaRoll;
          wet+=touching*weight;fx-=q.dx*pressure*weight;fy-=q.dy*pressure*weight;
          yawTorque+=pressure*weight*(-a*(-q.dx*sn+q.dy*c)+b*(q.dx*c+q.dy*sn))/steps;
          if(immersion>0&&relative>closing){closing=relative;contactX=s.x+c*a-sn*b;contactY=s.y+sn*a+c*b;}
        }
        // Lateral water force acts below the centre of mass, banking a turning
        // hull. Angular momentum otherwise persists, including through flight.
        const lateral=Number.isFinite(s.helmLateralAccel)?s.helmLateralAccel:(s.turn||0)*(s.vx*c+s.vy*sn)*wet;
        ar-=lateral*draft*.12/inertiaRoll;
        state.z+=state.vz*h+az*h*h*.5;state.vz+=az*h;state.pitch+=state.vp*h+ap*h*h*.5;state.roll+=state.vr*h+ar*h*h*.5;state.vp=(state.vp+ap*h)*airDrag;state.vr=(state.vr+ar*h)*airDrag;
        const airborne=wet===0;
        if(airborne&&!state.airborne)state.jumpAt=this.time;
        if(!airborne&&state.airborne&&closing>.8){state.landAt=this.time;state.landX=contactX;state.landY=contactY;state.landAngle=s.angle;state.landSpeed=Math.hypot(s.vx,s.vy);state.impact=closing;state.landCount=(state.landCount||0)+1;}
        state.airborne=airborne;state.contact=wet;horizontalX+=fx/steps;horizontalY+=fy/steps;
        // Keep the existing non-inverting projection envelope. This constraint
        // applies equally to every hull and never supplies takeoff velocity.
        const tilt=Math.hypot(state.pitch,state.roll);if(tilt>.48){const limit=.48/tilt;state.pitch*=limit;state.roll*=limit;state.vp*=limit;state.vr*=limit;}
      }
      state.x=s.x;state.y=s.y;state.surface=target;state.exposure=p[4].exposure;
      if(moving){
        const response=clamp(Math.sqrt(12/s.length),.4,1.4)/mass,grip=state.contact;
        const ax=horizontalX*response*.55+p[4].vx*.6*response*grip,ay=horizontalY*response*.55+p[4].vy*.6*response*grip;
        s.vx+=ax*dt;s.vy+=ay*dt;s.x+=ax*dt*dt;s.y+=ay*dt*dt;
        const yaw=clamp(yawTorque/((s.length*s.length+s.width*s.width)/12),-.3,.3)*response*.55;
        s.turn=(s.turn||0)+yaw*dt;s.angle+=yaw*dt*dt;
      }
      // The helm force belongs to this integration step. A later mooring or
      // passive buoyancy update must not keep applying a previous turn's load.
      s.helmLateralAccel=undefined;
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
    uniform float uSeaStrength;uniform bool uEnvironmentEnabled;uniform sampler2D uEnvironment;
    vec4 seaEnvironment(vec2 p,out vec3 gx,out vec3 gy){
      vec2 q=clamp((p-vec2(-4032.,-8064.))/64.,vec2(0.),vec2(125.999999,188.999999)),cell=floor(q),t=q-cell;ivec2 c=ivec2(cell);
      vec4 a=texelFetch(uEnvironment,c,0),b=texelFetch(uEnvironment,c+ivec2(1,0),0),d=texelFetch(uEnvironment,c+ivec2(0,1),0),e=texelFetch(uEnvironment,c+ivec2(1,1),0);
      vec2 gradient=6.*t*(1.-t)/64.;t=t*t*(3.-2.*t);
      gx=mix(b.xyz-a.xyz,e.xyz-d.xyz,t.y)*gradient.x;gy=mix(d.xyz-a.xyz,e.xyz-b.xyz,t.x)*gradient.y;return mix(mix(a,b,t.x),mix(d,e,t.x),t.y);
    }
    float seaExposure(vec2 p,float depth,float salt,float openSea){return smoothstep(.2,8.,depth)*mix(smoothstep(900.,2100.,p.y)*smoothstep(.45,.9,salt),1.,openSea);}
    float harborExposure(vec2 p,float depth,float salt,float openSea){return smoothstep(.15,2.4,depth)*mix(.25,1.,openSea);}
    vec3 swellFrame(vec2 p,float time,float depth,float salt,float openSea){return vec3(dot(p,vec2(${f(bands[0].x)},${f(bands[0].y)}))*${f(bands[0].k)}-time*${f(bands[0].omega)}+${f(bands[0].phase)},1.,dot(p,vec2(${f(-bands[0].y)},${f(bands[0].x)})));}
    vec3 waveSurface(vec2 p,float time,float depth,float salt,float openSea){vec3 q=vec3(0.),r=vec3(0.);float e=seaExposure(p,depth,salt,openSea),localE=harborExposure(p,depth,salt,openSea),travel=0.;vec2 eg=vec2(0.),wg=vec2(0.),tg=vec2(0.);
      if(uEnvironmentEnabled){vec3 gx,gy;vec4 env=seaEnvironment(p,gx,gy);float wet=smoothstep(.2,8.,depth),windWet=smoothstep(.15,2.4,depth);e=env.x*wet;localE=env.y*windWet;eg=vec2(gx.x,gy.x)*wet;wg=vec2(gx.y,gy.y)*windWet;travel=env.z;tg=vec2(gx.z,gy.z);}
      else{float t=clamp((p.y-900.)/1200.,0.,1.);eg.y=(1.-openSea)*smoothstep(.2,8.,depth)*smoothstep(.45,.9,salt)*6.*t*(1.-t)/1200.;}
      ${bands.map(b=>{const sum=b.wind?'r':'q',ga=b.k*(b.wind?.37:.23),gc=b.crossK*(b.wind?2.1:.71),variation=b.wind?.42:.22;return`{
        vec2 d=vec2(${f(b.x)},${f(b.y)}),n=vec2(-d.y,d.x);float along=dot(p,d),across=dot(p,n);
        float groupPhase=along*${f(ga)}+across*${f(gc)}-time*${f(b.omega*.17)}+${f(b.phase*2.7)},envelope=${f(1-variation)}+${f(variation)}*sin(groupPhase),es=${f(variation)}*cos(groupPhase);
        float phase=(along+${b.wind?'0.':'travel'})*${f(b.k)}-time*${f(b.omega)}+${f(b.phase)};vec2 phaseGrad=(d+${b.wind?'vec2(0.)':'tg'})*${f(b.k)};
        ${b.wind?`float a=(across*.63+along*.11)*${f(b.k)}-time*${f(b.omega*.13)}+${f(b.phase*1.7)},b=(across*.27-along*.19)*${f(b.k)}+time*${f(b.omega*.09)}+${f(b.phase*3.1)};
        phase+=1.25*sin(a)+.65*sin(b);phaseGrad+=${f(b.k)}*(1.25*cos(a)*(n*.63+d*.11)+.65*cos(b)*(n*.27-d*.19));`:''}
        float s=sin(phase),c=cos(phase),shape=s+.16*s*c,slope=c+.16*(2.*c*c-1.),amplitude=${f(b.amplitude)};vec2 groupGrad=d*${f(ga)}+n*${f(gc)};
        ${sum}.x+=amplitude*envelope*shape;${sum}.yz+=amplitude*(es*groupGrad*shape+envelope*slope*phaseGrad);
      }`;}).join('\n')}
      float softLimit=inversesqrt(1.+q.x*q.x/25.);q.yz*=softLimit*softLimit*softLimit;q.x*=softLimit;
      q.yz=q.yz*e+q.x*eg+r.yz*localE+r.x*wg;q.x=q.x*e+r.x*localE;return q*uSeaStrength;
    }
  `;
  const api={Sea,Environment,sample,swellFrame,exposure,harborExposure,bands,glsl,CAPACITY,LIFE};root.WidewakeWaves=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
