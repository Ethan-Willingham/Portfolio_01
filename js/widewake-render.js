/* Small, deliberately chunky canvases. Art direction can evolve without touching the simulation. */
(function(root){
  'use strict';
  const D=root.WidewakeData,W=root.WidewakeWorld,C=root.WidewakeCore;
  const P={ink:'#182d2b',sea:'#28504c',deep:'#244441',water:'#35635a',foam:'#91aa92',land:'#687b55',sand:'#b4a476',pine:'#405d48',cream:'#e8dfbf',gold:'#dfc288',coral:'#c68473',blue:'#8fb3c7',wood:'#8e7052',dark:'#203b35'};
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function poly(c,points,color){c.fillStyle=color;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill();}
  const sprites=new Map();
  function shipSprite(type,enemy=false){const key=type+enemy;if(sprites.has(key))return sprites.get(key);const cv=canvas(48,48),c=cv.getContext('2d');
    const large=['frigate','leviathan','boss','destroyer','armored'].includes(type),wide=['oilrig','freighter','boss','leviathan'].includes(type),s=large?1.15:1;
    c.translate(24,24);c.scale(s,s);const body=enemy?'#a56557':'#627e68',hull=enemy?'#623e37':'#24463d',deck=enemy?'#c99c76':'#c9b889';
    poly(c,[[-16,-7],[-10,-10],[8,-10],[17,-5],[20,0],[17,5],[8,10],[-10,10],[-16,7]],P.ink);
    poly(c,[[-15,-6],[-9,-8],[8,-8],[16,-4],[18,0],[16,4],[8,8],[-9,8],[-15,6]],hull);
    c.fillStyle=body;c.fillRect(-13,-7,21,14);poly(c,[[8,-7],[16,-3],[18,0],[16,3],[8,7]],body);
    c.fillStyle=deck;c.fillRect(-10,-5,19,10);poly(c,[[9,-5],[14,-2],[16,0],[14,2],[9,5]],deck);
    c.fillStyle='#978765';c.fillRect(-8,0,14,1);c.fillRect(-8,-3,14,1);c.fillRect(-8,3,14,1);
    if(type==='freighter'){for(let x=-8;x<8;x+=6){c.fillStyle=x===-2?'#a96d53':'#8d9b77';c.fillRect(x,-4,5,8);c.fillStyle=P.ink;c.fillRect(x+2,-4,1,8);}}
    else if(type==='oilrig'){c.fillStyle='#64776b';c.fillRect(-11,-5,12,10);c.fillStyle=P.ink;c.fillRect(-8,-7,2,14);c.fillRect(-11,-2,12,2);c.fillStyle=P.gold;c.fillRect(-5,-2,2,3);}
    else if(type==='trawler'){c.strokeStyle='#80907c';c.lineWidth=1;for(let x=-12;x<0;x+=3){c.beginPath();c.moveTo(x,-9);c.lineTo(x+6,9);c.stroke();}c.fillStyle=P.wood;c.fillRect(-12,-7,3,14);}
    else if(type==='repair'){c.fillStyle=P.cream;c.fillRect(-8,-5,13,10);c.fillStyle='#9b5d50';c.fillRect(-3,-3,2,6);c.fillRect(-5,-1,6,2);}
    else {c.fillStyle=P.cream;c.fillRect(-5,-5,10,10);c.fillStyle='#ada786';c.fillRect(-5,2,10,3);c.fillStyle=P.dark;c.fillRect(3,-3,2,6);
      c.fillStyle=enemy?P.coral:P.gold;c.fillRect(-3,-1,2,2);
      if(['cutter','brig'].includes(type)){c.fillStyle=P.wood;c.fillRect(-1,-12,1,24);poly(c,[[0,-11],[0,10],[8,7],[8,-8]],P.cream);c.fillStyle='#b7ad8c';c.fillRect(7,-8,2,15);}
    }
    c.fillStyle=P.ink;c.fillRect(7,-2,9,4);c.fillStyle='#7c8580';c.fillRect(8,-1,7,2);
    if(large){c.fillStyle=P.ink;c.fillRect(-9,-12,4,7);c.fillRect(-9,5,4,7);c.fillStyle='#808a80';c.fillRect(-8,-12,2,5);c.fillRect(-8,7,2,5);}
    c.fillStyle=enemy?P.coral:P.cream;c.fillRect(-15,-1,3,2);
    sprites.set(key,cv);return cv;
  }
  function icon(id,size=24){const cv=canvas(size,size),c=cv.getContext('2d');c.scale(size/24,size/24);const g=D.goods.find(x=>x.id===id),f=D.fish.find(x=>x.id===id);const color=g?.color||f?.color||P.gold;const kind=g?.icon|| (f?'fish':id);
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
    havana:{sky:'#a4bba4',water:'#487b6e',wall:'#c0a36c',roof:'#a4634e',kind:'tropical',sun:true,bank:0},
    nassau:{sky:'#b8c6ac',water:'#628d7b',wall:'#bf8f7f',roof:'#b7aa7f',kind:'island',bank:1},
    'new-york':{sky:'#91a49b',water:'#435f5c',wall:'#805b4b',roof:'#414b45',kind:'industrial',bank:0},
    reykjavik:{sky:'#9faeae',water:'#587575',wall:'#b5b3a0',roof:'#8c514b',kind:'snow',bank:1},
    bergen:{sky:'#788e85',water:'#395d53',wall:'#9f6351',roof:'#404f43',kind:'fjord',bank:0,rain:true},
    london:{sky:'#9b9f8d',water:'#606d55',wall:'#80715c',roof:'#494e41',kind:'industrial',bank:1,rain:true},
    lisbon:{sky:'#c3bea0',water:'#587e71',wall:'#d0b989',roof:'#a46b50',kind:'hill',bank:0,sun:true},
    marseille:{sky:'#afc1b0',water:'#537c75',wall:'#c6b58e',roof:'#af7d61',kind:'stone',bank:1},
    alexandria:{sky:'#c2bea0',water:'#6d8c7b',wall:'#c2ad7d',roof:'#91835e',kind:'desert',bank:0,sun:true},
    dakar:{sky:'#baad8a',water:'#6c8570',wall:'#b27d53',roof:'#775d45',kind:'beach',bank:1,sun:true},
    'cape-town':{sky:'#9eafb0',water:'#476a66',wall:'#bfb79b',roof:'#8d7860',kind:'table',bank:0},
    rio:{sky:'#96b29b',water:'#4b7b67',wall:'#c7b68c',roof:'#a27555',kind:'jungle',bank:1},
    'buenos-aires':{sky:'#b8b49d',water:'#7a8262',wall:'#b99c73',roof:'#877251',kind:'flat',bank:0},
    valparaiso:{sky:'#9fbbad',water:'#517876',wall:'#b28476',roof:'#696d5c',kind:'hill',bank:1},
    'san-francisco':{sky:'#a7b6a8',water:'#58776d',wall:'#a38d6b',roof:'#695e4a',kind:'fog',bank:0},
    honolulu:{sky:'#a8bea4',water:'#527f71',wall:'#bbad7d',roof:'#807652',kind:'volcano',bank:1,sun:true},
    yokohama:{sky:'#a2afa1',water:'#587771',wall:'#b1a58e',roof:'#4b6257',kind:'east',bank:0},
    shanghai:{sky:'#aba68f',water:'#6d7860',wall:'#ad9877',roof:'#655c4b',kind:'industrial',bank:1},
    singapore:{sky:'#8da796',water:'#4b7362',wall:'#c19b74',roof:'#8e5e4c',kind:'east',bank:1,rain:true},
    mumbai:{sky:'#aaa68a',water:'#6c7c61',wall:'#b6a07a',roof:'#80684f',kind:'stone',bank:0,rain:true},
    muscat:{sky:'#b9b396',water:'#567e72',wall:'#c7bd9b',roof:'#b6aa85',kind:'desert',bank:1},
    mombasa:{sky:'#abb59a',water:'#567e64',wall:'#b4a47d',roof:'#93704e',kind:'fort',bank:0},
    sydney:{sky:'#a8beb0',water:'#4f7a71',wall:'#b2a47f',roof:'#957657',kind:'stone',bank:1,sun:true},
    auckland:{sky:'#a4b6a7',water:'#557969',wall:'#b6b09a',roof:'#687965',kind:'island',bank:0}
  };
  const harborCache=new Map();
  function harborBase(port){if(harborCache.has(port.id))return harborCache.get(port.id);const cv=canvas(384,216),c=cv.getContext('2d'),s=harborStyles[port.id],r=C.rng(C.hash(port.id)),ground=107+Math.floor(r()*25);
    c.fillStyle=s.sky;c.fillRect(0,0,384,216);
    if(s.sun){c.fillStyle='#d8c497';c.fillRect(290,24,18,18);c.fillRect(286,28,26,10);}
    c.fillStyle='#c3c5ad';for(let i=0;i<5;i++){const x=r()*380,y=15+r()*45,w=20+r()*50;c.fillRect(x|0,y|0,w|0,5);c.fillRect((x+10)|0,(y-4)|0,(w*.5)|0,6);}
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
      c.fillStyle='#364d41';for(let y=by+7;y<ground-10;y+=13)for(let x=bx+5;x<bx+bw-4;x+=10)c.fillRect(x,y,4,6);
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
    c.fillStyle='#5d644c';for(let x=px+5;x<px+pw;x+=29)c.fillRect(x,py,4,22+(r()*7|0));c.fillStyle='#a28b61';c.fillRect(px,py,pw,7);c.fillStyle='#766d50';for(let x=px;x<px+pw;x+=9)c.fillRect(x,py,1,7);c.fillStyle='#c0a874';c.fillRect(px+34,py-1,18,8);
    for(let i=0;i<7;i++){const x=px+8+r()*(pw-18),y=py-7-r()*3;c.fillStyle=i%2?'#8b7350':'#aa8d5b';c.fillRect(x|0,y|0,7,7);c.fillStyle='#5d5a43';c.fillRect((x+2)|0,y|0,1,7);}
    // Few foreground shapes, rather than a noise texture over every surface.
    c.fillStyle='#5f6f54';c.fillRect(s.bank?310:0,193,85,23);c.fillStyle='#9a8c65';c.fillRect(s.bank?310:0,190,85,5);
    for(let i=0;i<85;i++){c.fillStyle=i%3===0?'#b2b79a28':'#1c403c20';c.fillRect(Math.floor(r()*384),ground+Math.floor(r()*(216-ground)),5+Math.floor(r()*13),1);}
    harborCache.set(port.id,cv);return cv;
  }
  function sideBoat(c,x,y,kind,color=P.cream){c.fillStyle=P.ink;c.fillRect(x-23,y+5,49,3);poly(c,[[x-24,y-1],[x+25,y-1],[x+17,y+9],[x-17,y+9]],'#31584a');c.fillStyle='#9b8060';c.fillRect(x-21,y-1,40,2);c.fillStyle=color;c.fillRect(x-7,y-14,18,14);c.fillStyle=P.ink;c.fillRect(x-4,y-11,4,5);c.fillRect(x+3,y-11,4,5);c.fillRect(x+9,y-17,3,3);if(kind==='cutter'||kind==='brig'){c.fillStyle=P.wood;c.fillRect(x-12,y-41,2,40);poly(c,[[x-9,y-37],[x-9,y-5],[x+13,y-5]],P.cream);}if(kind==='trawler'){c.fillStyle=P.wood;c.fillRect(x-19,y-20,2,20);c.fillRect(x-25,y-20,20,2);}}
  function harbor(ctx,port,t,hull='cutter'){
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,384,216);ctx.drawImage(harborBase(port),0,0);const s=harborStyles[port.id],r=C.rng(C.hash(port.id));
    const x=s.bank?118:273,y=159+Math.round(Math.sin(t*.9)*1.2);sideBoat(ctx,x,y,hull);
    // A second boat never sits in exactly the same place in every port.
    sideBoat(ctx,s.bank?46:340,129+Math.round(Math.sin(t*.7+1)),port.cheap==='fish'?'trawler':'freighter','#b5b38f');
    ctx.fillStyle='#d1cdae45';for(let i=0;i<30;i++){const xx=(r()*384+t*(i%2?2:-1))%384,yy=130+r()*85;ctx.fillRect(xx|0,yy|0,4+(i%4)*3,1);}
    const px=(s.bank?171:50)+Math.round(Math.sin(t*.16)*22),py=harborBase(port).height-84;ctx.fillStyle='#d6b787';ctx.fillRect(px,py-9,3,3);ctx.fillStyle='#495e4d';ctx.fillRect(px-1,py-6,5,5);ctx.fillStyle=P.ink;ctx.fillRect(px-1,py-1,2,4);ctx.fillRect(px+2,py-1,2,4);
    const gx=(t*8+70)%450-30,gy=32+Math.sin(t)*2;ctx.fillStyle='#4d6356';ctx.fillRect(gx|0,gy|0,3,1);ctx.fillRect((gx-2)|0,(gy-1)|0,2,1);ctx.fillRect((gx+3)|0,(gy-1)|0,2,1);
    if(s.rain){ctx.fillStyle='#ccd1bb35';for(let i=0;i<45;i++){const rx=(r()*420-t*30)%420,ry=(r()*250+t*85)%250;ctx.fillRect(rx|0,ry|0,1,4);}}
  }
  class Renderer{
    constructor(canvas,game){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.game=game;this.cam={x:game.player.x,y:game.player.y};this.zoom=.34;this.targetZoom=.34;this.shake=0;this.paths=[];this.frame=0;this.terrain=new Map();
      for(const p of game.earth.polygons){const path=new Path2D();for(const ring of p.rings){ring.forEach((q,i)=>{const x=(q[0]+180)*W.SCALE,y=(90-q[1])*W.SCALE;i?path.lineTo(x,y):path.moveTo(x,y);});path.closePath();}this.paths.push({...p,path,left:(p.minX+180)*W.SCALE,right:(p.maxX+180)*W.SCALE,top:(90-p.maxY)*W.SCALE,bottom:(90-p.minY)*W.SCALE});}
      this.resize();
    }
    resize(){const box=this.canvas.getBoundingClientRect();this.width=Math.max(160,Math.ceil(box.width/2));this.height=Math.max(100,Math.ceil(box.height/2));this.canvas.width=this.width;this.canvas.height=this.height;this.ctx.imageSmoothingEnabled=false;}
    screenWorld(clientX,clientY){const b=this.canvas.getBoundingClientRect();return{x:W.wrap(this.cam.x+(clientX-b.left-b.width/2)/2/this.zoom),y:this.cam.y+(clientY-b.top-b.height/2)/2/this.zoom};}
    setZoom(delta){this.targetZoom=W.clamp(this.targetZoom*delta,.12,.7);}
    land(c,cam,z,w,h,chart=false){c.save();c.translate(w/2-cam.x*z,h/2-cam.y*z);c.scale(z,z);
      const minX=cam.x-w/2/z,maxX=cam.x+w/2/z,minY=cam.y-h/2/z,maxY=cam.y+h/2/z;
      for(const shift of [-W.W,0,W.W]){c.save();c.translate(shift,0);for(const p of this.paths){if(p.right+shift<minX||p.left+shift>maxX||p.bottom<minY||p.top>maxY)continue;
        if(!chart){c.lineJoin='round';c.lineWidth=100;c.strokeStyle='#3a685a';c.stroke(p.path);c.lineWidth=28;c.strokeStyle='#768d6a';c.stroke(p.path);c.lineWidth=9;c.strokeStyle=P.sand;c.stroke(p.path);}
        c.fillStyle=chart?'#647659':p.minY>58?'#829780':P.land;c.fill(p.path,'evenodd');
        if(chart){c.strokeStyle='#829273';c.lineWidth=1/z;c.stroke(p.path);}
      }c.restore();}c.restore();
    }
    render(dt){const g=this.game,p=g.player,c=this.ctx,w=this.width,h=this.height;this.frame++;this.cam.x=W.wrap(this.cam.x+W.dx(this.cam.x,p.x)*(1-Math.exp(-dt*5)));this.cam.y+=(p.y-this.cam.y)*(1-Math.exp(-dt*5));this.zoom+=(this.targetZoom-this.zoom)*Math.min(1,dt*8);const z=this.zoom;
      c.fillStyle=P.deep;c.fillRect(0,0,w,h);c.save();
      if(this.shake>0&&g.s.settings.shake){c.translate(Math.round(Math.sin(g.time*95)*this.shake),Math.round(Math.cos(g.time*71)*this.shake));this.shake=Math.max(0,this.shake-dt*7);}
      this.land(c,this.cam,z,w,h);
      const sx=x=>w/2+W.dx(this.cam.x,x)*z,sy=y=>h/2+(y-this.cam.y)*z;
      // Sparse land marks keep the coast readable. Cache the geographic tests.
      for(let ty=Math.floor((this.cam.y-h/2/z)/180);ty<Math.ceil((this.cam.y+h/2/z)/180);ty++)for(let tx=Math.floor((this.cam.x-w/2/z)/180);tx<Math.ceil((this.cam.x+w/2/z)/180);tx++){
        const key=tx+':'+ty;let tile=this.terrain.get(key);if(tile===undefined){const rand=C.rng(C.hash(key)),x=tx*180+rand()*100,y=ty*180+rand()*100,geo=W.geo(x,y);tile=g.earth.water(x,y)?null:g.earth.land(x-25,y)&&g.earth.land(x+25,y)&&g.earth.land(x,y-25)?{x,y,desert:geo.lat>14&&geo.lat<34&&geo.lon>-18&&geo.lon<60,snow:Math.abs(geo.lat)>60}:null;this.terrain.set(key,tile);if(this.terrain.size>12000)this.terrain.clear();}
        if(tile){const x=sx(tile.x)|0,y=sy(tile.y)|0;c.fillStyle=tile.desert?'#a3976b':tile.snow?'#b3b7a0':'#516e4e';if(tile.desert){c.fillRect(x,y,12*z,3*z);c.fillRect(x+8*z,y-3*z,18*z,3*z);}else for(let n=0;n<3;n++){const bx=x+n*7*z,by=y+(n%2)*9*z;poly(c,[[bx,by-15*z],[bx-8*z,by],[bx+8*z,by]],tile.snow?'#9bab91':'#476346');c.fillStyle=tile.snow?'#abb69b':'#6b7550';c.fillRect(bx-1,by,2,5*z);}}}
      // Repeating large wave clusters are anchored in world space and drift slowly.
      const startX=Math.floor((this.cam.x-w/2/z)/95)*95,startY=Math.floor((this.cam.y-h/2/z)/90)*90;
      c.fillStyle='#9eb89d24';for(let y=startY;y<this.cam.y+h/2/z;y+=90)for(let x=startX;x<this.cam.x+w/2/z;x+=95){const v=Math.sin(x*.017+y*.033),xx=x+v*32,yy=y+Math.sin(g.time*.7+x*.005)*9;if(g.earth.land(xx,yy))continue;const px=sx(xx)|0,py=sy(yy)|0,ww=5+Math.floor((v+1)*4);c.fillRect(px,py,ww,1);c.fillRect(px+ww-1,py-1,3,1);}
      if(g.route.length){c.strokeStyle='#d4c4a055';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.moveTo(sx(p.x),sy(p.y));for(const q of g.route)c.lineTo(sx(q.x),sy(q.y));c.stroke();c.setLineDash([]);}
      for(const port of g.ports){const x=sx(port.x),y=sy(port.y);if(x<-100||x>w+100||y<-100||y>h+100)continue;
        c.strokeStyle='#c6bc9344';c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.arc(x,y,185*z,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle=P.wood;c.fillRect(x-14,y-4,28,7);c.fillStyle=P.cream;c.fillRect(x-8,y-12,10,8);c.fillStyle=P.gold;c.fillRect(x+5,y-16,2,13);c.fillRect(x+7,y-16,7,4);this.label(c,port.name,x,y-25,P.cream);}
      for(const site of [...g.sites,...g.bossSites.filter(b=>!g.s.bosses.includes(b.id))]){const x=sx(site.x),y=sy(site.y);if(x<-100||x>w+100||y<-100||y>h+100)continue;const color=site.type==='fish'?P.blue:site.type==='oil'?'#b2b29b':P.coral;
        c.strokeStyle=color+'66';c.setLineDash([2,6]);c.beginPath();c.arc(x,y,(110+Math.sin(g.time)*3)*z,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle=color;c.fillRect(x-2,y-2,5,5);this.label(c,site.name,x,y-15,color);
        if(site.type==='fish'){c.globalAlpha=.5;for(let i=0;i<8;i++){const a=i*.8+g.time*.1,rr=(25+i*7)*z;c.fillRect((x+Math.cos(a)*rr)|0,(y+Math.sin(a)*rr*.5)|0,3,1);}c.globalAlpha=1;}}
      for(const drop of g.drops){const x=sx(drop.x),y=sy(drop.y);c.fillStyle=drop.kind==='relic'?P.gold:drop.kind==='repair'?'#9ec79a':'#b69d72';c.fillRect(x-3,y-3+Math.sin(g.time*3),6,5);c.fillStyle=P.ink;c.fillRect(x-1,y-2+Math.sin(g.time*3),2,4);}
      const drawShip=(s,enemy)=>{const x=sx(s.x),y=sy(s.y);if(x<-30||x>w+30||y<-30||y>h+30)return;
        const speed=s===p?Math.hypot(p.vx,p.vy):70;
        if(speed>12){const len=Math.min(70,speed*.35)*z,ax=Math.cos(s.angle),ay=Math.sin(s.angle);c.strokeStyle=enemy?'#b3a68a33':'#a4c4a766';c.lineWidth=1;
          for(const side of [-1,1]){c.beginPath();c.moveTo(x-ax*9*z-ay*side*6*z,y-ay*9*z+ax*side*6*z);c.lineTo(x-ax*len-ay*side*15*z,y-ay*len+ax*side*15*z);c.stroke();}}
        const sprite=shipSprite(s.type,enemy),size=(s.type==='boss'?90:48)*z;
        c.save();c.translate(Math.round(x),Math.round(y));c.rotate(s.angle);c.drawImage(sprite,-size/2,-size/2,size,size);if(s.hit>0){c.globalCompositeOperation='source-atop';c.fillStyle='#e8dfbf77';c.fillRect(-size*.2,-size*.12,size*.4,size*.24);}c.restore();
        if(s===p){c.strokeStyle=P.gold;c.globalAlpha=.8;c.beginPath();c.arc(x,y,20*z,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
        if(s.hp<s.maxHp||!enemy){const width=enemy?14:18;c.fillStyle='#182d2baa';c.fillRect(x-width/2,y+size*.45,width,2);c.fillStyle=enemy?P.coral:'#9ec79a';c.fillRect(x-width/2,y+size*.45,width*Math.max(0,s.hp/s.maxHp),2);}
        if(s.name)this.label(c,s.name,x,y-size*.65,P.coral);
      };
      for(const e of g.enemies)if(e.hp>0)drawShip(e,true);for(const f of g.fleet)drawShip(f,false);drawShip(p,false);
      for(const b of g.bullets){const x=sx(b.x),y=sy(b.y);if(x<0||x>w||y<0||y>h)continue;c.strokeStyle=b.hostile?'#d8a084':'#e5d8a7';c.lineWidth=b.hostile?2:1;c.beginPath();c.moveTo(x,y);c.lineTo(x-b.vx*.018*z,y-b.vy*.018*z);c.stroke();}
      for(const e of g.effects){const x=sx(e.x),y=sy(e.y),r=(1-e.t/e.max)*e.size*z;c.globalAlpha=e.t/e.max;c.fillStyle=P.gold;for(let i=0;i<8;i++)c.fillRect(x+Math.cos(i)*r-2,y+Math.sin(i)*r-2,4,4);c.fillStyle=P.coral;c.fillRect(x-3,y-3,6,6);c.globalAlpha=1;}
      // Day cycles dim gently; ports remain legible and the sun never blocks combat.
      const night=Math.max(0,Math.sin(g.s.seconds/90))*0.13;if(night){c.fillStyle='rgba(15,28,35,'+night+')';c.fillRect(0,0,w,h);}
      c.restore();
    }
    label(c,text,x,y,color){c.font='7px "Commit Mono", monospace';c.textAlign='center';c.fillStyle='#182d2bd9';const width=c.measureText(text).width;c.fillRect(x-width/2-3,y-7,width+6,11);c.fillStyle=color;c.fillText(text,Math.round(x),Math.round(y));}
    chart(cv,selected,mini=false){const c=cv.getContext('2d'),w=cv.width,h=cv.height,g=this.game; c.imageSmoothingEnabled=false;c.fillStyle='#263f38';c.fillRect(0,0,w,h);
      const z=mini?.0035:w/W.W,cam=mini?g.player:{x:W.W/2,y:W.H/2};this.land(c,cam,z,w,h,true);
      const sx=x=>mini?w/2+W.dx(cam.x,x)*z:x/W.W*w,sy=y=>mini?h/2+(y-cam.y)*z:y/W.H*h;
      if(!mini){c.strokeStyle='#aab39417';c.lineWidth=1;for(let lon=30;lon<360;lon+=30){const x=lon/360*w;c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let lat=30;lat<180;lat+=30){const y=lat/180*h;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
        c.fillStyle='#b8b2a244';c.font='italic 14px century_supra_a, serif';c.textAlign='center';c.fillText('Pacific Ocean',w*.18,h*.55);c.fillText('Atlantic Ocean',w*.42,h*.53);c.fillText('Indian Ocean',w*.72,h*.65);
      }
      for(const site of g.sites){const x=sx(site.x),y=sy(site.y);c.fillStyle=site.type==='fish'?P.blue:'#a4a293';c.fillRect(x-2,y-2,4,4);}
      for(const b of g.bossSites)if(!g.s.bosses.includes(b.id)){const x=sx(b.x),y=sy(b.y);c.strokeStyle=P.coral;c.beginPath();c.moveTo(x-4,y-4);c.lineTo(x+4,y+4);c.moveTo(x+4,y-4);c.lineTo(x-4,y+4);c.stroke();}
      for(const p of g.ports){const x=sx(p.x),y=sy(p.y);c.fillStyle=g.s.visits.includes(p.id)?P.gold:'#c9c1a1';c.fillRect(x-2,y-2,mini?3:5,mini?3:5);if(!mini&&['havana','rio','cape-town','yokohama','sydney','honolulu','reykjavik','mumbai'].includes(p.id)){c.font='9px "Commit Mono", monospace';c.textAlign='left';c.fillStyle=P.cream;c.fillText(p.name,x+5,y-5);}}
      if(selected){const x=sx(selected.x),y=sy(selected.y);c.strokeStyle=P.gold;c.lineWidth=1;c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.stroke();if(!mini){c.font='10px "Commit Mono", monospace';c.textAlign=x>w*.7?'right':'left';c.fillStyle=P.gold;c.fillText(selected.name||'Waypoint',x+(x>w*.7?-12:12),y+12);}}
      if(g.route.length){c.strokeStyle='#dfc28899';c.lineWidth=1;c.setLineDash([3,3]);let prev=g.player;c.beginPath();c.moveTo(sx(prev.x),sy(prev.y));for(const q of g.route){if(Math.abs(q.x-prev.x)>W.W/2)c.moveTo(sx(q.x),sy(q.y));else c.lineTo(sx(q.x),sy(q.y));prev=q;}c.stroke();c.setLineDash([]);}
      const px=sx(g.player.x),py=sy(g.player.y);c.fillStyle=P.cream;poly(c,[[px,py-5],[px-4,py+4],[px+4,py+4]],P.cream);c.strokeStyle=P.ink;c.strokeRect(px-1,py-1,2,2);
    }
  }
  root.WidewakeRender={Renderer,shipSprite,icon,harbor,harborBase,harborStyles};
})(globalThis);
