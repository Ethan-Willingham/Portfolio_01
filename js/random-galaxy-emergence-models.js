/* Seeded, local models for the two Emergence worlds. The app owns their clock. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const delta = v => v - Math.round(v);
  const turn = v => Math.atan2(Math.sin(v), Math.cos(v));
  const F = n => new Float32Array(n);
  function rng(seed) {
    let s = seed >>> 0;
    const next = () => {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    next.state = () => s >>> 0;
    next.set = v => { s = v >>> 0; };
    return next;
  }
  const definitions = {
    boids: {
      name: 'Flocking birds', summary: 'One bird turns. The flock follows.',
      source: ['Craig Reynolds: Boids', 'https://www.red3d.com/cwr/boids/'],
      about: 'Birds steer from separation, alignment and cohesion. Each sees the nearest seven birds within its range, with a blind area behind it. Close collision avoidance overrides that blind area. Predictive steering avoids obstacles and a soft boundary keeps the flock in view. The hawk chases a nearby bird without killing it. Wings and color illustrate the motion; this is a flocking model, not a flight simulator.',
      tools: [['orbit','Rotate'],['scatter','Scatter birds'],['predator','Move hawk'],['wall','Place obstacle'],['erase','Erase obstacle'],['inspect','Follow a bird']],
      presets: [['murmuration','Murmuration'],['school','Two flocks'],['chaos','Independent birds']],
      rules: [['separation','Keep apart',0,3,.1],['alignment','Match direction',0,3,.1],['cohesion','Stay together',0,3,.1],['range','Seeing distance',.07,.22,.01],['speed','Flight speed',.07,.22,.01],['fear','Avoid the hawk',0,4,.1]],
      defaults: {separation:1.5,alignment:1.6,cohesion:.8,range:.14,speed:.13,fear:2.5},
      compare: ['alignment',0,'No alignment'], count: [1800,600]
    },
    ants: {
      name: 'Ant colony', summary: 'Find food. Leave a trail. Bring the colony with you.',
      source: ['NetLogo: Ants', 'https://ccl.northwestern.edu/netlogo/models/Ants'],
      about: 'Scouts explore with persistent, noisy headings. Food carriers leave food scent; scouts leave home scent. Three forward sensors steer toward food scent, which spreads and evaporates. Carriers remember breadcrumbs from their own outward trip and retrace them, skipping a bend only when the shortcut is clear. They use home scent and a nest bearing if those memories are blocked or run out. Walls block movement and scent. This educational model adds route memory and a separate home signal to the NetLogo-inspired foraging rule. It does not compute a global shortest path.',
      tools: [['view','Pan / zoom'],['food','Place or refill food'],['move','Move food or nest'],['wall','Draw a wall'],['cut','Erase scent'],['erase','Erase wall or food'],['inspect','Follow an ant']],
      presets: [['forage','Open foraging'],['detour','Around the wall'],['scarce','Two routes']],
      rules: [['following','Follow food scent',0,3,.1],['evaporation','Scent fades',.1,2,.1],['deposit','Leave scent',0,2,.1],['exploration','Explore new ground',0,2,.1]],
      defaults: {following:1.8,evaporation:.55,deposit:1,exploration:.65},
      compare: ['following',0,'No scent following'], count: [1500,600]
    }
  };
  class Grid {
    constructor(n, bins=12) {
      this.bins=bins; this.head=new Int32Array(bins**3); this.next=new Int32Array(n);
    }
    build(w) {
      this.head.fill(-1); const b=this.bins;
      for(let i=0;i<w.n;i++) {
        const x=clamp(w.x[i]*b|0,0,b-1),y=clamp(w.y[i]*b|0,0,b-1),z=clamp(w.z[i]*b|0,0,b-1),k=x+y*b+z*b*b;
        this.next[i]=this.head[k]; this.head[k]=i;
      }
    }
    neighbors(w,i,radius,visit,bound) {
      const b=this.bins,reach=Math.ceil(radius*b),cx=w.x[i]*b|0,cy=w.y[i]*b|0,cz=w.z[i]*b|0;
      const center=cx+cy*b+cz*b*b;
      for(let j=this.head[center];j>=0;j=this.next[j])if(j!==i)visit(j);
      for(let z=Math.max(0,cz-reach);z<=Math.min(b-1,cz+reach);z++)
        for(let y=Math.max(0,cy-reach);y<=Math.min(b-1,cy+reach);y++)
          for(let x=Math.max(0,cx-reach);x<=Math.min(b-1,cx+reach);x++){
            const cell=x+y*b+z*b*b;if(cell===center)continue;
            const dx=Math.max(x/b-w.x[i],0,w.x[i]-(x+1)/b),dy=Math.max(y/b-w.y[i],0,w.y[i]-(y+1)/b),dz=Math.max(z/b-w.z[i],0,w.z[i]-(z+1)/b);
            if(dx*dx+dy*dy+dz*dz>(bound?bound():radius*radius))continue;
            for(let j=this.head[cell];j>=0;j=this.next[j])if(j!==i)visit(j);
          }

    }
  }
  const arrays = ['x','y','z','vx','vy','vz','a','phase','rate','light','carry','species','ax','ay','az','neighbors','field','home','temp','wallMask','routeX','routeY','routeCount','trip','wander'];
  class World {
    constructor(id,seed=731,small=false,preset,settings={}) {
      if(!Object.hasOwn(definitions,id))throw Error('Unknown emergence world');
      this.id=id;this.def=definitions[id];this.seed=seed>>>0;this.random=rng(this.seed);this.small=small;
      this.preset=this.def.presets.some(p=>p[0]===preset)?preset:this.def.presets[0][0];
      this.p={...this.def.defaults};this.time=0;this.steps=0;this.food=[];this.walls=[];this.selected=-1;this.delivered=0;this.predator=null;this.pointer=null;
      this.n=this.def.count[small?1:0];
      for(const key of ['x','y','z','vx','vy','vz','a','phase','rate','light','ax','ay','az','trip','wander'])this[key]=F(this.n);
      this.carry=new Uint8Array(this.n);this.species=new Uint8Array(this.n);this.neighbors=new Uint8Array(this.n);
      this.size=id==='ants'?(small?112:160):1;this.field=F(this.size**2);this.home=F(this.field.length);this.temp=F(this.field.length);this.wallMask=new Uint8Array(this.field.length);
      this.grid=new Grid(this.n);this.nearest=new Int32Array(7);this.distances=F(7);
      this.routeLimit=id==='ants'?160:0;this.routeX=F(this.n*this.routeLimit);this.routeY=F(this.routeX.length);this.routeCount=new Uint16Array(this.n);
      this.init();
      for(const [k,v]of Object.entries(settings.p||{})){
        const rule=this.def.rules.find(r=>r[0]===k);if(rule&&Number.isFinite(v))this.p[k]=clamp(v,rule[2],rule[3]);
      }
      if(id==='ants'&&settings.nest)this.nest={x:clamp(+settings.nest.x||.2,.04,.96),y:clamp(+settings.nest.y||.5,.04,.96)};
      if(Array.isArray(settings.food))this.food=settings.food.slice(0,24).map(f=>({x:clamp(+f.x||0,.04,.96),y:clamp(+f.y||0,.04,.96),capacity:clamp(+f.capacity||+f.amount||600,1,2000),amount:clamp(+f.capacity||+f.amount||600,1,2000)}));
      if(Array.isArray(settings.walls))this.walls=settings.walls.slice(0,180).map(w=>({x:clamp(+w.x||0,0,1),y:clamp(+w.y||0,0,1),z:clamp(Number.isFinite(w.z)?w.z:.5,0,1),r:clamp(+w.r||.018,.008,.12)}));
      if(id==='boids'&&settings.predator)this.setPredator(settings.predator.x,settings.predator.y,settings.predator.z);
      this.rebuildWalls();
      if(id==='ants')for(let i=0;i<this.n;i++){this.x[i]=this.nest.x+(this.random()-.5)*.024;this.y[i]=this.nest.y+(this.random()-.5)*.024;this.routeX[i*this.routeLimit]=this.x[i];this.routeY[i*this.routeLimit]=this.y[i];this.routeCount[i]=1;}
    }
    init() {
      const random=this.random;
      if(this.id==='ants'){
        this.nest={x:.18,y:.5};this.food=[{x:.76,y:.22,amount:900,capacity:900},{x:.83,y:.57,amount:900,capacity:900},{x:.68,y:.84,amount:900,capacity:900}];
        if(this.preset==='detour')for(let y=.18;y<.79;y+=.02)this.walls.push({x:.5,y,r:.016});
        if(this.preset==='scarce'){
          this.food=[{x:.84,y:.5,amount:1800,capacity:1800}];
          for(let y=.29;y<.73;y+=.02)this.walls.push({x:.5,y,r:.016});
        }
      }else if(this.preset==='chaos')Object.assign(this.p,{alignment:0,cohesion:.15});
      for(let i=0;i<this.n;i++){
        this.a[i]=random()*TAU;this.phase[i]=random()*TAU;this.rate[i]=.85+random()*.3;this.z[i]=.5;this.species[i]=i%2;
        if(this.id==='boids'){
          const a=random()*TAU,rad=Math.cbrt(random()),v=(random()-.5)*2;
          const spread=this.preset==='school'?.16:.35,cx=this.preset==='school'?(i%2?.69:.31):.5;
          this.x[i]=cx+Math.cos(a)*rad*spread*Math.sqrt(1-v*v);
          this.y[i]=.5+v*rad*.19;this.z[i]=.5+Math.sin(a)*rad*spread*.7;
          const heading=this.preset==='chaos'?this.a[i]:this.preset==='school'?(i%2?Math.PI:0):.25;
          this.vx[i]=Math.cos(heading)*.12+(random()-.5)*.03;this.vy[i]=(random()-.5)*.025;this.vz[i]=Math.sin(heading)*.12+(random()-.5)*.03;
        }
      }
    }
    clone() {
      const w=new World(this.id,this.seed,this.small,this.preset,this.configuration());
      for(const key of arrays)w[key].set(this[key]);
      for(const key of ['time','steps','delivered','selected'])w[key]=this[key];
      w.food=this.food.map(f=>({...f}));w.walls=this.walls.map(p=>({...p}));w.nest=this.nest?{...this.nest}:null;w.predator=this.predator?{...this.predator}:null;w.random.set(this.random.state());
      return w;
    }
    configuration() {
      return {id:this.id,seed:this.seed,preset:this.preset,p:{...this.p},food:this.food.map(f=>({...f,amount:f.capacity})),walls:this.walls.map(w=>({...w})),nest:this.nest?{...this.nest}:undefined,predator:this.predator?{x:this.predator.x,y:this.predator.y,z:this.predator.z}:null};
    }
    cell(x,y) { const n=this.size;return clamp(y*n|0,0,n-1)*n+clamp(x*n|0,0,n-1); }
    blocked(x,y) {return x<.008||x>.992||y<.008||y>.992||!!this.wallMask[this.cell(x,y)];}
    rebuildWalls() {
      if(this.id!=='ants')return;
      const n=this.size;this.wallMask.fill(0);
      for(const wall of this.walls)for(let y=Math.max(0,(wall.y-wall.r)*n|0);y<=Math.min(n-1,(wall.y+wall.r)*n|0);y++)
        for(let x=Math.max(0,(wall.x-wall.r)*n|0);x<=Math.min(n-1,(wall.x+wall.r)*n|0);x++)
          if(Math.hypot((x+.5)/n-wall.x,(y+.5)/n-wall.y)<wall.r+.004)this.wallMask[y*n+x]=1;
      for(let k=0;k<this.field.length;k++)if(this.wallMask[k])this.field[k]=this.home[k]=0;
      for(let i=0;i<this.n;i++)if(this.blocked(this.x[i],this.y[i])){
        let found=false;
        for(let r=1;r<24&&!found;r++)for(let a=0;a<16;a++){
          const x=this.x[i]+Math.cos(a*TAU/16)*r/n,y=this.y[i]+Math.sin(a*TAU/16)*r/n;
          if(!this.blocked(x,y)){this.x[i]=x;this.y[i]=y;found=true;break;}
        }
      }
    }
    sample(x,y,field=this.field) {return this.blocked(x,y)?0:field[this.cell(x,y)];}
    diffuse(decay,field=this.field) {
      const n=this.size,mask=this.wallMask,temp=this.temp;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const k=y*n+x;if(mask[k]){temp[k]=0;continue;}const v=field[k];let sum=0,count=0;
        if(x>0&&!mask[k-1]){sum+=field[k-1];count++;}if(x<n-1&&!mask[k+1]){sum+=field[k+1];count++;}
        if(y>0&&!mask[k-n]){sum+=field[k-n];count++;}if(y<n-1&&!mask[k+n]){sum+=field[k+n];count++;}
        temp[k]=Math.max(0,(v+(sum-count*v)*.06)*(1-decay));
      }
      field.set(temp);
    }
    clearLine(x,y,xx,yy) {
      const steps=Math.ceil(Math.hypot(xx-x,yy-y)*this.size*1.5);
      for(let i=1;i<=steps;i++)if(this.blocked(x+(xx-x)*i/steps,y+(yy-y)*i/steps))return false;
      return true;
    }
    setPredator(x=.5,y=.5,z=.5) {
      this.predator={x:clamp(x,.04,.96),y:clamp(y,.04,.96),z:clamp(Number.isFinite(z)?z:.5,.04,.96),vx:0,vy:0,vz:0,target:0};
    }
    boidsStep(dt) {
      this.grid.build(this);const radius=this.p.range,r2=radius*radius;
      const hawk=this.predator;
      if(hawk){
        if(this.steps%15===0){let best=Infinity;for(let i=0;i<this.n;i+=3){const d=(this.x[i]-hawk.x)**2+(this.y[i]-hawk.y)**2+(this.z[i]-hawk.z)**2;if(d<best){best=d;hawk.target=i;}}}
        const i=hawk.target,dx=this.x[i]-hawk.x,dy=this.y[i]-hawk.y,dz=this.z[i]-hawk.z,d=Math.hypot(dx,dy,dz)||1,k=1-Math.exp(-dt*2);
        hawk.vx+=(dx/d*.18-hawk.vx)*k;hawk.vy+=(dy/d*.18-hawk.vy)*k;hawk.vz+=(dz/d*.18-hawk.vz)*k;
        hawk.x=clamp(hawk.x+hawk.vx*dt,.04,.96);hawk.y=clamp(hawk.y+hawk.vy*dt,.04,.96);hawk.z=clamp(hawk.z+hawk.vz*dt,.04,.96);
      }
      for(let i=0;i<this.n;i++){
        let sx=0,sy=0,sz=0,close=0;this.distances.fill(Infinity);this.nearest.fill(-1);
        const speed=Math.hypot(this.vx[i],this.vy[i],this.vz[i])||.1;
        this.grid.neighbors(this,i,radius,j=>{
          const dx=this.x[j]-this.x[i],dy=this.y[j]-this.y[i],dz=this.z[j]-this.z[i],d2=dx*dx+dy*dy+dz*dz;
          if(d2>r2||d2<1e-10)return;
          if(d2<.0012){const f=1/(d2+.00004);sx-=dx*f;sy-=dy*f;sz-=dz*f;close++;}
          if((dx*this.vx[i]+dy*this.vy[i]+dz*this.vz[i])/Math.sqrt(d2)/speed<-.55)return;
          if(d2>=this.distances[6])return;let k=6;while(k>0&&d2<this.distances[k-1]){this.distances[k]=this.distances[k-1];this.nearest[k]=this.nearest[k-1];k--;}
          this.distances[k]=d2;this.nearest[k]=j;
        },()=>Math.max(.0012,this.distances[6]));
        let ax=0,ay=0,az=0,cx=0,cy=0,cz=0,vx=0,vy=0,vz=0,count=0;
        const steering=(x,y,z,weight)=>{
          const d=Math.hypot(x,y,z);if(d<1e-7||weight===0)return;
          ax+=(x/d*this.p.speed-this.vx[i])*weight;ay+=(y/d*this.p.speed-this.vy[i])*weight;az+=(z/d*this.p.speed-this.vz[i])*weight;
        };
        for(const j of this.nearest)if(j>=0){cx+=this.x[j]-this.x[i];cy+=this.y[j]-this.y[i];cz+=this.z[j]-this.z[i];vx+=this.vx[j];vy+=this.vy[j];vz+=this.vz[j];count++;}
        this.neighbors[i]=count;
        if(count){steering(vx,vy,vz,this.p.alignment*1.9);steering(cx,cy,cz,this.p.cohesion);}
        if(close)steering(sx,sy,sz,this.p.separation*2.3);
        // Predict the boundary and obstacles before the bird reaches them.
        for(const [pos,vel,axis]of [[this.x[i],this.vx[i],0],[this.y[i],this.vy[i],1],[this.z[i],this.vz[i],2]]){
          const p=pos+vel*.9-.5,force=-Math.sign(p)*Math.max(0,Math.abs(p)-.34)*4;
          if(axis===0)ax+=force;else if(axis===1)ay+=force;else az+=force;
        }
        for(const wall of this.walls){const dx=this.x[i]+this.vx[i]*.65-wall.x,dy=this.y[i]+this.vy[i]*.65-wall.y,dz=this.z[i]+this.vz[i]*.65-(wall.z??.5),d=Math.hypot(dx,dy,dz);if(d<wall.r+.075)steering(dx,dy,dz,4*(1-d/(wall.r+.075)));}
        if(hawk){const dx=this.x[i]-hawk.x,dy=this.y[i]-hawk.y,dz=this.z[i]-hawk.z,d=Math.hypot(dx,dy,dz);if(d<.23)steering(dx,dy,dz,this.p.fear*4*(1-d/.23));}
        ax+=Math.sin(this.time*.9+this.phase[i])*.009;ay+=Math.cos(this.time*.7+this.phase[i])*.006;az+=Math.sin(this.time*.8+this.phase[i]*2)*.009;
        const force=Math.hypot(ax,ay,az),limit=.36,scale=force>limit?limit/force:1;this.ax[i]=ax*scale;this.ay[i]=ay*scale;this.az[i]=az*scale;
      }
      for(let i=0;i<this.n;i++){
        this.vx[i]+=this.ax[i]*dt;this.vy[i]+=this.ay[i]*dt;this.vz[i]+=this.az[i]*dt;
        const speed=Math.hypot(this.vx[i],this.vy[i],this.vz[i])||1,target=clamp(speed,this.p.speed*.8,this.p.speed*1.2),scale=target/speed;
        this.vx[i]*=scale;this.vy[i]*=scale;this.vz[i]*=scale;
        this.x[i]=clamp(this.x[i]+this.vx[i]*dt,.015,.985);this.y[i]=clamp(this.y[i]+this.vy[i]*dt,.015,.985);this.z[i]=clamp(this.z[i]+this.vz[i]*dt,.015,.985);
        for(const wall of this.walls){
          const dx=this.x[i]-wall.x,dy=this.y[i]-wall.y,dz=this.z[i]-(wall.z??.5),d=Math.hypot(dx,dy,dz),rad=wall.r+.004;
          if(d<rad){const k=rad/(d||.001);this.x[i]=wall.x+(d?dx:.001)*k;this.y[i]=wall.y+dy*k;this.z[i]=(wall.z??.5)+dz*k;const inward=(this.vx[i]*dx+this.vy[i]*dy+this.vz[i]*dz)/(d*d||1);if(inward<0){this.vx[i]-=inward*dx*1.5;this.vy[i]-=inward*dy*1.5;this.vz[i]-=inward*dz*1.5;}}
        }
        this.light[i]=clamp(Math.hypot(this.ax[i],this.ay[i],this.az[i])/.36,0,1);
      }
    }
    antsStep(dt) {
      const random=this.random,nest=this.nest;
      for(let i=0;i<this.n;i++){
        let x=this.x[i],y=this.y[i],a=this.a[i],base=i*this.routeLimit,count=this.routeCount[i];
        const returning=this.carry[i]!==0;
        if(returning){
          if(Math.hypot(x-nest.x,y-nest.y)<.027){
            if(this.carry[i]===1)this.delivered++;this.carry[i]=0;this.trip[i]=0;this.routeCount[i]=1;this.routeX[base]=x;this.routeY[base]=y;this.a[i]=a+Math.PI+(random()-.5);continue;
          }
          while(count>1&&Math.hypot(x-this.routeX[base+count-1],y-this.routeY[base+count-1])<.017)count--;
          // Only skip remembered waypoints if the physical shortcut is clear.
          if(this.steps%6===0&&count>3)for(let skip=Math.min(6,count-1);skip>1;skip--){const j=base+count-skip;if(this.clearLine(x,y,this.routeX[j],this.routeY[j])){count-=skip-1;break;}}
          this.routeCount[i]=count;
          let tx=count>1?this.routeX[base+count-1]:nest.x,ty=count>1?this.routeY[base+count-1]:nest.y;
          if(this.blocked(tx,ty)){this.routeCount[i]=Math.max(1,count-1);tx=nest.x;ty=nest.y;}
          a+=clamp(turn(Math.atan2(ty-y,tx-x)-a),-.22,.22);
          if(count<=1||this.blocked(tx,ty)){const look=.025,l=this.sample(x+Math.cos(a-.6)*look,y+Math.sin(a-.6)*look,this.home),r=this.sample(x+Math.cos(a+.6)*look,y+Math.sin(a+.6)*look,this.home);a+=clamp((r-l)/(Math.max(r,l)+.1)*.18,-.18,.18);}
          if(this.carry[i]===1)this.field[this.cell(x,y)]=Math.min(120,this.field[this.cell(x,y)]+this.p.deposit*5*Math.exp(-this.trip[i]*.08));
        }else{
          let picked=false;
          for(const f of this.food)if(f.amount>0&&Math.hypot(x-f.x,y-f.y)<.043){f.amount--;this.carry[i]=1;this.trip[i]=0;a+=Math.PI;picked=true;break;}
          if(picked){this.a[i]=a;continue;}
          const look=.023,sensor=.58,left=this.sample(x+Math.cos(a-sensor)*look,y+Math.sin(a-sensor)*look),front=this.sample(x+Math.cos(a)*look,y+Math.sin(a)*look),right=this.sample(x+Math.cos(a+sensor)*look,y+Math.sin(a+sensor)*look);
          const strongest=Math.max(left,front,right),bias=strongest>.07?(right-left)/(strongest+.1)*.16*this.p.following:0;
          this.wander[i]=this.wander[i]*.92+(random()-.5)*.07*this.p.exploration;
          a+=bias+this.wander[i]*(strongest>.07&&this.p.following>0?.23:1);
          this.home[this.cell(x,y)]=Math.min(80,this.home[this.cell(x,y)]+1.7*Math.exp(-this.trip[i]*.065));
          const last=base+count-1;
          if(Math.hypot(x-this.routeX[last],y-this.routeY[last])>.018){
            if(count<this.routeLimit){this.routeX[base+count]=x;this.routeY[base+count]=y;this.routeCount[i]=count+1;}
            else{this.carry[i]=2;a+=Math.PI;}
          }
        }
        const speed=(this.carry[i]===1?.082:.096)*this.rate[i];
        // Look ahead for walls. Turn into the clearer local direction, then test the move.
        const ahead=.015,blocked=this.blocked(x+Math.cos(a)*ahead,y+Math.sin(a)*ahead);
        if(blocked){
          const left=this.blocked(x+Math.cos(a-.85)*ahead,y+Math.sin(a-.85)*ahead),right=this.blocked(x+Math.cos(a+.85)*ahead,y+Math.sin(a+.85)*ahead);
          a+=left&&!right?.6:right&&!left?-.6:(i%2?.65:-.65);
        }
        let xx=x+Math.cos(a)*speed*dt,yy=y+Math.sin(a)*speed*dt;
        if(this.blocked(xx,yy)){
          let moved=false;
          for(const t of [.7,-.7,1.4,-1.4,2.2,-2.2,Math.PI]){const angle=a+t,nx=x+Math.cos(angle)*speed*dt,ny=y+Math.sin(angle)*speed*dt;if(!this.blocked(nx,ny)){a=angle;xx=nx;yy=ny;moved=true;break;}}
          if(!moved){xx=x;yy=y;}
        }
        this.vx[i]=(xx-x)/dt;this.vy[i]=(yy-y)/dt;this.x[i]=xx;this.y[i]=yy;this.a[i]=a%TAU;this.trip[i]+=dt;
      }
      const k=this.cell(nest.x,nest.y);if(!this.wallMask[k])this.home[k]=80;
      this.diffuse(this.p.evaporation*.01);this.diffuse(this.p.evaporation*.004,this.home);
    }
    step(dt) {this.time+=dt;this.steps++;if(this.id==='boids')this.boidsStep(dt);else this.antsStep(dt);}
    intervene(tool,x,y,r,z=.5) {
      x=clamp(x,.02,.98);y=clamp(y,.02,.98);z=clamp(z,.02,.98);
      if(tool==='food'&&this.id==='ants'&&!this.blocked(x,y)){
        const food=this.food.find(f=>Math.hypot(x-f.x,y-f.y)<.055);
        if(food)food.amount=food.capacity;else if(this.food.length<24)this.food.push({x,y,amount:900,capacity:900});
      }
      if(tool==='wall'&&this.walls.length<180){
        r=r||(this.id==='ants'?.018:.07);
        if(this.nest&&Math.hypot(x-this.nest.x,y-this.nest.y)<r+.035)return;
        if(!this.walls.some(w=>Math.hypot(w.x-x,w.y-y,(w.z??.5)-z)<r*.65)){this.walls.push(this.id==='boids'?{x:clamp(x,r+.02,1-r-.02),y:clamp(y,r+.02,1-r-.02),z:clamp(z,r+.02,1-r-.02),r}:{x,y,z,r});this.rebuildWalls();}
      }
      if(tool==='erase'){
        this.walls=this.walls.filter(w=>Math.hypot(w.x-x,w.y-y,this.id==='boids'?(w.z??.5)-z:0)>w.r+.035);
        this.food=this.food.filter(f=>Math.hypot(f.x-x,f.y-y)>.05);
        if(this.predator&&Math.hypot(this.predator.x-x,this.predator.y-y,this.predator.z-z)<.1)this.predator=null;
        this.rebuildWalls();
      }
      if(tool==='cut')for(let yy=0;yy<this.size;yy++)for(let xx=0;xx<this.size;xx++)if(Math.hypot((xx+.5)/this.size-x,(yy+.5)/this.size-y)<.045){this.field[yy*this.size+xx]=0;this.home[yy*this.size+xx]=0;}
      if(tool==='predator'&&this.id==='boids')this.setPredator(x,y,z);
      if(tool==='scatter')for(let i=0;i<this.n;i++){
        const dx=this.x[i]-x,dy=this.y[i]-y,dz=this.z[i]-z,d=Math.hypot(dx,dy,dz);
        if(d<.23){const k=(.23-d)*2/(d+.01);this.vx[i]+=dx*k;this.vy[i]+=dy*k;this.vz[i]+=dz*k;}
      }
      if(tool==='inspect'){let best=Infinity;for(let i=0;i<this.n;i++){const d=(this.x[i]-x)**2+(this.y[i]-y)**2;if(d<best){best=d;this.selected=i;}}}
    }
    movePlace(index,x,y) {
      if(this.id!=='ants'||this.blocked(x,y))return;
      const p=index===-2?this.nest:this.food[index];if(!p)return;
      p.x=clamp(x,.04,.96);p.y=clamp(y,.04,.96);if(index===-2)this.home.fill(0);
    }
    metric() {
      if(this.id==='ants'){
        const carriers=this.carry.reduce((n,v)=>n+(v===1),0),remaining=this.food.reduce((n,f)=>n+f.amount,0);
        return [this.delivered.toLocaleString()+' food home',carriers+' carrying · '+remaining.toLocaleString()+' left'];
      }
      let x=0,y=0,z=0;for(let i=0;i<this.n;i++){const d=Math.hypot(this.vx[i],this.vy[i],this.vz[i])||1;x+=this.vx[i]/d;y+=this.vy[i]/d;z+=this.vz[i]/d;}
      return [Math.round(Math.hypot(x,y,z)/this.n*100)+'% aligned',this.n.toLocaleString()+' birds'+(this.predator?' · hawk hunting':'')];
    }
  }
  const api={definitions,World,clamp,delta};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GXEmergenceModels=api;
})(typeof window!=='undefined'?window:globalThis);
