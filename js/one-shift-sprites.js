(function(root){
 'use strict';const O=root.OneShift;
 const palette={concrete:'#bab6a6',yard:'#555f52',asphalt:'#454d45',box:'#bc9367',wood:'#ad8556',steel:'#607e86',beam:'#be8660',paint:'#ded1a5'};
 const caches=new Map();
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function pallet(p){const key=[p.item,p.cases,p.ti,p.hold,p.confirmed,p.wrapped,p.condition].join('/');if(caches.has(key))return caches.get(key);const c=canvas(96,96),g=c.getContext('2d');
  g.shadowColor='#25342e50';g.shadowBlur=8;g.shadowOffsetX=5;g.shadowOffsetY=6;g.fillStyle=palette.wood;g.fillRect(9,11,77,75);g.shadowColor='transparent';
  for(let i=0;i<5;i++){g.fillStyle=i%2?'#c8a574':'#b89361';g.fillRect(11,12+i*15,74,10);g.fillStyle='#725a4030';g.fillRect(14,15+i*15,50,1);}
  const d=O.items[p.item],cols=p.ti===6?3:p.ti===10?5:4,rows=Math.ceil(p.ti/cols),visible=p.cases===0?0:p.cases%p.ti||p.ti;
  for(let i=0;i<visible;i++){const x=12+i%cols*(70/cols),y=14+Math.floor(i/cols)*(64/rows),w=70/cols-2,h=64/rows-2;
   g.fillStyle=d.color;g.fillRect(x,y,w,h);g.fillStyle='#f3dfbc35';g.fillRect(x+1,y+1,w-2,2);g.fillStyle='#6c594136';g.fillRect(x+w-3,y+2,2,h-3);g.fillStyle='#e8d4a977';g.fillRect(x+w*.44,y,3,h);g.fillStyle='#6d654755';g.fillRect(x+3,y+h-5,w*.25,2);
  }
  if(p.condition==='damage'){g.fillStyle='#71554a';g.beginPath();g.moveTo(80,14);g.lineTo(60,16);g.lineTo(78,34);g.fill();}
  if(p.wrapped&&p.cases){g.strokeStyle='#f5eed846';g.lineWidth=1;for(let i=0;i<5;i++){g.beginPath();g.moveTo(13,22+i*11);g.lineTo(81,17+i*11);g.stroke();}g.fillStyle='#f5eed815';g.fillRect(12,14,68,64);}
  if(p.cases){g.fillStyle='#f1ecdb';g.fillRect(51,61,23,14);g.fillStyle='#3e4940';for(let i=0;i<9;i++)g.fillRect(53+i*2,65,1,7);}
  if(p.confirmed){g.fillStyle=p.hold?'#b8796d':'#698365';g.fillRect(12,66,18,14);g.fillStyle='#f5f1ea';g.font='bold 11px "Segoe UI"';g.fillText(p.hold?'H':'Y',16,77);}
  if(caches.size>256)caches.delete(caches.keys().next().value);caches.set(key,c);return c;
 }
 function worker(g,w,t,scale,reduced){g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);const moving=!!w.task?.path?.length,gait=moving&&!reduced?Math.sin(t*13)*.04:0;
  g.shadowColor='#26332f60';g.shadowBlur=.15*scale;g.shadowOffsetY=.08*scale;g.fillStyle='#384b47';g.beginPath();g.ellipse(0,.09,.18,.25,0,0,Math.PI*2);g.fill();g.shadowColor='transparent';
  g.fillStyle='#354a49';g.fillRect(-.16,.1+gait,.12,.2);g.fillRect(.04,.1-gait,.12,.2);g.fillStyle=w.role==='robot'?'#a2b2ad':w.color||'#d7c077';g.beginPath();g.ellipse(0,0,.23,.17,0,0,Math.PI*2);g.fill();g.fillStyle='#e9dfb8';g.fillRect(-.13,-.11,.04,.21);g.fillRect(.09,-.11,.04,.21);
  g.fillStyle='#c89e7c';g.beginPath();g.arc(0,-.05,.115,0,Math.PI*2);g.fill();g.fillStyle='#685a44';g.beginPath();g.arc(0,-.075,.10,Math.PI,Math.PI*2);g.fill();
  if(w.task&&['load','unload','putaway'].includes(w.task.kind)){g.strokeStyle='#c9b768';g.lineWidth=.05;g.beginPath();g.moveTo(-.1,-.2);g.lineTo(-.1,-.65);g.moveTo(.1,-.2);g.lineTo(.1,-.65);g.stroke();}
  g.restore();
 }
 O.sprites={palette,pallet,worker,canvas,cache:caches};
})(window);
