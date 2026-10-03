// CPU MAC finite-volume model. All spatial quantities are SI; h is stored in nm.
export const parameters = Object.freeze({ lengthMeters: .16, dtSeconds: .04, viscosity: 1e-6,
  thermalDiffusivity: 1.2e-6, gravity: 9.81, expansionPerKelvin: 2e-4, dragPerSecond: 1,
  ambientC: 22, heatingKelvin: 12, coolingPerSecond: .025, evaporationNmPerSecond: .7,
  drainageSpeedMetersPerSecond: .000055, drainageReferenceNm: 800, ruptureNm: 18,
  gammaNewtonPerMeter: .03, densityKgPerM3: 1000, ruptureSlowdown: 240, restSeconds: 5, autoRenew: true });
const mc = (a, b) => a * b <= 0 ? 0 : Math.sign(a) * Math.min(2 * Math.abs(a), 2 * Math.abs(b), Math.abs((a + b) / 2));
export function initialThickness(x, y, phase) { return 140 + 980 * y ** .85 + 45 * Math.sin(2 * Math.PI * x + phase) * Math.sin(Math.PI * y) + 18 * Math.sin(4 * Math.PI * x) * Math.sin(2 * Math.PI * y); }
function level(n, Type) { return { n, p: new Type(n*n), b: new Type(n*n), r: new Type(n*n) }; }
export class FilmModel {
  constructor(n = 256, seed = '51a9f17c', overrides = {}, Type = Float32Array) {
    this.n = n; this.p = { ...parameters, ...overrides }; this.dx = this.p.lengthMeters/n; this.Type = Type;
    this.seed = seed; this.phase = (parseInt(seed.slice(-8), 16) >>> 0) / 4294967296 * 2 * Math.PI;
    this.h = new Type(n*n); this.t = new Type(n*n); this.h1 = new Type(n*n); this.h2 = new Type(n*n); this.t1 = new Type(n*n);
    this.u = new Type((n+1)*n); this.v = new Type(n*(n+1)); this.u1 = new Type(this.u.length); this.v1 = new Type(this.v.length);
    this.fx = new Type(this.u.length); this.fy = new Type(this.v.length); this.limit = new Type(n*n); this.plus = new Type(n*n); this.drainFlux = new Type(n*(n+1));
    this.levels = []; for (let m=n; m>=4; m>>=1) this.levels.push(level(m, Type));
    this.stirPsi=new Type((n+1)*(n+1));this.stirCount=0;
    this.steps = 0; this.time = 0; this.cycle = 0; this.events = []; this.evap = 0; this.drain = 0; this.replenished = 0; this.discarded = 0;
    this.rimVolume = 0; this.reset();
  }
  volume(field=this.h) { let s=0; for (const h of field) s+=h; return s*this.dx*this.dx*1e-9; }
  reset() {
    const {n,p}=this; this.discarded+=this.volume()+this.rimVolume; this.rimVolume=0; this.pressureResidual=null; this.pressureCycles=0; this.u.fill(0); this.v.fill(0); this.levels.forEach(l=>l.p.fill(0));
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {const X=(x+.5)/n,Y=(y+.5)/n,i=y*n+x;
      this.h[i]=initialThickness(X,Y,this.phase + this.cycle*.71);
      this.t[i]=p.ambientC+p.heatingKelvin*Math.exp(-(1-Y)/.12)+.35*Math.sin(4*Math.PI*X+this.phase)*Math.sin(Math.PI*Y);
    }
    this.replenished+=this.volume(); this.state='intact'; this.age=0; this.hole=null; this.cycle++; this.measure();
  }
  sample(a, w, h, x, y) {
    x=Math.max(0,Math.min(w-1,x)); y=Math.max(0,Math.min(h-1,y)); const i=Math.floor(x),j=Math.floor(y),tx=x-i,ty=y-j;
    const b=j*w+i,c=Math.min(i+1,w-1),d=Math.min(j+1,h-1);
    return (a[b]*(1-tx)+a[j*w+c]*tx)*(1-ty)+(a[d*w+i]*(1-tx)+a[d*w+c]*tx)*ty;
  }
  velocity(x,y) {const n=this.n; return [this.sample(this.u,n+1,n,x,y-.5),this.sample(this.v,n,n+1,x-.5,y)];}
  setTemperatureC(value){
    if(!Number.isFinite(value))return;
    const next=Math.max(0,Math.min(60,value))-this.p.ambientC,delta=next-this.p.heatingKelvin;
    this.p.heatingKelvin=next;
    for(let y=0;y<this.n;y++)for(let x=0;x<this.n;x++)this.t[y*this.n+x]+=delta*Math.exp(-((1-(y+.5)/this.n)/.12));
  }
  stir({x,y,dx=0,dy=0,tap=false}){
    if(![x,y,dx,dy].every(Number.isFinite))return;
    x=Math.max(0,Math.min(1,x));y=Math.max(0,Math.min(1,y));
    // A compact streamfunction impulse has a divergence-free MAC curl.
    // Drag injects local momentum; a tap starts a small circulating eddy.
    const {n,stirPsi:psi}=this,L=this.p.lengthMeters,r=.075*L,cx=x*L,cy=y*L;
    const current=this.velocity(x*n,y*n),distance=Math.hypot(dx,dy),speed=Math.min(.012,distance*.5);
    const vx=distance?dx/distance*speed-current[0]*.35:0,vy=distance?dy/distance*speed-current[1]*.35:0;
    psi.fill(0);
    const x0=Math.max(1,Math.floor((x-.23)*n)),x1=Math.min(n-1,Math.ceil((x+.23)*n)),y0=Math.max(1,Math.floor((y-.23)*n)),y1=Math.min(n-1,Math.ceil((y+.23)*n));
    for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const X=i*this.dx-cx,Y=j*this.dx-cy,q=(X*X+Y*Y)/(r*r),fade=Math.exp(-q*.5)*Math.max(0,1-q/9)**2;psi[j*(n+1)+i]=((vx*Y-vy*X)+(tap?.008*r:0))*fade;}
    for(let j=Math.max(0,y0-1);j<=Math.min(n-1,y1);j++)for(let i=x0;i<=x1;i++)this.u[j*(n+1)+i]+=(psi[(j+1)*(n+1)+i]-psi[j*(n+1)+i])/this.dx;
    for(let j=y0;j<=y1;j++)for(let i=Math.max(0,x0-1);i<=Math.min(n-1,x1);i++)this.v[j*n+i]-=(psi[j*(n+1)+i+1]-psi[j*(n+1)+i])/this.dx;
    let max=0;for(const v of this.u)max=Math.max(max,Math.abs(v));for(const v of this.v)max=Math.max(max,Math.abs(v));
    if(max>.025){const scale=.025/max;for(let i=0;i<this.u.length;i++)this.u[i]*=scale;for(let i=0;i<this.v.length;i++)this.v[i]*=scale;}
    this.stirCount++;
  }
  smooth(l, iterations) {
    const {n,p,b}=l;
    for(let k=0;k<iterations;k++) for(let parity=0;parity<2;parity++) for(let y=0;y<n;y++) for(let x=(y+parity)&1;x<n;x+=2) {
      const i=y*n+x; let s=0,d=0; if(x){s+=p[i-1];d++;}if(x<n-1){s+=p[i+1];d++;}if(y){s+=p[i-n];d++;}if(y<n-1){s+=p[i+n];d++;} p[i]=(s-b[i])/d;
    }
  }
  residual(l) {const {n,p,b,r}=l; let max=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;let lap=0;if(x)lap+=p[i-1]-p[i];if(x<n-1)lap+=p[i+1]-p[i];if(y)lap+=p[i-n]-p[i];if(y<n-1)lap+=p[i+n]-p[i];r[i]=b[i]-lap;max=Math.max(max,Math.abs(r[i]));}return max;
  }
  vcycle(k=0) {
    const l=this.levels[k];if(k===this.levels.length-1){this.smooth(l,35);return;}
    this.smooth(l,3);this.residual(l);const c=this.levels[k+1],m=c.n,n=l.n;c.p.fill(0);
    for(let y=0;y<m;y++)for(let x=0;x<m;x++){const i=2*y*n+2*x;c.b[y*m+x]=l.r[i]+l.r[i+1]+l.r[i+n]+l.r[i+n+1];}
    this.vcycle(k+1);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)l.p[y*n+x]+=this.sample(c.p,m,m,(x+.5)/2-.5,(y+.5)/2-.5);
    this.smooth(l,3);
  }
  project(maxCycles=6) {
    const n=this.n,l=this.levels[0];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)l.b[y*n+x]=this.u[y*(n+1)+x+1]-this.u[y*(n+1)+x]+this.v[(y+1)*n+x]-this.v[y*n+x];
    // Compatible Neumann RHS has zero mean. Remove floating-point accumulation.
    let mean=0;for(const b of l.b)mean+=b;mean/=n*n;for(let i=0;i<n*n;i++)l.b[i]-=mean;
    let cycles=0,res=Infinity;do{this.vcycle();res=this.residual(l);cycles++;}while(res>2e-8&&cycles<maxCycles);
    for(let y=0;y<n;y++)for(let x=1;x<n;x++)this.u[y*(n+1)+x]-=l.p[y*n+x]-l.p[y*n+x-1];
    for(let y=1;y<n;y++)for(let x=0;x<n;x++)this.v[y*n+x]-=l.p[y*n+x]-l.p[(y-1)*n+x];
    this.pressureResidual=res/(this.dx*this.dx);this.pressureCycles=cycles;
  }
  transport(src,out,dt,sinks=true) {
    // Flux-corrected transport: monotone donor-cell base plus limited MC antidiffusion.
    const {n,p,u,v,fx,fy,limit,plus,drainFlux}=this, q=dt/this.dx;fx.fill(0);fy.fill(0);
    const sx=(x,y)=>x>0&&x<n-1?mc(src[y*n+x]-src[y*n+x-1],src[y*n+x+1]-src[y*n+x]):0;
    const sy=(x,y)=>y>0&&y<n-1?mc(src[y*n+x]-src[(y-1)*n+x],src[(y+1)*n+x]-src[y*n+x]):0;
    const bx=(x,y)=>{if(x===0||x===n)return 0;const a=u[y*(n+1)+x];return a*src[y*n+x-(a>=0?1:0)];};
    const by=(x,y)=>{if(y===0||y===n)return 0;const a=v[y*n+x];return a*src[(y-(a>=0?1:0))*n+x];};
    for(let y=0;y<n;y++)for(let x=1;x<n;x++){const a=u[y*(n+1)+x];fx[y*(n+1)+x]=Math.abs(a)*.5*sx(x-(a>=0?1:0),y);}
    for(let y=1;y<n;y++)for(let x=0;x<n;x++){const a=v[y*n+x];fy[y*n+x]=Math.abs(a)*.5*sy(x,y-(a>=0?1:0));}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]=src[y*n+x]-q*(bx(x+1,y)-bx(x,y)+by(x,y+1)-by(x,y));
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,L=fx[y*(n+1)+x],R=fx[y*(n+1)+x+1],T=fy[y*n+x],B=fy[(y+1)*n+x];
      const inc=q*(Math.max(0,L)+Math.max(0,-R)+Math.max(0,T)+Math.max(0,-B)),dec=q*(Math.max(0,-L)+Math.max(0,R)+Math.max(0,-T)+Math.max(0,B));
      let lo=Math.min(src[i],out[i]),hi=Math.max(src[i],out[i]);
      for(const j of [y*n+Math.max(0,x-1),y*n+Math.min(n-1,x+1),Math.max(0,y-1)*n+x,Math.min(n-1,y+1)*n+x]){lo=Math.min(lo,src[j]);hi=Math.max(hi,src[j]);}
      plus[i]=Math.min(1,Math.max(0,hi-out[i])/Math.max(1e-30,inc));limit[i]=Math.min(1,Math.max(0,out[i]-lo)/Math.max(1e-30,dec));
    }
    for(let y=0;y<n;y++)for(let x=1;x<n;x++){const i=y*(n+1)+x,l=y*n+x-1,r=l+1;fx[i]*=fx[i]>=0?Math.min(limit[l],plus[r]):Math.min(plus[l],limit[r]);}
    for(let y=1;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,t=i-n;fy[i]*=fy[i]>=0?Math.min(limit[t],plus[i]):Math.min(plus[t],limit[i]);}
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]-=q*(fx[y*(n+1)+x+1]-fx[y*(n+1)+x]+fy[(y+1)*n+x]-fy[y*n+x]);
    let loss=0,evap=0;
    if(sinks){drainFlux.fill(0);for(let y=1;y<=n;y++)for(let x=0;x<n;x++){const h=out[(y-1)*n+x];drainFlux[y*n+x]=Math.min(h/q,p.drainageSpeedMetersPerSecond*h*(h/p.drainageReferenceNm)**2);}
      for(let x=0;x<n;x++)loss+=drainFlux[n*n+x]*dt*this.dx*1e-9;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,h=out[i]-q*(drainFlux[i+n]-drainFlux[i]),e=Math.min(Math.max(0,h),p.evaporationNmPerSecond*dt);evap+=e*this.dx*this.dx*1e-9;out[i]=Math.max(0,h-e);}
    }
    return {drain:loss,evap};
  }
  substep(dt) {
    const {n,p,dx}=this, diff=p.viscosity*dt/(dx*dx);
    // Semi-Lagrangian velocity transport, explicit viscosity, linear air drag.
    for(let y=0;y<n;y++)for(let x=1;x<n;x++){const i=y*(n+1)+x,[a,b]=this.velocity(x,y+.5);const adv=this.sample(this.u,n+1,n,x-a*dt/dx,y-b*dt/dx);
      const lap=this.u[i-1]+this.u[i+1]+this.u[Math.max(0,y-1)*(n+1)+x]+this.u[Math.min(n-1,y+1)*(n+1)+x]-4*this.u[i];this.u1[i]=(adv+diff*lap)/(1+p.dragPerSecond*dt);}
    for(let y=1;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,[a,b]=this.velocity(x+.5,y);const adv=this.sample(this.v,n,n+1,x-a*dt/dx,y-b*dt/dx-.0);
      const lap=this.v[y*n+Math.max(0,x-1)]+this.v[y*n+Math.min(n-1,x+1)]+this.v[i-n]+this.v[i+n]-4*this.v[i];
      const T=(this.t[(y-1)*n+x]+this.t[y*n+x])/2-p.ambientC;this.v1[i]=(adv+diff*lap-dt*p.gravity*p.expansionPerKelvin*T)/(1+p.dragPerSecond*dt);}
    [this.u,this.u1]=[this.u1,this.u];[this.v,this.v1]=[this.v1,this.v];this.project();
    const td=p.thermalDiffusivity*dt/(dx*dx);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,[a,b]=this.velocity(x+.5,y+.5);const adv=this.sample(this.t,n,n,x-a*dt/dx,y-b*dt/dx);
      const left=this.t[y*n+Math.max(0,x-1)],right=this.t[y*n+Math.min(n-1,x+1)],top=y?this.t[i-n]:p.ambientC;
      const bottom=y<n-1?this.t[i+n]:p.ambientC+p.heatingKelvin*(1+.15*Math.cos(2*Math.PI*(x+.5)/n)+.08*Math.sin(6*Math.PI*(x+.5)/n));
      this.t1[i]=adv+td*(left+right+top+bottom-4*this.t[i])-dt*p.coolingPerSecond*(adv-p.ambientC);}
    [this.t,this.t1]=[this.t1,this.t];
    const a=this.transport(this.h,this.h1,dt),b=this.transport(this.h1,this.h2,dt);
    for(let i=0;i<n*n;i++)this.h[i]=.5*(this.h[i]+this.h2[i]);this.drain+=(a.drain+b.drain)/2;this.evap+=(a.evap+b.evap)/2;
    this.steps++;this.time+=dt;this.age+=dt;
  }
  advance(dt) {
    if(this.state==='rest'){this.time+=dt;this.age+=dt;if(this.p.autoRenew&&this.age>=this.p.restSeconds)this.reset();return;}
    if(this.state==='rupturing'){
      this.time+=dt;this.age+=dt;this.hole.radius+=this.hole.speed*dt/this.p.ruptureSlowdown;
      for(let y=0;y<this.n;y++)for(let x=0;x<this.n;x++){const i=y*this.n+x;if(Math.hypot((x+.5)/this.n-this.hole.x,(y+.5)/this.n-this.hole.y)<this.hole.radius/this.p.lengthMeters){this.rimVolume+=this.h[i]*this.dx*this.dx*1e-9;this.h[i]=0;}}
      if(this.hole.radius>=this.p.lengthMeters*1.42){this.discarded+=this.volume()+this.rimVolume;this.rimVolume=0;this.h.fill(0);this.state='rest';this.age=0;this.events.push({state:'rest',time:this.time,cycle:this.cycle});}return;
    }
    let max=0;for(const a of this.u)max=Math.max(max,Math.abs(a));for(const b of this.v)max=Math.max(max,Math.abs(b));
    const stable=Math.min(.045,.20*this.dx*this.dx/Math.max(this.p.viscosity,this.p.thermalDiffusivity),.45*this.dx/Math.max(1e-6,2*max));
    const count=Math.ceil(dt/stable);for(let k=0;k<count;k++)this.substep(dt/count);
    let lo=Infinity,idx=0;for(let i=0;i<this.h.length;i++)if(this.h[i]<lo){lo=this.h[i];idx=i;}
    if(lo<=this.p.ruptureNm){this.state='rupturing';this.age=0;this.hole={x:(idx%this.n+.5)/this.n,y:(Math.floor(idx/this.n)+.5)/this.n,radius:0,thicknessNm:lo,representativeThicknessNm:this.volume()/this.p.lengthMeters**2*1e9,speed:Math.sqrt(2*this.p.gammaNewtonPerMeter/(this.p.densityKgPerM3*this.volume()/this.p.lengthMeters**2))};this.events.push({state:'rupturing',time:this.time,cycle:this.cycle,minNm:lo});}
  }
  measure() {
    let min=Infinity,max=0,tmin=Infinity,tmax=-Infinity,div=0,speed=0;const n=this.n;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;min=Math.min(min,this.h[i]);max=Math.max(max,this.h[i]);tmin=Math.min(tmin,this.t[i]);tmax=Math.max(tmax,this.t[i]);div=Math.max(div,Math.abs((this.u[y*(n+1)+x+1]-this.u[y*(n+1)+x]+this.v[(y+1)*n+x]-this.v[y*n+x])/this.dx));}
    for(const a of this.u)speed=Math.max(speed,Math.abs(a));for(const b of this.v)speed=Math.max(speed,Math.abs(b));
    const filmVolume=this.volume(),remaining=filmVolume+this.rimVolume;return this.diagnostics={step:this.steps,time:this.time,state:this.state,cycle:this.cycle,thicknessRangeNm:[min,max],temperatureRangeC:[tmin,tmax],divergenceMaxPerSecond:div,pressureResidualMetersInverseSecondsInverse:this.pressureResidual??null,pressureCycles:this.pressureCycles??0,maxSpeedMetersPerSecond:speed,volumeM3:remaining,filmVolumeM3:filmVolume,rimVolumeM3:this.rimVolume,evaporatedM3:this.evap,drainedM3:this.drain,replenishedM3:this.replenished,resetDiscardedM3:this.discarded,massBalanceErrorM3:remaining+this.evap+this.drain+this.discarded-this.replenished,hole:this.hole?{...this.hole}:null};
  }
}
