(function(root){
 'use strict';const O=root.OneShift;
 class Renderer{
  constructor(canvas){this.canvas=canvas;this.g=canvas.getContext('2d',{alpha:false});this.camera={x:18,y:20,zoom:24};this.hits=[];this.chunks=new Map();this.staticKey='';this.frameTimes=[];}
  resize(){const d=Math.min(devicePixelRatio||1,2),r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=d;this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);}
  home(s,panel=false){const b=s.map.building,available=this.w-(panel?300:0);this.camera={x:b.x+b.w/2+(panel?150/Math.max(14,this.h/36):0),y:b.y+b.h/2+4,zoom:Math.max(10,Math.min(34,(available-80)/(b.w+9),(this.h-145)/(b.h+14)))};}
  screen(x,y){const c=this.camera;return {x:(x-c.x)*c.zoom+this.w/2,y:(y-c.y)*c.zoom+this.h/2};}
  world(x,y){const c=this.camera;return {x:(x-this.w/2)/c.zoom+c.x,y:(y-this.h/2)/c.zoom+c.y};}
  text(g,text,x,y,size=12,color='#d9d3bc',align='left'){g.fillStyle=color;g.font=size+'px "Commit Mono",monospace';g.textAlign=align;g.fillText(text,x,y);}
  static(s){const key=s.map.revision+'/'+s.map.w+'/'+s.map.building.w;if(key!==this.staticKey){this.staticKey=key;this.chunks.clear();}}
  chunk(s,cx,cy){const key=cx+'/'+cy;if(this.chunks.has(key))return this.chunks.get(key);const unit=32,c=O.sprites.canvas(512,512),g=c.getContext('2d'),b=s.map.building,P=O.sprites.palette;g.translate(-cx*512,-cy*512);
   g.fillStyle=P.yard;g.fillRect(cx*512,cy*512,512,512);
   for(let y=cy*16;y<Math.min(s.map.h,(cy+1)*16);y++)for(let x=cx*16;x<Math.min(s.map.w,(cx+1)*16);x++){const n=((x*73856093^y*19349663)>>>0)%100;g.fillStyle=n%2?'#67715b':'#4a594b';g.globalAlpha=.18;g.fillRect(x*unit+n%16,y*unit+n%23,8+n%8,4);}g.globalAlpha=1;
   g.fillStyle='#707269';g.fillRect((b.x-2)*unit,(b.y+b.h)*unit,(b.w+4)*unit,12*unit);
   g.fillStyle=P.asphalt;g.fillRect(0,39*unit,s.map.w*unit,5*unit);g.setLineDash([24,22]);g.strokeStyle='#b6b69b';g.lineWidth=2;g.beginPath();g.moveTo(0,41.5*unit);g.lineTo(s.map.w*unit,41.5*unit);g.stroke();g.setLineDash([]);
   g.strokeStyle='#c8bea280';g.lineWidth=1.5;for(let x=b.x;x<b.x+b.w;x+=4){g.strokeRect(x*unit,31*unit,2.5*unit,6*unit);}
   g.fillStyle='#2b3c3350';g.shadowColor='#1c302c70';g.shadowBlur=15;g.shadowOffsetX=7;g.shadowOffsetY=9;g.fillRect((b.x-1)*unit,(b.y-1)*unit,(b.w+2)*unit,(b.h+2)*unit);g.shadowColor='transparent';
   for(let y=Math.max(b.y,cy*16);y<Math.min(b.y+b.h,(cy+1)*16);y++)for(let x=Math.max(b.x,cx*16);x<Math.min(b.x+b.w,(cx+1)*16);x++){const n=((x*37+y*23)%9);g.fillStyle=['#bbb7a7','#b9b5a6','#bcb8a8'][n%3];g.fillRect(x*unit,y*unit,unit,unit);g.strokeStyle='#8d938620';g.lineWidth=.6;g.strokeRect(x*unit,y*unit,unit,unit);if(n<3){g.fillStyle='#8e8e7b10';g.fillRect(x*unit+7,y*unit+5,14,2);}}
   const lane=(x,label)=>{g.strokeStyle=P.paint;g.lineWidth=2;g.strokeRect(x*unit,(b.y+b.h-5)*unit,6*unit,4*unit);g.fillStyle=P.paint+'24';g.fillRect(x*unit,(b.y+b.h-5)*unit,6*unit,4*unit);this.text(g,label,(x+3)*unit,(b.y+b.h-5.35)*unit,10,'#687261','center');for(let i=1;i<6;i++){g.beginPath();g.moveTo((x+i)*unit,(b.y+b.h-5)*unit);g.lineTo((x+i)*unit,(b.y+b.h-1)*unit);g.stroke();}};lane(b.x+3,'RECEIVING');lane(b.x+b.w-10,'SHIPPING');
   g.strokeStyle='#e0d5a6';g.lineWidth=2;g.setLineDash([10,5]);g.beginPath();g.moveTo((b.x+1)*unit,(b.y+b.h-6)*unit);g.lineTo((b.x+b.w-1)*unit,(b.y+b.h-6)*unit);g.stroke();g.setLineDash([]);
   for(const z of s.map.zones){g.fillStyle=(z.type==='hold'?'#b8796d':'#6f9a6c')+'22';g.fillRect(z.x*unit,z.y*unit,z.w*unit,z.h*unit);g.strokeStyle=z.type==='hold'?'#b8796d':'#708a6b';g.strokeRect(z.x*unit,z.y*unit,z.w*unit,z.h*unit);this.text(g,z.type.toUpperCase(),(z.x+.2)*unit,(z.y+.6)*unit,9,'#4b614d');}
   for(const r of s.map.racks){g.shadowColor='#29352b55';g.shadowBlur=5;g.shadowOffsetX=4;g.shadowOffsetY=5;g.fillStyle='#65766d';g.fillRect(r.x*unit,r.y*unit,2*unit,unit);g.shadowColor='transparent';g.fillStyle=P.steel;for(let i=0;i<3;i++)g.fillRect((r.x+i)*unit-2,r.y*unit-2,5,unit+4);g.fillStyle=P.beam;g.fillRect(r.x*unit,r.y*unit,2*unit,4);g.fillRect(r.x*unit,(r.y+1)*unit-4,2*unit,4);this.text(g,'A'+r.id,(r.x+1)*unit,(r.y+.65)*unit,8,'#d8d5bd','center');}
   for(const station of s.map.stations){g.fillStyle='#6e817d';g.fillRect(station.x*unit,station.y*unit,2*unit,unit);g.fillStyle='#d1bea0';g.fillRect(station.x*unit+3,station.y*unit+3,2*unit-6,unit-6);this.text(g,station.id.toUpperCase(),(station.x+1)*unit,(station.y+.6)*unit,8,'#374c41','center');}
   g.fillStyle='#e1d9be';g.fillRect((b.x-1)*unit,(b.y-1)*unit,(b.w+2)*unit,unit*.45);g.fillRect((b.x-1)*unit,(b.y-1)*unit,unit*.4,(b.h+2)*unit);g.fillRect((b.x+b.w+.6)*unit,(b.y-1)*unit,unit*.4,(b.h+2)*unit);g.fillStyle='#738171';g.fillRect((b.x-1)*unit,(b.y+b.h)*unit,(b.w+2)*unit,unit*.45);g.fillStyle='#31433635';g.fillRect(b.x*unit,b.y*unit,b.w*unit,unit*.18);g.fillRect(b.x*unit,b.y*unit,unit*.12,b.h*unit);
   for(const d of s.map.doors){g.fillStyle='#59675b';g.fillRect(d.x*unit,d.y*unit,2*unit,.45*unit);g.fillStyle='#b2b7a3';for(let i=0;i<5;i++)g.fillRect(d.x*unit,(d.y+.05*i)*unit,2*unit,1);this.text(g,String(s.map.doors.indexOf(d)+1),(d.x+1)*unit,(d.y-.5)*unit,15,'#637762','center');g.fillStyle='#b4a775';g.fillRect((d.x-.2)*unit,d.y*unit,5,.6*unit);g.fillRect((d.x+2)*unit,d.y*unit,5,.6*unit);}
   for(let x=b.x+3;x<b.x+b.w;x+=7){g.fillStyle='#769896';g.fillRect(x*unit,(b.y-1)*unit,3*unit,unit*.35);g.fillStyle='#e4e3c855';g.fillRect(x*unit,(b.y-1)*unit,3*unit,2);}
   g.fillStyle='#e1d4b045';g.fillRect((b.x+1)*unit,(b.y+b.h-1)*unit,3*unit,.07*unit);for(let i=0;i<4;i++){g.fillStyle=i%2?'#d6cba4':'#829184';g.fillRect((b.x+1.2)*unit,(b.y+b.h-3.5-i*.5)*unit,.8*unit,.42*unit);}
   this.text(g,'80 FT',(b.x+b.w+.6)*unit,(b.y+10)*unit,10,'#c8c9af');this.text(g,'FERN TRAIL WAREHOUSE',(b.x+b.w/2)*unit,(b.y-.45)*unit,9,'#d4d4b9','center');
   // Small objects make the building feel worked in: pallet stack, desk and planting.
   for(let i=0;i<5;i++){g.fillStyle=i%2?'#ac865b':'#c3a071';g.fillRect((b.x+1.3)*unit,(b.y+b.h-2.5)*unit-i*2,unit*.7,unit*.6);}
   g.fillStyle='#9e8465';g.fillRect((b.x+1)*unit,(b.y+1)*unit,2*unit,unit);g.fillStyle='#d7d3bb';g.fillRect((b.x+1.2)*unit,(b.y+1.2)*unit,unit*.8,unit*.5);
   for(let i=0;i<12;i++){const x=(b.x-2.6)*unit,y=(b.y+i*2)*unit;g.fillStyle='#3c503c';g.beginPath();g.arc(x,y,12,0,Math.PI*2);g.fill();g.fillStyle='#718563';g.beginPath();g.arc(x-3,y-3,9,0,Math.PI*2);g.fill();}
   if(this.chunks.size>=64)this.chunks.delete(this.chunks.keys().next().value);this.chunks.set(key,c);return c;
  }
  truckGeometry(s,t){const d=s.map.doors.find(d=>d.id===t.door)||s.map.doors[0],length=t.kind==='semi'?13:t.kind==='parcel'?4:7;let x=d.x,y=d.y+.5;
   if(['arriving','yard'].includes(t.status)){x=s.map.building.x+s.map.building.w+3;y=32+(s.trucks.filter(q=>q.status==='yard').indexOf(t))*3;if(t.status==='arriving')x+=Math.max(0,2-t.animation)*6;}
   if(t.status==='leaving')y+=t.animation*t.animation*1.5;
   return {x,y,w:2,h:length};
  }
  draw(s,ui){const before=performance.now(),g=this.g,c=this.camera,z=c.zoom;this.static(s);g.setTransform(this.dpr,0,0,this.dpr,0,0);g.fillStyle='#555f52';g.fillRect(0,0,this.w,this.h);const p=this.screen(0,0);const lo=this.world(0,0),hi=this.world(this.w,this.h);for(let cy=Math.max(0,Math.floor(lo.y/16));cy<=Math.min(Math.ceil(s.map.h/16)-1,Math.floor(hi.y/16));cy++)for(let cx=Math.max(0,Math.floor(lo.x/16));cx<=Math.min(Math.ceil(s.map.w/16)-1,Math.floor(hi.x/16));cx++){const q=this.screen(cx*16,cy*16);const edge=this.screen((cx+1)*16,(cy+1)*16),x=Math.round(q.x*this.dpr)/this.dpr,y=Math.round(q.y*this.dpr)/this.dpr;g.drawImage(this.chunk(s,cx,cy),x,y,Math.round(edge.x*this.dpr)/this.dpr-x,Math.round(edge.y*this.dpr)/this.dpr-y);}this.hits=[];
   g.save();g.translate(p.x,p.y);g.scale(z,z);
   for(const [key,n]of Object.entries(s.map.wear)){g.fillStyle=ui.heatmap?'#8d5e3b':'#665e49';g.globalAlpha=ui.heatmap?Math.min(.6,n/100):Math.min(.13,n/1000);g.fillRect(Number(key)%s.map.w,Math.floor(Number(key)/s.map.w),1,1);}g.globalAlpha=1;
   for(const t of s.trucks){if(['scheduled','gone'].includes(t.status))continue;const r=this.truckGeometry(s,t);if((r.x-c.x)*z>this.w/2+100||(r.y-c.y)*z>this.h/2+300)continue;
    g.shadowColor='#26342e55';g.shadowBlur=z*.2;g.shadowOffsetX=z*.12;g.shadowOffsetY=z*.16;g.fillStyle=t.direction==='in'?'#d2c9b1':'#b3c0b5';g.fillRect(r.x,r.y,2,r.h);g.shadowColor='transparent';g.fillStyle='#607469';g.fillRect(r.x+.05,r.y+r.h-.9,1.9,.85);g.fillStyle='#9ab4ac';g.fillRect(r.x+.25,r.y+r.h-.9,1.5,.35);g.fillStyle='#303b33';for(const x of [-.1,1.9])for(const y of [r.h-1.5,r.h-3])g.fillRect(r.x+x,r.y+y,.2,.65);
    g.strokeStyle='#879487';g.lineWidth=.04;for(let y=1;y<r.h-1;y++) {g.beginPath();g.moveTo(r.x+.06,r.y+y);g.lineTo(r.x+1.94,r.y+y);g.stroke();}
    if(t.opened&&t.direction==='in'){g.fillStyle='#867963';g.fillRect(r.x+.1,r.y+.1,1.8,r.h-1.2);g.fillStyle='#d0c9b4';g.fillRect(r.x-.7,r.y-.1,.7,.12);g.fillRect(r.x+2,r.y-.1,.7,.12);}
    g.fillStyle='#e4c888';g.fillRect(r.x+.1,r.y+.1,.12,.1);g.fillRect(r.x+1.78,r.y+.1,.12,.1);
    this.hits.push({kind:'truck',id:t.id,...r});const label=this.screen(r.x+1,r.y+r.h*.6);g.save();g.setTransform(this.dpr,0,0,this.dpr,0,0);this.text(g,t.direction==='in'?'IN':'OUT',label.x,label.y,Math.max(10,z*.4),'#425a48','center');if(t.status==='docked'&&z>16)this.text(g,Math.max(0,Math.ceil(t.deadline-s.minute))+' MIN',label.x,label.y+14,9,'#647663','center');g.restore();
   }
   const visible=s.pallets.filter(p=>['lane','storage','transit'].includes(p.place)||p.place==='trailer'&&s.trucks.find(t=>t.id===p.truckId)?.opened);
   const stacked=new Map(),loose=[];for(const q of visible){if(q.place==='storage'){const key=q.x+'/'+q.y,old=stacked.get(key);if(!old||q.level>=old.level)stacked.set(key,q);}else loose.push(q);}const top=[...stacked.values(),...loose];
   for(const q of top){if(Math.abs((q.x+.5-c.x)*z)>this.w/2+z||Math.abs((q.y+.5-c.y)*z)>this.h/2+z)continue;g.drawImage(O.sprites.pallet(q),q.x+.05,q.y+.05,.9,.9);this.hits.push({kind:'pallet',id:q.id,x:q.x,y:q.y,w:1,h:1});
    if(q.level){g.fillStyle='#3d534a';g.fillRect(q.x+.65,q.y-.14,.35,.28);g.fillStyle='#f3ebd3';g.font='.2px monospace';g.fillText(String(q.level+1),q.x+.71,q.y+.06);}
    if(ui.selected.includes(q.id)){g.strokeStyle='#faf0c4';g.lineWidth=.06;g.strokeRect(q.x-.02,q.y-.02,1.04,1.04);}
   }
   for(const q of s.parcels||[]){if(q.place==='shipped')continue;g.fillStyle='#c7ad85';g.fillRect(q.x+.25,q.y+.25,.5,.5);g.fillStyle='#e4dbbf';g.fillRect(q.x+.46,q.y+.25,.08,.5);g.fillStyle='#f0e9d8';g.fillRect(q.x+.55,q.y+.5,.14,.1);this.hits.push({kind:'parcel',id:q.id,x:q.x,y:q.y,w:1,h:1});}
   for(const w of s.workers){if(O.has(s,'forklift')&&(w.id===1||w.role==='driver'||w.role==='robot')){g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);g.fillStyle='#b8985d';g.fillRect(-.38,-.52,.76,1);g.fillStyle='#53695d';g.fillRect(-.23,-.34,.46,.36);g.fillStyle='#354239';g.fillRect(-.46,-.3,.14,.3);g.fillRect(.32,-.3,.14,.3);g.restore();}O.sprites.worker(g,w,s.tick*.05,z,ui.settings.reducedMotion);}
   for(const r of s.map.racks)this.hits.push({kind:'rack',id:r.id,x:r.x,y:r.y,w:2,h:1});
   for(const w of s.workers)for(const [i,t]of [w.task,...w.queue].filter(Boolean).entries()){const d=t.dest||t.end;g.fillStyle='#405848';g.beginPath();g.arc(d.x+.5,d.y+.5,.18,0,Math.PI*2);g.fill();g.fillStyle='#f1e6c5';g.font='.23px monospace';g.textAlign='center';g.fillText(String(i+1),d.x+.5,d.y+.57);}
   if(ui.hover){const h=ui.hover;g.strokeStyle='#f2e4b4';g.lineWidth=.05;g.strokeRect(h.x-.06,h.y-.06,h.w+.12,h.h+.12);}
   if(ui.cursor){g.strokeStyle='#f1e0ac';g.lineWidth=.07;g.strokeRect(ui.cursor.x,ui.cursor.y,1,1);}
   if(ui.build){g.fillStyle='#80977150';const cursor=ui.cursor||{x:10,y:10};g.fillRect(cursor.x,cursor.y,ui.build==='zone'?4:2,ui.build==='zone'?3:1);}
   if(ui.box){g.fillStyle='#dfd8a22b';g.strokeStyle='#e4d7a0';g.lineWidth=.05;g.fillRect(ui.box.x,ui.box.y,ui.box.w,ui.box.h);g.strokeRect(ui.box.x,ui.box.y,ui.box.w,ui.box.h);}
   for(const w of s.workers)if(w.task?.kind==='wrap'&&w.task.progress>0){const q=s.pallets.find(p=>p.id===w.task.pallet);if(q){g.strokeStyle='#f7efd288';g.lineWidth=.025;const f=ui.settings.reducedMotion?.5:w.task.progress%1;g.beginPath();g.ellipse(q.x+.5,q.y+.5,.52,.35+f*.2,0,0,Math.PI*2);g.stroke();}}
   g.restore();O.lighting.draw(g,s,c,this.w,this.h);
   if(!ui.settings.reducedMotion&&s.weather!=='clear'){g.save();g.beginPath();const b=s.map.building,l=this.screen(b.x-1,b.y-1);g.rect(0,0,this.w,this.h);g.rect(l.x,l.y,(b.w+2)*z,(b.h+2)*z);g.clip('evenodd');g.strokeStyle=s.weather==='snow'?'#e8e1c970':'#ccd5bd45';g.lineWidth=s.weather==='snow'?2:1;for(let i=0;i<45;i++){const x=((i*117+s.tick*1.7)%this.w),y=((i*73+s.tick*3)%this.h);g.beginPath();g.moveTo(x,y);g.lineTo(x+(s.weather==='snow'?1:4),y+(s.weather==='snow'?1:11));g.stroke();}g.restore();}
   if(ui.hover&&ui.hover.kind==='pallet'&&!ui.selected.length){const q=s.pallets.find(p=>p.id===ui.hover.id);if(q){const pos=this.screen(q.x+.5,q.y-.2),label=O.items[q.item].name+' / '+q.cases+' cases';g.fillStyle='#273f35';g.fillRect(pos.x-110,pos.y-27,220,23);this.text(g,label,pos.x,pos.y-12,10,'#f1e8ca','center');}}
   this.frameTimes.push(performance.now()-before);if(this.frameTimes.length>240)this.frameTimes.shift();
  }
  hit(x,y){const p=this.world(x,y),direct=this.hits.slice().reverse().find(r=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h);if(direct)return direct;if(matchMedia('(pointer:coarse)').matches){const tolerance=22/this.camera.zoom;return this.hits.map(r=>({r,d:Math.hypot(p.x-(r.x+r.w/2),p.y-(r.y+r.h/2))})).filter(q=>q.d<=tolerance).sort((a,b)=>a.d-b.d)[0]?.r||null;}return null;}
 }
 O.Renderer=Renderer;
})(window);
