/* Small, deliberately chunky canvases. Art direction can evolve without touching the simulation. */
(function(root){
  'use strict';
  const D=root.WidewakeData,W=root.WidewakeWorld,C=root.WidewakeCore;
  const P={ink:'#101b32',sea:'#195577',deep:'#173f60',water:'#267c96',foam:'#a0e1df',land:'#60996c',sand:'#e1ba80',pine:'#326453',cream:'#f1e8cd',gold:'#ffbc66',coral:'#ff7b70',blue:'#6fd5e8',wood:'#a47255',dark:'#18374c'};
  const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  function packLabels(items,obstacles,bounds,limit=8){
    const placed=[],blocks=obstacles.slice();
    for(const item of items.slice().sort((a,b)=>b.priority-a.priority||a.uid-b.uid)){
      if(placed.length>=limit)break;
      const r=item.radius||8,w=item.width,h=11,positions=[[0,-r-15],[w/2+r+7,-2],[-w/2-r-7,-2],[0,r+17],[0,-r-30],[w/2+r+7,-20],[-w/2-r-7,-20],[0,r+32]];
      const order=[...new Set([item.previous,...positions.map((_,i)=>i)].filter(i=>Number.isInteger(i)&&i>=0&&i<positions.length))];
      for(const index of order){const [ox,oy]=positions[index],x=Math.round(item.x+ox),top=Math.round(item.y+oy-7),box={left:x-w/2,top,right:x+w/2,bottom:top+h};
        if(box.left<bounds.left||box.right>bounds.right||box.top<bounds.top||box.bottom>bounds.bottom||blocks.some(b=>intersects(box,b)))continue;
        placed.push({...item,...box,labelX:x,labelY:top+7,index});blocks.push({left:box.left-3,right:box.right+3,top:box.top-3,bottom:box.bottom+3});break;
      }
    }
    return placed;
  }
  function edgeAnchor(x,y,w,h,blocks){
    const a=Math.atan2(y-h/2,x-w/2),ux=Math.cos(a),uy=Math.sin(a),r=Math.min((w/2-12)/Math.max(.001,Math.abs(ux)),(h/2-12)/Math.max(.001,Math.abs(uy)));
    for(let inward=0;inward<r;inward+=12)for(const side of [0,-12,12,-24,24]){
      const px=Math.max(10,Math.min(w-10,w/2+ux*(r-inward)-uy*side)),py=Math.max(10,Math.min(h-10,h/2+uy*(r-inward)+ux*side)),box={left:px-7,right:px+7,top:py-7,bottom:py+7};
      if(!blocks.some(b=>intersects(box,b)))return{x:px,y:py,angle:a};
    }
    // Short touch layouts can cover the entire radial line. Find the closest
    // remaining sea space; the arrow still points toward the actual vessel.
    let best=null,cost=Infinity;const ex=w/2+ux*r,ey=h/2+uy*r;
    for(let py=12;py<h-10;py+=12)for(let px=12;px<w-10;px+=12){const d=(px-ex)**2+(py-ey)**2;if(d>=cost)continue;const box={left:px-7,right:px+7,top:py-7,bottom:py+7};if(!blocks.some(b=>intersects(box,b))){cost=d;best={x:px,y:py,angle:a};}}
    return best;
  }
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function poly(c,points,color){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill();}
  const sprites=new Map();
  function shipSprite(type,enemy=false){const key=type+enemy;if(sprites.has(key))return sprites.get(key);const cv=canvas(48,48),c=cv.getContext('2d');
    const large=['frigate','leviathan','boss','destroyer','armored'].includes(type),wide=['oilrig','freighter','boss','leviathan'].includes(type),s=large?1.15:1;
    c.translate(24,24);c.scale(s,s);const body=enemy?'#cb595b':'#58a3bd',hull=enemy?'#602f45':'#1b3d60',deck=enemy?'#f0b680':'#edd0a0';
    poly(c,[[-16,-7],[-10,-10],[8,-10],[17,-5],[20,0],[17,5],[8,10],[-10,10],[-16,7]],P.ink);
    poly(c,[[-15,-6],[-9,-8],[8,-8],[16,-4],[18,0],[16,4],[8,8],[-9,8],[-15,6]],hull);
    c.fillStyle=body;c.fillRect(-13,-7,21,14);poly(c,[[8,-7],[16,-3],[18,0],[16,3],[8,7]],body);
    c.fillStyle=deck;c.fillRect(-10,-5,19,10);poly(c,[[9,-5],[14,-2],[16,0],[14,2],[9,5]],deck);
    c.fillStyle='#b18e70';c.fillRect(-8,0,14,1);c.fillRect(-8,-3,14,1);c.fillRect(-8,3,14,1);
    if(type==='freighter'){for(let x=-8;x<8;x+=6){c.fillStyle=x===-2?'#a96d53':'#648fae';c.fillRect(x,-4,5,8);c.fillStyle=P.ink;c.fillRect(x+2,-4,1,8);}}
    else if(type==='oilrig'){c.fillStyle='#5b839f';c.fillRect(-11,-5,12,10);c.fillStyle=P.ink;c.fillRect(-8,-7,2,14);c.fillRect(-11,-2,12,2);c.fillStyle=P.gold;c.fillRect(-5,-2,2,3);}
    else if(type==='trawler'){c.strokeStyle='#72bbce';c.lineWidth=1;for(let x=-12;x<0;x+=3){c.beginPath();c.moveTo(x,-9);c.lineTo(x+6,9);c.stroke();}c.fillStyle=P.wood;c.fillRect(-12,-7,3,14);}
    else if(type==='repair'){c.fillStyle=P.cream;c.fillRect(-8,-5,13,10);c.fillStyle='#e46569';c.fillRect(-3,-3,2,6);c.fillRect(-5,-1,6,2);}
    else {c.fillStyle=P.cream;c.fillRect(-5,-5,10,10);c.fillStyle='#b3b5c2';c.fillRect(-5,2,10,3);c.fillStyle=P.dark;c.fillRect(3,-3,2,6);
      c.fillStyle=enemy?P.coral:P.gold;c.fillRect(-3,-1,2,2);
      if(['cutter','brig'].includes(type)){c.fillStyle=P.wood;c.fillRect(-1,-12,1,24);poly(c,[[0,-11],[0,10],[8,7],[8,-8]],P.cream);c.fillStyle='#b7ad8c';c.fillRect(7,-8,2,15);}
    }
    c.fillStyle=P.ink;c.fillRect(7,-2,9,4);c.fillStyle='#7d9eb9';c.fillRect(8,-1,7,2);
    if(large){c.fillStyle=P.ink;c.fillRect(-9,-12,4,7);c.fillRect(-9,5,4,7);c.fillStyle='#8caac3';c.fillRect(-8,-12,2,5);c.fillRect(-8,7,2,5);}
    c.fillStyle=enemy?P.coral:P.cream;c.fillRect(-15,-1,3,2);
    sprites.set(key,cv);return cv;
  }
  function flashSprite(type,enemy){const key='flash:'+type+enemy;if(sprites.has(key))return sprites.get(key);const cv=canvas(48,48),c=cv.getContext('2d');c.drawImage(shipSprite(type,enemy),0,0);c.globalCompositeOperation='source-in';c.fillStyle=P.cream;c.fillRect(0,0,48,48);sprites.set(key,cv);return cv;}
  function icon(id,size=24){const cv=canvas(size,size),c=cv.getContext('2d');c.scale(size/24,size/24);const g=D.cargoGoods.find(x=>x.id===id),f=D.fish.find(x=>x.id===id);const color=g?.color||f?.color||P.gold;const kind=g?.icon|| (f?'fish':id);
    c.fillStyle=P.ink;c.fillRect(4,18,16,3);
    if(kind==='fish'){poly(c,[[3,12],[6,8],[14,6],[18,9],[22,7],[21,12],[23,17],[17,15],[13,18],[6,16]],color);c.fillStyle=P.ink;c.fillRect(6,10,2,2);c.fillStyle=P.cream;c.fillRect(8,8,6,1);}
    else if(kind==='sack'){poly(c,[[7,4],[16,4],[14,8],[18,12],[19,18],[16,20],[6,20],[4,17],[6,11],[9,8]],color);c.fillStyle=P.wood;c.fillRect(8,7,7,2);c.fillStyle=P.ink;c.fillRect(8,13,6,4);}
    else if(kind==='crate'){c.fillStyle=color;c.fillRect(4,5,16,15);c.fillStyle=P.wood;c.fillRect(5,6,14,2);c.fillRect(5,16,14,2);c.fillRect(5,7,2,11);c.fillRect(17,7,2,11);}
    else if(kind==='barrel'){c.fillStyle=color;c.fillRect(6,4,12,17);c.fillRect(4,7,16,11);c.fillStyle=P.ink;c.fillRect(4,8,16,2);c.fillRect(4,16,16,2);c.fillStyle=P.cream;c.fillRect(9,4,5,1);}
    else if(kind==='roll'){c.fillStyle=color;c.fillRect(5,5,14,15);c.fillStyle=P.cream;c.fillRect(7,6,10,2);c.fillStyle=P.ink;c.fillRect(8,9,8,1);c.fillRect(8,15,8,1);}
    else if(kind==='wood'){for(let y=7;y<19;y+=5){c.fillStyle=color;c.fillRect(4,y,16,4);c.fillStyle=P.wood;c.fillRect(4,y,4,4);c.fillStyle=P.ink;c.fillRect(5,y+1,2,2);}}
    else if(kind==='ingot'){poly(c,[[7,7],[18,7],[21,15],[17,20],[3,20],[4,12]],color);poly(c,[[7,7],[18,7],[17,14],[4,14]],P.cream);}
    else if(kind==='pearl'){c.fillStyle=color;c.fillRect(6,8,12,9);c.fillRect(8,6,8,13);c.fillStyle=P.cream;c.fillRect(8,7,4,3);c.fillStyle='#a4a293';c.fillRect(12,16,4,2);}
    else{c.fillStyle=P.wood;c.fillRect(5,6,14,14);c.fillStyle=color;c.fillRect(7,4,10,14);c.fillStyle=P.ink;c.fillRect(10,8,4,6);}
    return cv;
  }
  // Each harbor gets its own composition, weather and silhouette. These are interim
  // code-native scenes while the owner's hand-drawn art prompts are developed.
  const harborStyles={
    havana:{sky:'#86c8dc',water:'#278aa3',wall:'#efd093',roof:'#c86358',kind:'tropical',sun:true,bank:0},
    nassau:{sky:'#b3e0e5',water:'#39b1bb',wall:'#edac91',roof:'#ca8a75',kind:'island',bank:1},
    'new-york':{sky:'#778aa7',water:'#354e72',wall:'#a15f5b',roof:'#39405a',kind:'industrial',bank:0},
    reykjavik:{sky:'#b4c6df',water:'#537eab',wall:'#d2deea',roof:'#ba596c',kind:'snow',bank:1},
    bergen:{sky:'#6d88a7',water:'#2f647f',wall:'#c66b60',roof:'#414c6b',kind:'fjord',bank:0,rain:true},
    london:{sky:'#a69aa9',water:'#4e667b',wall:'#997b7a',roof:'#4c435e',kind:'industrial',bank:1,rain:true},
    lisbon:{sky:'#e6c8a0',water:'#4196b7',wall:'#efcf8a',roof:'#cd6e50',kind:'hill',bank:0,sun:true},
    marseille:{sky:'#a2d2e7',water:'#3f8fbb',wall:'#eed0a5',roof:'#c88068',kind:'stone',bank:1},
    alexandria:{sky:'#e3b98e',water:'#438e9c',wall:'#e3c18b',roof:'#ae815f',kind:'desert',bank:0,sun:true},
    dakar:{sky:'#df9f86',water:'#427d9b',wall:'#c77857',roof:'#714968',kind:'beach',bank:1,sun:true},
    'cape-town':{sky:'#a0bbdc',water:'#366f9f',wall:'#e5d4bc',roof:'#997b78',kind:'table',bank:0},
    rio:{sky:'#89c8c9',water:'#25918d',wall:'#e6bb78',roof:'#b75d67',kind:'jungle',bank:1},
    'buenos-aires':{sky:'#d6adbc',water:'#657b9a',wall:'#d8a594',roof:'#815d76',kind:'flat',bank:0},
    valparaiso:{sky:'#b1c8e2',water:'#4179ae',wall:'#d98981',roof:'#6a739c',kind:'hill',bank:1},
    'san-francisco':{sky:'#bbbfce',water:'#5f789f',wall:'#d49f7e',roof:'#76758b',kind:'fog',bank:0},
    honolulu:{sky:'#e1abb1',water:'#4677ac',wall:'#dec08b',roof:'#967e65',kind:'volcano',bank:1,sun:true},
    yokohama:{sky:'#b0bbdc',water:'#4969a3',wall:'#d3c3c8',roof:'#4f537f',kind:'east',bank:0},
    shanghai:{sky:'#bdb0bc',water:'#566c8a',wall:'#c9a185',roof:'#664964',kind:'industrial',bank:1},
    singapore:{sky:'#7997ab',water:'#337f91',wall:'#daa99a',roof:'#a45169',kind:'east',bank:1,rain:true},
    mumbai:{sky:'#b5a6c0',water:'#566f9e',wall:'#d0ae93',roof:'#806989',kind:'stone',bank:0,rain:true},
    muscat:{sky:'#e1c5c0',water:'#398baf',wall:'#f0d4b3',roof:'#c48f8c',kind:'desert',bank:1},
    mombasa:{sky:'#d5c1a5',water:'#298f99',wall:'#e4ba85',roof:'#ab7062',kind:'fort',bank:0},
    sydney:{sky:'#9ed0ec',water:'#267eae',wall:'#dec7a4',roof:'#a97881',kind:'stone',bank:1,sun:true},
    auckland:{sky:'#a0c6d6',water:'#438a9f',wall:'#dfd6b9',roof:'#627885',kind:'island',bank:0}
  };
  const harborCache=new Map();
  function harborBase(port){if(harborCache.has(port.id))return harborCache.get(port.id);const cv=canvas(384,216),c=cv.getContext('2d'),s=harborStyles[port.id],r=C.rng(C.hash(port.id)),ground=107+Math.floor(r()*25);
    c.fillStyle=s.sky;c.fillRect(0,0,384,216);
    if(s.sun){c.fillStyle='#ffe4a3';c.fillRect(290,24,18,18);c.fillRect(286,28,26,10);}
    c.fillStyle='#e1e4db';for(let i=0;i<5;i++){const x=r()*380,y=15+r()*45,w=20+r()*50;c.fillRect(x|0,y|0,w|0,5);c.fillRect((x+10)|0,(y-4)|0,(w*.5)|0,6);}
    const hills=['fjord','snow','hill','table','jungle','volcano','island','desert','fort','fog'].includes(s.kind);
    if(hills){const color=s.kind==='desert'?'#9b8d68':s.kind==='snow'?'#718c83':'#637e63';let pts=[[0,ground],[0,75]];
      for(let x=0;x<=400;x+=12)pts.push([x,Math.floor(ground-28-Math.sin(x*.019+r()*1.4)*22-r()*12)]);pts.push([384,ground]);poly(c,pts,color);
      if(s.kind==='table')poly(c,[[155,102],[198,46],[284,46],[331,104]],'#6b816a');
      if(s.kind==='snow')poly(c,[[160,83],[223,28],[287,86],[252,68],[235,49],[225,61],[215,52],[194,72]],'#d0d0b9');
      if(s.kind==='volcano')poly(c,[[100,104],[208,32],[286,105]],'#6d8268');
    }
    c.fillStyle=s.water;c.fillRect(0,ground,384,216);
    if(s.kind==='industrial'){c.fillStyle='#778a78';for(let x=0;x<384;x+=14){const h=8+r()*37;c.fillRect(x,ground-h,10+r()*9,h);}}
    const townStart=s.bank?175:-10,townWidth=s.kind==='beach'?130:215;
    c.fillStyle='#7d8568';c.fillRect(townStart,ground-5,townWidth,14);
    const n=s.kind==='island'?3:s.kind==='industrial'?7:5;let bx=townStart+4;
    for(let i=0;i<n;i++){
      const bw=20+Math.floor(r()*23),bh=18+Math.floor(r()*38),by=ground-bh;
      c.fillStyle=s.wall;c.fillRect(bx,by,bw,bh);c.fillStyle='#00000010';c.fillRect(bx+bw-4,by,4,bh);
      if(['desert','industrial','flat'].includes(s.kind)){c.fillStyle=s.roof;c.fillRect(bx-2,by-3,bw+4,4);}
      else poly(c,[[bx-3,by],[bx+(bw*.5|0),by-11],[bx+bw+3,by]],s.roof);
      c.fillStyle='#30344b';for(let y=by+7;y<ground-10;y+=13)for(let x=bx+5;x<bx+bw-4;x+=10)c.fillRect(x,y,4,6);
      c.fillRect(bx+6,ground-9,7,9);c.fillStyle='#d3c69f';c.fillRect(bx+5,by+6,5,1);
      if(s.kind==='east'){c.fillStyle=s.roof;c.fillRect(bx-5,by-1,bw+10,3);c.fillRect(bx-6,by-3,3,3);c.fillRect(bx+bw+3,by-3,3,3);}
      bx+=bw+3+Math.floor(r()*7);
    }
    if(['tropical','island','beach','jungle','fort'].includes(s.kind))for(let i=0;i<3;i++){
      const x=townStart+15+i*67,y=ground-5,h=43+r()*15;c.fillStyle='#817657';c.fillRect(x,y-h,3,h);
      for(const side of [-1,1]){c.fillStyle='#4c7255';for(let j=0;j<5;j++)c.fillRect(x+side*j*4,y-h-4+j*2,7,4);}
    }
    if(s.kind==='industrial'){c.fillStyle='#394d43';const x=s.bank?201:155;c.fillRect(x,ground-53,3,53);c.fillRect(x-10,ground-53,51,3);for(let i=0;i<9;i++)c.fillRect(x+i*4,ground-56+i*2,4,2);c.fillRect(x+35,ground-49,1,23);c.fillStyle='#b69567';c.fillRect(x+31,ground-26,10,9);}
    if(s.kind==='fort'){c.fillStyle='#b3a279';c.fillRect(townStart+145,ground-38,60,38);for(let x=townStart+145;x<townStart+205;x+=9)c.fillRect(x,ground-43,5,5);}
    // A crooked pier, with a repair patch and asymmetrically spaced pilings.
    const px=s.bank?151:31,py=ground+20,pw=s.kind==='beach'?85:165;
    c.fillStyle='#5d644c';for(let x=px+5;x<px+pw;x+=29)c.fillRect(x,py,4,22+(r()*7|0));c.fillStyle='#a28b61';c.fillRect(px,py,pw,7);c.fillStyle='#766d50';for(let x=px;x<px+pw;x+=9)c.fillRect(x,py,1,7);c.fillStyle='#e9bc7c';c.fillRect(px+34,py-1,18,8);
    for(let i=0;i<7;i++){const x=px+8+r()*(pw-18),y=py-7-r()*3;c.fillStyle=i%2?'#8b7350':'#aa8d5b';c.fillRect(x|0,y|0,7,7);c.fillStyle='#5d5a43';c.fillRect((x+2)|0,y|0,1,7);}
    // Few foreground shapes, rather than a noise texture over every surface.
    c.fillStyle='#5f6f54';c.fillRect(s.bank?310:0,193,85,23);c.fillStyle='#9a8c65';c.fillRect(s.bank?310:0,190,85,5);
    for(let i=0;i<85;i++){c.fillStyle=i%3===0?'#b2b79a28':'#1c403c20';c.fillRect(Math.floor(r()*384),ground+Math.floor(r()*(216-ground)),5+Math.floor(r()*13),1);}
    harborCache.set(port.id,cv);return cv;
  }
  function sideBoat(c,x,y,kind,color=P.cream){c.fillStyle=P.ink;c.fillRect(x-23,y+5,49,3);poly(c,[[x-24,y-1],[x+25,y-1],[x+17,y+9],[x-17,y+9]],'#235b7b');c.fillStyle='#9b8060';c.fillRect(x-21,y-1,40,2);c.fillStyle=color;c.fillRect(x-7,y-14,18,14);c.fillStyle=P.ink;c.fillRect(x-4,y-11,4,5);c.fillRect(x+3,y-11,4,5);c.fillRect(x+9,y-17,3,3);if(kind==='cutter'||kind==='brig'){c.fillStyle=P.wood;c.fillRect(x-12,y-41,2,40);poly(c,[[x-9,y-37],[x-9,y-5],[x+13,y-5]],P.cream);}if(kind==='trawler'){c.fillStyle=P.wood;c.fillRect(x-19,y-20,2,20);c.fillRect(x-25,y-20,20,2);}}
  function harbor(ctx,port,t,hull='cutter'){
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,384,216);ctx.drawImage(harborBase(port),0,0);const s=harborStyles[port.id],r=C.rng(C.hash(port.id));
    const x=s.bank?118:273,y=159+Math.round(Math.sin(t*.9)*1.2);sideBoat(ctx,x,y,hull);
    // A second boat never sits in exactly the same place in every port.
    sideBoat(ctx,s.bank?46:340,129+Math.round(Math.sin(t*.7+1)),port.cheap==='fish'?'trawler':'freighter','#b5b38f');
    ctx.fillStyle='#d1cdae45';for(let i=0;i<30;i++){const xx=(r()*384+t*(i%2?2:-1))%384,yy=130+r()*85;ctx.fillRect(xx|0,yy|0,4+(i%4)*3,1);}
    const px=(s.bank?171:50)+Math.round(Math.sin(t*.16)*22),py=harborBase(port).height-84;ctx.fillStyle='#d6b787';ctx.fillRect(px,py-9,3,3);ctx.fillStyle='#466494';ctx.fillRect(px-1,py-6,5,5);ctx.fillStyle=P.ink;ctx.fillRect(px-1,py-1,2,4);ctx.fillRect(px+2,py-1,2,4);
    const gx=(t*8+70)%450-30,gy=32+Math.sin(t)*2;ctx.fillStyle='#394d74';ctx.fillRect(gx|0,gy|0,3,1);ctx.fillRect((gx-2)|0,(gy-1)|0,2,1);ctx.fillRect((gx+3)|0,(gy-1)|0,2,1);
    if(s.rain){ctx.fillStyle='#ccd1bb35';for(let i=0;i<45;i++){const rx=(r()*420-t*30)%420,ry=(r()*250+t*85)%250;ctx.fillRect(rx|0,ry|0,1,4);}}
  }
  class Renderer{
    constructor(canvas,game){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;this.cam={x:game.player.x,y:game.player.y};this.zoom=.34;this.targetZoom=.34;this.zoomFactor=game.s.settings.cameraZoom||1;this.obstacles=[];this.labels=[];this.labelSlots=new Map();this.shake=0;this.hitT=0;this.hitBearing=null;this.aim=null;this.paths=[];this.frame=0;this.terrain=new Map();
      for(const p of game.earth.polygons){const path=new Path2D();for(const ring of p.rings){ring.forEach((q,i)=>{const x=(q[0]+180)*W.SCALE,y=(90-q[1])*W.SCALE;i?path.lineTo(x,y):path.moveTo(x,y);});path.closePath();}this.paths.push({...p,path,left:(p.minX+180)*W.SCALE,right:(p.maxX+180)*W.SCALE,top:(90-p.maxY)*W.SCALE,bottom:(90-p.minY)*W.SCALE});}
      this.resize();
    }
    resize(){const box=this.canvas.getBoundingClientRect();this.width=Math.max(160,Math.ceil(box.width/2));this.height=Math.max(100,Math.ceil(box.height/2));this.canvas.width=this.width;this.canvas.height=this.height;this.ctx.imageSmoothingEnabled=false;this.baseZoom=Math.max(.1,Math.min(.34,Math.min(this.width,this.height)/1400));this.zoom=this.targetZoom=W.clamp(this.baseZoom*this.zoomFactor,.08,.7);}
    setObstacles(elements){const rect=this.canvas.getBoundingClientRect(),scale=this.width/(rect.width||1),scaleY=this.height/(rect.height||1);this.obstacles=elements.map(el=>el.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0).map(b=>({left:(b.left-rect.left)*scale,top:(b.top-rect.top)*scaleY,right:(b.right-rect.left)*scale,bottom:(b.bottom-rect.top)*scaleY}));}
    screenWorld(clientX,clientY){const b=this.canvas.getBoundingClientRect();return{x:W.wrap(this.cam.x+(clientX-b.left-b.width/2)*this.width/b.width/this.zoom),y:this.cam.y+(clientY-b.top-b.height/2)*this.height/b.height/this.zoom};}
    setZoom(delta){this.targetZoom=W.clamp(this.targetZoom*delta,.08,.7);this.zoomFactor=this.targetZoom/this.baseZoom;this.game.s.settings.cameraZoom=this.zoomFactor;}
    land(c,cam,z,w,h,chart=false){c.save();c.translate(w/2-cam.x*z,h/2-cam.y*z);c.scale(z,z);
      const minX=cam.x-w/2/z,maxX=cam.x+w/2/z,minY=cam.y-h/2/z,maxY=cam.y+h/2/z;
      for(const shift of [-W.W,0,W.W]){c.save();c.translate(shift,0);for(const p of this.paths){if(p.right+shift<minX||p.left+shift>maxX||p.bottom<minY||p.top>maxY)continue;
        if(!chart){c.lineJoin='round';c.lineWidth=100;c.strokeStyle='#246e8a';c.stroke(p.path);c.lineWidth=28;c.strokeStyle='#5bb8b1';c.stroke(p.path);c.lineWidth=9;c.strokeStyle=P.sand;c.stroke(p.path);}
        c.fillStyle=chart?'#517d75':p.minY>58?'#99bfc2':P.land;c.fill(p.path,'evenodd');
        if(chart){c.strokeStyle='#8fb7ad';c.lineWidth=1/z;c.stroke(p.path);}
      }c.restore();}c.restore();
    }
    render(dt){const g=this.game,p=g.player,c=this.ctx,w=this.width,h=this.height;this.frame++;this.cam.x=W.wrap(this.cam.x+W.dx(this.cam.x,p.x)*(1-Math.exp(-dt*5)));this.cam.y+=(p.y-this.cam.y)*(1-Math.exp(-dt*5));this.zoom+=(this.targetZoom-this.zoom)*(g.s.settings.reduceMotion?1:Math.min(1,dt*8));const z=this.zoom,ambientTime=g.s.settings.reduceMotion?0:g.time;this.hitT=Math.max(0,this.hitT-dt);
      c.fillStyle=P.deep;c.fillRect(0,0,w,h);c.save();
      if(this.shake>0&&g.s.settings.shake){c.translate(Math.round(Math.sin(g.time*95)*this.shake),Math.round(Math.cos(g.time*71)*this.shake));this.shake=Math.max(0,this.shake-dt*7);}
      this.land(c,this.cam,z,w,h);
      const sx=x=>w/2+W.dx(this.cam.x,x)*z,sy=y=>h/2+(y-this.cam.y)*z;
      // Sparse land marks keep the coast readable. Cache the geographic tests.
      for(let ty=Math.floor((this.cam.y-h/2/z)/180);ty<Math.ceil((this.cam.y+h/2/z)/180);ty++)for(let tx=Math.floor((this.cam.x-w/2/z)/180);tx<Math.ceil((this.cam.x+w/2/z)/180);tx++){
        const key=tx+':'+ty;let tile=this.terrain.get(key);if(tile===undefined){const rand=C.rng(C.hash(key)),x=tx*180+rand()*100,y=ty*180+rand()*100,geo=W.geo(x,y);tile=g.earth.water(x,y)?null:g.earth.land(x-25,y)&&g.earth.land(x+25,y)&&g.earth.land(x,y-25)?{x,y,desert:geo.lat>14&&geo.lat<34&&geo.lon>-18&&geo.lon<60,snow:Math.abs(geo.lat)>60}:null;this.terrain.set(key,tile);if(this.terrain.size>12000)this.terrain.clear();}
        if(tile){const x=sx(tile.x)|0,y=sy(tile.y)|0;c.fillStyle=tile.desert?'#a3976b':tile.snow?'#b3b7a0':'#386850';if(tile.desert){c.fillRect(x,y,12*z,3*z);c.fillRect(x+8*z,y-3*z,18*z,3*z);}else for(let n=0;n<3;n++){const bx=x+n*7*z,by=y+(n%2)*9*z;poly(c,[[bx,by-15*z],[bx-8*z,by],[bx+8*z,by]],tile.snow?'#9bab91':'#2e5c4c');c.fillStyle=tile.snow?'#abb69b':'#6b9162';c.fillRect(bx-1,by,2,5*z);}}}
      // Repeating large wave clusters are anchored in world space and drift slowly.
      const startX=Math.floor((this.cam.x-w/2/z)/95)*95,startY=Math.floor((this.cam.y-h/2/z)/90)*90;
      c.fillStyle='#b4eafa24';for(let y=startY;y<this.cam.y+h/2/z;y+=90)for(let x=startX;x<this.cam.x+w/2/z;x+=95){if((Math.floor(x/95)*17+Math.floor(y/90)*31)%4!==0)continue;const v=Math.sin(x*.017+y*.033),xx=x+v*32,yy=y+Math.sin(ambientTime*.7+x*.005)*9;if(g.earth.land(xx,yy))continue;const px=sx(xx)|0,py=sy(yy)|0,ww=5+Math.floor((v+1)*4);c.fillRect(px,py,ww,1);c.fillRect(px+ww-1,py-1,3,1);}
      if(g.route.length){c.strokeStyle='#83e9f077';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.moveTo(sx(p.x),sy(p.y));for(const q of g.route)c.lineTo(sx(q.x),sy(q.y));c.stroke();c.setLineDash([]);}
      this.landmarkLabels=[];const worldLabel=(...args)=>this.landmarkLabels.push(this.label(...args));
      for(const port of g.ports){const x=sx(port.x),y=sy(port.y);if(x<-100||x>w+100||y<-100||y>h+100)continue;
        c.strokeStyle='#d2e8ee66';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.arc(x,y,185*z,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle=P.wood;c.fillRect(x-14,y-4,28,7);c.fillStyle=P.cream;c.fillRect(x-8,y-12,10,8);c.fillStyle=P.gold;c.fillRect(x+5,y-16,2,13);c.fillRect(x+7,y-16,7,4);worldLabel(c,port.name,x,y-25,P.cream);}
      for(const site of [...g.sites,...g.bossSites.filter(b=>!g.s.bosses.includes(b.id)&&!g.enemies.some(e=>e.bossId===b.id&&e.hp>0))]){const x=sx(site.x),y=sy(site.y);if(x<-100||x>w+100||y<-100||y>h+100)continue;const color=site.type==='fish'?P.blue:site.type==='oil'?'#b2b29b':P.coral;
        c.strokeStyle=color+'66';c.setLineDash([2,6]);c.beginPath();c.arc(x,y,(110+Math.sin(ambientTime)*3)*z,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle=color;c.fillRect(x-2,y-2,5,5);if(g.production?.site.id!==site.id)worldLabel(c,site.name,x,y-15,color);
        if(site.type==='fish'){c.globalAlpha=.5;for(let i=0;i<8;i++){const a=i*.8+ambientTime*.1,rr=(25+i*7)*z;c.fillRect((x+Math.cos(a)*rr)|0,(y+Math.sin(a)*rr*.5)|0,3,1);}c.globalAlpha=1;}}
      if(g.production){const op=g.production;
        if(op.plan.id==='drift'){const origin=g.workOrigin(op,0),station=g.station(op.boat);c.strokeStyle=P.blue;c.setLineDash([2,4]);c.beginPath();c.moveTo(sx(origin.x),sy(origin.y));c.lineTo(sx(origin.x+op.drift.x),sy(origin.y+op.drift.y));c.stroke();c.setLineDash([]);c.strokeRect(sx(station.x)-6,sy(station.y)-6,12,12);}
        if(op.approach)for(const a of [op.approach.angle,op.approach.flank].filter(a=>a!=null)){const x=sx(op.site.x),y=sy(op.site.y),r=175*z,tx=x+Math.cos(a)*r,ty=y+Math.sin(a)*r;c.strokeStyle=P.coral;c.fillStyle=P.coral;c.lineWidth=2;c.beginPath();c.arc(x,y,r,a-.3,a+.3);c.stroke();c.beginPath();c.moveTo(tx-Math.cos(a)*14,ty-Math.sin(a)*14);c.lineTo(tx+Math.cos(a+.8)*8,ty+Math.sin(a+.8)*8);c.lineTo(tx+Math.cos(a-.8)*8,ty+Math.sin(a-.8)*8);c.closePath();c.fill();worldLabel(c,WidewakeWork.bearing(a),tx+Math.cos(a)*24,ty+Math.sin(a)*24,P.coral);c.lineWidth=1;}
      }
      for(const drop of g.drops){const x=sx(drop.x),y=sy(drop.y);c.fillStyle=drop.kind==='relic'?P.gold:drop.kind==='repair'?'#87dfba':'#b69d72';c.fillRect(x-3,y-3+Math.sin(ambientTime*3),6,5);c.fillStyle=P.ink;c.fillRect(x-1,y-2+Math.sin(ambientTime*3),2,4);}
      for(const signal of g.signals){if(g.s.voyage.resolved[signal.id])continue;const x=sx(signal.x),y=sy(signal.y);if(x<-60||x>w+60||y<-60||y>h+60)continue;
        c.strokeStyle=P.gold;c.setLineDash([2,5]);c.beginPath();c.arc(x,y,100*z,0,Math.PI*2);c.stroke();c.setLineDash([]);
        if(signal.kind==='wreck'){c.save();c.translate(x,y);c.rotate(.4);c.globalAlpha=.65;c.drawImage(shipSprite('freighter'),-30*z,-24*z,60*z,48*z);c.fillStyle=P.sea;c.fillRect(-32*z,2*z,65*z,22*z);c.restore();}
        else{c.fillStyle=P.wood;c.fillRect(x-2,y-2,5,8);c.fillStyle=P.gold;c.fillRect(x+2,y-6,7,4);c.fillStyle=P.cream;c.fillRect(x+1,y-7,1,13);}
        if(g.encounter?.signal.id!==signal.id)worldLabel(c,signal.name,x,y-22,P.gold);
      }
      for(const h of g.hazards){const x=sx(h.x),y=sy(h.y),radius=h.radius*z;c.fillStyle='#ca887329';c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.fill();c.strokeStyle=P.coral;c.lineWidth=1;c.stroke();c.beginPath();c.arc(x,y,radius*(1-h.elapsed/h.delay),0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke();}
      for(const e of g.enemies){const x=sx(e.x),y=sy(e.y);if(x<-100||x>w+100||y<-100||y>h+100)continue;
        if(e.charge?.phase==='aim'){c.strokeStyle=P.coral;c.setLineDash([3,3]);c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(e.charge.angle)*460*z,y+Math.sin(e.charge.angle)*460*z);c.stroke();c.setLineDash([]);}
        if(e.attack?.kind==='fan'){c.strokeStyle=P.coral;c.fillStyle='#ca88731a';c.beginPath();c.moveTo(x,y);c.arc(x,y,430*z,e.attack.angle-.55,e.attack.angle+.55);c.closePath();c.fill();c.stroke();}
        if(e.attack?.kind==='ring'){c.strokeStyle=P.coral;c.setLineDash([4,5]);c.beginPath();c.arc(x,y,(65+110*(1-e.attack.t/e.attack.max))*z,0,Math.PI*2);c.stroke();c.setLineDash([]);}
      }
      const labelRequests=[],shipBlocks=[],edgeRequests=[];
      const drawShip=(s,enemy)=>{const x=sx(s.x),y=sy(s.y);if(x<-30||x>w+30||y<-30||y>h+30)return;
        const speed=enemy?70:Math.hypot(s.vx||0,s.vy||0);
        if(speed>12){const len=Math.min(70,speed*.35)*z,ax=Math.cos(s.angle),ay=Math.sin(s.angle);c.strokeStyle=enemy?'#b3a68a33':'#afe8ed77';c.lineWidth=1;
          for(const side of [-1,1]){c.beginPath();c.moveTo(x-ax*9*z-ay*side*6*z,y-ay*9*z+ax*side*6*z);c.lineTo(x-ax*len-ay*side*15*z,y-ay*len+ax*side*15*z);c.stroke();}}
        const sprite=shipSprite(s.type,enemy),size=Math.max(s===p?12:enemy?6:8,(s.type==='boss'?90:48)*z);if(!enemy||s.bossId)shipBlocks.push({left:x-size*.55,top:y-size*.55,right:x+size*.55,bottom:y+size*.55});
        const kick=!g.s.settings.reduceMotion?(s.flash||0)*10:0,angle=s.flashAngle??s.angle;
        c.save();c.translate(Math.round(x-Math.cos(angle)*kick),Math.round(y-Math.sin(angle)*kick));c.rotate(s.angle);c.drawImage(sprite,-size/2,-size/2,size,size);if(s.hit>0&&!g.s.settings.reduceMotion){c.globalAlpha=Math.min(.65,s.hit*4);c.drawImage(flashSprite(s.type,enemy),-size/2,-size/2,size,size);}c.restore();
        if(s.flash>0&&!g.s.settings.reduceMotion){const mx=x+Math.cos(angle)*22*z,my=y+Math.sin(angle)*22*z;c.save();c.translate(Math.round(mx),Math.round(my));c.rotate(angle);c.fillStyle=enemy?P.coral:P.cream;c.fillRect(0,-1,4,2);c.fillStyle=P.gold;c.fillRect(1,-2,2,4);c.restore();}
        if(s===p){c.strokeStyle=P.gold;c.globalAlpha=.8;c.beginPath();c.arc(x,y,Math.max(8,20*z),0,Math.PI*2);c.stroke();c.globalAlpha=1;}
        const critical=!enemy&&s.hp<s.maxHp*.3,highlight=!enemy&&g.highlightUid===s.uid&&g.highlightUntil>g.time,working=!enemy&&g.production?.workers.includes(s);
        if(highlight||critical){c.strokeStyle=critical?P.coral:P.gold;c.lineWidth=1;c.setLineDash(critical?[]:[2,2]);c.strokeRect(x-size*.6-3,y-size*.6-3,size*1.2+6,size*1.2+6);c.setLineDash([]);}
        if(s.hp<s.maxHp||!enemy){const width=enemy?Math.min(14,Math.max(7,size)):Math.min(18,Math.max(10,size));c.fillStyle='#101b32aa';c.fillRect(x-width/2,y+size*.45,width,2);c.fillStyle=enemy||critical?P.coral:'#87dfba';c.fillRect(x-width/2,y+size*.45,width*Math.max(0,s.hp/s.maxHp),2);}
        if(s!==p&&(highlight||critical||working||s.temporary||s.bossId))labelRequests.push({uid:enemy?-s.id:s.uid,text:(s.bossId?s.name:s.data.name)+(critical?' / SOS':''),x,y,radius:size*.6,color:critical||s.bossId?P.coral:working||highlight?P.gold:P.cream,priority:highlight?100:critical?90+(1-s.hp/s.maxHp):s.temporary?85:s.bossId?80:50});
      };
      for(const e of g.enemies)if(e.hp>0)drawShip(e,true);if(g.encounter?.boat)drawShip(g.encounter.boat,false);for(const f of g.fleet)drawShip(f,false);drawShip(p,false);
      for(const b of g.bullets){const x=sx(b.x),y=sy(b.y);if(x<0||x>w||y<0||y>h)continue;c.beginPath();c.moveTo(x,y);c.lineTo(x-b.vx*.025*z,y-b.vy*.025*z);if(b.hostile){c.strokeStyle=P.ink;c.lineWidth=3;c.stroke();}c.strokeStyle=b.hostile?'#e0a78e':'#e5d8a7';c.lineWidth=b.hostile?1.5:1;c.stroke();}
      for(const e of g.effects){const x=sx(e.x),y=sy(e.y);if(x<-50||x>w+50||y<-50||y>h+50)continue;const life=e.t/e.max,progress=g.s.settings.reduceMotion?.4:1-life,r=progress*e.size*z;c.globalAlpha=Math.min(1,life*1.5);
        if(e.type==='repair'){c.strokeStyle='#87dfba';c.lineWidth=1;c.beginPath();c.arc(x,y,9+r*.4,0,Math.PI*2);c.stroke();c.fillStyle='#87dfba';c.fillRect(x-1,y-10-progress*7,2,7);c.fillRect(x-3,y-8-progress*7,6,2);}
        else if(e.type==='broadside'){c.strokeStyle=P.cream;c.lineWidth=1;c.beginPath();c.arc(x,y,5+r,0,Math.PI*2);c.stroke();}
        else if(e.type==='impact'||e.type==='hurt'){c.fillStyle=e.type==='hurt'?P.coral:P.cream;for(let i=0;i<4;i++){const a=i*Math.PI*.5+.6;c.fillRect(Math.round(x+Math.cos(a)*(2+r)),Math.round(y+Math.sin(a)*(2+r)),2,2);}if(life>.6)c.fillRect(x-1,y-1,3,3);}
        else{c.strokeStyle=P.foam;c.lineWidth=1;c.beginPath();c.ellipse(x,y,3+r,2+r*.65,0,0,Math.PI*2);c.stroke();for(let i=0;i<7;i++){const a=i*2.39996,rr=r*(.6+(i%3)*.17),size=Math.max(2,(6-progress*3)*(e.size>65?1.4:1));c.fillStyle=i%3===0?P.coral:i%3===1?P.gold:'#526357';c.fillRect(Math.round(x+Math.cos(a)*rr-size/2),Math.round(y+Math.sin(a)*rr-progress*4-size/2),size,size);}}
        c.globalAlpha=1;
      }
      if(this.aim){const x=sx(this.aim.x),y=sy(this.aim.y),px=sx(p.x),py=sy(p.y);c.strokeStyle=P.cream;c.lineWidth=1;c.globalAlpha=.7;c.setLineDash([1,5]);c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();c.setLineDash([]);c.globalAlpha=1;this.reticle(c,x,y,6,P.cream);}
      else if(g.s.settings.autoFire&&g.aimTarget?.hp>0){const a=g.aimTarget,x=sx(a.x),y=sy(a.y);if(x>0&&x<w&&y>0&&y<h)this.reticle(c,x,y,Math.max(7,a.radius*z+3),P.gold);}
      if(this.hitT>0){const x=sx(p.x),y=sy(p.y),a=this.hitBearing;c.globalAlpha=Math.min(1,this.hitT*2);c.strokeStyle=P.coral;c.lineWidth=2;c.beginPath();if(a===null)c.arc(x,y,24,0,Math.PI*2);else{c.arc(x,y,26,a-.35,a+.35);c.stroke();const mx=x+Math.cos(a)*31,my=y+Math.sin(a)*31;poly(c,[[mx,my],[mx-Math.cos(a-.6)*5,my-Math.sin(a-.6)*5],[mx-Math.cos(a+.6)*5,my-Math.sin(a+.6)*5]],P.coral);}c.stroke();c.globalAlpha=1;}
      for(const f of g.fleet){const critical=f.hp<f.maxHp*.3,selected=g.highlightUid===f.uid&&g.highlightUntil>g.time;if(!critical&&!selected)continue;const x=sx(f.x),y=sy(f.y);if(x>=0&&x<w&&y>=0&&y<h&&!this.obstacles.some(b=>intersects({left:x-5,top:y-5,right:x+5,bottom:y+5},b)))continue;const anchor=edgeAnchor(x,y,w,h,[...this.obstacles,...this.landmarkLabels,...shipBlocks]);if(!anchor)continue;const color=critical?P.coral:P.gold;c.save();c.translate(anchor.x,anchor.y);c.rotate(anchor.angle);poly(c,[[6,0],[-3,-4],[-3,4]],color);c.restore();shipBlocks.push({left:anchor.x-7,top:anchor.y-7,right:anchor.x+7,bottom:anchor.y+7});edgeRequests.push({uid:f.uid,text:f.data.name+(critical?' / SOS':''),x:anchor.x,y:anchor.y,radius:7,color,priority:selected?100:91});}
      // Labels occupy their own clear space after hulls and projectiles render.
      // Stable preferred slots avoid a name changing sides every frame.
      this.edgeMarkers=edgeRequests;const requests=[...labelRequests.filter(q=>!edgeRequests.some(e=>e.uid===q.uid)),...edgeRequests];c.font='7px "Commit Mono", monospace';for(const item of requests){item.width=c.measureText(item.text).width+6;item.previous=this.labelSlots.get(item.uid);}
      this.labels=packLabels(requests,[...this.obstacles,...this.landmarkLabels,...shipBlocks],{left:5,top:5,right:w-5,bottom:h-5},w<400?5:10);this.labelSlots=new Map(this.labels.map(q=>[q.uid,q.index]));
      for(const q of this.labels){const endX=W.clamp(q.x,q.left,q.right),endY=W.clamp(q.y,q.top,q.bottom),a=Math.atan2(endY-q.y,endX-q.x);c.strokeStyle=q.color;c.globalAlpha=.45;c.lineWidth=1;c.beginPath();c.moveTo(q.x+Math.cos(a)*q.radius,q.y+Math.sin(a)*q.radius);c.lineTo(endX,endY);c.stroke();c.globalAlpha=1;this.label(c,q.text,q.labelX,q.labelY,q.color);}
      // Day cycles dim gently; ports remain legible and the sun never blocks combat.
      const night=Math.max(0,Math.sin(g.s.seconds/90))*0.13;if(night){c.fillStyle='rgba(15,28,35,'+night+')';c.fillRect(0,0,w,h);}
      c.restore();
    }
    reticle(c,x,y,r,color){x=Math.round(x);y=Math.round(y);r=Math.round(r);c.strokeStyle=color;c.lineWidth=1;for(const dx of [-1,1])for(const dy of [-1,1]){c.beginPath();c.moveTo(x+dx*(r-3),y+dy*r);c.lineTo(x+dx*r,y+dy*r);c.lineTo(x+dx*r,y+dy*(r-3));c.stroke();}}
    label(c,text,x,y,color){c.font='7px "Commit Mono", monospace';c.textAlign='center';c.fillStyle='#101b32d9';const width=c.measureText(text).width;c.fillRect(x-width/2-3,y-7,width+6,11);c.fillStyle=color;c.fillText(text,Math.round(x),Math.round(y));return{left:x-width/2-3,top:y-7,right:x+width/2+3,bottom:y+4};}
    chart(cv,selected,mini=false,preview=null){const c=cv.getContext('2d'),w=cv.width,h=cv.height,g=this.game; c.imageSmoothingEnabled=false;c.fillStyle='#152d49';c.fillRect(0,0,w,h);
      const z=mini?.04:w/W.W,cam=mini?g.player:{x:W.W/2,y:W.H/2};this.land(c,cam,z,w,h,true);
      const sx=x=>mini?w/2+W.dx(cam.x,x)*z:x/W.W*w,sy=y=>mini?h/2+(y-cam.y)*z:y/W.H*h;
      if(!mini){c.strokeStyle='#accbe52b';c.lineWidth=1;for(let lon=30;lon<360;lon+=30){const x=lon/360*w;c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let lat=30;lat<180;lat+=30){const y=lat/180*h;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
        c.fillStyle='#b4d8e544';c.font='12px "Commit Mono", monospace';c.textAlign='center';c.fillText('Pacific Ocean',w*.18,h*.55);c.fillText('Atlantic Ocean',w*.42,h*.53);c.fillText('Indian Ocean',w*.72,h*.65);
      }
      for(const site of g.sites){const x=sx(site.x),y=sy(site.y);c.fillStyle=site.type==='fish'?P.blue:'#a4a293';c.fillRect(x-2,y-2,4,4);}
      for(const signal of g.signals)if(!g.s.voyage.resolved[signal.id]){const x=sx(signal.x),y=sy(signal.y);c.strokeStyle=P.gold;c.strokeRect(x-2,y-2,5,5);}
      for(const b of g.bossSites)if(!g.s.bosses.includes(b.id)){const x=sx(b.x),y=sy(b.y);c.strokeStyle=P.coral;c.beginPath();c.moveTo(x-4,y-4);c.lineTo(x+4,y+4);c.moveTo(x+4,y-4);c.lineTo(x-4,y+4);c.stroke();}
      for(const p of g.ports){const x=sx(p.x),y=sy(p.y);c.fillStyle=g.s.visits.includes(p.id)?P.gold:'#c9c1a1';c.fillRect(x-2,y-2,mini?3:5,mini?3:5);if(!mini&&['havana','rio','cape-town','yokohama','sydney','honolulu','reykjavik','mumbai'].includes(p.id)){c.font='9px "Commit Mono", monospace';c.textAlign='left';c.fillStyle=P.cream;c.fillText(p.name,x+5,y-5);}}
      if(selected){const x=sx(selected.x),y=sy(selected.y);c.strokeStyle=P.gold;c.lineWidth=1;c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.stroke();if(!mini){c.font='10px "Commit Mono", monospace';c.textAlign=x>w*.7?'right':'left';c.fillStyle=P.gold;c.fillText(selected.name||'Waypoint',x+(x>w*.7?-12:12),y+12);}}
      const course=preview||g.route;if(course.length){c.strokeStyle='#76e0ecbb';c.lineWidth=1;c.setLineDash([3,3]);let prev=g.player;c.beginPath();c.moveTo(sx(prev.x),sy(prev.y));for(const q of course){if(Math.abs(q.x-prev.x)>W.W/2)c.moveTo(sx(q.x),sy(q.y));else c.lineTo(sx(q.x),sy(q.y));prev=q;}c.stroke();c.setLineDash([]);}
      if(mini){let contacts=0;for(const e of g.enemies){if(e.hp<=0)continue;const x=sx(e.x),y=sy(e.y);if(x<0||y<0||x>w||y>h)continue;contacts++;c.fillStyle=P.coral;if(e.bossId){c.strokeStyle=P.coral;c.strokeRect(x-3,y-3,6,6);}else{c.beginPath();c.moveTo(x,y-2);c.lineTo(x-1.5,y+1);c.lineTo(x+1.5,y+1);c.closePath();c.fill();}}if(contacts){const text=contacts+' contacts';c.font='7px "Commit Mono", monospace';c.textAlign='right';c.fillStyle=P.ink;c.fillRect(w-c.measureText(text).width-7,0,c.measureText(text).width+7,11);c.fillStyle=P.coral;c.fillText(text,w-3,8);}}
      const px=sx(g.player.x),py=sy(g.player.y);c.fillStyle=P.cream;if(mini){const a=g.player.angle;poly(c,[0,2.4,-2.4].map(offset=>[px+Math.cos(a+offset)*5,py+Math.sin(a+offset)*5]),P.cream);c.font='7px "Commit Mono", monospace';c.textAlign='left';c.fillText('N',3,8);}else poly(c,[[px,py-5],[px-4,py+4],[px+4,py+4]],P.cream);c.strokeStyle=P.ink;c.strokeRect(px-1,py-1,2,2);
      if(mini){for(const f of g.fleet){c.fillStyle=f.hp<f.maxHp*.3?P.coral:P.blue;c.fillRect(sx(f.x)-1,sy(f.y)-1,2,2);}if(g.encounter?.boat){c.fillStyle=P.gold;c.fillRect(sx(g.encounter.boat.x)-1,sy(g.encounter.boat.y)-1,3,3);}}
    }
  }
  const api={Renderer,shipSprite,icon,harbor,harborBase,harborStyles,packLabels,edgeAnchor};root.WidewakeRender=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
