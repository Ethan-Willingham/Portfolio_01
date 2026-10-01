/* Local interactions, deterministic seeds, fixed simulation steps.
 * Models are deliberately simplified. Primary references are linked in the lab.
 * Rendering and browser lifecycle live in random-galaxy-emergence.js. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = v => v - Math.floor(v);
  const delta = v => v - Math.round(v);
  const angleDelta = v => Math.atan2(Math.sin(v), Math.cos(v));
  const F = n => new Float32Array(n);
  function rng(seed) {
    let s = seed >>> 0;
    const next = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    next.state = () => s >>> 0; next.set = v => { s = v >>> 0; }; return next;
  }
  const definitions = {
    boids: {
      name: 'Flocking birds', summary: 'Keep apart. Match your neighbors. Stay together.',
      source: ['Craig Reynolds: Boids', 'https://www.red3d.com/cwr/boids/'],
      about: 'Each bird steers using only nearby birds. Separation avoids collisions, alignment matches direction, and cohesion holds the flock together. A soft boundary keeps this three-dimensional flock in view. The predator and obstacles add local avoidance.',
      tools: [['orbit','Rotate'],['scatter','Scatter'],['predator','Predator'],['wall','Obstacle'],['erase','Erase'],['inspect','Follow a bird']],
      presets: [['murmuration','Murmuration'],['school','Tight school'],['chaos','No agreement']],
      rules: [['separation','Keep apart',0,3,.1],['alignment','Match direction',0,3,.1],['cohesion','Stay together',0,3,.1],['fear','Avoid predator',0,4,.1]],
      defaults: {separation:1.7,alignment:1.1,cohesion:1,fear:2.5}, compare: ['alignment',0,'No alignment'], count: [2200,650]
    },
    ants: {
      name: 'Ant colony', summary: 'A discovery becomes a trail. A trail becomes a road.',
      source: ['NetLogo: Ants', 'https://ccl.northwestern.edu/netlogo/models/Ants'],
      about: 'Scouts wander until they find food. Returning ants head toward the nest and leave a food trail. Other scouts sample that trail ahead and turn toward stronger scent. Scent diffuses and fades. Nest direction is supplied to returning ants, a simplified navigation rule.',
      tools: [['food','Place food'],['wall','Draw a wall'],['erase','Erase'],['inspect','Follow an ant']],
      presets: [['forage','Three discoveries'],['detour','Around the wall'],['scarce','Far from home']],
      rules: [['following','Follow scent',0,3,.1],['evaporation','Scent fades',.1,2,.1],['deposit','Leave scent',0,2,.1]],
      defaults: {following:1.5,evaporation:.6,deposit:1}, compare: ['following',0,'No scent following'], count: [2600,900]
    },
    physarum: {
      name: 'Slime networks', summary: 'Follow a trace. Reinforce it. Find another way.',
      source: ['Jeff Jones: Physarum transport networks', 'https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks'],
      about: 'These agents are a model inspired by slime mold, rather than individual biological cells. Three forward sensors sample a shared chemical field. Agents turn toward stronger signals and leave their own traces. Diffusion, decay and food sources let paths merge into networks. Networks can reconnect after a cut; shortest routes are not guaranteed.',
      tools: [['food','Place food'],['move','Move food'],['cut','Cut a trail'],['wall','Draw a wall'],['erase','Erase'],['inspect','Follow an agent']],
      presets: [['network','Food network'],['maze','Living maze'],['orbit','One attractor']],
      rules: [['sensing','Follow signals',0,2,.1],['decay','Trail fades',.05,1,.05],['sensor','Look ahead',2,16,1]],
      defaults: {sensing:1,decay:.18,sensor:9}, compare: ['sensing',0,'No signal sensing'], count: [8500,3200]
    },
    fireflies: {
      name: 'Firefly rhythms', summary: 'One flash nudges another. Watch the timing spread.',
      source: ['Mirollo and Strogatz: coupled oscillators', 'https://www.clear.rice.edu/comp551/papers/MirolloStrogatz-TemporalSynchronization-SIAM1990.pdf'],
      about: 'Each light has a repeating internal phase. Nearby phases pull one another toward agreement, with a small spread in natural frequencies. This local phase-oscillator model is inspired by synchronization research. It is not a biological firefly model or the exact all-to-all pulse model in the paper. Local coupling can leave several synchronized neighborhoods.',
      tools: [['pulse','Disturb timing'],['inspect','Follow a light']],
      presets: [['unison','Find a rhythm'],['islands','Separate neighborhoods'],['wave','Rolling wave']],
      rules: [['coupling','Match timing',0,5,.1],['radius','Neighbor range',.03,.3,.01],['diversity','Different rhythms',0,.5,.01]],
      defaults: {coupling:2.5,radius:.16,diversity:.04}, compare: ['coupling',0,'No timing coupling'], count: [1200,450]
    },
    particlelife: {
      name: 'Particle Life', summary: 'Attraction and repulsion build their own little worlds.',
      source: ['Particle Life: interaction model', 'https://github.com/HackerPoet/Particle-Life'],
      about: 'Four colored species interact through a directed relationship table. A row says how that species feels about each column. All particles repel at very short range; farther away the table determines attraction or repulsion. Drag to pull a cluster apart. There is no scripted path or external flow field.',
      tools: [['pull','Pull particles'],['repel','Push particles'],['inspect','Follow a particle']],
      presets: [['cells','Little cells'],['chase','Chase and orbit'],['mix','Everyone attracts']],
      rules: [['strength','Interaction strength',0,2,.1],['radius','Neighbor range',.04,.2,.01],['friction','Drag',1,10,.5]],
      defaults: {strength:1,radius:.11,friction:4}, compare: ['strength',0,'No species forces'], count: [2400,800]
    },
    lenia: {
      name: 'Lenia organisms', summary: 'Soft cells grow, shrink and move without a leader.',
      source: ['Bert Chan: Lenia', 'https://chakazul.github.io/lenia.html'],
      about: 'Lenia is a continuous cellular automaton. Each cell samples a circular neighborhood through a ring-shaped kernel. A smooth growth function changes the cell density. These presets use Bert Chan\'s published Orbium unicaudatus seed and parameters (radius 13, growth center 0.15, width 0.015, time scale 10). FFT convolution computes the real neighborhood rule. Edges wrap. Changing growth can kill or overgrow the organisms.',
      tools: [['organism','Place an Orbium'],['erase','Erase cells'],['inspect','Inspect a cell']],
      presets: [['garden','Six swimmers'],['solo','One swimmer'],['collision','Collision course']],
      rules: [['growth','Growth center',.12,.18,.001],['width','Growth tolerance',.01,.025,.001]],
      defaults: {growth:.15,width:.015}, compare: ['growth',.16,'Changed growth center'], count: [0,0]
    },
    crowds: {
      name: 'Crowd flow', summary: 'Give everyone a destination. Let the lanes form.',
      source: ['Helbing and Molnar: social force model', 'https://arxiv.org/abs/cond-mat/9805244'],
      about: 'Walkers accelerate toward a desired direction while avoiding nearby people and walls. Two opposing streams can sort themselves into lanes. Bottlenecks slow the flow. This is a simplified social-force model, not a crowd safety predictor. People exiting one side re-enter on the other.',
      tools: [['wall','Draw a wall'],['erase','Erase a wall'],['inspect','Follow a walker']],
      presets: [['lanes','Opposing streams'],['door','Through a doorway'],['rush','Rush hour']],
      rules: [['avoidance','Give people space',0,3,.1],['pace','Walking pace',.04,.16,.01],['density','Crowd size',.3,1,.1]],
      defaults: {avoidance:1.6,pace:.09,density:.7}, compare: ['avoidance',0,'No mutual avoidance'], count: [900,350]
    }
  };

  // Counting-free linked cell lists. Queries visit only local bins.
  class Grid {
    constructor(n, bins=20, dim=2) { this.bins=bins; this.dim=dim; this.head=new Int32Array(bins ** dim); this.next=new Int32Array(n); }
    build(w) {
      this.head.fill(-1); const b=this.bins;
      for(let i=0;i<w.n;i++) { const x=clamp(w.x[i]*b|0,0,b-1), y=clamp(w.y[i]*b|0,0,b-1), z=this.dim===3?clamp(w.z[i]*b|0,0,b-1):0;
        const k=x+y*b+z*b*b; this.next[i]=this.head[k]; this.head[k]=i; }
    }
    neighbors(w,i,radius,visit,periodic=true) {
      const b=this.bins, reach=Math.ceil(radius*b), cx=w.x[i]*b|0,cy=w.y[i]*b|0,cz=this.dim===3?w.z[i]*b|0:0;
      for(let dz=this.dim===3?-reach:0;dz<=(this.dim===3?reach:0);dz++)for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++) {
        let x=cx+dx,y=cy+dy,z=cz+dz;
        if(periodic){x=(x+b)%b;y=(y+b)%b;z=(z+b)%b;}else if(x<0||x>=b||y<0||y>=b||z<0||z>=b)continue;
        for(let j=this.head[x+y*b+z*b*b];j>=0;j=this.next[j])if(j!==i)visit(j);
      }
    }
  }
  // In-place radix-2 FFT, including both spatial dimensions. Own implementation.
  function fft1(re,im,n,offset,stride,inverse) {
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let a=offset+i*stride,b=offset+j*stride,t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;}}
    for(let len=2;len<=n;len*=2){let a=(inverse?TAU:-TAU)/len,cr=Math.cos(a),ci=Math.sin(a);
      for(let start=0;start<n;start+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const p=offset+(start+j)*stride,q=p+len/2*stride,vr=re[q]*wr-im[q]*wi,vi=re[q]*wi+im[q]*wr;
        re[q]=re[p]-vr;im[q]=im[p]-vi;re[p]+=vr;im[p]+=vi;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}
    }
    if(inverse)for(let i=0;i<n;i++){re[offset+i*stride]/=n;im[offset+i*stride]/=n;}
  }
  function fft2(re,im,n,inverse=false){for(let y=0;y<n;y++)fft1(re,im,n,y*n,1,inverse);for(let x=0;x<n;x++)fft1(re,im,n,x,n,inverse);}
  let orbium = null;
  function decodeOrbium(rle) {
    const rows=[[]]; let count='',prefix='';
    for(const c of rle) {
      if(/[0-9]/.test(c)){count+=c;continue;} if('pqrstuvwxy'.includes(c)){prefix=c;continue;}
      const n=Number(count)||1; count='';
      if(c==='$'){for(let k=0;k<n;k++)rows.push([]);}else if(c!=='!'){
        const value=c==='.'||c==='b'?0:c==='o'?1:(prefix?(prefix.charCodeAt(0)-112)*24+c.charCodeAt(0)-65+25:c.charCodeAt(0)-65+1)/255;
        for(let k=0;k<n;k++)rows[rows.length-1].push(value);
      }prefix='';
    }
    return rows;
  }
  class World {
    constructor(id,seed=731,small=false,preset,settings={}) {
      this.id=id;this.def=definitions[id];this.seed=seed>>>0;this.random=rng(this.seed);this.small=small;
      this.preset=preset||this.def.presets[0][0];this.p={...this.def.defaults};this.time=0;this.steps=0;this.food=[];this.walls=[];this.selected=-1;this.delivered=0;
      this.size=id==='lenia'?(this.preset==='solo'?128:256):id==='physarum'?(small?192:256):(small?128:192);this.field=F(this.size*this.size);this.temp=F(this.field.length);this.potential=F(this.field.length);
      this.occupancy=new Uint16Array(this.field.length);
      this.wallMask=new Uint8Array(this.field.length);
      this.n=this.def.count[small?1:0];this.x=F(this.n);this.y=F(this.n);this.z=F(this.n);this.vx=F(this.n);this.vy=F(this.n);this.vz=F(this.n);this.a=F(this.n);this.phase=F(this.n);this.rate=F(this.n);this.light=F(this.n);this.carry=new Uint8Array(this.n);this.species=new Uint8Array(this.n);
      this.grid=new Grid(this.n,id==='boids'?12:20,id==='boids'?3:2);this.matrix=F(16);this.pointer=null;this.predator=null;
      this.init();
      for(const [k,v] of Object.entries(settings.p||{})){const rule=this.def.rules.find(r=>r[0]===k);if(rule&&Number.isFinite(v))this.p[k]=clamp(v,rule[2],rule[3]);}
      if(settings.matrix&&settings.matrix.length===16)this.matrix.set(settings.matrix.map(v=>clamp(Number(v)||0,-1,1)));
      if(Array.isArray(settings.food))this.food=settings.food.slice(0,24).map(f=>({x:clamp(+f.x||0,0,1),y:clamp(+f.y||0,0,1),amount:clamp(Number.isFinite(+f.amount)?+f.amount:100,0,1000)}));
      if(Array.isArray(settings.walls))this.walls=settings.walls.slice(0,180).map(w=>({x:clamp(+w.x||0,0,1),y:clamp(+w.y||0,0,1),r:clamp(+w.r||.015,.008,.09)}));
      if(this.id!=='boids')for(let i=0;i<this.n;i++){let attempts=0;while(this.blocked(this.x[i],this.y[i])&&attempts++<60){this.x[i]=this.random();this.y[i]=.04+this.random()*.92;}}
      this.rebuildWalls();
    }
    init(){
      const random=this.random,id=this.id;
      if(id==='boids'){if(this.preset==='school')Object.assign(this.p,{alignment:2,cohesion:1.8,separation:1});if(this.preset==='chaos')this.p.alignment=0;}
      if(id==='ants'){
        this.nest={x:.23,y:.5};this.food=[{x:.73,y:.23,amount:450},{x:.82,y:.55,amount:450},{x:.66,y:.81,amount:450}];
        if(this.preset==='detour'){for(let y=.25;y<.73;y+=.025)this.walls.push({x:.5,y,r:.018});}
        if(this.preset==='scarce')this.food=[{x:.86,y:.18,amount:800}];
      }
      if(id==='physarum'){
        this.food=[{x:.25,y:.3,amount:999},{x:.7,y:.22,amount:999},{x:.79,y:.71,amount:999},{x:.35,y:.8,amount:999},{x:.5,y:.5,amount:999}];
        if(this.preset==='orbit')this.food=[{x:.5,y:.5,amount:999}];
        if(this.preset==='maze'){for(let y=.05;y<.7;y+=.025)this.walls.push({x:.4,y,r:.016});for(let y=.3;y<.96;y+=.025)this.walls.push({x:.67,y,r:.016});}
      }
      if(id==='fireflies'){if(this.preset==='islands')Object.assign(this.p,{radius:.075,coupling:3.5});if(this.preset==='wave')Object.assign(this.p,{radius:.1,coupling:1.4,diversity:0});}
      if(id==='particlelife'){
        for(let i=0;i<4;i++)for(let j=0;j<4;j++)this.matrix[i*4+j]=i===j?.6:-.35;
        if(this.preset==='chase')for(let i=0;i<4;i++)for(let j=0;j<4;j++)this.matrix[i*4+j]=i===j?.2:j===(i+1)%4?.9:j===(i+3)%4?-.9:-.2;
        if(this.preset==='mix')this.matrix.fill(.6);
      }
      if(id==='crowds'){
        if(this.preset==='door')for(let y=.04;y<.98;y+=.025)if(y<.4||y>.6)this.walls.push({x:.5,y,r:.015});
        if(this.preset==='rush')Object.assign(this.p,{density:1,pace:.13});
      }
      for(let i=0;i<this.n;i++){
        this.x[i]=.03+random()*.94;this.y[i]=.06+random()*.88;this.z[i]=.5;this.a[i]=random()*TAU;this.species[i]=i%4;
        if(id==='boids'){this.x[i]=.5+(random()-.5)*.65;this.y[i]=.5+(random()-.5)*.65;this.z[i]=.5+(random()-.5)*.65;this.vx[i]=Math.cos(this.a[i])*.1;this.vy[i]=Math.sin(this.a[i])*.1;this.vz[i]=(random()-.5)*.12;}
        if(id==='ants'){if(i<this.n*.7){this.x[i]=this.nest.x+(random()-.5)*.06;this.y[i]=this.nest.y+(random()-.5)*.06;}}
        if(id==='fireflies'){this.phase[i]=this.preset==='wave'?this.x[i]*TAU:random()*TAU;this.rate[i]=(random()-.5)*2;this.light[i]=0;}
        if(id==='crowds'){this.species[i]=i%2;this.vx[i]=(i%2?-1:1)*this.p.pace;}
      }
      if(id==='lenia'){
        const n=this.size;this.kr=F(n*n);this.ki=F(n*n);this.fr=F(n*n);this.fi=F(n*n);let sum=0;
        for(let y=-13;y<=13;y++)for(let x=-13;x<=13;x++){const r=Math.hypot(x,y)/13,v=r<1?Math.pow(4*r*(1-r),4):0;this.kr[((y+n)%n)*n+(x+n)%n]=v;sum+=v;}
        for(let i=0;i<this.kr.length;i++)this.kr[i]/=sum;fft2(this.kr,this.ki,n);
        if(this.preset==='garden')for(const [x,y]of [[.2,.28],[.5,.28],[.8,.28],[.2,.72],[.5,.72],[.8,.72]])this.placeOrbium(x,y,0);
        else if(this.preset==='collision'){this.placeOrbium(.36,.5,0);this.placeOrbium(.64,.5,2);}else this.placeOrbium(.5,.5,0);
      }
    }
    placeOrbium(x,y,turn=0){
      if(!orbium)return;const n=this.size,h=orbium.length,w=Math.max(...orbium.map(r=>r.length));
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){let dx=xx-w/2,dy=yy-h/2;for(let t=0;t<turn;t++){const z=dx;dx=-dy;dy=z;}const k=((Math.round(y*n+dy)+n)%n)*n+(Math.round(x*n+dx)+n)%n;this.field[k]=Math.max(this.field[k],orbium[yy][xx]||0);}
    }
    clone(){
      const other=new World(this.id,this.seed,this.small,this.preset);other.p={...this.p};other.time=this.time;other.steps=this.steps;other.food=this.food.map(f=>({...f}));other.walls=this.walls.map(w=>({...w}));other.delivered=this.delivered;other.predator=this.predator?{...this.predator}:null;
      for(const key of ['field','temp','potential','x','y','z','vx','vy','vz','a','phase','rate','light','carry','species','matrix'])other[key].set(this[key]);
      other.random.set(this.random.state());other.selected=this.selected;other.rebuildWalls();return other;
    }
    configuration(){return {id:this.id,seed:this.seed,preset:this.preset,p:{...this.p},matrix:Array.from(this.matrix),food:this.food.map(f=>({...f})),walls:this.walls.map(w=>({...w}))};}
    cell(x,y){const n=this.size;return (wrap(y)*n|0)*n+(wrap(x)*n|0);}
    blocked(x,y){return this.walls.some(w=>(x-w.x)**2+(y-w.y)**2<w.r*w.r);}
    rebuildWalls(){const n=this.size;this.wallMask.fill(0);for(const wall of this.walls)for(let y=Math.max(0,Math.floor((wall.y-wall.r)*n));y<Math.min(n,(wall.y+wall.r)*n);y++)for(let x=Math.max(0,Math.floor((wall.x-wall.r)*n));x<Math.min(n,(wall.x+wall.r)*n);x++)if((x/n-wall.x)**2+(y/n-wall.y)**2<wall.r*wall.r)this.wallMask[y*n+x]=1;}
    expel(i){for(let pass=0;pass<3;pass++)for(const wall of this.walls){let dx=this.x[i]-wall.x,dy=this.y[i]-wall.y,d=Math.hypot(dx,dy);if(d<wall.r){if(d<1e-6){dx=i%2?1:-1;dy=0;d=1;}this.x[i]=clamp(wall.x+dx/d*(wall.r+.003),.015,.985);this.y[i]=clamp(wall.y+dy/d*(wall.r+.003),.015,.985);}}}
    sample(x,y){return this.field[this.cell(x,y)];}
    diffuse(decay,amount=.18){const n=this.size,a=this.field,b=this.temp;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,up=((y+n-1)%n)*n+x,dn=((y+1)%n)*n+x,l=y*n+(x+n-1)%n,r=y*n+(x+1)%n,mask=this.wallMask;b[i]=mask[i]?0:Math.max(0,(a[i]*(1-4*amount)+amount*((mask[up]?a[i]:a[up])+(mask[dn]?a[i]:a[dn])+(mask[l]?a[i]:a[l])+(mask[r]?a[i]:a[r])))*(1-decay));}
      this.field=b;this.temp=a;
    }
    step(dt=1/30){
      if(this.id==='boids')this.stepBoids(dt);
      else if(this.id==='ants'||this.id==='physarum')this.stepTrails(dt);
      else if(this.id==='fireflies')this.stepFireflies(dt);
      else if(this.id==='particlelife')this.stepParticles(dt);
      else if(this.id==='lenia')this.stepLenia();
      else if(this.id==='crowds')this.stepCrowds(dt);
      this.time+=dt;this.steps++;
    }
    stepBoids(dt){
      this.grid.build(this);const n=this.n,p=this.p,ax=F(n),ay=F(n),az=F(n),r=.105;
      for(let i=0;i<n;i++){
        let count=0,cx=0,cy=0,cz=0,vx=0,vy=0,vz=0,sx=0,sy=0,sz=0;
        this.grid.neighbors(this,i,r,j=>{const dx=this.x[j]-this.x[i],dy=this.y[j]-this.y[i],dz=this.z[j]-this.z[i],d2=dx*dx+dy*dy+dz*dz;
          if(d2>r*r||d2<1e-8||count>=28)return;count++;cx+=dx;cy+=dy;cz+=dz;vx+=this.vx[j];vy+=this.vy[j];vz+=this.vz[j];if(d2<.002){sx-=dx/(d2+.0001);sy-=dy/(d2+.0001);sz-=dz/(d2+.0001);}},false);
        if(count){ax[i]=p.cohesion*cx/count*2+p.alignment*(vx/count-this.vx[i])*2+p.separation*sx*.008;ay[i]=p.cohesion*cy/count*2+p.alignment*(vy/count-this.vy[i])*2+p.separation*sy*.008;az[i]=p.cohesion*cz/count*2+p.alignment*(vz/count-this.vz[i])*2+p.separation*sz*.008;}
        for(const key of ['x','y','z']){const off=this[key][i]-.5;const force=-off*Math.max(0,Math.abs(off)-.24)*5;if(key==='x')ax[i]+=force;else if(key==='y')ay[i]+=force;else az[i]+=force;}
        if(this.predator){const dx=this.x[i]-this.predator.x,dy=this.y[i]-this.predator.y,dz=this.z[i]-.5,d2=dx*dx+dy*dy+dz*dz;if(d2<.1){const f=p.fear*.02/(d2+.002);ax[i]+=dx*f;ay[i]+=dy*f;az[i]+=dz*f;}}
        for(const wall of this.walls){const dx=this.x[i]-wall.x,dy=this.y[i]-wall.y,dz=this.z[i]-.5,d=Math.hypot(dx,dy,dz);if(d<wall.r+.065){const f=(wall.r+.065-d)*18/Math.max(.005,d);ax[i]+=dx*f;ay[i]+=dy*f;az[i]+=dz*f;}}
      }
      for(let i=0;i<n;i++){this.vx[i]+=clamp(ax[i],-1,1)*dt;this.vy[i]+=clamp(ay[i],-1,1)*dt;this.vz[i]+=clamp(az[i],-1,1)*dt;const speed=Math.hypot(this.vx[i],this.vy[i],this.vz[i])||1;const scale=clamp(speed,.07,.17)/speed;this.vx[i]*=scale;this.vy[i]*=scale;this.vz[i]*=scale;this.x[i]=clamp(this.x[i]+this.vx[i]*dt,.03,.97);this.y[i]=clamp(this.y[i]+this.vy[i]*dt,.03,.97);this.z[i]=clamp(this.z[i]+this.vz[i]*dt,.03,.97);}
    }
    stepTrails(dt){
      const ant=this.id==='ants',p=this.p,n=this.size,speed=ant?.11:.075,turn=ant?1.1:.65,look=ant?.025:p.sensor/n;
      if(!ant){this.occupancy.fill(0);for(let i=0;i<this.n;i++)this.occupancy[this.cell(this.x[i],this.y[i])]++;}
      this.diffuse((ant?p.evaporation*.022:p.decay*.12)*dt*30,.17);
      if(!ant)for(const food of this.food){const cx=food.x*n|0,cy=food.y*n|0;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const k=((cy+dy+n)%n)*n+(cx+dx+n)%n;this.field[k]+=Math.exp(-(dx*dx+dy*dy)/9)*.8;}}
      for(let i=0;i<this.n;i++){
        let a=this.a[i],x=this.x[i],y=this.y[i];
        if(ant&&this.carry[i]){
          a+=angleDelta(Math.atan2(this.nest.y-y,this.nest.x-x)-a)*.18+(this.random()-.5)*.22;
          if(Math.hypot(x-this.nest.x,y-this.nest.y)<.025){this.carry[i]=0;this.delivered++;a+=Math.PI;}
          this.field[this.cell(x,y)]+=p.deposit*1.3;
        }else{
          const sample=aa=>this.sample(x+Math.cos(aa)*look,y+Math.sin(aa)*look),front=sample(a),left=sample(a-turn),right=sample(a+turn);
          const weight=ant?p.following:p.sensing;
          if(weight>0){if(front<Math.max(left,right))a+=(left>right?-1:left<right?1:(this.random()<.5?-1:1))*turn*.45*weight;else if(front<.01)a+=(this.random()-.5)*.6;}
          else a+=(this.random()-.5)*.5;
          if(ant){for(const food of this.food){if(food.amount>0&&Math.hypot(x-food.x,y-food.y)<.03){food.amount--;this.carry[i]=1;a+=Math.PI;break;}}}
          else this.field[this.cell(x,y)]+=.45;
        }
        let xx=x+Math.cos(a)*speed*dt,yy=y+Math.sin(a)*speed*dt;
        if(this.blocked(xx,yy)){a+=Math.PI*.55;xx=x;yy=y;}if(xx<.01||xx>.99){a=Math.PI-a;xx=clamp(xx,.012,.988);}if(yy<.01||yy>.99){a=-a;yy=clamp(yy,.012,.988);}
        if(!ant){const from=this.cell(x,y),to=this.cell(xx,yy);if(to!==from){if(this.occupancy[to]){xx=x;yy=y;a=this.random()*TAU;}else{this.occupancy[from]--;this.occupancy[to]++;}}}
        this.x[i]=xx;this.y[i]=yy;this.a[i]=a;this.vx[i]=Math.cos(a)*speed;this.vy[i]=Math.sin(a)*speed;
      }
    }
    stepFireflies(dt){
      this.grid.build(this);const p=this.p,next=F(this.n);
      for(let i=0;i<this.n;i++){let sum=0,count=0;this.grid.neighbors(this,i,p.radius,j=>{const dx=delta(this.x[j]-this.x[i]),dy=delta(this.y[j]-this.y[i]);if(dx*dx+dy*dy<p.radius*p.radius){sum+=Math.sin(this.phase[j]-this.phase[i]);count++;}});
        next[i]=wrap((this.phase[i]+dt*(TAU*.6+this.rate[i]*p.diversity+p.coupling*sum/Math.max(1,count)))/TAU)*TAU;}
      for(let i=0;i<this.n;i++){this.phase[i]=next[i];this.light[i]=Math.exp(-Math.pow(angleDelta(next[i])/.3,2));}
    }
    stepParticles(dt){
      const p=this.p,n=this.n,r=p.radius;this.grid.build(this);const ax=F(n),ay=F(n);
      for(let i=0;i<n;i++){let fx=0,fy=0;this.grid.neighbors(this,i,r,j=>{const dx=delta(this.x[j]-this.x[i]),dy=delta(this.y[j]-this.y[i]),d=Math.hypot(dx,dy);if(d<1e-5||d>=r)return;const q=d/r,beta=.23;const force=q<beta?(q/beta-1)*2:this.matrix[this.species[i]*4+this.species[j]]*p.strength*(1-Math.abs(2*q-1-beta)/(1-beta));fx+=dx/d*force;fy+=dy/d*force;});ax[i]=fx*.08;ay[i]=fy*.08;
        if(this.pointer){const dx=delta(this.pointer.x-this.x[i]),dy=delta(this.pointer.y-this.y[i]),d2=dx*dx+dy*dy;if(d2<.05){const f=this.pointer.sign*.03/(d2+.004);ax[i]+=dx*f;ay[i]+=dy*f;}}
      }
      const drag=Math.exp(-p.friction*dt);for(let i=0;i<n;i++){this.vx[i]=(this.vx[i]+ax[i]*dt)*drag;this.vy[i]=(this.vy[i]+ay[i]*dt)*drag;this.x[i]=wrap(this.x[i]+clamp(this.vx[i],-.35,.35)*dt);this.y[i]=wrap(this.y[i]+clamp(this.vy[i],-.35,.35)*dt);}
    }
    stepLenia(){
      const n=this.size,p=this.p;this.fr.set(this.field);this.fi.fill(0);fft2(this.fr,this.fi,n);
      for(let i=0;i<this.fr.length;i++){const r=this.fr[i],im=this.fi[i];this.fr[i]=r*this.kr[i]-im*this.ki[i];this.fi[i]=r*this.ki[i]+im*this.kr[i];}
      fft2(this.fr,this.fi,n,true);this.potential.set(this.fr);
      for(let i=0;i<this.field.length;i++){const q=(this.fr[i]-p.growth)/p.width,g=2*Math.exp(-q*q/2)-1;this.field[i]=clamp(this.field[i]+g*.1,0,1);}
    }
    stepCrowds(dt){
      const n=Math.round(this.n*this.p.density),p=this.p;this.grid.build(this);const ax=F(n),ay=F(n);
      for(let i=0;i<n;i++){
        let fx=((this.species[i]?-1:1)*p.pace-this.vx[i])*3,fy=-this.vy[i]*3;
        this.grid.neighbors(this,i,.045,j=>{if(j>=n)return;const dx=delta(this.x[i]-this.x[j]),dy=this.y[i]-this.y[j],d=Math.hypot(dx,dy);if(d<.045&&d>.0001){const f=Math.exp((.018-d)/.012)*p.avoidance*.045/d;fx+=dx*f;fy+=dy*f;}});
        for(const w of this.walls){const dx=this.x[i]-w.x,dy=this.y[i]-w.y,d=Math.hypot(dx,dy);if(d<w.r+.04){const f=Math.exp((w.r+.008-d)/.01)*.1/Math.max(.003,d);fx+=dx*f;fy+=dy*f;}}
        fy+=.00015/(Math.max(.02,this.y[i])**2)-.00015/(Math.max(.02,1-this.y[i])**2);ax[i]=clamp(fx,-1,1);ay[i]=clamp(fy,-1,1);
      }
      for(let i=0;i<n;i++){this.vx[i]+=ax[i]*dt;this.vy[i]+=ay[i]*dt;const xx=this.x[i]+clamp(this.vx[i],-.2,.2)*dt,yy=clamp(this.y[i]+clamp(this.vy[i],-.2,.2)*dt,.025,.975);if(this.blocked(wrap(xx),yy)){this.vx[i]*=-.15;this.vy[i]*=-.15;}else{this.x[i]=wrap(xx);this.y[i]=yy;}}
    }
    intervene(tool,x,y,r=.04){
      x=clamp(x,.015,.985);y=clamp(y,.015,.985);
      if(tool==='food'){const f=this.food.find(f=>Math.hypot(f.x-x,f.y-y)<.05);if(f)f.amount=Math.min(1000,f.amount+300);else if(this.food.length<24)this.food.push({x,y,amount:400});}
      if(tool==='wall'&&!this.walls.some(w=>Math.hypot(w.x-x,w.y-y)<.014)&&this.walls.length<180){this.walls.push({x,y,r:this.id==='boids'?.065:.017});if(this.id!=='boids')for(let i=0;i<this.n;i++)this.expel(i);this.rebuildWalls();}
      if(tool==='erase'){this.walls=this.walls.filter(w=>Math.hypot(w.x-x,w.y-y)>r+w.r);this.food=this.food.filter(f=>Math.hypot(f.x-x,f.y-y)>r);this.rebuildWalls();}
      if(tool==='cut'||(tool==='erase'&&this.id==='lenia')){const n=this.size;for(let yy=Math.max(0,(y-r)*n|0);yy<Math.min(n,(y+r)*n);yy++)for(let xx=Math.max(0,(x-r)*n|0);xx<Math.min(n,(x+r)*n);xx++)if(Math.hypot(xx/n-x,yy/n-y)<r)this.field[yy*n+xx]=0;}
      if(tool==='organism')this.placeOrbium(x,y,this.random()*4|0);
      if(tool==='predator')this.predator={x,y};
      if(tool==='pulse')for(let i=0;i<this.n;i++)if(Math.hypot(this.x[i]-x,this.y[i]-y)<.16)this.phase[i]=this.random()*TAU;
      if(tool==='scatter')for(let i=0;i<this.n;i++){const dx=this.x[i]-x,dy=this.y[i]-y,dz=this.z[i]-.5,d=Math.hypot(dx,dy,dz);if(d<.3){this.vx[i]+=dx*.9;this.vy[i]+=dy*.9;this.vz[i]+=dz*.9;}}
      if(tool==='inspect'){let best=Infinity;for(let i=0;i<this.n;i++){const d=Math.hypot(this.x[i]-x,this.y[i]-y);if(d<best){best=d;this.selected=i;}}if(this.id==='lenia')this.selected=this.cell(x,y);}
    }
    metric(){
      if(this.id==='ants')return [this.delivered+' food home',this.n.toLocaleString()+' ants'];
      if(this.id==='physarum')return [this.food.length+' food sources',this.n.toLocaleString()+' agents'];
      if(this.id==='fireflies'){let x=0,y=0;for(let i=0;i<this.n;i++){x+=Math.cos(this.phase[i]);y+=Math.sin(this.phase[i]);}return [Math.round(Math.hypot(x,y)/this.n*100)+'% in rhythm',this.n.toLocaleString()+' lights'];}
      if(this.id==='lenia'){let mass=0;for(const v of this.field)mass+=v;return [mass<1?'Extinct. Restart or place a swimmer.':Math.round(mass)+' living mass',this.size+' × '+this.size+' cells'];}
      if(this.id==='crowds'){let speed=0;const n=Math.round(this.n*this.p.density);for(let i=0;i<n;i++)speed+=(this.species[i]?-1:1)*this.vx[i];return [Math.round(clamp(speed/n/this.p.pace,0,1)*100)+'% free flow',n+' walkers'];}
      if(this.id==='boids'){let x=0,y=0,z=0;for(let i=0;i<this.n;i++){const d=Math.hypot(this.vx[i],this.vy[i],this.vz[i])||1;x+=this.vx[i]/d;y+=this.vy[i]/d;z+=this.vz[i]/d;}return [Math.round(Math.hypot(x,y,z)/this.n*100)+'% aligned',this.n.toLocaleString()+' birds'];}
      return ['4 interacting species',this.n.toLocaleString()+' particles'];
    }
  }
  const api={definitions,World,fft2,decodeOrbium,setOrbium:rle=>{orbium=decodeOrbium(rle);},clamp,delta};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GXEmergenceModels=api;
})(typeof window!=='undefined'?window:globalThis);
