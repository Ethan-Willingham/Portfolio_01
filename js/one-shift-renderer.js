(function(root){
 'use strict';const O=root.OneShift;
 class Renderer{
  constructor(canvas){this.canvas=canvas;this.g=canvas.getContext('2d',{alpha:false});this.camera={x:18,y:20,zoom:24};this.hits=[];this.chunks=new Map();this.staticKey='';this.frameTimes=[];this.palletViews=new Map();this.doorViews=new Map();this.truckViews=new Map();}
  resize(){const d=Math.min(devicePixelRatio||1,2),r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=d;this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);}
  view(s){if(!s||!O.business(s))return null;const r=document.getElementById('shift-view')?.getBoundingClientRect();return r&&r.width>0&&r.height>0?r:null;}
  viewStamp(s){const r=this.view(s);return r?[r.left,r.top,r.width,r.height].join('/'):'';}
  home(s,panel=false){
   const view=this.view(s);if(view){const b=s.map.building,compact=b.w<=16&&b.h<=16,bounds=compact?{x:b.x+.6,y:b.y+2,w:b.w+2.8,h:b.h-2.2}:{x:b.x-.6,y:b.y-.6,w:b.w+3.8,h:b.h+1.2};
    // Frame the working floor and trailer rear. The road and cab can stay outside the view.
    const zoom=Math.max(4,Math.min(64,view.width/bounds.w,view.height/bounds.h));this.camera={x:bounds.x+bounds.w/2-(view.left+view.width/2-this.w/2)/zoom,y:bounds.y+bounds.h/2-(view.top+view.height/2-this.h/2)/zoom,zoom};this.homeCamera={...this.camera};this.homeBuilding=[b.x,b.y,b.w,b.h].join('/');this.homeView=this.viewStamp(s);return;}
   const b=s.map.building,east=O.docks.side(s)==='east',left=panel?(this.w<=600?278:this.h<=550?300:344):24,top=this.h<=550?86:112,bottom=this.h<=550?56:76;
   const bounds={x:b.x-1,y:b.y-1,w:b.w+(east?(O.business(s)?11:17):2),h:b.h+(east?2:14)};for(const t of s.trucks.filter(t=>!['scheduled','gone','leaving'].includes(t.status))){const r=this.truckGeometry(s,t);bounds.w=Math.max(bounds.w,r.x+r.w+1-bounds.x);bounds.h=Math.max(bounds.h,r.y+r.h+1-bounds.y);}const queue=document.getElementById('shift-queue'),right=queue&&(O.business(s)||!queue.hidden)&&(queue.dataset.open==='true'||queue.classList.contains('has-guide'))?(queue.hidden?parseFloat(getComputedStyle(queue).width)+parseFloat(getComputedStyle(queue).right):this.w-queue.getBoundingClientRect().left)+16:24,available=Math.max(180,this.w-left-right),height=Math.max(140,this.h-top-bottom),zoom=Math.max(4,Math.min(42,available/bounds.w,height/bounds.h));
   this.camera={x:bounds.x+bounds.w/2-(left+available/2-this.w/2)/zoom,y:bounds.y+bounds.h/2-(top+height/2-this.h/2)/zoom,zoom};this.homeCamera={...this.camera};this.homeBuilding=[b.x,b.y,b.w,b.h].join('/');this.homeView=this.viewStamp(s);}
  screen(x,y){const c=this.camera;return {x:(x-c.x)*c.zoom+this.w/2,y:(y-c.y)*c.zoom+this.h/2};}
  world(x,y){const c=this.camera;return {x:(x-this.w/2)/c.zoom+c.x,y:(y-this.h/2)/c.zoom+c.y};}
  text(g,text,x,y,size=12,color='#f1e3c6',align='left',baseline='alphabetic'){g.fillStyle=color;g.font=size+'px "Commit Mono",monospace';g.textAlign=align;g.textBaseline=baseline;g.fillText(text,x,y);}
  worldText(text,x,y,size,color,align='center',minimum=10){const p=this.screen(x,y),font=Math.max(minimum,Math.min(24,size*this.camera.zoom/32));if(p.x<-160||p.x>this.w+160||p.y<-30||p.y>this.h+30)return;this.text(this.g,text,p.x,p.y,font,color,align);}
  labels(s){const g=this.g,b=s.map.building,z=this.camera.zoom,east=O.docks.side(s)==='east';
   // Draw type at the display resolution, independently of the cached floor art.
   for(const kind of ['receiving','shipping']){const r=O.docks.lane(s,kind);this.worldText(kind.toUpperCase(),r.x+r.w/2,r.y-.28,10,'#743f2c');}
   for(const q of s.map.zones)if(z>=12)this.worldText(q.type.toUpperCase(),q.x+.2,q.y+.6,9,'#743f2c','left',9);
   if(z>=8)for(const r of s.map.racks){this.worldText('A'+String(r.id).padStart(2,'0'),r.x+1,r.y+1.32,8,'#743f2c','center',9);if(z>=16&&!O.business(s))this.worldText('STORAGE',r.x+1,r.y-.3,8,'#743f2c','center',9);}
   if(z>=16)for(const q of s.map.stations)this.worldText(q.id.toUpperCase(),q.x+1,q.y+1.32,8,'#743f2c','center',9);
   for(const [i,d]of s.map.doors.entries()){this.worldText('DOCK',d.x+(east?-.75:1),d.y+(east?.78:-.85),8,'#743f2c','center',9);this.worldText(String(i+1).padStart(2,'0'),d.x+(east?-.75:1),d.y+(east?1.17:-.45),12,'#252722','center',11);}
   const stack=O.docks.stack(s);if(z>=16)this.worldText('EMPTIES',stack.x+.5,stack.y+1.25,7,'#743f2c','center',9);
   const center=this.screen(b.x+b.w/2,b.y-.3),roof=this.screen(b.x,b.y-.6),size=Math.max(10,Math.min(20,z*11/32));g.font=size+'px "Commit Mono",monospace';let title=(s.mode==='business'?'YOUR WAREHOUSE':'FERN TRAIL')+' / '+b.w*4+' x '+b.h*4+' FT';if(g.measureText(title).width+16>b.w*z)title=s.mode==='business'?'YOUR WAREHOUSE':'FERN TRAIL';const width=g.measureText(title).width+16,height=size+8,y=Math.max(center.y,roof.y+height/2+2);g.fillStyle='#252722';g.fillRect(center.x-width/2,y-height/2,width,height);this.text(g,title,center.x,y,size,'#f1e3c6','center','middle');
  }
  truckLabel(s,t,r,controls){const g=this.g,z=this.camera.zoom,scene=this.view(s),minX=(scene?.left??0)+8,maxX=(scene?.right??this.w)-8,minY=(scene?.top??0)+8,maxY=(scene?.bottom??this.h)-8,a=this.screen(r.x,r.y),b=this.screen(r.x+r.w,r.y+r.h),left=Math.max(minX,a.x),right=Math.min(maxX,b.x);
   if(right-left<24||b.y<minY||a.y>maxY)return;
   const size=Math.max(10,Math.min(20,z*.3)),direction=t.direction==='in'?'INBOUND':'OUTBOUND';g.font=size+'px "Commit Mono",monospace';
   const width=g.measureText(direction).width+14,preferred=this.screen(r.x+r.w*.6,r.y+r.h*.5).x;if(scene&&width>right-left)return;
   const x=Math.max(minX+width/2,Math.min(maxX-width/2,Math.max(left+width/2,Math.min(right-width/2,preferred))));
   const controlsOverlap=controls&&x+width/2>controls.left&&x-width/2<controls.right,bottom=Math.min(maxY,controlsOverlap?controls.top-8:maxY,b.y);
   const deadline=!t.openingShipment&&t.status==='docked'&&z>20&&bottom-Math.max(minY,a.y)>size+26,height=size+(deadline?26:12),y=Math.max(minY+height/2,Math.min(bottom-height/2,(a.y+b.y)/2));
   if(bottom<minY+height)return;
   g.fillStyle='#f1e3c6';g.fillRect(x-width/2,y-height/2,width,height);this.text(g,direction,x,y-(deadline?7:0),size,'#252722','center','middle');
   if(deadline)this.text(g,Math.max(0,Math.ceil(t.deadline-s.minute))+' MIN',x,y+size/2+4,9,'#743f2c','center','middle');
  }
  static(s){const key=s.map.revision+'/'+s.map.w+'/'+s.map.building.w+'/'+O.sprites.artRevision;if(s.map!==this.lastMap||key!==this.staticKey){this.lastMap=s.map;this.staticKey=key;this.chunks.clear();}}
  chunk(s,cx,cy){
   const key=cx+'/'+cy;if(this.chunks.has(key))return this.chunks.get(key);
   const unit=64,size=1024,c=O.sprites.canvas(size,size),g=c.getContext('2d'),b=s.map.building,P=O.sprites.palette,S=O.sprites,east=O.docks.side(s)==='east';
   g.translate(-cx*size,-cy*size);g.fillStyle=P.yard;g.fillRect(cx*size,cy*size,size,size);
   S.grain(g,cx*size,cy*size,size,size,cx*51+cy*719,.007,P.ink,.18);
   const apron=east?{x:b.x+b.w,y:b.y-2,w:16,h:b.h+4}:{x:b.x-2,y:b.y+b.h,w:b.w+4,h:12};
   g.fillStyle='#c5b18d';g.fillRect(apron.x*unit,apron.y*unit,apron.w*unit,apron.h*unit);
   for(let y=apron.y;y<apron.y+apron.h;y+=4)S.line(g,apron.x*unit,y*unit,(apron.x+apron.w)*unit,y*unit,'#74614538',1);
   g.fillStyle=P.asphalt;if(east)g.fillRect((b.x+b.w+14)*unit,0,5*unit,s.map.h*unit);else g.fillRect(0,39*unit,s.map.w*unit,5*unit);
   g.setLineDash([45,42]);g.strokeStyle=P.cream;g.lineWidth=3;g.beginPath();if(east){g.moveTo((b.x+b.w+16.5)*unit,0);g.lineTo((b.x+b.w+16.5)*unit,s.map.h*unit);}else{g.moveTo(0,41.5*unit);g.lineTo(s.map.w*unit,41.5*unit);}g.stroke();g.setLineDash([]);
   // Broad poured slabs, paper grain, and sparse print scuffs replace the tile grid.
   g.fillStyle=P.concrete;g.fillRect(b.x*unit,b.y*unit,b.w*unit,b.h*unit);
   S.paper(g,b.x*unit,b.y*unit,b.w*unit,b.h*unit);
   for(let y=b.y;y<=b.y+b.h;y+=4)S.line(g,b.x*unit,y*unit,(b.x+b.w)*unit,y*unit,'#74614523',1);
   for(let x=b.x;x<=b.x+b.w;x+=4)S.line(g,x*unit,b.y*unit,x*unit,(b.y+b.h)*unit,'#74614523',1);
   for(let y=Math.max(b.y,cy*16);y<Math.min(b.y+b.h,(cy+1)*16);y++)for(let x=Math.max(b.x,cx*16);x<Math.min(b.x+b.w,(cx+1)*16);x++){
    const rng=S.random(x*73856093^y*19349663);
    if(rng()<.34){const px=(x+.1+rng()*.6)*unit,py=(y+.2+rng()*.6)*unit;S.line(g,px,py,px+6+rng()*18,py+rng()*1.5,'#743f2c24',.65);if(rng()>.6)S.line(g,px+2,py+2,px+8+rng()*11,py+2.3,'#25272212',.7);}
   }
   for(const kind of ['receiving','shipping']){
    const r=O.docks.lane(s,kind),x=r.x*unit,y=r.y*unit,w=r.w*unit,h=r.h*unit;
    g.fillStyle=kind==='receiving'?'#ad573710':'#25272208';g.fillRect(x,y,w,h);g.strokeStyle=P.rust;g.lineWidth=2.6;g.strokeRect(x,y,w,h);
    for(let i=1;i<(east?r.h:r.w);i++){if(east)S.line(g,x,y+i*unit,x+w,y+i*unit,'#743f2cb3',1.8);else S.line(g,x+i*unit,y,x+i*unit,y+h,'#743f2cb3',1.8);}
    for(const [px,py]of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){g.fillStyle=P.rust;g.fillRect(px-1.5,py-1.5,3,3);}
   }
   g.strokeStyle='#ad573775';g.lineWidth=2;g.setLineDash([17,10]);g.beginPath();if(east){g.moveTo((b.x+b.w-6)*unit,(b.y+1)*unit);g.lineTo((b.x+b.w-6)*unit,(b.y+b.h-1)*unit);}else{g.moveTo((b.x+1)*unit,(b.y+b.h-6)*unit);g.lineTo((b.x+b.w-1)*unit,(b.y+b.h-6)*unit);}g.stroke();g.setLineDash([]);
   for(const z of s.map.zones){g.fillStyle=(z.type==='hold'?P.rust:P.ink)+'12';g.fillRect(z.x*unit,z.y*unit,z.w*unit,z.h*unit);g.strokeStyle=z.type==='hold'?P.rust:P.rule;g.lineWidth=1.8;g.strokeRect(z.x*unit,z.y*unit,z.w*unit,z.h*unit);}
   for(const r of s.map.racks){
    const x=r.x*unit,y=r.y*unit,w=2*unit,h=unit;
    S.polygon(g,[[x,y+4],[x+w,y+4],[x+w+11,y+14],[x+w+11,y+h+10],[x+10,y+h+10],[x,y+h]],'#25272222',null);
    g.fillStyle=P.steel;g.fillRect(x,y,w,h);g.fillStyle='#6d6750';g.fillRect(x+4,y+5,w-8,h-10);
    for(let sy=y+8;sy<y+h-5;sy+=9){g.fillStyle=P.wood;g.fillRect(x+5,sy,w-10,6);S.line(g,x+7,sy+2,x+w-8,sy+2,'#743f2c44',.6);}
    S.grain(g,x+5,y+5,w-10,h-10,r.id*81,.018,P.paper,.35);
    for(const sy of [y,y+h-5]){g.fillStyle=P.rust;g.fillRect(x,sy,w,5);S.line(g,x+1,sy+1,x+w-1,sy+1,P.cream,.6);}
    for(let i=0;i<3;i++){const px=x+i*unit;g.fillStyle=P.ink;g.fillRect(px-3,y-3,6,h+7);S.line(g,px-1,y-1,px-1,y+h+2,P.cream,.75);for(const py of [y+3,y+h-3]){g.fillStyle=P.cream;g.fillRect(px-.6,py,1.2,1.2);}}
   }
   for(const station of s.map.stations)g.drawImage(S.station(station.id),station.x*unit,station.y*unit,2*unit,unit);
   // A low, ink-edged perimeter keeps the cutaway clear without adding roof clutter.
   const wall=unit*.24;g.fillStyle=P.ink;g.fillRect(b.x*unit-wall-1,b.y*unit-wall-1,b.w*unit+wall*2+2,wall+2);g.fillRect(b.x*unit-wall-1,b.y*unit,wall+2,b.h*unit);g.fillRect((b.x+b.w)*unit-1,b.y*unit,wall+2,b.h*unit);g.fillRect(b.x*unit-wall-1,(b.y+b.h)*unit-1,b.w*unit+wall*2+2,wall+2);
   g.fillStyle=P.paper;g.fillRect(b.x*unit-wall+2,b.y*unit-wall+2,b.w*unit+wall*2-4,wall-4);g.fillRect(b.x*unit-wall+2,b.y*unit,wall-4,b.h*unit);g.fillRect((b.x+b.w)*unit+2,b.y*unit,wall-4,b.h*unit);g.fillRect(b.x*unit-wall+2,(b.y+b.h)*unit+2,b.w*unit+wall*2-4,wall-4);
   for(const d of s.map.doors){
    g.save();if(east){g.translate(d.x*unit,(d.y+2)*unit);g.rotate(-Math.PI/2);}else g.translate(d.x*unit,d.y*unit);
    g.fillStyle=P.ink;g.fillRect(-3,-2,2*unit+6,.46*unit+4);g.fillStyle=P.rule;g.fillRect(2,2,2*unit-4,.42*unit);
    for(let i=0;i<7;i++)S.line(g,2,(.04+i*.055)*unit,2*unit-2,(.04+i*.055)*unit,P.cream,1);
    for(const x of [-.16*unit,2*unit+.04*unit]){g.fillStyle=P.rust;g.fillRect(x,0,.12*unit,.59*unit);g.fillStyle=P.ink;g.fillRect(x+1,3,.08*unit,.48*unit);g.fillStyle=P.cream;g.fillRect(x+2,5,1.5,1.5);}g.restore();
   }
   const stack=O.docks.stack(s);for(let i=0;i<4;i++){const x=(stack.x+.13)*unit,y=(stack.y+.21)*unit-i*3;g.fillStyle=P.ink;g.fillRect(x,y,unit*.75,unit*.65);g.fillStyle=i%2?P.cream:P.wood;g.fillRect(x,y,unit*.75,unit*.57);for(let j=0;j<4;j++)S.line(g,x+2,y+6+j*8,x+unit*.73,y+6+j*8,P.rustDark,.7);}
   const dx=(b.x+1)*unit,dy=(b.y+1)*unit;g.fillStyle='#25272222';g.fillRect(dx+5,dy+5,2*unit,unit);g.fillStyle=P.ink;g.fillRect(dx,dy,2*unit,unit);g.fillStyle=P.wood;g.fillRect(dx+3,dy+3,2*unit-6,unit-6);S.grain(g,dx+3,dy+3,2*unit-6,unit-6,81,.025,P.rustDark,.24);g.fillStyle=P.paper;g.fillRect(dx+unit*.18,dy+unit*.18,unit*.7,unit*.58);for(let i=0;i<4;i++)S.line(g,dx+unit*.25,dy+unit*(.28+i*.08),dx+unit*.77,dy+unit*(.28+i*.08),P.rule,1);g.fillStyle=P.ink;g.fillRect(dx+unit*1.26,dy+unit*.18,unit*.47,unit*.33);g.fillStyle=P.cream;g.fillRect(dx+unit*1.3,dy+unit*.22,unit*.39,unit*.22);S.line(g,dx+unit*1.49,dy+unit*.51,dx+unit*1.49,dy+unit*.67,P.ink,3);
   if(this.chunks.size>=64)this.chunks.delete(this.chunks.keys().next().value);this.chunks.set(key,c);return c;
  }
  truckGeometry(s,t,animation=t.animation){const d=s.map.doors.find(d=>d.id===t.door)||s.map.doors[0],east=O.docks.side(s)==='east',length=t.kind==='semi'?13:t.kind==='parcel'?4:7;let x=d.x+(east?.5:0),y=d.y+(east?0:.5);
   if(t.status==='arriving'){const f=Math.max(0,Math.min(1,animation/4)),distance=8*(1-f*f*(3-2*f));if(east)x+=distance;else y+=distance;}
   if(t.status==='yard'){const wait=Math.max(0,s.trucks.filter(q=>q.status==='yard').indexOf(t));if(east){x+=4;const b=s.map.building,spots=[];for(let yy=b.y+1;yy<b.y+b.h-1;yy+=3)if(!s.map.doors.some(q=>Math.abs(yy+1-(q.y+1))<3))spots.push(yy);y=spots[wait]??b.y+b.h+2+(wait-spots.length)*3;}else{x=s.map.building.x+s.map.building.w+3;y=32+wait*3;}}
   return {x,y,w:east?length:2,h:east?2:length};
  }
  rearDoorOpen(s,t,fraction=0){if(['leaving','gone'].includes(t.status))return 0;if(t.closingTick!=null)return Math.max(0,1-(s.tick+fraction-t.closingTick)*O.DT/.7);return t.opened||t.direction==='out'&&t.status==='docked'?1:0;}
  departurePose(s,t,from,age){const east=O.docks.side(s)==='east',axis=east?'x':'y',cross=east?'y':'x',sign=east?-1:1,radius=t.kind==='semi'?7:5,center={x:from.x+from.w/2,y:from.y+from.h/2},road=east?s.map.building.x+s.map.building.w+16.5:41.5,straight=Math.max(1,road-radius-center[axis]),distance=age<1.5?3.5*age*age/3:2.625+(age-1.5)*3.5,arc=Math.max(0,Math.min(Math.PI/2,(distance-straight)/radius)),after=Math.max(0,distance-straight-radius*Math.PI/2);center[axis]+=Math.min(distance,straight)+radius*Math.sin(arc);center[cross]+=sign*(radius*(1-Math.cos(arc))+after);return {...from,x:center.x-from.w/2,y:center.y-from.h/2,angle:-arc};}
  truckPose(s,t,time,fraction){if(t.status==='scheduled')return null;const old=this.truckViews.get(t.id);if(t.status==='gone'&&!old?.departure)return null;
   const target=this.truckGeometry(s,t,t.animation+fraction*O.DT),view=old||{status:t.status,pose:target,time};
   // Presentation only: bridge queue changes without moving simulation coordinates.
   if(old&&['yard','docked'].includes(t.status)&&(old.status!==t.status||old.door!==t.door||old.target?.x!==target.x||old.target?.y!==target.y)&&time-old.time<.25){const distance=Math.hypot(target.x-old.pose.x,target.y-old.pose.y);view.move=distance>.02?{from:{...old.pose},start:time,duration:Math.max(.3,Math.min(1.4,distance/6))}:null;}
   if(t.status==='leaving'&&(!old||old.status!=='leaving')){view.departure={from:old&&time-old.time<.25?{...old.pose}:this.truckGeometry(s,{...t,status:'docked'}),start:time-t.animation-fraction*O.DT};view.move=null;}
   let pose=target;
   if(['leaving','gone'].includes(t.status)&&view.departure){const age=Math.max(0,time-view.departure.start);if(age>24){this.truckViews.delete(t.id);return null;}pose=this.departurePose(s,t,view.departure.from,age);}
   else if(view.move){const f=Math.max(0,Math.min(1,(time-view.move.start)/view.move.duration)),ease=f*f*(3-2*f);pose={...target,x:view.move.from.x+(target.x-view.move.from.x)*ease,y:view.move.from.y+(target.y-view.move.from.y)*ease};if(f===1)view.move=null;}
   Object.assign(view,{status:t.status,door:t.door,target,pose,time});this.truckViews.set(t.id,view);return pose;
  }
  draw(s,ui,fraction){const b=s.map.building,shape=[b.x,b.y,b.w,b.h].join('/'),view=this.viewStamp(s);if(this.homeBuilding!==shape||this.homeView!==view){const fitted=this.homeCamera&&['x','y','zoom'].every(k=>Math.abs(this.camera[k]-this.homeCamera[k])<.001);this.homeBuilding=shape;this.homeView=view;if(fitted)this.home(s);}if(this.visualState!==s||this.visualDay!==s.day||s.tick<this.visualTick){this.palletViews.clear();this.doorViews.clear();this.truckViews.clear();this.visualFraction=0;this.visualState=s;this.visualDay=s.day;}fraction=fraction??(this.visualTick===s.tick?this.visualFraction:0);this.visualFraction=Math.max(0,Math.min(1,fraction));this.visualTick=s.tick;const visualTime=(s.tick+this.visualFraction)*O.DT,before=performance.now(),g=this.g,c=this.camera,z=c.zoom;this.static(s);g.setTransform(this.dpr,0,0,this.dpr,0,0);g.fillStyle=O.business(s)?O.sprites.palette.paper:O.sprites.palette.yard;g.fillRect(0,0,this.w,this.h);const scene=this.view(s);g.save();if(scene){g.beginPath();g.rect(scene.left,scene.top,scene.width,scene.height);g.clip();}const p=this.screen(0,0);const lo=this.world(scene?.left??0,scene?.top??0),hi=this.world(scene?.right??this.w,scene?.bottom??this.h);for(let cy=Math.max(0,Math.floor(lo.y/16));cy<=Math.min(Math.ceil(s.map.h/16)-1,Math.floor(hi.y/16));cy++)for(let cx=Math.max(0,Math.floor(lo.x/16));cx<=Math.min(Math.ceil(s.map.w/16)-1,Math.floor(hi.x/16));cx++){const q=this.screen(cx*16,cy*16);const edge=this.screen((cx+1)*16,(cy+1)*16),x=Math.round(q.x*this.dpr)/this.dpr,y=Math.round(q.y*this.dpr)/this.dpr;g.drawImage(this.chunk(s,cx,cy),x,y,Math.round(edge.x*this.dpr)/this.dpr-x,Math.round(edge.y*this.dpr)/this.dpr-y);}this.hits=[];g.save();this.labels(s);g.restore();const controls=document.querySelector('.shift-camera')?.getBoundingClientRect(),truckLabels=[],truckOffsets=new Map();
   g.save();g.translate(p.x,p.y);g.scale(z,z);
   for(const [key,n]of Object.entries(s.map.wear)){g.fillStyle=ui.heatmap?'#8d5e3b':'#665e49';g.globalAlpha=ui.heatmap?Math.min(.6,n/100):Math.min(.13,n/1000);g.fillRect(Number(key)%s.map.w,Math.floor(Number(key)/s.map.w),1,1);}g.globalAlpha=1;
   for(const d of s.map.doors){const open=s.trucks.some(t=>t.door===d.id&&t.status==='docked'&&(t.opened||t.direction==='out')),old=this.doorViews.get(d.id);if(!old||old.open!==open)this.doorViews.set(d.id,{open,tick:s.tick,from:old?old.open?1:0:open?1:0});const view=this.doorViews.get(d.id),f=ui.settings.reducedMotion?1:Math.min(1,(s.tick-view.tick)*O.DT/.6),amount=view.from+((open?1:0)-view.from)*f,depth=.38*(1-amount);g.save();if(O.docks.side(s)==='east'){g.translate(d.x,d.y+2);g.rotate(-Math.PI/2);}else g.translate(d.x,d.y);g.fillStyle='#252722';g.fillRect(0,-.04,2,.09);if(depth>.01){g.fillStyle='#d7bb8d';g.fillRect(0,-.04,2,depth);g.strokeStyle='#82755d';g.lineWidth=.025;for(let y=.06;y<depth;y+=.09){g.beginPath();g.moveTo(0,y);g.lineTo(2,y);g.stroke();}}g.restore();}
   for(const t of s.trucks){const r=this.truckPose(s,t,visualTime,this.visualFraction);if(!r)continue;const east=O.docks.side(s)==='east',length=east?r.w:r.h,base=this.truckGeometry(s,{...t,status:'docked'}),angle=r.angle||0,bw=Math.abs(Math.cos(angle))*r.w+Math.abs(Math.sin(angle))*r.h,bh=Math.abs(Math.sin(angle))*r.w+Math.abs(Math.cos(angle))*r.h,bounds=angle?{x:r.x+r.w/2-bw/2,y:r.y+r.h/2-bh/2,w:bw,h:bh}:{x:r.x,y:r.y,w:r.w,h:r.h};truckOffsets.set(t.id,{x:r.x-base.x,y:r.y-base.y});if(bounds.x>hi.x+1||bounds.y>hi.y+1||bounds.x+bounds.w<lo.x-1||bounds.y+bounds.h<lo.y-1)continue;
    g.save();g.translate(r.x+r.w/2,r.y+r.h/2);g.rotate((east?-Math.PI/2:0)+(r.angle||0));g.translate(-1,-length/2);
    const doorOpen=this.rearDoorOpen(s,t,this.visualFraction),P=O.sprites.palette;
    g.fillStyle='#25272225';g.fillRect(.12,.13,2,length-.13);
    g.drawImage(O.sprites.truck(length,t.direction,doorOpen>0),-.125,0,2.25,length);
    g.fillStyle=P.paper;g.strokeStyle=P.ink;g.lineWidth=.025;
    for(const side of [0,1]){g.save();g.translate(side?1.96:.04,.1);g.rotate(side?Math.PI+doorOpen*Math.PI*1.5:-doorOpen*Math.PI*1.5);g.fillRect(0,-.055,.94,.11);g.strokeRect(0,-.055,.94,.11);g.restore();}
    g.fillStyle=P.rust;g.fillRect(.1,.1,.12,.1);g.fillRect(1.78,.1,.12,.1);g.restore();
    if(t.status!=='gone')this.hits.push({kind:'truck',id:t.id,...bounds});truckLabels.push({t,r:bounds});
   }
   const visible=s.pallets.filter(p=>['lane','storage','transit'].includes(p.place)||p.place==='trailer'&&s.trucks.find(t=>t.id===p.truckId)?.opened);
   const stacked=new Map(),loose=[];for(const q of visible){if(q.place==='storage'){const key=q.x+'/'+q.y,old=stacked.get(key);if(!old||q.level>=old.level)stacked.set(key,q);}else{const offset=q.place==='trailer'&&truckOffsets.get(q.truckId);loose.push(offset?{...q,x:q.x+offset.x,y:q.y+offset.y}:q);}}const top=[...stacked.values(),...loose];
   const picks=new Map();for(const w of s.workers)if(w.task?.kind==='pick'&&w.task.phase==='dest'&&w.task.progress>0){const task=w.task,n=Math.min(task.count,Math.floor(task.count*task.progress/task.duration));picks.set(task.pallet,-n);picks.set(task.output,n);}
   for(const q of top){if(Math.abs((q.x+.5-c.x)*z)>this.w/2+z||Math.abs((q.y+.5-c.y)*z)>this.h/2+z)continue;const old=this.palletViews.get(q.id);if(!old||old.place!==q.place||old.scanned!==q.scanned)this.palletViews.set(q.id,{place:q.place,scanned:q.scanned,settle:old?.place==='transit'&&['lane','storage'].includes(q.place)?s.tick:old?.settle??-100,scan:old&&!old.scanned&&q.scanned?s.tick:old?.scan??-100});const view=this.palletViews.get(q.id),age=(s.tick-view.settle)*O.DT,settle=!ui.settings.reducedMotion&&age>=0&&age<.18?Math.sin(age/.18*Math.PI)*.04:0;g.drawImage(O.sprites.pallet(picks.has(q.id)?{...q,cases:q.cases+picks.get(q.id)}:q),q.x+.05-settle/2,q.y+.05-settle/2,.9+settle,.9+settle);if(!ui.settings.reducedMotion&&age>=0&&age<.18){g.fillStyle='#d7bb8d';g.globalAlpha=(1-age/.18)*.3;for(let i=0;i<3;i++){g.beginPath();g.arc(q.x+.15+i*.3,q.y+.95+age*.2,.03+age*.15,0,Math.PI*2);g.fill();}g.globalAlpha=1;}if((s.tick-view.scan)*O.DT<.15){g.strokeStyle='#f1e3c6';g.lineWidth=.07;g.strokeRect(q.x+.08,q.y+.08,.84,.84);g.fillStyle='#f1e3c655';g.fillRect(q.x+.5,q.y+.61,.24,.14);}this.hits.push({kind:'pallet',id:q.id,x:q.x,y:q.y,w:1,h:1});
    if(q.level){g.fillStyle='#743f2c';g.fillRect(q.x+.65,q.y-.14,.35,.28);g.fillStyle='#f1e3c6';g.font='.2px "Commit Mono",monospace';g.fillText(String(q.level+1),q.x+.71,q.y+.06);}
    if(ui.settings.colorblind&&q.hold){g.strokeStyle='#f1e3c6';g.lineWidth=.08;g.setLineDash([.12,.08]);g.strokeRect(q.x+.04,q.y+.04,.92,.92);g.setLineDash([]);}
    if(ui.selected.includes(q.id)){g.strokeStyle='#ad5737';g.lineWidth=.06;g.strokeRect(q.x-.02,q.y-.02,1.04,1.04);}
   }
   for(const q of s.parcels||[]){if(q.place==='shipped')continue;g.fillStyle='#ad5737';g.fillRect(q.x+.25,q.y+.25,.5,.5);g.fillStyle='#f1e3c6';g.fillRect(q.x+.46,q.y+.25,.08,.5);g.fillStyle='#f1e3c6';g.fillRect(q.x+.55,q.y+.5,.14,.1);this.hits.push({kind:'parcel',id:q.id,x:q.x,y:q.y,w:1,h:1});}
   for(const w of s.workers){const job=w.task?.kind==='service'?s.serviceJobs.find(j=>j.id===w.task.job):null;if(job)O.sprites.materialCart(g,w,job,s);const lift=w.task?.kind!=='service'&&!(s.powerUntil>s.minute)&&O.has(s,'forklift')&&(w.id===1||w.role==='driver'||w.role==='robot');if(lift)O.sprites.forklift(g,w);O.sprites.worker(g,w,s.tick*.05,z,ui.settings.reducedMotion,lift);if(w.task?.kind==='pick'&&w.task.phase==='dest'&&w.task.progress>0){const q=s.pallets.find(p=>p.id===w.task.pallet),f=ui.settings.reducedMotion?.5:(w.task.progress*3)%1;if(q){g.fillStyle=O.sprites.boxColor(q.item);g.fillRect(w.x+.35,w.y+.35-f*.2,.28,.22);}}}
   if(ui.target?.kind==='putaway')for(const q of ui.storageOptions||[]){g.fillStyle='#ad573730';g.strokeStyle='#ad5737';g.lineWidth=.08;g.fillRect(q.x+.06,q.y+.06,.88,.88);g.strokeRect(q.x+.06,q.y+.06,.88,.88);}
   for(const r of s.map.racks)for(let side=0;side<2;side++)this.hits.push({kind:'rack',id:r.id,side,x:r.x+side,y:r.y,w:1,h:1});
   for(const w of s.workers)for(const [i,t]of [w.task,...w.queue].filter(Boolean).entries()){const d=t.dest||t.end;g.fillStyle='#252722';g.beginPath();g.arc(d.x+.5,d.y+.5,.18,0,Math.PI*2);g.fill();g.fillStyle='#f1e3c6';g.font='.23px "Commit Mono",monospace';g.textAlign='center';g.fillText(String(i+1),d.x+.5,d.y+.57);}
   if(ui.hover){const h=ui.hover,slot=h.kind==='rack'&&ui.rackHover(h);g.strokeStyle=slot?(slot.blocked?'#ad5737':'#252722'):'#252722';g.lineWidth=slot?.1:.05;if(slot){g.fillStyle=slot.blocked?'#ad573733':'#ad573755';g.fillRect(h.x+.03,h.y+.03,.94,.94);}g.strokeRect(h.x+.03,h.y+.03,h.w-.06,h.h-.06);}
   if(ui.cursor){g.strokeStyle='#743f2c';g.lineWidth=.07;g.strokeRect(ui.cursor.x,ui.cursor.y,1,1);}
   if(ui.build){g.fillStyle='#ad573750';const cursor=ui.cursor||{x:10,y:10};g.fillRect(cursor.x,cursor.y,ui.build==='zone'?4:2,ui.build==='zone'?3:1);}
   if(ui.box){g.fillStyle='#ad57372b';g.strokeStyle='#743f2c';g.lineWidth=.05;g.fillRect(ui.box.x,ui.box.y,ui.box.w,ui.box.h);g.strokeRect(ui.box.x,ui.box.y,ui.box.w,ui.box.h);}
   for(const w of s.workers)if(w.task?.kind==='wrap'&&w.task.progress>0){const q=s.pallets.find(p=>p.id===w.task.pallet);if(q){g.strokeStyle='#f1e3c688';g.lineWidth=.025;const f=ui.settings.reducedMotion?.5:w.task.progress%1;g.beginPath();g.ellipse(q.x+.5,q.y+.5,.52,.35+f*.2,0,0,Math.PI*2);g.stroke();}}
   g.restore();O.lighting.draw(g,s,c,this.w,this.h);g.save();for(const {t,r}of truckLabels)this.truckLabel(s,t,r,controls);g.restore();
   if(!ui.settings.reducedMotion&&s.weather!=='clear'){g.save();g.beginPath();const b=s.map.building,l=this.screen(b.x-1,b.y-1);g.rect(0,0,this.w,this.h);g.rect(l.x,l.y,(b.w+2)*z,(b.h+2)*z);g.clip('evenodd');g.strokeStyle=s.weather==='snow'?'#f1e3c670':'#82755d45';g.lineWidth=s.weather==='snow'?2:1;for(let i=0;i<45;i++){const x=((i*117+s.tick*1.7)%this.w),y=((i*73+s.tick*3)%this.h);g.beginPath();g.moveTo(x,y);g.lineTo(x+(s.weather==='snow'?1:4),y+(s.weather==='snow'?1:11));g.stroke();}g.restore();}
   if(ui.hover?.kind==='rack'){const q=ui.rackHover(ui.hover);if(q){const pos=this.screen(ui.hover.x+.5,ui.hover.y),size=11;g.font=size+'px "Commit Mono",monospace';const width=Math.min(this.w-16,g.measureText(q.label).width+16),x=Math.max(8,Math.min(this.w-width-8,pos.x-width/2)),y=Math.max(8,pos.y-30);g.fillStyle='#252722';g.fillRect(x,y,width,24);this.text(g,q.label,x+8,y+16,size,q.blocked?'#e8d5b0':'#f1e3c6');}}
   if(ui.hover&&ui.hover.kind==='pallet'&&!ui.selected.length){const q=s.pallets.find(p=>p.id===ui.hover.id);if(q){const pos=this.screen(q.x+.5,q.y-.2),label=O.items[q.item].name+' / '+q.cases+' cases'+(q.openUnits?' / '+q.openUnits+' loose units':'');g.fillStyle='#252722';g.fillRect(pos.x-110,pos.y-27,220,23);this.text(g,label,pos.x,pos.y-12,10,'#f1e3c6','center');}}
   ui.drawGuide?.(this);g.restore();if(scene)this.hits=this.hits.filter(r=>r.x+r.w>lo.x&&r.x<hi.x&&r.y+r.h>lo.y&&r.y<hi.y);
   if(this.palletViews.size>8192)this.palletViews.clear();
   this.frameTimes.push(performance.now()-before);if(this.frameTimes.length>240)this.frameTimes.shift();
  }
  hit(x,y,preferRack=false){const scene=this.view(this.visualState);if(scene&&(x<scene.left||x>=scene.right||y<scene.top||y>=scene.bottom))return null;const p=this.world(x,y),overlap=this.hits.slice().reverse().filter(r=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h),direct=preferRack?overlap[0]:overlap.find(r=>r.kind==='pallet')||overlap[0];if(direct)return direct;if(matchMedia('(pointer:coarse)').matches){const tolerance=22/this.camera.zoom;return this.hits.map(r=>({r,d:Math.hypot(p.x-(r.x+r.w/2),p.y-(r.y+r.h/2))})).filter(q=>q.d<=tolerance).sort((a,b)=>a.d-b.d)[0]?.r||null;}return null;}
 }
 O.Renderer=Renderer;
})(window);
