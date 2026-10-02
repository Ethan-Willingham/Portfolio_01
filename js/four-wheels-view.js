/* All Four Wheels: a shared high-angle isometric pixel renderer.
 * The simulation stays in store coordinates. Every visible floor point,
 * caster, body, piece of furniture and airborne product uses this camera.
 */
(function (root) {
  'use strict';
  const TerrainModule=typeof module!=='undefined'&&module.exports?require('./four-wheels-terrain.js'):root.CartTerrain;
  // A roughly 52-degree pitch opens the basket and floor while retaining height.
  const CAMERA = Object.freeze({ width:720, height:580, x:290, y:24, horizontal:.84, vertical:.66, elevation:.74 });
  const VIEW_Z = CAMERA.vertical * 2 / CAMERA.elevation;
  const project = (p, origin = CAMERA) => ({ x:origin.x + (p.x-p.y)*CAMERA.horizontal, y:origin.y + (p.x+p.y)*CAMERA.vertical - (p.z||0)*CAMERA.elevation });
  function unproject(p, z=0, origin=CAMERA) {
    const difference=(p.x-origin.x)/CAMERA.horizontal, sum=(p.y-origin.y+z*CAMERA.elevation)/CAMERA.vertical;
    return {x:(sum+difference)/2,y:(sum-difference)/2,z};
  }
  const depth = p => p.x+p.y+(p.z||0)*VIEW_Z;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const add = (p,x=0,y=0,z=0) => ({x:p.x+x,y:p.y+y,z:(p.z||0)+z});
  const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)});
  const normalize = p => {const n=Math.hypot(p.x,p.y,p.z)||1;return {x:p.x/n,y:p.y/n,z:p.z/n};};
  function local(b,x,y,z=0) {
    if(b.comHeight)return TerrainModule.kinematics(b,x,y,z).p;
    const c=Math.cos(b.a||0),s=Math.sin(b.a||0);
    if(b.pitch||b.rollTilt){const cp=Math.cos(b.pitch||0),sp=Math.sin(b.pitch||0),cr=Math.cos(b.rollTilt||0),sr=Math.sin(b.rollTilt||0),xx=x*cp+z*sp,zz=z*cp-x*sp;z=zz*cr+y*sr;y=y*cr-zz*sr;x=xx;}
    return {x:b.x+x*c-y*s,y:b.y+x*s+y*c,z:(b.z||0)+z};
  }
  function hash(x,y) {
    let v=Math.imul(x,73856093)^Math.imul(y,19349663);
    v=Math.imul(v^(v>>>16),0x7feb352d);v=Math.imul(v^(v>>>15),0x846ca68b);
    return ((v^(v>>>16))>>>0)/4294967296;
  }
  function rect(g,x,y,w,h,color) {g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function poly(g,points,color) {
    if(points.length<3)return;
    const t=g.getTransform(),left=-t.e/t.a,right=(g.canvas.width-t.e)/t.a,top=-t.f/t.d,bottom=(g.canvas.height-t.f)/t.d;
    const low=Math.max(Math.floor(top),Math.floor(Math.min(...points.map(p=>p.y)))),high=Math.min(Math.ceil(bottom),Math.ceil(Math.max(...points.map(p=>p.y))));
    g.fillStyle=color;
    for(let y=low;y<high;y++) {
      const cuts=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if((a.y<=y+.5&&b.y>y+.5)||(b.y<=y+.5&&a.y>y+.5))cuts.push(a.x+(y+.5-a.y)*(b.x-a.x)/(b.y-a.y));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i+=2) {
        const x=Math.max(Math.floor(left),Math.round(cuts[i])),end=Math.min(Math.ceil(right),Math.round(cuts[i+1]));
        if(end>x)g.fillRect(x,y,end-x,1);
      }
    }
  }
  function line(g,a,b,color,width=1) {
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))));
    let row=Math.round(a.y),left=Math.round(a.x),right=left;
    g.fillStyle=color;
    const draw=()=>g.fillRect(left-Math.floor(width/2),row-Math.floor(width/2),right-left+width,width);
    for(let i=1;i<=n;i++) {
      const x=Math.round(a.x+(b.x-a.x)*i/n),y=Math.round(a.y+(b.y-a.y)*i/n);
      if(y!==row){draw();row=y;left=right=x;}else{left=Math.min(left,x);right=Math.max(right,x);}
    }
    draw();
  }
  function oval(g,x,y,rx,ry,color) {
    g.fillStyle=color;
    for(let yy=-Math.ceil(ry);yy<=ry;yy++) {
      const w=Math.round(rx*Math.sqrt(Math.max(0,1-yy*yy/(ry*ry))));
      if(w>0)g.fillRect(Math.round(x)-w,Math.round(y)+yy,w*2,1);
    }
  }
  function text(g,value,x,y,color,size=7,align='left') {
    g.fillStyle=color;g.font='bold '+size+'px "Commit Mono"';g.textAlign=align;g.fillText(value,Math.round(x),Math.round(y));
  }
  const circle = (p,rx,ry=rx,z=0,count=32) => Array.from({length:count},(_,i)=>add(p,Math.cos(i*Math.PI*2/count)*rx,Math.sin(i*Math.PI*2/count)*ry,z));
  const quad = (x,y,w,h,z=0) => [{x,y,z},{x:x+w,y,z},{x:x+w,y:y+h,z},{x,y:y+h,z}];
  const faces = [
    [[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,4,7,3],[-1,0,0]],
    [[1,2,6,5],[1,0,0]],[[0,1,5,4],[0,-1,0]],[[3,7,6,2],[0,1,0]]
  ];
  function create(P) {
    const Physics=root.CartPhysics,Stock=root.CartStock,Terrain=TerrainModule;
    let terrainLevel=null;
    const onGround=p=>({...p,z:terrainLevel?Terrain.height(terrainLevel,p):(p.z||0),surface:!!terrainLevel});
    if(!Physics||!Stock)throw new Error('The cart view needs the cart simulation.');
    const {BODY,WHEELS,CASTER,CHECKPOINT_RADIUS,casterPose,casterCorners,corners,ROOM}=Physics;
    const swatches=[P.coral,P.blue,P.gold,P.sage,P.clay,P.purple];
    const colors=new Map(),tints=new Map(),textures=new Map();
    function rgb(color) {
      if(!colors.has(color)) {
        const c=document.createElement('canvas');c.width=c.height=1;
        const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,1,1);colors.set(color,[...g.getImageData(0,0,1,1).data].slice(0,3));
      }
      return colors.get(color);
    }
    function blend(a,b,t) {
      const key=a+'|'+b+'|'+Math.round(t*64);
      if(!tints.has(key)){const x=rgb(a),y=rgb(b);tints.set(key,'rgb('+x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(',')+')');}
      return tints.get(key);
    }
    function shade(color,n) {
      const light=clamp(-n.x*.35-n.y*.45+n.z*.82,0,1);
      return blend(color,P.dark,.1+(1-light)*.32);
    }
    const spillColor = kind => kind==='wine'?P.purple:kind==='ketchup'?P.brick:kind==='oil'?P.gold:kind==='soil'?P.hairDark:P.blue;
    function labelTexture(value,width,height=7) {
      const key=value+'|'+width+'|'+height;
      if(!textures.has(key)) {
        const c=document.createElement('canvas');c.width=Math.ceil(width);c.height=height;
        const g=c.getContext('2d');rect(g,0,0,c.width,height,P.cream);
        text(g,value,c.width/2,height-2,P.hairDark,Math.min(6,c.width/Math.max(1,value.length)*1.55),'center');textures.set(key,c);
      }
      return textures.get(key);
    }
    class Scene {
      constructor(opacity=1){this.commands=[];this.sequence=0;this.opacity=opacity;}
      push(points,draw,bias=0,mesh=null) {
        this.commands.push({depth:points.reduce((n,p)=>n+depth(p),0)/points.length+bias,order:this.sequence++,draw,mesh});
      }
      face(points,color,alpha=1,detail=null,edges=false) {
        alpha*=this.opacity;
        const n=normalize(cross(subtract(points[1],points[0]),subtract(points[2],points[0])));
        if(n.x+n.y+n.z*VIEW_Z<=.005)return;
        const tint=shade(color,n);
        this.push(points,(g,origin)=>{
          g.globalAlpha=alpha;const q=points.map(p=>project(p,origin));poly(g,q,tint);
          if(edges){g.globalAlpha=alpha*.3;for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],n.z>.6?P.cream:P.dark);}
          g.globalAlpha=1;if(detail)detail(g,q,origin);
        },0,{kind:'face',points,color:tint,alpha});
      }
      flat(points,color,alpha=1,bias=0) {
        alpha*=this.opacity;
        this.push(points,(g,origin)=>{g.globalAlpha=alpha;poly(g,points.map(p=>project(p,origin)),color);g.globalAlpha=1;},bias,{kind:'face',points,color,alpha});
      }
      wire(a,b,color=P.steel,width=1,alpha=1) {
        if(this.rigid&&width>=2){this.tube(a,b,width*.48,width*.48,color);return;}
        alpha*=this.opacity;
        this.push([a,b],(g,origin)=>{g.globalAlpha=alpha;line(g,project(a,origin),project(b,origin),color,width);g.globalAlpha=1;},.04,{kind:'wire',points:[a,b],color,width,alpha});
      }
      box(transform,x,y,z,w,h,d,color,top=color,edges=false) {
        const p=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]].map(v=>transform(...v));
        for(let i=0;i<faces.length;i++)this.face(faces[i][0].map(j=>p[j]),i===1?top:color,1,null,edges);
      }
      texture(points,texture) {
        this.face(points,P.cream,1,(g,q)=>{
          const a=q[0],b=q[1],d=q[3];g.save();g.imageSmoothingEnabled=false;
          g.transform((b.x-a.x)/texture.width,(b.y-a.y)/texture.width,(d.x-a.x)/texture.height,(d.y-a.y)/texture.height,a.x,a.y);
          g.drawImage(texture,0,0);g.restore();
        });
      }
      tube(a,b,width,endWidth,color,count=6) {
        const axis=normalize(subtract(b,a)),ref=Math.abs(axis.z)<.8?{x:0,y:0,z:1}:{x:1,y:0,z:0},u=normalize(cross(axis,ref)),v=cross(axis,u);
        const ring=(p,r)=>Array.from({length:count},(_,i)=>{const t=i*Math.PI*2/count;return add(p,r*(u.x*Math.cos(t)+v.x*Math.sin(t)),r*(u.y*Math.cos(t)+v.y*Math.sin(t)),r*(u.z*Math.cos(t)+v.z*Math.sin(t)));});
        const first=ring(a,width),last=ring(b,endWidth);
        for(let i=0;i<count;i++)this.face([first[i],first[(i+1)%count],last[(i+1)%count],last[i]],color);
        this.face(first.slice().reverse(),color);this.face(last,color);
      }
      limb(a,b,width,endWidth,color) {this.tube(a,b,width/2,endWidth/2,color,7);}
      // A small object raster has a real per-pixel depth buffer. Rim tubes,
      // tires, spokes, legs and the wire basket occlude each other at their
      // actual 3D depth, even when the whole cart is sideways or upside down.
      rasterInto(scene) {
        const commands=this.commands.filter(q=>q.mesh),points=commands.flatMap(q=>q.mesh.points),screen=points.map(p=>project(p));
        const x=Math.floor(Math.min(...screen.map(p=>p.x)))-3,y=Math.floor(Math.min(...screen.map(p=>p.y)))-3,width=Math.ceil(Math.max(...screen.map(p=>p.x)))-x+4,height=Math.ceil(Math.max(...screen.map(p=>p.y)))-y+4;
        if(width>400||height>400)return this.commands.forEach(q=>scene.commands.push(q));
        const tile=document.createElement('canvas');tile.width=width;tile.height=height;const g=tile.getContext('2d'),im=g.createImageData(width,height),zbuffer=new Float32Array(width*height);zbuffer.fill(-Infinity);
        const pixel=(px,py,z,color,alpha,write)=>{if(px<0||py<0||px>=width||py>=height)return;const key=py*width+px;if(z<zbuffer[key]-.045)return;const k=key*4,c=rgb(color),a=im.data[k+3]/255,out=alpha+a*(1-alpha);for(let j=0;j<3;j++)im.data[k+j]=(c[j]*alpha+im.data[k+j]*a*(1-alpha))/out;im.data[k+3]=out*255;if(write)zbuffer[key]=z;};
        const vertex=p=>({...project(p),d:depth(p)});
        const triangle=(a,b,c,color,alpha,write)=>{const denominator=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(denominator)<.001)return;
          const left=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)-x)),right=Math.min(width-1,Math.ceil(Math.max(a.x,b.x,c.x)-x)),top=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)-y)),bottom=Math.min(height-1,Math.ceil(Math.max(a.y,b.y,c.y)-y));
          for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){const X=x+px+.5,Y=y+py+.5,u=((b.y-c.y)*(X-c.x)+(c.x-b.x)*(Y-c.y))/denominator,v=((c.y-a.y)*(X-c.x)+(a.x-c.x)*(Y-c.y))/denominator,t=1-u-v;if(u>=-1e-7&&v>=-1e-7&&t>=-1e-7)pixel(px,py,u*a.d+v*b.d+t*c.d,color,alpha,write);}
        };
        const paint=(q,write)=>{const m=q.mesh,v=m.points.map(vertex);if(m.kind==='face'){for(let i=1;i<v.length-1;i++)triangle(v[0],v[i],v[i+1],m.color,m.alpha,write);}else{const a=v[0],b=v[1],steps=Math.max(1,Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))));for(let i=0;i<=steps;i++){const t=i/steps;pixel(Math.round(a.x+(b.x-a.x)*t-x),Math.round(a.y+(b.y-a.y)*t-y),a.d+(b.d-a.d)*t,m.color,m.alpha,write);}}};
        for(const q of commands)if(q.mesh.alpha>=.99)paint(q,true);
        commands.sort((a,b)=>a.depth-b.depth);for(const q of commands)if(q.mesh.alpha<.99)paint(q,false);
        g.putImageData(im,0,0);scene.push(points,(target,origin)=>{target.drawImage(tile,x+(origin.x-CAMERA.x),y+(origin.y-CAMERA.y));});
      }
      flush(g,origin=CAMERA) {
        this.commands.sort((a,b)=>a.depth-b.depth||a.order-b.order);
        for(const command of this.commands)command.draw(g,origin);
        g.globalAlpha=1;
      }
    }
    function groundPoly(g,points,color,alpha=1) {
      g.globalAlpha=alpha;poly(g,points.map(p=>project(p)),color);g.globalAlpha=1;
    }
    function groundLine(g,a,b,color,width=1,alpha=1) {
      g.globalAlpha=alpha;line(g,project(terrainLevel&&a.z===undefined?onGround(a):a),project(terrainLevel&&b.z===undefined?onGround(b):b),color,width);g.globalAlpha=1;
    }
    function groundLocal(g,b,x,y,w,h,color,alpha=1) {groundPoly(g,quad(x,y,w,h).map(p=>local(b,p.x,p.y)).map(p=>b.surface?onGround(p):p),color,alpha);}
    function groundRing(g,p,r,color,width=1,alpha=1) {
      const q=circle(p,r).map(v=>project(p.surface?onGround(v):v));g.globalAlpha=alpha;
      for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],color,width);g.globalAlpha=1;
    }
    function groundArrow(g,b,length,color,alpha=1) {
      groundLocal(g,b,-length/2,-1.2,length-5,2.4,color,alpha);
      groundPoly(g,[[length/2,0],[length/2-8,-5],[length/2-8,5]].map(p=>local(b,...p)).map(p=>b.surface?onGround(p):p),color,alpha);
    }
    function floorTexture(g,level) {
      const accent=P[level.theme]||P.gold,base=blend(accent,P.cream,.36),grout=blend(accent,P.hairDark,.28);
      groundPoly(g,quad(8,8,464,284),grout);
      // Deterministic terrazzo, laid in the same plane as the physical floor.
      for(let row=0,y=8;y<292;row++,y+=24)for(let col=0,x=8;x<472;col++,x+=24) {
        const seed=col*137+row*911,v=hash(seed,41),w=Math.min(23,472-x),h=Math.min(23,292-y);
        const tint=blend(base,v>.58?P.light:accent,.08+v*.12);
        groundPoly(g,quad(x+.7,y+.7,w-1,h-1),tint);
        groundLine(g,{x:x+1,y:y+1},{x:x+w-1,y:y+1},P.light,1,.35);
        groundLine(g,{x:x+1,y:y+1},{x:x+1,y:y+h-1},P.light,1,.25);
        groundLine(g,{x:x+w,y:y+1},{x:x+w,y:y+h},P.edge,1,.12);
        for(let chip=0;chip<10;chip++) {
          const cx=x+2+hash(seed+chip*47,83)*(w-4),cy=y+2+hash(seed+chip*59,137)*(h-4),q=hash(seed+chip*71,193);
          const p=project({x:cx,y:cy});g.globalAlpha=q>.8?.28:.18;
          rect(g,p.x,p.y,q>.72?2:1,1,chip%3===0?P.hairDark:chip%3===1?P.light:P.gold);
        }
        g.globalAlpha=1;
        if(v>.82&&w>12&&h>12)groundLine(g,{x:x+5,y:y+9},{x:x+11,y:y+7},P.hairDark,1,.17);
      }
      // Wall ambient shade, baked into the floor rather than painted on props.
      for(let i=0;i<6;i++) {
        groundPoly(g,quad(8+i,8,1,284),P.hairDark,(6-i)*.018);
        groundPoly(g,quad(8,8+i,464,1),P.hairDark,(6-i)*.018);
      }
      if(level.puddle) {
        const p=level.puddle;groundPoly(g,circle(p,p.rx+2,p.ry+2),P.dark,.12);
        groundPoly(g,circle(p,p.rx,p.ry),P.blue,.34);
        for(let i=0;i<10;i++) {
          const x=p.x+(hash(i,1)-.5)*p.rx*1.4,y=p.y+(hash(i,3)-.5)*p.ry*1.2;
          groundLine(g,{x,y},{x:x+8,y:y-3},P.light,1,.55);
        }
      }
      groundArrow(g,level.start,28,P.light,.55);
    }
    function exitApron(g,e) {
      groundLocal(g,e,-5,-e.width/2,64,e.width,blend(P.floor,P.cream,.25));
      for(let u=8;u<60;u+=12)groundLocal(g,e,u,-e.width/2,1,e.width,P.seam,.5);
      groundLocal(g,e,3,-e.width/2,2,e.width,P.steelShade);
      groundLocal(g,e,5,-e.width/2,1,e.width,P.light);
    }
    function wallRuns(level,side) {
      const end=side==='left'||side==='right'?292:472,exit=Physics.exitGeometry(level.exit);
      const gaps=level.openings?.[side]||[...(exit.side===side?[[exit.low,exit.high]]:[]),...(level.cliffs||[]).filter(c=>c.side===side).map(c=>[c.low,c.high])];
      const runs=[];let cursor=8;
      for(const [a,b]of [...gaps].sort((a,b)=>a[0]-b[0])){if(a>cursor)runs.push([cursor,a]);cursor=Math.max(cursor,b);}
      if(cursor<end)runs.push([cursor,end]);return runs;
    }
    function hazards(g,level) {
      for(const h of level.hazards||[]) {
        const bank=blend(P.pine,P.hairDark,.22),deep=blend(P.blue,P.dark,.36);
        groundPoly(g,circle(h,h.rx+4,h.ry+4),bank);
        groundPoly(g,circle(h,h.rx+1,h.ry+1),P.steelShade);
        groundPoly(g,circle(h,h.rx,h.ry,-7),deep);
        groundPoly(g,circle(h,h.rx-3,h.ry-3,-6),P.blue);
        groundPoly(g,circle(add(h,7,4),h.rx*.68,h.ry*.62,-6),blend(P.blue,P.pine,.24));
        groundRing(g,h,1,P.blue);
        for(let i=0;i<25;i++) {
          const x=h.x+(hash(i,831)-.5)*h.rx*1.7,y=h.y+(hash(i,191)-.5)*h.ry*1.5;
          if(((x-h.x)/h.rx)**2+((y-h.y)/h.ry)**2>.75)continue;
          groundLine(g,{x,y,z:-6},{x:x+5+i%5,y:y-2,z:-6},i%3?P.light:deep,1,.55);
        }
        for(let i=0;i<12;i++) {
          const a=i*Math.PI*2/12,q={x:h.x+Math.cos(a)*(h.rx+5),y:h.y+Math.sin(a)*(h.ry+5)};
          groundPoly(g,circle(q,2.4,1.9),i%3?P.sage:P.clay);
          if(i%3===0)for(const v of [-1,1])groundLine(g,{...q},{x:q.x+v*2,y:q.y,z:7},P.pine,1);
        }
        const q=project({...h,z:-6});text(g,'DEEP WATER',q.x,q.y+4,deep,6,'center');
      }
      for(const c of level.cliffs||[]) {
        const vertical=c.side==='left'||c.side==='right',axis=vertical?(c.side==='left'?8:472):(c.side==='top'?8:292);
        const a=vertical?{x:axis,y:c.low}:{x:c.low,y:axis},b=vertical?{x:axis,y:c.high}:{x:c.high,y:axis};
        for(let z=-32;z<0;z+=7)groundLine(g,{...a,z},{...b,z},z%2?P.hair:blend(P.clay,P.hairDark,.4),3);
        for(let u=c.low;u<c.high;u+=10) {
          const x=vertical?axis+(c.side==='left'?1:-7):u,y=vertical?u:axis+(c.side==='top'?1:-7);
          groundPoly(g,quad(x,y,vertical?6:9,vertical?9:6),Math.floor(u/10)%2?P.gold:P.hairDark);
        }
        const q=project(vertical?{x:axis-15,y:(c.low+c.high)/2}:{x:(c.low+c.high)/2,y:axis-15});text(g,'DROP',q.x,q.y,P.hairDark,6,'center');
      }
    }
    function room(scene,level) {
      const tr=(x,y,z)=>({x,y,z});
      const exit=Physics.exitGeometry(level.exit),front=blend(P.floor,P.hairDark,.37);
      scene.box(tr,8,8,-32,464,284,32,front,P[level.theme]||P.floor,true);
      for(const side of ['top','left','right','bottom']) {
        const vertical=side==='left'||side==='right',far=side==='top'||side==='left',height=far?23:2;
        const start=vertical?8:8,end=vertical?292:472;
        const runs=wallRuns(level,side);
        for(const [a,b]of runs) {
          if(b<=a)continue;
          const x=vertical?(side==='left'?5:472):a,y=vertical?a:(side==='top'?5:292),w=vertical?3:b-a,h=vertical?b-a:3;
          scene.box(tr,x,y,0,w,h,height,blend(P[level.theme]||P.floor,P.hairDark,.18),P[level.theme]||P.cream,true);
          scene.box(tr,x,y,0,w,h,2,P.steelShade,P.steel);
          if(far)scene.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.38),P.cream);
        }
      }
    }
    function makeFloor(level,transparent=false) {
      if(level.campaign)return {course:true,tiles:new Map()};
      if(level.connected)return {rooms:level.rooms.map(r=>({room:r,canvas:makeFloor(r,true)}))};
      const c=document.createElement('canvas');c.width=CAMERA.width;c.height=CAMERA.height;const g=c.getContext('2d');
      const matte=blend(P.hairDark,P.edge,.48);if(!transparent)rect(g,0,0,c.width,c.height,matte);
      // A broad contact shadow makes the cutaway store feel like a solid diorama.
      groundPoly(g,quad(8,8,464,284,-11),P.dark,.3);
      const shell=new Scene();room(shell,level);shell.flush(g);
      floorTexture(g,level);hazards(g,level);if(!level.openings)exitApron(g,Physics.exitGeometry(level.exit));
      // Render far walls after the tiles, so their feet meet the grout cleanly.
      const walls=new Scene();
      const exit=Physics.exitGeometry(level.exit),tr=(x,y,z)=>({x,y,z});
      for(const side of ['top','left']) {
        const vertical=side==='left',end=vertical?292:472,runs=wallRuns(level,side);
        for(const [a,b]of runs) {
          const x=vertical?5:a,y=vertical?a:5,w=vertical?3:b-a,h=vertical?b-a:3;
          if(w<=0||h<=0)continue;
          walls.box(tr,x,y,0,w,h,23,blend(P[level.theme]||P.floor,P.hairDark,.2),P[level.theme]||P.cream,true);walls.box(tr,x,y,0,w,h,3,P.steelShade,P.steel);
          walls.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.35),P.cream);
        }
      }
      walls.flush(g);
      for(const sign of level.signs) {
        const p=project(sign);text(g,sign.text,p.x,p.y,P.edge,5,'center');
      }
      const badge=project({x:235,y:30});text(g,level.name.toUpperCase(),badge.x,badge.y,P.hairDark,7,'center');
      return c;
    }
    function furnitureVertices(s) {
      return [[-s.w/2,-s.h/2],[s.w/2,-s.h/2],[s.w/2,s.h/2],[-s.w/2,s.h/2]].flatMap(([u,v])=>[Stock.shelfPoint(s,u,v,0),Stock.shelfPoint(s,u,v,s.height)]);
    }
    function clipFloor(g,w) {
      g.beginPath();
      const areas=w?.level.campaign?root.CartCourse.query(w.level.floorAreas,w.level.floorGrid,w.body,600):w?.level.floorAreas||[{x:8,y:8,w:464,h:284}];
      for(const area of areas){const p=(area.poly||quad(area.x,area.y,area.w,area.h)).map(v=>project(v));g.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))g.lineTo(q.x,q.y);g.closePath();}
      g.clip();
    }
    function drawFurnitureShadow(g,s,w) {
      g.save();if(!w?._shadowClipped)clipFloor(g,w);
      const points=Stock.hull(furnitureVertices(s).map(p=>({x:p.x+p.z*.42,y:p.y+p.z*.3,z:0})));
      groundPoly(g,points.map(p=>add(p,2,2)),P.dark,.07);groundPoly(g,points,P.dark,.2);g.restore();
    }
    function shelf(scene,s) {
      const tr=(x,y,z)=>Stock.shelfPoint(s,x,y,z),box=(...args)=>scene.box(tr,...args),accent=P[s.theme]||P.gold;
      if(s.kind==='table') {
        for(const u of [-s.w*.4,s.w*.4])for(const v of [-s.h*.4,s.h*.4])box(u-1.5,v-1.5,0,3,3,s.height-3,P.clay,P.gold,true);
        box(-s.w/2+1,-s.h/2+2,s.height-7,s.w-2,2,4,P.clay);
        box(-s.w/2+2,-s.h/2+1,s.height-7,2,s.h-2,4,P.clay);
        box(-s.w/2,-s.h/2,s.height-3,s.w,s.h,3,P.clay,P.gold,true);
        for(let v=-s.h/2+7;v<s.h/2-2;v+=7)scene.wire(tr(-s.w/2+2,v,s.height+.03),tr(s.w/2-2,v,s.height+.03),P.hair,1,.16);
      }else{
        // Open end frames leave each solid deck and the stocked tiers visible.
        for(const u of [-s.w/2+1,s.w/2-3])for(const z of [3,s.height-5])box(u,-s.h/2+1,z,2,s.h-2,3,P.steel,P.steelLight);
        box(-s.w/2+3,-s.h/2+1,5,s.w-6,2,s.height-8,blend(accent,P.hairDark,.28),accent,true);
        for(const z of [12,22,32]) {
          box(-s.w/2+2,-s.h/2+2,z-2,s.w-4,s.h-4,2,blend(accent,P.hairDark,.22),blend(accent,P.cream,.18),true);
          for(let v=-s.h/2+9;v<s.h/2-3;v+=12)scene.wire(tr(-s.w/2+3,v,z+.03),tr(s.w/2-3,v,z+.03),P.hair,1,.14);
        }
        for(const u of [-s.w/2+1,s.w/2-1])for(const v of [-s.h/2+1,s.h/2-1]) {
          box(u-1,v-1,0,2,2,s.height,P.steel,P.steelLight,true);box(u-2,v-2,0,4,4,2,P.steelShade,P.steel);
          for(let z=8;z<s.height-2;z+=6)scene.wire(tr(u+1.05,v,z),tr(u+1.05,v,z+1),P.dark,1,.55);
        }
        const along=s.h>s.w,length=Math.min(68,(along?s.h:s.w)-10),z=s.height-3;
        const points=along?[tr(s.w/2+.05,-length/2,z),tr(s.w/2+.05,length/2,z),tr(s.w/2+.05,length/2,z-6),tr(s.w/2+.05,-length/2,z-6)]:[tr(length/2,s.h/2+.05,z),tr(-length/2,s.h/2+.05,z),tr(-length/2,s.h/2+.05,z-6),tr(length/2,s.h/2+.05,z-6)];
        scene.texture(points,labelTexture(s.label||'STOCK',length,6));
      }
    }
    function productTransform(p) {
      const c=Math.cos(p.a),s=Math.sin(p.a);
      if(p.state==='shelf')return (x,y,z)=>Stock.shelfPoint(p.shelf,p.u+x*c-y*s,p.v+x*s+y*c,p.tier+z);
      if(p.state==='floor'&&['towel','plate','carton'].includes(p.kind))return (x,y,z)=>local(p,x,y,z);
      const t=p.state==='floor'?Math.PI/2:p.tumble;
      const heights={vase:9,wine:10,ketchup:8,jar:5.6,can:5.6,plate:1,pot:6,towel:2,carton:7};
      const half=(heights[p.kind]||0)/2,ct=Math.cos(t),st=Math.sin(t),raise=p.state==='floor'?p.width:half;
      return (x,y,z)=>({x:p.x+(x*ct+(z-half)*st)*c-y*s,y:p.y+(x*ct+(z-half)*st)*s+y*c,z:p.z+raise-x*st+(z-half)*ct});
    }
    function cylinder(scene,tr,radii,color,caps=true,alpha=1) {
      const count=8,rings=radii.map(([z,r])=>Array.from({length:count},(_,i)=>tr(r*Math.cos(i*Math.PI*2/count),r*Math.sin(i*Math.PI*2/count),z)));
      for(let k=0;k<rings.length-1;k++)for(let i=0;i<count;i++)scene.face([rings[k][i],rings[k][(i+1)%count],rings[k+1][(i+1)%count],rings[k+1][i]],color,alpha);
      if(caps)scene.face(rings.at(-1),color,alpha);
      return rings;
    }
    function product(scene,p) {
      const tr=productTransform(p),color=swatches[(p.color||0)%swatches.length],box=(...q)=>scene.box(tr,...q);
      if(p.kind==='shard') {
        const b={x:p.x,y:p.y,z:Math.max(.15,p.z),a:p.a},tint=p.material==='ceramic'?P.cream:p.material==='terracotta'?P.clay:p.source==='wine'?P.sage:P.steelLight;
        scene.flat([local(b,-p.length,-p.width),local(b,p.length,0),local(b,-p.length*.4,p.width)],tint,p.material==='glass'?.8:1);
        scene.wire(local(b,-p.length,-p.width),local(b,p.length,0),P.light,1,.6);return;
      }
      if(p.flat) {
        const flat=(x,y,z)=>local({...p,z:Math.max(0,p.z)},x,y,z);
        scene.box(flat,-p.length,-p.width,0,p.length*2,p.width*2,.8,P.brick,P.coral);
        scene.box(flat,-2,-1,.82,3,2,.1,P.cream);
        scene.box(flat,p.length-1,-.6,0,1.8,1.2,1,P.light);
        return;
      }
      if(p.kind==='wine'||p.kind==='ketchup') {
        const wine=p.kind==='wine',tint=wine?P.pine:P.brick,r=wine?1.7:2.1,neck=wine?9:7;
        cylinder(scene,tr,[[0,r*.8],[1,r],[wine?6:5,r],[wine?7:6,.8],[neck,.8]],tint);
        cylinder(scene,tr,[[neck,.9],[neck+1,.9]],wine?P.gold:P.light);
        box(-r,-r,2,r*2,r*2,2.5,P.cream,P.cream);
        scene.wire(tr(r+.08,-.6,3),tr(r+.08,.6,3),p.kind==='wine'?P.purple:P.brick,1);
        scene.wire(tr(-r*.6,-r*.6,1),tr(-r*.6,-r*.6,6),p.kind==='wine'?P.sage:P.coral,1,.65);
      }else if(p.kind==='vase') {
        cylinder(scene,tr,[[0,2],[1,3.5],[4,4],[7,2.5],[9,1.6]],P.blue,false,.16);
        const rim=Array.from({length:16},(_,i)=>tr(1.8*Math.cos(i*Math.PI/8),1.8*Math.sin(i*Math.PI/8),9));
        for(let i=0;i<16;i++)scene.wire(rim[i],rim[(i+1)%16],P.steelLight,1,.85);
        const water=Array.from({length:12},(_,i)=>tr(3.5*Math.cos(i*Math.PI/6),3.5*Math.sin(i*Math.PI/6),4));scene.flat(water,P.blue,.16);
        scene.wire(tr(-2,-2,2),tr(-2,-2,6),P.light,1,.85);scene.wire(tr(3,0,1),tr(3,0,4),P.steelLight,1,.6);
      }else if(p.kind==='jar'||p.kind==='can') {
        cylinder(scene,tr,[[0,2.2],[5,2.2]],p.kind==='jar'?P.pine:color);
        cylinder(scene,tr,[[5,2.3],[5.6,2.3]],p.kind==='jar'?P.gold:P.steelLight);
        box(-2.22,-2.22,1.2,4.44,4.44,2.5,P.cream);scene.wire(tr(2.3,-.5,2),tr(2.3,.5,2),color,1);
      }else if(p.kind==='plate') {
        cylinder(scene,tr,[[0,3.8],[.7,4],[1,3.2]],P.cream);
        scene.flat(Array.from({length:12},(_,i)=>tr(2*Math.cos(i*Math.PI/6),2*Math.sin(i*Math.PI/6),1.05)),color);
      }else if(p.kind==='pot') {
        cylinder(scene,tr,[[0,2.5],[5,3.6],[6,4]],P.clay);
        cylinder(scene,tr,[[6,3.3],[6.15,3.3]],P.hairDark);
        for(const [x,y,z]of [[-3,0,11],[2,2,10],[1,-3,12]]) {
          scene.wire(tr(0,0,6),tr(x,y,z),P.pine,1);
          scene.flat([tr(x-2,y,z-1),tr(x,y-1,z+2),tr(x+2,y,z),tr(x,y+1,z-2)],P.sage);
        }
      }else if(p.kind==='towel') {
        box(-4.5,-3,0,9,6,2,color,color,true);
        scene.wire(tr(-3.5,-2,2.1),tr(3.5,-2,2.1),P.cream,1,.85);scene.wire(tr(-3.5,2,2.1),tr(3.5,2,2.1),P.cream,1,.85);
      }else{
        box(-5,-3.5,0,10,7,7,P.clay,P.gold,true);
        box(-.7,-3.5,7.02,1.4,7,.1,P.cream);
        scene.flat([tr(5.03,-2,2),tr(5.03,1,2),tr(5.03,1,4),tr(5.03,-2,4)],P.cream);
      }
    }
    function prop(scene,o) {
      const tr=(x,y,z)=>local(o,x,y,z);
      if(o.kind==='box') {
        scene.box(tr,-8,-7,0,16,14,12,P.clay,P.gold,true);
        scene.box(tr,-1,-7,12.02,2,14,.1,P.cream);
        scene.wire(tr(-8,-7,6),tr(8,-7,6),P.hair,1,.3);
        scene.texture([tr(8.03,-4,9),tr(8.03,4,9),tr(8.03,4,5),tr(8.03,-4,5)],labelTexture('FRAGILE',8,4));
        return;
      }
      const coneTr=o.down?(x,y,z)=>tr(z-6,y,x+6):(x,y,z)=>tr(x,y,z);
      scene.box(coneTr,-6,-6,0,12,12,1.5,P.steelShade,P.edge,true);
      cylinder(scene,coneTr,[[1.5,4.8],[6,3],[9,2],[14,.4]],P.clay);
      cylinder(scene,coneTr,[[6,3.05],[8,2.35]],P.light,false);
    }
    function caster(scene,b,wheel,i) {
      const pose=casterPose(b,wheel,i),tr=(x,y,z)=>{
        if(b.comHeight)return Physics.casterPoint(b,wheel,i,x,y,z);
        const p=local(pose,x,y,z);if(!b.z&&!b.pitch&&!b.rollTilt)return p;
        const c=Math.cos(b.a),s=Math.sin(b.a),dx=p.x-b.x,dy=p.y-b.y;return local(b,dx*c+dy*s,-dx*s+dy*c,z);
      },count=12,l=CASTER.halfLength,h=CASTER.halfWidth;
      const rings=[-h,h].map(y=>Array.from({length:count},(_,j)=>tr(l*Math.cos(j*Math.PI*2/count),y,l+l*Math.sin(j*Math.PI*2/count))));
      for(let j=0;j<count;j++)scene.face([rings[0][j],rings[1][j],rings[1][(j+1)%count],rings[0][(j+1)%count]],P.dark);
      scene.face(rings[0],P.edge);scene.face(rings[1].slice().reverse(),P.edge);
      const phase=wheel.roll/l;
      for(let j=0;j<3;j++) {
        const a=phase+j*Math.PI*2/3,x=Math.cos(a),z=Math.sin(a);
        if((Math.cos(wheel.a)+Math.sin(wheel.a))*x+VIEW_Z*z>0)
          scene.wire(tr(l*x,-h,l+l*z),tr(l*x,h,l+l*z),P.mid,1,.45);
      }
      for(const side of [-h-.05,h+.05]) {
        const axle=tr(0,side,l),end=tr(Math.cos(phase)*2.5,side,l+Math.sin(phase)*2.5);
        scene.wire(axle,end,P.mid,1,.8);
        scene.wire(tr(-.6,side,l),tr(.6,side,l),P.steelLight,2);
      }
      if(wheel.coating) {
        const wet=Object.entries(wheel.coating).sort((a,b)=>b[1]-a[1])[0];
        if(wet&&wet[1]>.015)scene.wire(tr(-l+1,h+.08,l+1),tr(l-1,h+.08,l+1),spillColor(wet[0]),1,clamp(wet[1]*3,.2,.75));
      }
      for(const side of [-1,1]) {
        const axle=tr(0,side*(h+.5),l);
        const fork=tr(CASTER.trail,side*1.5,8);
        scene.wire(axle,fork,P.dark,3);scene.wire(axle,fork,P.steel,1);
      }
      const bearingRing=(r,z)=>Array.from({length:8},(_,j)=>local(b,WHEELS[i][0]+r*Math.cos(j*Math.PI/4),WHEELS[i][1]+r*Math.sin(j*Math.PI/4),z));
      scene.flat(bearingRing(1.6,9),P.steelShade);scene.flat(bearingRing(1.1,9.4),P.gold);
      scene.wire(local(b,...WHEELS[i],9.6),local(b,...WHEELS[i],11),P.steelLight);
    }
    function shopper(scene,b,gait) {
      if(b.shopper){articulatedShopper(scene,b,gait,b.shopper);return;}

      const phase=gait.phase||0,stride=gait.stride||0,forward=gait.forward??1,sideways=gait.sideways||0;
      const lx=gait.leanX||0,ly=gait.leanY||0,sway=Math.cos(phase)*Math.min(1,stride/2.8)*.25;
      const tr=(x,y,z)=>local(b,x,y,z);
      for(const side of [-1,1]) {
        const t=((phase/(Math.PI*2)+(side===1?.5:0))%1+1)%1,swing=Math.max(0,(t-.6)/.4);
        const reach=t<.6?1-t/.3:-1+2*swing*swing*(3-2*swing),lift=Math.sin(swing*Math.PI)*Math.min(1,stride/2.8)*4;
        const travel=reach*stride,x=-17+travel*forward,y=side*3.2+travel*sideways*.75;
        const sole=tr(x,y,lift),floor=terrainLevel?root.CartCourse.sample(terrainLevel,sole,false):null;if(floor&&Math.abs(sole.z-lift-floor.height)<6)sole.z=floor.height+lift;
        const hip=tr(-16,side*2.6,18),knee=tr(-17+travel*forward*.35+lift*.25,side*3+travel*sideways*.3,9+lift*.35),ankle={...sole,z:sole.z+2};
        scene.limb(hip,knee,3.4,2.8,P.steelShade,P.blue);scene.limb(knee,ankle,2.8,2,P.edge);
        const shoe={...sole,a:b.a+side*.12+clamp(sideways*.18,-.18,.18)},foot=(u,v,z)=>local(shoe,u,v,z);
        scene.box(foot,-2,-1.5,0,5.5,3,1,P.cream,P.steelLight);
        scene.box(foot,-1.7,-1.4,1,4.8,2.8,1.5,P.dark,P.steelShade);
        scene.wire(foot(.2,-.9,2.55),foot(.2,.9,2.55),P.steelLight,1,.8);
        scene.wire(foot(1.1,-.8,2.55),foot(1.1,.8,2.55),P.mid,1);
      }
      const bottom=[tr(-18,-3,18),tr(-13,-3,18),tr(-13,3,18),tr(-18,3,18)];
      const top=[tr(-17+lx,-5+ly+sway,30),tr(-13+lx,-5+ly+sway,30),tr(-13+lx,5+ly+sway,30),tr(-17+lx,5+ly+sway,30)];
      const torso=[...bottom,...top];
      for(const [indices]of faces)scene.face(indices.map(i=>torso[i]),P.brick,1,null,true);
      scene.wire(tr(-13+lx,-4+ly,30.05),tr(-13+lx,4+ly,30.05),P.coral,2);
      scene.wire(tr(-13,-3,19),tr(-13,3,19),P.hairDark,1,.45);
      for(const side of [-1,1]) {
        const shoulder=tr(-15+lx,side*5+ly,29),elbow=tr(-10.5+lx*.3,side*7.5+ly*.3,25),wrist=tr(-6,side*9,30);
        scene.limb(shoulder,elbow,3.4,2.6,P.brick,P.coral);scene.limb(elbow,wrist,2.5,2,P.clay,P.gold);
        scene.box((x,y,z)=>add(wrist,x,y,z),-1,-1,-1,2,2,2,P.clay,P.gold);
      }
      const head=tr(-15+lx,ly+sway,36.5),headTr=(x,y,z)=>b.comHeight?local(b,-15+lx+x,ly+sway+y,36.5+z):local({...head,a:b.a},x,y,z);
      // Faceted round head, a hair cap and local crown highlights rotate in 3D.
      cylinder(scene,headTr,[[-3.5,1.8],[-2.5,3.5],[1,4],[3.5,3],[4.5,1]],P.clay);
      cylinder(scene,headTr,[[.5,4.05],[2.8,3.45],[4.3,1.9],[4.6,.8]],P.hair);
      scene.box(headTr,3,-1,-1.2,2,2,1.7,P.clay,P.gold);
      for(const side of [-1,1])scene.box(headTr,-.5,side*3.5,-1,1.5,1,2,P.clay,P.gold);
      scene.wire(headTr(-2,-1.5,3.4),headTr(0,-1.5,4.4),P.hairLight,1,.8);
      scene.wire(headTr(0,-1.5,4.4),headTr(1,-.5,4.2),P.hairDark,1,.7);
      // Eye details only on the visible front, so they never leak through hair.
      if(Math.cos(b.a)+Math.sin(b.a)>.15)for(const side of [-1,1])scene.wire(headTr(3.65,side*1.7,.1),headTr(3.65,side*1.7,-.7),P.hairDark,1);
    }
    function articulatedShopper(scene,b,gait,p) {
      const c=Math.cos(b.a),s=Math.sin(b.a),leanX=p.leanX,leanY=p.leanY,tr=(x,y,z)=>({x:p.x+x*c-y*s,y:p.y+x*s+y*c,z:p.z+z});
      const bentJoint=(a,b,l1,l2,side)=>{const delta=subtract(b,a),distance=Math.hypot(delta.x,delta.y,delta.z)||1,axis=normalize(delta),d=Math.min(distance,l1+l2-.05),along=(l1*l1-l2*l2+d*d)/(2*d),bend=Math.sqrt(Math.max(.15,l1*l1-along*along)),hint={x:c,y:s,z:0},normal=normalize(subtract(hint,{x:axis.x*(axis.x*c+axis.y*s),y:axis.y*(axis.x*c+axis.y*s),z:axis.z*(axis.x*c+axis.y*s)}));return add(a,axis.x*along+normal.x*bend*side,axis.y*along+normal.y*bend*side,axis.z*along+normal.z*bend*side);};
      const phase=gait.phase||0,stride=gait.stride||0;
      for(const side of [-1,1]){
        const t=((phase/(Math.PI*2)+(side===1?.5:0))%1+1)%1,swing=Math.max(0,(t-.6)/.4),reach=t<.6?1-t/.3:-1+2*swing*swing*(3-2*swing),lift=Math.sin(swing*Math.PI)*Math.min(1,stride/2.8)*3.6;
        const travel=reach*stride,sole=tr(travel*(gait.forward??1)-1,side*3.5+travel*(gait.sideways||0)*.65,-18+lift),floor=terrainLevel?root.CartCourse.sample(terrainLevel,sole,false):null;
        if(p.feet&&floor)sole.z=floor.height+lift;else sole.z=Math.min(sole.z,p.z-10+lift);
        const hip=tr(0,side*2.7,0),ankle=add(sole,0,0,2),knee=bentJoint(hip,ankle,10,10,1);
        scene.limb(hip,knee,3.5,2.7,P.steelShade);scene.limb(knee,ankle,2.8,2.1,P.edge);
        const foot=(x,y,z)=>local({...sole,a:b.a+side*.1},x,y,z);scene.box(foot,-2,-1.5,0,5.5,3,1,P.cream,P.steelLight);scene.box(foot,-1.7,-1.4,1,4.8,2.8,1.5,P.dark,P.steelShade);scene.wire(foot(.2,-.9,2.55),foot(.2,.9,2.55),P.steelLight);
      }
      const bottom=[tr(-2.7,-3,0),tr(2.7,-3,0),tr(2.7,3,0),tr(-2.7,3,0)],top=[tr(-2+leanX,-5+leanY,11.5),tr(2+leanX,-5+leanY,11.5),tr(2+leanX,5+leanY,11.5),tr(-2+leanX,5+leanY,11.5)],torso=[...bottom,...top];for(const [indices]of faces)scene.face(indices.map(i=>torso[i]),P.brick);
      for(const side of [-1,1]){const shoulder=tr(leanX,side*5+leanY,10.5),wrist=local(b,-6,side*9,30),elbow=bentJoint(shoulder,wrist,9,10,-1);scene.limb(shoulder,elbow,3.3,2.6,P.brick);scene.limb(elbow,wrist,2.5,2,P.clay);scene.box((x,y,z)=>local({...wrist,a:b.a},x,y,z),-1,-1,-1,2,2,2,P.clay,P.gold);}
      const head=tr(leanX*1.12,leanY*1.12,18.5),headTr=(x,y,z)=>local({...head,a:b.a,pitch:clamp(-leanX*.035,-.18,.18),rollTilt:clamp(leanY*.035,-.18,.18)},x,y,z);
      cylinder(scene,headTr,[[-3.5,1.8],[-2.5,3.5],[1,4],[3.5,3],[4.5,1]],P.clay);cylinder(scene,headTr,[[.5,4.05],[2.8,3.45],[4.3,1.9],[4.6,.8]],P.hair);scene.box(headTr,3,-1,-1.2,2,2,1.7,P.clay,P.gold);for(const side of [-1,1])scene.box(headTr,-.5,side*3.5,-1,1.5,1,2,P.clay,P.gold);scene.wire(headTr(-2,-1.5,3.4),headTr(0,-1.5,4.4),P.hairLight);scene.wire(headTr(0,-1.5,4.4),headTr(1,-.5,4.2),P.hairDark);
    }
    function cart(target,b,wheels,gait) {
      const scene=new Scene();scene.rigid=true;
      const tr=(x,y,z)=>local(b,x,y,z);
      for(let i=0;i<4;i++)caster(scene,b,wheels?.[i]||{a:b.a,roll:0},i);
      for(const side of [-1,1]) {
        scene.wire(tr(-1,side*12,9),tr(28,side*12,9),P.steelShade,3);scene.wire(tr(-1,side*12,10),tr(28,side*12,10),P.steelLight,1);
        scene.wire(tr(1,side*12,9),tr(-3,side*11,31),P.steel,2,.85);
        scene.wire(tr(27,side*12,9),tr(28,side*9,17),P.steel,2,.85);
      }
      scene.wire(tr(0,-12,9),tr(0,12,9),P.steelShade,2);scene.wire(tr(27,-12,9),tr(27,12,9),P.steel,2);
      const lower=[tr(1,-8,16),tr(27,-8,16),tr(27,8,16),tr(1,8,16)],upper=[tr(-3,-11,31),tr(31,-11,31),tr(31,11,31),tr(-3,11,31)];
      scene.flat(lower,P.steel,.045);
      for(let i=0;i<4;i++) {
        scene.flat([lower[i],lower[(i+1)%4],upper[(i+1)%4],upper[i]],P.steel,.035);
        scene.wire(upper[i],upper[(i+1)%4],P.steel,2,.85);scene.wire(upper[i],upper[(i+1)%4],P.steelLight,1,.8);
        scene.wire(lower[i],lower[(i+1)%4],P.steelShade,1,.75);
      }
      // Close three-unit galvanized mesh on the bottom and all four side faces.
      for(let x=2;x<27;x+=3)scene.wire(tr(x,-8,16),tr(x,8,16),P.steelLight,1,.48);
      for(let y=-6;y<8;y+=3)scene.wire(tr(1,y,16),tr(27,y,16),P.steelShade,1,.5);
      for(const side of [-1,1]) {
        for(let x=2;x<27;x+=3){const t=(x-1)/26;scene.wire(tr(x,side*8,16),tr(-3+t*34,side*11,31),P.steelLight,1,.5);}
        for(let z=19;z<31;z+=3){const t=(z-16)/15;scene.wire(tr(1-4*t,side*(8+3*t),z),tr(27+4*t,side*(8+3*t),z),P.steelShade,1,.52);}
      }
      for(const end of [0,1]) {
        for(let y=-6;y<8;y+=3)scene.wire(tr(end?27:1,y,16),tr(end?31:-3,y*11/8,31),P.steelLight,1,.5);
        for(let z=19;z<31;z+=3){const t=(z-16)/15,x=end?27+4*t:1-4*t;scene.wire(tr(x,-8-3*t,z),tr(x,8+3*t,z),P.steelShade,1,.5);}
      }
      for(const side of [-1,1])scene.wire(tr(-3,side*11,31),tr(-6,side*12,30),P.steel,2,.9);
      scene.wire(tr(-6,-12,30),tr(-6,12,30),P.steelShade,3,.95);scene.wire(tr(-6,-10,30.5),tr(-6,10,30.5),P.steelLight,1,.85);
      shopper(scene,b,gait||{phase:0,stride:0,forward:1,sideways:0});scene.rasterInto(target);
    }
    function drawCart(g,b,wheels,gait,origin=CAMERA) {const scene=new Scene();cart(scene,b,wheels,gait);scene.flush(g,origin);}
    function drawShelf(g,s) {const scene=new Scene();shelf(scene,s);for(const p of s.stockItems)if(p.state==='shelf')product(scene,p);scene.flush(g);}
    function spills(g,stock) {
      for(const liquid of stock.liquids.values())for(const [key,volume]of liquid.cells) {
        const x=key%stock.cols*Stock.CELL,y=Math.floor(key/stock.cols)*Stock.CELL;
        if(liquid.kind==='water') {
          groundPoly(g,quad(x,y,4,4).map(onGround),P.blue,clamp(volume*.2,.018,.13));
          if(volume>.055) {
            const dry=k=>(liquid.cells.get(k)||0)<=.055;
            if(dry(key+1))groundLine(g,{x:x+4,y},{x:x+4,y:y+4},P.steelShade,1,.4);
            if(dry(key+stock.cols))groundLine(g,{x,y:y+4},{x:x+4,y:y+4},P.steelShade,1,.4);
            if(dry(key-stock.cols))groundLine(g,{x,y},{x:x+4,y},P.light,1,.75);
            if(dry(key-1))groundLine(g,{x,y},{x,y:y+4},P.light,1,.75);
            if(volume>.13&&hash(key,7)>.83)groundLine(g,{x,y:y+1},{x:x+4,y},P.light,1,.7);
          }
        }else groundPoly(g,quad(x,y,4,4).map(onGround),spillColor(liquid.kind),clamp(volume*1.4,.025,.65));
      }
      for(const smear of stock.smears)groundLocal(g,onGround(smear),-2,-.7,4,1.5,smear.kind==='water'?P.steelLight:spillColor(smear.kind),smear.alpha*(smear.kind==='water'?.45:1));
    }
    function routes(g,w) {
      for(const p of w.level.portals||[]) {
        const open=w.gate>=p.opensAt,accent=P[w.level.rooms[p.to].theme]||P.gold;
        groundLocal(g,p,-52,-p.width/2+3,47,p.width-6,accent,open?.25:.1);
        groundArrow(g,local(p,-25,0),24,open?P.pine:P.mid,.85);
        const q=project(local(p,-49,0));text(g,'ROOM '+String(p.to+1).padStart(2,'0'),q.x,q.y-5,open?P.pine:P.edge,6,'center');
      }
      const e=w.exit,half=e.width/2;
      groundLocal(g,e,-68,-half+2,63,e.width-4,P.gold,w.exitOpen?.17:.07);
      for(let x=-63;x<-5;x+=11)for(const y of [-half+2,half-3])groundLocal(g,e,x,y,6,1,P.cream,.65);
      groundArrow(g,local(e,-26,0),28,w.exitOpen?P.pine:P.mid,.75);
      for(let y=-half+2;y<half-2;y+=7)groundLocal(g,e,-9,y,2,3,P.light,.9);
      const label=project(local(e,-58,0));text(g,w.exitOpen?'CHECKOUT OPEN':'CHECKOUT',label.x,label.y-6,w.exitOpen?P.pine:P.edge,6,'center');
      for(let i=0;i<w.level.gates.length;i++) {
        const p=w.level.gates[i],current=i===w.gate,done=i<w.gate,color=current?P.coral:done?P.pine:P.edge;
        if(current)groundPoly(g,circle(p,CHECKPOINT_RADIUS),P.light,.17);
        groundRing(g,p,CHECKPOINT_RADIUS,color,current?2:1,done?.45:current?1:.65);
        const q=project(p);
        if(done){line(g,add(q,-4),add(q,-1,3),P.pine,2);line(g,add(q,-1,3),add(q,5,-4),P.pine,2);}
        else text(g,String(p.number||i+1),q.x,q.y+3,color,current?10:8,'center');
      }
    }
    function doorway(scene,w) {
      const e=w.exit,tr=(x,y,z)=>local(e,x,y,z),half=e.width/2;
      for(const y of [-half-2,half]) {
        scene.box(tr,-1,y,0,4,2,24,P.steelShade,P.steelLight,true);
        scene.box(tr,-1.05,y-.05,18,4.1,2.1,3,w.exitOpen?P.sage:P.gold);
      }
      if(!w.exitOpen) {
        for(let y=-half;y<half;y+=5)scene.wire(tr(1,y,3),tr(1,y,15),P.mid,1);
        scene.wire(tr(1,-half,15),tr(1,half,15),P.steelShade,2);scene.wire(tr(1,-half,16),tr(1,half,16),P.steelLight,1);
      }else for(const y of [-half,half])scene.wire(tr(1,y,15),tr(14,y,15),P.steelLight,1);
    }
    function shadows(g,w) {
      g.save();if(!w.level.campaign)clipFloor(g,w);
      w._shadowClipped=true;
      for(const s of w.shelves)if(!w._visible||w._visible({x:s.cx,y:s.cy},150))drawFurnitureShadow(g,s,w);
      const b=w.body;
      if(!w.fall&&(!w.level.campaign||w.isFloor(b)&&!w.edge.risk)){const height=Math.max(0,(b.z||0)-(w.ground?.lastHeight||0));groundPoly(g,circle(onGround(local(b,14,0)),23+height*.04,12+height*.02).map(onGround),P.dark,.12*Math.exp(-height/40));
      groundPoly(g,circle(onGround(w.shopper||local(b,-16,1)),6,5).map(onGround),P.dark,.22);
      groundPoly(g,Stock.hull([local(b,-20,-5),local(b,-12,5),local(b,4,13),local(b,-4,2)]).map(onGround),P.dark,.09);}
      for(let i=0;i<4;i++){const tire=Physics.casterPoint(b,w.wheels[i],i,0,0,4),floor=w.level.campaign?w.floorAt(tire):{height:0};if(floor){const height=Math.max(0,tire.z-floor.height-4);groundPoly(g,circle({...tire,z:floor.height},4+height*.018,2.8+height*.012),P.dark,.27*Math.exp(-height/24));}}
      if(w.shopper){const p=w.shopper,floor=w.floorAt(p);if(floor)groundPoly(g,circle({...p,z:floor.height},5,3.5),P.dark,.2*Math.exp(-Math.max(0,p.z-floor.height-18)/24));}
      for(const o of w.objects)if(!o.gone&&!o.falling)groundPoly(g,circle(add(o,3,3),o.kind==='box'?10:7,o.kind==='box'?8:5),P.dark,.18);
      for(const p of w.stock.items)if((!w._visible||w._visible(p))&&p.state!=='shelf'&&!p.broken&&p.kind!=='shard')groundPoly(g,circle(add(p,1,1,-p.z),Math.max(2,p.length),p.width),P.dark,.13);
      g.restore();delete w._shadowClipped;
    }
    function boundaries(g,w) {
      if(!w.boundaryContacts.length)return;
      const life=Math.max(...w.boundaryContacts.map(c=>c.life)),alpha=clamp(life/.18,0,1),p=local(w.body,BODY.personX,0);
      const shapes=[{part:'cart',points:corners(w.body)},{part:'shopper',points:circle(p,BODY.personRadius)},...w.wheels.map((q,i)=>({part:'wheel:'+i,points:casterCorners(w.body,q,i)}))];
      for(const shape of shapes) {
        if(w.boundaryContacts.some(c=>c.part===shape.part))groundPoly(g,shape.points,P.red,alpha*.3);
        for(let i=0;i<shape.points.length;i++){
          const a=project(shape.points[i]),b=project(shape.points[(i+1)%shape.points.length]);
          g.globalAlpha=alpha;line(g,a,b,P.hairDark,3);line(g,a,b,P.red,1);g.globalAlpha=1;
        }
      }
      for(const c of w.boundaryContacts) {
        const a={x:c.x-c.ny*12,y:c.y+c.nx*12},b={x:c.x+c.ny*12,y:c.y-c.nx*12};
        groundLine(g,a,b,P.hairDark,4,clamp(c.life/.18,0,1));groundLine(g,a,b,P.red,2,clamp(c.life/.18,0,1));
        const q=project(c);rect(g,q.x-2,q.y-2,5,5,P.red);rect(g,q.x-1,q.y-1,3,3,P.light);
      }
    }
    function trickFloor(g,w,options) {
      if(w.level.campaign||!w.tricks||options.reducedMotion)return;
      const arc=(p,r,start,sweep,color,width,alpha)=>{
        const steps=Math.max(2,Math.ceil(Math.abs(sweep)/.14));
        let last={x:p.x+Math.cos(start)*r,y:p.y+Math.sin(start)*r};
        for(let i=1;i<=steps;i++){const a=start+sweep*i/steps,next={x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r};groundLine(g,last,next,color,width,alpha);last=next;}
        return last;
      };
      const spin=w.tricks.spin;
      if(spin&&spin.angle>.25&&spin.tier<2) {
        const sweep=spin.direction*Math.min(Math.PI*2,spin.angle),color=spin.tier?P.purple:P.blue;
        const end=arc(w.body,43,spin.startAngle,sweep,color,2,.65);
        groundRing(g,end,2,P.light,1,.85);
      }
      if(w.tricks.slide) {
        const speed=Math.hypot(w.body.vx,w.body.vy);
        w.wheels.forEach((q,i)=>{const p=casterPose(w.body,q,i);groundLine(g,p,{x:p.x-w.body.vx/speed*13,y:p.y-w.body.vy/speed*13},P.sage,2,.4);});
      }
      for(const e of w.tricks.effects) {
        const alpha=clamp(e.life/e.maxLife,0,1),progress=1-alpha;
        if(e.kind==='near'){groundRing(g,e,4+progress*10,P.gold,2,alpha);groundLine(g,{x:e.x-4,y:e.y},{x:e.x+4,y:e.y},P.light,2,alpha);}
        else if(e.kind==='half'||e.kind==='full')arc(e,43+progress*8,e.startAngle,e.direction*(e.kind==='full'?Math.PI*2:Math.PI),e.kind==='full'?P.purple:P.blue,2,alpha*.8);
        else for(let i=0;i<3;i++)groundRing(g,{x:e.x-i*5,y:e.y-i*5},5+progress*5,P.sage,1,alpha*.6);
      }
    }
    function draw(g,w,background,options={}) {
      if(w.level.campaign)return drawCourse(g,w,background,options);
      if(w.level.connected)return drawConnected(g,w,background,options);
      const preview=options.preview;
      g.save();g.imageSmoothingEnabled=false;g.clearRect(0,0,g.canvas.width,g.canvas.height);
      if(!preview&&options.shake&&!options.reducedMotion)g.translate(Math.round(Math.sin(w.time*99)*options.shake),Math.round(Math.cos(w.time*78)*options.shake));
      g.drawImage(background,0,0);spills(g,w.stock);shadows(g,w);routes(g,w);
      if(!preview)trickFloor(g,w,options);
      for(const t of w.tracks)groundLocal(g,t,-2,-1,4,1,P.hairDark,t.life/3*.16);
      if(!preview) {
        const b=w.body,speed=Math.hypot(b.vx,b.vy);
        if(speed>8) {
          const vx=b.vx/speed,vy=b.vy/speed,length=Math.min(57,speed*.45);
          for(let i=10;i<length;i+=6){const p=project({x:b.x+vx*i,y:b.y+vy*i});rect(g,p.x,p.y,2,1,P.pine);}
          groundArrow(g,{x:b.x+vx*length,y:b.y+vy*length,a:Math.atan2(vy,vx)},9,P.pine,.7);
        }
      }
      // Global face ordering lets shelves, products, legs and basket wires
      // pass in front of and behind each other in the same world-space view.
      const scene=new Scene();doorway(scene,w);
      for(const s of w.shelves)shelf(scene,s);
      for(const p of w.stock.items)if(!p.broken)product(scene,p);
      for(const o of w.objects)prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper},w.wheels,w.gait);
      if(!preview)for(const p of options.particles||[]) {
        const tr=(x,y,z)=>local({...p,z:0},x,y,z);
        scene.flat([tr(-p.w/2,-p.h/2,p.z),tr(p.w/2,-p.h/2,p.z),tr(p.w/2,p.h/2,p.z),tr(-p.w/2,p.h/2,p.z)],p.color,clamp(p.life,0,1));
      }
      scene.flush(g);
      if(!preview){boundaries(g,w);}
      g.restore();
    }
    function worldFrame(w) {
      if(w.level.campaign&&w.level._viewFrame)return w.level._viewFrame;
      const points=w.level.floorAreas.flatMap(a=>(a.poly||quad(a.x,a.y,a.w,a.h)).map(p=>project(w.level.campaign?onGround(p):p)));
      const left=Math.min(...points.map(p=>p.x))-35,top=Math.min(...points.map(p=>p.y))-45,right=Math.max(...points.map(p=>p.x))+35,bottom=Math.max(...points.map(p=>p.y))+40;
      const frame={left,top,width:right-left,height:bottom-top};if(w.level.campaign)w.level._viewFrame=frame;return frame;
    }
    function connectedCamera(width,height,w,follow=true,focusY=.54) {
      if(follow){const focus=project({...w.body,z:w.level.campaign?(w.ground.lastHeight+clamp(w.body.z-w.ground.lastHeight,0,65)*.4):0});const scale=width<=480?1.8:1.45;return {scale,x:width*.5-focus.x*scale,y:height*focusY-focus.y*scale};}
      const box=worldFrame(w),scale=Math.min((width-28)/box.width,(height-28)/box.height);
      return {scale,x:(width-box.width*scale)/2-box.left*scale,y:(height-box.height*scale)/2-box.top*scale};
    }
    function overview(g,w,camera) {
      const box=worldFrame(w),width=154,height=114,x=g.canvas.width-width-12,y=12,scale=Math.min((width-8)/box.width,(height-8)/box.height);
      const ox=x+4+(width-8-box.width*scale)/2-box.left*scale,oy=y+4+(height-8-box.height*scale)/2-box.top*scale;
      rect(g,x-2,y-2,width+4,height+4,P.hairDark);rect(g,x,y,width,height,blend(P.dark,P.blue,.17));
      g.save();g.beginPath();g.rect(x,y,width,height);g.clip();g.translate(ox,oy);g.scale(scale,scale);
      for(const a of w.level.floorAreas)groundPoly(g,quad(a.x,a.y,a.w,a.h),a.room===undefined?P.cream:P[w.level.rooms[a.room].theme]);
      for(const h of w.level.hazards)groundPoly(g,circle(h,h.rx,h.ry),P.blue);
      const target=w.level.gates[w.gate];if(target)groundRing(g,target,CHECKPOINT_RADIUS,P.light,5);
      const q=project(w.body);oval(g,q.x,q.y,10,10,P.dark);oval(g,q.x,q.y,6,6,P.light);
      const l=(-camera.x/camera.scale),t=(-camera.y/camera.scale),r=l+g.canvas.width/camera.scale,b=t+g.canvas.height/camera.scale;
      for(const [a,z]of [[{x:l,y:t},{x:r,y:t}],[{x:r,y:t},{x:r,y:b}],[{x:r,y:b},{x:l,y:b}],[{x:l,y:b},{x:l,y:t}]])line(g,a,z,P.light,2);
      g.restore();
    }
    function drawConnected(g,w,background,options) {
      const camera=connectedCamera(g.canvas.width,g.canvas.height,w,options.follow!==false,options.focusY),width=g.canvas.width,height=g.canvas.height;
      const visible=(p,margin=90)=>{const q=project(p);return camera.x+q.x*camera.scale>-margin&&camera.x+q.x*camera.scale<width+margin&&camera.y+q.y*camera.scale>-margin&&camera.y+q.y*camera.scale<height+margin;};
      w._visible=visible;
      g.save();g.imageSmoothingEnabled=false;rect(g,0,0,width,height,blend(P.dark,P.blue,.16));
      g.translate(camera.x,camera.y);g.scale(camera.scale,camera.scale);
      if(options.shake&&!options.reducedMotion)g.translate(Math.sin(w.time*99)*options.shake*.45,Math.cos(w.time*78)*options.shake*.45);
      for(const a of w.level.floorAreas)if(a.room===undefined) {
        groundPoly(g,quad(a.x,a.y,a.w,a.h,-5),P.hairDark);groundPoly(g,quad(a.x,a.y,a.w,a.h),P.gold);
        for(let u=0;u<a.w;u+=12)groundLine(g,{x:a.x+u,y:a.y},{x:a.x+u,y:a.y+a.h},P.cream,1,.45);
      }
      for(const tile of background.rooms) {
        const r=tile.room,dx=(r.x-r.y)*CAMERA.horizontal,dy=(r.x+r.y)*CAMERA.vertical;
        if(!visible({x:r.x+240,y:r.y+150},800))continue;
        g.drawImage(tile.canvas,dx,dy);
      }
      spills(g,w.stock);shadows(g,w);routes(g,w);
      if(!options.preview)trickFloor(g,w,options);
      for(const t of w.tracks)if(visible(t))groundLocal(g,t,-2,-1,4,1,P.hairDark,t.life/3*.16);
      const scene=new Scene();doorway(scene,w);
      for(const p of w.level.portals)if(visible(p,150))doorway(scene,{exit:p,exitOpen:w.gate>=p.opensAt});
      for(const s of w.shelves)if(visible({x:s.cx,y:s.cy},180))shelf(scene,s);
      for(const p of w.stock.items)if(!p.broken&&visible(p))product(scene,p);
      for(const o of w.objects)if(!o.gone&&visible(o))prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper},w.wheels,w.gait);
      for(const p of options.particles||[])if(visible(p))scene.flat(quad(p.x,p.y,p.w,p.h,p.z),p.color,clamp(p.life,0,1));
      scene.flush(g);
      if(w.fall) {
        const fallScene=new Scene(clamp(1-w.fall.time*.85,0,1));cart(fallScene,w.body,w.wheels,w.gait);
        g.globalAlpha=clamp(1-w.fall.time*.85,0,1);fallScene.flush(g);g.globalAlpha=1;
        if(w.fall.kind==='lake') {
          const p={x:w.body.x,y:w.body.y,z:-6},r=8+w.fall.time*30;
          groundRing(g,p,r,P.light,2,clamp(1-w.fall.time,0,1));
          for(let i=0;i<8;i++){const a=i*Math.PI/4,q={x:p.x+Math.cos(a)*r*.5,y:p.y+Math.sin(a)*r*.5,z:Math.sin(w.fall.time*3)*14};groundLine(g,q,{...q,z:q.z+4},P.light,2,.8);}
        }
      }else {
        const speed=Math.hypot(w.body.vx,w.body.vy);
        if(speed>8){const a=Math.atan2(w.body.vy,w.body.vx),b={...w.body,a,z:0};groundArrow(g,local(b,Math.min(55,speed*.45),0),10,P.pine,.7);}
        if(w.unsupported?.some(Boolean))w.wheels.forEach((q,i)=>{if(w.unsupported[i])groundRing(g,casterPose(w.body,q,i),5,P.red,2);});
      }
      boundaries(g,w);g.restore();delete w._visible;terrainLevel=null;
      if(options.follow!==false&&!options.preview)overview(g,w,camera);
      const next=w.level.gates[w.gate],target=next&&next.room!==w.roomIndex?(w.level.portals[w.roomIndex]||next):(next||w.exit),p=project(target),tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;
      if(options.follow!==false&&!options.preview&&(tx<18||tx>width-18||ty<18||ty>height-18)) {
        const dx=tx-width/2,dy=ty-height*.54,t=Math.min((width/2-28)/Math.max(1,Math.abs(dx)),(height*.45-30)/Math.max(1,Math.abs(dy))),x=clamp(width/2+dx*t,25,width-25),y=clamp(height*.54+dy*t,25,height-25);
        const label=target.to!==undefined?'DOOR':target.number||'OUT',rx=label.length>2?19:13;oval(g,x,y,rx,13,P.hairDark);oval(g,x,y,rx-2,11,P.gold);text(g,label,x,y+4,P.hairDark,10,'center');
      }
    }
    function coursePrism(scene,points,bottom,height,color,top=color) {
      scene.face(points.map(p=>({...p,z:height})),top,1,null,true);
      for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];scene.face([{...a,z:bottom},{...b,z:bottom},{...b,z:height},{...a,z:height}],color,1,null,true);}
    }
    function clipPolygon(points,axis,value,sign){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=(a[axis]-value)*sign>=0,other=(b[axis]-value)*sign>=0;if(inside)out.push(a);if(inside!==other){const t=(value-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}return out;}
    function mesh(g,points,color,tile,requireFloor=false){
      let p=clipPolygon(clipPolygon(clipPolygon(clipPolygon(points,'x',tile.x,1),'x',tile.x+tile.w,-1),'y',tile.y,1),'y',tile.y+tile.h,-1);if(p.length<3)return;
      const b=root.CartCourse.bounds(p),step=8;
      for(let y=Math.floor(b.top/step)*step;y<b.bottom;y+=step)for(let x=Math.floor(b.left/step)*step;x<b.right;x+=step){const part=clipPolygon(clipPolygon(clipPolygon(clipPolygon(p,'x',x,1),'x',x+step,-1),'y',y,1),'y',y+step,-1);if(part.length<3)continue;const center={x:part.reduce((a,p)=>a+p.x,0)/part.length,y:part.reduce((a,p)=>a+p.y,0)/part.length};if(requireFloor&&!root.CartCourse.sample(terrainLevel,center))continue;const q=part.map(onGround),z=Terrain.height(terrainLevel,center),gx=(Terrain.height(terrainLevel,{x:center.x+1,y:center.y})-z),gy=(Terrain.height(terrainLevel,{x:center.x,y:center.y+1})-z);groundPoly(g,q,blend(color,P.dark,clamp((gx+gy)*.12,-.05,.2)));}
    }
    function cliffFaces(scene,w,visible,mode='upper'){
      const Course=root.CartCourse;
      if(!w.level._edges){const out=[],seen=new Set();for(const a of w.level.floorAreas)for(let i=0;i<a.poly.length;i++){const p=a.poly[i],q=a.poly[(i+1)%a.poly.length],dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy),n={x:-dy/d,y:dx/d};if(d<.1)continue;const count=Math.ceil(d/12);for(let j=0;j<count;j++){const mid={x:p.x+dx*(j+.5)/count,y:p.y+dy*(j+.5)/count};const plus=!!Course.sample(w.level,{x:mid.x+n.x*.3,y:mid.y+n.y*.3}),minus=!!Course.sample(w.level,{x:mid.x-n.x*.3,y:mid.y-n.y*.3});if(plus===minus||(n.x+n.y)*(plus?-1:1)<.02)continue;const A={x:p.x+dx*j/count,y:p.y+dy*j/count},B={x:p.x+dx*(j+1)/count,y:p.y+dy*(j+1)/count},key=[A,B].map(p=>Math.round(p.x*4)+','+Math.round(p.y*4)).sort().join('/');if(seen.has(key))continue;seen.add(key);out.push({a:onGround(A),b:onGround(B),kind:a.kind});}}w.level._edges=out;}
      for(const e of w.level._edges){const a=e.a,b=e.b;if(!visible({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},140)||mode==='occlude'&&Math.hypot((a.x+b.x)/2-w.body.x,(a.y+b.y)/2-w.body.y)>65)continue;const low=mode==='upper'?0:-105,high=mode==='below'?0:Math.max(a.z,b.z);for(let z=low;z<high;z+=12){const za=Math.min(a.z,z+12,high),zb=Math.min(b.z,z+12,high);if(za<=z&&zb<=z)continue;scene.flat([{...a,z:za},{...b,z:zb},{...b,z:Math.min(b.z,z)},{...a,z:Math.min(a.z,z)}],blend(P.clay,P.hairDark,.4+hash(Math.round(a.x),z)*.12));}if(mode!=='below')scene.flat([a,b,{...b,z:Math.max(low,b.z-5)},{...a,z:Math.max(low,a.z-5)}],e.kind==='grass'?P.pine:blend(P.clay,P.dark,.4));for(const offset of [20,42,65])if(a.z-offset>=low&&a.z-offset<=high)scene.wire({...a,z:a.z-offset},{...b,z:b.z-offset},offset===42?P.hairDark:P.hair,1,.55);if(mode!=='below')scene.wire(a,b,P.hairDark,1,.7);}
    }
    function courseTile(w,background,x,y) {
      const key=x+','+y;if(background.tiles.has(key)){const tile=background.tiles.get(key);background.tiles.delete(key);background.tiles.set(key,tile);return tile;}
      const Course=root.CartCourse,size=256,area=quad(x*size,y*size,size,size),q=area.map(p=>project(p)),left=Math.floor(Math.min(...q.map(p=>p.x)))-5,top=Math.floor(Math.min(...q.map(p=>p.y)))-140;
      const c=document.createElement('canvas');c.width=Math.ceil(Math.max(...q.map(p=>p.x))-left)+8;c.height=Math.ceil(Math.max(...q.map(p=>p.y))-top)+12;
      const g=c.getContext('2d');g.translate(-left,-top);
      const candidates=Course.query(w.level.floorAreas,w.level.floorGrid,{x:(x+.5)*size,y:(y+.5)*size},size*.72).sort((a,b)=>(a.kind==='grass'?0:a.kind==='tile'?2:1)-(b.kind==='grass'?0:b.kind==='tile'?2:1));
      for(const a of candidates)mesh(g,a.poly,a.kind==='grass'?blend(P.pine,P.sage,.2):a.kind==='dirt'?blend(P.clay,P.gold,.28):a.kind==='asphalt'?blend(P.steelShade,P.dark,.35):blend(P.cream,P.coral,.15),{x:x*size,y:y*size,w:size,h:size});
      const strip=f=>{const c=Math.cos(f.a),s=Math.sin(f.a);return [[0,-f.width/2],[f.length,-f.width/2],[f.length,f.width/2],[0,f.width/2]].map(([u,v])=>({x:f.x+u*c-v*s,y:f.y+u*s+v*c}));};
      for(const [f,color]of [[w.level.terrain.ice,blend(P.blue,P.light,.45)],[w.level.terrain.boost,P.gold]])mesh(g,strip(f),color,{x:x*size,y:y*size,w:size,h:size},true);
      const bumps=w.level.terrain.bumps;
      for(const u of bumps.centers)for(let v=-bumps.width/2;v<bumps.width/2;v+=10){const b={x:bumps.x,y:bumps.y,a:bumps.a};mesh(g,[local(b,u-5,v),local(b,u+5,v),local(b,u+5,v+10),local(b,u-5,v+10)],Math.floor(v/10)%2?P.gold:P.dark,{x:x*size,y:y*size,w:size,h:size},true);}
      for(let yy=y*size;yy<(y+1)*size;yy+=8)for(let xx=x*size;xx<(x+1)*size;xx+=8){
        const h=hash(xx,yy),p=onGround({x:xx+h*6,y:yy+hash(yy,xx)*6}),surface=Course.sample(w.level,p);if(!surface)continue;const a=project(p);
        if(surface.kind==='grass'){
          if(h>.48){line(g,a,{x:a.x-2,y:a.y-3},h>.82?P.sage:P.pine,1);line(g,a,{x:a.x+2,y:a.y-2},P.pine,1);}
          if(h>.96)rect(g,a.x,a.y-3,2,2,P.gold);
        }else if(surface.kind==='dirt'){
          g.globalAlpha=.18+h*.25;rect(g,a.x,a.y,h>.8?3:1,1,h>.55?P.hairDark:P.light);g.globalAlpha=1;
          if(h>.95)groundLine(g,p,onGround({x:p.x+7,y:p.y+2}),P.hairDark,1,.22);
        }else if(surface.kind==='asphalt'){
          if(h>.3){g.globalAlpha=.12;rect(g,a.x,a.y,1,1,h>.7?P.light:P.dark);g.globalAlpha=1;}
        }else if(surface.kind==='ice'){
          if(h>.7)groundLine(g,p,onGround({x:p.x+8,y:p.y+5}),P.light,1,.7);
          if(h>.93){groundLine(g,p,onGround({x:p.x-7,y:p.y+10}),P.blue,1,.7);groundLine(g,p,onGround({x:p.x+3,y:p.y+12}),P.blue,1,.5);}
        }
      }
      for(const store of w.level.stores){if(store.x>x*size+size||store.x+store.w<x*size||store.y>y*size+size||store.y+store.h<y*size)continue;
        for(let yy=Math.max(store.y,Math.floor(y*size/20)*20);yy<Math.min(store.y+store.h,(y+1)*size);yy+=20)for(let xx=Math.max(store.x,Math.floor(x*size/20)*20);xx<Math.min(store.x+store.w,(x+1)*size);xx+=20){const ww=Math.min(20,store.x+store.w-xx),hh=Math.min(20,store.y+store.h-yy);mesh(g,quad(xx+.5,yy+.5,ww-1,hh-1),(Math.floor((xx-store.x)/20)+Math.floor((yy-store.y)/20))%2?blend(P.light,P.sage,.13):blend(P.cream,P.coral,.12),{x:x*size,y:y*size,w:size,h:size});}
      }
      for(const curb of w.level.curbs){const b=Course.bounds(curb.poly);if(b.right<x*size||b.left>(x+1)*size||b.bottom<y*size||b.top>(y+1)*size||w.level.stores.some(s=>b.left>s.x&&b.right<s.x+s.w&&b.top>s.y&&b.bottom<s.y+s.h))continue;mesh(g,curb.poly,curb.red?(P.raceRed||P.brick):P.light,{x:x*size,y:y*size,w:size,h:size},true);}
      for(const f of [w.level.terrain.boost,w.level.terrain.ramp]){for(let u=10;u<f.length;u+=15){const p=onGround(local(f,u,0));if(p.x<x*size||p.x>=(x+1)*size||p.y<y*size||p.y>=(y+1)*size)continue;groundArrow(g,{...p,a:f.a},8,f===w.level.terrain.boost?P.hairDark:P.gold,.95);}}
      const tile={canvas:c,x:left,y:top};background.tiles.set(key,tile);if(background.tiles.size>32)background.tiles.delete(background.tiles.keys().next().value);return tile;
    }
    function courseModels(scene,w,visible) {
      const tr=(x,y,z)=>({x,y,z:z+Terrain.height(w.level,{x,y})});
      cliffFaces(scene,w,visible);
      for(const r of w.level.rails)if(visible({x:(r.a.x+r.b.x)/2,y:(r.a.y+r.b.y)/2},Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y)/2+70)){
        scene.flat(r.poly.map(onGround),P.steelShade);
        const d=Math.hypot(r.b.x-r.a.x,r.b.y-r.a.y);
        scene.wire(tr(r.a.x,r.a.y,12),tr(r.b.x,r.b.y,12),P.dark,4);scene.wire(tr(r.a.x,r.a.y,13),tr(r.b.x,r.b.y,13),P.steelLight,2);
        scene.wire(tr(r.a.x,r.a.y,18),tr(r.b.x,r.b.y,18),P.steel,2);
        for(let u=(36-r.distance%36)%36;u<=d;u+=36){const p={x:r.a.x+(r.b.x-r.a.x)*u/d,y:r.a.y+(r.b.y-r.a.y)*u/d};scene.box(tr,p.x-1.5,p.y-1.5,0,3,3,19,P.steelShade,P.steel,true);}
      }
      for(const r of w.level.walls)if(r.side==='store'&&visible({x:r.x+r.w/2,y:r.y+r.h/2},180)){
        const far=r.w>r.h?r.y<w.level.stores.find(s=>s.chapter===r.chapter).y+10:r.x<w.level.stores.find(s=>s.chapter===r.chapter).x+10;
        coursePrism(scene,r.poly,0,far?32:9,blend(P.floor,P.cream,.4),P.cream);
        coursePrism(scene,r.poly,far?22:5,far?25:7,P.sage,P.sage);
      }
      for(const store of w.level.stores)if(visible({x:store.x+store.w/2,y:store.y+store.h/2},400)){
        const e=store.entry,v=e.side==='left'||e.side==='right',x=v?(e.side==='left'?store.x:store.x+store.w):e.center,y=v?e.center:(e.side==='top'?store.y:store.y+store.h),span=e.width/2+7;
        for(const sign of [-1,1])scene.box(tr,x+(v?-4:sign*span-4),y+(v?sign*span-4:-4),0,8,8,48,P.steelShade,P.steel);
        const roof=v?quad(x-6,y-span-7,12,span*2+14):quad(x-span-7,y-6,span*2+14,12);coursePrism(scene,roof,45,53,P.pine,P.sage);
        const tex=labelTexture(store.name,110,12),points=v?[{x:x+6,y:y-span,z:35},{x:x+6,y:y+span,z:35},{x:x+6,y:y+span,z:47},{x:x+6,y:y-span,z:47}]:[{x:x+span,y:y+6,z:35},{x:x-span,y:y+6,z:35},{x:x-span,y:y+6,z:47},{x:x+span,y:y+6,z:47}];scene.texture(points,tex);
      }
      for(const s of w.level.sections){
        const b=s.start,n={x:-Math.sin(b.a),y:Math.cos(b.a)},p={x:b.x+n.x*(s.width/2-8),y:b.y+n.y*(s.width/2-8)};
        if(!visible(p,55))continue;
        scene.box(tr,p.x-1.5,p.y-1.5,0,3,3,27,P.steelShade,P.steel);
        const points=[{x:p.x+2,y:p.y-10,z:18},{x:p.x+2,y:p.y+10,z:18},{x:p.x+2,y:p.y+10,z:32},{x:p.x+2,y:p.y-10,z:32}];
        const elevated=points.map(p=>({...p,z:p.z+Terrain.height(w.level,p)}));scene.flat(elevated,P.gold);scene.texture(elevated,labelTexture(String(s.index+1).padStart(2,'0'),24,14));
      }
      for(const d of w.trackDoors)if(!d.broken&&visible({x:d.cx,y:d.cy},100)){
        const poly=root.CartCourse.doorPolygon(d);scene.flat(poly.map(p=>({...p,z:2})),P.steelShade,.2);
        const a={x:d.cx,y:d.cy},b={x:d.cx+Math.cos(d.a)*d.length,y:d.cy+Math.sin(d.a)*d.length};
        scene.flat([{...a,z:3},{...b,z:3},{...b,z:35},{...a,z:35}],P.blue,.22);
        for(const z of [2,18,36])scene.wire({...a,z},{...b,z},P.steel,1,.9);
        for(const p of [a,b])scene.wire({...p,z:2},{...p,z:36},P.steelLight,2,.9);
      }
      const relay=w.level.terrain.circuit,c=w.circuit,d=relay.shutter;
      if(visible({x:d.x,y:d.y+50},170)){
        scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y-6,0,12,7,64,P.steelShade,P.steelLight);scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y+d.h-1,0,12,7,64,P.steelShade,P.steelLight);
        scene.box((x,y,z)=>({x,y,z}),d.x-3,d.y-6,61,12,d.h+12,6,P.dark,P.steel);
        if(c.lift<1){coursePrism(scene,d.poly,c.lift*62,c.lift*62+50,blend(P.steelShade,P.blue,.18),P.steel);for(let z=5;z<50;z+=5)scene.wire({x:d.x+6,y:d.y,z:c.lift*62+z},{x:d.x+6,y:d.y+d.h,z:c.lift*62+z},P.steelLight,1,.5);}
        const status=[{x:d.x+7,y:d.y+5,z:50},{x:d.x+7,y:d.y+14,z:50},{x:d.x+7,y:d.y+14,z:57},{x:d.x+7,y:d.y+5,z:57}];scene.flat(status,c.powered?P.sage:P.raceRed);
        scene.texture([{x:d.x+7,y:d.y+30,z:52},{x:d.x+7,y:d.y+85,z:52},{x:d.x+7,y:d.y+85,z:62},{x:d.x+7,y:d.y+30,z:62}],labelTexture(c.powered?'OPEN':'WATER RELAY',72,12));
        const tray=relay.tray;scene.flat(quad(tray.x,tray.y,tray.w,tray.h,.08),P.blue,.12);
        relay.terminals.forEach((p,i)=>{const leadY=i?tray.y+tray.h+12:tray.y-12,leadX=d.x-12+i*5;scene.box((x,y,z)=>({x,y,z}),p.x-3,p.y-3,.15,6,6,.7,P.steelShade,P.gold);scene.wire({x:p.x,y:p.y+(i?4:-4),z:.5},{x:p.x,y:leadY,z:.5},P.dark,2);scene.wire({x:p.x,y:leadY,z:.5},{x:leadX,y:leadY,z:.5},P.dark,2);scene.wire({x:leadX,y:leadY,z:.5},{x:leadX,y:d.y-9,z:.5},P.dark,2);scene.wire({x:leadX,y:d.y-9,z:.5},{x:leadX,y:d.y-9,z:45},P.dark,2);});
        if(c.connected)for(const key of c.path){const x=key%w.stock.cols*4,y=Math.floor(key/w.stock.cols)*4;scene.flat(quad(x+1,y+1,2,2,.2),P.blue,.65);}
      }
      for(const p of w.level.decor)if(visible(p,100)){
        scene.box(tr,p.x-2,p.y-2,-30,4,4,22,P.hairDark,P.hair);
        for(let z=-13;z<8;z+=6){const r=16-(z+13)*.3;scene.face([{x:p.x-r,y:p.y-r,z},{x:p.x+r,y:p.y-r,z},{x:p.x,y:p.y,z:z+15}],P.pine);scene.face([{x:p.x+r,y:p.y-r,z},{x:p.x+r,y:p.y+r,z},{x:p.x,y:p.y,z:z+15}],P.sage);scene.face([{x:p.x+r,y:p.y+r,z},{x:p.x-r,y:p.y+r,z},{x:p.x,y:p.y,z:z+15}],P.pine);}
      }
    }
    function drawCourse(g,w,background,options) {
      terrainLevel=w.level;
      const Course=root.CartCourse,width=g.canvas.width,height=g.canvas.height,camera=connectedCamera(width,height,w,options.follow!==false,options.focusY),visible=(p,r=100)=>{const q=project(p);return camera.x+q.x*camera.scale>-r&&camera.x+q.x*camera.scale<width+r&&camera.y+q.y*camera.scale>-r&&camera.y+q.y*camera.scale<height+r;};w._visible=visible;
      g.save();g.imageSmoothingEnabled=false;rect(g,0,0,width,height,blend(P.pine,P.dark,.6));g.translate(camera.x,camera.y);g.scale(camera.scale,camera.scale);
      if(options.shake&&!options.reducedMotion)g.translate(Math.sin(w.time*99)*options.shake*.45,Math.cos(w.time*78)*options.shake*.45);
      for(const h of w.level.hazards)if(visible(h,350)){groundPoly(g,circle({...h,z:-50},h.rx,h.ry),blend(P.blue,P.dark,.22));for(let i=0;i<22;i++){const a=i*2.399,p={x:h.x+Math.cos(a)*h.rx*.75,y:h.y+Math.sin(a)*h.ry*.75,z:-49};groundLine(g,p,{x:p.x+14,y:p.y-4,z:-49},P.light,1,.25);}}
      const rock=new Scene();cliffFaces(rock,w,visible,'below');rock.flush(g);
      if(options.follow===false){for(const a of w.level.floorAreas)groundPoly(g,a.poly.map(onGround),a.kind==='grass'?P.pine:a.kind==='tile'?P.cream:a.kind==='dirt'?P.clay:P.steelShade);}
      else{
        const corners=[{x:-80,y:-80},{x:width+80,y:-80},{x:width+80,y:height+80},{x:-80,y:height+80}].map(p=>unproject({x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale})),b=Course.bounds(corners);
        for(let y=Math.max(0,Math.floor(b.top/256));y<=Math.min(Math.floor(w.level.bounds.bottom/256),Math.floor(b.bottom/256));y++)for(let x=Math.max(0,Math.floor(b.left/256));x<=Math.min(Math.floor(w.level.bounds.right/256),Math.floor(b.right/256));x++){if(!Course.query(w.level.floorAreas,w.level.floorGrid,{x:(x+.5)*256,y:(y+.5)*256},184).length)continue;const tile=courseTile(w,background,x,y);g.drawImage(tile.canvas,tile.x,tile.y);}
      }
      spills(g,w.stock);shadows(g,w);
      for(const t of w.tracks)if(visible(t))groundLocal(g,onGround(t),-2,-1,4,1,P.hairDark,t.life/3*.25);
      for(const l of w.level.legs)if(l.length>90){const p={...onGround({x:(l.a.x+l.b.x)/2,y:(l.a.y+l.b.y)/2}),a:Math.atan2(l.b.y-l.a.y,l.b.x-l.a.x)};if(visible(p))groundArrow(g,p,13,P.light,l.surface==='asphalt'?.65:.42);}
      const start=w.level.sections[0].start;
      if(visible(start,120))for(let row=0;row<8;row++)for(let col=0;col<2;col++)groundPoly(g,quad(start.x+55+col*10,start.y-40+row*10,10,10),(row+col)%2?P.light:P.hairDark);
      const f=w.level.finish;for(let y=-60;y<60;y+=15)for(let x=-15;x<30;x+=15)groundPoly(g,quad(f.x+x,f.y+y,15,15).map(onGround),(Math.round((x+y)/15)%2)?P.light:P.dark);
      const target=w.level.gates[w.gate];if(target){groundRing(g,onGround(target),20,target.visible?P.light:P.gold,2,.8);const p=project(onGround(target));text(g,w.gate===w.level.gates.length-1?'FINISH':target.visible?String(target.room+1).padStart(2,'0'):'GO',p.x,p.y+3,P.hairDark,8,'center');}
      if(!options.preview)trickFloor(g,w,options);
      const scene=new Scene();courseModels(scene,w,visible);if(w.fall||w.body.z<w.ground.lastHeight-2)cliffFaces(scene,w,visible,'occlude');
      for(const s of w.shelves)if(visible({x:s.cx,y:s.cy},170))shelf(scene,s);
      for(const p of w.stock.items)if(!p.broken&&visible(p))product(scene,p);
      for(const o of w.objects)if(!o.gone&&visible(o))prop(scene,o);
      cart(scene,{...w.body,shopper:w.shopper},w.wheels,w.gait);
      for(const p of options.particles||[])if(visible(p))scene.flat(quad(p.x,p.y,p.w,p.h,p.z),p.color,clamp(p.life,0,1));scene.flush(g);
      if(w.fall?.kind==='lake'&&w.fall.impactTime!==null){const t=w.fall.impactTime;groundRing(g,{...w.body,z:-50},12+t*32,P.light,2,1-t);groundRing(g,{...w.body,z:-50},7+t*22,P.blue,2,.65-t*.5);}
      if(!w.fall){const speed=Math.hypot(w.body.vx,w.body.vy);if(speed>8)groundArrow(g,{...onGround({x:w.body.x+w.body.vx*.5,y:w.body.y+w.body.vy*.5}),a:Math.atan2(w.body.vy,w.body.vx)},10,P.light,.65);w.wheels.forEach((q,i)=>{if(w.edge.risk>0&&!w.ground.airborne&&w.unsupported?.[i])groundRing(g,Physics.casterPoint(w.body,q,i,0,0,1),5,P.red,2);});}
      boundaries(g,w);g.restore();delete w._visible;terrainLevel=null;
      if(target&&!options.preview&&options.follow!==false){const p=project({...target,z:w.level.campaign?Terrain.height(w.level,target):target.z}),tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;if(tx<25||tx>width-25||ty<25||ty>height-25){const dx=tx-width/2,dy=ty-height*.54,t=Math.min((width/2-30)/Math.max(1,Math.abs(dx)),(height*.45-30)/Math.max(1,Math.abs(dy))),x=clamp(width/2+dx*t,25,width-25),y=clamp(height*.54+dy*t,25,height-25);oval(g,x,y,13,13,P.hairDark);oval(g,x,y,11,11,P.gold);text(g,'GO',x,y+3,P.hairDark,8,'center');}}
    }
    function illustration(g) {
      g.clearRect(0,0,g.canvas.width,g.canvas.height);
      const b={x:0,y:0,a:-.18,vx:0,vy:0,omega:0},scene=new Scene();
      cart(scene,b,[0,-.6,.35,-.15].map(a=>({a,roll:0})),{phase:0,stride:0});
      g.save();g.scale(2,2);scene.flush(g,{x:39,y:48});g.restore();
    }
    function framing(width,height,body,follow=true) {
      const scale=follow?1.8:Math.min(width/CAMERA.width,height/CAMERA.height);
      if(!follow)return {scale,x:(width-CAMERA.width*scale)/2,y:(height-CAMERA.height*scale)/2};
      const focus=project(local(body,10,0));
      return {scale,x:width*.5-focus.x*scale,y:height*.53-focus.y*scale};
    }
    function present(g,frame,w,follow=true) {
      const width=g.canvas.width,height=g.canvas.height,camera=framing(width,height,w.body,follow);
      g.save();g.imageSmoothingEnabled=false;
      rect(g,0,0,width,height,blend(P.hairDark,P.edge,.48));
      g.drawImage(frame,camera.x,camera.y,CAMERA.width*camera.scale,CAMERA.height*camera.scale);
      if(follow) {
        const target=w.level.gates[w.gate]||local(w.exit,20,0),p=project(target);
        const tx=camera.x+p.x*camera.scale,ty=camera.y+p.y*camera.scale;
        if(tx<18||tx>width-18||ty<18||ty>height-18) {
          const cx=width*.5,cy=height*.53,dx=tx-cx,dy=ty-cy;
          const t=Math.min((width/2-22)/Math.max(1,Math.abs(dx)),(height/2-32)/Math.max(1,Math.abs(dy)));
          const x=clamp(cx+dx*t,22,width-22),y=clamp(cy+dy*t,22,height-22);
          oval(g,x,y,12,12,P.hairDark);oval(g,x,y,10,10,P.cream);
          text(g,w.gate<w.level.gates.length?String(w.gate+1):'OUT',x,y+4,P.brick,10,'center');
          const distance=Math.hypot(dx,dy)||1,nx=dx/distance,ny=dy/distance;
          line(g,{x:x+nx*12,y:y+ny*12},{x:x+nx*17,y:y+ny*17},P.coral,3);
        }
        // The live overview uses the exact frame, with the current camera
        // rectangle and cart position, rather than a second map implementation.
        const mapScale=.2,mw=CAMERA.width*mapScale,mh=CAMERA.height*mapScale,mx=width-mw-14,my=14;
        rect(g,mx-3,my-3,mw+6,mh+6,P.hairDark);g.drawImage(frame,mx,my,mw,mh);
        g.save();g.beginPath();g.rect(mx,my,mw,mh);g.clip();
        const a={x:mx+(-camera.x/camera.scale)*mapScale,y:my+(-camera.y/camera.scale)*mapScale};
        const b={x:a.x+width/camera.scale*mapScale,y:a.y+height/camera.scale*mapScale};
        line(g,a,{x:b.x,y:a.y},P.light);line(g,{x:b.x,y:a.y},b,P.light);line(g,b,{x:a.x,y:b.y},P.light);line(g,{x:a.x,y:b.y},a,P.light);
        const q=project(w.body);rect(g,mx+q.x*mapScale-1,my+q.y*mapScale-1,3,3,P.coral);g.restore();
      }
      g.restore();
    }
    return {draw,makeFloor,drawCart,drawShelf,drawFurnitureShadow,illustration,framing,present,rect,text,blend,Scene,connectedCamera,worldFrame,refreshFonts:()=>textures.clear()};
  }
  const api={CAMERA,project,unproject,depth,local,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
