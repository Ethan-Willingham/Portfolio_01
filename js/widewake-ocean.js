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
  function enemyHeading(a,i,alpha=1){
    if(a.angle&&(!a.steeringReady||a.steeringReady[i])){const angle=a.angle[i],previous=a.previousAngle?.[i]??angle;return previous+root.WidewakeBattle.angleDelta(angle,previous)*alpha;}
    return Math.hypot(a.vx[i],a.vy[i])>.01?Math.atan2(a.vy[i],a.vx[i]):a.angle?.[i]||0;
  }
  function shotLength(shots,i,x,y,reduced=false){const speed=Math.hypot(shots.vx[i],shots.vy[i]),kind=shots.kind[i];return Math.min(Math.hypot(x-shots.startX[i],y-shots.startY[i]),speed*(kind===3?.012:kind===1?.014:.009),kind===1?16:12)*(reduced?.6:1);}
  const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  function wreckState(fx,i,time,out={}){const life=clamp((fx.life[i]+time)/fx.total[i],0,1),age=1-life,t=age*fx.total[i],travel=(1-Math.exp(-t*1.05))/1.05;
    out.age=age;out.seed=((Math.sin(fx.x[i]*.173+fx.y[i]*.131+fx.angle[i]*2.3)*43758.5453)%1+1)%1;out.x=fx.x[i]+(fx.vx?.[i]||0)*travel*.68;out.y=fx.y[i]+(fx.vy?.[i]||0)*travel*.68;out.kind=Math.round(fx.variant?.[i]||0);out.angle=fx.angle[i]+Math.sin(out.seed*TAU)*smooth(.08,.68,age)*.12;return out;
  }
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
    if(type==='shot'){g.box(-.55,0,0,.9,.22,.22,'#f2d4a0','#997c54');g.face([[-.1,-.11,0],[0,0,.11],[-.1,.11,.22]],'#fff1c3');}
    if(type==='hostile'){g.box(-.76,0,0,1.24,.28,.28,'#d9ae84','#795b4c');g.face([[-.14,-.14,0],[0,0,.14],[-.14,.14,.28]],'#f5d8ab');}
    if(type==='shell'){g.box(-1.4,0,0,2.1,.8,.8,'#68757a','#354852');g.box(-2,0,.02,.22,.84,.8,'#c0a976','#7d6c50');g.face([[-.35,-.4,0],[0,0,.4],[-.35,.4,.8]],'#ddbd80');}
    if(type==='wake'){g.face([[-8,-5,0],[-85,-22,0],[-66,-17,0],[-8,-3,0]],'#366d80');g.face([[-8,5,0],[-85,22,0],[-66,17,0],[-8,3,0]],'#366d80');g.face([[-15,-5,.1],[-48,-10,.1],[-37,-8,.1],[-12,-3,.1]],'#75aeb1');g.face([[-15,5,.1],[-48,10,.1],[-37,8,.1],[-12,3,.1]],'#75aeb1');}
    return new Float32Array(g.out);
  }
  const vertex=`#version 300 es
    precision highp float;
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aColor;
    layout(location=2) in vec4 aWorld;
    layout(location=3) in vec4 aPose;
    layout(location=4) in vec3 aNormal;
    layout(location=5) in vec2 aTilt;
    uniform vec2 uSize;
    uniform float uZoom;
    out vec3 vColor;out vec3 vWorld;out vec3 vNormal;out vec3 vLocal;
    vec3 tiltHull(vec3 p){vec3 n=normalize(vec3(-aTilt,1.)),v=vec3(-n.y,n.x,0.);return p+cross(v,p)+cross(v,cross(v,p))/(1.+n.z);}
    void main(){
      vec3 q=aPosition*aPose.y;
      if(aPose.w<0.)q.x*=-aPose.w;
      vec3 p=tiltHull(vec3(q.x*aWorld.w-q.y*aPose.x,q.x*aPose.x+q.y*aWorld.w,q.z))+aWorld.xyz;
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);
      vColor=mix(aColor,vec3(1.,.94,.77),aPose.z);vWorld=p;
      vec3 n=vec3(aNormal.x*aWorld.w-aNormal.y*aPose.x,aNormal.x*aPose.x+aNormal.y*aWorld.w,aNormal.z);vNormal=tiltHull(n);vLocal=aPosition;
    }`;
  const fragment=`#version 300 es
    precision highp float;in vec3 vColor;in vec3 vWorld;in vec3 vNormal;in vec3 vLocal;out vec4 color;
    float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    void main(){if(dot(vNormal,vNormal)>.01){vec3 n=normalize(vNormal);float light=.48+.52*max(0.,dot(n,normalize(vec3(-.45,-.65,1.)))),grain=(hash(floor(vLocal*5.))-.5)*.035,edge=pow(max(0.,dot(n,normalize(vec3(-.2,-.5,1.)))),16.)*.055;color=vec4(vColor*(light+grain)+edge,1.);}
      else{vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));if(n.z<0.)n=-n;float light=.53+.47*max(0.,dot(n,normalize(vec3(-.45,-.65,1.))));color=vec4(vColor*light,1.);}}`;
  const wreckVertex=`#version 300 es
    precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aColor;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;layout(location=4)in vec3 aNormal;
    uniform vec2 uSize;uniform float uZoom;uniform vec3 uHull;uniform bool uReduced;out vec3 vColor;out vec3 vWorld;out vec3 vNormal;out vec3 vLocal;
    void main(){float age=aPose.z,seed=aPose.w,part=aNormal.x,open=smoothstep(.07,.45,age),founder=smoothstep(.12,.80,age),side=seed<.5?-1.:1.;
      float pivot=(part-1.)*uHull.x*.28,pitch=(part-1.)*founder*.46,roll=side*founder*(.35+seed*.45),cp=cos(pitch),sp=sin(pitch),cr=cos(roll),sr=sin(roll);
      if(uReduced){pitch=0.;roll=0.;cp=1.;sp=0.;cr=1.;sr=0.;}
      vec3 q=aPosition-vec3(pivot,0.,0.);q=vec3(q.x*cp+q.z*sp,q.y,-q.x*sp+q.z*cp);q=vec3(q.x,q.y*cr-q.z*sr,q.y*sr+q.z*cr);
      q.x+=pivot+(part-1.)*uHull.x*.085*open;q.y+=(part-1.)*side*uHull.y*.17*open;q.z-=uHull.z*(.03+2.4*smoothstep(.22,.86,age)+.30*(part==1.?1.:0.)*founder);
      vec3 p=vec3(q.x*aWorld.w-q.y*aPose.x,q.x*aPose.x+q.y*aWorld.w,q.z)+aWorld.xyz;vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);vColor=aColor*(.95-founder*.17);vWorld=p;vNormal=vec3(0.);vLocal=aPosition;}`;
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
    uniform vec2 uSize;uniform float uZoom;out vec2 uv;out vec4 state;
    void main(){vec3 p=aWorld.xyz;
      if(aPose.y==3.)p.xy+=vec2(aPosition.x+aPosition.y,aPosition.y-aPosition.x)*aWorld.w*.70710678;
      if(aPose.y==10.||aPose.y==11.){vec2 q=aPosition*aWorld.w;float c=cos(aPose.z),s=sin(aPose.z);p.xy+=vec2(q.x*c-q.y*s,q.x*s+q.y*c);}
      if(aPose.y==9.){vec2 q=vec2((aPosition.x-1.)*.55,aPosition.y*.25)*aWorld.w;float c=cos(aPose.z),s=sin(aPose.z);p.xy+=vec2(q.x*c-q.y*s,q.x*s+q.y*c);}
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)*uZoom;
      vec2 local=aPose.y==4.?aPosition*vec2(.34,.32)+vec2(0.,-.22):aPosition;
      if(aPose.y!=3.&&aPose.y!=9.&&aPose.y!=10.&&aPose.y!=11.){
        vec2 offset=local*aWorld.w*uZoom*vec2(1.,aPose.y==2.?.5:1.);
        if(aPose.y==5.||aPose.y==8.){vec2 axis=normalize(vec2((cos(aPose.z)-sin(aPose.z))*.70710678,(cos(aPose.z)+sin(aPose.z))*.35355339));offset=mat2(axis,vec2(-axis.y,axis.x))*offset;}
        screen+=offset;
      }
      float depthHeight=p.z+(aPose.y==12.||aPose.y==6.?max(0.,-aPosition.y)*aWorld.w/.8660254:0.);
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+depthHeight*.5)/20000.,-.99,.99),1.);uv=local;state=aPose;}`;
  const effectFragment=`#version 300 es
    precision highp float;in vec2 uv;in vec4 state;uniform bool uReduced;out vec4 color;
    void main(){float life=state.x,age=1.-life,r=length(uv),aa=max(fwidth(r),.008);
      if(state.y==10.){
        // The broken hull leaves a low, irregular slick and white churning edges.
        vec2 q=uv/vec2(.88,.39);float d=length(q),a=atan(q.y,q.x),seed=state.w*17.;
        float edge=.76+sin(a*7.+seed)*.055+sin(a*13.-seed)*.035;
        float rim=1.-smoothstep(.035,.035+aa*3.,abs(d-edge-age*.15));
        float broken=smoothstep(-.65,.4,sin(a*11.+seed)+sin(a*23.-seed)*.4);
        float slick=(1.-smoothstep(.45,.95,d))*(.25+smoothstep(.1,.4,age)*.75);
        float churn=0.;for(int j=0;j<7;j++){float n=float(j),x=(n-3.)*.22,y=sin(n*4.7+seed)*.18;vec2 p=q-vec2(x,y);float ring=abs(length(p)-(.04+fract(age*1.6+n*.17)*.12));churn=max(churn,(1.-smoothstep(.015,.035,ring))*(1.-smoothstep(.4,.9,d)));}
        float plunge=smoothstep(.14,.38,age)*(1.-smoothstep(.68,.95,age));
        float foam=max(rim*broken*.86,churn*plunge),fade=1.-smoothstep(.76,1.,age);
        color=vec4(mix(vec3(.07,.16,.18),vec3(.79,.90,.82),min(1.,foam*1.7)),max(slick*.24,foam*.82)*fade);return;
      }
      if(state.y==11.){
        vec2 q=uv/vec2(1.,.64);float d=length(q),a=atan(q.y,q.x),front=.16+age*.74;
        float edge=abs(d-front),rim=(1.-smoothstep(.035,.08,edge))*(.55+.45*sin(a*9.+state.w*7.));
        float seam=(1.-smoothstep(.04,.12,abs(uv.x)))*(1.-smoothstep(.10,.61,abs(uv.y)))*(1.-smoothstep(.05,.45,age));
        color=vec4(.77,.90,.83,max(rim*.52,seam*.8)*life*(.48+state.w*.52));return;
      }
      if(state.y==12.){
        if(uReduced){color=vec4(0.);return;}float intensity=state.w,spray=0.,chips=0.,lift=sin(min(1.,age/.75)*3.141593);
        for(int j=0;j<8;j++){float n=float(j),lane=(n-3.5)/3.5,spread=lane*(.08+age*.73),height=lift*(.30+(1.-abs(lane))*.58)*(.55+intensity*.45);vec2 p=(uv-vec2(spread,-height*.65))/vec2(.040+age*.025,.025+height*.38);spray=max(spray,(1.-smoothstep(.7,1.15,length(p)))*(1.-abs(lane)*.35));
          vec2 drop=vec2(lane*age*.85,-age*(1.3-abs(lane)*.4)+age*age*1.7);chips=max(chips,1.-smoothstep(.012,.025,length(uv-drop)));}
        float core=(1.-smoothstep(.025,.12,r))*max(0.,1.-age/.18);
        color=vec4(mix(vec3(.39,.65,.70),vec3(.89,.95,.86),max(core,clamp(-uv.x*.5-uv.y,0.,1.))),max(spray*.74,max(chips*.9,core))*(1.-smoothstep(.46,1.,age)));return;
      }
      if(state.y==9.){
        float t=uv.x*.5+.5,spread=.10+(1.-t)*.54,edge=abs(abs(uv.y)-spread),broken=.55+.45*sin(t*35.+state.w*11.);
        float shoulders=(1.-smoothstep(.055,.10,edge))*smoothstep(0.,.18,t)*(1.-t*.45);
        float churn=(1.-smoothstep(.02,.22,abs(uv.y)))*smoothstep(.48,.9,t)*(.55+.45*sin(t*56.+state.w));
        color=vec4(.65,.83,.80,max(shoulders*broken,churn*.65)*state.x*.24);return;
      }
      if(state.y==5.){
        if(uReduced){color=vec4(.44,.42,.34,(1.-smoothstep(.08,.22,r))*life*.5);return;}
        float smoke=0.,chips=0.;vec2 drift=uv-vec2(age*.32,-age*.26);
        smoke=(1.-smoothstep(.05+age*.22,.18+age*.44,length(drift)))*smoothstep(.03,.2,age)*life*.4;
        for(int j=0;j<6;j++){float n=float(j),a=(n-2.5)*.28,d=age*(.6+fract(sin(n*7.3)*437.2)*.7);vec2 end=vec2(cos(a),sin(a))*d+vec2(0.,age*age*.9);float q=length((uv-end)/vec2(.026+age*.025,.014+age*.01));chips=max(chips,(1.-smoothstep(.65,1.3,q))*life);}
        float flash=(1.-smoothstep(.025,.12,r))*max(0.,1.-age/.16),spark=chips*smoothstep(.5,1.,life);
        vec3 tint=mix(vec3(.24,.28,.27),vec3(.76,.64,.44),chips);tint=mix(tint,vec3(1.,.87,.58),max(flash,spark));
        color=vec4(tint,max(smoke,max(chips*.9,flash)));return;
      }
      if(state.y==6.){
        float lift=max(0.,sin(min(1.,age/.48)*3.141593))*.75,body=0.;
        for(int j=0;j<4;j++){float lane=float(j)-1.5;vec2 p=(uv-vec2(lane*(.08+age*.18),-lift*(.4-abs(lane)*.06)))/vec2(.07+age*.05,.05+lift*.43);body=max(body,(1.-smoothstep(.8,1.15,length(p)))*(1.-abs(lane)*.12));}
        float drops=0.;for(int j=0;j<5;j++){float n=float(j),a=n*.7+state.z,d=age*(.25+n*.09);vec2 p=vec2(cos(a)*d,-age*(1.8-n*.15)+age*age*3.2);drops=max(drops,1.-smoothstep(.012,.026,length(uv-p)));}
        color=vec4(mix(vec3(.33,.56,.63),vec3(.80,.91,.86),clamp(-uv.x*.4-uv.y,0.,1.)),max(body*.72,drops*.8)*life);return;
      }
      if(state.y==7.){
        float smoke=0.;for(int j=0;j<3;j++){float n=float(j);vec2 p=uv-vec2(age*(.18+n*.07),-age*(.18+n*.13));float d=length(p)/( .11+age*(.21+n*.055));smoke=max(smoke,1.-smoothstep(.7,1.,d));}
        color=vec4(.35,.39,.37,smoke*life*.32);return;
      }
      if(state.y==8.){
        float core=1.-smoothstep(.05,.19,r),spear=(1.-smoothstep(.02,.08,abs(uv.y)))*smoothstep(-.18,.12,uv.x)*(1.-smoothstep(.18,.95,uv.x)),petals=(1.-smoothstep(.025,.10,abs(uv.y-uv.x*.44)))*(1.-smoothstep(.08,.50,r));
        color=vec4(mix(vec3(1.,.53,.16),vec3(1.,.96,.77),core),max(core,max(spear,petals))*.9*life);return;
      }
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
  const tracerVertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;layout(location=5)in vec2 aTilt;
    uniform vec2 uSize;uniform float uZoom;out vec2 uv;flat out float kind;
    void main(){float t=aPosition.x*.5+.5;vec3 tip=aWorld.xyz,tail=tip-vec3(aWorld.w,aPose.x,0.)*aPose.y;tail.z+=aTilt.x;
      vec2 from=vec2((tail.x-tail.y)*.70710678,(tail.x+tail.y)*.35355339-tail.z*.8660254)*uZoom,to=vec2((tip.x-tip.y)*.70710678,(tip.x+tip.y)*.35355339-tip.z*.8660254)*uZoom;
      vec2 direction=to-from;float d=max(length(direction),.001);direction/=d;vec2 screen=mix(from,to,t)+vec2(-direction.y,direction.x)*aPosition.y*max(.28,aPose.z*uZoom*.5);
      vec3 p=mix(tail,tip,t);gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+p.z*.5)/20000.,-.99,.99),1.);uv=vec2(t,aPosition.y);kind=aPose.w;}`;
  const tracerFragment=`#version 300 es
    precision highp float;in vec2 uv;flat in float kind;out vec4 color;
    void main(){float crossSection=exp(-uv.y*uv.y*5.5),tail=pow(uv.x,.72),core=exp(-uv.y*uv.y*22.);vec3 tint=kind==3.?vec3(1.,.58,.37):vec3(1.,.73,.34);color=vec4(mix(tint,vec3(1.,.95,.77),core*.72),crossSection*tail*.91);}`;
  function program(gl,vs,fs){const shaders=[];const result=gl.createProgram();for(const [type,code]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);gl.deleteProgram(result);throw Error(error);}gl.attachShader(result,s);shaders.push(s);}gl.linkProgram(result);for(const s of shaders)gl.deleteShader(s);if(!gl.getProgramParameter(result,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(result));return result;}
  class Batch{
    constructor(gl,vertices,capacity=64,quad=false,lit=false){this.gl=gl;this.capacity=capacity;this.data=new Float32Array(capacity*8);this.count=0;this.vertices=vertices;this.vao=gl.createVertexArray();this.mesh=gl.createBuffer();this.instances=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.mesh);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,quad?2:3,gl.FLOAT,false,quad?8:lit?36:24,0);if(!quad){gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,lit?36:24,12);if(lit){gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,3,gl.FLOAT,false,36,24);}}gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,this.data.byteLength,gl.DYNAMIC_DRAW);for(let i=0;i<2;i++){gl.enableVertexAttribArray(2+i);gl.vertexAttribPointer(2+i,4,gl.FLOAT,false,32,i*16);gl.vertexAttribDivisor(2+i,1);}this.vertexCount=vertices.length/(quad?2:lit?9:6);this.tilts=new Float32Array(capacity*2);this.tiltBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.tiltBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.tilts.byteLength,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(5);gl.vertexAttribPointer(5,2,gl.FLOAT,false,8,0);gl.vertexAttribDivisor(5,1);}
    add(x,y,z,cos,sin,scale=1,flash=0,extra=0){if(this.count>=this.capacity)return;this.tilts[this.count*2]=this.tilts[this.count*2+1]=0;let i=this.count++*8;this.data[i++]=x;this.data[i++]=y;this.data[i++]=z;this.data[i++]=cos;this.data[i++]=sin;this.data[i++]=scale;this.data[i++]=flash;this.data[i]=extra;}
    tilt(x,y){if(this.count){this.tilts[(this.count-1)*2]=x;this.tilts[(this.count-1)*2+1]=y;}}
    draw(upload=true){if(!this.count)return 0;const gl=this.gl;gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);if(upload)gl.bufferSubData(gl.ARRAY_BUFFER,0,this.data,0,this.count*8);if(upload){gl.bindBuffer(gl.ARRAY_BUFFER,this.tiltBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.tilts,0,this.count*2);}gl.drawArraysInstanced(gl.TRIANGLES,0,this.vertexCount,this.count);return 1;}
    dispose(){const gl=this.gl;gl.deleteBuffer(this.tiltBuffer);gl.deleteBuffer(this.mesh);gl.deleteBuffer(this.instances);gl.deleteVertexArray(this.vao);}
  }
  class Ocean{
    constructor(canvas,battle){
      this.canvas=canvas;this.battle=battle;this.camera={x:battle.player.x,y:battle.player.y};this.offset={x:0,y:0};this.zoom=stops.fleet;this.targetZoom=this.zoom;this.anchor=null;this.follow=true;this.reduced=false;this.lost=false;this.showBroadside=false;this.alpha=1;this.visualTime=battle.time;this.poses=battle.ships.map(s=>({x:s.x,y:s.y,angle:s.angle}));this.stats={drawCalls:0,visibleRaiders:0,triangles:0,backend:'WebGL2'};this.meshes={};this.hullSpecs={...root.WidewakeBattle.roles,...battle.visualRoles};this.wakes=root.WidewakeOceanArt?new root.WidewakeOceanArt.WakeTrail():null;
      this.overlay=document.createElement('canvas');this.overlay.className='ww-ocean-overlay';this.overlay.setAttribute('aria-hidden','true');canvas.parentElement.insertBefore(this.overlay,canvas.nextSibling);this.ctx=this.overlay.getContext('2d');
      this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
      for(const [type,spec]of Object.entries({...root.WidewakeBattle.roles,...battle.visualRoles}))this.meshes[type]=boatMesh(type,spec);
      for(const [i,spec]of root.WidewakeBattle.enemies.entries())this.meshes['raider'+i]=boatMesh('raider'+i,spec);
      for(const type of ['shot','hostile','shell','wake','turret','barrel','mortar'])this.meshes[type]=simpleMesh(type);
      this.wreckArt=root.WidewakeOceanArt?.wreckModels?.(geometry)||null;
      if(root.WidewakeOceanArt&&battle.field){const scenery=root.WidewakeOceanArt.scenery(geometry),landings=root.WidewakeOceanArt.landings(geometry);Object.assign(this.meshes,scenery.meshes,landings.meshes);this.artSpecs={...scenery.specs,...landings.specs};this.landmarks=landings.parts;if(root.WidewakeWaterwayArt){const art=root.WidewakeWaterwayArt.models(geometry);Object.assign(this.meshes,art.meshes);Object.assign(this.artSpecs,art.specs);}if(battle.loot){this.meshes.salvage=simpleMesh('salvage');this.artSpecs.salvage={length:4,height:2,frames:1,ppu:6};}}
      if(this.gl)this.init();else{this.stats.backend='Canvas';this.fallback=canvas.getContext('2d',{alpha:false});this.spriteCache=new Map();this.surface=new root.WidewakeWaveView.Surface(this);}
      this.onLost=e=>{e.preventDefault();this.lost=true;this.onContextLost?.();};this.onRestored=()=>{this.init();this.terrain?.restore();this.lost=false;this.onContextRestored?.();};canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestored);this.resize();
    }
    init(){const gl=this.gl;this.main=program(gl,vertex,fragment);this.water=program(gl,waterVertex,waterFragment);this.particles=program(gl,effectVertex,effectFragment);this.tracerProgram=program(gl,tracerVertex,tracerFragment);this.batches={};for(const [id,mesh]of Object.entries(this.meshes)){const lit=!!this.hullSpecs[id]&&!!root.WidewakeOceanArt;this.batches[id]=new Batch(gl,lit?root.WidewakeOceanArt.normals(mesh):mesh,id.startsWith('raider')?32768:['shot','hostile','shell'].includes(id)?8192:id==='salvage'?128:['turret','barrel'].includes(id)?512:64,false,lit);}this.quad=new Batch(gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),2048,true);this.tracers=new Batch(gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),8192,true);this.wreckBatches=[];if(this.wreckArt){this.wreckProgram=program(gl,wreckVertex,fragment);this.wreckBatches=this.wreckArt.models.map(m=>new Batch(gl,m,128,false,true));this.wreckDebris=new Batch(gl,this.wreckArt.debris,384);}gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);if(root.WidewakeOceanArt){this.atlas=new root.WidewakeOceanArt.Atlas(this);this.noise=root.WidewakeOceanArt.noiseTexture(gl);this.waterMotion=new root.WidewakeOceanArt.WaterMotion(this);this.shadows=new root.WidewakeOceanArt.Shadows(this);this.mechanisms=new root.WidewakeOceanArt.Mechanisms(this);this.surface=new root.WidewakeWaveView.Surface(this);}}
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
    uniforms(p){const gl=this.gl;gl.useProgram(p);gl.uniform2f(gl.getUniformLocation(p,'uSize'),this.width,this.height);gl.uniform1f(gl.getUniformLocation(p,'uZoom'),this.zoom*this.baseScale);gl.uniform1f(gl.getUniformLocation(p,'uSeaStrength'),this.battle.sea?.strength??1);gl.uniform1f(gl.getUniformLocation(p,'uOpenSea'),this.battle.field?0:1);gl.uniform1f(gl.getUniformLocation(p,'uDetailMotion'),this.reduced?0:1);this.surface?.bindEnvironment(p);}
    visible(x,y,r=25){const dx=x-this.camera.x,dy=y-this.camera.y,z=this.zoom*this.baseScale;return Math.abs((dx-dy)*A*z)<this.width/2+r&&Math.abs((dx+dy)*B*z)<this.height/2+r;}
    render(dt=1/60,alpha=1){this.alpha=clamp(alpha,0,1);this.visualTime=Math.max(0,this.battle.time-(1-this.alpha)/60);for(const s of this.battle.ships){const p=this.poses[s.id]||(this.poses[s.id]={});p.x=s.px+(s.x-s.px)*this.alpha;p.y=s.py+(s.y-s.py)*this.alpha;p.angle=s.previousAngle+root.WidewakeBattle.angleDelta(s.angle,s.previousAngle)*this.alpha;this.battle.sea?.pose(s,this.alpha,p);p.z=p.z||0;p.gx=(p.pitch||0)*Math.cos(p.angle)-(p.roll||0)*Math.sin(p.angle);p.gy=(p.pitch||0)*Math.sin(p.angle)+(p.roll||0)*Math.cos(p.angle);}if(this.battle.port)this.wakes?.clear();else this.wakes?.sample(this.battle.ships,this.poses,this.visualTime,this.battle.sea?.field);this.stats.wakePoints=this.wakes?.count||0;this.stats.wakeBytes=this.wakes?.bytes||0;this.updateCamera(dt);this.prepareSpawns();if(this.lost)return;const start=performance.now();this.gl?this.renderGPU():this.renderCanvas();this.labels();this.stats.cpuRenderMs=performance.now()-start;}
    // Nearby friendly boats use their original geometry at display resolution.
    // Far hulls retain filtered sprites; the 32,768-raider path never adds meshes.
    usesHullGeometry(type){const spec=this.hullSpecs[type];return !!spec&&Math.hypot(spec.length,spec.width)*this.zoom*this.baseScale*this.canvas.width/this.width>=56;}
    renderGPU(){
      const gl=this.gl,b=this.battle,z=this.zoom*this.baseScale,cam=this.camera;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.045,.16,.24,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);gl.depthMask(!this.terrain);this.uniforms(this.water);gl.uniform2f(gl.getUniformLocation(this.water,'uCamera'),cam.x,cam.y);gl.uniform1f(gl.getUniformLocation(this.water,'uTime'),this.visualTime);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.noise);gl.uniform1i(gl.getUniformLocation(this.water,'uNoise'),2);gl.bindVertexArray(this.quad.vao);gl.drawArrays(gl.TRIANGLES,0,6);gl.depthMask(true);this.stats.drawCalls=1;this.stats.triangles=2;this.stats.detailedHulls=0;this.atlas?.begin();
      this.terrain?.renderGPU(this);this.stats.drawCalls+=this.surface?.draw()||0;this.stats.drawCalls+=this.shadows?.ships()||0;this.stats.drawCalls+=this.waterMotion?.draw()||0;this.drawEnemyWaterGPU();this.drawEffectsGPU(true);
      for(const batch of Object.values(this.batches))batch.count=0;const a=b.raiders;let shown=0;
      for(let i=0;i<a.count;i++){const x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha;if(a.hp[i]<=0||!this.visible(x,y,8))continue;const angle=enemyHeading(a,i,this.alpha),cos=Math.cos(angle),sin=Math.sin(angle),speed=Math.hypot(a.vx[i],a.vy[i]),roll=this.reduced?0:clamp(-(a.turn?.[i]||0)*speed*.0012,-.12,.12),wave=b.sea?.at(x,y,this.visualTime,this._raiderWater||(this._raiderWater={}),-1,false),batch=this.batches['raider'+a.kind[i]];batch.add(x-cam.x,y-cam.y,wave?.height||0,cos,sin,1,this.reduced?0:a.hitUntil[i]>b.time?.18:a.kind[i]===3&&a.charge[i]>1?.12:0);batch.tilt((wave?.dx||0)*.3-sin*roll,(wave?.dy||0)*.3+cos*roll);shown++;}
      this.stats.visibleRaiders=shown;if(this.batches.salvage)for(const item of b.loot){if(this.visible(item.x,item.y,8))this.batches.salvage.add(item.x-cam.x,item.y-cam.y,b.sea?.at(item.x,item.y,this.visualTime,this._lootWater||(this._lootWater={})).height||0,1,0);}
      for(const s of b.ships){const p=this.poses[s.id];if(s.hp<=0||!this.visible(p.x,p.y,60))continue;const cos=Math.cos(p.angle),sin=Math.sin(p.angle),bob=p.z;this.batches[s.type].add(p.x-cam.x,p.y-cam.y,bob,cos,sin,1,this.reduced?0:s.hit>0?.5:0);this.batches[s.type].tilt(p.gx,p.gy);}
      for(const mount of b.mounts){const s=b.ships[mount.ship],p=this.poses[s.id];if(s.hp<=0||!this.visible(p.x,p.y,60))continue;const x=p.x+Math.cos(p.angle)*mount.along-cam.x,y=p.y+Math.sin(p.angle)*mount.along-cam.y,h=Math.min(8,s.height*.28)+.2+p.z+(p.pitch||0)*mount.along,mountScale=clamp(s.width/24,.12,.85),cos=Math.cos(mount.angle),sin=Math.sin(mount.angle),recoil=this.reduced?0:mount.recoil*mountScale;this.batches.turret.add(x,y,h,cos,sin,mountScale);this.batches.turret.tilt(p.gx,p.gy);this.batches[mount.weapon==='mortar'?'mortar':'barrel'].add(x-cos*recoil,y-sin*recoil,h,cos,sin,mountScale);this.batches[mount.weapon==='mortar'?'mortar':'barrel'].tilt(p.gx,p.gy);}
      this.drawEnemyGunsGPU();
      const shots=b.shots;this.tracers.count=0;for(let i=0;i<shots.count;i++){const x=shots.px[i]+(shots.x[i]-shots.px[i])*this.alpha,y=shots.py[i]+(shots.y[i]-shots.py[i])*this.alpha,height=shots.previousHeight[i]+(shots.height[i]-shots.previousHeight[i])*this.alpha;if(!this.visible(x,y,Math.max(45,height*z*H+12)))continue;const kind=shots.kind[i],vx=kind===2?shots.endX[i]-shots.startX[i]:shots.vx[i],vy=kind===2?shots.endY[i]-shots.startY[i]:shots.vy[i],d=Math.hypot(vx,vy),scale=kind===1?1.4:kind===2?1.15:1;this.batches[kind===2?'shell':kind===3?'hostile':'shot'].add(x-cam.x,y-cam.y,height,d?vx/d:1,d?vy/d:0,scale);if(kind===2){const slope=clamp((shots.height[i]-shots.previousHeight[i])*60*shots.total[i]/(d||1),-3,3);this.batches.shell.tilt(slope*vx/(d||1),slope*vy/(d||1));}
        if(kind!==2){const length=shotLength(shots,i,x,y,this.reduced);if(length>.01){this.tracers.add(x-cam.x,y-cam.y,height,d?vx/d:1,d?vy/d:0,length,kind===1?.55:kind===3?.33:.24,kind);this.tracers.tilt(-(shots.height[i]-shots.previousHeight[i])*60*length/(d||1),0);}}
      }
      for(const [type,batch] of Object.entries(this.batches)){if(this.atlas?.entries[type]&&!this.usesHullGeometry(type)){this.stats.drawCalls+=this.atlas.draw(type,batch);this.stats.triangles+=batch.count*2;}else{this.uniforms(this.main);this.stats.drawCalls+=batch.draw();this.stats.triangles+=batch.count*batch.vertexCount/3;if(this.hullSpecs[type])this.stats.detailedHulls+=batch.count;}}this.drawWrecksGPU();this.stats.spriteAtlasBytes=this.atlas?.bytes||0;this.stats.drawCalls+=this.mechanisms?.draw()||0;this.stats.drawCalls+=this.atlas?.edges()||0;
      this.drawTracersGPU();this.drawEffectsGPU(false);this.drawMuzzlesGPU();
    }
    // The tapered streak ends at the simulated tip and covers a short exposure.
    drawTracersGPU(){const gl=this.gl;this.stats.visibleTracers=this.tracers.count;if(!this.tracers.count)return;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.tracerProgram);this.stats.drawCalls+=this.tracers.draw();this.stats.triangles+=this.tracers.count*2;gl.depthMask(true);gl.disable(gl.BLEND);}
    // Immediate stern wash shares the effect quad, with no per-raider history.
    drawEnemyWaterGPU(){
      const b=this.battle,a=b.raiders,gl=this.gl;this.quad.count=0;if(this.reduced){this.stats.enemyWakeCount=0;return;}
      for(let i=0;i<a.count&&this.quad.count<512;i++){if(a.hp[i]<=0||!this.visible(a.x[i],a.y[i],30))continue;const speed=Math.hypot(a.vx[i],a.vy[i]);if(speed<3)continue;const spec=root.WidewakeBattle.enemies[a.kind[i]],angle=enemyHeading(a,i,this.alpha),x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha,sx=x-Math.cos(angle)*spec.length*.8,sy=y-Math.sin(angle)*spec.length*.8;
        if(b.field&&b.field.sample(sx,sy,this._enemyWakeWater||(this._enemyWakeWater={})).depth<.5)continue;
        this.quad.add(x-this.camera.x,y-this.camera.y,(a.surface?.[i]||0)+.1,spec.length,Math.min(1,speed/35),9,angle,(a.id[i]%97)*.3+this.visualTime*5);
      }
      this.stats.enemyWakeCount=this.quad.count;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.particles);gl.uniform1i(gl.getUniformLocation(this.particles,'uReduced'),0);this.stats.drawCalls+=this.quad.draw();this.stats.triangles+=this.quad.count*2;gl.depthMask(true);gl.disable(gl.BLEND);
    }
    drawEnemyGunsGPU(){const a=this.battle.raiders,cam=this.camera;let count=0;for(let i=0;i<a.count&&count<256;i++){if(a.hp[i]<=0||a.kind[i]!==2||!this.visible(a.x[i],a.y[i],25))continue;const spec=root.WidewakeBattle.enemies[2],angle=enemyHeading(a,i,this.alpha),gun=a.gunAngle?.[i]??angle,scale=spec.width/24,x=a.px[i]+(a.x[i]-a.px[i])*this.alpha+Math.cos(angle)*spec.length*.16,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha+Math.sin(angle)*spec.length*.16,h=(a.surface?.[i]||0)+spec.height*.28+.2,recoil=this.reduced?0:Math.max(0,1-(this.visualTime-(a.fireAt?.[i]??-1000))/.12)*scale*2;
        this.batches.turret.add(x-cam.x,y-cam.y,h,Math.cos(gun),Math.sin(gun),scale);this.batches.barrel.add(x-cam.x-Math.cos(gun)*recoil,y-cam.y-Math.sin(gun)*recoil,h,Math.cos(gun),Math.sin(gun),scale);count++;
      }this.stats.enemyGunCount=count;}
    // Three original hull sections lose buoyancy separately. Four shared meshes,
    // one debris buffer and the existing effect pool keep the aftermath bounded.
    drawWrecksGPU(){
      if(!this.wreckArt)return;const b=this.battle,fx=b.effects,gl=this.gl;for(const batch of this.wreckBatches)batch.count=0;this.wreckDebris.count=0;let count=0,records=0;
      for(let i=0;i<fx.count&&records<128;i++){
        if(fx.kind[i]!==6)continue;const p=wreckState(fx,i,b.time-this.visualTime,this._wreckState||(this._wreckState={}));if(!this.visible(p.x,p.y,45))continue;records++;
        const spec=root.WidewakeBattle.enemies[p.kind],water=b.sea?.at(p.x,p.y,this.visualTime,this._wreckWater||(this._wreckWater={}),-1,false).height||0;
        if(p.age<.88){this.wreckBatches[p.kind].add(p.x-this.camera.x,p.y-this.camera.y,water,Math.cos(p.angle),Math.sin(p.angle),1,p.age,p.seed);count++;}
        if(p.age>.10)for(let n=0;n<3;n++){const a=p.angle+1.8+n*2.1+p.seed,reach=spec.width*(.22+smooth(.1,.8,p.age)*(.3+n*.16)),x=p.x+Math.cos(a)*reach,y=p.y+Math.sin(a)*reach,z=water+.07+Math.sin(this.visualTime*2+p.seed+n)*.04,scale=spec.width*(.16+n*.05)*(1-smooth(.82,1,p.age));if(scale>.08)this.wreckDebris.add(x-this.camera.x,y-this.camera.y,z,Math.cos(a),Math.sin(a),scale);}
      }
      this.uniforms(this.wreckProgram);gl.uniform1i(gl.getUniformLocation(this.wreckProgram,'uReduced'),this.reduced?1:0);
      for(let kind=0;kind<4;kind++){const spec=root.WidewakeBattle.enemies[kind],batch=this.wreckBatches[kind];gl.uniform3f(gl.getUniformLocation(this.wreckProgram,'uHull'),spec.length,spec.width,spec.height);this.stats.drawCalls+=batch.draw();this.stats.triangles+=batch.count*batch.vertexCount/3;}
      this.uniforms(this.main);this.stats.drawCalls+=this.wreckDebris.draw();this.stats.triangles+=this.wreckDebris.count*this.wreckDebris.vertexCount/3;this.stats.visibleWrecks=count;this.stats.wreckDebris=this.wreckDebris.count;this.stats.wreckRecords=records;
    }
    drawMuzzlesGPU(){
      if(this.reduced){this.stats.muzzleQuads=0;return;}const b=this.battle,a=b.raiders,gl=this.gl;this.quad.count=0;
      const add=(x,y,h,angle,scale,age,duration=.055)=>{if(age<0||age>.28)return;if(age<duration)this.quad.add(x-this.camera.x,y-this.camera.y,h,Math.max(.6,scale*4.6),1-age/duration,8,angle);this.quad.add(x-this.camera.x+age*.8,y-this.camera.y+age*.4,h+age*2,Math.max(.8,scale*5),1-age/.28,7,angle);};
      for(const m of b.mounts){const s=b.ships[m.ship];if(s.hp<=0||!this.visible(s.x,s.y,50)||!Number.isFinite(m.firedAt))continue;add(m.muzzleX,m.muzzleY,m.muzzleZ,m.fireAngle??m.angle,clamp(s.width/24,.12,.85),this.visualTime-m.firedAt,m.flashTotal||.055);}
      for(let i=0;i<a.count;i++){const age=this.visualTime-(a.fireAt?.[i]??-1000);if(a.hp[i]<=0||a.kind[i]!==2||age<0||age>.28||!this.visible(a.x[i],a.y[i],30))continue;const spec=root.WidewakeBattle.enemies[2],angle=enemyHeading(a,i,this.alpha),gun=a.gunAngle?.[i]??angle,scale=spec.width/24,x=a.x[i]+Math.cos(angle)*spec.length*.16+Math.cos(gun)*13*scale,y=a.y[i]+Math.sin(angle)*spec.length*.16+Math.sin(gun)*13*scale;add(x,y,(a.surface?.[i]||0)+spec.height*.28+.2+4*scale,gun,scale,age,.07);}
      this.stats.muzzleQuads=this.quad.count;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.particles);gl.uniform1i(gl.getUniformLocation(this.particles,'uReduced'),0);this.stats.drawCalls+=this.quad.draw();this.stats.triangles+=this.quad.count*2;gl.depthMask(true);gl.disable(gl.BLEND);
    }
    drawEffectsGPU(surface){
      const gl=this.gl,fx=this.battle.effects,z=this.zoom*this.baseScale,cam=this.camera;this.quad.count=0;
      for(let i=0;i<fx.count;i++){
        const kind=fx.kind[i],water=kind===3||kind===5||kind===6||kind===7;
        if(surface&&!water||!this.visible(fx.x[i],fx.y[i],Math.max(16,fx.size[i]*z+8)))continue;
        const life=clamp((fx.life[i]+(this.battle.time-this.visualTime))/fx.total[i],0,1);
        if(kind===6){const p=wreckState(fx,i,this.battle.time-this.visualTime,this._effectWreck||(this._effectWreck={})),spec=root.WidewakeBattle.enemies[p.kind],height=(this.battle.sea?.at(p.x,p.y,this.visualTime,this._effectWater||(this._effectWater={}),-1,false).height||0)+.13;
          if(surface)this.quad.add(p.x-cam.x,p.y-cam.y,height,spec.length*.69,life,10,p.angle,p.seed);
          else if(!this.reduced){if(p.age<.3)this.quad.add(p.x-cam.x,p.y-cam.y,height+spec.height*.26,spec.length*.21,1-p.age/.3,7,p.angle,p.seed);if(p.age>.24&&p.age<.70)this.quad.add(p.x-cam.x,p.y-cam.y,height,spec.length*.22,1-(p.age-.24)/.46,6,p.angle,p.seed);}
          continue;
        }
        if(kind===7){const age=1-life,t=age*fx.total[i],x=fx.x[i]+fx.vx[i]*t*.32,y=fx.y[i]+fx.vy[i]*t*.32,size=fx.size[i];if(surface)this.quad.add(x-cam.x,y-cam.y,fx.height[i]+.14,size,life,11,fx.angle[i],fx.variant[i]);else if(!this.reduced)for(const side of [-1,1])this.quad.add(x-cam.x-Math.sin(fx.angle[i])*size*.43*side,y-cam.y+Math.cos(fx.angle[i])*size*.43*side,fx.height[i]+.3,size*.82,life,12,fx.angle[i],fx.variant[i]);continue;}
        if(!surface&&(this.reduced&&kind!==0&&kind!==4||water&&life<.35))continue;
        const height=fx.height[i]+(kind===3?.12:0);
        const mode=surface?(kind===3?3:2):kind===3?4:kind===4?5:kind===5?6:kind,size=fx.size[i];
        this.quad.add(fx.x[i]-cam.x,fx.y[i]-cam.y,height,size,life,mode,fx.angle[i]+(kind===4?Math.PI:0),fx.variant?.[i]||0);
      }
      if(surface)this.stats.visibleWaterBlasts=this.quad.count;
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.uniforms(this.particles);gl.uniform1i(gl.getUniformLocation(this.particles,'uReduced'),this.reduced?1:0);this.stats.drawCalls+=this.quad.draw();this.stats.triangles+=this.quad.count*2;gl.depthMask(true);gl.disable(gl.BLEND);
    }
    sprite(type,angle){const frames=this.artSpecs?.[type]?.frames||(type.startsWith('raider')?32:64),n=((Math.round(angle/TAU*frames)%frames)+frames)%frames,key=type+':'+n;let sprite=this.spriteCache.get(key);if(sprite)return sprite;
      const mesh=this.meshes[type],a=n/frames*TAU,cos=Math.cos(a),sin=Math.sin(a),faces=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let i=0;i<mesh.length;i+=18){const points=[],world=[];let depth=0;for(let v=0;v<3;v++){const at=i+v*6,x=mesh[at]*cos-mesh[at+1]*sin,y=mesh[at]*sin+mesh[at+1]*cos,z=mesh[at+2],p=project(x,y,z);points.push([p.x,p.y]);world.push([x,y,z]);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);depth+=(x+y)*.6123724+z*.5;}
        const aa=world[1].map((v,k)=>v-world[0][k]),bb=world[2].map((v,k)=>v-world[0][k]),nx=aa[1]*bb[2]-aa[2]*bb[1],ny=aa[2]*bb[0]-aa[0]*bb[2],nz=aa[0]*bb[1]-aa[1]*bb[0],length=Math.hypot(nx,ny,nz)||1,light=.48+.52*Math.max(0,(-.45*nx-.65*ny+nz)/(length*Math.hypot(.45,.65,1)));
        faces.push({points,depth,color:`rgb(${Math.round(mesh[i+3]*light*255)},${Math.round(mesh[i+4]*light*255)},${Math.round(mesh[i+5]*light*255)})`});}
      const resolution=type==='launch'?16:this.hullSpecs[type]?6:['turret','barrel','mortar'].includes(type)?8:Math.min(8,this.artSpecs?.[type]?.ppu||1);sprite=document.createElement('canvas');sprite.width=Math.ceil((maxX-minX)*resolution)+4;sprite.height=Math.ceil((maxY-minY)*resolution)+4;sprite.originX=minX-2/resolution;sprite.originY=minY-2/resolution;sprite.resolution=resolution;const c=sprite.getContext('2d');c.scale(resolution,resolution);c.translate(-sprite.originX,-sprite.originY);
      faces.sort((a,b)=>a.depth-b.depth);for(const f of faces){c.beginPath();f.points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=f.color;c.fill();}this.spriteCache.set(key,sprite);return sprite;
    }
    paintSprite(type,angle,x,y,scale=1,z=0,gx=0,gy=0){const p=this.project(x,y,z),s=this.sprite(type,angle),zoom=this.zoom*this.baseScale*scale;const c=this.fallback;c.save();c.translate(p.x,p.y);c.transform(1,-H*(gx-gy)/(2*A),0,1-H*(gx+gy)/(2*B),0,0);c.drawImage(s,s.originX*zoom,s.originY*zoom,s.width/s.resolution*zoom,s.height/s.resolution*zoom);c.restore();}
    renderCanvas(){const c=this.fallback,b=this.battle,z=this.zoom*this.baseScale;c.fillStyle=palette.water;c.fillRect(0,0,this.width,this.height);this.surface?.background();this.terrain?.renderCanvas(this);this.surface?.draw();this.wakes?.drawCanvas(this);this.drawEnemyWaterCanvas();this.drawWaterCanvas(true);const list=[],a=b.raiders;
      for(let i=0;i<a.count;i++){const x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha;if(a.hp[i]>0&&this.visible(x,y,12)){const angle=enemyHeading(a,i,this.alpha),wave=b.sea?.at(x,y,this.visualTime,this._raiderWater||(this._raiderWater={}),-1,false),roll=this.reduced?0:clamp(-(a.turn?.[i]||0)*Math.hypot(a.vx[i],a.vy[i])*.0012,-.12,.12);list.push({x,y,type:'raider'+a.kind[i],angle,z:wave?.height||0,gx:(wave?.dx||0)*.3-Math.sin(angle)*roll,gy:(wave?.dy||0)*.3+Math.cos(angle)*roll});}}
      this.stats.visibleRaiders=list.length;if(this.meshes.salvage)for(const item of b.loot)if(this.visible(item.x,item.y,8))list.push({...item,type:'salvage',angle:0,z:b.sea?.at(item.x,item.y,this.visualTime,this._lootWater||(this._lootWater={})).height||0});for(const s of b.ships)if(s.hp>0)list.push({...this.poses[s.id],type:s.type});list.sort((a,b)=>a.x+a.y-b.x-b.y);for(const s of list)this.paintSprite(s.type,s.angle,s.x,s.y,1,s.z||0,s.gx||0,s.gy||0);
      this.drawWrecksCanvas();const shots=b.shots;let traces=0;
      for(let kind=0;kind<4;kind++){c.beginPath();c.strokeStyle=kind===3?'#e7a477':'#f4cf85';c.fillStyle=kind===2?'#d4ba80':'#fff1c7';c.lineWidth=kind===2?1:Math.max(.42,z*(kind===1?.55:.24));c.lineCap='round';
        for(let i=0;i<shots.count;i++){if(shots.kind[i]!==kind)continue;const x=shots.px[i]+(shots.x[i]-shots.px[i])*this.alpha,y=shots.py[i]+(shots.y[i]-shots.py[i])*this.alpha,height=shots.previousHeight[i]+(shots.height[i]-shots.previousHeight[i])*this.alpha;if(!this.visible(x,y,Math.max(45,height*z*H+12)))continue;const p=this.project(x,y,height);
          if(kind===2){c.moveTo(p.x+Math.max(.65,z*.65),p.y);c.arc(p.x,p.y,Math.max(.65,z*.65),0,TAU);continue;}
          const speed=Math.hypot(shots.vx[i],shots.vy[i])||1,length=shotLength(shots,i,x,y,this.reduced),tailHeight=height-(shots.height[i]-shots.previousHeight[i])*60*length/speed,tail=this.project(x-shots.vx[i]/speed*length,y-shots.vy[i]/speed*length,tailHeight);c.moveTo(tail.x,tail.y);c.lineTo(p.x,p.y);traces++;
        }kind===2?c.fill():c.stroke();
      }c.lineCap='butt';this.stats.visibleTracers=traces;
      for(const mount of b.mounts){const ship=b.ships[mount.ship],pose=this.poses[ship.id];if(ship.hp<=0)continue;const x=pose.x+Math.cos(pose.angle)*mount.along,y=pose.y+Math.sin(pose.angle)*mount.along,h=Math.min(8,ship.height*.28)+.2+(pose.z||0)+(pose.pitch||0)*mount.along,mountScale=clamp(ship.width/24,.12,.85),q=this.project(x,y,h),recoil=this.reduced?0:mount.recoil,r=this.project(x-Math.cos(mount.angle)*recoil,y-Math.sin(mount.angle)*recoil,h);this.paintSprite('turret',mount.angle,x,y,mountScale,h);this.paintSprite(mount.weapon==='mortar'?'mortar':'barrel',mount.angle,x-Math.cos(mount.angle)*recoil,y-Math.sin(mount.angle)*recoil,mountScale,h);}
      this.drawEnemyGunsCanvas();this.drawWaterCanvas(false);this.drawCombatEffectsCanvas();this.drawMuzzlesCanvas();
      const fx=b.effects;for(let i=0;i<fx.count;i++){if(fx.kind[i]>=3||this.reduced&&fx.kind[i]!==0)continue;const q=this.project(fx.x[i],fx.y[i],fx.height[i]),life=fx.life[i]/fx.total[i],size=fx.size[i]*z*(1-life*.7);c.globalAlpha=life;if(fx.kind[i]===2){c.strokeStyle='#8bb9bd';c.beginPath();c.ellipse(q.x,q.y,size,size*.6,0,0,TAU);c.stroke();}else{c.fillStyle=life>.72?'#ffe3a9':life>.4?'#ec8955':'#4b616d';c.beginPath();for(let j=0;j<9;j++){const a=j/9*TAU,r=size*(.25+(j%3)*.025);c.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r);}c.closePath();c.fill();}}c.globalAlpha=1;this.stats.drawCalls=list.length+shots.count;}
    drawEnemyWaterCanvas(){
      const c=this.fallback,b=this.battle,a=b.raiders,z=this.zoom*this.baseScale;let shown=0;if(this.reduced){this.stats.enemyWakeCount=0;return;}c.strokeStyle='#9dc6c1';c.lineWidth=Math.max(.35,z*.3);
      for(let i=0;i<a.count&&shown<512;i++){if(a.hp[i]<=0||!this.visible(a.x[i],a.y[i],30))continue;const speed=Math.hypot(a.vx[i],a.vy[i]);if(speed<3)continue;const spec=root.WidewakeBattle.enemies[a.kind[i]],angle=enemyHeading(a,i,this.alpha),cos=Math.cos(angle),sin=Math.sin(angle),x=a.px[i]+(a.x[i]-a.px[i])*this.alpha,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha,h=(a.surface?.[i]||0)+.1;
        if(b.field&&b.field.sample(x-cos*spec.length*.8,y-sin*spec.length*.8,this._enemyWakeWater||(this._enemyWakeWater={})).depth<.5)continue;
        c.globalAlpha=Math.min(1,speed/35)*.22;for(const side of [-1,1]){const from=this.project(x-cos*spec.length*.35-sin*side*spec.width*.24,y-sin*spec.length*.35+cos*side*spec.width*.24,h),to=this.project(x-cos*spec.length*1.02-sin*side*spec.width*.5,y-sin*spec.length*1.02+cos*side*spec.width*.5,h);c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();}shown++;
      }c.globalAlpha=1;this.stats.enemyWakeCount=shown;
    }
    drawEnemyGunsCanvas(){const b=this.battle,a=b.raiders;let count=0;for(let i=0;i<a.count&&count<256;i++){if(a.hp[i]<=0||a.kind[i]!==2||!this.visible(a.x[i],a.y[i],25))continue;const spec=root.WidewakeBattle.enemies[2],angle=enemyHeading(a,i,this.alpha),gun=a.gunAngle?.[i]??angle,scale=spec.width/24,x=a.px[i]+(a.x[i]-a.px[i])*this.alpha+Math.cos(angle)*spec.length*.16,y=a.py[i]+(a.y[i]-a.py[i])*this.alpha+Math.sin(angle)*spec.length*.16,h=(a.surface?.[i]||0)+spec.height*.28+.2,recoil=this.reduced?0:Math.max(0,1-(this.visualTime-(a.fireAt?.[i]??-1000))/.12)*scale*2;this.paintSprite('turret',gun,x,y,scale,h);this.paintSprite('barrel',gun,x-Math.cos(gun)*recoil,y-Math.sin(gun)*recoil,scale,h);count++;}this.stats.enemyGunCount=count;}
    drawWrecksCanvas(){if(!this.wreckArt)return;const c=this.fallback,b=this.battle,fx=b.effects,z=this.zoom*this.baseScale;let count=0,records=0,debris=0;
      for(let i=0;i<fx.count&&records<128;i++){if(fx.kind[i]!==6)continue;const p=wreckState(fx,i,b.time-this.visualTime,this._wreckState||(this._wreckState={}));if(!this.visible(p.x,p.y,45))continue;records++;const spec=root.WidewakeBattle.enemies[p.kind],water=b.sea?.at(p.x,p.y,this.visualTime,this._wreckWater||(this._wreckWater={}),-1,false).height||0;
        if(p.age<.88&&count<32){this.paintWreckCanvas(p,spec,water);count++;}
        if(p.age>.10)for(let n=0;n<3;n++){const a=p.angle+1.8+n*2.1+p.seed,reach=spec.width*(.22+smooth(.1,.8,p.age)*(.3+n*.16)),x=p.x+Math.cos(a)*reach,y=p.y+Math.sin(a)*reach,scale=spec.width*(.16+n*.05)*(1-smooth(.82,1,p.age)),from=this.project(x-Math.cos(a)*scale*.5,y-Math.sin(a)*scale*.5,water+.1),to=this.project(x+Math.cos(a)*scale*.5,y+Math.sin(a)*scale*.5,water+.1);c.globalAlpha=1;c.lineWidth=Math.max(.45,scale*z*.24);c.strokeStyle='#9c855c';c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();debris++;}
      }c.globalAlpha=1;this.stats.visibleWrecks=count;this.stats.wreckDebris=debris;this.stats.wreckRecords=records;
    }
    paintWreckCanvas(p,spec,water){const c=this.fallback,mesh=this.wreckArt.models[p.kind],pool=this._wreckFacePool||(this._wreckFacePool=[]),faces=this._wreckSorted||(this._wreckSorted=[]),v=this._wreckVertices||(this._wreckVertices=new Float64Array(9)),clip=this._wreckClip||(this._wreckClip=new Float64Array(12)),open=smooth(.07,.45,p.age),founder=smooth(.12,.8,p.age),side=p.seed<.5?-1:1,cos=Math.cos(p.angle),sin=Math.sin(p.angle),scale=this.zoom*this.baseScale;let count=0;faces.length=0;c.globalAlpha=1;
      for(let i=0;i<mesh.length;i+=27){const part=mesh[i+6],pivot=(part-1)*spec.length*.28,pitch=this.reduced?0:(part-1)*founder*.46,roll=this.reduced?0:side*founder*(.35+p.seed*.45),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),along=pivot+(part-1)*spec.length*.085*open,across=(part-1)*side*spec.width*.17*open,sink=spec.height*(.03+2.4*smooth(.22,.86,p.age)+.30*(part===1?1:0)*founder);
        for(let n=0;n<3;n++){const at=i+n*9,lx=mesh[at]-pivot,ly=mesh[at+1],lz=mesh[at+2],xx=lx*cp+lz*sp,zz=-lx*sp+lz*cp,x=xx+along,y=ly*cr-zz*sr+across;v[n*3]=p.x+x*cos-y*sin;v[n*3+1]=p.y+x*sin+y*cos;v[n*3+2]=ly*sr+zz*cr-sink;}
        // Cut every rigid section at the sea plane, exactly as GPU water depth
        // hides its submerged faces. Reuse polygon storage across all wrecks.
        let vertices=0;for(let n=0;n<3;n++){const at=n*3,next=((n+1)%3)*3,inside=v[at+2]>=.015,other=v[next+2]>=.015;if(inside){for(let k=0;k<3;k++)clip[vertices*3+k]=v[at+k];vertices++;}if(inside!==other){const t=(.015-v[at+2])/(v[next+2]-v[at+2]);for(let k=0;k<3;k++)clip[vertices*3+k]=v[at+k]+(v[next+k]-v[at+k])*t;vertices++;}}
        if(vertices<3)continue;let face=pool[count];if(!face)pool[count]=face={points:new Float32Array(8),n:0,depth:0,color:''};count++;face.n=vertices;face.depth=0;
        for(let n=0;n<vertices;n++){const x=clip[n*3]-this.camera.x,y=clip[n*3+1]-this.camera.y,z=clip[n*3+2]+water;face.points[n*2]=this.width/2+(x-y)*A*scale;face.points[n*2+1]=this.height/2+((x+y)*B-z*H)*scale;face.depth+=(x+y)*.6123724+z*.5;}
        const ax=v[3]-v[0],ay=v[4]-v[1],az=v[5]-v[2],bx=v[6]-v[0],by=v[7]-v[1],bz=v[8]-v[2];let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;if(nz<0){nx=-nx;ny=-ny;nz=-nz;}const length=Math.hypot(nx,ny,nz)||1,light=(.53+.47*Math.max(0,(-.45*nx-.65*ny+nz)/(length*Math.hypot(.45,.65,1))))*(.95-founder*.17);face.color=`rgb(${Math.round(mesh[i+3]*light*255)},${Math.round(mesh[i+4]*light*255)},${Math.round(mesh[i+5]*light*255)})`;face.depth/=vertices;faces.push(face);
      }faces.sort((a,b)=>a.depth-b.depth);for(const face of faces){c.fillStyle=face.color;c.beginPath();c.moveTo(face.points[0],face.points[1]);for(let n=1;n<face.n;n++)c.lineTo(face.points[n*2],face.points[n*2+1]);c.closePath();c.fill();}
    }
    drawCombatEffectsCanvas(){
      const c=this.fallback,fx=this.battle.effects,z=this.zoom*this.baseScale;
      for(let i=0;i<fx.count;i++){const kind=fx.kind[i];if(kind<4||!this.visible(fx.x[i],fx.y[i],20))continue;const life=clamp((fx.life[i]+this.battle.time-this.visualTime)/fx.total[i],0,1),age=1-life,size=fx.size[i],q=this.project(fx.x[i],fx.y[i],fx.height[i]);
        if(kind===4){
          const smoke=this.project(fx.x[i]+Math.cos(fx.angle[i])*age*size*.32,fx.y[i]+Math.sin(fx.angle[i])*age*size*.32,fx.height[i]+age*size*.25);c.fillStyle='#4c514b';c.globalAlpha=life*.32;c.beginPath();c.arc(smoke.x,smoke.y,Math.max(.3,size*z*(.08+age*.24)),0,TAU);c.fill();if(this.reduced)continue;
          c.lineWidth=Math.max(.35,z*.2);for(let j=0;j<6;j++){const angle=fx.angle[i]+Math.PI+(j-2.5)*.28,d=age*(.6+((j*43)%17)/23)*size,p=this.project(fx.x[i]+Math.cos(angle)*d,fx.y[i]+Math.sin(angle)*d,fx.height[i]+size*(age*.22-age*age*.8)),tail=this.project(fx.x[i]+Math.cos(angle)*d*.78,fx.y[i]+Math.sin(angle)*d*.78,fx.height[i]+size*(age*.22-age*age*.8));c.globalAlpha=life;c.strokeStyle=life>.6?'#f5dca1':'#a78d63';c.beginPath();c.moveTo(tail.x,tail.y);c.lineTo(p.x,p.y);c.stroke();}
          if(age<.16){c.globalAlpha=1-age/.16;c.fillStyle='#fff0c2';c.beginPath();c.arc(q.x,q.y,Math.max(.35,size*z*.1),0,TAU);c.fill();}
        }else if(kind===5&&!this.reduced){
          const lift=Math.max(0,Math.sin(Math.min(1,age/.48)*Math.PI))*.75;for(let j=0;j<4;j++){const lane=j-1.5,p=this.project(fx.x[i]+Math.cos(fx.angle[i]+Math.PI/2)*lane*age*size*.12,fx.y[i]+Math.sin(fx.angle[i]+Math.PI/2)*lane*age*size*.12,fx.height[i]+lift*size*(.4-Math.abs(lane)*.06));c.globalAlpha=life*.7;c.fillStyle=j<2?'#6a9eac':'#c2ded7';c.beginPath();c.ellipse(p.x,p.y,Math.max(.2,size*z*(.06+age*.06)),Math.max(.3,size*z*(.04+lift*.3)),0,0,TAU);c.fill();}
        }else if(kind===6){const p=wreckState(fx,i,this.battle.time-this.visualTime,this._effectWreck||(this._effectWreck={})),spec=root.WidewakeBattle.enemies[p.kind],h=(this.battle.sea?.at(p.x,p.y,this.visualTime,this._effectWater||(this._effectWater={}),-1,false).height||0)+.1,water=this.project(p.x,p.y,h);if(!this.reduced&&age<.3){c.globalAlpha=(1-age/.3)*.23;c.fillStyle='#424d4d';c.beginPath();c.arc(water.x+age*spec.length*z*.08,water.y-age*spec.length*z*.12,Math.max(.3,spec.length*z*(.025+age*.07)),0,TAU);c.fill();}if(!this.reduced&&age>.24&&age<.7){const t=(age-.24)/.46,lift=Math.sin(Math.min(1,t/.8)*Math.PI);for(let n=0;n<5;n++){const lane=n-2;c.globalAlpha=(1-t)*.63;c.fillStyle=n<2?'#6d9eaa':'#c6dfd6';c.beginPath();c.ellipse(water.x+lane*spec.width*z*(.02+t*.08),water.y-lift*spec.width*z*(.22-Math.abs(lane)*.035),Math.max(.3,spec.width*z*.045),Math.max(.4,spec.width*z*(.03+lift*.18)),0,0,TAU);c.fill();}}}
        else if(kind===7&&!this.reduced){const t=age*fx.total[i],x=fx.x[i]+fx.vx[i]*t*.32,y=fx.y[i]+fx.vy[i]*t*.32,lift=Math.sin(Math.min(1,age/.75)*Math.PI),intensity=fx.variant[i];for(let n=0;n<8;n++){const lane=(n-3.5)/3.5,p=this.project(x+Math.cos(fx.angle[i])*lane*age*size*.7,y+Math.sin(fx.angle[i])*lane*age*size*.7,fx.height[i]+lift*size*(.18+(1-Math.abs(lane))*.34)*(.55+intensity*.45));c.globalAlpha=(1-smooth(.46,1,age))*.75;c.fillStyle=n<3?'#75a6ac':'#d6e9da';c.beginPath();c.ellipse(p.x,p.y,Math.max(.25,size*z*(.028+age*.02)),Math.max(.3,size*z*(.025+lift*.08)),0,0,TAU);c.fill();}}
      }c.globalAlpha=1;
    }
    drawMuzzlesCanvas(){
      const c=this.fallback,b=this.battle,a=b.raiders,z=this.zoom*this.baseScale;let shown=0;if(this.reduced){this.stats.muzzleQuads=0;return;}
      const add=(x,y,h,angle,scale,age,duration=.055)=>{if(age<0||age>.28)return;const q=this.project(x,y,h),axis=project(Math.cos(angle),Math.sin(angle)),length=Math.hypot(axis.x,axis.y)||1,dx=axis.x/length,dy=axis.y/length,size=Math.max(.6,scale*4.6)*z;if(age<duration){c.globalAlpha=1-age/duration;c.fillStyle='#ffebaf';c.beginPath();c.moveTo(q.x-dy*size*.28,q.y+dx*size*.28);c.lineTo(q.x+dx*size,q.y+dy*size);c.lineTo(q.x+dy*size*.28,q.y-dx*size*.28);c.lineTo(q.x-dx*size*.12,q.y-dy*size*.12);c.closePath();c.fill();shown++;}c.globalAlpha=(1-age/.28)*.28;c.fillStyle='#68726c';c.beginPath();c.arc(q.x+age*size*.3,q.y-age*size*.4,Math.max(.25,size*(.12+age*.6)),0,TAU);c.fill();shown++;};
      for(const m of b.mounts){const s=b.ships[m.ship];if(s.hp<=0||!this.visible(s.x,s.y,50)||!Number.isFinite(m.firedAt))continue;add(m.muzzleX,m.muzzleY,m.muzzleZ,m.fireAngle??m.angle,clamp(s.width/24,.12,.85),this.visualTime-m.firedAt,m.flashTotal||.055);}
      for(let i=0;i<a.count;i++){const age=this.visualTime-(a.fireAt?.[i]??-1000);if(a.hp[i]<=0||a.kind[i]!==2||age<0||age>.28||!this.visible(a.x[i],a.y[i],30))continue;const spec=root.WidewakeBattle.enemies[2],angle=enemyHeading(a,i,this.alpha),gun=a.gunAngle?.[i]??angle,scale=spec.width/24;add(a.x[i]+Math.cos(angle)*spec.length*.16+Math.cos(gun)*13*scale,a.y[i]+Math.sin(angle)*spec.length*.16+Math.sin(gun)*13*scale,(a.surface?.[i]||0)+spec.height*.28+.2+4*scale,gun,scale,age,.07);}
      c.globalAlpha=1;this.stats.muzzleQuads=shown;
    }
    drawWaterCanvas(surface){
      const c=this.fallback,fx=this.battle.effects,z=this.zoom*this.baseScale;let shown=0;
      if(!surface&&this.reduced)return;
      for(let i=0;i<fx.count;i++){
        if(surface&&(fx.kind[i]===6||fx.kind[i]===7)){this.drawAftermathWaterCanvas(i);continue;}
        if(fx.kind[i]===5&&surface&&this.visible(fx.x[i],fx.y[i],fx.size[i]*z+8)){const life=clamp((fx.life[i]+this.battle.time-this.visualTime)/fx.total[i],0,1),age=1-life,q=this.project(fx.x[i],fx.y[i],fx.height[i]),size=fx.size[i]*z*(.22+age*.68);c.globalAlpha=life*.32;c.strokeStyle='#a5ceca';c.lineWidth=Math.max(.35,z*.18);c.beginPath();c.ellipse(q.x,q.y,size,size*.5,0,0,TAU);c.stroke();continue;}
        if(fx.kind[i]!==3||!this.visible(fx.x[i],fx.y[i],fx.size[i]*z+8))continue;
        const life=clamp((fx.life[i]+this.battle.time-this.visualTime)/fx.total[i],0,1),age=1-life,size=fx.size[i]*z,water=fx.height[i]+.12,q=this.project(fx.x[i],fx.y[i],water);shown++;
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
    drawAftermathWaterCanvas(i){const c=this.fallback,b=this.battle,fx=b.effects,z=this.zoom*this.baseScale,kind=fx.kind[i],life=clamp((fx.life[i]+b.time-this.visualTime)/fx.total[i],0,1),age=1-life;let x=fx.x[i],y=fx.y[i],h=fx.height[i]+.13,angle=fx.angle[i],length=fx.size[i],width=length*.64,seed=fx.variant[i];
      if(kind===6){const p=wreckState(fx,i,b.time-this.visualTime,this._waterWreck||(this._waterWreck={})),spec=root.WidewakeBattle.enemies[p.kind];x=p.x;y=p.y;angle=p.angle;length=spec.length*.69;width=length*.44;seed=p.seed;h=(b.sea?.at(x,y,this.visualTime,this._effectWater||(this._effectWater={}),-1,false).height||0)+.13;}else{x+=fx.vx[i]*age*fx.total[i]*.32;y+=fx.vy[i]*age*fx.total[i]*.32;}
      if(!this.visible(x,y,length))return;const cos=Math.cos(angle),sin=Math.sin(angle),path=(scale,start,end)=>{c.beginPath();for(let n=0;n<=28;n++){const a=start+(end-start)*n/28,rough=kind===6?1+Math.sin(a*7+seed*17)*.06+Math.sin(a*13-seed*17)*.035:1,along=Math.cos(a)*length*scale*rough,across=Math.sin(a)*width*scale*rough,p=this.project(x+along*cos-across*sin,y+along*sin+across*cos,h);n?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);}};
      if(kind===6){c.globalAlpha=(1-smooth(.76,1,age))*.2;c.fillStyle='#102e37';path(.72,0,TAU);c.closePath();c.fill();c.strokeStyle='#b2d3c5';c.lineWidth=Math.max(.4,z*.35);c.globalAlpha=(1-smooth(.76,1,age))*.44;for(let n=0;n<8;n++){const a=n*TAU/8+seed;path(.76+age*.15,a,a+.47);c.stroke();}c.globalAlpha=smooth(.14,.38,age)*(1-smooth(.68,.95,age))*.56;for(let n=0;n<7;n++){const along=(n-3)*length*.2,across=Math.sin(n*4.7+seed*17)*width*.22,p=this.project(x+along*cos-across*sin,y+along*sin+across*cos,h),r=length*(.014+((age*1.6+n*.17)%1)*.025)*z;c.beginPath();c.ellipse(p.x,p.y,r,r*.5,0,0,TAU);c.stroke();}}
      else{c.globalAlpha=life*(.48+seed*.52)*.52;c.strokeStyle='#c4e3d4';c.lineWidth=Math.max(.4,z*.4);path(.16+age*.74,0,TAU);c.stroke();if(age<.45){c.globalAlpha=(1-smooth(.05,.45,age))*.8;const a=this.project(x-sin*length*.5,y+cos*length*.5,h),d=this.project(x+sin*length*.5,y-cos*length*.5,h);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(d.x,d.y);c.stroke();}}
      c.globalAlpha=1;
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
    dispose(){this.terrain?.dispose();this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);if(this.gl&&!this.lost){this.atlas?.dispose();this.waterMotion?.dispose();this.shadows?.dispose();this.mechanisms?.dispose();this.surface?.dispose();this.gl.deleteTexture(this.noise);for(const batch of Object.values(this.batches))batch.dispose();for(const batch of this.wreckBatches||[])batch.dispose();this.wreckDebris?.dispose();this.quad.dispose();this.tracers.dispose();for(const p of [this.main,this.water,this.particles,this.tracerProgram,this.wreckProgram])if(p)this.gl.deleteProgram(p);}this.overlay.remove();}
  }
  const api={Ocean,project,unproject,direction,aimGuide,readableScale,stops,boatMesh,geometry,Batch,program};root.WidewakeOcean=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
