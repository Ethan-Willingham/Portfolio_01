(function(root){
 'use strict';const O=root.OneShift;
 const palette={concrete:'#bab6a6',yard:'#555f52',asphalt:'#454d45',box:'#bc9367',wood:'#ad8556',steel:'#607e86',beam:'#be8660',paint:'#ded1a5'};
 const caches=new Map();
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function pallet(p){const key=[p.item,p.cases,p.ti,p.hold,p.confirmed,p.wrapped,p.condition].join('/');if(caches.has(key))return caches.get(key);const c=canvas(192,192),g=c.getContext('2d');g.scale(2,2);
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
 function station(id){const key='station/'+id;if(caches.has(key))return caches.get(key);const c=canvas(192,96),g=c.getContext('2d');g.scale(2,2);g.shadowColor='#25342e50';g.shadowBlur=5;g.shadowOffsetX=3;g.shadowOffsetY=4;g.fillStyle='#53695d';g.fillRect(4,4,88,39);g.shadowColor='transparent';g.fillStyle='#d1bea0';g.fillRect(7,6,82,33);g.fillStyle='#ad8556';g.fillRect(7,6,82,2);g.fillStyle='#607e86';g.fillRect(7,36,82,3);
  if(id==='wrapper'){g.fillStyle='#607e86';g.fillRect(9,8,10,26);g.fillStyle='#384b47';g.beginPath();g.ellipse(56,23,23,14,0,0,Math.PI*2);g.fill();g.strokeStyle='#9ab4ac';g.lineWidth=2;g.beginPath();g.ellipse(56,23,20,11,0,0,Math.PI*2);g.stroke();g.fillStyle='#f1ecdb';g.fillRect(12,13,4,17);}
  else if(id==='pack'){g.fillStyle='#607e86';g.fillRect(11,9,18,11);g.fillStyle='#c6d2ba';g.fillRect(14,11,12,5);g.fillStyle='#f1ecdb';g.fillRect(17,20,12,7);g.fillStyle='#bc9367';g.fillRect(39,14,22,17);g.fillStyle='#725a40';g.fillRect(42,17,16,11);g.fillStyle='#d3b58b';g.fillRect(33,14,7,17);g.fillRect(61,14,7,17);g.fillStyle='#e4dbbf';g.beginPath();g.arc(79,25,4,0,Math.PI*2);g.fill();}
  else if(id==='baler'||id==='repair'){g.fillStyle='#607e86';g.fillRect(11,10,34,23);g.fillStyle='#384b47';g.fillRect(14,12,28,19);g.fillStyle='#bc9367';for(let i=0;i<5;i++)g.fillRect(17,14+i*3,22,2);g.fillStyle='#384b47';g.fillRect(48,9,3,25);g.fillStyle='#c6ae8b';g.fillRect(57,15,24,16);g.strokeStyle='#607e86';g.lineWidth=1;for(let x=62;x<80;x+=10){g.beginPath();g.moveTo(x,15);g.lineTo(x,31);g.stroke();}}
  else{g.fillStyle='#607e86';g.fillRect(10,10,76,7);g.fillStyle='#384b47';for(let i=0;i<9;i++)g.fillRect(14+i*8,12,2,2);g.fillStyle='#bc9367';g.fillRect(12,23,16,11);g.fillStyle='#9ca4b0';g.fillRect(34,23,13,10);g.fillStyle='#c6ae8b';g.fillRect(60,21,20,13);g.fillStyle='#f1ecdb';g.fillRect(62,23,8,5);g.fillStyle='#607e86';g.fillRect(49,22,3,12);}
  caches.set(key,c);return c;
 }
 function forklift(g,w){g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);g.shadowColor='#26332f60';g.shadowBlur=4;g.fillStyle='#384b47';g.fillRect(-.46,-.54,.92,1.15);g.shadowColor='transparent';g.fillStyle='#b8985d';g.fillRect(-.4,-.49,.8,1.02);g.fillStyle='#d7c077';g.fillRect(-.35,.3,.7,.23);g.fillStyle='#53695d';g.fillRect(-.25,-.2,.5,.47);g.fillStyle='#354239';for(const x of [-.5,.36]){g.fillRect(x,-.4,.14,.26);g.fillRect(x,.32,.14,.26);}g.fillStyle='#607e86';g.fillRect(-.38,-.6,.76,.12);g.fillRect(-.24,-1,.08,.45);g.fillRect(.16,-1,.08,.45);g.fillStyle='#e4dbbf';g.fillRect(-.31,.38,.1,.06);g.fillRect(.21,.38,.1,.06);g.restore();}
 function worker(g,w,t,scale,reduced,lift=false){g.save();g.translate(w.x+.5,w.y+.5);g.rotate((w.angle||0)+Math.PI/2);if(w.role==='robot'){g.fillStyle='#314843';g.fillRect(-.28,-.3,.56,.6);g.fillStyle='#829b9a';g.fillRect(-.24,-.26,.48,.48);g.fillStyle='#dfc687';g.fillRect(-.16,-.22,.32,.06);g.fillStyle='#c6d2ba';g.fillRect(-.1,-.12,.2,.12);g.restore();return;}const moving=!!w.task?.path?.length,gait=moving&&!reduced?Math.sin(t*13)*.04:0;
  g.shadowColor='#26332f60';g.shadowBlur=.15*scale;g.shadowOffsetY=.08*scale;g.fillStyle='#384b47';g.beginPath();g.ellipse(0,.09,.18,.25,0,0,Math.PI*2);g.fill();g.shadowColor='transparent';
  if(!lift){g.fillStyle='#354a49';g.fillRect(-.16,.1+gait,.12,.2);g.fillRect(.04,.1-gait,.12,.2);}g.fillStyle=w.color||'#d7c077';g.beginPath();g.ellipse(0,0,.23,.17,0,0,Math.PI*2);g.fill();g.fillStyle='#e9dfb8';g.fillRect(-.13,-.11,.04,.21);g.fillRect(.09,-.11,.04,.21);
  g.fillStyle='#c89e7c';g.beginPath();g.arc(0,-.05,.115,0,Math.PI*2);g.fill();g.fillStyle='#685a44';g.beginPath();g.arc(0,-.075,.10,Math.PI,Math.PI*2);g.fill();
  if(lift){g.strokeStyle='#384b47';g.lineWidth=.035;g.beginPath();g.arc(0,-.24,.09,0,Math.PI*2);g.stroke();}else if(w.task&&['load','unload','putaway','pick'].includes(w.task.kind)){g.strokeStyle='#c9b768';g.lineWidth=.05;g.beginPath();g.moveTo(-.1,-.2);g.lineTo(-.1,-.65);g.moveTo(.1,-.2);g.lineTo(.1,-.65);g.stroke();}
  g.restore();
 }
 O.sprites={palette,pallet,station,forklift,worker,canvas,cache:caches};
})(window);
