/* Orthographic isometric ocean. Instanced hull geometry and bounded GPU buffers. */
(function(root){
  'use strict';
  const A=Math.SQRT1_2,B=A*.5,H=Math.sqrt(.75),TAU=Math.PI*2;
  const stops=Object.freeze({helm:.66,fleet:.27,survey:.12});
  const palette={water:'#123b55',ink:'#101a29',cream:'#e8dfb5',cyan:'#89d0d2',gold:'#ffc978',coral:'#ee826c'};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function project(x,y,z=0){return{x:(x-y)*A,y:(x+y)*B-z*H};}
  function unproject(x,y){return{x:(x/A+y/B)*.5,y:(y/B-x/A)*.5};}
  function direction(x,y){const p=unproject(x,y),n=Math.hypot(p.x,p.y)||1,m=Math.min(1,Math.hypot(x,y));return{x:p.x/n*m,y:p.y/n*m};}
  function color(hex,shade=1){const n=parseInt(hex.replace('#',''),16);return[(n>>16)/255*shade,(n>>8&255)/255*shade,(n&255)/255*shade];}
  function geometry(){
    const out=[];
    const tri=(a,b,c,tint)=>{const rgb=color(tint);for(const p of [a,b,c])out.push(...p,...rgb);};
    const face=(points,tint)=>{for(let i=1;i<points.length-1;i++)tri(points[0],points[i],points[i+1],tint);};
    const box=(x,y,z,l,w,h,top,side='#39586b')=>{
      const a=[x-l/2,y-w/2,z],b=[x+l/2,y-w/2,z],c=[x+l/2,y+w/2,z],d=[x-l/2,y+w/2,z],aa=[a[0],a[1],z+h],bb=[b[0],b[1],z+h],cc=[c[0],c[1],z+h],dd=[d[0],d[1],z+h];
      face([a,b,bb,aa],side);face([b,c,cc,bb],side);face([c,d,dd,cc],side);face([d,a,aa,dd],side);face([aa,bb,cc,dd],top);
    };
    const hull=(l,w,h,top,side,keel)=>{
      const ring=[[-l*.47,-w*.36],[-l*.29,-w*.5],[l*.23,-w*.48],[l*.53,0],[l*.23,w*.48],[-l*.29,w*.5],[-l*.47,w*.36]],upper=ring.map(p=>[p[0],p[1],h]),lower=ring.map(p=>[p[0]*.9,p[1]*.82,0]);
      face(upper,top);for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length;face([lower[i],lower[j],upper[j],upper[i]],i%3===0?keel:side);}
    };
    return{out,tri,face,box,hull};
  }
  function boatMesh(type,spec){
    const g=geometry(),l=spec.length,w=spec.width,h=Math.min(9,spec.height*.38),enemy=type.startsWith('raider');
    g.hull(l,w,h,enemy?'#a0766b':'#aebdb6',enemy?'#573f52':'#395e73',enemy?'#332f43':'#172d42');
    if(enemy){g.box(-l*.1,0,h,l*.3,w*.62,3,'#d18b77','#674657');g.box(l*.24,0,h,2.5,2,3,'#424352','#242d3b');return new Float32Array(g.out);}
    g.box(-l*.1,0,h+.2,l*.65,w*.68,1.5,'#777c73','#526475');
    g.box(-l*.25,0,h+1,l*.24,w*.61,spec.height*.35,'#d2d5bd','#54849a');
    g.box(-l*.27,0,h+spec.height*.35+1,l*.28,w*.68,1.5,'#dbe0cb','#7ab5bf');
    g.box(-l*.25,-w*.31,h+spec.height*.22,l*.15,1,spec.height*.12,'#163f58','#163f58');
    g.box(-l*.29,0,spec.height*.65,2,2,spec.height*.45,'#94c5c4','#3b7180');
    if(type==='trawler'){
      for(const side of [-1,1]){g.box(l*.08,side*w*.42,h,2,2,17,'#d7c392','#7a715c');g.box(l*.08,side*w*.15,h+16,2,w*.75,2,'#c6b282','#716a5b');}
      g.box(l*.1,0,h,13,9,3,'#718b83','#3e655e');g.box(-l*.4,0,h,3,6,4,'#dc9d5c','#936440');
    }else if(type==='oilrig'){
      g.box(l*.13,0,h,21,21,3,'#b9ad87','#786c55');
      for(const side of [-1,1])for(const sy of [-1,1])g.box(l*.1+side*7,sy*7,h+2,2,2,25,'#bfae7f','#796c56');
      for(let n=0;n<4;n++)g.box(l*.1,0,h+5+n*7,18,18,1.3,'#a49c7b','#6f705d');g.box(l*.1,0,h+30,10,10,2,'#e0c891','#7b785e');
    }else if(type==='repair'){
      g.box(l*.1,0,h,11,9,6,'#a7c4a1','#5a7d78');g.box(l*.1,0,h+6.1,3,8,.3,'#eee3c3');g.box(l*.1,0,h+6.2,8,3,.3,'#eee3c3');
    }else{
      if(type==='flagship'){g.box(-l*.03,0,h+2,8,8,11,'#728591','#3a4f65');g.box(-l*.03,0,h+13,10,10,1.5,'#c5caba','#608f9b');}
    }
    g.box(l*.43,0,h+1,3,w*.3,1,'#edc777','#b48c5a');return new Float32Array(g.out);
  }
  function simpleMesh(type){const g=geometry();
    if(type==='turret'||type==='mortar'){g.box(0,0,0,7,7,4,'#8297a0','#2c465d');g.box(6,0,4,type==='mortar'?15:12,type==='mortar'?3:1.8,2,'#d3d0af','#55636c');if(type==='mortar')g.box(11,0,6,5,3,2,'#d3d0af','#55636c');}
    if(type==='shot'){g.box(0,0,0,22,1.4,1.4,'#fff2ca','#f3b65d');}
    if(type==='hostile'){g.box(0,0,0,18,3,2,'#ffb297','#9e423e');}
    if(type==='shell'){g.box(0,0,0,7,4,4,'#ffe4b0','#ce8a50');}
    if(type==='wake'){g.face([[-8,-5,0],[-85,-22,0],[-66,-17,0],[-8,-3,0]],'#366d80');g.face([[-8,5,0],[-85,22,0],[-66,17,0],[-8,3,0]],'#366d80');g.face([[-15,-5,.1],[-48,-10,.1],[-37,-8,.1],[-12,-3,.1]],'#75aeb1');g.face([[-15,5,.1],[-48,10,.1],[-37,8,.1],[-12,3,.1]],'#75aeb1');}
    return new Float32Array(g.out);
  }
  const vertex=`#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aColor;
    layout(location=2) in vec4 aWorld;
    layout(location=3) in vec4 aPose;
    uniform vec2 uSize;
    uniform float uZoom;
    out vec3 vColor;
    void main(){
      vec3 q=aPosition*aPose.y;
      vec3 p=vec3(q.x*aWorld.w-q.y*aPose.x,q.x*aPose.x+q.y*aWorld.w,q.z)+aWorld.xyz;
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);
      vColor=mix(aColor,vec3(1.,.94,.77),aPose.z);
    }`;
  const fragment=`#version 300 es
    precision mediump float;in vec3 vColor;out vec4 color;void main(){color=vec4(vColor,1.);}`;
  const waterVertex=`#version 300 es
    precision highp float;layout(location=0) in vec2 aPosition;out vec2 uv;void main(){uv=aPosition;gl_Position=vec4(aPosition,1.,1.);}`;
  const waterFragment=`#version 300 es
    precision highp float;in vec2 uv;uniform vec2 uSize;uniform vec2 uCamera;uniform float uZoom;uniform float uTime;out vec4 color;
    float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
    void main(){
      vec2 screen=vec2(uv.x*uSize.x*.5,-uv.y*uSize.y*.5)/uZoom;
      vec2 world=vec2(screen.x/.70710678+screen.y/.35355339,screen.y/.35355339-screen.x/.70710678)*.5+uCamera;
      vec2 cells=world/105.;float h=hash(floor(cells));vec2 p=fract(cells+vec2(uTime*.007,-uTime*.013));
      float line=step(abs(p.y-(.33+h*.3))+.05*sin(p.x*8.+h*6.),.014)*step(.14,p.x)*step(p.x,.3+h*.4)*step(.48,h);
      float band=floor((sin(world.x*.002+world.y*.003-uTime*.1)*.5+.5)*3.)/3.;
      vec3 base=mix(vec3(.047,.166,.245),vec3(.065,.235,.32),band*.36);
      base+=line*vec3(.09,.18,.19);
      float grain=hash(floor(gl_FragCoord.xy))* .009;
      color=vec4(base+grain,1.);
    }`;
  const effectVertex=`#version 300 es
    precision highp float;layout(location=0) in vec2 aPosition;layout(location=2) in vec4 aWorld;layout(location=3) in vec4 aPose;
    uniform vec2 uSize;uniform float uZoom;out vec2 uv;out vec3 state;
    void main(){vec3 p=aWorld.xyz;vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      screen+=aPosition*aWorld.w*uZoom*vec2(1.,aPose.y==2.?.6:1.);
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);uv=aPosition;state=aPose.xyz;}`;
  const effectFragment=`#version 300 es
    precision mediump float;in vec2 uv;in vec3 state;out vec4 color;
    void main(){vec2 q=floor(uv*8.)/8.;float r=length(q);float life=state.x;float progress=1.-life;
      if(state.y==2.){float ring=abs(r-(.35+progress*.6));if(ring>.065||life<.08)discard;color=vec4(.47,.67,.69,life*.65);return;}
      float edge=.25+progress*.75;if(r>edge)discard;
      vec3 shade=life>.72?vec3(1.,.86,.57):life>.4?vec3(.94,.49,.26):vec3(.24,.29,.33);
      if(r<edge*.43&&life>.55)shade=vec3(1.,.95,.78);
      color=vec4(shade,life>.4?.92:life*1.8);
    }`;
  function program(gl,vs,fs){const shaders=[];const result=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);gl.deleteProgram(result);throw Error(error);}gl.attachShader(result,s);shaders.push(s);}gl.linkProgram(result);for(const s of shaders)gl.deleteShader(s);if(!gl.getProgramParameter(result,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(result));return result;}
  class Batch{
    constructor(gl,vertices,capacity=64,quad=false){this.gl=gl;this.capacity=capacity;this.data=new Float32Array(capacity*8);this.count=0;this.vertices=vertices;this.vao=gl.createVertexArray();this.mesh=gl.createBuffer();this.instances=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,quad?2:3,gl.FLOAT,false,quad?8:24,0);if(!quad){gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);}gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);for(let i=0;i<2;i++){gl.enableVertexAttribArray(2+i);gl.vertexAttribPointer(2+i,4,gl.FLOAT,false,32,i*16);gl.vertexAttribDivisor(2+i,1);}this.vertexCount=vertices.length/(quad?2:6);}
    add(x,y,z,cos,sin,scale=1,flash=0,extra=0){if(this.count>=this.capacity)return;let i=this.count++*8;this.data[i++]=x;this.data[i++]=y;this.data[i++]=z;this.data[i++]=cos;this.data[i++]=sin;this.data[i++]=scale;this.data[i++]=flash;this.data[i]=extra;}
    draw(){if(!this.count)return 0;const gl=this.gl;gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.count*8);gl.drawArraysInstanced(gl.TRIANGLES,0,this.vertexCount,this.count);return 1;}
    dispose(){const gl=this.gl;gl.deleteBuffer(this.mesh);gl.deleteBuffer(this.instances);gl.deleteVertexArray(this.vao);}
  }
  class Ocean{
    constructor(canvas,battle){
      this.canvas=canvas;this.battle=battle;this.camera={x:battle.player.x,y:battle.player.y};this.offset={x:0,y:0};this.zoom=stops.fleet;this.targetZoom=this.zoom;this.anchor=null;this.follow=true;this.reduced=false;this.lost=false;this.stats={drawCalls:0,visibleRaiders:0,triangles:0,backend:'WebGL2'};this.meshes={};
      this.overlay=document.createElement('canvas');this.overlay.className='ww-ocean-overlay';this.overlay.setAttribute('aria-hidden','true');canvas.parentElement.insertBefore(this.overlay,canvas.nextSibling);this.ctx=this.overlay.getContext('2d');
      this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
      for(const [type,spec]of Object.entries(root.WidewakeBattle.roles))this.meshes[type]=boatMesh(type,spec);
      for(let i=0;i<3;i++)this.meshes['raider'+i]=boatMesh('raider'+i,{length:i===2?23:i===1?16:13,width:i===2?8:5,height:4});
      for(const type of ['shot','hostile','shell','wake','turret','mortar'])this.meshes[type]=simpleMesh(type);
      if(this.gl)this.init();else{this.stats.backend='Canvas';this.fallback=canvas.getContext('2d',{alpha:false});this.spriteCache=new Map();}
      this.onLost=e=>{e.preventDefault();this.lost=true;this.onContextLost?.();};this.onRestored=()=>{this.init();this.lost=false;this.onContextRestored?.();};canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestored);this.resize();
    }
    init(){const gl=this.gl;this.main=program(gl,vertex,fragment);this.water=program(gl,waterVertex,waterFragment);this.particles=program(gl,effectVertex,effectFragment);this.batches={};for(const [id,mesh]of Object.entries(this.meshes))this.batches[id]=new Batch(gl,mesh,id.startsWith('raider')?32768:['shot','hostile','shell'].includes(id)?8192:64);this.quad=new Batch(gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),2048,true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);}
    resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(160,Math.round(r.width/2));this.height=Math.max(100,Math.round(r.height/2));for(const c of [this.canvas,this.overlay]){c.width=this.width;c.height=this.height;}this.ctx.imageSmoothingEnabled=false;if(this.fallback)this.fallback.imageSmoothingEnabled=false;this.baseScale=Math.min(1,Math.min(this.width/640,this.height/360));}
    project(x,y,z=0){const p=project(x-this.camera.x,y-this.camera.y,z),scale=this.zoom*this.baseScale;return{x:this.width/2+p.x*scale,y:this.height/2+p.y*scale};}
    screenWorld(clientX,clientY){const r=this.canvas.getBoundingClientRect(),p=unproject(((clientX-r.left)*this.width/r.width-this.width/2)/(this.zoom*this.baseScale),((clientY-r.top)*this.height/r.height-this.height/2)/(this.zoom*this.baseScale));return{x:p.x+this.camera.x,y:p.y+this.camera.y};}
    setZoom(value,clientX,clientY){const r=this.canvas.getBoundingClientRect();if(Number.isFinite(clientX)&&Number.isFinite(clientY)){const q=this.screenWorld(clientX,clientY);this.anchor={...q,sx:(clientX-r.left)*this.width/r.width-this.width/2,sy:(clientY-r.top)*this.height/r.height-this.height/2};}else this.anchor=null;this.targetZoom=clamp(value,.09,.9);}
    zoomStop(name){if(stops[name]){this.anchor=null;this.offset.x=this.offset.y=0;this.targetZoom=stops[name];}}
    updateCamera(dt){
      this.zoom+=(this.targetZoom-this.zoom)*(this.reduced?1:1-Math.exp(-dt*12));
      if(this.anchor){const q=unproject(this.anchor.sx/(this.zoom*this.baseScale),this.anchor.sy/(this.zoom*this.baseScale));this.camera.x=this.anchor.x-q.x;this.camera.y=this.anchor.y-q.y;this.offset.x=this.camera.x-this.battle.player.x;this.offset.y=this.camera.y-this.battle.player.y;if(Math.abs(this.zoom-this.targetZoom)<.0001)this.anchor=null;}
      else if(this.follow){if(Math.hypot(this.battle.control.x||0,this.battle.control.y||0)>.1){const ease=Math.exp(-dt*2.5);this.offset.x*=ease;this.offset.y*=ease;}const p=this.battle.player;this.camera.x+=(p.x+this.offset.x-this.camera.x)*(1-Math.exp(-dt*4));this.camera.y+=(p.y+this.offset.y-this.camera.y)*(1-Math.exp(-dt*4));}
    }
    uniforms(p){const gl=this.gl;gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'uSize'),this.width,this.height);gl.uniform1f(gl.getUniformLocation(p,'uZoom'),this.zoom*this.baseScale);}
    visible(x,y,r=25){const dx=x-this.camera.x,dy=y-this.camera.y,z=this.zoom*this.baseScale;return Math.abs((dx-dy)*A*z)<this.width/2+r&&Math.abs((dx+dy)*B*z)<this.height/2+r;}
    render(dt=1/60){this.updateCamera(dt);if(this.lost)return;const start=performance.now();this.gl?this.renderGPU():this.renderCanvas();this.labels();this.stats.cpuRenderMs=performance.now()-start;}
    renderGPU(){
      const gl=this.gl,b=this.battle,z=this.zoom*this.baseScale,cam=this.camera;gl.viewport(0,0,this.width,this.height);gl.clearColor(.045,.16,.24,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);gl.depthMask(false);this.uniforms(this.water);gl.uniform2f(gl.getUniformLocation(this.water,'uCamera'),cam.x,cam.y);gl.uniform1f(gl.getUniformLocation(this.water,'uTime'),this.reduced?0:b.time);gl.bindVertexArray(this.quad.vao);gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);this.stats.drawCalls=1;this.stats.triangles=2;
      for(const batch of Object.values(this.batches))batch.count=0;const a=b.raiders;let shown=0;
      for(let i=0;i<a.count;i++){if(a.hp[i]<=0||!this.visible(a.x[i],a.y[i],8))continue;const dx=a.vx[i],dy=a.vy[i],v=Math.sqrt(dx*dx+dy*dy);this.batches['raider'+a.kind[i]].add(a.x[i]-cam.x,a.y[i]-cam.y,0,v?dx/v:1,v?dy/v:0);shown++;}
      this.stats.visibleRaiders=shown;
      for(const s of b.ships){if(s.hp<=0||!this.visible(s.x,s.y,60))continue;const cos=Math.cos(s.angle),sin=Math.sin(s.angle),bob=this.reduced?0:Math.sin(b.time*1.4+s.id)*.5;this.batches[s.type].add(s.x-cam.x,s.y-cam.y,bob,cos,sin,1,this.reduced?0:s.hit>0?.5:0);const speed=Math.hypot(s.vx,s.vy);if(speed>1)this.batches.wake.add(s.x-cam.x,s.y-cam.y,-.1,cos,sin,Math.min(1.3,.4+speed*.03));if(s.flash&&!this.reduced)this.batches.shell.add(s.x-cam.x+Math.cos(s.turret)*s.length*.32,s.y-cam.y+Math.sin(s.turret)*s.length*.32,12,Math.cos(s.turret),Math.sin(s.turret),1.25);}
      for(const mount of b.mounts){const s=b.ships[mount.ship];if(s.hp<=0||!this.visible(s.x,s.y,60))continue;const x=s.x+Math.cos(s.angle)*mount.along-cam.x,y=s.y+Math.sin(s.angle)*mount.along-cam.y,h=Math.min(9,s.height*.38)+3,cos=Math.cos(mount.angle),sin=Math.sin(mount.angle);this.batches[mount.weapon==='mortar'?'mortar':'turret'].add(x,y,h,cos,sin);if(mount.flash&&!this.reduced)this.batches.shell.add(x+cos*13,y+sin*13,h+4,cos,sin,1.2);}
      const shots=b.shots;for(let i=0;i<shots.count;i++){if(!this.visible(shots.x[i],shots.y[i],45))continue;const kind=shots.kind[i],vx=shots.vx[i],vy=shots.vy[i],d=Math.hypot(vx,vy);this.batches[kind===2?'shell':kind===3?'hostile':'shot'].add(shots.x[i]-cam.x,shots.y[i]-cam.y,shots.height[i],d?vx/d:1,d?vy/d:0,kind===1?1.6:kind===2?1.5:1);}
      this.uniforms(this.main);for(const batch of Object.values(this.batches)){this.stats.drawCalls+=batch.draw();this.stats.triangles+=batch.count*batch.vertexCount/3;}
      const fx=b.effects;this.quad.count=0;for(let i=0;i<fx.count;i++){if(!this.visible(fx.x[i],fx.y[i],60)||this.reduced&&fx.kind[i]===2)continue;this.quad.add(fx.x[i]-cam.x,fx.y[i]-cam.y,fx.kind[i]===2?.2:5,fx.size[i],fx.life[i]/fx.total[i],fx.kind[i],0);}
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.particles);this.stats.drawCalls+=this.quad.draw();gl.depthMask(true);gl.disable(gl.BLEND);
    }
    sprite(type,angle){const n=((Math.round(angle/TAU*32)%32)+32)%32,key=type+':'+n;let sprite=this.spriteCache.get(key);if(sprite)return sprite;sprite=document.createElement('canvas');sprite.width=128;sprite.height=96;const c=sprite.getContext('2d'),mesh=this.meshes[type],a=n/32*TAU,cos=Math.cos(a),sin=Math.sin(a),faces=[];
      for(let i=0;i<mesh.length;i+=18){const points=[];let depth=0;for(let v=0;v<3;v++){const at=i+v*6,x=mesh[at]*cos-mesh[at+1]*sin,y=mesh[at]*sin+mesh[at+1]*cos,z=mesh[at+2],p=project(x,y,z);points.push([64+p.x,60+p.y]);depth+=x+y+z;}faces.push({points,depth,color:`rgb(${Math.round(mesh[i+3]*255)},${Math.round(mesh[i+4]*255)},${Math.round(mesh[i+5]*255)})`});}
      faces.sort((a,b)=>a.depth-b.depth);for(const f of faces){c.beginPath();f.points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=f.color;c.fill();}this.spriteCache.set(key,sprite);return sprite;
    }
    renderCanvas(){const c=this.fallback,b=this.battle,z=this.zoom*this.baseScale;c.fillStyle=palette.water;c.fillRect(0,0,this.width,this.height);const list=[];const a=b.raiders;for(let i=0;i<a.count;i++)if(a.hp[i]>0&&this.visible(a.x[i],a.y[i],12))list.push({x:a.x[i],y:a.y[i],type:'raider'+a.kind[i],angle:Math.atan2(a.vy[i],a.vx[i])});this.stats.visibleRaiders=list.length;for(const s of b.ships)if(s.hp>0)list.push(s);list.sort((a,b)=>a.x+a.y-b.x-b.y);for(const s of list){const p=this.project(s.x,s.y);c.drawImage(this.sprite(s.type,s.angle),p.x-64*z,p.y-60*z,128*z,96*z);}const shots=b.shots;for(let i=0;i<shots.count;i++){const p=this.project(shots.x[i],shots.y[i],shots.height[i]);c.fillStyle=shots.kind[i]===3?palette.coral:palette.gold;c.fillRect(p.x,p.y,2,1);}for(const mount of b.mounts){const ship=b.ships[mount.ship];if(ship.hp<=0)continue;const q=this.project(ship.x+Math.cos(ship.angle)*mount.along,ship.y+Math.sin(ship.angle)*mount.along,Math.min(9,ship.height*.38)+3);c.drawImage(this.sprite(mount.weapon==='mortar'?'mortar':'turret',mount.angle),q.x-64*z,q.y-60*z,128*z,96*z);}
      const fx=b.effects;for(let i=0;i<fx.count;i++){const q=this.project(fx.x[i],fx.y[i]),life=fx.life[i]/fx.total[i],size=fx.size[i]*z*(1-life*.7);c.globalAlpha=life;if(fx.kind[i]===2){if(this.reduced)continue;c.strokeStyle='#8bb9bd';c.beginPath();c.ellipse(q.x,q.y,size,size*.6,0,0,TAU);c.stroke();}else{c.fillStyle=life>.72?'#ffe3a9':life>.4?'#ec8955':'#4b616d';c.fillRect(q.x-size*.5,q.y-size*.5,size,size);}}c.globalAlpha=1;this.stats.drawCalls=list.length+shots.count;}
    labels(){const c=this.ctx,b=this.battle,z=this.zoom*this.baseScale;c.clearRect(0,0,this.width,this.height);c.font='7px "Commit Mono", monospace';c.textAlign='center';
      const p=this.project(b.player.x,b.player.y);c.strokeStyle=palette.gold;c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y,Math.max(7,27*z),Math.max(4,16*z),0,0,TAU);c.stroke();
      let labels=0;for(const s of b.ships){if(s.hp<=0)continue;const q=this.project(s.x,s.y,s.height+8),critical=s.hp/s.maxHp<.3;
        if(s.working||critical){const width=critical?24:17;c.fillStyle=palette.ink;c.fillRect(q.x-width/2,q.y-3,width,3);c.fillStyle=critical?palette.coral:palette.cyan;c.fillRect(q.x-width/2,q.y-3,width*s.hp/s.maxHp,2);if((critical||this.zoom>=stops.helm)&&labels<6){c.fillStyle=critical?palette.coral:palette.cream;c.fillText(s.name,q.x,q.y-7);labels++;}}
      }
      if(b.control.fire&&b.control.aim){const q=this.project(b.control.aim.x,b.control.aim.y);c.strokeStyle=palette.cream;c.beginPath();c.moveTo(q.x-5,q.y);c.lineTo(q.x+5,q.y);c.moveTo(q.x,q.y-5);c.lineTo(q.x,q.y+5);c.stroke();}
    }
    dispose(){this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);if(this.gl&&!this.lost){for(const batch of Object.values(this.batches))batch.dispose();this.quad.dispose();for(const p of [this.main,this.water,this.particles])this.gl.deleteProgram(p);}this.overlay.remove();}
  }
  const api={Ocean,project,unproject,direction,stops,boatMesh};root.WidewakeOcean=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
