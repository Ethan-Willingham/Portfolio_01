/* All Four Wheels: a shared 2:1 isometric pixel renderer.
 * The simulation stays in store coordinates. Every visible floor point,
 * caster, body, piece of furniture and airborne product uses this camera.
 */
(function (root) {
  'use strict';
  const CAMERA = Object.freeze({ width:720, height:480, x:264, y:70, horizontal:.84, vertical:.42, elevation:.95 });
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
    const c=Math.cos(b.a||0),s=Math.sin(b.a||0);
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
    const low=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y)))),high=Math.min(g.canvas.height,Math.ceil(Math.max(...points.map(p=>p.y))));
    g.fillStyle=color;
    for(let y=low;y<high;y++) {
      const cuts=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],b=points[(i+1)%points.length];
        if((a.y<=y+.5&&b.y>y+.5)||(b.y<=y+.5&&a.y>y+.5))cuts.push(a.x+(y+.5-a.y)*(b.x-a.x)/(b.y-a.y));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i+=2) {
        const x=Math.max(0,Math.round(cuts[i])),end=Math.min(g.canvas.width,Math.round(cuts[i+1]));
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
    const Physics=root.CartPhysics,Stock=root.CartStock;
    if(!Physics||!Stock)throw new Error('The cart view needs the cart simulation.');
    const {BODY,WHEELS,CASTER,CHECKPOINT_RADIUS,CHECKPOINT_SENSOR,casterPose,casterCorners,corners,ROOM}=Physics;
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
      constructor(){this.commands=[];this.sequence=0;}
      push(points,draw,bias=0) {
        this.commands.push({depth:points.reduce((n,p)=>n+depth(p),0)/points.length+bias,order:this.sequence++,draw});
      }
      face(points,color,alpha=1,detail=null,edges=false) {
        const n=normalize(cross(subtract(points[1],points[0]),subtract(points[2],points[0])));
        if(n.x+n.y+n.z*VIEW_Z<=.005)return;
        const tint=shade(color,n);
        this.push(points,(g,origin)=>{
          g.globalAlpha=alpha;const q=points.map(p=>project(p,origin));poly(g,q,tint);
          if(edges){g.globalAlpha=alpha*.3;for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],n.z>.6?P.cream:P.dark);}
          g.globalAlpha=1;if(detail)detail(g,q,origin);
        });
      }
      flat(points,color,alpha=1,bias=0) {
        this.push(points,(g,origin)=>{g.globalAlpha=alpha;poly(g,points.map(p=>project(p,origin)),color);g.globalAlpha=1;},bias);
      }
      wire(a,b,color=P.steel,width=1,alpha=1) {
        this.push([a,b],(g,origin)=>{g.globalAlpha=alpha;line(g,project(a,origin),project(b,origin),color,width);g.globalAlpha=1;},.04);
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
      limb(a,b,width,endWidth,color,highlight=null) {
        this.push([a,b],(g,origin)=>{
          const p=project(a,origin),q=project(b,origin),length=Math.hypot(q.x-p.x,q.y-p.y)||1,nx=-(q.y-p.y)/length,ny=(q.x-p.x)/length;
          const silhouette=(w,h)=>[{x:p.x+nx*w/2,y:p.y+ny*w/2},{x:q.x+nx*h/2,y:q.y+ny*h/2},{x:q.x-nx*h/2,y:q.y-ny*h/2},{x:p.x-nx*w/2,y:p.y-ny*w/2}];
          poly(g,silhouette(width+1,endWidth+1),P.dark);poly(g,silhouette(width,endWidth),color);
          if(highlight)line(g,add(p,-.5),add(q,-.5),highlight);
        });
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
      g.globalAlpha=alpha;line(g,project(a),project(b),color,width);g.globalAlpha=1;
    }
    function groundLocal(g,b,x,y,w,h,color,alpha=1) {groundPoly(g,quad(x,y,w,h).map(p=>local(b,p.x,p.y)),color,alpha);}
    function groundRing(g,p,r,color,width=1,alpha=1) {
      const q=circle(p,r).map(v=>project(v));g.globalAlpha=alpha;
      for(let i=0;i<q.length;i++)line(g,q[i],q[(i+1)%q.length],color,width);g.globalAlpha=1;
    }
    function groundArrow(g,b,length,color,alpha=1) {
      groundLocal(g,b,-length/2,-1.2,length-5,2.4,color,alpha);
      groundPoly(g,[[length/2,0],[length/2-8,-5],[length/2-8,5]].map(p=>local(b,...p)),color,alpha);
    }
    function floorTexture(g,level) {
      const grout=blend(P.floor,P.hairDark,.19);
      groundPoly(g,quad(8,8,464,284),grout);
      // Deterministic terrazzo, laid in the same plane as the physical floor.
      for(let row=0,y=8;y<292;row++,y+=24)for(let col=0,x=8;x<472;col++,x+=24) {
        const seed=col*137+row*911,v=hash(seed,41),w=Math.min(23,472-x),h=Math.min(23,292-y);
        const tint=blend(blend(P.floor,P.cream,.14+v*.15),v>.58?P.gold:P.clay,.05);
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
    function room(scene,level) {
      const tr=(x,y,z)=>({x,y,z});
      const exit=Physics.exitGeometry(level.exit),front=blend(P.floor,P.hairDark,.37);
      scene.box(tr,8,8,-8,464,284,8,front,P.floor,true);
      for(const side of ['top','left','right','bottom']) {
        const vertical=side==='left'||side==='right',far=side==='top'||side==='left',height=far?23:2;
        const start=vertical?8:8,end=vertical?292:472;
        const runs=exit.side===side?[[start,exit.low],[exit.high,end]]:[[start,end]];
        for(const [a,b]of runs) {
          if(b<=a)continue;
          const x=vertical?(side==='left'?5:472):a,y=vertical?a:(side==='top'?5:292),w=vertical?3:b-a,h=vertical?b-a:3;
          scene.box(tr,x,y,0,w,h,height,P.floor,P.cream,true);
          scene.box(tr,x,y,0,w,h,2,P.steelShade,P.steel);
          if(far)scene.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.38),P.cream);
        }
      }
    }
    function makeFloor(level) {
      const c=document.createElement('canvas');c.width=CAMERA.width;c.height=CAMERA.height;const g=c.getContext('2d');
      const matte=blend(P.hairDark,P.edge,.48);rect(g,0,0,c.width,c.height,matte);
      // A broad contact shadow makes the cutaway store feel like a solid diorama.
      groundPoly(g,quad(8,8,464,284,-11),P.dark,.3);
      const shell=new Scene();room(shell,level);shell.flush(g);
      floorTexture(g,level);exitApron(g,Physics.exitGeometry(level.exit));
      // Render far walls after the tiles, so their feet meet the grout cleanly.
      const walls=new Scene();
      const exit=Physics.exitGeometry(level.exit),tr=(x,y,z)=>({x,y,z});
      for(const side of ['top','left']) {
        const vertical=side==='left',end=vertical?292:472,runs=exit.side===side?[[8,exit.low],[exit.high,end]]:[[8,end]];
        for(const [a,b]of runs) {
          const x=vertical?5:a,y=vertical?a:5,w=vertical?3:b-a,h=vertical?b-a:3;
          if(w<=0||h<=0)continue;
          walls.box(tr,x,y,0,w,h,23,P.floor,P.cream,true);walls.box(tr,x,y,0,w,h,3,P.steelShade,P.steel);
          walls.box(tr,x,y,17,w,h,2,blend(P.floor,P.cream,.35),P.cream);
        }
      }
      walls.flush(g);
      for(const sign of level.signs) {
        const p=project(sign);text(g,sign.text,p.x,p.y,P.edge,5,'center');
      }
      return c;
    }
    function furnitureVertices(s) {
      return [[-s.w/2,-s.h/2],[s.w/2,-s.h/2],[s.w/2,s.h/2],[-s.w/2,s.h/2]].flatMap(([u,v])=>[Stock.shelfPoint(s,u,v,0),Stock.shelfPoint(s,u,v,s.height)]);
    }
    function clipFloor(g) {
      const p=quad(8,8,464,284).map(v=>project(v));g.beginPath();g.moveTo(p[0].x,p[0].y);for(const q of p.slice(1))g.lineTo(q.x,q.y);g.closePath();g.clip();
    }
    function drawFurnitureShadow(g,s) {
      g.save();clipFloor(g);
      const points=Stock.hull(furnitureVertices(s).map(p=>({x:p.x+p.z*.42,y:p.y+p.z*.3,z:0})));
      groundPoly(g,points.map(p=>add(p,2,2)),P.dark,.07);groundPoly(g,points,P.dark,.2);g.restore();
    }
    function shelf(scene,s) {
      const tr=(x,y,z)=>Stock.shelfPoint(s,x,y,z),box=(...args)=>scene.box(tr,...args);
      if(s.kind==='table') {
        for(const u of [-s.w*.4,s.w*.4])for(const v of [-s.h*.4,s.h*.4])box(u-1.5,v-1.5,0,3,3,s.height-3,P.clay,P.gold,true);
        box(-s.w/2+1,-s.h/2+2,s.height-7,s.w-2,2,4,P.clay);
        box(-s.w/2+2,-s.h/2+1,s.height-7,2,s.h-2,4,P.clay);
        box(-s.w/2,-s.h/2,s.height-3,s.w,s.h,3,P.clay,P.gold,true);
        for(let v=-s.h/2+7;v<s.h/2-2;v+=7)scene.wire(tr(-s.w/2+2,v,s.height+.03),tr(s.w/2-2,v,s.height+.03),P.hair,1,.16);
      }else{
        // Open end frames leave each solid deck and the stocked tiers visible.
        for(const u of [-s.w/2+1,s.w/2-3])for(const z of [3,s.height-5])box(u,-s.h/2+1,z,2,s.h-2,3,P.steel,P.steelLight);
        box(-s.w/2+3,-s.h/2+1,5,s.w-6,2,s.height-8,P.hair,P.gold,true);
        for(const z of [12,22,32]) {
          box(-s.w/2+2,-s.h/2+2,z-2,s.w-4,s.h-4,2,P.clay,P.gold,true);
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
      const pose=casterPose(b,wheel,i),tr=(x,y,z)=>local(pose,x,y,z),count=12,l=CASTER.halfLength,h=CASTER.halfWidth;
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
        const axle=tr(0,side*(h+.5),l),pin=local(b,...WHEELS[i],9);
        const fork=add(pin,-Math.sin(wheel.a)*side*1.5,Math.cos(wheel.a)*side*1.5,-1);
        scene.wire(axle,fork,P.dark,3);scene.wire(axle,fork,P.steel,1);
      }
      const bearing=local(b,...WHEELS[i],9);
      scene.flat(circle(bearing,1.6,1.6,0,8),P.steelShade);
      scene.flat(circle(bearing,1.1,1.1,.4,8),P.gold);
      scene.wire(add(bearing,0,0,.6),add(bearing,0,0,2),P.steelLight,1);
    }
    function shopper(scene,b,gait) {
      const phase=gait.phase||0,stride=gait.stride||0,forward=gait.forward??1,sideways=gait.sideways||0;
      const lx=gait.leanX||0,ly=gait.leanY||0,sway=Math.cos(phase)*Math.min(1,stride/2.8)*.25;
      const tr=(x,y,z)=>local(b,x,y,z);
      for(const side of [-1,1]) {
        const t=((phase/(Math.PI*2)+(side===1?.5:0))%1+1)%1,swing=Math.max(0,(t-.6)/.4);
        const reach=t<.6?1-t/.3:-1+2*swing*swing*(3-2*swing),lift=Math.sin(swing*Math.PI)*Math.min(1,stride/2.8)*4;
        const travel=reach*stride,x=-17+travel*forward,y=side*3.2+travel*sideways*.75;
        const hip=tr(-16,side*2.6,18),knee=tr(-17+travel*forward*.35+lift*.25,side*3+travel*sideways*.3,9+lift*.35),ankle=tr(x,y,2+lift);
        scene.limb(hip,knee,3.4,2.8,P.steelShade,P.blue);scene.limb(knee,ankle,2.8,2,P.edge);
        const shoe={...tr(x,y,lift),a:b.a+side*.12+clamp(sideways*.18,-.18,.18)},foot=(u,v,z)=>local(shoe,u,v,z);
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
      const head=tr(-15+lx,ly+sway,36.5),headTr=(x,y,z)=>local({...head,a:b.a},x,y,z);
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
    function cart(scene,b,wheels,gait) {
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
      shopper(scene,b,gait||{phase:0,stride:0,forward:1,sideways:0});
    }
    function drawCart(g,b,wheels,gait,origin=CAMERA) {const scene=new Scene();cart(scene,b,wheels,gait);scene.flush(g,origin);}
    function drawShelf(g,s) {const scene=new Scene();shelf(scene,s);for(const p of s.stockItems)if(p.state==='shelf')product(scene,p);scene.flush(g);}
    function spills(g,stock) {
      for(const liquid of stock.liquids.values())for(const [key,volume]of liquid.cells) {
        const x=key%120*Stock.CELL,y=Math.floor(key/120)*Stock.CELL;
        if(liquid.kind==='water') {
          groundPoly(g,quad(x,y,4,4),P.blue,clamp(volume*.2,.018,.13));
          if(volume>.055) {
            const dry=k=>(liquid.cells.get(k)||0)<=.055;
            if(dry(key+1))groundLine(g,{x:x+4,y},{x:x+4,y:y+4},P.steelShade,1,.4);
            if(dry(key+120))groundLine(g,{x,y:y+4},{x:x+4,y:y+4},P.steelShade,1,.4);
            if(dry(key-120))groundLine(g,{x,y},{x:x+4,y},P.light,1,.75);
            if(dry(key-1))groundLine(g,{x,y},{x,y:y+4},P.light,1,.75);
            if(volume>.13&&hash(key,7)>.83)groundLine(g,{x,y:y+1},{x:x+4,y},P.light,1,.7);
          }
        }else groundPoly(g,quad(x,y,4,4),spillColor(liquid.kind),clamp(volume*1.4,.025,.65));
      }
      for(const smear of stock.smears)groundLocal(g,smear,-2,-.7,4,1.5,smear.kind==='water'?P.steelLight:spillColor(smear.kind),smear.alpha*(smear.kind==='water'?.45:1));
    }
    function routes(g,w) {
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
        else text(g,String(i+1),q.x,q.y+3,color,current?10:8,'center');
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
      g.save();clipFloor(g);
      for(const s of w.shelves)drawFurnitureShadow(g,s);
      const b=w.body;
      groundPoly(g,circle(local(b,14,0),23,12),P.dark,.12);
      groundPoly(g,circle(local(b,-16,1),6,5),P.dark,.22);
      groundPoly(g,Stock.hull([local(b,-20,-5),local(b,-12,5),local(b,4,13),local(b,-4,2)]),P.dark,.09);
      for(const o of w.objects)groundPoly(g,circle(add(o,3,3),o.kind==='box'?10:7,o.kind==='box'?8:5),P.dark,.18);
      for(const p of w.stock.items)if(p.state!=='shelf'&&!p.broken&&p.kind!=='shard')groundPoly(g,circle(add(p,1,1,-p.z),Math.max(2,p.length),p.width),P.dark,.13);
      g.restore();
    }
    function sensor(g,w) {
      if(w.exitOpen)return;
      const q=local(w.body,CHECKPOINT_SENSOR.x,0),r=CHECKPOINT_SENSOR.radius;
      // A ground ring measures contact. Its matching badge is on the raised
      // basket bottom, connected by a faint plumb line for a readable target.
      groundRing(g,q,r,P.hairDark,3,.8);groundRing(g,q,r,P.coral,1,1);
      const high=project(add(q,0,0,16.1)),low=project(q);
      g.globalAlpha=.55;line(g,low,high,P.coral);g.globalAlpha=1;
      oval(g,high.x,high.y,2.5,2,P.coral);rect(g,high.x,high.y,1,1,P.light);
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
    function draw(g,w,background,options={}) {
      const preview=options.preview;
      g.save();g.imageSmoothingEnabled=false;g.clearRect(0,0,g.canvas.width,g.canvas.height);
      if(!preview&&options.shake&&!options.reducedMotion)g.translate(Math.round(Math.sin(w.time*99)*options.shake),Math.round(Math.cos(w.time*78)*options.shake));
      g.drawImage(background,0,0);spills(g,w.stock);shadows(g,w);routes(g,w);
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
      cart(scene,w.body,w.wheels,w.gait);
      if(!preview)for(const p of options.particles||[]) {
        const tr=(x,y,z)=>local({...p,z:0},x,y,z);
        scene.flat([tr(-p.w/2,-p.h/2,p.z),tr(p.w/2,-p.h/2,p.z),tr(p.w/2,p.h/2,p.z),tr(-p.w/2,p.h/2,p.z)],p.color,clamp(p.life,0,1));
      }
      scene.flush(g);
      if(!preview){sensor(g,w);boundaries(g,w);}
      g.restore();
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
        const mw=144,mh=96,mx=width-mw-14,my=14;
        rect(g,mx-3,my-3,mw+6,mh+6,P.hairDark);g.drawImage(frame,mx,my,mw,mh);
        g.save();g.beginPath();g.rect(mx,my,mw,mh);g.clip();
        const a={x:mx+(-camera.x/camera.scale)/5,y:my+(-camera.y/camera.scale)/5};
        const b={x:a.x+width/camera.scale/5,y:a.y+height/camera.scale/5};
        line(g,a,{x:b.x,y:a.y},P.light);line(g,{x:b.x,y:a.y},b,P.light);line(g,b,{x:a.x,y:b.y},P.light);line(g,{x:a.x,y:b.y},a,P.light);
        const q=project(w.body);rect(g,mx+q.x/5-1,my+q.y/5-1,3,3,P.coral);g.restore();
      }
      g.restore();
    }
    return {draw,makeFloor,drawCart,drawShelf,drawFurnitureShadow,illustration,framing,present,rect,text,blend,Scene,refreshFonts:()=>textures.clear()};
  }
  const api={CAMERA,project,unproject,depth,local,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CartView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
