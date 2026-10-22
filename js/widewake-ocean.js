/* Orthographic isometric ocean. Instanced hull geometry and bounded GPU buffers. */
(function(root){
  'use strict';
  const A=Math.SQRT1_2,B=A*.5,H=Math.sqrt(.75),TAU=Math.PI*2;
  const stops=Object.freeze({helm:.66,fleet:.27,survey:.22});
  const palette={water:'#123b55',ink:'#101a29',cream:'#e8dfb5',cyan:'#89d0d2',gold:'#ffc978',coral:'#ee826c'};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function project(x,y,z=0){return{x:(x-y)*A,y:(x+y)*B-z*H};}
  function unproject(x,y){return{x:(x/A+y/B)*.5,y:(y/B-x/A)*.5};}
  const hullFootprints=new Map();
  function readableScale(spec,pixels){
    // Logical drawing units are half CSS pixels. Use the least legible heading,
    // including foreshortening, rather than a boat's unprojected length.
    const key=spec.length+':'+spec.width;let span=hullFootprints.get(key);
    if(!span){span=Infinity;for(let i=0;i<720;i++){const a=i/720*TAU,c=Math.cos(a),s=Math.sin(a);let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
      for(const [along,across]of root.WidewakeBattle.HULL_OUTLINE){const x=along*spec.length,y=across*spec.width,p=project(x*c-y*s,x*s+y*c);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}
      span=Math.min(span,Math.max(x1-x0,y1-y0));}hullFootprints.set(key,span);}
    return pixels/(span*2)*1.002;
  }
  function direction(x,y){const p=unproject(x,y),n=Math.hypot(p.x,p.y)||1,m=Math.min(1,Math.hypot(x,y));return{x:p.x/n*m,y:p.y/n*m};}
  function aimGuide(ship,aim){const dx=aim.x-ship.x,dy=aim.y-ship.y,d=Math.hypot(dx,dy),range=root.WidewakeBattle.weapons.gun.range+120,ratio=d?Math.min(1,range/d):1;return{x:ship.x+dx*ratio,y:ship.y+dy*ratio,inRange:d<=range,range};}
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
    if(root.WidewakeOceanArt)return root.WidewakeOceanArt.mesh(type,spec,geometry);
    const g=geometry(),l=spec.length,w=spec.width,h=Math.min(9,spec.height*.38),enemy=type.startsWith('raider');
    g.hull(l,w,h,enemy?'#a0766b':'#aebdb6',enemy?'#573f52':'#395e73',enemy?'#332f43':'#172d42');
    if(type==='launch'){g.box(-1,0,.6,1.8,1.3,.5,'#c6ad71','#795a48');g.box(-2.4,0,.4,.7,.6,.5,'#526778','#293e50');g.box(.4,0,.65,.3,1.4,.2,'#d6be87','#8e7956');return new Float32Array(g.out);}
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
    if(type==='salvage'){g.box(0,0,.08,3,3,.2,'#677b70','#344d52');g.box(0,0,.28,2.1,2.1,1.3,'#bdab7b','#7e7b59');for(const side of [-1,1]){g.box(side*.65,0,1.6,.13,2.2,.1,'#d3bd88','#998965');g.box(side*.65,-1.06,.28,.13,.1,1.32,'#c0ad7b','#867b58');}}
    if(type==='turret')g.box(0,0,0,7,7,4,'#8297a0','#2c465d');
    if(type==='barrel'||type==='mortar'){g.box(6,0,4,type==='mortar'?15:12,type==='mortar'?3:1.8,2,'#d3d0af','#55636c');if(type==='mortar')g.box(11,0,6,5,3,2,'#d3d0af','#55636c');}
    if(type==='shot'){g.box(-11,0,0,22,1.4,1.4,'#fff2ca','#f3b65d');}
    if(type==='hostile'){g.box(-9,0,0,18,3,2,'#ffb297','#9e423e');}
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
    layout(location=5) in vec2 aTilt;
    uniform vec2 uSize;
    uniform float uZoom;
    out vec3 vColor;out vec3 vWorld;
    void main(){
      vec3 q=aPosition*aPose.y;
      if(aPose.w<0.)q.x*=-aPose.w;
      vec3 p=vec3(q.x*aWorld.w-q.y*aPose.x,q.x*aPose.x+q.y*aWorld.w,q.z);p.z+=dot(p.xy,aTilt);p.xy-=q.z*aTilt;p+=aWorld.xyz;
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);
      vColor=mix(aColor,vec3(1.,.94,.77),aPose.z);vWorld=p;
    }`;
  const fragment=`#version 300 es
    precision highp float;in vec3 vColor;in vec3 vWorld;out vec4 color;void main(){vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));if(n.z<0.)n=-n;float light=.53+.47*max(0.,dot(n,normalize(vec3(-.45,-.65,1.))));color=vec4(vColor*light,1.);}`;
  const waterVertex=`#version 300 es
    precision highp float;layout(location=0) in vec2 aPosition;out vec2 uv;void main(){uv=aPosition;gl_Position=vec4(aPosition,1.,1.);}`;
  const waterFragment=`#version 300 es
    precision highp float;in vec2 uv;uniform vec2 uSize;uniform vec2 uCamera;uniform float uZoom;uniform float uTime;out vec4 color;
    ${root.WidewakeOceanArt?.waterGLSL||''}
    void main(){vec2 screen=vec2(uv.x*uSize.x*.5,-uv.y*uSize.y*.5)/uZoom;vec2 world=vec2(screen.x/.70710678+screen.y/.35355339,screen.y/.35355339-screen.x/.70710678)*.5+uCamera;
      vec2 surfaceWorld;vec3 wave=seaSample(world,uTime,18.,1.,surfaceWorld);
      color=vec4(seaColorAt(surfaceWorld,wave,18.,1.,vec2(.15,.1),uTime,uZoom),1.);
      // The implicit surface has the same projected depth as displaced geometry.
      // Crests can cover a low hull edge, while troughs expose it again.
      gl_FragDepth=clamp(.5-((surfaceWorld.x+surfaceWorld.y-uCamera.x-uCamera.y)*.6123724+wave.x*.5)/40000.,.005,.995);}`;
  const effectVertex=`#version 300 es
    precision highp float;layout(location=0) in vec2 aPosition;layout(location=2) in vec4 aWorld;layout(location=3) in vec4 aPose;
    layout(location=5) in vec2 aTilt;
    uniform vec2 uSize;uniform float uZoom;out vec2 uv;out vec3 state;
    void main(){vec3 p=aWorld.xyz;
      if(aPose.y==3.)p.xy+=vec2(aPosition.x+aPosition.y,aPosition.y-aPosition.x)*aWorld.w*.70710678;
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      vec2 local=aPose.y==4.?aPosition*vec2(.34,.32)+vec2(0.,-.22):aPosition;
      if(aPose.y!=3.)screen+=local*aWorld.w*uZoom*vec2(1.,aPose.y==2.?.6:1.);
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);uv=local;state=aPose.xyz;}`;
  const effectFragment=`#version 300 es
    precision highp float;in vec2 uv;in vec3 state;uniform bool uReduced;out vec4 color;
    void main(){float life=state.x,age=1.-life,r=length(uv),aa=max(fwidth(r),.008);
      if(state.y==3.){
        float t=uReduced?.32:age,front=.12+.84*(1.-(1.-t)*(1.-t)),angle=atan(uv.y,uv.x);
        float ripple=sin(angle*9.+state.z)*.012+sin(angle*17.-state.z)*.007;
        float width=.01+(1.-t)*.018,edge=abs(r-front-ripple);
        float crest=1.-smoothstep(width,width+aa*1.5,edge);
        float wake=(1.-smoothstep(.012,.012+aa,abs(r-front*.79)))*.2;
        float broken=.24+.76*smoothstep(-.6,.4,sin(angle*7.+state.z)+sin(angle*17.-state.z)*.4);
        float trough=(1.-smoothstep(.02,.08,abs(r-front+.055)))*.08;
        float foam=max(crest*broken,wake)*life*.32;
        color=vec4(mix(vec3(.035,.14,.20),vec3(.65,.84,.83),foam/(foam+trough+.001)),max(foam,trough*life));return;
      }
      if(state.y==4.){
        // Five overlapping jets share one quad, no particle emitters or textures.
        float t=min(1.,age/.58),lift=sin(t*3.141593)*.28,body=0.,light=0.,spray=0.;
        for(int j=0;j<5;j++){
          float lane=float(j)-2.,variation=.84+.16*sin(state.z+float(j)*4.7),spread=lane*(.018+t*.047),height=lift*(1.-abs(lane)*.14)*variation;
          vec2 p=vec2((uv.x-spread)/(.034+t*.025),(uv.y+height*.47)/(.025+height*.57));
          float d=length(p)+sin(p.y*13.+state.z+lane)*.1+sin(p.y*27.+lane)*.045,edge=max(fwidth(d),.04),lobe=1.-smoothstep(1.-edge,1.+edge,d);
          body=max(body,lobe);light=max(light,lobe*(.42+.12*lane+.2*clamp(-p.x-p.y,0.,1.)));
          vec2 drop=vec2(lane*age*.21,-max(0.,age*1.65-age*age*3.1)*variation-.035);
          float dr=length((uv-drop)/vec2(.007,.012));spray=max(spray,1.-smoothstep(.8,1.2+fwidth(dr),dr));
        }
        float fade=(1.-smoothstep(.27,.65,age))*.7;
        vec3 tint=mix(vec3(.22,.48,.58),vec3(.78,.90,.86),light);
        float flash=(1.-smoothstep(.015,.06,r))*max(0.,1.-age/.075);
        color=vec4(mix(mix(tint,vec3(.78,.90,.86),spray),vec3(1.,.92,.70),flash),max(max(body,spray)*fade,flash*.85));return;
      }
      if(state.y==2.){float ring=abs(r-(.22+age*.68));float foam=1.-smoothstep(.014,.014+aa*2.,ring);float broken=.6+.4*sin(atan(uv.y,uv.x)*13.+age*5.);color=vec4(.59,.72,.69,foam*life*.43*broken);return;}
      // A short hot core, lobed smoke, and a much lighter water pressure ring.
      // Blast radius describes the pressure wave, not a solid disk of fire.
      float angle=atan(uv.y,uv.x),lobes=sin(angle*5.+2.)*.035+sin(angle*9.-age*2.)*.018;
      float radius=.09+age*.30+lobes,body=1.-smoothstep(radius-aa,radius+aa,r);
      float core=(1.-smoothstep(.03,.13+age*.05,r))*smoothstep(.46,.85,life);
      vec3 smoke=mix(vec3(.18,.23,.24),vec3(.38,.41,.37),max(0.,-uv.x-uv.y));
      vec3 fire=mix(vec3(.74,.35,.17),vec3(1.,.84,.48),smoothstep(.50,.93,life));
      vec3 tint=mix(smoke,fire,smoothstep(.40,.72,life));tint=mix(tint,vec3(1.,.94,.75),core);
      float ring=(1.-smoothstep(.012,.012+aa*2.,abs(r-(.16+age*.75))))*life*.18;
      float alpha=body*min(.84,life*1.5);color=vec4(mix(tint,vec3(.59,.70,.66),ring/(alpha+ring+.001)),max(alpha,ring));
    }`;
  function program(gl,vs,fs){const shaders=[];const result=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);gl.deleteProgram(result);throw Error(error);}gl.attachShader(result,s);shaders.push(s);}gl.linkProgram(result);for(const s of shaders)gl.deleteShader(s);if(!gl.getProgramParameter(result,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(result));return result;}
  class Batch{
    constructor(gl,vertices,capacity=64,quad=false){this.gl=gl;this.capacity=capacity;this.data=new Float32Array(capacity*8);this.count=0;this.vertices=vertices;this.vao=gl.createVertexArray();this.mesh=gl.createBuffer();this.instances=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,quad?2:3,gl.FLOAT,false,quad?8:24,0);if(!quad){gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);}gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);for(let i=0;i<2;i++){gl.enableVertexAttribArray(2+i);gl.vertexAttribPointer(2+i,4,gl.FLOAT,false,32,i*16);gl.vertexAttribDivisor(2+i,1);}this.vertexCount=vertices.length/(quad?2:6);this.tilts=new Float32Array(capacity*2);this.tiltBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.tiltBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.tilts.byteLength,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(5);gl.vertexAttribPointer(5,2,gl.FLOAT,false,8,0);gl.vertexAttribDivisor(5,1);}
    add(x,y,z,cos,sin,scale=1,flash=0,extra=0){if(this.count>=this.capacity)return;this.tilts[this.count*2]=this.tilts[this.count*2+1]=0;let i=this.count++*8;this.data[i++]=x;this.data[i++]=y;this.data[i++]=z;this.data[i++]=cos;this.data[i++]=sin;this.data[i++]=scale;this.data[i++]=flash;this.data[i]=extra;}
    tilt(x,y){if(this.count){this.tilts[(this.count-1)*2]=x;this.tilts[(this.count-1)*2+1]=y;}}
    draw(upload=true){if(!this.count)return 0;const gl=this.gl;gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);if(upload)gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.count*8);if(upload){gl.bindBuffer(gl.ARRAY_BUFFER,this.tiltBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.tilts,0,this.count*2);}gl.drawArraysInstanced(gl.TRIANGLES,0,this.vertexCount,this.count);return 1;}
    dispose(){const gl=this.gl;gl.deleteBuffer(this.tiltBuffer);gl.deleteBuffer(this.mesh);gl.deleteBuffer(this.instances);gl.deleteVertexArray(this.vao);}
  }
  class Ocean{
    constructor(canvas,battle){
      this.canvas=canvas;this.battle=battle;this.camera={x:battle.player.x,y:battle.player.y};this.offset={x:0,y:0};this.zoom=stops.fleet;this.targetZoom=this.zoom;this.anchor=null;this.follow=true;this.reduced=false;this.lost=false;this.showBroadside=false;this.alpha=1;this.visualTime=battle.time;this.poses=battle.ships.map(s=>({x:s.x,y:s.y,angle:s.angle}));this.stats={drawCalls:0,visibleRaiders:0,triangles:0,backend:'WebGL2'};this.meshes={};this.wakes=root.WidewakeOceanArt?new root.WidewakeOceanArt.WakeTrail():null;
      this.overlay=document.createElement('canvas');this.overlay.className='ww-ocean-overlay';this.overlay.setAttribute('aria-hidden','true');canvas.parentElement.insertBefore(this.overlay,canvas.nextSibling);this.ctx=this.overlay.getContext('2d');
      this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
      for(const [type,spec]of Object.entries({...root.WidewakeBattle.roles,...battle.visualRoles}))this.meshes[type]=boatMesh(type,spec);
      for(const [i,spec]of root.WidewakeBattle.enemies.entries())this.meshes['raider'+i]=boatMesh('raider'+i,spec);
      for(const type of ['shot','hostile','shell','wake','turret','barrel','mortar'])this.meshes[type]=simpleMesh(type);
      if(root.WidewakeOceanArt&&battle.field){const scenery=root.WidewakeOceanArt.scenery(geometry),landings=root.WidewakeOceanArt.landings(geometry);Object.assign(this.meshes,scenery.meshes,landings.meshes);this.artSpecs={...scenery.specs,...landings.specs};this.landmarks=landings.parts;if(root.WidewakeWaterwayArt){const art=root.WidewakeWaterwayArt.models(geometry);Object.assign(this.meshes,art.meshes);Object.assign(this.artSpecs,art.specs);}if(battle.loot){this.meshes.salvage=simpleMesh('salvage');this.artSpecs.salvage={length:4,height:2,frames:1,ppu:6};}}
      if(this.gl)this.init();else{this.stats.backend='Canvas';this.fallback=canvas.getContext('2d',{alpha:false});this.spriteCache=new Map();this.surface=new root.WidewakeWaveView.Surface(this);}
      this.onLost=e=>{e.preventDefault();this.lost=true;this.onContextLost?.();};this.onRestored=()=>{this.init();this.terrain?.restore();this.lost=false;this.onContextRestored?.();};canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestored);this.resize();
    }
    init(){const gl=this.gl;this.main=program(gl,vertex,fragment);this.water=program(gl,waterVertex,waterFragment);this.particles=program(gl,effectVertex,effectFragment);this.batches={};for(const [id,mesh]of Object.entries(this.meshes))this.batches[id]=new Batch(gl,mesh,id.startsWith('raider')?32768:['shot','hostile','shell'].includes(id)?8192:id==='salvage'?128:64);this.quad=new Batch(gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),2048,true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);if(root.WidewakeOceanArt){this.atlas=new root.WidewakeOceanArt.Atlas(this);this.noise=root.WidewakeOceanArt.noiseTexture(gl);this.waterMotion=new root.WidewakeOceanArt.WaterMotion(this);this.shadows=new root.WidewakeOceanArt.Shadows(this);this.mechanisms=new root.WidewakeOceanArt.Mechanisms(this);this.surface=new root.WidewakeWaveView.Surface(this);}}
    resize(){
      const previous=this.baseScale,oldMinimum=previous?this.minimumZoom():0,stop=oldMinimum&&[1,1.22,1.55].find(ratio=>Math.abs(this.targetZoom-oldMinimum*ratio)<.001);
      const r=this.canvas.getBoundingClientRect();this.width=Math.max(160,r.width/2);this.height=Math.max(100,r.height/2);
      // Projection stays in logical units. The raster follows the display, with
      // a fixed fill-rate ceiling rather than a half-resolution pixelated upscale.
      const ratio=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(2073600/Math.max(1,r.width*r.height))),w=Math.max(1,Math.round(r.width*ratio)),h=Math.max(1,Math.round(r.height*ratio));
      for(const c of [this.canvas,this.overlay]){c.width=w;c.height=h;}
      for(const c of [this.ctx,this.fallback])if(c){c.setTransform(w/this.width,0,0,h/this.height,0,0);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';}
      this.stats.rasterWidth=w;this.stats.rasterHeight=h;this.stats.msaaSamples=this.gl?this.gl.getParameter(this.gl.SAMPLES):0;this.baseScale=Math.min(1,Math.min(this.width/640,this.height/360));
      if(!this.stops){const minimum=this.minimumZoom();if(!previous)this.zoom=this.targetZoom=minimum*1.22;else{this.zoom=clamp(this.zoom*previous/this.baseScale,minimum,minimum*2.325);this.targetZoom=stop?minimum*stop:clamp(this.targetZoom*previous/this.baseScale,minimum,minimum*2.325);this.anchor=null;}}
    }
    project(x,y,z=0){const p=project(x-this.camera.x,y-this.camera.y,z),scale=this.zoom*this.baseScale;return{x:this.width/2+p.x*scale,y:this.height/2+p.y*scale};}
    screenWorld(clientX,clientY){const r=this.canvas.getBoundingClientRect(),p=unproject(((clientX-r.left)*this.width/r.width-this.width/2)/(this.zoom*this.baseScale),((clientY-r.top)*this.height/r.height-this.height/2)/(this.zoom*this.baseScale));return{x:p.x+this.camera.x,y:p.y+this.camera.y};}
    minimumZoom(){return Math.max(Math.hypot(this.width/2,this.height)/2500,readableScale(root.WidewakeBattle.enemies[0],12))/this.baseScale;}
    setZoom(value,clientX,clientY){const r=this.canvas.getBoundingClientRect();if(Number.isFinite(clientX)&&Number.isFinite(clientY)){const q=this.screenWorld(clientX,clientY);this.anchor={...q,sx:(clientX-r.left)*this.width/r.width-this.width/2,sy:(clientY-r.top)*this.height/r.height-this.height/2};}else this.anchor=null;this.targetZoom=clamp(value,Math.max(stops.survey,this.minimumZoom()),Math.max(.9,this.minimumZoom()*2.325));}
    zoomStop(name){if(stops[name]){this.anchor=null;this.offset.x=this.offset.y=0;this.targetZoom=this.minimumZoom()*({survey:1,fleet:1.22,helm:1.55}[name]);}}
    prepareSpawns(){
      // Protect the current zoom tween and its anchored destination. Open-water
      // battles also reserve their widest view. The simulation gets geometry only.
      const wide=this.battle.field?this.targetZoom:this.stops?.survey||Math.max(stops.survey,this.minimumZoom());
      const z=Math.min(this.zoom,this.targetZoom,wide)*this.baseScale;
      const padding=Math.max(96,48/z),halfWidth=this.width/(2*z)+padding,halfHeight=this.height/(2*z)+padding,p=project(this.camera.x,this.camera.y),b=this.battle.spawnBounds||(this.battle.spawnBounds={});
      b.left=p.x-halfWidth;b.right=p.x+halfWidth;b.top=p.y-halfHeight;b.bottom=p.y+halfHeight;
      let destination=null;
      if(this.anchor){destination=project(this.anchor.x,this.anchor.y);const scale=this.targetZoom*this.baseScale;destination.x-=this.anchor.sx/scale;destination.y-=this.anchor.sy/scale;}
      else if(this.follow){const ship=this.battle.player,lead=this.lookAhead?.85:0;destination=project(ship.x+this.offset.x+ship.vx*lead,ship.y+this.offset.y+ship.vy*lead);}
      if(destination){b.left=Math.min(b.left,destination.x-halfWidth);b.right=Math.max(b.right,destination.x+halfWidth);b.top=Math.min(b.top,destination.y-halfHeight);b.bottom=Math.max(b.bottom,destination.y+halfHeight);}
    }
    updateCamera(dt){
      this.zoom+=(this.targetZoom-this.zoom)*(this.reduced?1:1-Math.exp(-dt*12));
      const p=this.poses[this.battle.player.id];
      if(this.anchor){const q=unproject(this.anchor.sx/(this.zoom*this.baseScale),this.anchor.sy/(this.zoom*this.baseScale));this.camera.x=this.anchor.x-q.x;this.camera.y=this.anchor.y-q.y;this.offset.x=this.camera.x-p.x;this.offset.y=this.camera.y-p.y;if(Math.abs(this.zoom-this.targetZoom)<.0001)this.anchor=null;}
      else if(this.follow){if(Math.hypot(this.battle.control.x||0,this.battle.control.y||0,this.battle.control.throttle||0,this.battle.control.steer||0)>.1){const ease=Math.exp(-dt*2.5);this.offset.x*=ease;this.offset.y*=ease;}const ship=this.battle.player,velocity=project(ship.vx,ship.vy),limit=Math.min(this.width,this.height)*.13,lead=this.lookAhead?.85*Math.min(1,limit/(Math.hypot(velocity.x,velocity.y)*this.zoom*this.baseScale*.85||1)):0;this.camera.x+=(p.x+ship.vx*lead+this.offset.x-this.camera.x)*(1-Math.exp(-dt*5));this.camera.y+=(p.y+ship.vy*lead+this.offset.y-this.camera.y)*(1-Math.exp(-dt*5));}
    }
    uniforms(p){const gl=this.gl;gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'uSize'),this.width,this.height);gl.uniform1f(gl.getUniformLocation(p,'uZoom'),this.zoom*this.baseScale);gl.uniform1f(gl.getUniformLocation(p,'uSeaStrength'),this.battle.sea?.strength??1);gl.uniform1f(gl.getUniformLocation(p,'uOpenSea'),this.battle.field?0:1);gl.uniform1f(gl.getUniformLocation(p,'uDetailMotion'),this.reduced?0:1);}
    visible(x,y,r=25){const dx=x-this.camera.x,dy=y-this.camera.y,z=this.zoom*this.baseScale;return Math.abs((dx-dy)*A*z)<this.width/2+r&&Math.abs((dx+dy)*B*z)<this.height/2+r;}
    render(dt=1/60,alpha=1){this.alpha=clamp(alpha,0,1);this.visualTime=Math.max(0,this.battle.time-(1-this.alpha)/60);for(const s of this.battle.ships){const p=this.poses[s.id]||(this.poses[s.id]={});p.x=s.px+(s.x-s.px)*this.alpha;p.y=s.py+(s.y-s.py)*this.alpha;p.angle=s.previousAngle+root.WidewakeBattle.angleDelta(s.angle,s.previousAngle)*this.alpha;this.battle.sea?.pose(s,this.alpha,p);p.z=p.z||0;p.gx=(p.pitch||0)*Math.cos(p.angle)-(p.roll||0)*Math.sin(p.angle);p.gy=(p.pitch||0)*Math.sin(p.angle)+(p.roll||0)*Math.cos(p.angle);}if(this.battle.port)this.wakes?.clear();else this.wakes?.sample(this.battle.ships,this.poses,this.visualTime);this.stats.wakePoints=this.wakes?.count||0;this.stats.wakeBytes=this.wakes?.bytes||0;this.updateCamera(dt);this.prepareSpawns();if(this.lost)return;const start=performance.now();this.gl?this.renderGPU():this.renderCanvas();this.labels();this.stats.cpuRenderMs=performance.now()-start;}
    renderGPU(){
      const gl=this.gl,b=this.battle,z=this.zoom*this.baseScale,cam=this.camera;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.045,.16,.24,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);gl.depthMask(!this.terrain);this.uniforms(this.water);gl.uniform2f(gl.getUniformLocation(this.water,'uCamera'),cam.x,cam.y);gl.uniform1f(gl.getUniformLocation(this.water,'uTime'),this.visualTime);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.noise);gl.uniform1i(gl.getUniformLocation(this.water,'uNoise'),2);gl.bindVertexArray(this.quad.vao);gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);this.stats.drawCalls=1;this.stats.triangles=2;this.atlas?.begin();
      this.terrain?.renderGPU(this);this.stats.drawCalls+=this.surface?.draw()||0;this.stats.drawCalls+=this.shadows?.ships()||0;this.stats.drawCalls+=this.waterMotion?.draw()||0;this.drawEffectsGPU(true);
      for(const batch of Object.values(this.batches))batch.count=0;const a=b.raiders;let shown=0;
      for(let i=0;i<a.count;i++){const x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha;if(a.hp[i]<=0||!this.visible(x,y,8))continue;const dx=a.vx[i],dy=a.vy[i],v=Math.sqrt(dx*dx+dy*dy);const wave=b.sea?.at(x,y,this.visualTime,this._raiderWater||(this._raiderWater={}),-1,false);this.batches['raider'+a.kind[i]].add(x-cam.x,y-cam.y,wave?.height||0,v?dx/v:1,v?dy/v:0,1,this.reduced?0:a.hitUntil[i]>b.time?.4:a.kind[i]===3&&a.charge[i]>1?.18:0);shown++;}
      this.stats.visibleRaiders=shown;if(this.batches.salvage)for(const item of b.loot){if(this.visible(item.x,item.y,8))this.batches.salvage.add(item.x-cam.x,item.y-cam.y,b.sea?.at(item.x,item.y,this.visualTime,this._lootWater||(this._lootWater={})).height||0,1,0);}
      for(const s of b.ships){const p=this.poses[s.id];if(s.hp<=0||!this.visible(p.x,p.y,60))continue;const cos=Math.cos(p.angle),sin=Math.sin(p.angle),bob=p.z;this.batches[s.type].add(p.x-cam.x,p.y-cam.y,bob,cos,sin,1,this.reduced?0:s.hit>0?.5:0);this.batches[s.type].tilt(p.gx,p.gy);}
      for(const mount of b.mounts){const s=b.ships[mount.ship],p=this.poses[s.id];if(s.hp<=0||!this.visible(p.x,p.y,60))continue;const x=p.x+Math.cos(p.angle)*mount.along-cam.x,y=p.y+Math.sin(p.angle)*mount.along-cam.y,h=Math.min(8,s.height*.28)+.2+p.z+(p.pitch||0)*mount.along,mountScale=clamp(s.width/24,.12,.85),cos=Math.cos(mount.angle),sin=Math.sin(mount.angle),recoil=this.reduced?0:mount.recoil*mountScale;this.batches.turret.add(x,y,h,cos,sin,mountScale);this.batches.turret.tilt(p.gx,p.gy);this.batches[mount.weapon==='mortar'?'mortar':'barrel'].add(x-cos*recoil,y-sin*recoil,h,cos,sin,mountScale);this.batches[mount.weapon==='mortar'?'mortar':'barrel'].tilt(p.gx,p.gy);if(mount.flash&&!this.reduced)this.batches.shell.add(x+cos*(13*mountScale-recoil),y+sin*(13*mountScale-recoil),h+4*mountScale,cos,sin,mountScale*.7);}
      const shots=b.shots;for(let i=0;i<shots.count;i++){const x=shots.px[i]+(shots.x[i]-shots.px[i])*this.alpha,y=shots.py[i]+(shots.y[i]-shots.py[i])*this.alpha,height=shots.previousHeight[i]+(shots.height[i]-shots.previousHeight[i])*this.alpha;if(!this.visible(x,y,Math.max(45,height*z*H+12)))continue;const kind=shots.kind[i],vx=shots.vx[i],vy=shots.vy[i],d=Math.hypot(vx,vy),scale=kind===1?1.6:kind===2?1.5:kind===3?Math.max(1,.4/z):1,tail=kind===2?0:-Math.max(.001,Math.min(1,Math.hypot(x-shots.startX[i],y-shots.startY[i])/((kind===3?18:22)*scale)));this.batches[kind===2?'shell':kind===3?'hostile':'shot'].add(x-cam.x,y-cam.y,height,d?vx/d:1,d?vy/d:0,scale,0,tail);}
      for(const [type,batch] of Object.entries(this.batches)){if(this.atlas?.entries[type]){this.stats.drawCalls+=this.atlas.draw(type,batch);this.stats.triangles+=batch.count*2;}else{this.uniforms(this.main);this.stats.drawCalls+=batch.draw();this.stats.triangles+=batch.count*batch.vertexCount/3;}}this.stats.spriteAtlasBytes=this.atlas?.bytes||0;this.stats.drawCalls+=this.mechanisms?.draw()||0;this.stats.drawCalls+=this.atlas?.edges()||0;
      this.drawEffectsGPU(false);
    }
    drawEffectsGPU(surface){
      const gl=this.gl,fx=this.battle.effects,z=this.zoom*this.baseScale,cam=this.camera;this.quad.count=0;
      for(let i=0;i<fx.count;i++){
        const water=fx.kind[i]===3;
        if(surface&&!water||!this.visible(fx.x[i],fx.y[i],Math.max(16,fx.size[i]*z+8)))continue;
        const life=clamp((fx.life[i]+(this.battle.time-this.visualTime))/fx.total[i],0,1);
        if(!surface&&(this.reduced&&fx.kind[i]!==0||water&&life<.35))continue;
        this.quad.add(fx.x[i]-cam.x,fx.y[i]-cam.y,surface||water?.2:fx.height[i],fx.size[i],life,surface?3:water?4:fx.kind[i],fx.angle[i]);
      }
      if(surface)this.stats.visibleWaterBlasts=this.quad.count;
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.particles);gl.uniform1i(gl.getUniformLocation(this.particles,'uReduced'),this.reduced?1:0);this.stats.drawCalls+=this.quad.draw();this.stats.triangles+=this.quad.count*2;gl.depthMask(true);gl.disable(gl.BLEND);
    }
    sprite(type,angle){const frames=this.artSpecs?.[type]?.frames||(type.startsWith('raider')?32:64),n=((Math.round(angle/TAU*frames)%frames)+frames)%frames,key=type+':'+n;let sprite=this.spriteCache.get(key);if(sprite)return sprite;
      const mesh=this.meshes[type],a=n/frames*TAU,cos=Math.cos(a),sin=Math.sin(a),faces=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<mesh.length;i+=18){const points=[],world=[];let depth=0;for(let v=0;v<3;v++){const at=i+v*6,x=mesh[at]*cos-mesh[at+1]*sin,y=mesh[at]*sin+mesh[at+1]*cos,z=mesh[at+2],p=project(x,y,z);points.push([p.x,p.y]);world.push([x,y,z]);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);depth+=(x+y)*.6123724+z*.5;}
        const aa=world[1].map((v,k)=>v-world[0][k]),bb=world[2].map((v,k)=>v-world[0][k]),nx=aa[1]*bb[2]-aa[2]*bb[1],ny=aa[2]*bb[0]-aa[0]*bb[2],nz=aa[0]*bb[1]-aa[1]*bb[0],length=Math.hypot(nx,ny,nz)||1,light=.48+.52*Math.max(0,(-.45*nx-.65*ny+nz)/(length*Math.hypot(.45,.65,1)));
        faces.push({points,depth,color:`rgb(${Math.round(mesh[i+3]*light*255)},${Math.round(mesh[i+4]*light*255)},${Math.round(mesh[i+5]*light*255)})`});}
      const resolution=type==='launch'?4:Math.min(8,this.artSpecs?.[type]?.ppu||1);sprite=document.createElement('canvas');sprite.width=Math.ceil((maxX-minX)*resolution)+4;sprite.height=Math.ceil((maxY-minY)*resolution)+4;sprite.originX=minX-2/resolution;sprite.originY=minY-2/resolution;sprite.resolution=resolution;const c=sprite.getContext('2d');c.scale(resolution,resolution);c.translate(-sprite.originX,-sprite.originY);
      faces.sort((a,b)=>a.depth-b.depth);for(const f of faces){c.beginPath();f.points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=f.color;c.fill();}this.spriteCache.set(key,sprite);return sprite;
    }
    paintSprite(type,angle,x,y,scale=1,z=0,gx=0,gy=0){const p=this.project(x,y,z),s=this.sprite(type,angle),zoom=this.zoom*this.baseScale*scale;const c=this.fallback;c.save();c.translate(p.x,p.y);c.transform(1,-H*(gx-gy)/(2*A),0,1-H*(gx+gy)/(2*B),0,0);c.drawImage(s,s.originX*zoom,s.originY*zoom,s.width/s.resolution*zoom,s.height/s.resolution*zoom);c.restore();}
    renderCanvas(){const c=this.fallback,b=this.battle,z=this.zoom*this.baseScale;c.fillStyle=palette.water;c.fillRect(0,0,this.width,this.height);this.surface?.background();this.terrain?.renderCanvas(this);this.surface?.draw();this.wakes?.drawCanvas(this);this.drawWaterCanvas(true);const list=[],a=b.raiders;
      for(let i=0;i<a.count;i++){const x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha;if(a.hp[i]>0&&this.visible(x,y,12))list.push({x,y,type:'raider'+a.kind[i],angle:Math.atan2(a.vy[i],a.vx[i]),z:b.sea?.at(x,y,this.visualTime,this._raiderWater||(this._raiderWater={}),-1,false).height||0});}
      this.stats.visibleRaiders=list.length;if(this.meshes.salvage)for(const item of b.loot)if(this.visible(item.x,item.y,8))list.push({...item,type:'salvage',angle:0,z:b.sea?.at(item.x,item.y,this.visualTime,this._lootWater||(this._lootWater={})).height||0});for(const s of b.ships)if(s.hp>0)list.push({...this.poses[s.id],type:s.type});list.sort((a,b)=>a.x+a.y-b.x-b.y);for(const s of list)this.paintSprite(s.type,s.angle,s.x,s.y,1,s.z||0,s.gx||0,s.gy||0);
      const shots=b.shots;
      for(let kind=0;kind<4;kind++){c.beginPath();c.strokeStyle=kind===3?palette.coral:palette.gold;c.fillStyle=palette.gold;c.lineWidth=kind===3?Math.max(1.2,z*3):Math.max(.65,z*(kind===1?2.24:1.4));
        for(let i=0;i<shots.count;i++){if(shots.kind[i]!==kind)continue;const x=shots.px[i]+(shots.x[i]-shots.px[i])*this.alpha,y=shots.py[i]+(shots.y[i]-shots.py[i])*this.alpha,height=shots.previousHeight[i]+(shots.height[i]-shots.previousHeight[i])*this.alpha;if(!this.visible(x,y,Math.max(45,height*z*H+12)))continue;const p=this.project(x,y,height);
          if(kind===2){c.moveTo(p.x+1.1,p.y);c.arc(p.x,p.y,1.1,0,TAU);continue;}
          const speed=Math.hypot(shots.vx[i],shots.vy[i])||1,length=Math.min(Math.hypot(x-shots.startX[i],y-shots.startY[i]),kind===3?18*Math.max(1,.4/z):kind===1?35.2:22),tail=this.project(x-shots.vx[i]/speed*length,y-shots.vy[i]/speed*length,height);c.moveTo(tail.x,tail.y);c.lineTo(p.x,p.y);
        }kind===2?c.fill():c.stroke();
      }
      for(const mount of b.mounts){const ship=b.ships[mount.ship],pose=this.poses[ship.id];if(ship.hp<=0)continue;const x=pose.x+Math.cos(pose.angle)*mount.along,y=pose.y+Math.sin(pose.angle)*mount.along,h=Math.min(8,ship.height*.28)+.2+(pose.z||0)+(pose.pitch||0)*mount.along,mountScale=clamp(ship.width/24,.12,.85),q=this.project(x,y,h),recoil=this.reduced?0:mount.recoil,r=this.project(x-Math.cos(mount.angle)*recoil,y-Math.sin(mount.angle)*recoil,h);this.paintSprite('turret',mount.angle,x,y,mountScale,h);this.paintSprite(mount.weapon==='mortar'?'mortar':'barrel',mount.angle,x-Math.cos(mount.angle)*recoil,y-Math.sin(mount.angle)*recoil,mountScale,h);}
      this.drawWaterCanvas(false);
      const fx=b.effects;for(let i=0;i<fx.count;i++){if(fx.kind[i]===3||this.reduced&&fx.kind[i]!==0)continue;const q=this.project(fx.x[i],fx.y[i],fx.height[i]),life=fx.life[i]/fx.total[i],size=fx.size[i]*z*(1-life*.7);c.globalAlpha=life;if(fx.kind[i]===2){c.strokeStyle='#8bb9bd';c.beginPath();c.ellipse(q.x,q.y,size,size*.6,0,0,TAU);c.stroke();}else{c.fillStyle=life>.72?'#ffe3a9':life>.4?'#ec8955':'#4b616d';c.beginPath();for(let j=0;j<9;j++){const a=j/9*TAU,r=size*(.25+(j%3)*.025);c.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r);}c.closePath();c.fill();}}c.globalAlpha=1;this.stats.drawCalls=list.length+shots.count;}
    drawWaterCanvas(surface){
      const c=this.fallback,fx=this.battle.effects,z=this.zoom*this.baseScale;let shown=0;
      if(!surface&&this.reduced)return;
      for(let i=0;i<fx.count;i++){
        if(fx.kind[i]!==3||!this.visible(fx.x[i],fx.y[i],fx.size[i]*z+8))continue;
        const life=clamp((fx.life[i]+this.battle.time-this.visualTime)/fx.total[i],0,1),age=1-life,size=fx.size[i]*z,q=this.project(fx.x[i],fx.y[i]);shown++;
        if(surface){
          const t=this.reduced?.32:age,front=size*(.12+.84*(1-(1-t)*(1-t)));c.lineWidth=Math.max(.5,size*(.01+(1-t)*.018));
          c.globalAlpha=life*.08;c.strokeStyle='#103c50';c.beginPath();c.ellipse(q.x,q.y,front*.94,front*.47,0,0,TAU);c.stroke();
          c.strokeStyle='#a6d6d4';c.globalAlpha=life*.26;
          for(let j=0;j<7;j++){const start=fx.angle[i]+j*TAU/7;c.beginPath();c.ellipse(q.x,q.y,front,front*.5,0,start,start+.65);c.stroke();}
          c.globalAlpha=life*.07;c.lineWidth=.5;c.beginPath();c.ellipse(q.x,q.y,front*.79,front*.395,0,0,TAU);c.stroke();
        }else if(age<.65){
          const t=Math.min(1,age/.58),lift=Math.sin(t*Math.PI)*.28,fade=1-clamp((age-.27)/.38,0,1);
          for(let j=0;j<5;j++){
            const lane=j-2,variation=.84+.16*Math.sin(fx.angle[i]+j*4.7),spread=lane*(.018+t*.047),height=lift*(1-Math.abs(lane)*.14)*variation;c.globalAlpha=fade*.7;c.fillStyle=j<2?'#528a9c':'#b5d8d5';c.beginPath();
            for(let n=0;n<16;n++){const angle=n/16*TAU,rough=1+Math.sin(n*2.4+fx.angle[i]+j)*.1;c.lineTo(q.x+(spread+Math.cos(angle)*(.034+t*.025)*rough)*size,q.y+(-height*.47+Math.sin(angle)*(.025+height*.57)*rough)*size);}c.closePath();c.fill();
            c.beginPath();c.ellipse(q.x+lane*age*.21*size,q.y-(Math.max(0,age*1.65-age*age*3.1)*variation+.035)*size,.007*size,.012*size,0,0,TAU);c.fill();
          }
        }
      }
      c.globalAlpha=1;if(surface)this.stats.visibleWaterBlasts=shown;
    }
    labels(){const c=this.ctx,b=this.battle,z=this.zoom*this.baseScale;c.clearRect(0,0,this.width,this.height);c.font='7px "Commit Mono", monospace';c.textAlign='center';
      const pose=this.poses[b.player.id],p=this.project(pose.x,pose.y);c.strokeStyle=palette.gold;c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y,Math.max(7,27*z),Math.max(4,16*z),0,0,TAU);c.stroke();
      if(this.showBroadside||b.burstCursor<root.WidewakeBattle.BROADSIDE.rounds){
        const ship={...b.player,...pose};c.strokeStyle='#e8bc79';c.fillStyle='#edbd7010';c.setLineDash([3,5]);
        for(const side of [0,1]){const points=root.WidewakeBattle.broadsideFootprint(ship,side);c.beginPath();points.forEach((point,i)=>{const q=this.project(point.x,point.y);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.closePath();c.fill();c.stroke();}c.setLineDash([]);
      }
      let labels=0;for(const s of b.ships){if(s.hp<=0)continue;const pose=this.poses[s.id],q=this.project(pose.x,pose.y,s.height+8),critical=s.hp/s.maxHp<.3;
        if(s.working||critical){const width=critical?24:17;c.fillStyle=palette.ink;c.fillRect(q.x-width/2,q.y-3,width,3);c.fillStyle=critical?palette.coral:palette.cyan;c.fillRect(q.x-width/2,q.y-3,width*s.hp/s.maxHp,2);if((critical||this.zoom>=stops.helm)&&labels<6){c.fillStyle=critical?palette.coral:palette.cream;c.fillText(s.name,q.x,q.y-7);labels++;}}
      }
      if(b.control.fire&&b.control.aim){const guide=aimGuide(b.player,b.control.aim),q=this.project(b.control.aim.x,b.control.aim.y);c.strokeStyle=guide.inRange?palette.cream:palette.coral;c.beginPath();c.moveTo(q.x-5,q.y);c.lineTo(q.x-2,q.y);c.moveTo(q.x+2,q.y);c.lineTo(q.x+5,q.y);c.moveTo(q.x,q.y-5);c.lineTo(q.x,q.y-2);c.moveTo(q.x,q.y+2);c.lineTo(q.x,q.y+5);c.stroke();
        if(!guide.inRange){const tip=this.project(guide.x,guide.y);c.setLineDash([2,4]);c.beginPath();c.moveTo(tip.x,tip.y);c.lineTo(q.x,q.y);c.stroke();c.setLineDash([]);c.strokeRect(tip.x-2,tip.y-2,4,4);}
      }
      if(b.time-b.lastHit.time<.12){const q=this.project(b.lastHit.x,b.lastHit.y);c.strokeStyle=palette.cream;c.beginPath();for(const [x,y]of [[-1,-1],[1,-1],[1,1],[-1,1]]){c.moveTo(q.x+x*3,q.y+y*3);c.lineTo(q.x+x*5,q.y+y*5);}c.stroke();}
    }
    dispose(){this.terrain?.dispose();this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);if(this.gl&&!this.lost){this.atlas?.dispose();this.waterMotion?.dispose();this.shadows?.dispose();this.mechanisms?.dispose();this.surface?.dispose();this.gl.deleteTexture(this.noise);for(const batch of Object.values(this.batches))batch.dispose();this.quad.dispose();for(const p of [this.main,this.water,this.particles])this.gl.deleteProgram(p);}this.overlay.remove();}
  }
  const api={Ocean,project,unproject,direction,aimGuide,readableScale,stops,boatMesh,geometry,Batch,program};root.WidewakeOcean=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
