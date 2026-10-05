(function(root){'use strict';const O=root.OneShift;let layer=null,lastKey='',lastMap=null;
 O.lighting={draw(g,s,camera,w,h){const bucket=Math.floor(s.minute/15),key=[s.map.revision,bucket,w,h,camera.x.toFixed(1),camera.y.toFixed(1),camera.zoom.toFixed(2)].join('/');if(s.map!==lastMap||key!==lastKey){lastMap=s.map;lastKey=key;layer=O.sprites.canvas(w,h);const c=layer.getContext('2d'),b=s.map.building,late=Math.max(0,(s.minute-750)/240),morning=Math.max(0,(600-s.minute)/180);c.fillStyle=late?'#a9743116':'#7697960a';c.fillRect(0,0,w,h);
  const to=(x,y)=>({x:(x-camera.x)*camera.zoom+w/2,y:(y-camera.y)*camera.zoom+h/2});
  for(let y=b.y+3;y<b.y+b.h-3;y+=7)for(let x=b.x+3;x<b.x+b.w-1;x+=7){const p=to(x+2+(s.minute-415)/575,y+2),r=camera.zoom*5.5,gr=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r);gr.addColorStop(0,late?'#f4d19231':morning?'#eef1d731':'#faf0d337');gr.addColorStop(1,'#faf0d300');c.fillStyle=gr;c.fillRect(p.x-r,p.y-r,r*2,r*2);}
  if(s.minute>1050){c.fillStyle='#26393770';c.fillRect(0,0,w,h);} }
  g.save();g.globalCompositeOperation='source-over';g.drawImage(layer,0,0);g.restore();}
 };
})(window);
