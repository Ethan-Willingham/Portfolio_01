/* Spatial reacting air for the standalone sandbox.
 * Finite-volume oxygen, carrier gas and exhaust share projected smoke airflow.
 * Oxygen is in reference-volume units (20.9% is a mole/volume fraction).
 * Heat follows measured oxygen consumption, 13.1 MJ/kg, not an inlet switch. */
(function(root){
  'use strict';
  const AMBIENT=.209, OXYGEN_DENSITY=1.331, HEAT_PER_KG=13.1e6, AIR_DENSITY=1.204, CP=1005, ROOM_K=293.15;
  const FIELD_AMBIENT=Math.fround(AMBIENT);
  const VERT=`#version 300 es
  layout(location=0) in vec2 aPosition; out vec2 uv;
  void main(){uv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const COMMON=`#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 uv; out vec4 result;
  uniform sampler2D gas,flow,mask,oldGas,pressure,faces,ledger,wet,energy,oldEnergy,liquid,body,dye;
  uniform vec2 size,world,velocitySize,spacing,liquidScale;
  uniform vec4 source;
  uniform float dt,diffusion,demand,fuelLimit,hot,wetActive,flameSupport,physical,liquidActive,bodyActive;
  uniform vec4 heatPatch;
  uniform float extraHeat,timeScale;
  vec2 cell(){return 1./size;}
  bool inside(vec2 p){return all(greaterThanEqual(p,vec2(0.)))&&all(lessThan(p,vec2(1.)));}
  bool solid(vec2 p){return inside(p)&&texture(mask,p).a>.5;}
  bool room(vec2 p){return physical<.5 && !solid(p) && (p.x<.035 || p.x>.965 || p.y<.045 || p.y>.955);}
  float openFace(vec2 a,vec2 b){return (physical>.5||inside(b))&&(!solid(a)&&!solid(b))?1.:0.;}
  // Spent oxygen and carrier form a conservative composition basis. Pure
  // ambient gas has exactly zero spent tracer, so rounding cannot enrich it.
  float oxygenOf(vec4 s){return physical>.5?.209*s.g-s.b:s.r;}
  vec4 state(vec2 p){vec4 s=physical>.5&&!inside(p)?vec4(.209,1.,0.,0.):texture(gas,p);s.r=oxygenOf(s);return s;}
  vec2 physicalFace(vec2 p){
    if(p.x<0.&&p.y>=0.&&p.y<1.)return vec2(texture(faces,vec2(.5/size.x,p.y)).z,0.);
    if(p.y<0.&&p.x>=0.&&p.x<1.)return vec2(0.,texture(faces,vec2(p.x,.5/size.y)).w);
    return inside(p)?texture(faces,p).xy:vec2(0.);
  }
  vec2 face(vec2 p){return physical>.5?physicalFace(p)/spacing:(inside(p)?texture(faces,p).xy:vec2(0.));}
  float enthalpy(vec2 p){return inside(p)&&!solid(p)?texture(energy,p).r:0.;}
  float temperature(vec2 p){float carrier=state(p).g;return carrier>0.?enthalpy(p)/carrier:0.;}
  `;
  // Generated from tools/air-pressure-kernel.c by the build helper.
  const AIR_PRESSURE_WASM='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';
  let airPressureModule=null;
function makeAirPressureSolver(width,height,packed){
  let kernel=null,heap=0;
  try{
    if(AIR_PRESSURE_WASM&&typeof WebAssembly!=='undefined'){
      if(!airPressureModule)airPressureModule=new WebAssembly.Module(Uint8Array.from(atob(AIR_PRESSURE_WASM),c=>c.charCodeAt(0)));
      const instance=new WebAssembly.Instance(airPressureModule);heap=Number(instance.exports.__heap_base.value);
      if(width*height*176+65536<instance.exports.memory.buffer.byteLength)kernel=instance.exports;
    }
  }catch(e){kernel=null;}
  function vector(n){
    if(!kernel)return new Float64Array(n);
    const start=heap;heap+=n*8;
    if(heap>kernel.memory.buffer.byteLength)throw Error('Air pressure scratch memory is exhausted.');
    return new Float64Array(kernel.memory.buffer,start,n);
  }
  function level(w,h,values){
    const n=w*h,r=vector(n),t=vector(n),l=vector(n),b=vector(n),d=vector(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;r[i]=values[i*4];t[i]=values[i*4+1];l[i]=x?values[(i-1)*4]:values[i*4+2];b[i]=y?values[(i-w)*4+1]:values[i*4+3];d[i]=r[i]+t[i]+l[i]+b[i];
    }
    return {w,h,n,r,t,l,b,d,x:vector(n),rhs:vector(n),residual:vector(n)};
  }
  const levels=[level(width,height,packed)];let w=width,h=height,values=packed;
  while(h>4&&levels.length<6){
    const nw=Math.ceil(w/2),nh=Math.ceil(h/2),next=new Float64Array(nw*nh*4);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
      const bx=x*2,by=y*2,right=Math.min(bx+1,w-1),top=Math.min(by+1,h-1),i=(y*nw+x)*4;
      for(let k=0;k<2;k++){
        if(by+k<h){next[i]+=values[((by+k)*w+right)*4]*.25;if(x===0)next[i+2]+=values[((by+k)*w)*4+2]*.25;}
        if(bx+k<w){next[i+1]+=values[(top*w+bx+k)*4+1]*.25;if(y===0)next[i+3]+=values[(bx+k)*4+3]*.25;}
      }
    }
    w=nw;h=nh;values=next;levels.push(level(w,h,values));
  }
  const coarse=levels[levels.length-1],n=coarse.n,rows=Array.from({length:n},()=>new Float64Array(n*2)),gauge=new Uint8Array(n),visited=new Uint8Array(n);
  for(let y=0;y<coarse.h;y++)for(let x=0;x<coarse.w;x++){
    const i=y*coarse.w+x;rows[i][i]=coarse.d[i];
    if(x+1<coarse.w)rows[i][i+1]-=coarse.r[i];if(y+1<coarse.h)rows[i][i+coarse.w]-=coarse.t[i];
    if(x)rows[i][i-1]-=coarse.l[i];if(y)rows[i][i-coarse.w]-=coarse.b[i];
    if(coarse.d[i]===0)gauge[i]=1;
  }
  const closed=[];
  for(let start=0;start<n;start++)if(!visited[start]&&!gauge[start]){
    const group=[start];visited[start]=1;let grounded=false;
    for(let k=0;k<group.length;k++){
      const i=group[k],x=i%coarse.w,y=Math.floor(i/coarse.w);
      grounded=grounded||(x===0&&coarse.l[i]>0)||(x===coarse.w-1&&coarse.r[i]>0)||(y===0&&coarse.b[i]>0)||(y===coarse.h-1&&coarse.t[i]>0);
      for(let j=0;j<n;j++)if(j!==i&&rows[i][j]<0&&!visited[j]){visited[j]=1;group.push(j);}
    }
    if(!grounded){gauge[start]=1;closed.push(group);}
  }
  for(let i=0;i<n;i++){
    if(gauge[i]){for(let j=0;j<n;j++){rows[i][j]=0;rows[j][i]=0;}rows[i][i]=1;}
    rows[i][n+i]=1;
  }
  const original=rows.map(row=>row.slice(0,n));
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    if(Math.abs(rows[pivot][k])<1.e-14)throw Error('Air pressure coarse graph is singular.');
    const swap=rows[k];rows[k]=rows[pivot];rows[pivot]=swap;
    const scale=rows[k][k];for(let j=0;j<n*2;j++)rows[k][j]/=scale;
    for(let i=0;i<n;i++)if(i!==k){const f=rows[i][k];if(f!==0)for(let j=0;j<n*2;j++)rows[i][j]-=f*rows[k][j];}
  }
  const inverse=new Float64Array(n*n);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    let product=0;for(let k=0;k<n;k++)product+=original[i][k]*rows[k][n+j];
    if(Math.abs(product-(i===j?1:0))>1.e-7)throw Error('Air pressure coarse inverse failed verification.');
    if(!gauge[i]&&!gauge[j])inverse[i*n+j]=rows[i][n+j];
  }
  function apply(level,x,out){
    const {w,h,r,t,l,b,d}=level;
    if(kernel){kernel.apply(w,h,r.byteOffset,t.byteOffset,l.byteOffset,b.byteOffset,d.byteOffset,x.byteOffset,out.byteOffset);return;}
    for(let y=0;y<h;y++)for(let k=0;k<w;k++){
      const i=y*w+k;out[i]=d[i]*x[i]-(k+1<w?r[i]*x[i+1]:0)-(y+1<h?t[i]*x[i+w]:0)-(k?l[i]*x[i-1]:0)-(y?b[i]*x[i-w]:0);
    }
  }
  function smooth(level,reverse){
    const {w,h,r,t,l,b,d,x,rhs}=level;
    if(kernel){kernel.smooth(w,h,r.byteOffset,t.byteOffset,l.byteOffset,b.byteOffset,d.byteOffset,x.byteOffset,rhs.byteOffset,reverse?1:0);return;}
    for(let phase=0;phase<2;phase++)for(let y=0;y<h;y++)for(let k=((reverse?1-phase:phase)+y)%2;k<w;k+=2){
      const i=y*w+k;
      x[i]=d[i]>0?(rhs[i]+(k+1<w?r[i]*x[i+1]:0)+(y+1<h?t[i]*x[i+w]:0)+(k?l[i]*x[i-1]:0)+(y?b[i]*x[i-w]:0))/d[i]:0;
    }
  }
  function cycle(index){
    const current=levels[index];
    if(index===levels.length-1){
      for(const group of closed){let sum=0,scale=0;for(const i of group){sum+=current.rhs[i];scale+=Math.abs(current.rhs[i]);}
        if(Math.abs(sum)>Math.max(1.e-6,scale*1.e-7))throw Error('Closed air pressure RHS is incompatible.');
      }
      for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)sum+=inverse[i*n+j]*current.rhs[j];current.x[i]=sum;}return;
    }
    smooth(current,false);apply(current,current.x,current.residual);
    const next=levels[index+1];next.x.fill(0);
    if(kernel)kernel.restrictResidual(current.w,current.h,next.w,next.h,current.rhs.byteOffset,current.residual.byteOffset,next.rhs.byteOffset);
    else{
      for(let i=0;i<current.n;i++)current.residual[i]=current.rhs[i]-current.residual[i];
      for(let y=0;y<next.h;y++)for(let x=0;x<next.w;x++){
        const bx=x*2,by=y*2;let sum=0;
        for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)if(bx+xx<current.w&&by+yy<current.h)sum+=current.residual[(by+yy)*current.w+bx+xx];
        next.rhs[y*next.w+x]=sum*.25;
      }
    }
    cycle(index+1);
    if(kernel)kernel.prolong(current.w,current.h,next.w,current.x.byteOffset,next.x.byteOffset,current.d.byteOffset);
    else for(let y=0;y<current.h;y++)for(let x=0;x<current.w;x++){
      const i=y*current.w+x;if(current.d[i]>0)current.x[i]+=next.x[Math.floor(y/2)*next.w+Math.floor(x/2)];
    }
    smooth(current,true);
  }
  const fineClosed=[],fineLevel=levels[0],fineVisited=new Uint8Array(fineLevel.n);
  for(let start=0;start<fineLevel.n;start++)if(!fineVisited[start]&&fineLevel.d[start]>0){
    const group=[start];fineVisited[start]=1;let grounded=false;
    for(let k=0;k<group.length;k++){
      const i=group[k],x=i%width,y=Math.floor(i/width),weights=[fineLevel.r[i],fineLevel.t[i],fineLevel.l[i],fineLevel.b[i]],neighbors=[x+1<width?i+1:-1,y+1<height?i+width:-1,x?i-1:-1,y?i-width:-1];
      for(let j=0;j<4;j++)if(weights[j]>0){const next=neighbors[j];if(next<0)grounded=true;else if(!fineVisited[next]){fineVisited[next]=1;group.push(next);}}
    }
    if(!grounded)fineClosed.push(group);
  }
  let maxClosedMean=0;
  function projectClosed(values,check){
    for(const group of fineClosed){let sum=0,scale=0;for(const i of group){sum+=values[i];scale+=Math.abs(values[i]);}
      const mean=sum/group.length;
      if(check){maxClosedMean=Math.max(maxClosedMean,Math.abs(mean));if(Math.abs(mean)>Math.max(1.e-5,scale/group.length*2.e-5))throw Error('Closed air pressure RHS is incompatible.');}
      for(const i of group)values[i]-=mean;
    }
  }
  const fine=levels[0],count=fine.n,x=vector(count),r=vector(count),z=vector(count),p=vector(count),ap=vector(count),balancedRhs=vector(count);
  function precondition(){fine.rhs.set(r);fine.x.fill(0);cycle(0);z.set(fine.x);projectClosed(z,false);}
  function norm(){if(kernel)return kernel.norm(count,r.byteOffset);let max=0;for(let i=0;i<count;i++)max=Math.max(max,Math.abs(r[i]));return max;}
  function dot(a,b){if(kernel)return kernel.dot(count,a.byteOffset,b.byteOffset);let value=0;for(let i=0;i<count;i++)value+=a[i]*b[i];return value;}
  function residual(rhs){if(kernel)kernel.residual(count,rhs.byteOffset,ap.byteOffset,r.byteOffset);else for(let i=0;i<count;i++)r[i]=rhs[i]-ap[i];}
  function solve(rhs,tolerance=.02,scale=1){
    maxClosedMean=0;balancedRhs.set(rhs);projectClosed(balancedRhs,true);rhs=balancedRhs;
    if(kernel)kernel.scale(count,x.byteOffset,scale);else for(let i=0;i<count;i++)x[i]*=scale;projectClosed(x,false);
    apply(fine,x,ap);residual(rhs);
    let residualValue=norm(),iterations=0;
    if(residualValue>tolerance){
      precondition();p.set(z);let rz=dot(r,z);
      for(let k=0;k<100;k++){
        apply(fine,p,ap);const denominator=dot(p,ap);
        if(!(denominator>0)||!Number.isFinite(rz))throw Error('Air pressure Krylov solve broke down.');
        const alpha=rz/denominator;
        if(kernel)kernel.updateXR(count,x.byteOffset,r.byteOffset,p.byteOffset,ap.byteOffset,alpha);else for(let i=0;i<count;i++){x[i]+=alpha*p[i];r[i]-=alpha*ap[i];}
        iterations=k+1;
        if(iterations%8===0){apply(fine,x,ap);residual(rhs);}
        residualValue=norm();if(residualValue<=tolerance)break;
        precondition();const next=dot(r,z);
        const beta=next/rz;if(kernel)kernel.updateP(count,p.byteOffset,z.byteOffset,beta);else for(let i=0;i<count;i++)p[i]=z[i]+beta*p[i];rz=next;
      }
    }
    apply(fine,x,ap);residual(rhs);residualValue=norm();
    return {x,iterations,residual:residualValue,maxClosedMean,converged:residualValue<=tolerance};
  }
  return {solve,levels,backend:kernel?'WebAssembly':'JavaScript'};
}

  function create(options){
    const fluid=options.fluid,W=options.width,H=options.height,src=options.source;
    const candle=!!options.candle,maxPower=options.maxPowerW || (candle?60:250);
    const fuelMass=options.fuelMassKg || (candle?.01:.02),stoich=candle?3.455:2.667;
    const height=options.resolution || 128,width=Math.ceil(height*W/H);
    const metresPerPixel=.762/(options.scaleWidth || 720),depth=.0254;
    const prescribed=!!options.prescribedFlow,spacing=[W/width*metresPerPixel,H/height*metresPerPixel];
    // The native water clock uses 250 world px/s^2. Match the instrument
    // scale so water and air share one physical clock and Earth gravity.
    const timeScale=prescribed?1:Math.sqrt(250*metresPerPixel/9.80665);
    const cellVolume=W/width*H/height*metresPerPixel*metresPerPixel*depth;
    const oxygenPerCell=cellVolume*OXYGEN_DENSITY;
    const diffusivity=2.0e-5/(metresPerPixel*metresPerPixel); // O2 in air, world px squared/s.
    let bridge,gl,seconds=0,captureClock=-1,revision=0,retired=false,enabled=true,extinguished=false;
    let maxOutgoing=0,transportSubsteps=0,transportStep=0;
    let maxDivergence=0,projectionCycles=0,extraHeatJ=0,heatSources=[];
    let lastProjectionStep=0;
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
    function pair(w=width,h=height){return {read:target(w,h),write:target(w,h),swap(){const t=this.read;this.read=this.write;this.write=t;}};}
    function pass(p,t,inputs={},values={}){
      gl.disable(gl.BLEND);gl.useProgram(p.p);
      let unit=0;for(const [name,value] of Object.entries(inputs)){if(p.uniforms[name]==null)continue;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value.texture || value);gl.uniform1i(p.uniforms[name],unit++);}
      const defaults={size:[width,height],world:[W,H],velocitySize:[bridge.velocity.width,bridge.velocity.height],
        spacing:spacing,physical:prescribed?0:1,liquidActive:bridge.liquidActive&&(bridge.liquidSampleAge || 0)*timeScale<=.2?1:0,bodyActive:bridge.movingActive?1:0,
        timeScale:timeScale,liquidScale:[W*metresPerPixel*(bridge.liquidScale?bridge.liquidScale[0]:0)/timeScale,H*metresPerPixel*(bridge.liquidScale?bridge.liquidScale[1]:0)/timeScale],
        heatPatch:[0,0,0,0],extraHeat:0,
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
    const momentum=pair(),energy=pair(),heatLedger=pair(),energyBefore=target(),residual=target();
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
    const momentumPass=program(`
      float component(ivec2 p,int k){
        if(k==0&&p.x==-1&&p.y>=0&&p.y<int(size.y))return texelFetch(faces,ivec2(0,p.y),0).z;
        if(k==1&&p.y==-1&&p.x>=0&&p.x<int(size.x))return texelFetch(faces,ivec2(p.x,0),0).w;
        if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,ivec2(size))))return 0.;
        return texelFetch(faces,p,0)[k];
      }
      float interpolate(vec2 p,int k){
        vec2 g=p*size-(k==0?vec2(1.,.5):vec2(.5,1.));ivec2 b=ivec2(floor(g));vec2 f=fract(g);
        return mix(mix(component(b,k),component(b+ivec2(1,0),k),f.x),mix(component(b+ivec2(0,1),k),component(b+ivec2(1,1),k),f.x),f.y);
      }
      float neighbour(ivec2 p,int k,float center){
        if((k==0&&p.x<-1)||(k==1&&p.y<-1)||p.x>=int(size.x)||p.y>=int(size.y)||(k==0&&p.y<0)||(k==1&&p.x<0))return center;
        return component(p,k);
      }
      float advanceFace(vec2 a,vec2 b,ivec2 index,int k){
        if(openFace(a,b)<.5)return 0.;vec2 pos=(a+b)*.5;
        vec2 v=vec2(interpolate(pos,0),interpolate(pos,1));
        vec2 back=pos-dt*v/(spacing*size);
        float value=interpolate(back,k),center=component(index,k);
        value+=dt*1.5e-5*((neighbour(index+ivec2(1,0),k,center)+neighbour(index-ivec2(1,0),k,center)-2.*center)/(spacing.x*spacing.x)
          +(neighbour(index+ivec2(0,1),k,center)+neighbour(index-ivec2(0,1),k,center)-2.*center)/(spacing.y*spacing.y));
        if(k==1){float delta=.5*(temperature(a)+temperature(b));value+=dt*9.80665*delta/(293.15+max(0.,delta));}
        // Prescribed local boundary motion acts once, before projection.
        if(liquidActive>.5){vec4 w=texture(liquid,pos);vec2 target=(w.rg*255.-128.)/127.*liquidScale;
          value=mix(value,target[k],w.b*(1.-exp(-24.*dt)));}
        if(bodyActive>.5){vec4 m=texture(body,pos);if(m.a>.5)value=(m.xy*spacing*size/timeScale)[k];}
        return value;
      }
      void main(){vec2 c=cell();ivec2 index=ivec2(gl_FragCoord.xy);
        float right=advanceFace(uv,uv+vec2(c.x,0),index,0),top=advanceFace(uv,uv+vec2(0,c.y),index,1);
        float left=index.x==0?advanceFace(uv-vec2(c.x,0),uv,index-ivec2(1,0),0):0.;
        float bottom=index.y==0?advanceFace(uv-vec2(0,c.y),uv,index-ivec2(0,1),1):0.;
        result=vec4(right,top,left,bottom);
      }`);
    const physicalDivergence=program(`void main(){vec2 c=cell(),f=physicalFace(uv);
      float d=(f.x-physicalFace(uv-vec2(c.x,0)).x)/spacing.x+(f.y-physicalFace(uv-vec2(0,c.y)).y)/spacing.y;
      result=vec4(solid(uv)?0.:d,0.,0.,0.);
    }`);
    const fineCoefficients=program(`void main(){if(solid(uv)){result=vec4(0.);return;}vec2 c=cell();
      float right=openFace(uv,uv+vec2(c.x,0))/(spacing.x*spacing.x),top=openFace(uv,uv+vec2(0,c.y))/(spacing.y*spacing.y);
      if(!inside(uv+vec2(c.x,0)))right*=2.;if(!inside(uv+vec2(0,c.y)))top*=2.;
      result=vec4(right,top,uv.x<c.x?2./(spacing.x*spacing.x):0.,uv.y<c.y?2./(spacing.y*spacing.y):0.);
    }`);
    const pressureCoefficients=target(),coefficientRead=new Float32Array(width*height*4),pressureRhsRead=new Float32Array(coefficientRead.length),pressureUpload=new Float32Array(coefficientRead.length),pressureRhs=new Float64Array(width*height);
    let pressureSolver=null,pressureMaskRevision=-1,pressureSolveMilliseconds=0,pressureCPUResidual=0,maxClosedRhsMean=0;
    const physicalCorrect=program(`
      float p(vec2 a,vec2 b){return inside(a)?texture(pressure,a).r:-texture(pressure,b).r;}
      float corrected(vec2 a,vec2 b,float v,float dx){return openFace(a,b)>.5?v-(p(b,a)-p(a,b))/dx:0.;}
      void main(){vec2 c=cell();vec4 f=texture(faces,uv);
        result=vec4(corrected(uv,uv+vec2(c.x,0),f.x,spacing.x),corrected(uv,uv+vec2(0,c.y),f.y,spacing.y),
          uv.x<c.x?corrected(uv-vec2(c.x,0),uv,f.z,spacing.x):0.,uv.y<c.y?corrected(uv-vec2(0,c.y),uv,f.w,spacing.y):0.);
      }`);
    const physicalVelocity=program(`void main(){vec2 c=cell(),f=physicalFace(uv);
      vec2 v=.5*vec2(f.x+physicalFace(uv-vec2(c.x,0)).x,f.y+physicalFace(uv-vec2(0,c.y)).y);
      result=vec4(v*timeScale/(spacing*size/velocitySize),0.,1.);
    }`);
    const peakFlow=program(`
      float outgoing(vec2 p){vec2 c=cell(),v=face(p),l=face(p-vec2(c.x,0)),b=face(p-vec2(0,c.y));
        float outflow=max(v.x,0.)+max(v.y,0.)+max(-l.x,0.)+max(-b.y,0.);
        float inflow=max(-v.x,0.)+max(-v.y,0.)+max(l.x,0.)+max(b.y,0.);return max(outflow,inflow);}
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
    function reducePeak(input,first){
      for(let i=0;i<peakLevels.length;i++)pass(i?peakReduce:first,peakLevels[i],i?{flow:peakLevels[i-1]}:input);
      gl.bindFramebuffer(gl.FRAMEBUFFER,peakLevels[peakLevels.length-1].fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,peakReading);
      return peakReading[0];
    }
    const absolute=program(`void main(){result=vec4(abs(texture(flow,uv).r),0.,0.,0.);}`);
    function checkProjection(){
      pass(physicalCorrect,momentum.write,{faces:candidate,pressure:pressure.read,mask:bridge.obstacle});
      pass(physicalDivergence,residual,{faces:momentum.write,mask:bridge.obstacle});
      pass(absolute,before,{flow:residual});maxDivergence=reducePeak({flow:before},peakReduce);
      return maxDivergence<.08;
    }
    function projectPhysical(step){
      const started=performance.now();
      if(!pressureSolver||pressureMaskRevision!==(bridge.obstacleRevision || 0)){
        pass(fineCoefficients,pressureCoefficients,{mask:bridge.obstacle});
        gl.bindFramebuffer(gl.FRAMEBUFFER,pressureCoefficients.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,coefficientRead);
        pressureSolver=makeAirPressureSolver(width,height,coefficientRead);pressureMaskRevision=bridge.obstacleRevision || 0;lastProjectionStep=0;
      }
      pass(physicalDivergence,divergence,{faces:candidate,mask:bridge.obstacle});
      gl.bindFramebuffer(gl.FRAMEBUFFER,divergence.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,pressureRhsRead);
      for(let i=0;i<pressureRhs.length;i++)pressureRhs[i]=-pressureRhsRead[i*4];
      const solved=pressureSolver.solve(pressureRhs,.02,lastProjectionStep>0?step/lastProjectionStep:0);
      if(!solved.converged)throw Error('Air pressure did not converge.');
      lastProjectionStep=step;projectionCycles=solved.iterations;pressureCPUResidual=solved.residual;maxClosedRhsMean=solved.maxClosedMean;
      for(let i=0;i<pressureRhs.length;i++)pressureUpload[i*4]=solved.x[i];
      gl.bindTexture(gl.TEXTURE_2D,pressure.read.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,pressureUpload);
      if(!checkProjection())throw Error('Uploaded air pressure missed the face divergence target.');
      pressureSolveMilliseconds=performance.now()-started;momentum.swap();pass(copy,faces,{gas:momentum.read});
    }
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
        if(physical>.5)q.r=.209*q.g-q.b;
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
    const boundaryLedger=program(`
      float outgoing(vec2 p){vec2 c=cell(),v=face(p);return max(v.x,0.)+max(v.y,0.)+max(-face(p-vec2(c.x,0)).x,0.)+max(-face(p-vec2(0,c.y)).y,0.);}
      float limiter(vec2 p){return min(1.,.8/max(.8,dt*outgoing(p)));}
      void account(inout vec4 l,vec2 neighbour,float outward){
        if(inside(neighbour))return;
        if(outward>=0.)l.y+=dt*outward*limiter(uv)*oxygenOf(texture(oldGas,uv));
        else l.x-=dt*outward*limiter(neighbour)*.209;
      }
      void main(){vec4 l=texture(ledger,uv);vec2 c=cell(),v=face(uv);
        if(solid(uv)){l.z+=max(0.,oxygenOf(texture(oldGas,uv)));result=l;return;}
        account(l,uv+vec2(c.x,0),v.x);account(l,uv+vec2(0,c.y),v.y);
        account(l,uv-vec2(c.x,0),-face(uv-vec2(c.x,0)).x);account(l,uv-vec2(0,c.y),-face(uv-vec2(0,c.y)).y);
        // Molecular exchange through the real exterior faces, not a room strip.
        vec2 q[4]=vec2[4](uv+vec2(c.x,0),uv-vec2(c.x,0),uv+vec2(0,c.y),uv-vec2(0,c.y));
        float coefficient=min(.04,dt*diffusion*size.y*size.y/(world.y*world.y));
        for(int k=0;k<4;k++)if(!inside(q[k])){float change=coefficient*(.209-oxygenOf(texture(oldGas,uv)));l.x+=max(change,0.);l.y+=max(-change,0.);}
        result=l;
      }`);
    const reservoir=program(`void main(){vec4 s=state(uv);result=room(uv)?vec4(.209,1.,0.,s.a):s;}`);
    const emission=program(`void main(){vec4 d=texture(flow,uv),a=texture(oldGas,uv),b=state(uv);
      float used=max(0.,b.a-a.a);
      // Same reacted oxygen drives thermal buoyancy and visible exhaust.
      float heat=used*${(OXYGEN_DENSITY*HEAT_PER_KG*.30/(1.204*1005*100)).toPrecision(12)};
      result=vec4(d.rgb+vec3(.45,.41,.35)*used*8.,min(18.,d.a+heat));
    }`);
    const energyTransport=program(`
      float outgoing(vec2 p){vec2 c=cell(),v=face(p);return max(v.x,0.)+max(v.y,0.)+max(-face(p-vec2(c.x,0)).x,0.)+max(-face(p-vec2(0,c.y)).y,0.);}
      float flux(vec2 a,vec2 b,float v){vec2 donor=v>=0.?a:b;return dt*v*min(1.,.8/max(.8,dt*outgoing(donor)))*enthalpy(donor);}
      float conduct(vec2 a,vec2 b,float dx){
        float ga=max(0.,state(a).g),capacity=ga;
        if(inside(b)&&!solid(b)){float gb=max(0.,state(b).g),low=min(ga,gb),high=max(ga,gb);capacity=low>0.?2.*low/(1.+low/high):0.;}
        return 2.2e-5*capacity*(temperature(b)-temperature(a))/(dx*dx);
      }
      void main(){if(solid(uv)){result=vec4(0.);return;}vec2 c=cell(),r=uv+vec2(c.x,0),l=uv-vec2(c.x,0),t=uv+vec2(0,c.y),b=uv-vec2(0,c.y);
        float value=enthalpy(uv)-flux(uv,r,face(uv).x)+flux(l,uv,face(l).x)-flux(uv,t,face(uv).y)+flux(b,uv,face(b).y);
        value+=dt*(conduct(uv,r,spacing.x)+conduct(uv,l,spacing.x)+conduct(uv,t,spacing.y)+conduct(uv,b,spacing.y));
        result=vec4(value,0.,0.,0.);
      }`);
    const energyReaction=program(`void main(){float reacted=max(0.,state(uv).a-texture(oldGas,uv).a);
      float value=texture(energy,uv).r+reacted*${(OXYGEN_DENSITY*HEAT_PER_KG*.3/(AIR_DENSITY*CP)).toPrecision(12)};
      if(all(greaterThanEqual(uv,heatPatch.xy))&&all(lessThan(uv,heatPatch.xy+heatPatch.zw))&&!solid(uv))value+=extraHeat;
      result=vec4(value,0.,0.,0.);
    }`);
    const energyLedger=program(`void main(){vec4 l=texture(ledger,uv);l.r+=texture(oldEnergy,uv).r-texture(energy,uv).r;result=l;}`);
    const extraLedger=program(`void main(){vec4 l=texture(ledger,uv);l.g+=texture(energy,uv).r-texture(oldEnergy,uv).r;result=l;}`);
    const displayDye=program(`void main(){vec4 old=texture(dye,uv);vec2 v=physicalFace(uv)/(spacing*size);
      // Appearance follows physical temperature and spent oxygen. RGB keeps
      // paid steam and user smoke, but never supplies buoyancy or momentum.
      vec3 tracer=texture(dye,uv-v*dt).rgb/(1.+dt*.4);
      float exhaust=state(uv).b;vec3 chemical=vec3(.45,.41,.35)*exhaust*8.;
      result=solid(uv)?vec4(0.):vec4(max(tracer,chemical),max(0.,temperature(uv))/100.);
    }`);
    pass(init,gas.read,{mask:bridge.obstacle});pass(copy,gas.write,{gas:gas.read});
    let initialized=false;
    function advancePhysical(h){
      // Semi-Lagrangian momentum, molecular viscosity and one common
      // projection. Scalar substeps use exactly the resulting MAC faces.
      const steps=Math.max(1,Math.ceil(h*60)),step=h/steps;
      for(let k=0;k<steps;k++){
        pass(momentumPass,candidate,{faces:momentum.read,energy:energy.read,gas:gas.read,mask:bridge.obstacle,
          liquid:bridge.liquid || bridge.obstacle,body:bridge.moving || bridge.obstacle},{dt:step});
        projectPhysical(step);
        maxOutgoing=reducePeak({faces},peakFlow);
        if(!Number.isFinite(maxOutgoing)||!Number.isFinite(maxDivergence))throw Error('Physical airflow is non-finite.');
        // The harmonic face heat capacity bounds conductive loss by twice
        // the full-air diffusivity, even when a newly opened cell is empty.
        const diffusiveRate=4*2.2e-5*(1/(spacing[0]*spacing[0])+1/(spacing[1]*spacing[1]));
        const substeps=Math.max(1,Math.ceil(step*Math.max(120,(maxOutgoing+diffusiveRate)/.75))),scalarStep=step/substeps;
        transportSubsteps=substeps;transportStep=scalarStep;
        for(let i=0;i<substeps;i++){
          pass(copy,before,{gas:gas.read});pass(copy,energyBefore,{gas:energy.read});
          pass(energyTransport,energy.write,{energy:energy.read,gas:gas.read,faces,mask:bridge.obstacle},{dt:scalarStep});energy.swap();
          pass(energyLedger,heatLedger.write,{energy:energy.read,oldEnergy:energyBefore,ledger:heatLedger.read});heatLedger.swap();
          pass(transport,gas.write,{gas:gas.read,faces,mask:bridge.obstacle},{dt:scalarStep});gas.swap();
          pass(boundaryLedger,ledgers.write,{oldGas:before,faces,mask:bridge.obstacle,ledger:ledgers.read},{dt:scalarStep});ledgers.swap();
          pass(copy,before,{gas:gas.read});
          pass(reaction,gas.write,{gas:gas.read,wet:bridge.wet || bridge.obstacle,mask:bridge.obstacle},{dt:scalarStep});gas.swap();
          pass(energyReaction,energy.write,{energy:energy.read,gas:gas.read,oldGas:before,mask:bridge.obstacle});energy.swap();
        }
      }
      for(const value of heatSources){
        let cells=0;const r=value.rect;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const wx=(x+.5)*W/width,wy=(height-y-.5)*H/height;
          if(wx>=r.x&&wx<r.x+r.width&&wy>=r.y&&wy<r.y+r.height)cells++;
        }
        if(!cells)continue;pass(copy,energyBefore,{gas:energy.read});
        // A paid thermal event (steam), with no separate velocity impulse.
        pass(energyReaction,energy.write,{energy:energy.read,gas:gas.read,oldGas:gas.read,mask:bridge.obstacle},
          {heatPatch:[r.x/W,1-(r.y+r.height)/H,r.width/W,r.height/H],extraHeat:value.joules/(cells*cellVolume*AIR_DENSITY*CP)});energy.swap();
        pass(extraLedger,heatLedger.write,{energy:energy.read,oldEnergy:energyBefore,ledger:heatLedger.read});heatLedger.swap();
        extraHeatJ+=value.joules;
      }
      heatSources=[];
      pass(physicalVelocity,bridge.velocity.write,{faces,mask:bridge.obstacle});bridge.velocity.swap();
      pass(displayDye,bridge.dye.write,{energy:energy.read,gas:gas.read,faces,dye:bridge.dye.read,mask:bridge.obstacle},{dt:h});bridge.dye.swap();
    }
    function advance(h,ctx){
      if(retired || !(h>0))return;bridge=ctx;
      try {
        if(!initialized){pass(init,gas.read,{mask:bridge.obstacle});pass(copy,gas.write,{gas:gas.read});initialized=true;capture();}
        if(!prescribed){advancePhysical(h*timeScale);seconds+=h;if(seconds-captureClock>=.12)capture();return;}
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
    const heatRead=new Float32Array(read.length),heatAccount=new Float32Array(read.length),pressureRead=new Float32Array(read.length),divergenceRead=new Float32Array(read.length);
    const candidateRead=new Float32Array(read.length);
    let initialOxygen=null,previousConsumed=0,previousCapture=0;
    function capture(){
      if(retired)return snapshot;
      gl.bindFramebuffer(gl.FRAMEBUFFER,gas.read.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,read);
      gl.bindFramebuffer(gl.FRAMEBUFFER,faces.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,motion);
      gl.bindFramebuffer(gl.FRAMEBUFFER,ledgers.read.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,account);
      if(!prescribed){
        for(const [target,values] of [[energy.read,heatRead],[heatLedger.read,heatAccount],[pressure.read,pressureRead],[residual,divergenceRead],[candidate,candidateRead]]){
          gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,values);
        }
      }
      let inventory=0,consumed=0,supplied=0,escaped=0,removed=0,local=0,localN=0,incoming=0,inWeight=0,ring=0,ringN=0;
      let sensible=0,lostHeat=0,acceptedExtraHeat=0,kinetic=0,divergenceSquared=0,fluidCells=0,projectionInputEnergy=0,projectionOutputEnergy=0;
      const oxygen=new Float32Array(width*height),oxygenMassKg=new Float32Array(oxygen.length),carrierVolumeM3=new Float32Array(oxygen.length),vx=new Float32Array(oxygen.length),vy=new Float32Array(oxygen.length),solid=new Uint8Array(oxygen.length);
      const cellVx=new Float32Array(oxygen.length),cellVy=new Float32Array(oxygen.length),temperatureK=new Float32Array(oxygen.length),projectionPotential=new Float32Array(oxygen.length),projectedDivergence=new Float32Array(oxygen.length);
      const cellVxMetresPerSecond=new Float32Array(oxygen.length),cellVyMetresPerSecond=new Float32Array(oxygen.length);
      const leftBoundaryVx=new Float32Array(height),bottomBoundaryVy=new Float32Array(width);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const at=(y*width+x)*4,out=(height-y-1)*width+x,total=read[at+1],s=prescribed?read[at]:FIELD_AMBIENT*total-read[at+2];
        inventory+=s;consumed+=read[at+3];supplied+=account[at];escaped+=account[at+1];removed+=account[at+2];
        const fraction=total>1e-8?(prescribed?s/total:FIELD_AMBIENT-read[at+2]/total):0;oxygen[out]=fraction;oxygenMassKg[out]=s*oxygenPerCell;carrierVolumeM3[out]=total*cellVolume;solid[out]=total<1e-8?1:0;
        const sx=prescribed?W/width:timeScale/metresPerPixel,sy=prescribed?H/height:timeScale/metresPerPixel;
        vx[out]=motion[at]*sx;vy[out]=-motion[at+1]*sy;
        const left=x>0?motion[at-4]:motion[at+2],bottom=y>0?motion[at-width*4+1]:motion[at+3];
        cellVx[out]=.5*(motion[at]+left)*sx;cellVy[out]=-.5*(motion[at+1]+bottom)*sy;
        cellVxMetresPerSecond[out]=cellVx[out]*metresPerPixel/timeScale;cellVyMetresPerSecond[out]=cellVy[out]*metresPerPixel/timeScale;
        if(x===0)leftBoundaryVx[height-y-1]=left*sx;if(y===0)bottomBoundaryVy[x]=-bottom*sy;
        temperatureK[out]=ROOM_K+(total>1e-8?heatRead[at]/total:0);projectionPotential[out]=pressureRead[at];projectedDivergence[out]=divergenceRead[at];
        sensible+=heatRead[at];lostHeat+=heatAccount[at];acceptedExtraHeat+=heatAccount[at+1];
        if(total>0){kinetic+=cellVxMetresPerSecond[out]*cellVxMetresPerSecond[out]+cellVyMetresPerSecond[out]*cellVyMetresPerSecond[out];divergenceSquared+=divergenceRead[at]*divergenceRead[at];fluidCells++;}
        if(!prescribed){
          const wx=x===width-1?.5:1,wy=y===height-1?.5:1;
          projectionInputEnergy+=wx*candidateRead[at]*candidateRead[at]+wy*candidateRead[at+1]*candidateRead[at+1];
          projectionOutputEnergy+=wx*motion[at]*motion[at]+wy*motion[at+1]*motion[at+1];
          if(x===0){projectionInputEnergy+=.5*candidateRead[at+2]*candidateRead[at+2];projectionOutputEnergy+=.5*motion[at+2]*motion[at+2];}
          if(y===0){projectionInputEnergy+=.5*candidateRead[at+3]*candidateRead[at+3];projectionOutputEnergy+=.5*motion[at+3]*motion[at+3];}
        }
        const wx=(x+.5)*W/width,wy=(height-y-.5)*H/height;
        if(total>0 && Math.abs(wx-(src.x+src.width*.5))<40 && Math.abs(wy-(src.y+src.height*.5))<40){local+=fraction;localN++;}
        const dx=wx-(src.x+src.width*.5),dy=wy-(src.y+src.height*.5),distance=Math.hypot(dx,dy);
        if(total>0 && distance>=24 && distance<40){
          const inward=Math.max(0,-(cellVx[out]*dx+cellVy[out]*dy)/distance);
          incoming+=fraction*inward;inWeight+=inward;ring+=fraction;ringN++;
        }
        if(!errors.length && (![s,total,read[at+2],read[at+3]].every(Number.isFinite)||fraction<-.0001||fraction>.2105))errors.push('Oxygen field is non-finite or out of bounds.');
        if(!prescribed&&!errors.length&&(!Number.isFinite(heatRead[at])||heatRead[at]<-.001||!Number.isFinite(cellVx[out]+cellVy[out])))errors.push('Air momentum or enthalpy is out of bounds at '+x+','+(height-y-1)+' (energy '+heatRead[at]+', carrier '+total+').');
      }
      inventory*=oxygenPerCell;consumed*=oxygenPerCell;supplied*=oxygenPerCell;escaped*=oxygenPerCell;removed*=oxygenPerCell;
      if(initialOxygen===null)initialOxygen=inventory;
      const interval=(seconds-previousCapture)*timeScale,power=interval>0?(consumed-previousConsumed)*HEAT_PER_KG/interval:(report?report.heatReleaseW:0);
      heatCredit+=(consumed-previousConsumed)*HEAT_PER_KG*.7; // credit is drained exactly once by the fuel sensor.
      previousConsumed=consumed;previousCapture=seconds;captureClock=seconds;
      if(candle && seconds*timeScale>1 && power<.5 && thermal.sourceC<350)extinguished=true;
      snapshot={width,height,worldWidth:W,worldHeight:H,oxygen,oxygenMassKg,carrierVolumeM3,vx,vy,cellVx,cellVy,solid,temperatureK,
        projectionPotential,projectedDivergence,divergencePerSecond:projectedDivergence,leftBoundaryVx,bottomBoundaryVy,cellVxMetresPerSecond,cellVyMetresPerSecond,
        velocityUnits:'world-px/s',velocityLayout:'face-right/top',metresPerPixel,seconds,physicalSeconds:seconds*timeScale,timeUnits:'simulation-s',secondsPerSimulationSecond:timeScale,revision:++revision};
      report={seconds,localOxygenFraction:localN?local/localN:0,incomingOxygenFraction:inWeight>.01?incoming/inWeight:(ringN?ring/ringN:0),oxygenInventoryKg:inventory,initialOxygenKg:initialOxygen,
        oxygenConsumedKg:consumed,oxygenSuppliedKg:supplied,oxygenEscapedKg:escaped,geometryRemovedKg:removed,
        oxygenResidualKg:initialOxygen+supplied-escaped-removed-consumed-inventory,heatReleaseW:power,
        chemicalHeatJ:consumed*HEAT_PER_KG,fuelRemainingKg:Math.max(0,fuelMass-consumed/stoich),maxPowerW:maxPower,
        cellVolumeM3:cellVolume,oxygenDensityKgM3:OXYGEN_DENSITY,extinguished,error:errors[0] || null};
      report.maxOutgoingCellsPerSecond=maxOutgoing;report.transportSubsteps=transportSubsteps;
      report.transportStepSeconds=transportStep;report.maxDonorFraction=maxOutgoing*transportStep;
      sensible*=cellVolume*AIR_DENSITY*CP;lostHeat*=cellVolume*AIR_DENSITY*CP;acceptedExtraHeat*=cellVolume*AIR_DENSITY*CP;
      report.airSensibleHeatJ=sensible;report.airBoundaryAndWallHeatJ=lostHeat;report.airExtraHeatJ=acceptedExtraHeat;report.airBlockedExtraHeatJ=extraHeatJ-acceptedExtraHeat;
      report.airHeatResidualJ=consumed*HEAT_PER_KG*.3+acceptedExtraHeat-lostHeat-sensible;
      report.physicalSeconds=seconds*timeScale;report.secondsPerSimulationSecond=timeScale;
      report.kineticEnergyJ=kinetic*.5*cellVolume*AIR_DENSITY;
      report.projectionInputKineticEnergyJ=projectionInputEnergy*.5*cellVolume*AIR_DENSITY;report.projectionOutputKineticEnergyJ=projectionOutputEnergy*.5*cellVolume*AIR_DENSITY;
      report.projectionKineticChangeJ=report.projectionOutputKineticEnergyJ-report.projectionInputKineticEnergyJ;
      report.maxDivergencePerSecond=maxDivergence;report.rmsDivergencePerSecond=Math.sqrt(divergenceSquared/Math.max(1,fluidCells));
      report.projectionCycles=projectionCycles;report.projectionSolver=prescribed?'fixture Jacobi':'cached multigrid PCG';report.pressureSolveMilliseconds=pressureSolveMilliseconds;report.pressureCPUResidualPerSecond=pressureCPUResidual;report.pressureBackend=pressureSolver?pressureSolver.backend:null;report.maxClosedRhsMeanPerSecond=maxClosedRhsMean;report.airflowModel=prescribed?'prescribed fixture':'physical open-boundary MAC';
      report.projectionConverged=prescribed || maxDivergence<.08;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);return snapshot;
    }
    advance.ownsMomentum=!prescribed;fluid.setGasTransport(advance);
    return {prepare(value){thermal=value;},setBurnerEnabled(value){enabled=!!value;},
      capture,snapshot(){return snapshot;},stats(){return report || {seconds,error:null};},
      addGasHeat(rect,joules){if(Number.isFinite(joules)&&joules>0)heatSources.push({rect:rect,joules:joules});},
      takeHeat(){const value=heatCredit;heatCredit=0;return value;},
      destroy(){retired=true;fluid.setGasTransport(null,advance);for(const t of resources){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}for(const p of programs)gl.deleteProgram(p);},
      constants:{ambient:AMBIENT,heatPerKg:HEAT_PER_KG,fuelMassKg:fuelMass,stoichiometricOxygen:stoich,secondsPerSimulationSecond:timeScale}};
  }
  root.WSSOxygen={create,ambient:AMBIENT,heatPerKg:HEAT_PER_KG};
})(typeof window!=='undefined'?window:globalThis);
