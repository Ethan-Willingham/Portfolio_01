/* A continuous cart course. The same geometry supplies floor support, tire
 * materials, guardrail contacts, route distance, scenery and the rasterizer. */
(function(root){
  'use strict';
  const VERSION=3, CELL=128, POINT_CELL=32, UNITS_PER_FOOT=4;
  const Terrain=typeof module!=='undefined'&&module.exports?require('./four-wheels-terrain.js'):root.CartTerrain;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const chapters=[
    {name:'The first push',surface:'dirt',width:154,shoulder:42,rail:3,back:0,theme:'clay',tip:'A wide dirt track to learn the swivel. Turn the basket, then push to change your path.',points:[[180,1520],[470,1520],[590,1400],[590,1230]]},
    {name:'The speed bumps',surface:'asphalt',width:120,shoulder:18,rail:1,back:0,theme:'gold',tip:'Two low, rounded bumps. Roll straight over them, then brake before the turn.',points:[[590,1230],[590,1040],[800,1040],[800,1390],[1000,1390]]},
    {name:'A grocery detour',surface:'dirt',width:128,shoulder:18,rail:2,back:0,theme:'coral',tip:'The route goes straight through the market. The doors swing, and a hard hit breaks the glass.',points:[[1000,1390],[1180,1390],[1180,1220],[1420,1220],[1510,1220]]},
    {name:'The water crossing',surface:'asphalt',width:88,shoulder:0,rail:1,back:1,theme:'blue',tip:'A narrow causeway over water. One side has a rail. The other side has a view.',points:[[1510,1220],[1680,1220],[1680,980],[1480,980]]},
    {name:'Quarry switchbacks',surface:'dirt',width:106,shoulder:12,rail:2,back:2,theme:'clay',tip:'Climb the quarry, hold the high ledge, then brake on the descent. Gravity carries a coast downhill.',points:[[1480,980],[1280,980],[1210,840],[1390,700],[1560,700],[1560,510]]},
    {name:'The boost gap',surface:'asphalt',width:142,shoulder:46,rail:3,back:3,theme:'blue',tip:'Line up with the gold boost pad. Keep pushing up the ramp, coast over the gap, then brake after landing.',points:[[1560,510],[1370,410],[1080,410],[960,570]]},
    {name:'No rail, no bargain',surface:'dirt',width:80,shoulder:0,rail:0,back:0,theme:'gold',tip:'Open edges all the way. Ease off the push. A fall here goes back to the start.',points:[[960,570],[770,700],[580,700],[500,540],[500,470]]},
    {name:'The water relay',surface:'dirt',width:110,shoulder:12,rail:1,back:4,theme:'coral',tip:'Knock the water vase off the small table beside the shutter. A connected puddle between the two brass contacts opens it.',points:[[500,470],[500,340],[500,140],[810,140],[810,290],[1050,290],[1220,130]]},
    {name:'Grass on the outside',surface:'dirt',width:108,shoulder:26,rail:2,back:5,theme:'sage',tip:'Grass catches a late turn but drags on the wheels. Do not confuse it with a brake.',points:[[1220,130],[1460,130],[1680,290],[1960,290]]},
    {name:'Ice on the thin end',surface:'asphalt',width:72,shoulder:0,rail:1,back:5,theme:'blue',tip:'Slow down before the blue ice. The wheels still swivel, but pushing and braking have very little grip.',points:[[1960,290],[2110,440],[2110,720],[2310,720],[2310,500]]},
    {name:'Last bottles',surface:'asphalt',width:102,shoulder:8,rail:2,back:7,theme:'coral',tip:'One last supermarket. Hold your line through the shelves, then turn toward daylight.',points:[[2310,500],[2510,500],[2510,750],[2780,750],[2780,380]]},
    {name:'The last long turn',surface:'dirt',width:96,shoulder:0,rail:0,back:8,theme:'gold',tip:'No guardrail before the finish. Every wheel and the shopper must make it onto the checked pad.',points:[[2780,380],[2970,380],[3050,200],[3220,200]]}
  ];
  const stores=[
    {x:1070,y:1130,w:400,h:340,entry:{side:'left',center:1390,width:100},exit:{side:'right',center:1220,width:108},name:'QUICK MART',chapter:2},
    {x:410,y:60,w:540,h:350,entry:{side:'bottom',center:500,width:104},exit:{side:'right',center:290,width:110},name:'THE WEEKLY SHOP',chapter:7},
    {x:2370,y:430,w:510,h:430,entry:{side:'left',center:500,width:110},exit:{side:'top',center:2780,width:110},name:'LAST BOTTLES',chapter:10}
  ];
  function bounds(poly){return {left:Math.min(...poly.map(p=>p.x)),right:Math.max(...poly.map(p=>p.x)),top:Math.min(...poly.map(p=>p.y)),bottom:Math.max(...poly.map(p=>p.y))};}
  function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
  function nearest(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),x=a.x+t*dx,y=a.y+t*dy;return {x,y,t,d:Math.hypot(p.x-x,p.y-y)};}
  const disk=(p,r,n=20)=>Array.from({length:n},(_,i)=>({x:p.x+Math.cos(i*Math.PI*2/n)*r,y:p.y+Math.sin(i*Math.PI*2/n)*r}));
  const quad=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  function ribbon(a,b,r){const d=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/d*r,ny=(b.x-a.x)/d*r;return [{x:a.x-nx,y:a.y-ny},{x:b.x-nx,y:b.y-ny},{x:b.x+nx,y:b.y+ny},{x:a.x+nx,y:a.y+ny}];}
  function round(points,width){
    const out=[{x:points[0][0],y:points[0][1]}];
    for(let i=1;i<points.length-1;i++){
      const a={x:points[i-1][0],y:points[i-1][1]},p={x:points[i][0],y:points[i][1]},b={x:points[i+1][0],y:points[i+1][1]},da=Math.hypot(p.x-a.x,p.y-a.y),db=Math.hypot(b.x-p.x,b.y-p.y),r=Math.min(width*.58,da*.35,db*.35);
      const u={x:p.x+(a.x-p.x)/da*r,y:p.y+(a.y-p.y)/da*r},v={x:p.x+(b.x-p.x)/db*r,y:p.y+(b.y-p.y)/db*r};out.push(u);
      for(let j=1;j<=8;j++){const t=j/8,s=1-t;out.push({x:s*s*u.x+2*s*t*p.x+t*t*v.x,y:s*s*u.y+2*s*t*p.y+t*t*v.y});}
    }
    out.push({x:points.at(-1)[0],y:points.at(-1)[1]});return out;
  }
  function index(shapes,cell=CELL){const grid=new Map();shapes.forEach((s,i)=>{const b=s.bounds||bounds(s.poly);s.bounds=b;for(let y=Math.floor(b.top/cell);y<=Math.floor(b.bottom/cell);y++)for(let x=Math.floor(b.left/cell);x<=Math.floor(b.right/cell);x++){const key=x+','+y,bin=grid.get(key)||[];bin.push(i);grid.set(key,bin);}});return grid;}
  const queryRanges=new WeakMap();
  function query(shapes,grid,p,r=0){
    const left=Math.floor((p.x-r)/CELL),right=Math.floor((p.x+r)/CELL),top=Math.floor((p.y-r)/CELL),bottom=Math.floor((p.y+r)/CELL),key=[left,right,top,bottom].join(',');
    let cache=queryRanges.get(grid);if(!cache){cache=new Map();queryRanges.set(grid,cache);}
    let ids=cache.get(key);
    if(!ids){const unique=new Set();for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)for(const i of grid.get(x+','+y)||[])unique.add(i);ids=[...unique];cache.set(key,ids);if(cache.size>128)cache.delete(cache.keys().next().value);}
    // Return a fresh list: callers sort floor areas or append a moving shutter.
    return ids.map(i=>shapes[i]);
  }
  function wall(poly,kind='rail',chapter=0){const b=bounds(poly);return {poly,bounds:b,x:b.left,y:b.top,w:b.right-b.left,h:b.bottom-b.top,side:kind,chapter};}
  function storeWalls(store){
    const out=[];
    for(const side of ['left','right','top','bottom']){
      const vertical=side==='left'||side==='right',low=vertical?store.y:store.x,end=low+(vertical?store.h:store.w),runs=[store.entry,store.exit].filter(e=>e.side===side).map(e=>[e.center-e.width/2,e.center+e.width/2]).sort((a,b)=>a[0]-b[0]);let cursor=low;
      for(const [a,b]of [...runs,[end,end]]){if(a>cursor){const x=vertical?(side==='left'?store.x-5:store.x+store.w):cursor,y=vertical?cursor:(side==='top'?store.y-5:store.y+store.h),w=vertical?5:a-cursor,h=vertical?a-cursor:5;out.push(wall(quad(x,y,w,h),'store',store.chapter));}cursor=Math.max(cursor,b);}
    }return out;
  }
  function build(startChapter=0){
    startChapter=clamp(Math.floor(startChapter)||0,0,chapters.length-1);
    const floorAreas=[],roadAreas=[],walls=[],legs=[],gates=[],sections=[],rails=[],curbs=[],signs=[],decor=[],doors=[];
    let distance=0;
    for(let ci=0;ci<chapters.length;ci++){
      const c=chapters[ci],path=round(c.points,c.width),startGate=gates.length,startDistance=distance;
      const a0=path[0],a1=path[1],start={...a0,a:Math.atan2(a1.y-a0.y,a1.x-a0.x)};
      sections.push({...c,index:ci,start,spawn:start,startGate,startDistance,path});
      const offset=(i,side,r)=>{
        const p=path[i],prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)];
        const normal=(a,b)=>{const d=Math.hypot(b.x-a.x,b.y-a.y);return d?{x:-(b.y-a.y)/d,y:(b.x-a.x)/d}:null;};
        const before=normal(prev,p),after=normal(p,next),u=before||after,v=after||before,nx=u.x+v.x,ny=u.y+v.y,d=Math.hypot(nx,ny),x=nx/d,y=ny/d,m=r/Math.max(.35,x*v.x+y*v.y);
        return {x:p.x+x*m*side,y:p.y+y*m*side};
      };
      const addArea=(poly,kind)=>{const a={poly,kind,chapter:ci,bounds:bounds(poly)};floorAreas.push(a);if(kind!=='grass')roadAreas.push(a);};
      for(let i=0;i<path.length-1;i++){
        const a=path[i],b=path[i+1],d=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/d,ny=(b.x-a.x)/d;
        const leg={a,b,length:d,distance,chapter:ci,width:c.width,shoulder:c.shoulder,surface:c.surface};legs.push(leg);
        if(c.shoulder)addArea(ribbon(a,b,c.width/2+c.shoulder),'grass');addArea(ribbon(a,b,c.width/2),c.surface);
        if(c.shoulder)addArea(disk(a,c.width/2+c.shoulder),'grass');addArea(disk(a,c.width/2),c.surface);
        // Short centerline gates keep distance tied to actually driving the route.
        for(let u=0;u<d;u+=95)if(i===0&&u===0||u>0){const t=u/d;gates.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,distance:distance+u,room:ci,number:gates.length+1,visible:i===0&&u===0});}
        for(const side of [-1,1]){
          const from=offset(i,side,c.width/2),to=offset(i+1,side,c.width/2);
          for(let u=0;u<d;u+=18){const end=Math.min(d,u+18),p={x:from.x+(to.x-from.x)*u/d,y:from.y+(to.y-from.y)*u/d},q={x:from.x+(to.x-from.x)*end/d,y:from.y+(to.y-from.y)*end/d};curbs.push({poly:ribbon(p,q,3.5),red:(Math.floor((distance+u)/18)%2)===0,chapter:ci});}
        }
        for(const side of [-1,1])if((c.rail===3||c.rail===(side===-1?1:2))&&!stores.some(s=>(a.x+b.x)/2>s.x&&(a.x+b.x)/2<s.x+s.w&&(a.y+b.y)/2>s.y&&(a.y+b.y)/2<s.y+s.h)){
          const r=c.width/2+c.shoulder+4,p=offset(i,side,r),q=offset(i+1,side,r),poly=ribbon(p,q,3);
          const rail=wall(poly,'rail',ci);walls.push(rail);rails.push({...rail,a:p,b:q,distance});
        }
        distance+=d;
      }
      const end=path.at(-1);if(c.shoulder)addArea(disk(end,c.width/2+c.shoulder),'grass');addArea(disk(end,c.width/2),c.surface);
      sections[ci].endDistance=distance;sections[ci].endGate=gates.length;
      signs.push({x:start.x,y:start.y-70,text:String(ci+1).padStart(2,'0')+' / '+c.name.toUpperCase(),chapter:ci});
      if(ci!==2&&ci!==7&&ci!==10){const p=path[Math.floor(path.length/2)],n=nearest(p,path[0],path[1]);decor.push({kind:'tree',x:p.x-c.width/2-c.shoulder-50,y:p.y+80,chapter:ci});}
    }
    for(const s of stores){floorAreas.push({poly:quad(s.x,s.y,s.w,s.h),kind:'tile',chapter:s.chapter,bounds:bounds(quad(s.x,s.y,s.w,s.h))});walls.push(...storeWalls(s));
      const e=s.entry,vertical=e.side==='left'||e.side==='right',x=vertical?(e.side==='left'?s.x:s.x+s.w):e.center,y=vertical?e.center:(e.side==='top'?s.y:s.y+s.h);
      for(const side of [-1,1])doors.push({kind:'door',id:doors.length,x:x+(vertical?0:side*e.width/2),y:y+(vertical?side*e.width/2:0),a:vertical?-side*Math.PI/2:side===-1?0:Math.PI,length:e.width/2-4,store:s.chapter});
    }
    const shelves=[
      {x:1230,y:1300,w:32,h:32,kind:'table',label:'ONE VASE',theme:'coral'},
      {x:1265,y:1350,w:120,h:36,stock:'groceries',label:'QUICK DINNER',theme:'sage'},
      {x:1280,y:1160,w:75,h:26,stock:'wine',label:'WINE',theme:'coral'},
      {x:550,y:192,w:128,h:68,stock:'groceries',label:'THE PANTRY',theme:'sage'},
      {x:865,y:92,w:44,h:106,stock:'wine',label:'WINE',theme:'purple'},
      {x:556,y:305,w:130,h:38,stock:'dishes',label:'VERY BREAKABLE',theme:'blue'},
      {x:874,y:274,w:32,h:32,kind:'table',label:'WATER RELAY',theme:'blue'},
      {x:2585,y:536,w:128,h:126,stock:'groceries',label:'LAST CHANCE',theme:'sage'},
      {x:2435,y:604,w:38,h:170,stock:'wine',label:'LAST BOTTLES',theme:'purple'},
      {x:2720,y:438,w:30,h:193,stock:'sauces',label:'KETCHUP',theme:'coral'}
    ];
    const objects=[{kind:'cone',x:395,y:1482},{kind:'cone',x:646,y:1090},{kind:'cone',x:846,y:1320},{kind:'box',x:1450,y:1350},{kind:'cone',x:1350,y:770},{kind:'cone',x:1400,y:455},{kind:'cone',x:700,y:729},{kind:'box',x:726,y:111},{kind:'cone',x:1570,y:236},{kind:'cone',x:2140,y:598},{kind:'box',x:2630,y:792}];
    const finish={x:3220,y:200,radius:68};floorAreas.push({poly:disk(finish,82),kind:'asphalt',chapter:11,bounds:bounds(disk(finish,82))});gates.push({...finish,room:11,number:gates.length+1,distance,visible:true});
    const boundsAll=bounds(floorAreas.flatMap(a=>a.poly));
    const level={campaign:true,connected:true,name:'The long way round',rooms:sections,sections,legs,floorAreas,roadAreas,walls,rails,curbs,stores,signs,decor,doors,gates,finish,
      start:{...sections[startChapter].start},startRoom:startChapter,startGate:sections[startChapter].startGate,portals:[],limit:Infinity,par:Infinity,
      exit:{side:'right',center:200,width:160,bounds:{...boundsAll,right:3310}},bounds:{left:0,top:0,right:Math.ceil(boundsAll.right+100),bottom:Math.ceil(boundsAll.bottom+100)},totalDistance:distance,
      shelves,objects,puddles:[],hazards:[{kind:'lake',x:1700,y:1100,rx:165,ry:195},{kind:'lake',x:2280,y:590,rx:125,ry:220}]};
    Terrain.configure(level);
    const cut={left:1180,right:1250,top:286,bottom:534};
    const clip=(poly,axis,value,sign)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*sign,db=(b[axis]-value)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=(value-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}return out;};
    const cropped=[];
    for(const a of floorAreas){if(a.bounds.right<=cut.left||a.bounds.left>=cut.right||a.bounds.bottom<=cut.top||a.bounds.top>=cut.bottom){cropped.push(a);continue;}
      for(const poly of [clip(a.poly,'x',cut.left,-1),clip(a.poly,'x',cut.right,1),clip(clip(clip(a.poly,'x',cut.left,1),'x',cut.right,-1),'y',cut.top,-1),clip(clip(clip(a.poly,'x',cut.left,1),'x',cut.right,-1),'y',cut.bottom,1)])if(poly.length>=3)cropped.push({...a,poly,bounds:bounds(poly)});
    }
    floorAreas.splice(0,floorAreas.length,...cropped);roadAreas.splice(0,roadAreas.length,...cropped.filter(q=>q.kind!=='grass'));
    level.floorGrid=index(floorAreas);level.pointGrid=index(floorAreas,POINT_CELL);level.roadGrid=index(roadAreas);level.wallGrid=index(walls);
    // Nothing, including a grass shoulder or rail, bridges the jump's void.
    const crosses=r=>r.bounds.right>cut.left&&r.bounds.left<cut.right&&r.bounds.bottom>cut.top&&r.bounds.top<cut.bottom;
    level.rails=rails.filter(r=>!crosses(r));level.walls=walls.filter(r=>r.side!=='rail'||!crosses(r));level.wallGrid=index(level.walls);
    gates.splice(0,gates.length,...gates.filter(p=>sample(level,p)));gates.forEach((p,i)=>p.number=i+1);
    sections.forEach((s,i)=>{s.startGate=gates.findIndex(p=>p.room===i);s.endGate=i+1<sections.length?gates.findIndex(p=>p.room===i+1):gates.length;});level.startGate=sections[startChapter].startGate;
    // Decorative trees stand below and outside the supporting track.
    for(const p of decor){let n=0;while(n++<16&&query(floorAreas,level.floorGrid,p,24).some(a=>inside(p,a.poly)||a.poly.some((q,i)=>nearest(p,q,a.poly[(i+1)%a.poly.length]).d<24))){p.x-=25;p.y+=20;}}
    return level;
  }
  function baseSample(level,p){
    // A point occupies one grid cell, whose ids already retain floor order.
    // Avoid building a Set and several temporary arrays at every tire contact.
    let first=null,road=null,tile=null;
    for(const id of level.pointGrid.get(Math.floor(p.x/POINT_CELL)+','+Math.floor(p.y/POINT_CELL))||[]){
      const a=level.floorAreas[id],b=a.bounds;
      if(p.x<b.left-.001||p.x>b.right+.001||p.y<b.top-.001||p.y>b.bottom+.001||!inside(p,a.poly))continue;
      first||=a;if(a.kind!=='grass')road||=a;if(a.kind==='tile'){tile=a;break;}
    }
    const area=tile||road||first;
    if(!area)return null;
    return {kind:area.kind,chapter:area.chapter,grip:area.kind==='dirt'?.85:area.kind==='grass'?.7:1,drag:area.kind==='dirt'?1.38:area.kind==='grass'?3.8:area.kind==='asphalt'?.68:1};
  }
  function supports(level,p){const gap=level.terrain?.gap;return !!baseSample(level,p)&&(!gap||!Terrain.inStrip(p,gap)||Terrain.coordinates(p,gap).u<=.01||Terrain.coordinates(p,gap).u>=gap.length-.01);}
  function sample(level,p,gradient=true){const base=baseSample(level,p);return base?Terrain.sample(level,p,base,gradient):null;}
  function wallsNear(level,p,r=100){const out=query(level.walls,level.wallGrid,p,r),c=level.circuitState,d=level.terrain?.circuit.shutter;if(c&&c.lift<1&&p.x+r>d.x&&p.x-r<d.x+d.w&&p.y+r>d.y&&p.y-r<d.y+d.h)out.push({...d,bottom:c.lift*62,top:c.lift*62+50});return out;}
  function progress(world){
    const l=world.level,index=clamp(world.gate,0,l.gates.length-1),next=l.gates[index],prev=l.gates[Math.max(0,index-1)],q=nearest(world.body,prev,next);
    const value=prev.distance+(next.distance-prev.distance)*q.t;
    return clamp(value,0,l.totalDistance);
  }
  function chapterAt(world){const value=progress(world);let section=world.level.sections[0];for(const s of world.level.sections)if(value>=s.startDistance-1)section=s;return section;}
  function doorPolygon(d){const u={x:Math.cos(d.a),y:Math.sin(d.a)},n={x:-u.y*1.5,y:u.x*1.5};return [{x:d.cx-n.x,y:d.cy-n.y},{x:d.cx+u.x*d.length-n.x,y:d.cy+u.y*d.length-n.y},{x:d.cx+u.x*d.length+n.x,y:d.cy+u.y*d.length+n.y},{x:d.cx+n.x,y:d.cy+n.y}];}
  function init(world){world.distance=world.level.sections[world.roomIndex].startDistance;world.peak=world.distance;world.lostDistance=0;world.trackDoors=world.level.doors.map(s=>({...s,cx:s.x,cy:s.y,rest:s.a,omega:0,vx:0,vy:0,mass:Infinity,inertia:.1*s.length*s.length/3,broken:false,velocityAt(p){return {x:-this.omega*(p.y-this.cy),y:this.omega*(p.x-this.cx)};}}));}
  function update(world){world.distance=progress(world);world.peak=Math.max(world.peak,world.distance);const c=chapterAt(world);if(world.roomIndex!==c.index){world.roomIndex=c.index;world.emit('room',{index:c.index});}}
  function catchPose(world){const c=world.level.sections[world.roomIndex],back=world.practice?c.index:c.back,target=world.level.sections[back];return {pose:{...target.start},gate:target.startGate,chapter:back,distance:target.startDistance};}
  const numbers=(o)=>Object.fromEntries(Object.entries(o).filter(([k,v])=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'||typeof v==='boolean'));
  function snapshot(w){return {version:VERSION,wheelMode:w.wheelMode,body:numbers(w.body),wheels:w.wheels.map(q=>({...numbers({...q,fixed:undefined}),coating:{...q.coating}})),gait:numbers(w.gait),time:w.time,gate:w.gate,peak:w.peak,falls:w.falls,messes:w.messes,roomIndex:w.roomIndex,fall:w.fall?JSON.parse(JSON.stringify(w.fall)):null,
    shelves:w.shelves.map(numbers),objects:w.objects.map(numbers),items:w.stock.items.map(p=>({...numbers(p),shelfId:p.shelf?.id??null})),liquids:[...w.stock.liquids].map(([kind,l])=>({kind,cells:[...l.cells]})),stats:{...w.stock.stats},doors:w.trackDoors.map(numbers),ground:numbers(w.ground),edge:numbers(w.edge),circuit:numbers(w.circuit),terrainStats:numbers(w.terrainStats),shopper:numbers(w.shopper),shopperHang:w.shopperHang,ragdoll:w.ragdoll?JSON.parse(JSON.stringify(w.ragdoll)):null};}
  function restore(w,s){
    const legacy=s?.version===1,oldTilt=s?.version===2;
    if(legacy&&s.body&&Array.isArray(s.wheels)){s=JSON.parse(JSON.stringify(s));s.version=VERSION;s.body={...numbers(w.body),...s.body};s.wheels=s.wheels.map((q,i)=>({...numbers(w.wheels[i]),...q}));s.gate=Math.min(w.level.gates.length,s.gate);s.ground=numbers(w.ground);s.edge=numbers(w.edge);s.circuit=numbers(w.circuit);s.terrainStats=numbers(w.terrainStats);}
    if((legacy||oldTilt)&&s?.body){s=JSON.parse(JSON.stringify(s));s.version=VERSION;const b={...w.body,...s.body,comX:10,comHeight:16};delete b.qw;Terrain.storeAttitude(b,Terrain.attitude(b));s.body=numbers(b);if(s.ground)s.ground={...s.ground,count:Math.min(4,s.ground.count)};}
    if(!s||s.version!==VERSION||!s.body||!Array.isArray(s.wheels)||s.wheels.length!==4||!Array.isArray(s.shelves)||s.shelves.length!==w.shelves.length||!Array.isArray(s.objects)||s.objects.length!==w.objects.length||!Array.isArray(s.items)||s.items.length>650||!Array.isArray(s.doors)||s.doors.length!==w.trackDoors.length)return false;
    if(s.wheelMode!==undefined&&!['all-swivel','front-swivel'].includes(s.wheelMode))return false;
    const scalar=v=>typeof v==='number'?Number.isFinite(v)&&Math.abs(v)<1e7:typeof v==='string'?v.length<120:typeof v==='boolean'||v===null;
    const valid=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.entries(o).every(([k,v])=>!['__proto__','constructor','prototype','velocityAt','tiltMass','tiltImpulse'].includes(k)&&scalar(v));
    const typed=(o,base)=>valid(o)&&Object.entries(numbers(base)).every(([k,v])=>typeof o[k]===typeof v&&scalar(o[k]));
    const numberKeys=['z','vz','pitch','rollTilt','fallZ','fallVz','tumble','tumbleOmega'];
    const extras=['gone','falling','sleep','impactTime','fallZ','fallVz','z','vz','pitch','rollTilt'];
    const apply=(o,q)=>{for(const k of Object.keys(q))if((Object.hasOwn(o,k)&&typeof o[k]!=='function'&&scalar(o[k])||extras.includes(k))&&scalar(q[k]))o[k]=q[k];};
    if(!typed(s.body,w.body)||!typed(s.gait,w.gait)||!s.shelves.every((q,i)=>typed(q,w.shelves[i])&&q.mass>0&&q.inertia>0&&q.id===i&&q.w===w.shelves[i].w&&q.h===w.shelves[i].h)||!s.objects.every((q,i)=>typed(q,w.objects[i])&&q.id===i&&q.mass===w.objects[i].mass&&q.radius===w.objects[i].radius)||!s.items.every(valid)||!s.doors.every((q,i)=>typed(q,w.trackDoors[i])&&q.id===i&&q.cx===w.trackDoors[i].cx&&q.cy===w.trackDoors[i].cy&&q.length===w.trackDoors[i].length)||!Number.isInteger(s.gate)||s.gate<0||s.gate>w.level.gates.length||![s.time,s.peak,s.falls,s.messes].every(v=>Number.isFinite(v)&&v>=0)||s.peak>w.level.totalDistance+1)return false;
    if(s.body.comHeight!==16||s.body.comX!==10||Math.abs(Math.hypot(s.body.qw,s.body.qx,s.body.qy,s.body.qz)-1)>.001||Math.abs(s.body.z)>1000||Math.abs(s.body.vz)>2000||Math.abs(s.body.pitch)>Math.PI+.01||Math.abs(s.body.rollTilt)>Math.PI+.01||s.wheels.some(q=>q.load<0||q.load>2))return false;
    if(!Number.isInteger(s.falls)||!Number.isInteger(s.messes)||!Number.isInteger(s.roomIndex)||!w.level.sections[s.roomIndex]||numberKeys.some(k=>s.body[k]!==undefined&&!Number.isFinite(s.body[k])))return false;
    const materials=['water','wine','ketchup','oil','soil'];
    if(s.body.x<0||s.body.x>w.level.bounds.right||s.body.y<0||s.body.y>w.level.bounds.bottom||s.wheels.some((q,i)=>!typed(numbers(q),{...w.wheels[i],fixed:undefined})||!q.coating||typeof q.coating!=='object'||Object.entries(q.coating).some(([k,v])=>!materials.includes(k)||!Number.isFinite(v)||v<0||v>1)))return false;
    const kinds=['vase','wine','ketchup','jar','can','plate','pot','towel','carton','shard'];
    if(s.items.some(p=>!kinds.includes(p.kind)||!['x','y','z','a','vx','vy','omega','vz','tumble','tumbleOmega','mass','length','width','inertia'].every(k=>Number.isFinite(p[k]))||p.mass<=0||p.mass>2||p.length<=0||p.length>10||p.width<=0||p.width>10||p.inertia<=0||!['shelf','air','floor','broken','gone'].includes(p.state)||p.shelfId!==null&&(!Number.isInteger(p.shelfId)||!w.shelves[p.shelfId])))return false;
    if(!Array.isArray(s.liquids)||s.liquids.length>5||s.liquids.some(l=>!materials.includes(l.kind)||!Array.isArray(l.cells)||l.cells.length>30000||l.cells.some(q=>!Array.isArray(q)||q.length!==2||!Number.isInteger(q[0])||q[0]<0||q[0]>=w.stock.cols*w.stock.rows||!Number.isFinite(q[1])||q[1]<0||q[1]>100)))return false;
    if(!typed(s.ground,w.ground)||!typed(s.edge,w.edge)||!typed(s.circuit,w.circuit)||!typed(s.terrainStats,w.terrainStats)||s.circuit.lift<0||s.circuit.lift>1||s.circuit.charge<0||s.circuit.charge>.3||s.ground.count<0||s.ground.count>4)return false;
    if(!typed(s.stats,w.stock.stats)||Object.values(s.stats).some(v=>!Number.isInteger(v)||v<0))return false;
    if(s.fall&&!legacy&&(!Number.isFinite(s.fall.plane)||s.fall.impactTime!==null&&(!Number.isFinite(s.fall.impactTime)||s.fall.impactTime<0)))return false;
    if(s.fall&&(!valid(numbers(s.fall))||!['time','vz','pitch','roll'].every(k=>Number.isFinite(s.fall[k]))||!['lake','cliff'].includes(s.fall.kind)||!s.fall.catch||!Number.isInteger(s.fall.catch.chapter)||!w.level.sections[s.fall.catch.chapter]))return false;
    if(!legacy&&!oldTilt&&(!typed(s.shopper,w.shopper)||s.shopper.feet<0||s.shopper.feet>1||s.shopper.grip<0||s.shopper.grip>1||Math.abs(s.shopper.z)>2000))return false;
    if(s.shopperHang!==undefined&&(!Number.isFinite(s.shopperHang)||s.shopperHang<0||s.shopperHang>.55)||s.fall?.shopperOnly!==undefined&&typeof s.fall.shopperOnly!=='boolean')return false;
    if(s.ragdoll!=null&&(!s.fall||!Terrain.validRagdoll(s.ragdoll)))return false;
    apply(w.body,s.body);s.wheels.forEach((q,i)=>{apply(w.wheels[i],q);w.wheels[i].coating={...q.coating};});apply(w.gait,s.gait);
    Object.assign(w,{time:s.time,gate:s.gate,peak:s.peak,falls:s.falls,messes:s.messes,roomIndex:s.roomIndex,fall:s.fall?{...numbers(s.fall),impactTime:s.fall.impactTime??null,plane:s.fall.plane??(s.fall.kind==='lake'?-50:-100),catch:null}:null});
    if(w.fall){const target=w.level.sections[s.fall.catch.chapter];w.fall.catch={pose:{...target.start},gate:target.startGate,chapter:target.index,distance:target.startDistance};}
    s.shelves.forEach((q,i)=>{apply(w.shelves[i],q);w.shelves[i].shape=null;w.shelves[i].basis=null;w.shelves[i].stockItems=[];});
    s.objects.forEach((q,i)=>apply(w.objects[i],q));
    w.stock.items=[];w.stock.serial=0;w.stock.fragments=0;
    for(const q of s.items){const p=w.stock.addProduct(q.kind,q.x,q.y,q);p.state=q.state;p.shelf=q.shelfId===null?null:w.shelves[q.shelfId];delete p.shelfId;if(p.shelf)p.shelf.stockItems.push(p);if(p.kind==='shard')w.stock.fragments++;w.stock.serial=Math.max(w.stock.serial,p.id+1);}
    w.stock.liquids.clear();for(const q of s.liquids)w.stock.liquid(q.kind).cells=new Map(q.cells);apply(w.stock.stats,s.stats);
    s.doors.forEach((q,i)=>apply(w.trackDoors[i],q));
    apply(w.ground,s.ground);apply(w.edge,s.edge);apply(w.circuit,s.circuit);apply(w.terrainStats,s.terrainStats);w.level.circuitState=w.circuit;
    if(legacy){const b=w.body,circuit=w.circuit,stats=w.terrainStats;Terrain.init(w,w.terrainGeometry);w.circuit=circuit;w.level.circuitState=circuit;w.terrainStats=stats;
      // Old runs keep their record and stock; the new relay starts with a vase.
      const table=w.shelves[6],spec=w.level.shelves[6];Object.assign(table,{cx:spec.x+spec.w/2,cy:spec.y+spec.h/2,vx:0,vy:0,a:0,omega:0,tilt:0,tiltOmega:0,down:false});w.stock.items=w.stock.items.filter(p=>p.shelf!==table);table.stockItems=[];const vase=w.stock.addProduct('vase',table.cx,table.cy,{state:'shelf',shelf:table,u:0,v:0,du:0,dv:0,tier:table.height,color:0});table.stockItems.push(vase);w.stock.positionStock(vase);w.stock.weigh(table);
      if(!w.isFloor(b)){const back=catchPose(w);Object.assign(b,back.pose,{vx:0,vy:0,omega:0});w.gate=back.gate;w.roomIndex=back.chapter;Terrain.init(w,w.terrainGeometry);}
    }
    if(legacy||oldTilt)Terrain.initShopper(w);else apply(w.shopper,s.shopper);
    w.shopperHang=s.shopperHang??0;
    w.ragdoll=s.ragdoll?JSON.parse(JSON.stringify(s.ragdoll)):null;
    w.setWheelMode(s.wheelMode);w.stock.surfaceClock=0;w.distance=progress(w);w.walls=w.activeWalls();return true;
  }
  const api={VERSION,UNITS_PER_FOOT,chapters,build,sample,baseSample,supports,wallsNear,progress,chapterAt,doorPolygon,init,update,catchPose,snapshot,restore,bounds,inside,nearest,disk,ribbon,query};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartCourse=api;
})(typeof globalThis!=='undefined'?globalThis:this);
