/* Bounded terrain tiles, shared ocean projection, and quiet navigation overlays. */
(function(root){
  'use strict';
  const E=root.WidewakeEstuary,O=root.WidewakeOcean,W=root.WidewakeWaterways;
  const ground=(field,x,y)=>{const p=field.sample(x,y);return p.depth>0?0:Math.min(7,.8-p.edge*.055);};
  const vertex=`#version 300 es
    precision highp float;layout(location=0) in vec3 position;layout(location=1) in vec3 tint;layout(location=2) in vec4 water;
    uniform vec2 uSize;uniform vec2 uCamera;uniform float uZoom;out vec3 vColor;out vec2 vWorld;out vec2 vFlatWorld;out vec4 vWater;
    void main(){vec3 p=position-vec3(uCamera,0.);vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);vColor=tint;vWorld=position.xy;vFlatWorld=position.xy-position.z*1.22474487;vWater=water;}`;
  const fragment=`#version 300 es
    precision highp float;in vec3 vColor;in vec2 vWorld;in vec2 vFlatWorld;in vec4 vWater;uniform vec2 uCamera;uniform float uTime;uniform float uZoom;out vec4 color;
    ${root.WidewakeOceanArt.waterGLSL}
    void main(){vec3 c=vColor;gl_FragDepth=gl_FragCoord.z;
      if(vWater.x>0.){vec2 surfaceWorld;vec3 wave=seaSample(vFlatWorld,uTime,vWater.x,vWater.y,surfaceWorld);c=seaColorAt(surfaceWorld,wave,vWater.x,vWater.y,vWater.zw,uTime,uZoom);
        gl_FragDepth=clamp(.5-((surfaceWorld.x+surfaceWorld.y-uCamera.x-uCamera.y)*.6123724+wave.x*.5)/40000.,.005,.995);
        ${W.hazards.filter(h=>h.kind==='heat'||h.kind==='vortex').map(h=>`{vec2 q=vWorld-vec2(${h.x.toFixed(1)},${h.y.toFixed(1)});float d=length(q),r=${h.radius.toFixed(1)};if(d<r){float e=1.-d/r;${h.kind==='heat'?'c=mix(c,vec3(.63,.34,.20),e*.8);float bubbles=smoothstep(.94,1.,sin(d*.31-uTime*1.7));c+=vec3(.30,.30,.23)*bubbles*e*.3;':'float a=atan(q.y,q.x);float line=smoothstep(.88,1.,sin(a*5.+d*.075-uTime*1.2));c+=vec3(.19,.27,.28)*line*e*.5;'}}}`).join('')}
      }
      else{float wide=texture(uNoise,vWorld*.0009).r,grass=texture(uNoise,vWorld*.014).g,grain=texture(uNoise,vWorld*.09).b;float mud=exp(vWater.x*1.4);
        c=vColor*(.88+wide*.12+grass*.10+grain*.025);c=mix(c,vec3(.38,.36,.27)*(1.+grass*.12),mud*.5);}
      // Water writes its displaced surface depth; land keeps its own geometry.
      // All water effects use this same surface, rather than the old flat plane.
      color=vec4(c,1.);}`;
  class Terrain{
    constructor(view){this.view=view;this.cache=new Map();this.queue=[{key:'overview',x:-4096,y:-8192,size:16384,step:128}];this.pending=null;this.serial=1;this.requests=new Map();this.bytes=0;this.clock=0;this.failed=null;this.needed=[];this.props={};this.worker=new Worker('js/widewake-estuary-worker.js?v=0.36.1');this.worker.onmessage=e=>this.receive(e.data);this.worker.onerror=e=>{this.failed=e.message||'Terrain unavailable';this.onError?.(this.failed);};if(view.gl)this.restore();this.pump();}
    restore(){const gl=this.view.gl;this.program=O.program(gl,vertex,fragment);for(const tile of this.cache.values())this.upload(tile);if(this.props)for(const batch of Object.values(this.props))batch.dispose();this.props={};this.initProps();}
    initProps(){if(!this.view.gl)return;const gl=this.view.gl;
      for(const type of ['reed','tree0','tree1','tree2','rock'])this.props[type]=new O.Batch(gl,this.view.meshes[type],1600);
      for(const {type} of this.view.landmarks)this.props[type]=new O.Batch(gl,this.view.meshes[type],1);
      this.props.water_paddle=new O.Batch(gl,this.view.meshes.water_paddle,96);
      for(const kind of new Set(W.landmarks.map(m=>m.kind)))this.props['landmark_'+kind]=new O.Batch(gl,this.view.meshes['landmark_'+kind],32);
      for(const port of W.ports)this.props['landing_'+port.id]=new O.Batch(gl,this.view.meshes['landing_'+port.id],1);
    }
    upload(tile){const gl=this.view.gl;tile.vao=gl.createVertexArray();tile.buffer=gl.createBuffer();gl.bindVertexArray(tile.vao);gl.bindBuffer(gl.ARRAY_BUFFER,tile.buffer);gl.bufferData(gl.ARRAY_BUFFER,tile.vertices,gl.STATIC_DRAW);for(const [index,size,offset] of [[0,3,0],[1,3,12],[2,4,24]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,40,offset);}}
    receive(data){if(data.error){this.failed=data.error;const request=this.requests.get(data.id);request?.reject(Error(data.error));this.requests.delete(data.id);this.pending=null;this.onError?.(data.error);return;}if(data.kind==='route'){const request=this.requests.get(data.id);this.requests.delete(data.id);request?.resolve(data.result);return;}
      const tile={...this.pending,...data,used:this.clock};this.pending=null;if(!this.cache.has(data.key)){if(this.view.gl)this.upload(tile);this.cache.set(data.key,tile);this.bytes+=tile.vertices.byteLength+tile.props.byteLength;}
      this.evict();this.pump();this.onReady?.();
    }
    route(ship,destination){const id=this.serial++;return new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.worker.postMessage({id,kind:'route',ship:{...ship},destination});});}
    update(){const v=this.view,r=v.canvas.getBoundingClientRect(),corners=[[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]].map(p=>v.screenWorld(...p)),size=v.zoom>1.2?256:v.zoom>.4?512:1024,step=v.zoom>2.5?4:v.zoom>.7?8:v.zoom>.4?16:32;
      const minX=Math.max(E.bounds.left,Math.min(...corners.map(p=>p.x))-32),maxX=Math.min(E.bounds.right,Math.max(...corners.map(p=>p.x))+32),minY=Math.max(E.bounds.top,Math.min(...corners.map(p=>p.y))-32),maxY=Math.min(E.bounds.bottom,Math.max(...corners.map(p=>p.y))+32),needed=[];this.clock++;
      for(let y=Math.floor(minY/size)*size;y<=maxY;y+=size)for(let x=Math.floor(minX/size)*size;x<=maxX;x+=size){if(!v.visible(x+size/2,y+size/2,size*v.zoom*v.baseScale*.8+40))continue;const key=[x,y,size,step].join(':');needed.push({x,y,size,step,key,distance:Math.hypot(x+size/2-v.camera.x,y+size/2-v.camera.y)});const tile=this.cache.get(key);if(tile)tile.used=this.clock;}
      this.needed=needed.sort((a,b)=>a.distance-b.distance);this.queue=this.needed.filter(t=>!this.cache.has(t.key)&&this.pending?.key!==t.key);this.evict();this.pump();
    }
    pump(){if(this.pending||!this.queue.length||this.failed)return;this.pending=this.queue.shift();this.worker.postMessage({...this.pending,id:this.serial++,kind:'tile'});}
    evict(){if(this.bytes<24*1048576&&this.cache.size<100)return;const needed=new Set(this.needed.map(t=>t.key)),old=[...this.cache.values()].filter(t=>t.key!=='overview'&&!needed.has(t.key)).sort((a,b)=>a.used-b.used);for(const tile of old){if(this.bytes<20*1048576&&this.cache.size<80)break;this.cache.delete(tile.key);this.bytes-=tile.vertices.byteLength+tile.props.byteLength;this.release(tile);}}
    release(tile){if(this.view.gl&&!this.view.lost){this.view.gl.deleteBuffer(tile.buffer);this.view.gl.deleteVertexArray(tile.vao);}tile.image=null;}
    get ready(){return this.cache.has('overview')&&this.needed.length>0&&this.needed.every(t=>this.cache.has(t.key));}
    renderGPU(v){this.update();const gl=v.gl;v.uniforms(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'uSize'),v.width,v.height);gl.uniform2f(gl.getUniformLocation(this.program,'uCamera'),v.camera.x,v.camera.y);gl.uniform1f(gl.getUniformLocation(this.program,'uZoom'),v.zoom*v.baseScale);gl.uniform1f(gl.getUniformLocation(this.program,'uTime'),v.visualTime);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,v.noise);gl.uniform1i(gl.getUniformLocation(this.program,'uNoise'),2);
      const overview=this.cache.get('overview');if(overview){gl.depthMask(false);gl.bindVertexArray(overview.vao);gl.drawArrays(gl.TRIANGLES,0,overview.vertices.length/10);gl.depthMask(true);v.stats.drawCalls++;}
      for(const entry of this.needed){const tile=this.cache.get(entry.key);if(!tile)continue;gl.bindVertexArray(tile.vao);gl.drawArrays(gl.TRIANGLES,0,tile.vertices.length/10);v.stats.drawCalls++;v.stats.triangles+=tile.vertices.length/30;}
      for(const batch of Object.values(this.props))batch.count=0;v.shadows.batch.count=0;
      for(const entry of this.needed){const tile=this.cache.get(entry.key);if(!tile)continue;const props=tile.props;for(let i=0;i<props.length;i+=5){if(!v.visible(props[i],props[i+1],30))continue;const kind=props[i+3];if(v.zoom<.4&&kind===0)continue;const type=kind===1?'tree'+(Math.floor(Math.abs(props[i]+props[i+1]))%3):kind===0?'reed':'rock';this.props[type].add(props[i]-v.camera.x,props[i+1]-v.camera.y,props[i+2],1,0,props[i+4],0,props[i]*.1);if(kind===1)v.shadows.batch.add(props[i]-v.camera.x,props[i+1]-v.camera.y,props[i+2]+.05,1,0,10*props[i+4],8*props[i+4],7*props[i+4]);}}
      for(const mark of W.landmarks)if(v.visible(mark.x,mark.y,150*v.zoom*v.baseScale+30))this.props['landmark_'+mark.kind].add(mark.x-v.camera.x,mark.y-v.camera.y,ground(v.battle.field,mark.x,mark.y),1,0,mark.scale);
      for(const m of W.landmarks.filter(m=>m.kind==='wheel'))if(v.visible(m.x,m.y,100*v.zoom*v.baseScale)){const base=ground(v.battle.field,m.x,m.y);for(let i=0;i<16;i++){const a=i/16*Math.PI*2+(v.reduced?0:v.visualTime*.22);this.props.water_paddle.add(m.x+Math.cos(a)*16*m.scale-v.camera.x,m.y-v.camera.y,base+(20+Math.sin(a)*16)*m.scale,1,0,m.scale);}}
      for(const port of W.ports)if(v.visible(port.x,port.y,400*v.zoom*v.baseScale+20))this.props['landing_'+port.id].add(port.x-v.camera.x,port.y-v.camera.y,0,1,0);
      for(const part of v.landmarks){if(!v.visible(part.x,part.y,part.radius*v.zoom*v.baseScale+20))continue;this.props[part.type].add(part.x-v.camera.x,part.y-v.camera.y,0,1,0);if(part.shadow)v.shadows.batch.add(part.x-v.camera.x,part.y-v.camera.y,part.shadowZ,1,0,...part.shadow);}
      v.stats.drawCalls+=v.shadows.draw();for(const [type,batch]of Object.entries(this.props)){if(v.atlas?.entries[type])v.stats.drawCalls+=v.atlas.draw(type,batch);else{v.uniforms(v.main);v.stats.drawCalls+=batch.draw();}}v.stats.terrainBytes=this.bytes;v.stats.terrainTiles=this.cache.size;v.stats.tilesPending=this.queue.length+(this.pending?1:0);
    }
    renderCanvas(v){this.update();const c=v.fallback;
      // Cached top-down tile images are projected by the same affine isometry.
      for(const entry of [{key:'overview'},...this.needed]){const tile=this.cache.get(entry.key);if(!tile)continue;const n=tile.size/tile.step;
        if(!tile.image){tile.image=document.createElement('canvas');tile.image.width=tile.image.height=n;const ctx=tile.image.getContext('2d'),pixels=ctx.createImageData(n,n);for(let i=0;i<n*n;i++){const at=i*60;pixels.data[i*4]=tile.vertices[at+3]*255;pixels.data[i*4+1]=tile.vertices[at+4]*255;pixels.data[i*4+2]=tile.vertices[at+5]*255;pixels.data[i*4+3]=tile.vertices[at+6]>0?0:255;}ctx.putImageData(pixels,0,0);}
        const a=v.project(tile.x,tile.y),b=v.project(tile.x+tile.size,tile.y),d=v.project(tile.x,tile.y+tile.size);c.save();c.transform((b.x-a.x)/n,(b.y-a.y)/n,(d.x-a.x)/n,(d.y-a.y)/n,a.x,a.y);c.drawImage(tile.image,0,0);c.restore();}
      const items=[];for(const entry of this.needed){const tile=this.cache.get(entry.key);if(!tile)continue;for(let i=0;i<tile.props.length;i+=5){const p=tile.props,x=p[i],y=p[i+1],kind=p[i+3];if(!v.visible(x,y,30)||(v.zoom<.4&&kind===0))continue;items.push({type:kind===1?'tree'+(Math.floor(Math.abs(x+y))%3):kind===0?'reed':'rock',x,y,z:p[i+2],scale:p[i+4]});}}
      for(const mark of W.landmarks)if(v.visible(mark.x,mark.y,150*v.zoom*v.baseScale+30))items.push({type:'landmark_'+mark.kind,x:mark.x,y:mark.y,z:ground(v.battle.field,mark.x,mark.y),scale:mark.scale});
      for(const m of W.landmarks.filter(m=>m.kind==='wheel'))if(v.visible(m.x,m.y,100*v.zoom*v.baseScale)){const base=ground(v.battle.field,m.x,m.y);for(let i=0;i<16;i++){const a=i/16*Math.PI*2+(v.reduced?0:v.visualTime*.22);items.push({type:'water_paddle',x:m.x+Math.cos(a)*16*m.scale,y:m.y,z:base+(20+Math.sin(a)*16)*m.scale,scale:m.scale});}}
      for(const port of W.ports)if(v.visible(port.x,port.y,400*v.zoom*v.baseScale+20))items.push({type:'landing_'+port.id,x:port.x,y:port.y,z:0,scale:1});
      for(const part of v.landmarks)if(v.visible(part.x,part.y,part.radius*v.zoom*v.baseScale+20))items.push({type:part.type,x:part.x,y:part.y,z:0,scale:1});items.sort((a,b)=>a.x+a.y-b.x-b.y);for(const item of items)v.paintSprite(item.type,0,item.x,item.y,item.scale,item.z);
      v.stats.terrainBytes=this.bytes;v.stats.terrainTiles=this.cache.size;v.stats.tilesPending=this.queue.length+(this.pending?1:0);
    }
    dispose(){this.worker.terminate();for(const request of this.requests.values())request.reject(Error('Scene closed'));this.requests.clear();for(const tile of this.cache.values())this.release(tile);this.cache.clear();if(this.view.gl&&!this.view.lost){for(const batch of Object.values(this.props))batch.dispose();this.view.gl.deleteProgram(this.program);}}
  }
  class View extends O.Ocean{
    constructor(canvas,navigation){super(canvas,navigation);this.lookAhead=true;this.configureCamera();this.zoom=this.targetZoom=this.stops.helm;this.terrain=new Terrain(this);}
    configureCamera(){
      // Bound distance by the smallest hull at its most foreshortened heading.
      // This changes the camera, leaving visible hulls and physical contacts at
      // the same metre scale. A large escort cannot shrink the launch into a dot.
      const ships=this.battle.ships.filter(s=>s.hp>0),length=this.battle.player.length,largest=Math.max(length,...ships.map(s=>s.length)),close=40/length;
      const friendly=Math.max(...ships.map(s=>O.readableScale(s,16))),hostile=Math.max(...root.WidewakeBattle.enemies.map(s=>O.readableScale(s,12)));
      const wide=Math.max(friendly,hostile,this.minimumZoom()*this.baseScale),fleet=Math.max(Math.min(close*.5,48/largest),wide*1.3);
      this.stops={helm:Math.max(close,fleet*1.3)/this.baseScale,fleet:fleet/this.baseScale,survey:wide/this.baseScale};
    }
    resize(){const old=this.stops,stop=old&&Object.keys(old).find(k=>Math.abs(old[k]-this.targetZoom)<.001),previous=this.baseScale;super.resize();if(old){this.configureCamera();if(!this.battle.port&&previous){this.zoom=E.clamp(this.zoom*previous/this.baseScale,this.stops.survey,this.stops.helm*1.65);this.targetZoom=stop?this.stops[stop]:E.clamp(this.targetZoom*previous/this.baseScale,this.stops.survey,this.stops.helm*1.65);this.anchor=null;}}}
    setZoom(value,x,y){super.setZoom(value,x,y);this.targetZoom=E.clamp(value,this.stops.survey,this.stops.helm*1.65);}
    zoomStop(name){if(this.stops?.[name]){this.anchor=null;this.offset.x=this.offset.y=0;this.targetZoom=this.stops[name];}}
    waterwayMotion(c){
      const time=this.reduced?0:this.visualTime,field=this.battle.field,scale=this.zoom*this.baseScale;
      c.save();c.lineWidth=Math.max(.6,Math.min(1.5,scale*.4));
      for(const h of W.hazards){if(!this.visible(h.x,h.y,(h.radius+80)*scale))continue;
        // The warning perimeter is the physical field radius, in world space.
        c.strokeStyle=h.kind==='heat'?'#edb78985':'#b1ddd461';c.setLineDash([4,7]);c.beginPath();
        for(let i=0;i<=72;i++){const a=i/72*Math.PI*2,q=this.project(h.x+Math.cos(a)*h.radius,h.y+Math.sin(a)*h.radius);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);}c.stroke();c.setLineDash([]);
        for(let i=0;i<32;i++){const a=i*2.39996,r=h.radius*(.16+.81*((i*17%31)/31)),spin=h.kind==='vortex'?time*.04:0,x=h.x+Math.cos(a+spin)*r,y=h.y+Math.sin(a+spin)*r,w=field.sample(x,y,{});if(w.depth<=0)continue;const q=this.project(x,y),to=this.project(x+w.currentX*5,y+w.currentY*5);c.strokeStyle=h.kind==='heat'?'#ecd3a777':'#b8dfd288';c.beginPath();c.moveTo(q.x,q.y);c.lineTo(to.x,to.y);c.stroke();}
        const q=this.project(h.x,h.y);c.font='9px "Commit Mono",monospace';c.textAlign='center';c.fillStyle='#e6d5b0';c.fillText(h.name,q.x,q.y-h.radius*scale*.35-12);
      }
      // Local shore motion stays sparse and freezes under reduced motion/pause.
      for(const m of W.landmarks){if(!this.visible(m.x,m.y,150*scale))continue;
        if(m.kind==='falls'||m.kind==='volcano')for(let i=0;i<9;i++){const f=(time*.25+i/9)%1,q=this.project(m.x+(m.kind==='falls'?(i-4)*4:12+f*80)*m.scale,m.y+(m.kind==='falls'?f*8:Math.sin(f*4)*3),ground(field,m.x,m.y)+(m.kind==='falls'?(1-f)*24:Math.max(0,60*(65-12-f*80)/55))*m.scale);c.fillStyle=m.kind==='falls'?'#dbefdf99':'#f6bc7066';c.fillRect(q.x,q.y,Math.max(1,scale*m.scale),Math.max(1,scale*m.scale*2));}
        if(m.kind==='roost')for(let i=0;i<3;i++){const x=m.x+Math.sin(time*.14+i)*35,y=m.y+Math.cos(time*.14+i)*18,q=this.project(x,y,13+i*2),wing=(this.reduced?2:2+Math.sin(time*4+i)*1.5)*Math.min(2,scale);c.strokeStyle='#d8e0c7';c.beginPath();c.moveTo(q.x-wing,q.y-2);c.lineTo(q.x,q.y);c.lineTo(q.x+wing,q.y-2);c.stroke();}
      }
      c.restore();
    }
    labels(){const c=this.ctx,n=this.battle,s=n.player,pose=this.poses[0],p=this.project(pose.x,pose.y),scale=this.zoom*this.baseScale;c.clearRect(0,0,this.width,this.height);this.waterwayMotion(c);c.font='8px "Commit Mono", monospace';c.textAlign='center';if(n.port)return;
      if(root.WidewakeReach){for(const site of root.WidewakeReach.sites){if(n.rank<site.rank)continue;const q=this.project(site.x,site.y),r=Math.max(7,site.radius*scale*.18);if(q.x<0||q.y<0||q.x>this.width||q.y>this.height)continue;c.strokeStyle='#a3cfbe66';c.setLineDash([2,4]);c.beginPath();c.ellipse(q.x,q.y,r,r*.5,0,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle='#b6d2c8';c.fillText(site.name,q.x,q.y-r*.5-6);}
        for(const item of n.loot||[]){if(scale>.65)continue;const q=this.project(item.x,item.y);c.fillStyle='#ceb886';c.fillRect(q.x-2,q.y-2,4,4);c.strokeStyle='#637c74';c.strokeRect(q.x-3,q.y-3,6,6);}
        for(const ship of n.ships){if(ship.hp<=0||ship.id===0||ship.hp>=ship.maxHp&&!ship.working)continue;const q=this.project(ship.x,ship.y,ship.height+3);c.fillStyle='#112633';c.fillRect(q.x-10,q.y-1,20,3);c.fillStyle=ship.hp<ship.maxHp*.3?'#e6977d':'#9fc6b5';c.fillRect(q.x-10,q.y-1,20*ship.hp/ship.maxHp,2);}}
      // At chart distance, a small leader sits above the hull. Nothing is drawn
      // over the boat itself, including when it touches a bank.
      if(s.length*scale<7){const top=this.project(pose.x,pose.y,s.height);c.strokeStyle='#c0d6cd88';c.beginPath();c.moveTo(top.x,top.y-3);c.lineTo(top.x,top.y-10);c.stroke();c.fillStyle='#deeadc';c.fillRect(top.x-2,top.y-13,4,2);}
      for(const port of E.ports){if(Math.hypot(port.x-s.x,port.y-s.y)<Math.max(80,s.length*2))continue;const q=this.project(port.x,port.y);if(q.x<20||q.x>this.width-20||q.y<45||q.y>this.height-45)continue;c.fillStyle='#d3d8be';c.fillText(port.name,q.x,q.y-22);c.strokeStyle='#a6c2ad66';c.beginPath();c.ellipse(q.x,q.y,Math.max(4,12*scale),Math.max(2,6*scale),0,0,Math.PI*2);c.stroke();}
      if(n.route){c.strokeStyle='#b1d9cc77';c.setLineDash([2,5]);c.beginPath();c.moveTo(p.x,p.y);for(let i=n.route.index;i<Math.min(n.route.index+25,n.route.points.length);i++){const q=this.project(n.route.points[i].x,n.route.points[i].y);c.lineTo(q.x,q.y);}c.stroke();c.setLineDash([]);}
      // The campaign has a labelled camera tool and a scale on its chart.
      if(root.WidewakeReach&&n instanceof root.WidewakeReach.Game)return;
      const metres=scale>1?20:scale>.3?100:250,len=metres*scale,x=this.width/2-len/2;c.textAlign='center';c.fillStyle='#b9cdca';c.fillText(metres+' m',this.width/2,this.height-17);c.strokeStyle='#a9c0be';c.beginPath();c.moveTo(x,this.height-10);c.lineTo(x+len,this.height-10);c.stroke();
    }
  }
  root.WidewakeEstuaryView={View,Terrain};
})(globalThis);
