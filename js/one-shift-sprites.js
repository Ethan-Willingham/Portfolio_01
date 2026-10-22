(function(root){
 'use strict';
 const O=root.OneShift;
 // The warehouse and receiving illustration share three printing inks.
 const palette={paper:'#f1e3c6',ink:'#252722',rust:'#ad5737',rustLight:'#bb6945',rustDark:'#743f2c',cream:'#e8d5b0',concrete:'#ebddbf',yard:'#d1bf9d',asphalt:'#393a31',box:'#ad5737',wood:'#d7bb8d',steel:'#33362d',beam:'#ad5737',paint:'#f1e3c6',rule:'#82755d'};
 const caches=new Map();
 let artRevision=0,paperImage=null;
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
 function hash(value){let n=2166136261;for(const ch of String(value))n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;}
 function polygon(g,points,fill,stroke=palette.ink,width=.7){g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
 function line(g,x1,y1,x2,y2,color=palette.ink,width=.7){g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();}
 // Seeded ink loss belongs to the material and never crawls between frames.
 function grain(g,x,y,w,h,seed=1,density=.08,color=palette.paper,alpha=.3){const rng=random(seed),n=Math.ceil(w*h*density);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle=color;g.globalAlpha=alpha;for(let i=0;i<n;i++){const px=x+rng()*w,py=y+rng()*h,size=.16+rng()*.65;g.fillRect(px,py,size*(rng()>.92?3:1),size*.65);}g.restore();}
 function paper(g,x,y,w,h){if(!paperImage)return;g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.globalAlpha=.45;const pattern=g.createPattern(paperImage,'repeat');if(pattern){pattern.setTransform(new DOMMatrix().scale(.5));g.fillStyle=pattern;g.fillRect(x,y,w,h);}g.restore();}
 function setPaperTexture(src){const img=new Image();img.onload=()=>{paperImage=img;artRevision++;};img.src=src;}
 function boxColor(item,index=0){return item==='notebook'&&index%3!==0?palette.cream:item==='radio'&&index%4===0?palette.cream:palette.rust;}
 function carton(g,x,y,w,h,item,index=0,depth=3){
  const color=boxColor(item,index),light=color===palette.cream;
  polygon(g,[[x,y+h],[x+w,y+h],[x+w+depth,y+h-depth],[x+depth,y+h-depth]],light?palette.wood:palette.rustDark);
  polygon(g,[[x+w,y],[x+w+depth,y-depth],[x+w+depth,y+h-depth],[x+w,y+h]],light?palette.wood:palette.rustDark);
  polygon(g,[[x,y],[x+depth,y-depth],[x+w+depth,y-depth],[x+w,y]],light?palette.paper:palette.rustLight);
  polygon(g,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],color);
  const tape=Math.max(2,w*.14);g.fillStyle=palette.paper;g.fillRect(x+w*.48-tape/2,y,tape,h*.86);
  line(g,x+1,y+1,x+w-1,y+1,palette.paper,.45);
  line(g,x+w*.48,y+h*.86,x+w*.48,y+h,palette.rustDark,.45);
  grain(g,x+.5,y+.5,w-1,h-1,hash(item)+index*97,.15,light?palette.rustDark:palette.paper,light?.12:.32);
 }
 function barcode(g,x,y,w,h,seed=1){g.fillStyle=palette.paper;g.fillRect(x,y,w,h);const r=random(seed);g.fillStyle=palette.ink;for(let px=x+1.5;px<x+w-1.5;){const n=.35+r()*.7;g.fillRect(px,y+1.5,n,h-3);px+=n+.4+r()*.6;}}
 function pallet(p){
  const key=['print-pallet',p.item,p.cases,p.openUnits||0,p.ti,p.hold,p.confirmed,p.wrapped,p.condition].join('/');if(caches.has(key))return caches.get(key);
  const c=canvas(320,320),g=c.getContext('2d');g.scale(3.2,3.2);
  polygon(g,[[9,18],[87,18],[96,27],[96,92],[18,92],[9,84]],'#25272225',null);
  polygon(g,[[8,13],[86,13],[91,20],[91,85],[8,85]],palette.wood);
  for(let row=0;row<5;row++){const y=15+row*13;g.fillStyle=row%2?palette.cream:palette.wood;g.fillRect(9,y,77,10);line(g,10,y+9,87,y+9,palette.rustDark,.65);line(g,15,y+4,72-row*4,y+4,palette.rustDark,.35);for(const x of [14,80]){g.fillStyle=palette.ink;g.fillRect(x,y+3,.85,.85);}}
  // Exposed slats and open fork pockets keep the load legible as a pallet.
  g.fillStyle=palette.ink;g.fillRect(9,79,78,8);g.fillStyle=palette.cream;for(const x of [9,44,79])g.fillRect(x,79,8,8);g.fillStyle=palette.wood;g.fillRect(8,77,80,3);g.fillRect(8,86,80,2);line(g,10,78,86,78,palette.paper,.7);
  const ti=Math.max(1,p.ti||8),cols=ti<=6?2:ti===10?3:2,rows=Math.ceil(ti/cols),visible=p.cases===0?0:p.cases%ti||ti;
  const area={x:12,y:15,w:68,h:59},cellW=area.w/cols,cellH=area.h/rows;
  for(let i=0;i<visible;i++){const row=Math.floor(i/cols),col=i%cols,x=area.x+col*cellW,y=area.y+row*cellH;carton(g,x,y,cellW-2.1,cellH-2.2,p.item,i,3.3);}
  if(p.openUnits){const x=p.cases?55:29,y=p.cases?20:31;polygon(g,[[x,y],[x+24,y],[x+24,y+25],[x,y+25]],palette.ink);polygon(g,[[x,y],[x-7,y-4],[x-7,y+21],[x,y+25]],palette.rustLight);polygon(g,[[x+24,y],[x+31,y-4],[x+31,y+21],[x+24,y+25]],palette.rust);for(let i=0;i<Math.min(12,p.openUnits);i++){g.fillStyle=i%2?palette.cream:palette.rustLight;g.fillRect(x+3+i%4*5,y+3+Math.floor(i/4)*7,3.4,5);}}
  if(p.condition==='damage')polygon(g,[[77,14],[65,18],[82,29]],palette.ink,null);
  if(p.wrapped&&p.cases){line(g,12,29,83,25,palette.paper,.65);line(g,13,52,83,56,palette.paper,.75);line(g,12,67,80,63,palette.paper,.45);}
  if(p.cases||p.openUnits)barcode(g,58,58,19,11,hash(p.item));
  if(p.confirmed){g.fillStyle=p.hold?palette.rust:palette.ink;g.fillRect(12,64,12,10);g.fillStyle=palette.paper;g.font='bold 8px "Commit Mono"';g.textAlign='center';g.fillText(p.hold?'H':'R',18,71.5);}
  if(caches.size>128)caches.delete(caches.keys().next().value);caches.set(key,c);return c;
 }
 function station(id){
  const key='print-station/'+id;if(caches.has(key))return caches.get(key);const c=canvas(384,192),g=c.getContext('2d');g.scale(4,4);
  polygon(g,[[5,8],[90,8],[95,14],[95,45],[10,45]],'#25272224',null);
  polygon(g,[[4,5],[88,5],[91,10],[91,40],[4,40]],palette.ink);
  g.fillStyle=palette.wood;g.fillRect(7,8,80,27);grain(g,7,8,80,27,hash(id),.2,palette.rustDark,.2);line(g,8,9,86,9,palette.paper,.75);g.fillStyle=palette.rust;g.fillRect(5,36,84,3);
  for(const x of [8,83]){g.fillStyle=palette.paper;g.fillRect(x,38,2,1);}
  if(id==='wrapper'){
   polygon(g,[[10,10],[20,10],[20,33],[10,33]],palette.rust);g.fillStyle=palette.ink;g.beginPath();g.ellipse(56,22,25,13,0,0,Math.PI*2);g.fill();g.strokeStyle=palette.cream;g.lineWidth=.7;g.beginPath();g.ellipse(56,22,22,10,0,0,Math.PI*2);g.stroke();for(let y=15;y<31;y+=3)line(g,13,y,18,y,palette.cream,.6);g.fillStyle=palette.paper;g.fillRect(13,15,3,16);
  }else if(id==='pack'){
   polygon(g,[[10,10],[29,10],[29,23],[10,23]],palette.ink);g.fillStyle=palette.paper;g.fillRect(13,12,13,6);line(g,15,14,23,14,palette.ink,.75);line(g,15,16,20,16,palette.ink,.5);g.fillRect(17,23,10,7);carton(g,40,17,18,14,'stove',0,3);g.fillStyle=palette.ink;g.beginPath();g.arc(77,25,5,0,Math.PI*2);g.fill();g.fillStyle=palette.paper;g.beginPath();g.arc(77,25,2.2,0,Math.PI*2);g.fill();
  }else if(id==='baler'||id==='repair'){
   g.fillStyle=palette.rust;g.fillRect(10,10,34,23);g.fillStyle=palette.ink;g.fillRect(13,13,28,17);for(let i=0;i<5;i++)line(g,17,16+i*2.7,37,16+i*2.7,palette.wood,1.2);g.fillRect(48,10,3,23);carton(g,59,18,20,13,'chair',0,2);line(g,66,18,66,31,palette.ink,.65);line(g,74,18,74,31,palette.ink,.65);
  }else{
   g.fillStyle=palette.ink;g.fillRect(10,10,76,6);for(let i=0;i<9;i++){g.fillStyle=palette.paper;g.fillRect(14+i*8,12,1,1);}carton(g,12,23,16,10,'stove',0,2);carton(g,36,24,13,9,'notebook',1,2);carton(g,62,22,18,11,'lantern',2,2);barcode(g,66,24,9,5,2);
  }
  caches.set(key,c);return c;
 }
 function forklift(g,w){
  g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);g.scale(.01,.01);
  polygon(g,[[-46,-50],[38,-50],[48,-40],[48,49],[38,58],[-38,58],[-46,49]],palette.ink);
  polygon(g,[[-40,-44],[34,-44],[41,-36],[41,44],[32,51],[-32,51],[-40,44]],palette.rust);
  g.fillStyle=palette.ink;for(const x of [-51,38])for(const y of [-39,27])g.fillRect(x,y,13,25);
  polygon(g,[[-33,31],[33,31],[34,44],[27,49],[-27,49],[-34,44]],palette.rustLight);
  line(g,-29,39,28,39,palette.paper,1.3);g.fillStyle=palette.ink;g.fillRect(-24,-25,48,51);g.fillStyle=palette.wood;g.fillRect(-16,-8,32,23);g.fillStyle=palette.ink;g.fillRect(-13,4,26,10);
  g.fillStyle=palette.ink;g.fillRect(-40,-59,80,11);g.fillRect(-26,-102,9,49);g.fillRect(17,-102,9,49);line(g,-22,-99,-22,-59,palette.cream,1);line(g,21,-99,21,-59,palette.cream,1);
  for(const x of [-33,24]){g.fillStyle=palette.paper;g.fillRect(x,41,8,4);}grain(g,-35,31,70,17,31,.12,palette.paper,.35);g.restore();
 }
 function worker(g,w,t,scale,reduced,lift=false){
  g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);g.scale(.01,.01);
  if(w.role==='robot'){polygon(g,[[-28,-28],[22,-28],[28,-20],[28,25],[21,31],[-22,31],[-28,24]],palette.ink);g.fillStyle=palette.cream;g.fillRect(-22,-23,44,42);g.fillStyle=palette.rust;g.fillRect(-18,-19,36,7);g.fillStyle=palette.ink;g.fillRect(-11,-7,22,12);line(g,-16,24,16,24,palette.paper,1);g.restore();return;}
  const moving=!!w.task?.path?.length,gait=moving&&!reduced?Math.sin(t*13)*4:0;
  if(!w.task&&!reduced&&!lift)g.translate(Math.sin(t*1.7),Math.cos(t*1.1));
  g.fillStyle='#25272222';g.beginPath();g.ellipse(5,13,24,29,0,0,Math.PI*2);g.fill();
  if(!lift){polygon(g,[[-15,8],[-3,8],[-4,25+gait],[-17,30+gait],[-19,25+gait]],palette.ink,null);polygon(g,[[3,8],[15,8],[19,25-gait],[16,30-gait],[4,25-gait]],palette.ink,null);line(g,-16,26+gait,-7,24+gait,palette.cream,1);line(g,7,24-gait,16,26-gait,palette.cream,1);}
  polygon(g,[[-13,-17],[-23,-12],[-29,5-gait*.3],[-24,12-gait*.3],[-17,9],[-12,-2],[12,-2],[17,9],[24,12+gait*.3],[29,5+gait*.3],[23,-12],[13,-17]],palette.ink,null);
  polygon(g,[[-15,-17],[15,-17],[19,-7],[14,16],[-14,16],[-19,-7]],palette.rust);
  line(g,-10,-13,-10,11,palette.paper,2.5);line(g,10,-13,10,11,palette.paper,2.5);line(g,-13,7,13,7,palette.paper,1.8);
  g.fillStyle=palette.cream;g.beginPath();g.ellipse(0,-12,11,12,0,0,Math.PI*2);g.fill();g.strokeStyle=palette.ink;g.lineWidth=1;g.stroke();g.fillStyle=palette.paper;g.beginPath();g.ellipse(0,-16,12,9,0,0,Math.PI*2);g.fill();line(g,-13,-11,13,-11,palette.ink,1.2);line(g,-1,-23,-1,-14,palette.rustDark,.7);
  if(lift){g.strokeStyle=palette.paper;g.lineWidth=2.5;g.beginPath();g.arc(0,-29,8,0,Math.PI*2);g.stroke();}
  else if(w.task&&['load','unload','putaway','pick'].includes(w.task.kind)){g.strokeStyle=palette.ink;g.lineWidth=4;g.beginPath();g.moveTo(-10,-20);g.lineTo(-10,-56);g.lineTo(10,-56);g.lineTo(10,-20);g.stroke();line(g,-7,-57,-7,-80,palette.rust,5);line(g,7,-57,7,-80,palette.rust,5);}
  if(w.task?.kind==='service'&&w.task.phase==='dest'&&!moving){const f=reduced?.5:(Math.sin(t*6)+1)/2;g.fillStyle=palette.cream;g.fillRect(-27,-25-f*6,12,7);g.fillRect(15,-25+f*6,12,7);carton(g,-12,-43,24,16,'stove',0,2);}
  g.restore();
 }
 function materialCart(g,w,job,s){
  const sources=job.sources.filter(q=>q.collected),count=sources.reduce((n,q)=>n+q.collected,0);if(!count)return;const x=w.x+.9,y=w.y+.2;g.save();g.translate(x,y);g.scale(.01,.01);g.fillStyle=palette.ink;g.fillRect(-5,8,75,65);g.fillStyle=palette.rust;g.fillRect(0,0,65,65);g.fillStyle=palette.wood;g.fillRect(4,4,57,50);for(let i=0;i<Math.min(6,count);i++)carton(g,8+i%3*17,8+Math.floor(i/3)*22,14,18,s.pallets.find(p=>p.id===sources[i%sources.length].id)?.item||'stove',i,2);g.fillStyle=palette.paper;g.fillRect(28,47,27,15);g.fillStyle=palette.ink;g.font='12px "Commit Mono"';g.textAlign='center';g.fillText(String(count),41.5,59);g.restore();
 }
 function truck(length,direction,opened){
  const key='print-truck/'+length+'/'+direction+'/'+!!opened;if(caches.has(key))return caches.get(key);
  const scale=128,c=canvas(288,length*scale),g=c.getContext('2d'),h=length*scale,body=h-142,x=16,w=256;
  polygon(g,[[x+4,3],[x+w-4,3],[x+w,7],[x+w,body],[x,body],[x,7]],palette.ink,null);
  g.fillStyle=palette.cream;g.fillRect(x+5,8,w-10,body-13);
  if(opened&&direction==='in'){
   g.fillStyle=palette.wood;g.fillRect(x+12,9,w-24,body-16);
   for(let bx=x+13;bx<x+w-12;bx+=17){line(g,bx,10,bx,body-9,palette.rustDark,1);for(let by=25;by<body-10;by+=61){line(g,bx+4,by,bx+6,by+28,'#743f2c65',.7);g.fillStyle=palette.ink;g.fillRect(bx+1.5,by,1.4,1.4);}}
   g.fillStyle=palette.ink;g.fillRect(x+3,8,8,body-14);g.fillRect(x+w-11,8,8,body-14);
   for(let by=17;by<body-10;by+=25){g.fillStyle=palette.cream;g.fillRect(x+5,by,3,7);g.fillRect(x+w-8,by,3,7);}
  }else{
   for(let by=27;by<body-12;by+=29){line(g,x+7,by,x+w-7,by,palette.rule,1.3);line(g,x+7,by+2,x+w-7,by+2,palette.paper,.8);}
   g.fillStyle=palette.rust;g.fillRect(x+5,body-28,w-10,12);
  }
  grain(g,x+12,10,w-24,body-20,length*93,.005,palette.rustDark,.22);
  g.fillStyle=palette.ink;g.fillRect(x+42,body-3,w-84,26);g.fillRect(x-6,h-106,15,48);g.fillRect(x+w-9,h-106,15,48);g.fillRect(x-6,body-80,15,48);g.fillRect(x+w-9,body-80,15,48);
  polygon(g,[[x+8,body+14],[x+w-8,body+14],[x+w-5,h-20],[x+w-22,h-3],[x+22,h-3],[x+5,h-20]],palette.rust);
  polygon(g,[[x+25,body+24],[x+w-25,body+24],[x+w-22,body+65],[x+22,body+65]],palette.ink);
  line(g,x+32,body+31,x+w-32,body+31,palette.cream,2);
  line(g,x+w*.5,body+27,x+w*.5,body+62,palette.rust,2);
  g.fillStyle=palette.rustLight;g.fillRect(x+20,body+72,w-40,h-body-94);
  grain(g,x+20,body+72,w-40,h-body-94,length*7,.018,palette.paper,.35);
  for(const bx of [x+18,x+w-38]){g.fillStyle=palette.paper;g.fillRect(bx,h-20,20,7);}
  g.fillStyle=palette.ink;g.fillRect(x+55,h-13,w-110,4);line(g,x+30,body+79,x+w-30,body+79,palette.paper,1);
  caches.set(key,c);return c;
 }
 O.sprites={palette,pallet,station,forklift,worker,materialCart,truck,canvas,grain,paper,polygon,line,random,hash,boxColor,setPaperTexture,cache:caches,get artRevision(){return artRevision;}};
 setPaperTexture('assets/one-shift/warehouse-paper.webp?v=1');
})(window);
