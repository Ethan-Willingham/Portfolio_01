/* All Four Wheels: a shared high-angle isometric pixel renderer.
 * The simulation stays in store coordinates. Every visible floor point,
 * caster, body, piece of furniture and airborne product uses this camera.
 */
(function (root) {
  'use strict';
  const sourceURL=typeof document!=='undefined'?document.currentScript?.src:null;
  const TerrainModule=typeof module!=='undefined'&&module.exports?require('./four-wheels-terrain.js'):root.CartTerrain;
  // A roughly 52-degree pitch opens the basket and floor while retaining height.
  const CAMERA = Object.freeze({ width:720, height:580, x:290, y:24, horizontal:.84, vertical:.66, elevation:.74 });
  const VIEW_Z = CAMERA.vertical * 2 / CAMERA.elevation;
  const project = (p, origin = CAMERA) => ({ x:origin.x + (p.x-p.y)*CAMERA.horizontal, y:origin.y + (p.x+p.y)*CAMERA.vertical - (p.z||0)*CAMERA.elevation });
  function unproject(p, z=0, origin=CAMERA) {
    const difference=(p.x-origin.x)/CAMERA.horizontal, sum=(p.y-origin.y+z*CAMERA.elevation)/CAMERA.vertical;
    return {x:(sum+difference)/2,y:(sum-difference)/2,z};
  }
  const depth = p => p.x+p.y+(p.z||0)*VIEW_Z;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const add = (p,x=0,y=0,z=0) => ({x:p.x+x,y:p.y+y,z:(p.z||0)+z});
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)});
  const normalize = p => {const n=Math.hypot(p.x,p.y,p.z)||1;return {x:p.x/n,y:p.y/n,z:p.z/n};};
  function local(b,x,y,z=0) {
    if(b.comHeight)return TerrainModule.position(b,x,y,z);
    const c=Math.cos(b.a||0),s=Math.sin(b.a||0);
    if(b.pitch||b.rollTilt){const cp=Math.cos(b.pitch||0),sp=Math.sin(b.pitch||0),cr=Math.cos(b.rollTilt||0),sr=Math.sin(b.rollTilt||0),xx=x*cp+z*sp,zz=z*cp-x*sp;z=zz*cr+y*sr;y=y*cr-zz*sr;x=xx;}
    return {x:b.x+x*c-y*s,y:b.y+x*s+y*c,z:(b.z||0)+z};
  }
  function hash(x,y) {
    let v=Math.imul(x,73856093)^Math.imul(y,19349663);
    v=Math.imul(v^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
    return ((v^(v>>>16))>>>0)/4294967296;
  }
  function noise(x,y,size) {
    const ix=Math.floor(x/size),iy=Math.floor(y/size),u=x/size-ix,v=y/size-iy;
    const sx=u*u*(3-2*u),sy=v*v*(3-2*v);
    const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
    return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
  }
  function rect(g,x,y,w,h,color) {g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function poly(g,points,color) {
    if(points.length<3)return;
    const t=g.getTransform(),left=-t.e/t.a,right=(g.canvas.width-t.e)/t.a,top=-t.f/t.d,bottom=(g.canvas.height-t.f)/t.d;
    const low=Math.max(Math.floor(top),Math.floor(Math.min(...points.map(p=>p.y)))),high=Math.min(Math.ceil(bottom),Math.ceil(Math.max(...points.map(p=>p.y))));
    g.fillStyle=color;
    g.beginPath();
    for(let y=low;y<high;y++) {
      const cuts=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if((a.y<=y+.5&&b.y>y+.5)||(b.y<=y+.5&&a.y>y+.5))cuts.push(a.x+(y+.5-a.y)*(b.x-a.x)/(b.y-a.y));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i+=2) {
        const x=Math.max(Math.floor(left),Math.round(cuts[i])),end=Math.min(Math.ceil(right),Math.round(cuts[i+1]));
        if(end>x)g.rect(x,y,end-x,1);
      }
    }
    g.fill();
  }
  function polygonPath(points) {
    const path=new Path2D(),low=Math.floor(Math.min(...points.map(p=>p.y))),high=Math.ceil(Math.max(...points.map(p=>p.y)));
    for(let y=low;y<high;y++){
      const cuts=[];
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a.y<=y+.5&&b.y>y+.5)||(b.y<=y+.5&&a.y>y+.5))cuts.push(a.x+(y+.5-a.y)*(b.x-a.x)/(b.y-a.y));}
      cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i+=2){const x=Math.round(cuts[i]),end=Math.round(cuts[i+1]);if(end>x)path.rect(x,y,end-x,1);}
    }
    return path;
  }
  function line(g,a,b,color,width=1) {
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))));
    let row=Math.round(a.y),left=Math.round(a.x),right=left;
    g.fillStyle=color;
    const draw=()=>g.fillRect(left-Math.floor(width/2),row-Math.floor(width/2),right-left+width,width);
    for(let i=1;i<=n;i++) {
      const x=Math.round(a.x+(b.x-a.x)*i/n),y=Math.round(a.y+(b.y-a.y)*i/n);
      if(y!==row){draw();row=y;left=right=x;}else{left=Math.min(left,x);right=Math.max(right,x);}
    }
    draw();
  }
  function linePath(a,b,width) {
    const path=new Path2D(),n=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))));
    let row=Math.round(a.y),left=Math.round(a.x),right=left;
    const draw=()=>path.rect(left-Math.floor(width/2),row-Math.floor(width/2),right-left+width,width);
    for(let i=1;i<=n;i++){const x=Math.round(a.x+(b.x-a.x)*i/n),y=Math.round(a.y+(b.y-a.y)*i/n);if(y!==row){draw();row=y;left=right=x;}else{left=Math.min(left,x);right=Math.max(right,x);}}
    draw();return path;
  }
  function oval(g,x,y,rx,ry,color) {
    g.fillStyle=color;
    for(let yy=-Math.ceil(ry);yy<=ry;yy++) {
      const w=Math.round(rx*Math.sqrt(Math.max(0,1-yy*yy/(ry*ry))));
      if(w>0)g.fillRect(Math.round(x)-w,Math.round(y)+yy,w*2,1);
    }
  }
  function text(g,value,x,y,color,size=7,align='left') {
    g.fillStyle=color;g.font='bold '+size+'px "Commit Mono"';g.textAlign=align;g.fillText(value,Math.round(x),Math.round(y));
  }
  const circle = (p,rx,ry=rx,z=0,count=32) => Array.from({length:count},(_,i)=>add(p,Math.cos(i*Math.PI*2/count)*rx,Math.sin(i*Math.PI*2/count)*ry,z));
  const quad = (x,y,w,h,z=0) => [{x,y,z},{x:x+w,y,z},{x:x+w,y:y+h,z},{x,y:y+h,z}];
  function slopeMarkers(level) {
    const arrows=[],runs=[],routeArrows=level.legs.filter(l=>l.length>90).map(l=>({x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2}));let run=null;
    // Sample the same supporting height field along the forward route. A bump
    // and the empty jump gap are distinct obstacles, not sustained grades.
    for(const leg of level.legs){
      const count=Math.ceil(leg.length/12),step=leg.length/count,a=Math.atan2(leg.b.y-leg.a.y,leg.b.x-leg.a.x),c=Math.cos(a),s=Math.sin(a);
      for(let i=0;i<count;i++){
        const u=(i+.5)*step,p={x:leg.a.x+c*u,y:leg.a.y+s*u},d=Math.min(6,step/2),t=level.terrain,bump=TerrainModule.coordinates(p,t.bumps),inBumps=Math.abs(bump.v)<t.bumps.width/2&&bump.u>t.bumps.centers[0]-t.bumps.length/2&&bump.u<t.bumps.centers.at(-1)+t.bumps.length/2;
        const before={x:p.x-c*d,y:p.y-s*d},after={x:p.x+c*d,y:p.y+s*d},base={kind:leg.surface,grip:1,drag:1},low=TerrainModule.sample(level,before,base,false),high=TerrainModule.sample(level,after,base,false),grade=low&&high?(high.height-low.height)/(2*d):0,kind=!inBumps&&!TerrainModule.inStrip(p,t.ramp)&&Math.abs(grade)>=.035?(grade>0?'up':'down'):null;
        if(!kind){run=null;continue;}
        if(!run||run.kind!==kind){run={kind,samples:[]};runs.push(run);}
        run.samples.push({x:p.x,y:p.y,a,width:leg.width,shoulder:leg.shoulder,chapter:leg.chapter,distance:leg.distance+u,grade,kind});
      }
    }
    for(const run of runs){
      if(run.samples.length<3)continue;
      let next=run.samples[0].distance+18;
      for(const p of run.samples){
        if(p.distance<next||routeArrows.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<48))continue;
        arrows.push(p);next=p.distance+110;
      }
    }
    return {arrows};
  }
  const LOWER_GROUND=-100;
  const faces = [
    [[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,4,7,3],[-1,0,0]],
    [[1,2,6,5],[1,0,0]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]]
  ];
  function createMotionInterpolator(){
    let source=null,previous=null,result=null;
    const angles=new Set(['a','phase']),bodyFields=['x','y','z','a','pitch','rollTilt'],shopperFields=['x','y','z','leanX','leanY','crouch'],gaitFields=['phase','stride','forward','sideways','leanX','leanY'];
    function capture(w){
      if(source!==w){source=w;previous={body:{},wheels:w.wheels.map(()=>({})),gait:{},shopper:{},nodes:[]};result=Object.create(w);result.body={};result.wheels=w.wheels.map(()=>({}));result.gait={};result.shopper={};}
      previous.ragdoll=w.ragdoll;
      if(w.ragdoll)w.ragdoll.nodes.forEach((node,i)=>Object.assign(previous.nodes[i]||= {},node));
      Object.assign(previous.body,w.body);Object.assign(previous.gait,w.gait);Object.assign(previous.shopper,w.shopper);w.wheels.forEach((q,i)=>Object.assign(previous.wheels[i],q));
    }
    function mix(out,before,now,fields,t){Object.assign(out,now);for(const key of fields){if(!Number.isFinite(before[key])||!Number.isFinite(now[key]))continue;let d=now[key]-before[key];if(angles.has(key))d=Math.atan2(Math.sin(d),Math.cos(d));out[key]=before[key]+d*t;}}
    function sample(w,t){
      if(source!==w||Math.hypot(w.body.x-previous.body.x,w.body.y-previous.body.y)>60){capture(w);return w;}
      t=clamp(t,0,1);mix(result.body,previous.body,w.body,bodyFields,t);mix(result.gait,previous.gait,w.gait,gaitFields,t);mix(result.shopper,previous.shopper,w.shopper,shopperFields,t);
      w.wheels.forEach((q,i)=>mix(result.wheels[i],previous.wheels[i],q,['a','roll'],t));
      if(w.ragdoll&&previous.ragdoll===w.ragdoll){
        if(!result.ragdoll||result.ragdoll===w.ragdoll)result.ragdoll={nodes:w.ragdoll.nodes.map(()=>({}))};
        const nodes=result.ragdoll.nodes;Object.assign(result.ragdoll,w.ragdoll);result.ragdoll.nodes=nodes;
        w.ragdoll.nodes.forEach((node,i)=>mix(nodes[i]||= {},previous.nodes[i],node,['x','y','z'],t));
      }else result.ragdoll=w.ragdoll;
      const b=result.body,old=TerrainModule.attitude(previous.body),now=TerrainModule.attitude(w.body),sign=old.w*now.w+old.x*now.x+old.y*now.y+old.z*now.z<0?-1:1;
      let n=0;for(const key of ['w','x','y','z']){b['q'+key]=old[key]+(now[key]*sign-old[key])*t;n+=b['q'+key]**2;}n=Math.sqrt(n)||1;for(const key of ['w','x','y','z'])b['q'+key]/=n;
      b.tiltPitch=b.pitch;b.tiltRoll=b.rollTilt;return result;
    }
    return {capture,sample};
  }
  function exposedEdges(level,Course) {
    const edges=[],seen=new Set(),cross2=(a,b)=>a.x*b.y-a.y*b.x;
    // Split at polygon intersections before testing support. Fixed-length
    // midpoint tests leave holes where road ribbons overlap rounded joins.
    for(const area of level.floorAreas)for(let i=0;i<area.poly.length;i++){
      const p=area.poly[i],q=area.poly[(i+1)%area.poly.length],v={x:q.x-p.x,y:q.y-p.y},length=Math.hypot(v.x,v.y);
      if(length<1e-6)continue;
      const n={x:-v.y/length,y:v.x/length},cuts=[0,1],middle={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
      for(const other of Course.query(level.floorAreas,level.floorGrid,middle,length/2+1)){
        if(other===area||other.bounds.right<Math.min(p.x,q.x)-1e-6||other.bounds.left>Math.max(p.x,q.x)+1e-6||other.bounds.bottom<Math.min(p.y,q.y)-1e-6||other.bounds.top>Math.max(p.y,q.y)+1e-6)continue;
        for(let j=0;j<other.poly.length;j++){
          const a=other.poly[j],b=other.poly[(j+1)%other.poly.length],u={x:b.x-a.x,y:b.y-a.y},r={x:a.x-p.x,y:a.y-p.y},denominator=cross2(v,u);
          if(Math.abs(denominator)>1e-8){
            const t=cross2(r,u)/denominator,s=cross2(r,v)/denominator;
            if(t>0&&t<1&&s>=-1e-8&&s<=1+1e-8)cuts.push(t);
          }else if(Math.abs(cross2(r,v))<1e-6){
            for(const point of [a,b]){const t=((point.x-p.x)*v.x+(point.y-p.y)*v.y)/(length*length);if(t>0&&t<1)cuts.push(t);}
          }
        }
      }
      cuts.sort((a,b)=>a-b);
      for(let j=1;j<cuts.length;j++){
        const low=cuts[j-1],high=cuts[j];if((high-low)*length<1e-5)continue;
        const t=(low+high)/2,mid={x:p.x+v.x*t,y:p.y+v.y*t},epsilon=Math.min(1e-4,(high-low)*length*.1);
        const plus=Course.sample(level,{x:mid.x+n.x*epsilon,y:mid.y+n.y*epsilon},false),minus=Course.sample(level,{x:mid.x-n.x*epsilon,y:mid.y-n.y*epsilon},false);
        if(!!plus===!!minus)continue;
        const normal={x:n.x*(plus?-1:1),y:n.y*(plus?-1:1)},kind=(plus||minus).kind,count=Math.ceil((high-low)*length/12);
        for(let k=0;k<count;k++){
          const point=f=>{const x=p.x+v.x*f,y=p.y+v.y*f;return {x,y,z:TerrainModule.height(level,{x,y})};};
          const a=point(low+(high-low)*k/count),b=point(low+(high-low)*(k+1)/count);
          const key=[a,b].map(p=>Math.round(p.x*1e5)+','+Math.round(p.y*1e5)).sort().join('/');
          if(seen.has(key))continue;seen.add(key);edges.push({a,b,normal,kind});
        }
      }
    }
    return edges;
  }
  function create(P,options={}) {
    const Physics=root.CartPhysics,Stock=root.CartStock,Terrain=TerrainModule;
    let terrainLevel=null;
    const onGround=p=>({...p,z:terrainLevel?Terrain.height(terrainLevel,p):(p.z||0),surface:!!terrainLevel});
    if(!Physics||!Stock)throw new Error('The cart view needs the cart simulation.');
    const {BODY,WHEELS,CASTER,CHECKPOINT_RADIUS,casterPose,casterCorners,corners,ROOM}=Physics;
    const swatches=[P.coral,P.blue,P.gold,P.sage,P.clay,P.purple];
    const colors=new Map(),tints=new Map(),textures=new Map(),treeSprites=new Map(),models=new WeakMap(),spillPaths=new WeakMap();let cacheEpoch=0,colorContext,raster;
    let sceneryWorker=null,workerFailed=false,workerBackground=null,workerGeneration=0,workerJob=null;
    const sceneryJobs=new Map();
    const trimTiles=(cache,limit)=>{while(cache.size>limit){const key=cache.keys().next().value;cache.get(key).canvas?.close?.();cache.delete(key);}};
    function failWorker(){sceneryWorker?.terminate();sceneryWorker=null;workerFailed=true;workerJob=null;sceneryJobs.clear();options.onSceneryReady?.();}
    function startScenery(background,level){
      if(!background.async||workerFailed||!sourceURL||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return false;
      try{
        if(!sceneryWorker){
          const url=new URL('four-wheels-scenery-worker.js',sourceURL);url.search=new URL(sourceURL).search;
          sceneryWorker=new Worker(url);sceneryWorker.onerror=event=>{event.preventDefault();failWorker();};
          sceneryWorker.onmessage=({data})=>{
            if(data.generation!==workerGeneration){data.bitmap?.close();return;}
            if(data.error){failWorker();return;}
            workerJob=null;
            const cache=data.kind==='floor'?workerBackground.tiles:workerBackground.rocks,tile=cache.get(data.key);
            if(tile){tile.canvas?.close?.();tile.canvas=data.bitmap;tile.ready=true;}else data.bitmap.close();
            pumpScenery();options.onSceneryReady?.();
          };
        }
        if(workerBackground!==background){workerBackground=background;workerGeneration++;workerJob=null;sceneryJobs.clear();sceneryWorker.postMessage({kind:'init',generation:workerGeneration,level,palette:P});}
        sceneryJobs.clear();return true;
      }catch{failWorker();return false;}
    }
    function queueScenery(kind,key,x,y){const id=kind+':'+key;if(workerJob!==id)sceneryJobs.set(id,{kind,key,x,y,generation:workerGeneration});}
    function pumpScenery(){if(workerJob||!sceneryWorker||!sceneryJobs.size)return;const [id,job]=sceneryJobs.entries().next().value;sceneryJobs.delete(id);workerJob=id;sceneryWorker.postMessage(job);}
    function rgb(color) {
      if(!colors.has(color)) {
        // Palette hex and our generated rgb tints need no GPU readback. Keep
        // one software canvas for other CSS colors rather than one per tint.
        const hex=/^#([\da-f]{6}|[\da-f]{3})$/i.exec(color),decimal=/^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
        if(hex){const value=hex[1].length===3?hex[1].split('').map(v=>v+v).join(''):hex[1],n=parseInt(value,16);colors.set(color,[n>>16,(n>>8)&255,n&255]);}
        else if(decimal)colors.set(color,decimal.slice(1).map(Number));
        else{
          if(!colorContext){const c=document.createElement('canvas');c.width=c.height=1;colorContext=c.getContext('2d',{willReadFrequently:true});}
          colorContext.clearRect(0,0,1,1);colorContext.fillStyle=color;colorContext.fillRect(0,0,1,1);colors.set(color,[...colorContext.getImageData(0,0,1,1).data].slice(0,3));
        }
      }
      return colors.get(color);
    }
    function blend(a,b,t) {
      // A cache bucket always has the same color, regardless of which tile or
      // thread reaches it first. This also prevents seams after worker uploads.
      t=Math.round(t*64)/64;
      const key=a+'|'+b+'|'+t;
      if(!tints.has(key)){const x=rgb(a),y=rgb(b);tints.set(key,'rgb('+x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(',')+')');}
      return tints.get(key);
    }
    function shade(color,n) {
      const light=clamp(-n.x*.35-n.y*.45+n.z*.82,0,1);
      return blend(color,P.dark,.1+(1-light)*.32);
    }
    const spillColor = kind => kind==='wine'?P.purple:kind==='ketchup'?P.brick:kind==='oil'?P.gold:kind==='soil'?P.hairDark:P.blue;
    function labelTexture(value,width,height=7) {
      const key=value+'|'+width+'|'+height;
      if(!textures.has(key)) {
        const c=document.createElement('canvas');c.width=Math.ceil(width);c.height=height;
        const g=c.getContext('2d');rect(g,0,0,c.width,height,P.cream);
        text(g,value,c.width/2,height-2,P.hairDark,Math.min(6,c.width/Math.max(1,value.length)*1.55),'center');textures.set(key,c);
      }
      return textures.get(key);
    }
    class Scene {
      constructor(opacity=1,cached=false){this.commands=[];this.sequence=0;this.opacity=opacity;this.cached=cached;this.grid=null;}
      push(points,draw,bias=0,mesh=null) {
        const q=this.cached?points.map(p=>project(p)):null;
        this.commands.push({depth:points.reduce((n,p)=>n+depth(p),0)/points.length+bias,order:this.sequence++,draw,mesh,bounds:q?{left:Math.min(...q.map(p=>p.x))-4,right:Math.max(...q.map(p=>p.x))+4,top:Math.min(...q.map(p=>p.y))-4,bottom:Math.max(...q.map(p=>p.y))+4}:null});
      }
      face(points,color,alpha=1,detail=null,edges=false) {
        alpha*=this.opacity;
        const n=normalize(cross(subtract(points[1],points[0]),subtract(points[2],points[0])));
        if(n.x+n.y+n.z*VIEW_Z<=.005)return;
        const tint=shade(color,n);
        const cached=this.cached?points.map(p=>project(p)):null;let path,edgePaths;
        this.push(points,(g,origin)=>{
          g.globalAlpha=alpha;const q=cached||points.map(p=>project(p,origin));
          if(cached){path||=polygonPath(q);g.fillStyle=tint;g.fill(path);}else poly(g,q,tint);
          if(edges){g.globalAlpha=alpha*.3;const color=n.z>.6?P.cream:P.dark;if(cached){edgePaths||=q.map((p,i)=>linePath(p,q[(i+1)%q.length],1));g.fillStyle=color;for(const edge of edgePaths)g.fill(edge);}else for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],color);}
          g.globalAlpha=1;if(detail)detail(g,q,origin);
        },0,{kind:'face',points,color:tint,alpha});
      }
      flat(points,color,alpha=1,bias=0) {
        alpha*=this.opacity;
        const cached=this.cached?points.map(p=>project(p)):null;let path;
        this.push(points,(g,origin)=>{g.globalAlpha=alpha;if(cached){path||=polygonPath(cached);g.fillStyle=color;g.fill(path);}else poly(g,points.map(p=>project(p,origin)),color);g.globalAlpha=1;},bias,{kind:'face',points,color,alpha});
      }
      wire(a,b,color=P.steel,width=1,alpha=1) {
        if(this.rigid&&width>=2){this.tube(a,b,width*.48,width*.48,color);return;}
        alpha*=this.opacity;
        const cached=this.cached;let path;
        this.push([a,b],(g,origin)=>{g.globalAlpha=alpha;if(cached){path||=linePath(project(a),project(b),width);g.fillStyle=color;g.fill(path);}else line(g,project(a,origin),project(b,origin),color,width);g.globalAlpha=1;},.04,{kind:'wire',points:[a,b],color,width,alpha});
      }
      box(transform,x,y,z,w,h,d,color,top=color,edges=false) {
        const p=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]].map(v=>transform(...v));
        for(let i=0;i<faces.length;i++)this.face(faces[i][0].map(j=>p[j]),i===1?top:color,1,null,edges);
      }
      texture(points,texture) {
        this.face(points,P.cream,1,(g,q)=>{
          const a=q[0],b=q[1],d=q[3];g.save();g.imageSmoothingEnabled=false;
          g.transform((b.x-a.x)/texture.width,(b.y-a.y)/texture.width,(d.x-a.x)/texture.height,(d.y-a.y)/texture.height,a.x,a.y);
          g.drawImage(texture,0,0);g.restore();
        });
      }
      tube(a,b,width,endWidth,color,count=6) {
        const axis=normalize(subtract(b,a)),ref=Math.abs(axis.z)<.8?{x:0,y:0,z:1}:{x:1,y:0,z:0},u=normalize(cross(axis,ref)),v=cross(axis,u);
        const ring=(p,r)=>Array.from({length:count},(_,i)=>{const t=i*Math.PI*2/count;return add(p,r*(u.x*Math.cos(t)+v.x*Math.sin(t)),r*(u.y*Math.cos(t)+v.y*Math.sin(t)),r*(u.z*Math.cos(t)+v.z*Math.sin(t)));});
        const first=ring(a,width),last=ring(b,endWidth);
        for(let i=0;i<count;i++)this.face([first[i],first[(i+1)%count],last[(i+1)%count],last[i]],color);
        this.face(first.slice().reverse(),color);this.face(last,color);
      }
      limb(a,b,width,endWidth,color) {this.tube(a,b,width/2,endWidth/2,color,7);}
      // A small object raster has a real per-pixel depth buffer. Rim tubes,
      // tires, spokes, legs and the wire basket occlude each other at their
      // actual 3D depth, even when the whole cart is sideways or upside down.
      rasterInto(scene) {
        const commands=this.commands.filter(q=>q.mesh),points=commands.flatMap(q=>q.mesh.points),screen=points.map(p=>project(p));
        const x=Math.floor(Math.min(...screen.map(p=>p.x)))-3,y=Math.floor(Math.min(...screen.map(p=>p.y)))-3,width=Math.ceil(Math.max(...screen.map(p=>p.x)))-x+4,height=Math.ceil(Math.max(...screen.map(p=>p.y)))-y+4;
        if(width>400||height>400)return this.commands.forEach(q=>scene.commands.push(q));
        // Rasterize when this command is painted, then reuse the same surface
        // and buffers. Each Scene still owns its geometry and can be redrawn.
        scene.push(points,(target,origin)=>{
          if(!raster||raster.tile.width<width||raster.tile.height<height){
            const tile=document.createElement('canvas');tile.width=2**Math.ceil(Math.log2(Math.max(64,width,raster?.tile.width||0)));tile.height=2**Math.ceil(Math.log2(Math.max(64,height,raster?.tile.height||0)));
            const g=tile.getContext('2d');raster={tile,g,im:g.createImageData(tile.width,tile.height),zbuffer:new Float32Array(tile.width*tile.height)};
          }
          const {tile,g,im,zbuffer}=raster,stride=tile.width,data=im.data;data.fill(0);zbuffer.fill(-Infinity);
          const pixel=(px,py,z,c,alpha,write)=>{if(px<0||py<0||px>=width||py>=height)return;const key=py*stride+px;if(z<zbuffer[key]-.045)return;const k=key*4;
            if(alpha===1){data[k]=c[0];data[k+1]=c[1];data[k+2]=c[2];data[k+3]=255;}
            else{const a=data[k+3]/255,out=alpha+a*(1-alpha);for(let j=0;j<3;j++)data[k+j]=(c[j]*alpha+data[k+j]*a*(1-alpha))/out;data[k+3]=out*255;}
            if(write)zbuffer[key]=z;
          };
          const vertex=p=>({x:CAMERA.x+(p.x-p.y)*CAMERA.horizontal,y:CAMERA.y+(p.x+p.y)*CAMERA.vertical-(p.z||0)*CAMERA.elevation,d:depth(p)});
          const triangle=(a,b,c,color,alpha,write)=>{const denominator=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(denominator)<.001)return;
            const left=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)-x)),right=Math.min(width-1,Math.ceil(Math.max(a.x,b.x,c.x)-x)),top=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)-y)),bottom=Math.min(height-1,Math.ceil(Math.max(a.y,b.y,c.y)-y));
            const ux=(b.y-c.y)/denominator,vx=(c.y-a.y)/denominator,tx=-ux-vx;
            // Clip each scanline to the three barycentric half planes. Thin
            // basket tubes no longer test every pixel in their bounding box.
            for(let py=top;py<=bottom;py++){
              const X=x+.5,Y=y+py+.5,u=((b.y-c.y)*(X-c.x)+(c.x-b.x)*(Y-c.y))/denominator,v=((c.y-a.y)*(X-c.x)+(a.x-c.x)*(Y-c.y))/denominator,t=1-u-v;
              let low=left,high=right;
              if(ux>0)low=Math.max(low,Math.ceil((-1e-7-u)/ux));else if(ux<0)high=Math.min(high,Math.floor((-1e-7-u)/ux));else if(u< -1e-7)continue;
              if(vx>0)low=Math.max(low,Math.ceil((-1e-7-v)/vx));else if(vx<0)high=Math.min(high,Math.floor((-1e-7-v)/vx));else if(v< -1e-7)continue;
              if(tx>0)low=Math.max(low,Math.ceil((-1e-7-t)/tx));else if(tx<0)high=Math.min(high,Math.floor((-1e-7-t)/tx));else if(t< -1e-7)continue;
              for(let px=low;px<=high;px++){const U=u+ux*px,V=v+vx*px;pixel(px,py,U*a.d+V*b.d+(1-U-V)*c.d,color,alpha,write);}
            }
          };
          const paint=(q,write)=>{const m=q.mesh,v=m.points.map(vertex),color=rgb(m.color);if(m.kind==='face'){for(let i=1;i<v.length-1;i++)triangle(v[0],v[i],v[i+1],color,m.alpha,write);}else{const a=v[0],b=v[1],steps=Math.max(1,Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))));for(let i=0;i<=steps;i++){const t=i/steps;pixel(Math.round(a.x+(b.x-a.x)*t-x),Math.round(a.y+(b.y-a.y)*t-y),a.d+(b.d-a.d)*t,color,m.alpha,write);}}};
          for(const q of commands)if(q.mesh.alpha>=.99)paint(q,true);
          commands.sort((a,b)=>a.depth-b.depth);for(const q of commands)if(q.mesh.alpha<.99)paint(q,false);
          g.putImageData(im,0,0);target.drawImage(tile,0,0,width,height,x+(origin.x-CAMERA.x),y+(origin.y-CAMERA.y),width,height);
        });
      }
      flush(g,origin=CAMERA,rasters=null) {
        this.commands.sort((a,b)=>a.depth-b.depth||a.order-b.order);
        const transform=rasters?g.getTransform():null,signature=rasters?[cacheEpoch,transform.a,transform.d,transform.e,transform.f,g.canvas.width,g.canvas.height].join('|'):null;
        for(let i=0;i<this.commands.length;i++){
          const command=this.commands[i];
          if(!rasters||!command.original){command.draw(g,origin);continue;}
          let end=i+1;while(end<this.commands.length&&this.commands[end].original)end++;
          const last=this.commands[end-1].original;let cached=rasters.get(command.original);
          if(!cached||cached.last!==last||cached.count!==end-i||cached.signature!==signature||cached.originals.some((q,j)=>q!==this.commands[i+j].original)){
            let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
            for(let j=i;j<end;j++){const b=this.commands[j].bounds;left=Math.min(left,b.left);right=Math.max(right,b.right);top=Math.min(top,b.top);bottom=Math.max(bottom,b.bottom);}
            const x=Math.max(0,Math.floor(transform.e+left*transform.a)),y=Math.max(0,Math.floor(transform.f+top*transform.d)),w=Math.max(0,Math.min(g.canvas.width,Math.ceil(transform.e+right*transform.a))-x),h=Math.max(0,Math.min(g.canvas.height,Math.ceil(transform.f+bottom*transform.d))-y);
            let tile=null;
            if(w&&h){tile=document.createElement('canvas');tile.width=w;tile.height=h;const target=tile.getContext('2d');target.imageSmoothingEnabled=false;target.setTransform(transform.a,0,0,transform.d,transform.e-x,transform.f-y);for(let j=i;j<end;j++)this.commands[j].draw(target,origin);}
            rasters.pixels=(rasters.pixels||0)-(cached?.tile?cached.tile.width*cached.tile.height:0)+(tile?tile.width*tile.height:0);
            cached={tile,x,y,last,count:end-i,signature,originals:this.commands.slice(i,end).map(q=>q.original)};rasters.set(command.original,cached);
          }
          // Cache only consecutive commands in the sorted scene. Moving doors,
          // the cart and particles retain their exact place between these runs.
          if(cached.tile){g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.drawImage(cached.tile,cached.x,cached.y);g.restore();}
          rasters.delete(command.original);rasters.set(command.original,cached);
          while(rasters.size>96||rasters.pixels>4*1024*1024){const key=rasters.keys().next().value,old=rasters.get(key);rasters.pixels-=old.tile?old.tile.width*old.tile.height:0;rasters.delete(key);}i=end-1;
        }
        g.globalAlpha=1;
      }
      visibleCommands({left,top,right,bottom}) {
        const size=128;
        if(!this.grid){
          this.grid=new Map();
          for(const command of this.commands){const b=command.bounds;
            for(let y=Math.floor(b.top/size);y<=Math.floor(b.bottom/size);y++)for(let x=Math.floor(b.left/size);x<=Math.floor(b.right/size);x++){
              const key=x+','+y,bin=this.grid.get(key)||[];bin.push(command);this.grid.set(key,bin);
            }
          }
        }
        const visible=new Set();
        for(let y=Math.floor(top/size);y<=Math.floor(bottom/size);y++)for(let x=Math.floor(left/size);x<=Math.floor(right/size);x++)for(const command of this.grid.get(x+','+y)||[]){
          const b=command.bounds;if(b.right>=left&&b.left<=right&&b.bottom>=top&&b.top<=bottom)visible.add(command);
        }
        return visible;
      }
    }
    const shelfFields=['cx','cy','a','tilt','nx','ny','w','h','height','kind','theme','label'];
    const productFields=['x','y','z','a','u','v','tier','state','kind','flat','length','width','tumble','pitch','rollTilt','material','source','color'];
    function cachedModel(scene,object,fields,build,extra=[]) {
      const values=[cacheEpoch,...fields.map(k=>object[k]),...extra],old=models.get(object);
      let model=old?.scene;
      if(!old||values.length!==old.values.length||values.some((v,i)=>v!==old.values[i])){model=new Scene(1,true);build(model,object);models.set(object,{values,scene:model});}
      for(const command of model.commands)scene.commands.push({...command,original:command,order:scene.sequence++});
    }
    function groundPoly(g,points,color,alpha=1) {
      g.globalAlpha=alpha;poly(g,points.map(p=>project(p)),color);g.globalAlpha=1;
    }
    function groundLine(g,a,b,color,width=1,alpha=1) {
      g.globalAlpha=alpha;line(g,project(terrainLevel&&a.z===undefined?onGround(a):a),project(terrainLevel&&b.z===undefined?onGround(b):b),color,width);g.globalAlpha=1;
    }
    function groundLocal(g,b,x,y,w,h,color,alpha=1) {groundPoly(g,quad(x,y,w,h).map(p=>local(b,p.x,p.y)).map(p=>b.surface?onGround(p):p),color,alpha);}
    function groundRing(g,p,r,color,width=1,alpha=1) {
      const q=circle(p,r).map(v=>project(p.surface?onGround(v):v));g.globalAlpha=alpha;
      for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],color,width);g.globalAlpha=1;
    }
    function groundArrow(g,b,length,color,alpha=1) {
      groundLocal(g,b,-length/2,-1.2,length-5,2.4,color,alpha);
      groundPoly(g,[[length/2,0],[length/2-8,-5],[length/2-8,5]].map(p=>local(b,...p)).map(p=>b.surface?onGround(p):p),color,alpha);
    }
    function floorTexture(g,level) {
      const accent=P[level.theme]||P.gold,base=blend(accent,P.cream,.36),grout=blend(accent,P.hairDark,.28);
      groundPoly(g,quad(8,8,464,284),grout);
      // Deterministic terrazzo, laid in the same plane as the physical floor.
      for(let row=0,y=8;y<292;row++,y+=24)for(let col=0,x=8;x<472;col++,x+=24) {
        const seed=col*137+row*911,v=hash(seed,41),w=Math.min(23,472-x),h=Math.min(23,292-y);
        const tint=blend(base,v>.58?P.light:accent,.08+v*.12);
        groundPoly(g,quad(x+.7,y+.7,w-1,h-1),tint);
        groundLine(g,{x:x+1,y:y+1},{x:x+w-1,y:y+1},P.light,1,.35);
        groundLine(g,{x:x+1,y:y+1},{x:x+1,y:y+h-1},P.light,1,.25);
        groundLine(g,{x:x+w,y:y+1},{x:x+w,y:y+h},P.edge,1,.12);
        for(let chip=0;chip<10;chip++) {
          const cx=x+2+hash(seed+chip*47,83)*(w-4),cy=y+2+hash(seed+chip*59,137)*(h-4),q=hash(seed+chip*71,193);
          const p=project({x:cx,y:cy});g.globalAlpha=q>.8?.28:.18;
          rect(g,p.x,p.y,q>.72?2:1,1,chip%3===0?P.hairDark:chip%3===1?P.light:P.gold);
        }
        g.globalAlpha=1;
        if(v>.82&&w>12&&h>12)groundLine(g,{x:x+5,y:y+9},{x:x+11,y:y+7},P.hairDark,1,.17);
      }
      // Wall ambient shade, baked into the floor rather than painted on props.
      for(let i=0;i<6;i++) {
        groundPoly(g,quad(8+i,8,1,284),P.hairDark,(6-i)*.018);
        groundPoly(g,quad(8,8+i,464,1),P.hairDark,(6-i)*.018);
      }
      if(level.puddle) {
        const p=level.puddle;groundPoly(g,circle(p,p.rx+2,p.ry+2),P.dark,.12);
        groundPoly(g,circle(p,p.rx,p.ry),P.blue,.34);
        for(let i=0;i<10;i++) {
          const x=p.x+(hash(i,1)-.5)*p.rx*1.4,y=p.y+(hash(i,3)-.5)*p.ry*1.2;
          groundLine(g,{x,y},{x:x+8,y:y-3},P.light,1,.55);
        }
      }
      groundArrow(g,level.start,28,P.light,.55);
    }
    function exitApron(g,e) {
      groundLocal(g,e,-5,-e.width/2,64,e.width,blend(P.floor,P.cream,.25));
      for(let u=8;u<60;u+=12)groundLocal(g,e,u,-e.width/2,1,e.width,P.seam,.5);
      groundLocal(g,e,3,-e.width/2,2,e.width,P.steelShade);
      groundLocal(g,e,5,-e.width/2,1,e.width,P.light);
    }
    function wallRuns(level,side) {
      const end=side==='left'||side==='right'?292:472,exit=Physics.exitGeometry(level.exit);
      const gaps=level.openings?.[side]||[...(exit.side===side?[[exit.low,exit.high]]:[]),...(level.cliffs||[]).filter(c=>c.side===side).map(c=>[c.low,c.high])];
      const runs=[];let cursor=8;
      for(const [a,b]of [...gaps].sort((a,b)=>a[0]-b[0])){if(a>cursor)runs.push([cursor,a]);cursor=Math.max(cursor,b);}
      if(cursor<end)runs.push([cursor,end]);return runs;
    }
    function hazards(g,level) {
      for(const h of level.hazards||[]) {
        const bank=blend(P.pine,P.hairDark,.22),deep=blend(P.blue,P.dark,.36);
        groundPoly(g,circle(h,h.rx+4,h.ry+4),bank);
        groundPoly(g,circle(h,h.rx+1,h.ry+1),P.steelShade);
        groundPoly(g,circle(h,h.rx,h.ry,-7),deep);
        groundPoly(g,circle(h,h.rx-3,h.ry-3,-6),P.blue);
        groundPoly(g,circle(add(h,7,4),h.rx*.68,h.ry*.62,-6),blend(P.blue,P.pine,.24));
        groundRing(g,h,1,P.blue);
        for(let i=0;i<25;i++) {
          const x=h.x+(hash(i,831)-.5)*h.rx*1.7,y=h.y+(hash(i,191)-.5)*h.ry*1.5;
          if(((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2>.75)continue;
          groundLine(g,{x,y,z:-6},{x:x+5+i%5,y:y-2,z:-6},i%3?P.light:deep,1,.55);
        }
        for(let i=0;i<12;i++) {
          const a=i*Math.PI*2/12,q={x:h.x+Math.cos(a)*(h.rx+5),y:h.y+Math.sin(a)*(h.ry+5)};
          groundPoly(g,circle(q,2.4,1.9),i%3?P.sage:P.clay);
          if(i%3===0)for(const v of [-1,1])groundLine(g,{...q},{x:q.x+v*2,y:q.y,z:7},P.pine,1);
        }
        const q=project({...h,z:-6});text(g,'DEEP WATER',q.x,q.y+4,deep,6,'center');
      }
      for(const c of level.cliffs||[]) {
        const vertical=c.side==='left'||c.side==='right',axis=vertical?(c.side==='left'?8:472):(c.side==='top'?8:292);
        const a=vertical?{x:axis,y:c.low}:{x:c.low,y:axis},b=vertical?{x:axis,y:c.high}:{x:c.high,y:axis};
        for(let z=-32;z<0;z+=7)groundLine(g,{...a,z},{...b,z},z%2?P.hair:blend(P.clay,P.hairDark,.4),3);
        for(let u=c.low;u<c.high;u+=10) {
          const x=vertical?axis+(c.side==='left'?1:-7):u,y=vertical?u:axis+(c.side==='top'?1:-7);
          groundPoly(g,quad(x,y,vertical?6:9,vertical?9:6),Math.floor(u/10)%2?P.gold:P.hairDark);
        }
        const q=project(vertical?{x:axis-15,y:(c.low+c.high)/2}:{x:(c.low+c.high)/2,y:axis-15});text(g,'DROP',q.x,q.y,P.hairDark,6,'center');
      }
    }
    function room(scene,level) {
      const tr=(x,y,z)=>({x,y,z});
      const exit=Physics.exitGeometry(level.exit),front=blend(P.floor,P.hairDark,.37);
      scene.box(tr,8,8,-32,464,284,32,front,P[level.theme]||P.floor,true);
      for(const side of ['top','left','right','bottom']) {
        const vertical=side==='left'||side==='right',far=side==='top'||side==='left',height=far?23:2;
        const start=vertical?8:8,end=vertical?292:472;
        const runs=wallRuns(level,side);
        for(const [a,b]of runs) {
          if(b<=a)continue;
          const x=vertical?(side==='left'?5:472):a,y=vertical?a:(side==='top'?5:292),w=vertical?3:b-a,h=vertical?b-a:3;
          scene.box(tr,x,y,0,w,h,height,blend(P[level.theme]||P.floor,P.hairDark,.18),P[level.theme]||P.cream,true);
          scene.box(tr,x,y,0,w,h,2,P.steelShade,P.steel);
          if(far)scene.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.38),P.cream);
        }
      }
    }
    function makeFloor(level,transparent=false,async=false) {
      if(level.campaign)return {course:true,async,tiles:new Map(),rocks:new Map(),floorPresence:new Map()};
      if(level.connected)return {rooms:level.rooms.map(r=>({room:r,canvas:makeFloor(r,true)}))};
      const c=document.createElement('canvas');c.width=CAMERA.width;c.height=CAMERA.height;const g=c.getContext('2d');
      const matte=blend(P.hairDark,P.edge,.48);if(!transparent)rect(g,0,0,c.width,c.height,matte);
      // A broad contact shadow makes the cutaway store feel like a solid diorama.
      groundPoly(g,quad(8,8,464,284,-11),P.dark,.3);
      const shell=new Scene();room(shell,level);shell.flush(g);
      floorTexture(g,level);hazards(g,level);if(!level.openings)exitApron(g,Physics.exitGeometry(level.exit));
      // Render far walls after the tiles, so their feet meet the grout cleanly.
      const walls=new Scene();
      const exit=Physics.exitGeometry(level.exit),tr=(x,y,z)=>({x,y,z});
      for(const side of ['top','left']) {
        const vertical=side==='left',end=vertical?292:472,runs=wallRuns(level,side);
        for(const [a,b]of runs) {
          const x=vertical?5:a,y=vertical?a:5,w=vertical?3:b-a,h=vertical?b-a:3;
          if(w<=0||h<=0)continue;
          walls.box(tr,x,y,0,w,h,23,blend(P[level.theme]||P.floor,P.hairDark,.2),P[level.theme]||P.cream,true);walls.box(tr,x,y,0,w,h,3,P.steelShade,P.steel);
          walls.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.35),P.cream);
        }
      }
      walls.flush(g);
      for(const sign of level.signs) {
        const p=project(sign);text(g,sign.text,p.x,p.y,P.edge,5,'center');
      }
      const badge=project({x:235,y:30});text(g,level.name.toUpperCase(),badge.x,badge.y,P.hairDark,7,'center');
      return c;
    }
    function furnitureVertices(s) {
      return [[-s.w/2,-s.h/2],[s.w/2,-s.h/2],[s.w/2,s.h/2],[-s.w/2,s.h/2]].flatMap(([u,v])=>[Stock.shelfPoint(s,u,v,0),Stock.shelfPoint(s,u,v,s.height)]);
    }
    function clipFloor(g,w) {
      g.beginPath();
      const areas=w?.level.campaign?root.CartCourse.query(w.level.floorAreas,w.level.floorGrid,w.body,600):w?.level.floorAreas||[{x:8,y:8,w:464,h:284}];
      for(const area of areas){const p=(area.poly||quad(area.x,area.y,area.w,area.h)).map(v=>project(v));g.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))g.lineTo(q.x,q.y);g.closePath();}
      g.clip();
    }
    function drawFurnitureShadow(g,s,w) {
      g.save();if(!w?._shadowClipped)clipFloor(g,w);
      const points=Stock.hull(furnitureVertices(s).map(p=>({x:p.x+p.z*.42,y:p.y+p.z*.3,z:0})));
      groundPoly(g,points.map(p=>add(p,2,2)),P.dark,.07);groundPoly(g,points,P.dark,.2);g.restore();
    }
    function shelf(scene,s) {
      const tr=(x,y,z)=>Stock.shelfPoint(s,x,y,z),box=(...args)=>scene.box(tr,...args),accent=P[s.theme]||P.gold;
      if(s.kind==='table') {
        for(const u of [-s.w*.4,s.w*.4])for(const v of [-s.h*.4,s.h*.4])box(u-1.5,v-1.5,0,3,3,s.height-3,P.clay,P.gold,true);
        box(-s.w/2+1,-s.h/2+2,s.height-7,s.w-2,2,4,P.clay);
        box(-s.w/2+2,-s.h/2+1,s.height-7,2,s.h-2,4,P.clay);
        box(-s.w/2,-s.h/2,s.height-3,s.w,s.h,3,P.clay,P.gold,true);
        for(let v=-s.h/2+7;v<s.h/2-2;v+=7)scene.wire(tr(-s.w/2+2,v,s.height+.03),tr(s.w/2-2,v,s.height+.03),P.hair,1,.16);
      }else{
        // Open end frames leave each solid deck and the stocked tiers visible.
        for(const u of [-s.w/2+1,s.w/2-3])for(const z of [3,s.height-5])box(u,-s.h/2+1,z,2,s.h-2,3,P.steel,P.steelLight);
        box(-s.w/2+3,-s.h/2+1,5,s.w-6,2,s.height-8,blend(accent,P.hairDark,.28),accent,true);
        for(const z of [12,22,32]) {
          box(-s.w/2+2,-s.h/2+2,z-2,s.w-4,s.h-4,2,blend(accent,P.hairDark,.22),blend(accent,P.cream,.18),true);
          for(let v=-s.h/2+9;v<s.h/2-3;v+=12)scene.wire(tr(-s.w/2+3,v,z+.03),tr(s.w/2-3,v,z+.03),P.hair,1,.14);
        }
        for(const u of [-s.w/2+1,s.w/2-1])for(const v of [-s.h/2+1,s.h/2-1]) {
          box(u-1,v-1,0,2,2,s.height,P.steel,P.steelLight,true);box(u-2,v-2,0,4,4,2,P.steelShade,P.steel);
          for(let z=8;z<s.height-2;z+=6)scene.wire(tr(u+1.05,v,z),tr(u+1.05,v,z+1),P.dark,1,.55);
        }
        const along=s.h>s.w,length=Math.min(68,(along?s.h:s.w)-10),z=s.height-3;
        const points=along?[tr(s.w/2+.05,-length/2,z),tr(s.w/2+.05,length/2,z),tr(s.w/2+.05,length/2,z-6),tr(s.w/2+.05,-length/2,z-6)]:[tr(length/2,s.h/2+.05,z),tr(-length/2,s.h/2+.05,z),tr(-length/2,s.h/2+.05,z-6),tr(length/2,s.h/2+.05,z-6)];
        scene.texture(points,labelTexture(s.label||'STOCK',length,6));
      }
    }
    function productTransform(p) {
      const c=Math.cos(p.a),s=Math.sin(p.a);
      if(p.state==='shelf')return (x,y,z)=>Stock.shelfPoint(p.shelf,p.u+x*c-y*s,p.v+x*s+y*c,p.tier+z);
      if(p.state==='floor'&&['towel','plate','carton'].includes(p.kind))return (x,y,z)=>local(p,x,y,z);
      const t=p.state==='floor'?Math.PI/2:p.tumble;
      const heights={vase:9,wine:10,ketchup:8,jar:5.6,can:5.6,plate:1,pot:6,towel:2,carton:7};
      const half=(heights[p.kind]||0)/2,ct=Math.cos(t),st=Math.sin(t),raise=p.state==='floor'?p.width:half;
      return (x,y,z)=>({x:p.x+(x*ct+(z-half)*st)*c-y*s,y:p.y+(x*ct+(z-half)*st)*s+y*c,z:p.z+raise-x*st+(z-half)*ct});
    }
    function cylinder(scene,tr,radii,color,caps=true,alpha=1) {
      const count=8,rings=radii.map(([z,r])=>Array.from({length:count},(_,i)=>tr(r*Math.cos(i*Math.PI*2/count),r*Math.sin(i*Math.PI*2/count),z)));
      for(let k=0;k<rings.length-1;k++)for(let i=0;i<count;i++)scene.face([rings[k][i],rings[k][(i+1)%count],rings[k+1][(i+1)%count],rings[k+1][i]],color,alpha);
      if(caps)scene.face(rings.at(-1),color,alpha);
      return rings;
    }
    function product(scene,p) {
      const tr=productTransform(p),color=swatches[(p.color||0)%swatches.length],box=(...q)=>scene.box(tr,...q);
      if(p.kind==='shard') {
        const b={x:p.x,y:p.y,z:Math.max(.15,p.z),a:p.a},tint=p.material==='ceramic'?P.cream:p.material==='terracotta'?P.clay:p.source==='wine'?P.sage:P.steelLight;
        scene.flat([local(b,-p.length,-p.width),local(b,p.length,0),local(b,-p.length*.4,p.width)],tint,p.material==='glass'?.8:1);
        scene.wire(local(b,-p.length,-p.width),local(b,p.length,0),P.light,1,.6);return;
      }
      if(p.flat) {
        const flat=(x,y,z)=>local({...p,z:Math.max(0,p.z)},x,y,z);
        scene.box(flat,-p.length,-p.width,0,p.length*2,p.width*2,.8,P.brick,P.coral);
        scene.box(flat,-2,-1,.82,3,2,.1,P.cream);
        scene.box(flat,p.length-1,-.6,0,1.8,1.2,1,P.light);
        return;
      }
      if(p.kind==='wine'||p.kind==='ketchup') {
        const wine=p.kind==='wine',tint=wine?P.pine:P.brick,r=wine?1.7:2.1,neck=wine?9:7;
        cylinder(scene,tr,[[0,r*.8],[1,r],[wine?6:5,r],[wine?7:6,.8],[neck,.8]],tint);
        cylinder(scene,tr,[[neck,.9],[neck+1,.9]],wine?P.gold:P.light);
        box(-r,-r,2,r*2,r*2,2.5,P.cream,P.cream);
        scene.wire(tr(r+.08,-.6,3),tr(r+.08,.6,3),p.kind==='wine'?P.purple:P.brick,1);
        scene.wire(tr(-r*.6,-r*.6,1),tr(-r*.6,-r*.6,6),p.kind==='wine'?P.sage:P.coral,1,.65);
      }else if(p.kind==='vase') {
        cylinder(scene,tr,[[0,2],[1,3.5],[4,4],[7,2.5],[9,1.6]],P.blue,false,.16);
        const rim=Array.from({length:16},(_,i)=>tr(1.8*Math.cos(i*Math.PI/8),1.8*Math.sin(i*Math.PI/8),9));
        for(let i=0;i<16;i++)scene.wire(rim[i],rim[(i+1)%16],P.steelLight,1,.85);
        const water=Array.from({length:12},(_,i)=>tr(3.5*Math.cos(i*Math.PI/6),3.5*Math.sin(i*Math.PI/6),4));scene.flat(water,P.blue,.16);
        scene.wire(tr(-2,-2,2),tr(-2,-2,6),P.light,1,.85);scene.wire(tr(3,0,1),tr(3,0,4),P.steelLight,1,.6);
      }else if(p.kind==='jar'||p.kind==='can') {
        cylinder(scene,tr,[[0,2.2],[5,2.2]],p.kind==='jar'?P.pine:color);
        cylinder(scene,tr,[[5,2.3],[5.6,2.3]],p.kind==='jar'?P.gold:P.steelLight);
        box(-2.22,-2.22,1.2,4.44,4.44,2.5,P.cream);scene.wire(tr(2.3,-.5,2),tr(2.3,.5,2),color,1);
      }else if(p.kind==='plate') {
        cylinder(scene,tr,[[0,3.8],[.7,4],[1,3.2]],P.cream);
        scene.flat(Array.from({length:12},(_,i)=>tr(2*Math.cos(i*Math.PI/6),2*Math.sin(i*Math.PI/6),1.05)),color);
      }else if(p.kind==='pot') {
        cylinder(scene,tr,[[0,2.5],[5,3.6],[6,4]],P.clay);
        cylinder(scene,tr,[[6,3.3],[6.15,3.3]],P.hairDark);
        for(const [x,y,z]of [[-3,0,11],[2,2,10],[1,-3,12]]) {
          scene.wire(tr(0,0,6),tr(x,y,z),P.pine,1);
          scene.flat([tr(x-2,y,z-1),tr(x,y-1,z+2),tr(x+2,y,z),tr(x,y+1,z-2)],P.sage);
        }
      }else if(p.kind==='towel') {
        box(-4.5,-3,0,9,6,2,color,color,true);
        scene.wire(tr(-3.5,-2,2.1),tr(3.5,-2,2.1),P.cream,1,.85);scene.wire(tr(-3.5,2,2.1),tr(3.5,2,2.1),P.cream,1,.85);
      }else{
        box(-5,-3.5,0,10,7,7,P.clay,P.gold,true);
        box(-.7,-3.5,7.02,1.4,7,.1,P.cream);
        scene.flat([tr(5.03,-2,2),tr(5.03,1,2),tr(5.03,1,4),tr(5.03,-2,4)],P.cream);
      }
    }
    function prop(scene,o) {
      const tr=(x,y,z)=>local(o,x,y,z);
      if(o.kind==='box') {
        scene.box(tr,-8,-7,0,16,14,12,P.clay,P.gold,true);
        scene.box(tr,-1,-7,12.02,2,14,.1,P.cream);
        scene.wire(tr(-8,-7,6),tr(8,-7,6),P.hair,1,.3);
        scene.texture([tr(8.03,-4,9),tr(8.03,4,9),tr(8.03,4,5),tr(8.03,-4,5)],labelTexture('FRAGILE',8,4));
        return;
      }
      const coneTr=o.down?(x,y,z)=>tr(z-6,y,x+6):(x,y,z)=>tr(x,y,z);
      scene.box(coneTr,-6,-6,0,12,12,1.5,P.steelShade,P.edge,true);
      cylinder(scene,coneTr,[[1.5,4.8],[6,3],[9,2],[14,.4]],P.clay);
      cylinder(scene,coneTr,[[6,3.05],[8,2.35]],P.light,false);
    }
    function caster(scene,b,wheel,i) {
      const pose=casterPose(b,wheel,i),tr=(x,y,z)=>{
        if(b.comHeight)return Physics.casterPoint(b,wheel,i,x,y,z);
        const p=local(pose,x,y,z);if(!b.z&&!b.pitch&&!b.rollTilt)return p;
        const c=Math.cos(b.a),s=Math.sin(b.a),dx=p.x-b.x,dy=p.y-b.y;return local(b,dx*c+dy*s,-dx*s+dy*c,z);
      },count=12,l=CASTER.halfLength,h=CASTER.halfWidth;
      const rings=[-h,h].map(y=>Array.from({length:count},(_,j)=>tr(l*Math.cos(j*Math.PI*2/count),y,l+l*Math.sin(j*Math.PI*2/count))));
      for(let j=0;j<count;j++)scene.face([rings[0][j],rings[1][j],rings[1][(j+1)%count],rings[0][(j+1)%count]],P.dark);
      scene.face(rings[0],P.edge);scene.face(rings[1].slice().reverse(),P.edge);
      const phase=wheel.roll/l;
      for(let j=0;j<3;j++) {
        const a=phase+j*Math.PI*2/3,x=Math.cos(a),z=Math.sin(a);
        if((Math.cos(pose.a)+Math.sin(pose.a))*x+VIEW_Z*z>0)
          scene.wire(tr(l*x,-h,l+l*z),tr(l*x,h,l+l*z),P.mid,1,.45);
      }
      for(const side of [-h-.05,h+.05]) {
        const axle=tr(0,side,l),end=tr(Math.cos(phase)*2.5,side,l+Math.sin(phase)*2.5);
        scene.wire(axle,end,P.mid,1,.8);
        scene.wire(tr(-.6,side,l),tr(.6,side,l),P.steelLight,2);
      }
      if(wheel.coating) {
        const wet=Object.entries(wheel.coating).sort((a,b)=>b[1]-a[1])[0];
        if(wet&&wet[1]>.015)scene.wire(tr(-l+1,h+.08,l+1),tr(l-1,h+.08,l+1),spillColor(wet[0]),1,clamp(wet[1]*3,.2,.75));
      }
      for(const side of [-1,1]) {
        const axle=tr(0,side*(h+.5),l);
        const fork=tr(CASTER.trail,side*1.5,8);
        scene.wire(axle,fork,P.dark,3);scene.wire(axle,fork,P.steel,1);
      }
      const bearingRing=(r,z)=>Array.from({length:8},(_,j)=>local(b,WHEELS[i][0]+r*Math.cos(j*Math.PI/4),WHEELS[i][1]+r*Math.sin(j*Math.PI/4),z));
      scene.flat(bearingRing(1.6,9),P.steelShade);scene.flat(bearingRing(1.1,9.4),wheel.fixed?P.steel:P.gold);
      scene.wire(local(b,...WHEELS[i],9.6),local(b,...WHEELS[i],11),P.steelLight);
    }
    function shopper(scene,b,gait) {
      const p=b.shopper,c=Math.cos(b.a),s=Math.sin(b.a),nodes=b.ragdoll?.nodes;
      const up=nodes?normalize(subtract(nodes[1],nodes[0])):null;
      const across=nodes?normalize(subtract(nodes[6],nodes[5])):null;
      const forwardAxis=nodes?normalize(cross(across,up)):null;
      const sideAxis=nodes?normalize(cross(up,forwardAxis)):null;
      const ragPoint=(origin,x,y,z)=>add(origin,forwardAxis.x*x+sideAxis.x*y+up.x*z,forwardAxis.y*x+sideAxis.y*y+up.y*z,forwardAxis.z*x+sideAxis.z*y+up.z*z);
      const jointFrame=(origin,u)=>{
        const hint=Math.abs(sideAxis.x*u.x+sideAxis.y*u.y+sideAxis.z*u.z)>.9?forwardAxis:sideAxis,f=normalize(cross(hint,u)),side=normalize(cross(u,f));
        return (x,y,z)=>add(origin,f.x*x+side.x*y+u.x*z,f.y*x+side.y*y+u.y*z,f.z*x+side.z*y+u.z*z);
      };
      // One model for the independent shopper, menu art and legacy fixtures.
      // The live pelvis stays upright while the hands follow the cart's tilt.
      const tr=nodes?(x,y,z)=>ragPoint(nodes[0],x,y,z):p?(x,y,z)=>({x:p.x+x*c-y*s,y:p.y+x*s+y*c,z:p.z+z}):(x,y,z)=>local(b,-16+x,y,18+z);
      const phase=gait.phase||0,stride=gait.stride||0,forward=gait.forward??1,sideways=gait.sideways||0;
      const leanX=nodes?0:p?.leanX??gait.leanX??0,leanY=nodes?0:p?.leanY??gait.leanY??0;
      const activity=clamp(stride/2.8,0,1),sway=nodes?0:Math.cos(phase)*activity*.24;
      const vector=(x,y,z)=>subtract(tr(x,y,z),tr(0,0,0));
      function joint(a,b,l1,l2,hint) {
        const delta=subtract(b,a),distance=Math.hypot(delta.x,delta.y,delta.z),axis=distance>.0001?normalize(delta):normalize(vector(0,0,-1));
        // Preserve the handle endpoint through a stretched or folded pose.
        const scale=Math.max(1,distance/(l1+l2-.06));l1*=scale;l2*=scale;
        const d=clamp(distance,Math.abs(l1-l2)+.001,l1+l2-.001),along=(l1*l1-l2*l2+d*d)/(2*d);
        const dot=axis.x*hint.x+axis.y*hint.y+axis.z*hint.z;
        let bend=subtract(hint,{x:axis.x*dot,y:axis.y*dot,z:axis.z*dot});
        if(Math.hypot(bend.x,bend.y,bend.z)<.001){const ref=Math.abs(axis.z)<.8?{x:0,y:0,z:1}:{x:c,y:s,z:0};bend=cross(axis,ref);}
        bend=normalize(bend);const radius=Math.sqrt(Math.max(0,l1*l1-along*along));
        return add(a,axis.x*along+bend.x*radius,axis.y*along+bend.y*radius,axis.z*along+bend.z*radius);
      }
      function shell(profile,color,transform=tr) {
        // Chamfered clothing keeps a readable shoulder and waist at every angle.
        const rings=profile.map(([z,x,y])=>[[x,-y*.65],[x*.65,-y],[-x*.65,-y],[-x,-y*.65],[-x,y*.65],[-x*.65,y],[x*.65,y],[x,y*.65]].reverse().map(([u,v])=>transform(u,v,z)));
        for(let k=0;k<rings.length-1;k++)for(let i=0;i<8;i++)scene.face([rings[k][i],rings[k][(i+1)%8],rings[k+1][(i+1)%8],rings[k+1][i]],color);
        scene.face(rings.at(-1),color);
      }
      for(const side of [-1,1]) {
        const t=((phase/(Math.PI*2)+(side===1?.5:0))%1+1)%1,swing=Math.max(0,(t-.6)/.4);
        const reach=t<.6?1-t/.3:-1+2*swing*swing*(3-2*swing),lift=Math.sin(swing*Math.PI)*activity*3.6;
        const index=side===-1?0:1,travel=reach*stride,sole=tr(travel*forward-1,side*3.35+travel*sideways*.65,-18+lift);
        const floor=terrainLevel?root.CartCourse.sample(terrainLevel,sole,false):null;
        if(!nodes&&floor&&(p?p.feet:Math.abs(sole.z-lift-floor.height)<6))sole.z=floor.height+lift;
        else if(p&&!nodes)sole.z=Math.min(sole.z,p.z-10+lift);
        const hip=nodes?.[3+index]||tr(0,side*2.65,-.1),ankle=nodes?.[13+index]||add(sole,0,0,2.1),knee=nodes?.[11+index]||joint(hip,ankle,10,10,vector(1,side*.12,0));
        scene.limb(hip,knee,3.8,3.1,P.edge);scene.limb(knee,ankle,3,2.25,P.dark);
        // A small knee fold and ankle cuff break up the trouser silhouette.
        scene.limb(add(knee,c*.9,s*.9,.25),add(knee,c*.9-s*side*.6,s*.9+c*side*.6,-.5),.75,.65,P.steelShade);
        scene.limb(add(ankle,0,0,.8),ankle,2.35,2.35,P.steelShade);
        const shoe=nodes?jointFrame(ankle,normalize(subtract(knee,ankle))):null;
        const foot=nodes?(x,y,z)=>shoe(x,y,z-2.1):(x,y,z)=>local({...sole,a:b.a+side*.08+clamp(sideways*.2,-.2,.2),pitch:swing>.01?-Math.sin(swing*Math.PI)*.2:0},x,y,z);
        shell([[0,2.7,1.6],[.8,2.8,1.6]],P.cream,(x,y,z)=>foot(x+.65,y,z));
        shell([[.8,2.55,1.5],[2,2.15,1.35],[2.6,1.25,1.1]],P.dark,(x,y,z)=>foot(x+.4,y,z));
        for(const edge of [-1,1]) {
          scene.wire(foot(-1.4,edge*1.53,1.15),foot(2.5,edge*1.53,1.15),P.coral,1);
          scene.wire(foot(-1.6,edge*1.32,2),foot(-.8,edge*1.38,2.4),P.cream,1);
        }
        for(const x of [.1,.85])scene.wire(foot(x,-.7,2.64),foot(x,.7,2.64),P.cream,1);
      }
      const coat=(x,y,z)=>{const t=clamp(z/11.5,0,1);return tr(x+leanX*t,y+(leanY+sway)*t,z);};
      shell([[-.5,2.75,3.3],[1,2.65,3.4],[8.5,2.5,4.6],[10.6,2.15,4.9],[12,1.7,3.3]],P.brick,coat);
      shell([[-.55,2.8,3.35],[.45,2.78,3.4]],blend(P.brick,P.dark,.35),coat);
      cylinder(scene,(x,y,z)=>coat(x*.8,y,z),[[11.9,1.65],[15.3,1.45]],P.clay);
      cylinder(scene,(x,y,z)=>coat(x,y,z),[[11.9,2.1],[12.65,1.8]],blend(P.brick,P.dark,.3));
      // Cream tee, zipper, collar and a restrained shoulder seam.
      scene.face([coat(2.58,-.72,8.3),coat(2.58,.72,8.3),coat(1.76,.9,12.03),coat(1.76,-.9,12.03)],P.cream);
      scene.wire(coat(2.78,0,.7),coat(2.6,0,8.2),P.gold,1);
      for(const side of [-1,1]) {
        scene.face([coat(1.8,side*.85,12.07),coat(1.8,side*2.6,12.07),coat(2.4,side*1.6,10.1)],P.coral);
        scene.wire(coat(-1.45,side*4.45,10.9),coat(1.5,side*4.45,10.9),P.coral,1,.8);
        scene.wire(coat(2.64,side*1.35,3.1),coat(2.58,side*2.5,4.2),P.hairDark,1,.55);
        const index=side===-1?0:1,shoulder=nodes?.[5+index]||coat(0,side*4.7,10.1),wrist=nodes?.[9+index]||local(b,-6,side*8.7,30);
        const elbow=nodes?.[7+index]||joint(shoulder,wrist,8.5,8.8,vector(-.7,side*.85,-.4));
        const cuff={x:elbow.x+(wrist.x-elbow.x)*.85,y:elbow.y+(wrist.y-elbow.y)*.85,z:elbow.z+(wrist.z-elbow.z)*.85};
        scene.limb(shoulder,elbow,4.1,3.25,P.brick);scene.limb(elbow,cuff,3.35,2.35,P.brick);
        scene.limb(cuff,wrist,2.5,2.3,P.cream);
        // Hands wrap the bar instead of ending in floating square blocks.
        const hand=nodes?(x,y,z)=>ragPoint(wrist,x,y,z):(x,y,z)=>local({...wrist,a:b.a},x,y,z);
        scene.box(hand,-1.2,-1.05,-1.05,2.4,2.1,1.9,P.clay,P.gold);
        scene.wire(hand(1.25,-.75,.25),hand(1.25,.7,.25),P.hair,1,.65);
      }
      const head=nodes?.[2]||coat(0,0,18.5),headTr=nodes?jointFrame(head,normalize(subtract(nodes[2],nodes[1]))):(x,y,z)=>local({...head,a:b.a,pitch:clamp(-leanX*.035,-.18,.18),rollTilt:clamp(leanY*.035,-.18,.18)},x,y,z);
      cylinder(scene,(x,y,z)=>headTr(x*.88,y,z),[[-3.4,1.7],[-2.4,3.1],[.8,3.65],[2.7,3.15],[3.7,1.6]],P.clay);
      // An uneven hairline and swept crown, rather than concentric cap rings.
      const hair=Array.from({length:3},(_,row)=>Array.from({length:8},(_,i)=>{
        const a=i*Math.PI/4,front=Math.cos(a),side=Math.sin(a),r=[3.7,3.25,1.65][row];
        const z=row===0?-.6+Math.max(0,front)*2.5+side*.35:row===1?2.85+side*.4:4.55+side*.25;
        return headTr(front*r*.9-.4,side*r+.15,z);
      }));
      for(let k=0;k<2;k++)for(let i=0;i<8;i++)scene.face([hair[k][i],hair[k][(i+1)%8],hair[k+1][(i+1)%8],hair[k+1][i]],k===1?P.hair:P.hairDark);
      scene.face(hair[2],P.hair);
      scene.wire(headTr(-1.8,-1.4,4.2),headTr(.4,-.7,4.65),P.hairLight,1,.85);
      scene.wire(headTr(.4,-.7,4.65),headTr(1.4,.5,4.15),P.hairLight,1,.6);
      scene.box(headTr,2.85,-.65,-1.15,1.15,1.3,1.25,P.clay,P.gold);
      for(const side of [-1,1]) {
        scene.box(headTr,-.1,side*3.1,-1.5,1.25,.85,1.65,P.clay,P.gold);
        scene.wire(headTr(3.12,side*1.3,.25),headTr(3.15,side*1.3,-.35),P.hairDark,1);
        scene.wire(headTr(3.04,side*1.65,.85),headTr(3.2,side*.95,1.05),P.hairDark,1);
      }
      scene.wire(headTr(2.9,-.7,-2.15),headTr(2.9,.7,-2.15),P.hair,1,.65);
    }
    function cart(target,b,wheels,gait) {
      const scene=new Scene();scene.rigid=true;
      const tr=(x,y,z)=>local(b,x,y,z);
      for(let i=0;i<4;i++)caster(scene,b,wheels?.[i]||{a:b.a,roll:0},i);
      for(const side of [-1,1]) {
        scene.wire(tr(-1,side*12,9),tr(28,side*12,9),P.steelShade,3);scene.wire(tr(-1,side*12,10),tr(28,side*12,10),P.steelLight,1);
        scene.wire(tr(1,side*12,9),tr(-3,side*11,31),P.steel,2,.85);
        scene.wire(tr(27,side*12,9),tr(28,side*9,17),P.steel,2,.85);
      }
      scene.wire(tr(0,-12,9),tr(0,12,9),P.steelShade,2);scene.wire(tr(27,-12,9),tr(27,12,9),P.steel,2);
      const lower=[tr(1,-8,16),tr(27,-8,16),tr(27,8,16),tr(1,8,16)],upper=[tr(-3,-11,31),tr(31,-11,31),tr(31,11,31),tr(-3,11,31)];
      scene.flat(lower,P.steel,.045);
      for(let i=0;i<4;i++) {
        scene.flat([lower[i],lower[(i+1)%4],upper[(i+1)%4],upper[i]],P.steel,.035);
        scene.wire(upper[i],upper[(i+1)%4],P.steel,2,.85);scene.wire(upper[i],upper[(i+1)%4],P.steelLight,1,.8);
        scene.wire(lower[i],lower[(i+1)%4],P.steelShade,1,.75);
      }
      // Close three-unit galvanized mesh on the bottom and all four side faces.
      for(let x=2;x<27;x+=3)scene.wire(tr(x,-8,16),tr(x,8,16),P.steelLight,1,.48);
      for(let y=-6;y<8;y+=3)scene.wire(tr(1,y,16),tr(27,y,16),P.steelShade,1,.5);
      for(const side of [-1,1]) {
        for(let x=2;x<27;x+=3){const t=(x-1)/26;scene.wire(tr(x,side*8,16),tr(-3+t*34,side*11,31),P.steelLight,1,.5);}
        for(let z=19;z<31;z+=3){const t=(z-16)/15;scene.wire(tr(1-4*t,side*(8+3*t),z),tr(27+4*t,side*(8+3*t),z),P.steelShade,1,.52);}
      }
      for(const end of [0,1]) {
        for(let y=-6;y<8;y+=3)scene.wire(tr(end?27:1,y,16),tr(end?31:-3,y*11/8,31),P.steelLight,1,.5);
        for(let z=19;z<31;z+=3){const t=(z-16)/15,x=end?27+4*t:1-4*t;scene.wire(tr(x,-8-3*t,z),tr(x,8+3*t,z),P.steelShade,1,.5);}
      }
      for(const side of [-1,1])scene.wire(tr(-3,side*11,31),tr(-6,side*12,30),P.steel,2,.9);
      scene.wire(tr(-6,-12,30),tr(-6,12,30),P.steelShade,3,.95);scene.wire(tr(-6,-10,30.5),tr(-6,10,30.5),P.steelLight,1,.85);
      shopper(scene,b,gait||{phase:0,stride:0,forward:1,sideways:0});scene.rasterInto(target);
    }
    function drawCart(g,b,wheels,gait,origin=CAMERA) {const scene=new Scene();cart(scene,b,wheels,gait);scene.flush(g,origin);}
    function drawShelf(g,s) {const scene=new Scene();shelf(scene,s);for(const p of s.stockItems)if(p.state==='shelf')product(scene,p);scene.flush(g);}
    function spills(g,stock,visible=stock.world._visible) {
      let paths=spillPaths.get(stock);if(!paths){paths=new Map();spillPaths.set(stock,paths);}
      for(const liquid of stock.liquids.values())for(const [key,volume]of liquid.cells) {
        const x=key%stock.cols*Stock.CELL,y=Math.floor(key/stock.cols)*Stock.CELL;
        if(visible&&(!visible({x,y},130)||!visible({x,y,z:Terrain.height(stock.world.level,{x,y})},12)))continue;
        let cell=paths.get(key);
        if(!cell){
          const corners=quad(x,y,4,4).map(onGround).map(p=>project(p)),a=project(onGround({x,y:y+1})),b=project(onGround({x:x+4,y}));
          cell={face:polygonPath(corners),edges:corners.map((p,i)=>linePath(p,corners[(i+1)%4],1)),ripple:linePath(a,b,1)};paths.set(key,cell);
        }
        const fill=(path,color,alpha)=>{g.globalAlpha=alpha;g.fillStyle=color;g.fill(path);};
        if(liquid.kind==='water') {
          fill(cell.face,P.blue,clamp(volume*.2,.018,.13));
          if(volume>.055) {
            const dry=k=>(liquid.cells.get(k)||0)<=.055;
            if(dry(key+1))fill(cell.edges[1],P.steelShade,.4);
            if(dry(key+stock.cols))fill(cell.edges[2],P.steelShade,.4);
            if(dry(key-stock.cols))fill(cell.edges[0],P.light,.75);
            if(dry(key-1))fill(cell.edges[3],P.light,.75);
            if(volume>.13&&hash(key,7)>.83)fill(cell.ripple,P.light,.7);
          }
        }else fill(cell.face,spillColor(liquid.kind),clamp(volume*1.4,.025,.65));
      }
      g.globalAlpha=1;
      // Old wet tracks can cover a long run; keep their derived art bounded.
      if(paths.size>4096)spillPaths.delete(stock);
      for(const smear of stock.smears)if(!visible||visible(smear,100))groundLocal(g,onGround(smear),-2,-.7,4,1.5,smear.kind==='water'?P.steelLight:spillColor(smear.kind),smear.alpha*(smear.kind==='water'?.45:1));
    }
    function routes(g,w) {
      for(const p of w.level.portals||[]) {
        const open=w.gate>=p.opensAt,accent=P[w.level.rooms[p.to].theme]||P.gold;
        groundLocal(g,p,-52,-p.width/2+3,47,p.width-6,accent,open?.25:.1);
        groundArrow(g,local(p,-25,0),24,open?P.pine:P.mid,.85);
        const q=project(local(p,-49,0));text(g,'ROOM '+String(p.to+1).padStart(2,'0'),q.x,q.y-5,open?P.pine:P.edge,6,'center');
      }
      const e=w.exit,half=e.width/2;
      groundLocal(g,e,-68,-half+2,63,e.width-4,P.gold,w.exitOpen?.17:.07);
      for(let x=-63;x<-5;x+=11)for(const y of [-half+2,half-3])groundLocal(g,e,x,y,6,1,P.cream,.65);
      groundArrow(g,local(e,-26,0),28,w.exitOpen?P.pine:P.mid,.75);
      for(let y=-half+2;y<half-2;y+=7)groundLocal(g,e,-9,y,2,3,P.light,.9);
      const label=project(local(e,-58,0));text(g,w.exitOpen?'CHECKOUT OPEN':'CHECKOUT',label.x,label.y-6,w.exitOpen?P.pine:P.edge,6,'center');
      for(let i=0;i<w.level.gates.length;i++) {
        const p=w.level.gates[i],current=i===w.gate,done=i<w.gate,color=current?P.coral:done?P.pine:P.edge;
        if(current)groundPoly(g,circle(p,CHECKPOINT_RADIUS),P.light,.17);
        groundRing(g,p,CHECKPOINT_RADIUS,color,current?2:1,done?.45:current?1:.65);
        const q=project(p);
        if(done){line(g,add(q,-4),add(q,-1,3),P.pine,2);line(g,add(q,-1,3),add(q,5,-4),P.pine,2);}
        else text(g,String(p.number||i+1),q.x,q.y+3,color,current?10:8,'center');
      }
    }
    function doorway(scene,w) {
      const e=w.exit,tr=(x,y,z)=>local(e,x,y,z),half=e.width/2;
      for(const y of [-half-2,half]) {
        scene.box(tr,-1,y,0,4,2,24,P.steelShade,P.steelLight,true);
        scene.box(tr,-1.05,y-.05,18,4.1,2.1,3,w.exitOpen?P.sage:P.gold);
      }
      if(!w.exitOpen) {
        for(let y=-half;y<half;y+=5)scene.wire(tr(1,y,3),tr(1,y,15),P.mid,1);
        scene.wire(tr(1,-half,15),tr(1,half,15),P.steelShade,2);scene.wire(tr(1,-half,16),tr(1,half,16),P.steelLight,1);
      }else for(const y of [-half,half])scene.wire(tr(1,y,15),tr(14,y,15),P.steelLight,1);
    }
    function shadows(g,w) {
      g.save();if(!w.level.campaign)clipFloor(g,w);
      w._shadowClipped=true;
      for(const s of w.shelves)if(!w._visible||w._visible({x:s.cx,y:s.cy},150))drawFurnitureShadow(g,s,w);
      const b=w.body;
      if((!w.fall||w.fall.shopperOnly)&&(!w.level.campaign||w.isFloor(b)&&!w.edge.risk)){const height=Math.max(0,(b.z||0)-(w.ground?.lastHeight||0));groundPoly(g,circle(onGround(local(b,14,0)),23+height*.04,12+height*.02).map(onGround),P.dark,.12*Math.exp(-height/40));
      groundPoly(g,circle(onGround(w.shopper||local(b,-16,1)),6,5).map(onGround),P.dark,.22);
      groundPoly(g,Stock.hull([local(b,-20,-5),local(b,-12,5),local(b,4,13),local(b,-4,2)]).map(onGround),P.dark,.09);}
      for(let i=0;i<4;i++){const tire=Physics.casterPoint(b,w.wheels[i],i,0,0,4),floor=w.level.campaign?w.floorAt(tire,false):{height:0};if(floor){const height=Math.max(0,tire.z-floor.height-4);groundPoly(g,circle({...tire,z:floor.height},4+height*.018,2.8+height*.012),P.dark,.27*Math.exp(-height/24));}}
      if(w.shopper){const p=w.shopper,floor=w.floorAt(p,false);if(floor)groundPoly(g,circle({...p,z:floor.height},5,3.5),P.dark,.2*Math.exp(-Math.max(0,p.z-floor.height-18)/24));}
      for(const o of w.objects)if(!o.gone&&!o.falling)groundPoly(g,circle(add(o,3,3),o.kind==='box'?10:7,o.kind==='box'?8:5),P.dark,.18);
      for(const p of w.stock.items)if((!w._visible||w._visible(p))&&p.state!=='shelf'&&!p.broken&&p.kind!=='shard')groundPoly(g,circle(add(p,1,1,-p.z),Math.max(2,p.length),p.width),P.dark,.13);
      g.restore();delete w._shadowClipped;
    }
    function boundaries(g,w) {
      if(!w.boundaryContacts.length)return;
      const life=Math.max(...w.boundaryContacts.map(c=>c.life)),alpha=clamp(life/.18,0,1),p=local(w.body,BODY.personX,0);
      const shapes=[{part:'cart',points:corners(w.body)},{part:'shopper',points:circle(p,BODY.personRadius)},...w.wheels.map((q,i)=>({part:'wheel:'+i,points:casterCorners(w.body,q,i)}))];
      for(const shape of shapes) {
        if(w.boundaryContacts.some(c=>c.part===shape.part))groundPoly(g,shape.points,P.red,alpha*.3);
        for(let i=0;i<shape.points.length;i++){
          const a=project(shape.points[i]),b=project(shape.points[(i+1)%shape.points.length]);
          g.globalAlpha=alpha;line(g,a,b,P.hairDark,3);line(g,a,b,P.red,1);g.globalAlpha=1;
        }
      }
      for(const c of w.boundaryContacts) {
        const a={x:c.x-c.ny*12,y:c.y+c.nx*12},b={x:c.x+c.ny*12,y:c.y-c.nx*12};
        groundLine(g,a,b,P.hairDark,4,clamp(c.life/.18,0,1));groundLine(g,a,b,P.red,2,clamp(c.life/.18,0,1));
        const q=project(c);rect(g,q.x-2,q.y-2,5,5,P.red);rect(g,q.x-1,q.y-1,3,3,P.light);
      }
    }
    function trickFloor(g,w,options) {
      if(w.level.campaign||!w.tricks||options.reducedMotion)return;
      const arc=(p,r,start,sweep,color,width,alpha)=>{
        const steps=Math.max(2,Math.ceil(Math.abs(sweep)/.14));
        let last={x:p.x+Math.cos(start)*r,y:p.y+Math.sin(start)*r};
        for(let i=1;i<=steps;i++){const a=start+sweep*i/steps,next={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};groundLine(g,last,next,color,width,alpha);last=next;}
        return last;
      };
      const spin=w.tricks.spin;
      if(spin&&spin.angle>.25&&spin.tier<2) {
        const sweep=spin.direction*Math.min(Math.PI*2,spin.angle),color=spin.tier?P.purple:P.blue;
        const end=arc(w.body,43,spin.startAngle,sweep,color,2,.65);
        groundRing(g,end,2,P.light,1,.85);
      }
      if(w.tricks.slide) {
        const speed=Math.hypot(w.body.vx,w.body.vy);
        w.wheels.forEach((q,i)=>{const p=casterPose(w.body,q,i);groundLine(g,p,{x:p.x-w.body.vx/speed*13,y:p.y-w.body.vy/speed*13},P.sage,2,.4);});
      }
      for(const e of w.tricks.effects) {
        const alpha=clamp(e.life/e.maxLife,0,1),progress=1-alpha;
        if(e.kind==='near'){groundRing(g,e,4+progress*10,P.gold,2,alpha);groundLine(g,{x:e.x-4,y:e.y},{x:e.x+4,y:e.y},P.light,2,alpha);}
        else if(e.kind==='half'||e.kind==='full')arc(e,43+progress*8,e.startAngle,e.direction*(e.kind==='full'?Math.PI*2:Math.PI),e.kind==='full'?P.purple:P.blue,2,alpha*.8);
        else for(let i=0;i<3;i++)groundRing(g,{x:e.x-i*5,y:e.y-i*5},5+progress*5,P.sage,1,alpha*.6);
      }
    }
    function draw(g,w,background,options={}) {
      if(w.level.campaign)return drawCourse(g,w,background,options);
      if(w.level.connected)return drawConnected(g,w,background,options);
      const preview=options.preview;
      g.save();g.imageSmoothingEnabled=false;g.clearRect(0,0,g.canvas.width,g.canvas.height);
      if(!preview&&options.shake&&!options.reducedMotion)g.translate(Math.round(Math.sin(w.time*99)*options.shake),Math.round(Math.cos(w.time*78)*options.shake));
      g.drawImage(background,0,0);spills(g,w.stock);shadows(g,w);routes(g,w);
      if(!preview)trickFloor(g,w,options);
      for(const t of w.tracks)groundLocal(g,t,-2,-1,4,1,P.hairDark,t.life/3*.16);
      if(!preview) {
        const b=w.body,speed=Math.hypot(b.vx,b.vy);
        if(speed>8) {
          const vx=b.vx/speed,vy=b.vy/speed,length=Math.min(57,speed*.45);
          for(let i=10;i<length;i+=6){const p=project({x:b.x+vx*i,y:b.y+vy*i});rect(g,p.x,p.y,2,1,P.pine);}
          groundArrow(g,{x:b.x+vx*length,y:b.y+vy*length,a:Math.atan2(vy,vx)},9,P.pine,.7);
        }
      }
      // Global face ordering lets shelves, products, legs and basket wires
      // pass in front of and behind each other in the same world-space view.
      const scene=new Scene();doorway(scene,w);
      for(const s of w.shelves)shelf(scene,s);
      for(const p of w.stock.items)if(!p.broken)product(scene,p);
      for(const o of w.objects)prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper,ragdoll:w.ragdoll},w.wheels,w.gait);
      if(!preview)for(const p of options.particles||[]) {
        const tr=(x,y,z)=>local({...p,z:0},x,y,z);
        scene.flat([tr(-p.w/2,-p.h/2,p.z),tr(p.w/2,-p.h/2,p.z),tr(p.w/2,p.h/2,p.z),tr(-p.w/2,p.h/2,p.z)],p.color,clamp(p.life,0,1));
      }
      scene.flush(g);
      if(!preview){boundaries(g,w);}
      g.restore();
    }
    function worldFrame(w) {
      if(w.level.campaign&&w.level._viewFrame)return w.level._viewFrame;
      const points=w.level.floorAreas.flatMap(a=>(a.poly||quad(a.x,a.y,a.w,a.h)).map(p=>project(w.level.campaign?onGround(p):p)));
      const left=Math.min(...points.map(p=>p.x))-35,top=Math.min(...points.map(p=>p.y))-45,right=Math.max(...points.map(p=>p.x))+35,bottom=Math.max(...points.map(p=>p.y))+40;
      const frame={left,top,width:right-left,height:bottom-top};if(w.level.campaign)w.level._viewFrame=frame;return frame;
    }
    function connectedCamera(width,height,w,follow=true,focusY=.54) {
      if(follow){
        const focus=project({...w.body,z:w.level.campaign?(w.ground.lastHeight+clamp(w.body.z-w.ground.lastHeight,0,65)*.4):0}),camera={scale:width<=480?1.8:1.45};
        if(w.ragdoll){
          // Keep both independent bodies in view, including on short screens.
          // The usual lip framing stays until the flight reaches its margins.
          const points=[...w.ragdoll.nodes,...[[-6,-12,0],[-6,12,32],[31,-12,0],[31,12,32]].map(([x,y,z])=>TerrainModule.kinematics(w.body,x,y,z).p)].map(p=>project(p));
          const left=Math.min(...points.map(p=>p.x))-5,right=Math.max(...points.map(p=>p.x))+5,top=Math.min(...points.map(p=>p.y))-5,bottom=Math.max(...points.map(p=>p.y))+5;
          camera.scale=Math.min(camera.scale,(width-40)/(right-left),(height-40)/(bottom-top));
          camera.x=clamp(width*.5-focus.x*camera.scale,20-left*camera.scale,width-20-right*camera.scale);
          camera.y=clamp(height*focusY-focus.y*camera.scale,20-top*camera.scale,height-20-bottom*camera.scale);
        }else {camera.x=width*.5-focus.x*camera.scale;camera.y=height*focusY-focus.y*camera.scale;}
        return camera;
      }
      const box=worldFrame(w),scale=Math.min((width-28)/box.width,(height-28)/box.height);
      return {scale,x:(width-box.width*scale)/2-box.left*scale,y:(height-box.height*scale)/2-box.top*scale};
    }
    function overview(g,w,camera) {
      const box=worldFrame(w),width=154,height=114,x=g.canvas.width-width-12,y=12,scale=Math.min((width-8)/box.width,(height-8)/box.height);
      const ox=x+4+(width-8-box.width*scale)/2-box.left*scale,oy=y+4+(height-8-box.height*scale)/2-box.top*scale;
      rect(g,x-2,y-2,width+4,height+4,P.hairDark);rect(g,x,y,width,height,blend(P.dark,P.blue,.17));
      g.save();g.beginPath();g.rect(x,y,width,height);g.clip();g.translate(ox,oy);g.scale(scale,scale);
      for(const a of w.level.floorAreas)groundPoly(g,quad(a.x,a.y,a.w,a.h),a.room===undefined?P.cream:P[w.level.rooms[a.room].theme]);
      for(const h of w.level.hazards)groundPoly(g,circle(h,h.rx,h.ry),P.blue);
      const target=w.level.gates[w.gate];if(target)groundRing(g,target,CHECKPOINT_RADIUS,P.light,5);
      const q=project(w.body);oval(g,q.x,q.y,10,10,P.dark);oval(g,q.x,q.y,6,6,P.light);
      const l=(-camera.x/camera.scale),t=(-camera.y/camera.scale),r=l+g.canvas.width/camera.scale,b=t+g.canvas.height/camera.scale;
      for(const [a,z]of [[{x:l,y:t},{x:r,y:t}],[{x:r,y:t},{x:r,y:b}],[{x:r,y:b},{x:l,y:b}],[{x:l,y:b},{x:l,y:t}]])line(g,a,z,P.light,2);
      g.restore();
    }
    function drawConnected(g,w,background,options) {
      const camera=connectedCamera(g.canvas.width,g.canvas.height,w,options.follow!==false,options.focusY),width=g.canvas.width,height=g.canvas.height;
      const visible=(p,margin=90)=>{const q=project(p);return camera.x+q.x*camera.scale>-margin&&camera.x+q.x*camera.scale<width+margin&&camera.y+q.y*camera.scale>-margin&&camera.y+q.y*camera.scale<height+margin;};
      w._visible=visible;
      g.save();g.imageSmoothingEnabled=false;rect(g,0,0,width,height,blend(P.dark,P.blue,.16));
      g.translate(camera.x,camera.y);g.scale(camera.scale,camera.scale);
      if(options.shake&&!options.reducedMotion)g.translate(Math.sin(w.time*99)*options.shake*.45,Math.cos(w.time*78)*options.shake*.45);
      for(const a of w.level.floorAreas)if(a.room===undefined) {
        groundPoly(g,quad(a.x,a.y,a.w,a.h,-5),P.hairDark);groundPoly(g,quad(a.x,a.y,a.w,a.h),P.gold);
        for(let u=0;u<a.w;u+=12)groundLine(g,{x:a.x+u,y:a.y},{x:a.x+u,y:a.y+a.h},P.cream,1,.45);
      }
      for(const tile of background.rooms) {
        const r=tile.room,dx=(r.x-r.y)*CAMERA.horizontal,dy=(r.x+r.y)*CAMERA.vertical;
        if(!visible({x:r.x+240,y:r.y+150},800))continue;
        g.drawImage(tile.canvas,dx,dy);
      }
      spills(g,w.stock);shadows(g,w);routes(g,w);
      if(!options.preview)trickFloor(g,w,options);
      for(const t of w.tracks)if(visible(t))groundLocal(g,t,-2,-1,4,1,P.hairDark,t.life/3*.16);
      const scene=new Scene();doorway(scene,w);
      for(const p of w.level.portals)if(visible(p,150))doorway(scene,{exit:p,exitOpen:w.gate>=p.opensAt});
      for(const s of w.shelves)if(visible({x:s.cx,y:s.cy},180))shelf(scene,s);
      for(const p of w.stock.items)if(!p.broken&&visible(p))product(scene,p);
      for(const o of w.objects)if(!o.gone&&visible(o))prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper,ragdoll:w.ragdoll},w.wheels,w.gait);
      for(const p of options.particles||[])if(visible(p))scene.flat(quad(p.x,p.y,p.w,p.h,p.z),p.color,clamp(p.life,0,1));
      scene.flush(g);
      if(w.fall) {
        const fallScene=new Scene(clamp(1-w.fall.time*.85,0,1));cart(fallScene,w.body,w.wheels,w.gait);
        g.globalAlpha=clamp(1-w.fall.time*.85,0,1);fallScene.flush(g);g.globalAlpha=1;
        if(w.fall.kind==='lake') {
          const p={x:w.body.x,y:w.body.y,z:-6},r=8+w.fall.time*30;
          groundRing(g,p,r,P.light,2,clamp(1-w.fall.time,0,1));
          for(let i=0;i<8;i++){const a=i*Math.PI/4,q={x:p.x+Math.cos(a)*r*.5,y:p.y+Math.sin(a)*r*.5,z:Math.sin(w.fall.time*3)*14};groundLine(g,q,{...q,z:q.z+4},P.light,2,.8);}
        }
      }else {
        const speed=Math.hypot(w.body.vx,w.body.vy);
        if(speed>8){const a=Math.atan2(w.body.vy,w.body.vx),b={...w.body,a,z:0};groundArrow(g,local(b,Math.min(55,speed*.45),0),10,P.pine,.7);}
        if(w.unsupported?.some(Boolean))w.wheels.forEach((q,i)=>{if(w.unsupported[i])groundRing(g,casterPose(w.body,q,i),5,P.red,2);});
      }
      boundaries(g,w);g.restore();delete w._visible;terrainLevel=null;
      if(options.follow!==false&&!options.preview)overview(g,w,camera);
      const next=w.level.gates[w.gate],target=next&&next.room!==w.roomIndex?(w.level.portals[w.roomIndex]||next):(next||w.exit),p=project(target),tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;
      if(options.follow!==false&&!options.preview&&(tx<18||tx>width-18||ty<18||ty>height-18)) {
        const dx=tx-width/2,dy=ty-height*.54,t=Math.min((width/2-28)/Math.max(1,Math.abs(dx)),(height*.45-30)/Math.max(1,Math.abs(dy))),x=clamp(width/2+dx*t,25,width-25),y=clamp(height*.54+dy*t,25,height-25);
        const label=target.to!==undefined?'DOOR':target.number||'OUT',rx=label.length>2?19:13;oval(g,x,y,rx,13,P.hairDark);oval(g,x,y,rx-2,11,P.gold);text(g,label,x,y+4,P.hairDark,10,'center');
      }
    }
    function coursePrism(scene,points,bottom,height,color,top=color) {
      scene.face(points.map(p=>({...p,z:height})),top,1,null,true);
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];scene.face([{...a,z:bottom},{...b,z:bottom},{...b,z:height},{...a,z:height}],color,1,null,true);}
    }
    function clipPolygon(points,axis,value,sign){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=(a[axis]-value)*sign>=0,other=(b[axis]-value)*sign>=0;if(inside)out.push(a);if(inside!==other){const t=(value-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}return out;}
    function mesh(g,points,color,tile,requireFloor=false){
      const p=clipPolygon(clipPolygon(clipPolygon(clipPolygon(points,'x',tile.x,1),'x',tile.x+tile.w,-1),'y',tile.y,1),'y',tile.y+tile.h,-1);
      if(p.length<3)return;
      const b=root.CartCourse.bounds(p),step=8;
      for(let y=Math.floor(b.top/step)*step;y<b.bottom;y+=step)for(let x=Math.floor(b.left/step)*step;x<b.right;x+=step){
        const part=clipPolygon(clipPolygon(clipPolygon(clipPolygon(p,'x',x,1),'x',x+step,-1),'y',y,1),'y',y+step,-1);
        if(part.length<3)continue;
        const center={x:part.reduce((a,p)=>a+p.x,0)/part.length,y:part.reduce((a,p)=>a+p.y,0)/part.length};
        if(requireFloor){
          const surface=root.CartCourse.sample(terrainLevel,center,false);
          if(!surface||typeof requireFloor==='function'&&!requireFloor(surface))continue;
        }
        const q=part.map(onGround),sample={x:x+step/2,y:y+step/2},d=step/2;
        const gx=(Terrain.height(terrainLevel,{x:sample.x+d,y:sample.y})-Terrain.height(terrainLevel,{x:sample.x-d,y:sample.y}))/(2*d),gy=(Terrain.height(terrainLevel,{x:sample.x,y:sample.y+d})-Terrain.height(terrainLevel,{x:sample.x,y:sample.y-d}))/(2*d);
        // Share lighting as well as color at clipped ribbons and cache edges.
        const tint=typeof color==='function'?color(sample.x,sample.y):color;
        // Match the fixed light used on models. Amplify the ground normal and
        // contrast so gentle grades read without changing the actual height.
        const light=clamp(((gx*.7+gy*.9+.82)/Math.hypot(gx*2,gy*2,1)-.82)*2.8,-.42,.28);
        groundPoly(g,q,blend(tint,light>0?P.light:P.dark,Math.abs(light)));
      }
    }
    function courseRoadArt(level) {
      const bands=[],arrows=[];
      for(const section of level.sections){
        const path=section.path,offset=(i,r,side)=>{
          const p=path[i],before=path[Math.max(0,i-1)],after=path[Math.min(path.length-1,i+1)];
          const normal=(a,b)=>{const d=Math.hypot(b.x-a.x,b.y-a.y);return d?{x:-(b.y-a.y)/d,y:(b.x-a.x)/d}:null;};
          const a=normal(before,p)||normal(p,after),b=normal(p,after)||a,n=normalize({x:a.x+b.x,y:a.y+b.y,z:0}),m=r/Math.max(.35,n.x*b.x+n.y*b.y);
          return {x:p.x+n.x*m*side,y:p.y+n.y*m*side};
        };
        let distance=section.startDistance;
        for(let i=0;i<path.length-1;i++){
          const a=path[i],b=path[i+1],length=Math.hypot(b.x-a.x,b.y-a.y),edge=section.width/2;
          const interpolate=(p,q,t)=>({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
          for(const side of [-1,1]){
            const inner=[offset(i,edge-7,side),offset(i+1,edge-7,side)],outer=[offset(i,edge,side),offset(i+1,edge,side)];
            for(let u=0;u<length-.001;){
              // Paint blocks keep their phase through every short curve segment.
              const block=Math.floor((distance+u+.001)/18),end=Math.min(length,(block+1)*18-distance),t=u/length,v=end/length;
              const poly=[interpolate(inner[0],inner[1],t),interpolate(inner[0],inner[1],v),interpolate(outer[0],outer[1],v),interpolate(outer[0],outer[1],t)];
              bands.push({poly,red:block%2===0,bounds:root.CartCourse.bounds(poly)});u=end;
            }
          }
          if(length>90){const p={x:(a.x+b.x)/2,y:(a.y+b.y)/2,a:Math.atan2(b.y-a.y,b.x-a.x)};
            const poly=[[-15,-3],[-1,-3],[-1,-8],[15,0],[-1,8],[-1,3],[-15,3]].map(([x,y])=>local(p,x,y));
            arrows.push({poly,surface:section.surface,bounds:root.CartCourse.bounds(poly)});
          }
          distance+=length;
        }
      }
      return {bands,arrows};
    }
    function slopePaint(g,w,tile=null) {
      w.level._slopes||=slopeMarkers(w.level);
      for(const p of w.level._slopes.arrows){
        if(tile&&(p.x<tile.x-p.width||p.x>tile.x+tile.w+p.width||p.y<tile.y-p.width||p.y>tile.y+tile.h+p.width))continue;
        const half=Math.min(16,p.width*.14);
        const paint=(points,tint)=>{const q=points.map(([u,v])=>local(p,u,v));if(tile)mesh(g,q,tint,tile,true);else groundPoly(g,q.map(onGround),tint);};
        for(const side of [-1,1]){
          paint([[-7,side*half],[6,0],[11,0],[-2,side*half]],P.cream);
        }
      }
    }
    function cliffFaces(scene,w,visible,mode='upper'){
      const edges=w.level._edges||(w.level._edges=exposedEdges(w.level,root.CartCourse));
      const seam=(p,z)=>z+3*Math.sin((p.x-p.y)*.024+z*.08)+1.5*Math.sin((p.x+p.y)*.037);
      for(const e of edges){
        const {a,b,normal,kind}=e,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2};
        if(!visible(mid,160)||mode==='occlude'&&Math.hypot(mid.x-w.body.x,mid.y-w.body.y)>65)continue;
        if(normal.x+normal.y<.02)continue;
        // Subpixel slivers from intersecting round joins have no readable
        // face; drawing their seams above the floor produces upright streaks.
        if(mode!=='below'&&Math.abs((a.x-a.y)-(b.x-b.y))*CAMERA.horizontal<1.25)continue;
        const low=mode==='upper'?0:-105,high=mode==='below'?0:Math.max(a.z,b.z);
        const at=(p,z)=>({...p,z:clamp(seam(p,z),low,Math.max(low,Math.min(p.z,high)))});
        if(mode==='below'){
          const foot=p=>({x:p.x+normal.x*12,y:p.y+normal.y*12,z:-105});
          scene.flat([{...a,z:-105},{...b,z:-105},foot(b),foot(a)],P.dark,.22);
        }
        // Shared, gently uneven strata connect across the whole contour.
        // Their orientation and deeper shading make the vertical drop legible.
        for(let z=-120;z<high+16;z+=16){
          const A=at(a,z),B=at(b,z),C=at(b,z+16),D=at(a,z+16);
          if(D.z<=A.z&&C.z<=B.z)continue;
          const shade=clamp(.32+normal.y*.12+Math.max(0,-z)/105*.24+(Math.round(z/16)%2===0?.025:0),.25,.78);
          scene.flat([D,C,B,A],blend(P.clay,P.hairDark,shade));
        }
        for(let z=-88;z<high;z+=32){
          const A=at(a,z),B=at(b,z);
          if(A.z<=low||B.z<=low||A.z>=a.z||B.z>=b.z)continue;
          scene.wire(A,B,P.hairDark,1,.4);
          scene.wire({...A,z:A.z-1.2},{...B,z:B.z-1.2},P.clay,1,.16);
        }
        // Sparse fractures stop within a bed, rather than slicing the cliff
        // into detached columns. Use the same details in falling occlusion.
        const seed=hash(Math.round(mid.x/9),Math.round(mid.y/9));
        if(seed>.83&&Math.hypot(b.x-a.x,b.y-a.y)>5){
          const z=Math.floor(mid.z/32)*32-8-Math.floor(seed*3)*16,A={...mid,z:clamp(z,low,Math.min(mid.z,high))},B={x:mid.x+(b.x-a.x)*.22,y:mid.y+(b.y-a.y)*.22,z:clamp(z-10,low,Math.min(mid.z,high))};
          if(A.z>B.z)scene.wire(A,B,P.hairDark,1,.32);
        }
        if(mode!=='below'){
          const bottom=p=>({...p,z:Math.max(low,p.z-(kind==='grass'?4:6))});
          const lip=kind==='grass'?blend(P.pine,P.hairDark,.35):kind==='asphalt'||kind==='ice'?blend(P.steelShade,P.dark,.35):kind==='tile'?blend(P.cream,P.hairDark,.35):blend(P.clay,P.hairDark,.52);
          scene.flat([a,b,bottom(b),bottom(a)],lip);
          scene.wire(a,b,P.hairDark,2,.85);
          scene.wire({...a,z:a.z+.6},{...b,z:b.z+.6},kind==='grass'?P.sage:P.gold,1,.45);
        }
      }
    }
    function courseTile(w,background,x,y) {
      const key=x+','+y;if(background.tiles.has(key)){const tile=background.tiles.get(key);if(tile.ready===false){if(background.working){background.pending++;queueScenery('floor',key,x,y);}else{background.tiles.delete(key);return courseTile(w,background,x,y);}}background.tiles.delete(key);background.tiles.set(key,tile);return tile;}
      const Course=root.CartCourse,size=256,area=quad(x*size,y*size,size,size),q=area.map(p=>project(p)),left=Math.floor(Math.min(...q.map(p=>p.x)))-5,top=Math.floor(Math.min(...q.map(p=>p.y)))-140;
      const c=document.createElement('canvas');c.width=Math.ceil(Math.max(...q.map(p=>p.x))-left)+8;c.height=Math.ceil(Math.max(...q.map(p=>p.y))-top)+12;
      const g=c.getContext('2d');g.translate(-left,-top);
      if(background.working){
        // A cheap complete floor stays visible until the identical detailed
        // tile arrives. Physics always samples the full terrain on this thread.
        const areas=Course.query(w.level.floorAreas,w.level.floorGrid,{x:(x+.5)*size,y:(y+.5)*size},184).sort((a,b)=>(a.kind==='grass'?0:a.kind==='tile'?2:1)-(b.kind==='grass'?0:b.kind==='tile'?2:1));
        for(const a of areas){const p=clipPolygon(clipPolygon(clipPolygon(clipPolygon(a.poly,'x',x*size,1),'x',(x+1)*size,-1),'y',y*size,1),'y',(y+1)*size,-1);if(p.length>=3)groundPoly(g,p.map(onGround),a.kind==='grass'?P.pine:a.kind==='tile'?P.cream:a.kind==='dirt'?P.clay:P.steelShade);}
        const tile={canvas:c,x:left,y:top,ready:false};background.tiles.set(key,tile);trimTiles(background.tiles,32);background.pending++;queueScenery('floor',key,x,y);return tile;
      }
      const tileBounds={x:x*size,y:y*size,w:size,h:size},surfaceTints=new Map();
      const legs=w.level.legs.filter(l=>Math.max(l.a.x,l.b.x)+l.width>x*size&&Math.min(l.a.x,l.b.x)-l.width<(x+1)*size&&Math.max(l.a.y,l.b.y)+l.width>y*size&&Math.min(l.a.y,l.b.y)-l.width<(y+1)*size);
      const roadAt=(p,kind)=>{let best=null;for(const l of legs)if(l.surface===kind){const q=Course.nearest(p,l.a,l.b);if(!best||q.d<best.d)best={...q,leg:l};}return best;};
      const surfaceTint=(kind,xx,yy)=>{
        const key=kind+','+xx+','+yy;if(surfaceTints.has(key))return surfaceTints.get(key);
        const broad=noise(xx,yy,72),fine=noise(xx+317,yy-109,21),road=kind==='dirt'||kind==='asphalt'?roadAt({x:xx,y:yy},kind):null;
        let color;
        if(kind==='grass')color=blend(blend(P.pine,P.sage,.14+broad*.19),P.dark,fine*.055);
        else if(kind==='dirt'){
          color=blend(blend(P.clay,P.gold,.24+broad*.26),P.hairDark,(1-fine)*.075);
          if(road){
            const edge=clamp(road.d/(road.leg.width/2),0,1),track=Math.exp(-(((road.d-road.leg.width*.22)/9)**2));
            color=blend(color,P.gold,track*(.13+fine*.08));color=blend(color,P.hairDark,edge**8*.17);
          }
        }else if(kind==='asphalt'){
          color=blend(blend(P.steelShade,P.dark,.42),P.steel,broad*.055+fine*.025);
          if(road){
            const edge=clamp(road.d/(road.leg.width/2),0,1),wear=Math.exp(-((road.d/(road.leg.width*.3))**2));
            color=blend(color,P.steel,wear*.065);color=blend(color,P.dark,edge**8*.12);
          }
        }else color=blend(P.cream,P.coral,.15);
        surfaceTints.set(key,color);return color;
      };
      const candidates=Course.query(w.level.floorAreas,w.level.floorGrid,{x:(x+.5)*size,y:(y+.5)*size},size*.72).sort((a,b)=>(a.kind==='grass'?0:a.kind==='tile'?2:1)-(b.kind==='grass'?0:b.kind==='tile'?2:1));
      for(const a of candidates)mesh(g,a.poly,(xx,yy)=>surfaceTint(a.kind,xx,yy),tileBounds);
      // Low, soft rail shadows stay in the floor cache and follow its elevation.
      for(const rail of w.level.rails){
        const b=rail.bounds;if(b.right+10<x*size||b.left>(x+1)*size||b.bottom+8<y*size||b.top>(y+1)*size)continue;
        for(const [dx,dy,strength]of [[9,6,.09],[5,3,.13]])mesh(g,[rail.a,rail.b,add(rail.b,dx,dy),add(rail.a,dx,dy)],(xx,yy)=>{const s=Course.sample(w.level,{x:xx,y:yy},false);return blend(surfaceTint(s?.kind||'grass',xx,yy),P.dark,strength);},tileBounds,s=>s.kind!=='tile');
      }
      const strip=f=>{const c=Math.cos(f.a),s=Math.sin(f.a);return [[0,-f.width/2],[f.length,-f.width/2],[f.length,f.width/2],[0,f.width/2]].map(([u,v])=>({x:f.x+u*c-v*s,y:f.y+u*s+v*c}));};
      for(const [f,color]of [[w.level.terrain.ice,blend(P.blue,P.light,.45)],[w.level.terrain.boost,P.gold]])mesh(g,strip(f),color,{x:x*size,y:y*size,w:size,h:size},true);
      const bumps=w.level.terrain.bumps;
      for(const u of bumps.centers)for(let v=-bumps.width/2;v<bumps.width/2;v+=10){const b={x:bumps.x,y:bumps.y,a:bumps.a};mesh(g,[local(b,u-5,v),local(b,u+5,v),local(b,u+5,v+10),local(b,u-5,v+10)],Math.floor(v/10)%2?P.gold:P.dark,{x:x*size,y:y*size,w:size,h:size},true);}
      for(let yy=y*size;yy<(y+1)*size;yy+=8)for(let xx=x*size;xx<(x+1)*size;xx+=8){
        const h=hash(xx,yy),p=onGround({x:xx+h*6,y:yy+hash(yy,xx)*6}),surface=Course.sample(w.level,p,false);if(!surface)continue;const a=project(p);
        if(surface.kind==='grass'){
          if(h>.57){line(g,a,{x:a.x-2,y:a.y-3},h>.82?P.sage:P.pine,1);line(g,a,{x:a.x+2,y:a.y-2},P.pine,1);}
          if(h>.965){rect(g,a.x,a.y-3,2,1,P.cream);rect(g,a.x+1,a.y-2,1,1,P.gold);}
        }else if(surface.kind==='dirt'){
          if(h>.38){g.globalAlpha=.13;rect(g,a.x,a.y,1,1,h>.7?P.hairDark:P.light);g.globalAlpha=1;}
          if(h>.84){const r=.8+hash(xx,yy+37)*1.1;
            groundPoly(g,[{x:p.x-r,y:p.y},{x:p.x,y:p.y-r*.7},{x:p.x+r,y:p.y},{x:p.x,y:p.y+r*.7}].map(onGround),blend(P.clay,P.hairDark,.3));
            rect(g,a.x-1,a.y-1,r>1.5?2:1,1,blend(P.gold,P.cream,.3));
          }
          if(h>.94){const road=roadAt(p,'dirt');if(road){const angle=Math.atan2(road.leg.b.y-road.leg.a.y,road.leg.b.x-road.leg.a.x),end={x:p.x+Math.cos(angle)*9,y:p.y+Math.sin(angle)*9};if(Course.sample(w.level,end,false)?.kind==='dirt')groundLine(g,p,onGround(end),P.hairDark,1,.2);}}
        }else if(surface.kind==='asphalt'){
          if(h>.28){g.globalAlpha=h>.87?.2:.09;rect(g,a.x,a.y,1,1,h>.65?P.steelLight:P.dark);g.globalAlpha=1;}
          if(h>.977){const angle=hash(yy,xx+53)*Math.PI*2,b={x:p.x+Math.cos(angle)*7,y:p.y+Math.sin(angle)*7},c={x:b.x+Math.cos(angle+.7)*6,y:b.y+Math.sin(angle+.7)*6};
            if([b,c].every(q=>Course.sample(w.level,q,false)?.kind==='asphalt')){groundLine(g,p,onGround(b),P.dark,1,.45);groundLine(g,onGround(b),onGround(c),P.dark,1,.4);}
          }
        }else if(surface.kind==='ice'){
          if(h>.7)groundLine(g,p,onGround({x:p.x+8,y:p.y+5}),P.light,1,.7);
          if(h>.93){groundLine(g,p,onGround({x:p.x-7,y:p.y+10}),P.blue,1,.7);groundLine(g,p,onGround({x:p.x+3,y:p.y+12}),P.blue,1,.5);}
        }
      }
      for(const store of w.level.stores){if(store.x>x*size+size||store.x+store.w<x*size||store.y>y*size+size||store.y+store.h<y*size)continue;
        for(let yy=Math.max(store.y,Math.floor(y*size/20)*20);yy<Math.min(store.y+store.h,(y+1)*size);yy+=20)for(let xx=Math.max(store.x,Math.floor(x*size/20)*20);xx<Math.min(store.x+store.w,(x+1)*size);xx+=20){const ww=Math.min(20,store.x+store.w-xx),hh=Math.min(20,store.y+store.h-yy);mesh(g,quad(xx+.5,yy+.5,ww-1,hh-1),(Math.floor((xx-store.x)/20)+Math.floor((yy-store.y)/20))%2?blend(P.light,P.sage,.13):blend(P.cream,P.coral,.12),{x:x*size,y:y*size,w:size,h:size});}
      }
      background.roadArt||=courseRoadArt(w.level);
      const roadPaint=s=>s.kind!=='tile'&&s.kind!=='grass';
      for(const curb of background.roadArt.bands){const b=curb.bounds;if(b.right<x*size||b.left>(x+1)*size||b.bottom<y*size||b.top>(y+1)*size)continue;
        const color=curb.red?blend(P.raceRed||P.brick,P.brick,.32):blend(P.cream,P.gold,.08),p=curb.poly;
        const inset=t=>[add(p[0],(p[3].x-p[0].x)*t,(p[3].y-p[0].y)*t),add(p[1],(p[2].x-p[1].x)*t,(p[2].y-p[1].y)*t)];
        mesh(g,p,blend(color,P.dark,.28),tileBounds,roadPaint);
        mesh(g,[...inset(.17),p[2],p[3]],color,tileBounds,roadPaint);
        mesh(g,[...inset(.83),p[2],p[3]],blend(color,P.light,.24),tileBounds,roadPaint);
      }
      for(const arrow of background.roadArt.arrows){const b=arrow.bounds;if(b.right<x*size||b.left>(x+1)*size||b.bottom<y*size||b.top>(y+1)*size)continue;
        mesh(g,arrow.poly,arrow.surface==='dirt'?blend(P.cream,P.gold,.28):blend(P.cream,P.steel,.1),tileBounds,s=>s.kind===arrow.surface);
      }
      for(const f of [w.level.terrain.boost,w.level.terrain.ramp]){for(let u=10;u<f.length;u+=15){const p=onGround(local(f,u,0));if(p.x<x*size||p.x>=(x+1)*size||p.y<y*size||p.y>=(y+1)*size)continue;groundArrow(g,{...p,a:f.a},8,f===w.level.terrain.boost?P.hairDark:P.gold,.95);}}
      slopePaint(g,w,{x:x*size,y:y*size,w:size,h:size});
      const tile={canvas:c,x:left,y:top};background.tiles.set(key,tile);trimTiles(background.tiles,32);return tile;
    }
    function courseGround(g,w,bounds,detailed=true) {
      const base=blend(blend(P.pine,P.hairDark,.4),P.dark,.48),size=48;
      rect(g,bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top,base);
      const area=root.CartCourse.bounds([
        {x:bounds.left-40,y:bounds.top-40},{x:bounds.right+40,y:bounds.top-40},
        {x:bounds.right+40,y:bounds.bottom+40},{x:bounds.left-40,y:bounds.bottom+40}
      ].map(p=>unproject(p,LOWER_GROUND)));
      // World-anchored earth and small surface marks stay still during camera
      // movement. The lower plane matches the cart's actual rock impact level.
      for(let y=Math.floor(area.top/size)*size;y<=area.bottom;y+=size)for(let x=Math.floor(area.left/size)*size;x<=area.right;x+=size){
        const tint=blend(base,blend(P.pine,P.clay,noise(x+24,y+24,170)),.055+noise(x,y,240)*.035);
        groundPoly(g,quad(x,y,size,size,LOWER_GROUND),tint);
        if(!detailed)continue;
        const seed=hash(x,y),p={x:x+8+hash(x+11,y)*32,y:y+8+hash(x,y+19)*32,z:LOWER_GROUND};
        if(seed>.66){
          groundPoly(g,[add(p,-4,0),add(p,1,-3),add(p,5,0),add(p,1,3)],P.dark,.2);
          groundPoly(g,[add(p,-3,0,1),add(p,0,-2,2),add(p,3,0,2),add(p,0,2,1)],P.clay,.28);
          groundLine(g,add(p,-2,0,1),add(p,1,-1,2),P.floor,1,.22);
        }else if(seed>.3){
          for(let i=0;i<3;i++){const a=add(p,i*3,0);groundLine(g,a,add(a,-2+i,-1,3+hash(x+i,y)*3),P.pine,1,.38);}
        }
        const q=project(add(p,12,-7));rect(g,q.x,q.y,2,1,blend(base,P.clay,.2));
      }
      for(const h of w.level.hazards){
        groundPoly(g,circle({...h,z:-50},h.rx,h.ry),blend(P.blue,P.dark,.22));
        for(let i=0;i<22;i++){const a=i*2.399,p={x:h.x+Math.cos(a)*h.rx*.75,y:h.y+Math.sin(a)*h.ry*.75,z:-49};groundLine(g,p,{x:p.x+14,y:p.y-4,z:-49},P.light,1,.25);}
      }
    }
    function rockTile(w,x,y){
      const size=512,tile=document.createElement('canvas');tile.width=tile.height=size;
      const target=tile.getContext('2d');target.translate(-x*size,-y*size);
      courseGround(target,w,{left:x*size,top:y*size,right:(x+1)*size,bottom:(y+1)*size});
      const visible=(p,r)=>{const q=project(p);return q.x>=x*size-r&&q.x<=(x+1)*size+r&&q.y>=y*size-r&&q.y<=(y+1)*size+r;};
      const scene=new Scene();cliffFaces(scene,w,visible,'below');scene.flush(target);return tile;
    }
    function courseRocks(g,w,background,camera,follow) {
      // The lower cliffs never move or interleave with the cart. Rasterize them
      // once in bounded screen-space tiles, just like the supporting floor.
      if(!follow){
        let map=background.rockMap;
        if(!map||map.width!==g.canvas.width||map.height!==g.canvas.height){
          map=document.createElement('canvas');map.width=g.canvas.width;map.height=g.canvas.height;
          const target=map.getContext('2d');target.translate(camera.x,camera.y);target.scale(camera.scale,camera.scale);
          courseGround(target,w,{left:-camera.x/camera.scale,top:-camera.y/camera.scale,right:(map.width-camera.x)/camera.scale,bottom:(map.height-camera.y)/camera.scale},false);
          const scene=new Scene();cliffFaces(scene,w,()=>true,'below');scene.flush(target);background.rockMap=map;
        }
        g.drawImage(map,-camera.x/camera.scale,-camera.y/camera.scale,map.width/camera.scale,map.height/camera.scale);return;
      }
      const size=512,left=-camera.x/camera.scale,top=-camera.y/camera.scale,right=left+g.canvas.width/camera.scale,bottom=top+g.canvas.height/camera.scale;
      for(let y=Math.floor(top/size);y<=Math.floor(bottom/size);y++)for(let x=Math.floor(left/size);x<=Math.floor(right/size);x++){
        const key=x+','+y;let tile=background.rocks.get(key);
        if(!tile||tile.ready===false&&!background.working)tile=background.working?{canvas:null,ready:false}:{canvas:rockTile(w,x,y),ready:true};
        if(tile.ready===false){background.pending++;queueScenery('rock',key,x,y);}
        background.rocks.delete(key);background.rocks.set(key,tile);
        if(tile.canvas)g.drawImage(tile.canvas,x*size,y*size);
        trimTiles(background.rocks,24);
      }
    }
    function courseTree(scene,p) {
      // Grow each evergreen once, then keep its detailed pixel art in the
      // scenery cache. Tree randomness never touches the simulation's seed.
      const key=p.x+','+p.y,old=treeSprites.get(key);
      if(old){scene.push(old.bounds,old.draw,old.bias);return;}
      const seed=Math.round(p.x*7+p.y*11),random=n=>hash(seed,n),size=.85+random(1)*.3;
      const base=LOWER_GROUND,height=(100+random(2)*24)*size,radius=(26+random(3)*7)*size;
      const lean={x:(random(4)-.5)*8,y:(random(5)-.5)*8},model=new Scene();
      const at=(x,y,z)=>({x:p.x+x+lean.x*(z-base)/height,y:p.y+y+lean.y*(z-base)/height,z});
      const moss=blend(P.pine,P.dark,.5),bark=blend(P.hair,P.clay,.16);
      const ground=Array.from({length:18},(_,i)=>{const a=i*Math.PI/9,r=radius*(.56+random(10+i)*.16);return at(Math.cos(a)*r,Math.sin(a)*r,base-1);});
      model.flat(ground,moss,.65);
      model.flat(circle(at(3,4,base),radius*.56,radius*.4,0,20),P.dark,.3);
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3+random(31),r=(9+random(32+i)*8)*size;
        model.tube(at(Math.cos(a)*r,Math.sin(a)*r,base),at(0,0,base+7),.7*size,2.3*size,bark,5);
      }
      model.tube(at(0,0,base),at(0,0,base+height-6),3.2*size,.5*size,bark,7);
      for(let i=0;i<8;i++){
        const z=base+4+i*3.1*size;
        model.wire(at(1.8*size,.5*size,z),at(1.4*size,1.4*size,z+2.5*size),i%3?P.hairDark:P.hairLight,1,.65);
      }
      const tiers=8,count=14,phase=random(40)*Math.PI*2;
      for(let tier=0;tier<tiers;tier++){
        const t=tier/(tiers-1),z=base+height*(.23+t*.65),r=radius*(1-t*.83),rise=height*(.19-t*.06);
        const twist=phase+tier*.43,center=at((random(50+tier)-.5)*4,(random(60+tier)-.5)*4,z+rise);
        const ring=Array.from({length:count},(_,i)=>{
          const a=i*Math.PI*2/count+twist,reach=r*(.8+random(100+tier*count+i)*.28);
          return {a,tip:at(Math.cos(a)*reach,Math.sin(a)*reach,z+(random(220+tier*count+i)-.5)*6*size),shoulder:at(Math.cos(a)*reach*.58,Math.sin(a)*reach*.58,z+rise*.62)};
        });
        for(let i=0;i<count;i++){
          const a=ring[i],b=ring[(i+1)%count],lit=clamp(.5-Math.cos(a.a)*.22+Math.sin(a.a)*.48,0,1);
          const green=blend(blend(P.pine,P.dark,(1-t)*.14),P.sage,.06+lit*.38+random(340+tier*count+i)*.08);
          model.face([center,a.shoulder,b.shoulder],green);
          model.face([a.shoulder,a.tip,b.tip,b.shoulder],green);
          // Dark hanging needles give every bough a broken, drooping edge.
          model.flat([a.tip,add(a.tip,0,0,-3*size),b.tip],blend(P.pine,P.dark,.3));
          if(tier<3)model.wire(at(0,0,z+rise*.18),a.tip,blend(bark,P.pine,.4),1,.7);
          for(let j=0;j<4;j++){
            const n=500+tier*count*4+i*4+j,u=.28+random(n)*.69,angle=a.a+(random(n+900)-.5)*Math.PI*2/count;
            const surface=u<.58?1-u*.38/.58:.62*(1-u)/.42;
            const reach=r*u,c=at(Math.cos(angle)*reach,Math.sin(angle)*reach,z+rise*surface+(random(n+1800)*2+.3)*size);
            const leaf=shade(green,normalize({x:Math.cos(angle)*.55,y:Math.sin(angle)*.55,z:.8}));
            const length=(2.2+random(n+2700)*2.8)*size,needle=blend(leaf,lit>.6?P.sage:P.dark,.08+random(n+3600)*.17);
            const tip=add(c,Math.cos(angle)*length,Math.sin(angle)*length,-size);
            model.wire(c,tip,needle,1);
            for(const side of [-1,1])model.wire(add(c,Math.cos(angle+side*.85)*length*.7,Math.sin(angle+side*.85)*length*.7,size*.7),tip,needle,1);
          }
        }
      }
      model.wire(at(0,0,base+height*.9),at(0,0,base+height),P.sage,1);
      const points=model.commands.flatMap(c=>c.mesh.points),screen=points.map(q=>project(q));
      const x=Math.floor(Math.min(...screen.map(q=>q.x)))-2,y=Math.floor(Math.min(...screen.map(q=>q.y)))-2;
      const image=document.createElement('canvas');image.width=Math.ceil(Math.max(...screen.map(q=>q.x)))-x+3;image.height=Math.ceil(Math.max(...screen.map(q=>q.y)))-y+3;
      model.flush(image.getContext('2d'),{x:CAMERA.x-x,y:CAMERA.y-y});
      const bounds=quad(x,y,image.width,image.height).map(q=>unproject(q));
      const bias=depth(at(0,0,base+height*.45))-bounds.reduce((sum,q)=>sum+depth(q),0)/bounds.length;
      const draw=(g,origin)=>g.drawImage(image,x+origin.x-CAMERA.x,y+origin.y-CAMERA.y);
      if(treeSprites.size>=32)treeSprites.delete(treeSprites.keys().next().value);
      treeSprites.set(key,{bounds,draw,bias});scene.push(bounds,draw,bias);
    }
    function spaceCourseTrees(scene,level) {
      // Reserve each road's projected column from the cliff foot to its rails
      // or shop walls. A clear trunk alone does not protect a wide tree crown.
      const blockers=level.floorAreas.map(area=>{
        const height=Math.max(...area.poly.map(p=>Terrain.height(level,p)))+(area.kind==='tile'?56:34);
        return root.CartCourse.bounds(area.poly.flatMap(p=>[project({...p,z:-105}),project({...p,z:height})]));
      });
      const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,placed=[],sources=level.decor.filter(p=>p.kind==='tree');
      for(let index=0;index<scene.commands.length;index++){
        const command=scene.commands[index],source=sources[index],origin=project({...source,z:LOWER_GROUND});
        const original=command.bounds;let chosen=null;
        for(let radius=0;radius<=1024&&!chosen;radius+=24)for(let i=0;i<(radius?16:1);i++){
          const angle=Math.PI/2+i*Math.PI/8,dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
          const bounds={left:original.left+dx-10,right:original.right+dx+10,top:original.top+dy-10,bottom:original.bottom+dy+10};
          if(blockers.some(b=>overlap(bounds,b))||placed.some(b=>overlap(bounds,b)))continue;
          const position=unproject({x:origin.x+dx,y:origin.y+dy},LOWER_GROUND);
          if(level.hazards.some(h=>((position.x-h.x)/(h.rx+40))**2+((position.y-h.y)/(h.ry+40))**2<1))continue;
          chosen={dx,dy,bounds,position};break;
        }
        if(!chosen){command.draw=()=>{};continue;}
        const {dx,dy,bounds,position}=chosen,draw=command.draw;
        command.draw=(g,origin)=>draw(g,{x:origin.x+dx,y:origin.y+dy});
        command.bounds={left:original.left+dx,right:original.right+dx,top:original.top+dy,bottom:original.bottom+dy};
        command.depth+=dy/CAMERA.vertical;command.treePosition=position;placed.push(bounds);
      }
    }
    function courseModels(scene,w,visible,mode='all') {
      const tr=(x,y,z)=>({x,y,z:z+Terrain.height(w.level,{x,y})});
      if(mode!=='dynamic'){
      cliffFaces(scene,w,visible);
      for(const r of w.level.rails)if(visible({x:(r.a.x+r.b.x)/2,y:(r.a.y+r.b.y)/2},Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)/2+70)){
        scene.flat(r.poly.map(onGround),P.steelShade);
        const d=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y);
        scene.wire(tr(r.a.x,r.a.y,12),tr(r.b.x,r.b.y,12),P.dark,4);scene.wire(tr(r.a.x,r.a.y,13),tr(r.b.x,r.b.y,13),P.steelLight,2);
        scene.wire(tr(r.a.x,r.a.y,18),tr(r.b.x,r.b.y,18),P.steel,2);
        for(let u=(36-r.distance%36)%36;u<=d;u+=36){const p={x:r.a.x+(r.b.x-r.a.x)*u/d,y:r.a.y+(r.b.y-r.a.y)*u/d};scene.box(tr,p.x-1.5,p.y-1.5,0,3,3,19,P.steelShade,P.steel,true);}
      }
      for(const r of w.level.walls)if(r.side==='store'&&visible({x:r.x+r.w/2,y:r.y+r.h/2},180)){
        const far=r.w>r.h?r.y<w.level.stores.find(s=>s.chapter===r.chapter).y+10:r.x<w.level.stores.find(s=>s.chapter===r.chapter).x+10;
        coursePrism(scene,r.poly,0,far?32:9,blend(P.floor,P.cream,.4),P.cream);
        coursePrism(scene,r.poly,far?22:5,far?25:7,P.sage,P.sage);
      }
      for(const store of w.level.stores)if(visible({x:store.x+store.w/2,y:store.y+store.h/2},400)){
        const e=store.entry,v=e.side==='left'||e.side==='right',x=v?(e.side==='left'?store.x:store.x+store.w):e.center,y=v?e.center:(e.side==='top'?store.y:store.y+store.h),span=e.width/2+7;
        for(const sign of [-1,1])scene.box(tr,x+(v?-4:sign*span-4),y+(v?sign*span-4:-4),0,8,8,48,P.steelShade,P.steel);
        const roof=v?quad(x-6,y-span-7,12,span*2+14):quad(x-span-7,y-6,span*2+14,12);coursePrism(scene,roof,45,53,P.pine,P.sage);
        const tex=labelTexture(store.name,110,12),points=v?[{x:x+6,y:y-span,z:35},{x:x+6,y:y+span,z:35},{x:x+6,y:y+span,z:47},{x:x+6,y:y-span,z:47}]:[{x:x+span,y:y+6,z:35},{x:x-span,y:y+6,z:35},{x:x-span,y:y+6,z:47},{x:x+span,y:y+6,z:47}];scene.texture(points,tex);
      }
      for(const s of w.level.sections){
        const b=s.start,n={x:-Math.sin(b.a),y:Math.cos(b.a)},p={x:b.x+n.x*(s.width/2-8),y:b.y+n.y*(s.width/2-8)};
        if(!visible(p,55))continue;
        scene.box(tr,p.x-1.5,p.y-1.5,0,3,3,27,P.steelShade,P.steel);
        const points=[{x:p.x+2,y:p.y-10,z:18},{x:p.x+2,y:p.y+10,z:18},{x:p.x+2,y:p.y+10,z:32},{x:p.x+2,y:p.y-10,z:32}];
        const elevated=points.map(p=>({...p,z:p.z+Terrain.height(w.level,p)}));scene.flat(elevated,P.gold);scene.texture(elevated,labelTexture(String(s.index+1).padStart(2,'0'),24,14));
      }
      }
      if(mode!=='static'){
      for(const d of w.trackDoors)if(!d.broken&&visible({x:d.cx,y:d.cy},100)){
        const poly=root.CartCourse.doorPolygon(d);scene.flat(poly.map(p=>({...p,z:2})),P.steelShade,.2);
        const a={x:d.cx,y:d.cy},b={x:d.cx+Math.cos(d.a)*d.length,y:d.cy+Math.sin(d.a)*d.length};
        scene.flat([{...a,z:3},{...b,z:3},{...b,z:35},{...a,z:35}],P.blue,.22);
        for(const z of [2,18,36])scene.wire({...a,z},{...b,z},P.steel,1,.9);
        for(const p of [a,b])scene.wire({...p,z:2},{...p,z:36},P.steelLight,2,.9);
      }
      const relay=w.level.terrain.circuit,c=w.circuit,d=relay.shutter;
      if(visible({x:d.x,y:d.y+50},170)){
        scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y-6,0,12,7,64,P.steelShade,P.steelLight);scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y+d.h-1,0,12,7,64,P.steelShade,P.steelLight);
        scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y-6,61,12,d.h+12,6,P.dark,P.steel);
        if(c.lift<1){coursePrism(scene,d.poly,c.lift*62,c.lift*62+50,blend(P.steelShade,P.blue,.18),P.steel);for(let z=5;z<50;z+=5)scene.wire({x:d.x+6,y:d.y,z:c.lift*62+z},{x:d.x+6,y:d.y+d.h,z:c.lift*62+z},P.steelLight,1,.5);}
        const status=[{x:d.x+7,y:d.y+5,z:50},{x:d.x+7,y:d.y+14,z:50},{x:d.x+7,y:d.y+14,z:57},{x:d.x+7,y:d.y+5,z:57}];scene.flat(status,c.powered?P.sage:P.raceRed);
        scene.texture([{x:d.x+7,y:d.y+30,z:52},{x:d.x+7,y:d.y+85,z:52},{x:d.x+7,y:d.y+85,z:62},{x:d.x+7,y:d.y+30,z:62}],labelTexture(c.powered?'OPEN':'WATER RELAY',72,12));
        const tray=relay.tray;scene.flat(quad(tray.x,tray.y,tray.w,tray.h,.08),P.blue,.12);
        relay.terminals.forEach((p,i)=>{const leadY=i?tray.y+tray.h+12:tray.y-12,leadX=d.x-12+i*5;scene.box((x,y,z)=>({x,y,z}),p.x-3,p.y-3,.15,6,6,.7,P.steelShade,P.gold);scene.wire({x:p.x,y:p.y+(i?4:-4),z:.5},{x:p.x,y:leadY,z:.5},P.dark,2);scene.wire({x:p.x,y:leadY,z:.5},{x:leadX,y:leadY,z:.5},P.dark,2);scene.wire({x:leadX,y:leadY,z:.5},{x:leadX,y:d.y-9,z:.5},P.dark,2);scene.wire({x:leadX,y:d.y-9,z:.5},{x:leadX,y:d.y-9,z:45},P.dark,2);});
        if(c.connected)for(const key of c.path){const x=key%w.stock.cols*4,y=Math.floor(key/w.stock.cols)*4;scene.flat(quad(x+1,y+1,2,2,.2),P.blue,.65);}
      }
      }
    }
    function drawCourse(g,w,background,options) {
      terrainLevel=w.level;
      background.pending=0;
      background.working=!options.preview&&options.follow!==false&&startScenery(background,w.level);
      const Course=root.CartCourse,width=g.canvas.width,height=g.canvas.height,camera=connectedCamera(width,height,w,options.follow!==false,options.focusY),visible=(p,r=100)=>{const q=project(p);return camera.x+q.x*camera.scale>-r&&camera.x+q.x*camera.scale<width+r&&camera.y+q.y*camera.scale>-r&&camera.y+q.y*camera.scale<height+r;};w._visible=visible;
      g.save();g.imageSmoothingEnabled=false;rect(g,0,0,width,height,blend(P.pine,P.dark,.6));g.translate(camera.x,camera.y);g.scale(camera.scale,camera.scale);
      if(options.shake&&!options.reducedMotion)g.translate(Math.sin(w.time*99)*options.shake*.45,Math.cos(w.time*78)*options.shake*.45);
      courseRocks(g,w,background,camera,options.follow!==false);
      if(!background.trees||background.treesEpoch!==cacheEpoch){
        background.trees=new Scene(1,true);background.treesEpoch=cacheEpoch;
        for(const p of w.level.decor)if(p.kind==='tree')courseTree(background.trees,p);
        spaceCourseTrees(background.trees,w.level);
        background.trees.commands.sort((a,b)=>a.depth-b.depth);
      }
      // Whole tree sprites stay clear of the track silhouette and stand on
      // the textured lower ground, behind the elevated driving surface.
      for(const command of background.trees.commands){
        const b=command.bounds;
        if(camera.x+b.right*camera.scale<0||camera.x+b.left*camera.scale>width||camera.y+b.bottom*camera.scale<0||camera.y+b.top*camera.scale>height)continue;
        command.draw(g,CAMERA);
      }
      if(options.follow===false){
        let map=background.floorMap;
        if(!map||map.width!==width||map.height!==height){
          map=document.createElement('canvas');map.width=width;map.height=height;const target=map.getContext('2d');target.translate(camera.x,camera.y);target.scale(camera.scale,camera.scale);
          for(const a of w.level.floorAreas)groundPoly(target,a.poly.map(onGround),a.kind==='grass'?P.pine:a.kind==='tile'?P.cream:a.kind==='dirt'?P.clay:P.steelShade);background.floorMap=map;
          slopePaint(target,w);
        }
        g.drawImage(map,-camera.x/camera.scale,-camera.y/camera.scale,width/camera.scale,height/camera.scale);
      }
      else{
        const corners=[{x:-80,y:-80},{x:width+80,y:-80},{x:width+80,y:height+80},{x:-80,y:height+80}].map(p=>unproject({x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale})),b=Course.bounds(corners);
        for(let y=Math.max(0,Math.floor(b.top/256));y<=Math.min(Math.floor(w.level.bounds.bottom/256),Math.floor(b.bottom/256));y++)for(let x=Math.max(0,Math.floor(b.left/256));x<=Math.min(Math.floor(w.level.bounds.right/256),Math.floor(b.right/256));x++){const key=x+','+y;if(!background.floorPresence.has(key))background.floorPresence.set(key,!!Course.query(w.level.floorAreas,w.level.floorGrid,{x:(x+.5)*256,y:(y+.5)*256},184).length);if(!background.floorPresence.get(key))continue;const tile=courseTile(w,background,x,y);g.drawImage(tile.canvas,tile.x,tile.y);}
      }
      spills(g,w.stock,visible);shadows(g,w);
      for(const t of w.tracks)if(visible(t))groundLocal(g,onGround(t),-2,-1,4,1,P.hairDark,t.life/3*.25);
      if(options.follow===false)for(const l of w.level.legs)if(l.length>90){const p={...onGround({x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2}),a:Math.atan2(l.b.y-l.a.y,l.b.x-l.a.x)};if(visible(p))groundArrow(g,p,20,P.cream,.8);}
      const start=w.level.sections[0].start;
      if(visible(start,120))for(let row=0;row<8;row++)for(let col=0;col<2;col++)groundPoly(g,quad(start.x+55+col*10,start.y-40+row*10,10,10),(row+col)%2?P.light:P.hairDark);
      const f=w.level.finish;if(visible({...f,z:Terrain.height(w.level,f)},160))for(let y=-60;y<60;y+=15)for(let x=-15;x<30;x+=15)groundPoly(g,quad(f.x+x,f.y+y,15,15).map(onGround),(Math.round((x+y)/15)%2)?P.light:P.dark);
      const target=w.level.gates[w.gate];if(target){groundRing(g,onGround(target),20,target.visible?P.light:P.gold,2,.8);const p=project(onGround(target));text(g,w.gate===w.level.gates.length-1?'FINISH':target.visible?String(target.room+1).padStart(2,'0'):'GO',p.x,p.y+3,P.hairDark,8,'center');}
      if(!options.preview)trickFloor(g,w,options);
      if(!background.scenery||background.sceneryEpoch!==cacheEpoch){
        background.scenery=new Scene(1,true);background.sceneryEpoch=cacheEpoch;courseModels(background.scenery,w,()=>true,'static');
      }
      const scene=new Scene(),left=-camera.x/camera.scale,top=-camera.y/camera.scale,right=left+width/camera.scale,bottom=top+height/camera.scale;
      if(options.follow===false){
        // At overview scale fixed scenery is a backdrop; keep the live cart,
        // stock, doors and relay updating above it rather than issuing thousands
        // of subpixel cliff paths every frame.
        let map=background.sceneryMap;
        if(!map||map.width!==width||map.height!==height||background.sceneryMapEpoch!==cacheEpoch){
          map=document.createElement('canvas');map.width=width;map.height=height;const target=map.getContext('2d');target.translate(camera.x,camera.y);target.scale(camera.scale,camera.scale);background.scenery.flush(target);background.sceneryMap=map;background.sceneryMapEpoch=cacheEpoch;
        }
        g.drawImage(map,left,top,width/camera.scale,height/camera.scale);
      }else {
        for(const command of background.scenery.visibleCommands({left:left-4,top:top-4,right:right+4,bottom:bottom+4}))scene.commands.push(command);
        // Keep the original tie order after culling, with live models last.
        scene.sequence=background.scenery.sequence;
      }
      courseModels(scene,w,visible,'dynamic');if(w.fall||w.body.z<w.ground.lastHeight-2)cliffFaces(scene,w,visible,'occlude');
      for(const s of w.shelves)if(visible({x:s.cx,y:s.cy},170))cachedModel(scene,s,shelfFields,shelf);
      for(const p of w.stock.items)if(!p.broken&&visible(p))cachedModel(scene,p,productFields,product,p.state==='shelf'?[p.shelf,...shelfFields.map(k=>p.shelf[k])]:[]);
      for(const o of w.objects)if(!o.gone&&visible(o))prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper,ragdoll:w.ragdoll},w.wheels,w.gait);
      for(const p of options.particles||[])if(visible(p))scene.flat(quad(p.x,p.y,p.w,p.h,p.z),p.color,clamp(p.life,0,1));
      scene.flush(g,CAMERA,options.follow===false?(background.commandRasters||=new Map()):null);
      if(w.fall?.kind==='lake'&&w.fall.impactTime!==null){const t=w.fall.impactTime;groundRing(g,{...w.body,z:-50},12+t*32,P.light,2,1-t);groundRing(g,{...w.body,z:-50},7+t*22,P.blue,2,.65-t*.5);}
      if(!w.fall){const speed=Math.hypot(w.body.vx,w.body.vy);if(speed>8)groundArrow(g,{...onGround({x:w.body.x+w.body.vx*.5,y:w.body.y+w.body.vy*.5}),a:Math.atan2(w.body.vy,w.body.vx)},10,P.light,.65);w.wheels.forEach((q,i)=>{if(w.edge.risk>0&&!w.ground.airborne&&w.unsupported?.[i])groundRing(g,Physics.casterPoint(w.body,q,i,0,0,1),5,P.red,2);});}
      boundaries(g,w);g.restore();delete w._visible;terrainLevel=null;
      if(background.working)pumpScenery();
      if(target&&!options.preview&&options.follow!==false){const p=project({...target,z:w.level.campaign?Terrain.height(w.level,target):target.z}),tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;if(tx<25||tx>width-25||ty<25||ty>height-25){const dx=tx-width/2,dy=ty-height*.54,t=Math.min((width/2-30)/Math.max(1,Math.abs(dx)),(height*.45-30)/Math.max(1,Math.abs(dy))),x=clamp(width/2+dx*t,25,width-25),y=clamp(height*.54+dy*t,25,height-25);oval(g,x,y,13,13,P.hairDark);oval(g,x,y,11,11,P.gold);text(g,'GO',x,y+3,P.hairDark,8,'center');}}
    }
    function illustration(g,wheelMode='all-swivel') {
      g.clearRect(0,0,g.canvas.width,g.canvas.height);
      const b={x:0,y:0,a:-.18,vx:0,vy:0,omega:0},scene=new Scene();
      cart(scene,b,[0,-.6,.35,-.15].map((a,i)=>({a,roll:0,fixed:wheelMode==='front-swivel'&&WHEELS[i][0]===1})),{phase:0,stride:0});
      g.save();g.scale(2,2);scene.flush(g,{x:39,y:48});g.restore();
    }
    function framing(width,height,body,follow=true) {
      const scale=follow?1.8:Math.min(width/CAMERA.width,height/CAMERA.height);
      if(!follow)return {scale,x:(width-CAMERA.width*scale)/2,y:(height-CAMERA.height*scale)/2};
      const focus=project(local(body,10,0));
      return {scale,x:width*.5-focus.x*scale,y:height*.53-focus.y*scale};
    }
    function present(g,frame,w,follow=true) {
      const width=g.canvas.width,height=g.canvas.height,camera=framing(width,height,w.body,follow);
      g.save();g.imageSmoothingEnabled=false;
      rect(g,0,0,width,height,blend(P.hairDark,P.edge,.48));
      g.drawImage(frame,camera.x,camera.y,CAMERA.width*camera.scale,CAMERA.height*camera.scale);
      if(follow) {
        const target=w.level.gates[w.gate]||local(w.exit,20,0),p=project(target);
        const tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;
        if(tx<18||tx>width-18||ty<18||ty>height-18) {
          const cx=width*.5,cy=height*.53,dx=tx-cx,dy=ty-cy;
          const t=Math.min((width/2-22)/Math.max(1,Math.abs(dx)),(height/2-32)/Math.max(1,Math.abs(dy)));
          const x=clamp(cx+dx*t,22,width-22),y=clamp(cy+dy*t,22,height-22);
          oval(g,x,y,12,12,P.hairDark);oval(g,x,y,10,10,P.cream);
          text(g,w.gate<w.level.gates.length?String(w.gate+1):'OUT',x,y+4,P.brick,10,'center');
          const distance=Math.hypot(dx,dy)||1,nx=dx/distance,ny=dy/distance;
          line(g,{x:x+nx*12,y:y+ny*12},{x:x+nx*17,y:y+ny*17},P.coral,3);
        }
        // The live overview uses the exact frame, with the current camera
        // rectangle and cart position, rather than a second map implementation.
        const mapScale=.2,mw=CAMERA.width*mapScale,mh=CAMERA.height*mapScale,mx=width-mw-14,my=14;
        rect(g,mx-3,my-3,mw+6,mh+6,P.hairDark);g.drawImage(frame,mx,my,mw,mh);
        g.save();g.beginPath();g.rect(mx,my,mw,mh);g.clip();
        const a={x:mx+(-camera.x/camera.scale)*mapScale,y:my+(-camera.y/camera.scale)*mapScale};
        const b={x:a.x+width/camera.scale*mapScale,y:a.y+height/camera.scale*mapScale};
        line(g,a,{x:b.x,y:a.y},P.light);line(g,{x:b.x,y:a.y},b,P.light);line(g,b,{x:a.x,y:b.y},P.light);line(g,{x:a.x,y:b.y},a,P.light);
        const q=project(w.body);rect(g,mx+q.x*mapScale-1,my+q.y*mapScale-1,3,3,P.coral);g.restore();
      }
      g.restore();
    }
    function renderSceneryTile(level,kind,x,y){terrainLevel=level;try{return kind==='floor'?courseTile({level},makeFloor(level),x,y).canvas:rockTile({level},x,y);}finally{terrainLevel=null;}}
    return {draw,makeFloor,drawCart,drawShelf,drawFurnitureShadow,illustration,framing,present,rect,text,blend,Scene,connectedCamera,worldFrame,renderSceneryTile,refreshFonts:()=>{textures.clear();cacheEpoch++;}};
  }
  const api={CAMERA,project,unproject,depth,local,exposedEdges,slopeMarkers,create,createMotionInterpolator};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
