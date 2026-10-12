/* Spatial reacting air for the standalone sandbox.
 * Finite-volume oxygen, carrier gas and exhaust share projected smoke airflow.
 * Oxygen is in reference-volume units (20.9% is a mole/volume fraction).
 * Heat follows measured oxygen consumption, 13.1 MJ/kg, not an inlet switch. */
(function(root){
  'use strict';
  const AMBIENT=.209, OXYGEN_DENSITY=1.331, HEAT_PER_KG=13.1e6;
  const VERT=`#version 300 es
  layout(location=0) in vec2 aPosition; out vec2 uv;
  void main(){uv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const COMMON=`#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 uv; out vec4 result;
  uniform sampler2D gas,flow,mask,oldGas,pressure,faces,ledger,wet;
  uniform vec2 size,world,velocitySize;
  uniform vec4 source;
  uniform float dt,diffusion,demand,fuelLimit,hot,wetActive,flameSupport;
  vec2 cell(){return 1./size;}
  bool solid(vec2 p){return texture(mask,p).a>.5;}
  bool room(vec2 p){return !solid(p) && (p.x<.035 || p.x>.965 || p.y<.045 || p.y>.955);}
  float openFace(vec2 a,vec2 b){return all(greaterThanEqual(b,vec2(0.)))&&all(lessThanEqual(b,vec2(1.)))&&(!solid(a)&&!solid(b))?1.:0.;}
  vec4 state(vec2 p){return texture(gas,p);}
  vec2 face(vec2 p){return any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.)))?vec2(0.):texture(faces,p).xy;}
  `;
  function create(options){
    const fluid=options.fluid,W=options.width,H=options.height,src=options.source;
    const candle=!!options.candle,maxPower=options.maxPowerW || (candle?60:250);
    const fuelMass=options.fuelMassKg || (candle?.01:.02),stoich=candle?3.455:2.667;
    const height=options.resolution || 128,width=Math.ceil(height*W/H);
    const metresPerPixel=.762/(options.scaleWidth || 720),depth=.0254;
    const cellVolume=W/width*H/height*metresPerPixel*metresPerPixel*depth;
    const oxygenPerCell=cellVolume*OXYGEN_DENSITY;
    const diffusivity=2.0e-5/(metresPerPixel*metresPerPixel); // O2 in air, world px squared/s.
    let bridge,gl,seconds=0,captureClock=-1,revision=0,retired=false,enabled=true,extinguished=false;
    let maxOutgoing=0,transportSubsteps=0,transportStep=0;
    let thermal={sourceC:900,smothered:false},snapshot=null,report=null,heatCredit=0;
    const resources=[],programs=[],errors=[];
    function program(body){
      const p=gl.createProgram();
      for(const [type,code] of [[gl.VERTEX_SHADER,VERT],[gl.FRAGMENT_SHADER,COMMON+body]]){
        const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(p,shader);gl.deleteShader(shader);
      }
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      const uniforms={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i);uniforms[u.name]=gl.getUniformLocation(p,u.name);}
      programs.push(p);return {p,uniforms};
    }
    function target(w=width,h=height){
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);
      const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Oxygen needs floating-point render targets.');
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      const t={texture,fbo,width:w,height:h};resources.push(t);return t;
    }
    function pair(){return {read:target(),write:target(),swap(){const t=this.read;this.read=this.write;this.write=t;}};}
    function pass(p,t,inputs={},values={}){
      gl.disable(gl.BLEND);gl.useProgram(p.p);
      let unit=0;for(const [name,value] of Object.entries(inputs)){if(p.uniforms[name]==null)continue;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value.texture || value);gl.uniform1i(p.uniforms[name],unit++);}
      const defaults={size:[width,height],world:[W,H],velocitySize:[bridge.velocity.width,bridge.velocity.height],
        source:[src.x/W,1-(src.y+src.height)/H,src.width/W,src.height/H],dt:0,diffusion:diffusivity,
        demand:maxPower/HEAT_PER_KG/oxygenPerCell/(sourceCells || 1),fuelLimit:fuelMass*stoich/oxygenPerCell/(sourceCells || 1),
        hot:enabled && !extinguished && !thermal.smothered && thermal.sourceC>=350?1:0,wetActive:bridge.wetActive?1:0,
        flameSupport:candle && report?(()=>{const t=Math.max(0,Math.min(1,(report.incomingOxygenFraction-.15)/.03));return t*t*(3-2*t);})():1};
      for(const [name,value] of Object.entries({...defaults,...values})){
        const loc=p.uniforms[name];if(loc==null)continue;
        if(Array.isArray(value))gl['uniform'+value.length+'fv'](loc,value);else gl.uniform1f(loc,value);
      }
      bridge.draw(t);
    }
    const context=fluid.setGasTransport(null);
    if(!context)throw Error('Spatial oxygen requires WebGL 2.');
    bridge=context;gl=context.gl;gl.getExtension('EXT_color_buffer_float');
    let sourceCells=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const wx=(x+.5)*W/width,wy=(height-y-.5)*H/height;
      if(wx>=src.x && wx<src.x+src.width && wy>=src.y && wy<src.y+src.height)sourceCells++;
    }
    if(!sourceCells)throw Error('The oxygen grid misses the fuel surface.');
    const gas=pair(),pressure=pair(),ledgers=pair(),candidate=target(),faces=target(),divergence=target(),before=target();
    const init=program(`void main(){result=solid(uv)?vec4(0.):vec4(.209,1.,0.,0.);}`);
    const copy=program(`void main(){result=texture(gas,uv);}`);
    const buildFaces=program(`void main(){
      vec2 c=cell(),v=texture(flow,uv).xy*size/velocitySize;
      vec2 r=texture(flow,uv+vec2(c.x,0)).xy*size/velocitySize,t=texture(flow,uv+vec2(0,c.y)).xy*size/velocitySize;
      result=vec4(.5*(v.x+r.x)*openFace(uv,uv+vec2(c.x,0)),.5*(v.y+t.y)*openFace(uv,uv+vec2(0,c.y)),0.,0.);
    }`);
    const divergencePass=program(`void main(){vec2 c=cell(),f=face(uv);result=vec4(f.x-face(uv-vec2(c.x,0)).x+f.y-face(uv-vec2(0,c.y)).y,0.,0.,0.);}`);
    const poisson=program(`void main(){
      if(solid(uv)||room(uv)){result=vec4(0.);return;}
      vec2 c=cell();vec2 offsets[4]=vec2[4](vec2(c.x,0),vec2(-c.x,0),vec2(0,c.y),vec2(0,-c.y));
      float sum=0.,n=0.;for(int k=0;k<4;k++){vec2 q=uv+offsets[k];float a=openFace(uv,q);sum+=a*texture(pressure,q).r;n+=a;}
      result=vec4(n>0.?(sum-texture(flow,uv).r)/n:0.,0.,0.,0.);
    }`);
    const correctFaces=program(`void main(){vec2 c=cell();float p=texture(pressure,uv).r;
      result=vec4((face(uv).x-(texture(pressure,uv+vec2(c.x,0)).r-p))*openFace(uv,uv+vec2(c.x,0)),
        (face(uv).y-(texture(pressure,uv+vec2(0,c.y)).r-p))*openFace(uv,uv+vec2(0,c.y)),0.,0.);
    }`);
    const correctVelocity=program(`void main(){vec2 c=cell();vec2 f=face(uv);
      result=vec4(vec2(.5*(f.x+face(uv-vec2(c.x,0)).x),.5*(f.y+face(uv-vec2(0,c.y)).y))*velocitySize/size,0.,1.);
    }`);
    const peakFlow=program(`
      float outgoing(vec2 p){vec2 c=cell(),v=face(p);return max(v.x,0.)+max(v.y,0.)+max(-face(p-vec2(c.x,0)).x,0.)+max(-face(p-vec2(0,c.y)).y,0.);}
      void main(){ivec2 base=ivec2(gl_FragCoord.xy)*2;float peak=0.;
        for(int y=0;y<2;y++)for(int x=0;x<2;x++){ivec2 p=base+ivec2(x,y);if(all(lessThan(p,ivec2(size))))peak=max(peak,outgoing((vec2(p)+.5)/size));}
        result=vec4(peak,0.,0.,0.);
      }`);
    const peakReduce=program(`void main(){ivec2 base=ivec2(gl_FragCoord.xy)*2,extent=textureSize(flow,0);float peak=0.;
      for(int y=0;y<2;y++)for(int x=0;x<2;x++){ivec2 p=base+ivec2(x,y);if(all(lessThan(p,extent)))peak=max(peak,texelFetch(flow,p,0).r);}
      result=vec4(peak,0.,0.,0.);
    }`);
    const peakLevels=[];
    for(let w=width,h=height;w>1||h>1;){w=Math.ceil(w/2);h=Math.ceil(h/2);peakLevels.push(target(w,h));}
    const peakReading=new Float32Array(4);
    const transport=program(`
      float outgoing(vec2 p){vec2 c=cell(),v=face(p);return max(v.x,0.)+max(v.y,0.)+max(-face(p-vec2(c.x,0)).x,0.)+max(-face(p-vec2(0,c.y)).y,0.);}
      float rate(vec2 a,vec2 b,float v){vec2 donor=v>=0.?a:b;return v*min(1.,.8/max(.8,dt*outgoing(donor)));}
      vec3 flux(vec2 a,vec2 b,float v){return dt*rate(a,b,v)*(v>=0.?state(a).rgb:state(b).rgb);}
      void main(){
        vec4 s=state(uv);if(solid(uv)){result=vec4(0.,0.,0.,s.a);return;}
        vec2 c=cell(),r=uv+vec2(c.x,0),l=uv-vec2(c.x,0),t=uv+vec2(0,c.y),b=uv-vec2(0,c.y);
        vec3 q=s.rgb-flux(uv,r,face(uv).x)+flux(l,uv,face(l).x)-flux(uv,t,face(uv).y)+flux(b,uv,face(b).y);
        // Conservative molecular mixing, with exactly opposite pair fluxes.
        vec3 mix=vec3(0.);vec2 offsets[4]=vec2[4](r,l,t,b);
        for(int k=0;k<4;k++){vec2 p=offsets[k];mix+=openFace(uv,p)*(state(p).rgb-s.rgb);}
        q+=min(.04,dt*diffusion*size.y*size.y/(world.y*world.y))*mix;
        result=vec4(q,s.a);
      }`);
    const reaction=program(`void main(){vec4 s=state(uv);vec2 upper=source.xy+source.zw;
      bool fuelPatch=all(greaterThanEqual(uv,source.xy))&&all(lessThan(uv,upper));
      float contact=wetActive>.5?texture(wet,uv).b:0.;
      float used=fuelPatch&&contact<.5?min(max(0.,s.r),min(max(0.,fuelLimit-s.a),dt*demand*hot*flameSupport*clamp(s.r/max(s.g,.00001)/.209,0.,1.))):0.;
      result=vec4(s.r-used,s.g,s.b+used,s.a+used);
    }`);
    const ledgerPass=program(`void main(){vec4 old=texture(oldGas,uv),now=state(uv),l=texture(ledger,uv);
      if(solid(uv)){l.z+=max(old.r,0.);}
      // Account for exchange at the external room reservoir only. Gates have no source term.
      else if(room(uv)){float change=.209-now.r;l.x+=max(change,0.);l.y+=max(-change,0.);}
      result=l;
    }`);
    const reservoir=program(`void main(){vec4 s=state(uv);result=room(uv)?vec4(.209,1.,0.,s.a):s;}`);
    const emission=program(`void main(){vec4 d=texture(flow,uv),a=texture(oldGas,uv),b=state(uv);
      float used=max(0.,b.a-a.a);
      // Same reacted oxygen drives thermal buoyancy and visible exhaust.
      float heat=used*${(OXYGEN_DENSITY*HEAT_PER_KG*.30/(1.204*1005*100)).toPrecision(12)};
      result=vec4(d.rgb+vec3(.45,.41,.35)*used*8.,min(18.,d.a+heat));
    }`);
    pass(init,gas.read,{mask:bridge.obstacle});pass(copy,gas.write,{gas:gas.read});
    let initialized=false;
    function advance(h,ctx){
      if(retired || !(h>0))return;bridge=ctx;
      try {
        if(!initialized){pass(init,gas.read,{mask:bridge.obstacle});pass(copy,gas.write,{gas:gas.read});initialized=true;capture();}
        pass(buildFaces,candidate,{flow:bridge.velocity.read,mask:bridge.obstacle});
        pass(divergencePass,divergence,{faces:candidate});
        for(let i=0;i<48;i++){pass(poisson,pressure.write,{pressure:pressure.read,flow:divergence,mask:bridge.obstacle});pressure.swap();}
        pass(correctFaces,faces,{faces:candidate,pressure:pressure.read,mask:bridge.obstacle});
        pass(correctVelocity,bridge.velocity.write,{faces,mask:bridge.obstacle});bridge.velocity.swap();
        // Reduce the current face rates to one pixel. The CFL bound follows
        // this frame's actual airflow, so the emergency donor limiter does
        // not silently slow species relative to the velocity field.
        for(let i=0;i<peakLevels.length;i++)pass(i?peakReduce:peakFlow,peakLevels[i],i?{flow:peakLevels[i-1]}:{faces});
        gl.bindFramebuffer(gl.FRAMEBUFFER,peakLevels[peakLevels.length-1].fbo);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,peakReading);
        maxOutgoing=peakReading[0];
        if(!Number.isFinite(maxOutgoing))throw Error('Oxygen airflow is non-finite.');
        const substeps=Math.max(1,Math.ceil(h*Math.max(120,maxOutgoing/.75))),step=h/substeps;
        transportSubsteps=substeps;transportStep=step;
        for(let i=0;i<substeps;i++){
          pass(copy,before,{gas:gas.read});
          pass(transport,gas.write,{gas:gas.read,faces,mask:bridge.obstacle},{dt:step});gas.swap();
          pass(ledgerPass,ledgers.write,{gas:gas.read,oldGas:before,mask:bridge.obstacle,ledger:ledgers.read});ledgers.swap();
          pass(reservoir,gas.write,{gas:gas.read,mask:bridge.obstacle});gas.swap();
          pass(copy,before,{gas:gas.read});
          pass(reaction,gas.write,{gas:gas.read,wet:bridge.wet || bridge.obstacle,mask:bridge.obstacle},{dt:step});gas.swap();
          pass(emission,bridge.dye.write,{flow:bridge.dye.read,gas:gas.read,oldGas:before});bridge.dye.swap();
        }
        seconds+=h;if(seconds-captureClock>=.12)capture();
      }catch(e){errors.push(e.message);enabled=false;throw e;}
    }
    const read=new Float32Array(width*height*4),motion=new Float32Array(read.length),account=new Float32Array(read.length);
    let initialOxygen=null,previousConsumed=0,previousCapture=0;
    function capture(){
      if(retired)return snapshot;
      gl.bindFramebuffer(gl.FRAMEBUFFER,gas.read.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,read);
      gl.bindFramebuffer(gl.FRAMEBUFFER,faces.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,motion);
      gl.bindFramebuffer(gl.FRAMEBUFFER,ledgers.read.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,account);
      let inventory=0,consumed=0,supplied=0,escaped=0,removed=0,local=0,localN=0,incoming=0,inWeight=0,ring=0,ringN=0;
      const oxygen=new Float32Array(width*height),oxygenMassKg=new Float32Array(oxygen.length),carrierVolumeM3=new Float32Array(oxygen.length),vx=new Float32Array(oxygen.length),vy=new Float32Array(oxygen.length),solid=new Uint8Array(oxygen.length);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const at=(y*width+x)*4,out=(height-y-1)*width+x,s=read[at],total=read[at+1];
        inventory+=s;consumed+=read[at+3];supplied+=account[at];escaped+=account[at+1];removed+=account[at+2];
        const fraction=total>1e-8?s/total:0;oxygen[out]=fraction;oxygenMassKg[out]=s*oxygenPerCell;carrierVolumeM3[out]=total*cellVolume;solid[out]=total<1e-8?1:0;
        vx[out]=motion[at]*W/width;vy[out]=-motion[at+1]*H/height;
        const wx=(x+.5)*W/width,wy=(height-y-.5)*H/height;
        if(total>0 && Math.abs(wx-(src.x+src.width*.5))<40 && Math.abs(wy-(src.y+src.height*.5))<40){local+=fraction;localN++;}
        const dx=wx-(src.x+src.width*.5),dy=wy-(src.y+src.height*.5),distance=Math.hypot(dx,dy);
        if(total>0 && distance>=24 && distance<40){
          const inward=Math.max(0,-(vx[out]*dx+vy[out]*dy)/distance);
          incoming+=fraction*inward;inWeight+=inward;ring+=fraction;ringN++;
        }
        if(!errors.length && (![s,total,read[at+2],read[at+3]].every(Number.isFinite)||fraction<-.0001||fraction>.2105))errors.push('Oxygen field is non-finite or out of bounds.');
      }
      inventory*=oxygenPerCell;consumed*=oxygenPerCell;supplied*=oxygenPerCell;escaped*=oxygenPerCell;removed*=oxygenPerCell;
      if(initialOxygen===null)initialOxygen=inventory;
      const interval=seconds-previousCapture,power=interval>0?(consumed-previousConsumed)*HEAT_PER_KG/interval:(report?report.heatReleaseW:0);
      heatCredit+=(consumed-previousConsumed)*HEAT_PER_KG*.7; // credit is drained exactly once by the fuel sensor.
      previousConsumed=consumed;previousCapture=seconds;captureClock=seconds;
      if(candle && seconds>1 && power<.5 && thermal.sourceC<350)extinguished=true;
      snapshot={width,height,worldWidth:W,worldHeight:H,oxygen,oxygenMassKg,carrierVolumeM3,vx,vy,solid,seconds,revision:++revision};
      report={seconds,localOxygenFraction:localN?local/localN:0,incomingOxygenFraction:inWeight>.01?incoming/inWeight:(ringN?ring/ringN:0),oxygenInventoryKg:inventory,initialOxygenKg:initialOxygen,
        oxygenConsumedKg:consumed,oxygenSuppliedKg:supplied,oxygenEscapedKg:escaped,geometryRemovedKg:removed,
        oxygenResidualKg:initialOxygen+supplied-escaped-removed-consumed-inventory,heatReleaseW:power,
        chemicalHeatJ:consumed*HEAT_PER_KG,fuelRemainingKg:Math.max(0,fuelMass-consumed/stoich),maxPowerW:maxPower,
        cellVolumeM3:cellVolume,oxygenDensityKgM3:OXYGEN_DENSITY,extinguished,error:errors[0] || null};
      report.maxOutgoingCellsPerSecond=maxOutgoing;report.transportSubsteps=transportSubsteps;
      report.transportStepSeconds=transportStep;report.maxDonorFraction=maxOutgoing*transportStep;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);return snapshot;
    }
    fluid.setGasTransport(advance);
    return {prepare(value){thermal=value;},setBurnerEnabled(value){enabled=!!value;},
      capture,snapshot(){return snapshot;},stats(){return report || {seconds,error:null};},
      takeHeat(){const value=heatCredit;heatCredit=0;return value;},
      destroy(){retired=true;fluid.setGasTransport(null,advance);for(const t of resources){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}for(const p of programs)gl.deleteProgram(p);},
      constants:{ambient:AMBIENT,heatPerKg:HEAT_PER_KG,fuelMassKg:fuelMass,stoichiometricOxygen:stoich}};
  }
  root.WSSOxygen={create,ambient:AMBIENT,heatPerKg:HEAT_PER_KG};
})(typeof window!=='undefined'?window:globalThis);
