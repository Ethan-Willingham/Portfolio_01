(function(root){
 'use strict';
 const O=root.OneShift;let layer=null,lastKey='',lastMap=null;
 O.lighting={draw(g,s,camera,w,h){
  const bucket=Math.floor(s.minute/15),open=s.map.doors.filter(d=>s.trucks.some(t=>t.door===d.id&&t.status==='docked'&&(t.opened||t.direction==='out'))),night=s.minute>1050,power=s.powerUntil>s.minute,key=[s.map.revision,bucket,open.map(d=>d.id).join(','),night,power,w,h,camera.x.toFixed(1),camera.y.toFixed(1),camera.zoom.toFixed(2)].join('/');
  if(s.map!==lastMap||key!==lastKey){
   lastMap=s.map;lastKey=key;layer=O.sprites.canvas(w,h);const c=layer.getContext('2d'),b=s.map.building,z=camera.zoom,P=O.sprites.palette;
   const to=(x,y)=>({x:(x-camera.x)*z+w/2,y:(y-camera.y)*z+h/2});
   const corner=to(b.x,b.y);c.save();c.beginPath();c.rect(corner.x,corner.y,b.w*z,b.h*z);c.clip();
   // Flat translucent ink shapes keep daylight in the same print language.
   if(s.minute>810){c.fillStyle='#ad573708';c.fillRect(0,0,w,h);}
   if(night||power){c.fillStyle=power?'#25272254':'#25272238';c.fillRect(0,0,w,h);}
   for(const d of open){
    const east=O.docks.side(s)==='east',p=to(d.x,d.y),depth=3.7*z,width=2*z;c.fillStyle=night?'#f1e3c60d':'#f1e3c61d';c.beginPath();c.moveTo(p.x,p.y);
    if(east){c.lineTo(p.x,p.y+width);c.lineTo(p.x-depth,p.y+width+.7*z);c.lineTo(p.x-depth,p.y-.4*z);}else{c.lineTo(p.x+width,p.y);c.lineTo(p.x+width+.7*z,p.y-depth);c.lineTo(p.x-.4*z,p.y-depth);}
    c.closePath();c.fill();
   }
   if(night&&!power){c.strokeStyle='#f1e3c612';c.lineWidth=1;for(let y=b.y+3;y<b.y+b.h-2;y+=7)for(let x=b.x+3;x<b.x+b.w-2;x+=7){const p=to(x,y),r=z*2.3;for(let d=-r;d<=r;d+=5){const span=Math.sqrt(Math.max(0,r*r-d*d));c.beginPath();c.moveTo(p.x-span,p.y+d);c.lineTo(p.x+span,p.y+d);c.stroke();}}}
   c.restore();
  }
  g.save();g.drawImage(layer,0,0);g.restore();
  if(night&&!power&&O.has(s,'forklift'))for(const worker of s.workers){
   if(worker.task?.kind==='service'||!(worker.id===1||['driver','robot'].includes(worker.role)))continue;
   const x=(worker.x+.5-camera.x)*camera.zoom+w/2,y=(worker.y+.5-camera.y)*camera.zoom+h/2,z=camera.zoom;if(x+z*4<0||y+z*4<0||x-z*4>w||y-z*4>h)continue;
   g.save();g.translate(x,y);g.rotate(worker.angle||0);g.fillStyle='#f1e3c61b';g.beginPath();g.moveTo(z*.3,-z*.18);g.lineTo(z*3,-z*.85);g.lineTo(z*3,z*.85);g.lineTo(z*.3,z*.18);g.closePath();g.fill();g.restore();
  }
 }};
})(window);
