/* Original nautical models, baked into directional sprites by the ocean renderer.
   Geometry is the editable source; no external game artwork is used. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function mesh(type,spec,G){
    const g=G(),l=spec.length,w=spec.width,h=Math.min(8,spec.height*.28),enemy=type.startsWith('raider'),small=type==='launch';
    const material={hull:enemy?'#825851':type==='trawler'?'#416f78':type==='oilrig'?'#d1c8a0':small?'#617e89':'#6c8998',deck:small?'#b59c71':'#98957c',rail:'#d3d7c2',dark:'#293d48',wood:'#a9926b',glass:'#294b61',rim:'#ddd8b6'};
    const tri=(a,b,c,color)=>g.tri(a,b,c,color);
    function cylinder(x,y,z,r,height,color,n=12){for(let i=0;i<n;i++){const a=i/n*TAU,b=(i+1)/n*TAU,p=[x+Math.cos(a)*r,y+Math.sin(a)*r,z],q=[x+Math.cos(b)*r,y+Math.sin(b)*r,z],pp=[p[0],p[1],z+height],qq=[q[0],q[1],z+height];g.face([p,q,qq,pp],color);tri([x,y,z+height],pp,qq,color);}}
    function beam(a,b,r,color,n=6){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz)||1,u=[-dy,dx,0],ul=Math.hypot(...u);if(ul<.001){u[0]=1;u[1]=0;}else{u[0]/=ul;u[1]/=ul;}const v=[-dz*u[1]/length,dz*u[0]/length,(dx*u[1]-dy*u[0])/length];
      for(let i=0;i<n;i++){const ca=Math.cos(i/n*TAU)*r,sa=Math.sin(i/n*TAU)*r,cb=Math.cos((i+1)/n*TAU)*r,sb=Math.sin((i+1)/n*TAU)*r,p=a.map((value,k)=>value+u[k]*ca+v[k]*sa),q=a.map((value,k)=>value+u[k]*cb+v[k]*sb),pp=b.map((value,k)=>value+u[k]*ca+v[k]*sa),qq=b.map((value,k)=>value+u[k]*cb+v[k]*sb);g.face([p,q,qq,pp],color);}}
    // Curved bow and tumblehome, with a separate dark waterline and inset deck.
    const shape=[[-.47,-.29],[-.42,-.42],[-.26,-.49],[.05,-.47],[.28,-.36],[.44,-.19],[.5,0],[.44,.19],[.28,.36],[.05,.47],[-.26,.49],[-.42,.42],[-.47,.29]],ring=(scale,z)=>shape.map(p=>[p[0]*l*scale,p[1]*w*scale,z]);
    const rings=[ring(.84,-.12),ring(.96,h*.25),ring(1,h),ring(.94,h+.15)];
    for(let level=0;level<3;level++)for(let i=0;i<shape.length;i++){const j=(i+1)%shape.length;g.face([rings[level][i],rings[level][j],rings[level+1][j],rings[level+1][i]],level===0?material.dark:level===1?material.hull:material.rim);}
    g.face(rings[3],material.deck);
    // Deck plank/seam marks and raised rub rails have their own silhouettes.
    const unit=small?.26:1.5;
    for(let x=-l*.39;x<l*.29;x+=unit*1.8)g.box(x,0,h+.17,unit*.08,w*.72,.025,small?'#756b52':'#697b79','#697b79');
    for(let i=0;i<shape.length;i++){const j=(i+1)%shape.length;beam([shape[i][0]*l*.97,shape[i][1]*w*.97,h+.3],[shape[j][0]*l*.97,shape[j][1]*w*.97,h+.3],small?.045:.16,material.rim);}
    if(enemy){g.box(-l*.08,0,h,l*.3,w*.56,2.2,'#9e8071','#674f4c');g.box(-l*.03,0,h+2.25,l*.22,w*.48,.4,'#b29e86','#725d50');g.box(l*.22,0,h,2.7,2.1,1.8,'#474c50','#303b41');beam([l*.21,0,h+2],[l*.45,0,h+2.3],.35,'#a6a596');return new Float32Array(g.out);}
    if(small){
      g.box(-.4,0,h+.2,3.1,1.5,.08,'#655c48','#655c48');for(const x of [-1.15,.9])g.box(x,0,h+.26,.36,1.6,.22,'#c7b58b','#857458');
      g.box(-2.45,0,.15,.42,.48,.7,'#62717c','#34444f');g.box(-2.45,0,.85,.56,.56,.23,'#aeb6b0','#606c76');beam([-.15,-.8,h+.3],[.3,-.8,h+.5],.04,'#dad3af');
      for(const y of [-.76,.76])beam([-.2,y,h+.3],[.4,y,h+1.1],.035,'#b8c6bc');g.face([[.38,-.76,h+1.1],[.38,.76,h+1.1],[.22,.76,h+.7],[.22,-.76,h+.7]],'#91b8bd');
      cylinder(.3,0,h+.23,.18,.45,'#776b55',8);cylinder(.32,0,h+.68,.13,.12,'#ddc397',8);beam([-1.8,-.83,h+.34],[1.8,-.83,h+.34],.04,'#d6bd8a');
      cylinder(2.05,0,h+.16,.16,.1,'#544c3f',10);cylinder(2.05,0,h+.25,.1,.04,'#c9b486',10);return new Float32Array(g.out);
    }
    const cabinX=-l*.25,cabinL=l*.23,cabinW=w*.58,cabinH=Math.min(6,spec.height*.3);
    g.box(cabinX,0,h+.2,cabinL,cabinW,cabinH,'#d4d3b8','#b1bba9');g.box(cabinX,0,h+cabinH+.2,cabinL+1,cabinW+1,.65,'#c4d0c4','#657e88');
    for(let x=cabinX-cabinL*.36;x<cabinX+cabinL*.4;x+=2.2)for(const y of [-1,1]){g.box(x,y*(cabinW/2+.03),h+cabinH*.54,1.45,.08,1.25,material.glass,material.glass);g.box(x,y*(cabinW/2+.1),h+cabinH*.54+.7,1.6,.15,.12,'#d2cbae','#d2cbae');}
    g.box(cabinX+cabinL/2+.04,0,h+cabinH*.6,.1,cabinW*.75,1.5,material.glass,material.glass);
    cylinder(cabinX-.7,0,h+cabinH+.9,.7,2.4,'#7d8887');cylinder(cabinX-.7,0,h+cabinH+3.25,.9,.2,'#293c48');
    beam([cabinX+2,0,h+cabinH+1],[cabinX+2,0,h+cabinH+6],.13,'#b8c6bd');beam([cabinX+2,-1.8,h+cabinH+5],[cabinX+2,1.8,h+cabinH+5],.1,'#7c929b');
    // Safety rail posts, cleats, coiled rope, lockers and stairs use metre scale.
    for(let x=-l*.37;x<l*.34;x+=4.5)for(const side of [-1,1]){const y=side*w*(x>l*.2?.32:.43);beam([x,y,h+.3],[x,y,h+1.3],.09,material.rail);}
    for(const side of [-1,1])beam([-l*.35,side*w*.43,h+1.3],[l*.2,side*w*.43,h+1.3],.08,material.rail);
    for(const x of [-l*.38,l*.27])for(const side of [-1,1]){const y=side*w*.27;cylinder(x,y,h+.3,.45,.6,'#495b61',8);beam([x-.65,y,h+.8],[x+.65,y,h+.8],.14,'#b7c2b6');}
    for(let i=0;i<5;i++)g.box(cabinX+cabinL/2+1+i*.45,cabinW*.3,h+.25+(4-i)*.22,.48,1.4,.22,'#929d91','#566c74');
    if(type==='trawler'){
      g.box(l*.12,0,h+.25,l*.26,w*.53,.65,'#566e72','#364e59');g.box(l*.12,0,h+.95,l*.23,w*.47,.15,'#748d83','#526f68');
      for(const side of [-1,1]){const y=side*w*.4;beam([l*.07,y,h],[l*.07,y,h+14],.28,'#a8bba9');beam([l*.07,y,h+14],[l*.22,side*w*.55,h+14],.22,'#a8bba9');beam([l*.07,y,h+4],[l*.22,side*w*.55,h+14],.12,'#6c8d87');beam([l*.22,side*w*.55,h+14],[l*.22,side*w*.55,h+2],.045,'#bac2ab');}
      beam([l*.07,-w*.4,h+14],[l*.07,w*.4,h+14],.3,'#bcc9ae');
      for(let i=0;i<5;i++){g.box(l*.18+(i%2)*2.2,-w*.22+Math.floor(i/2)*2.4,h+1,1.8,2,.85,i%2?'#bb9c69':'#7b9a8e','#4d706b');}
    }else if(type==='oilrig'){
      g.box(l*.14,0,h+.25,l*.35,w*.64,1,'#a7b5a7','#5d7980');
      for(const side of [-1,1]){cylinder(-l*.02,side*w*.26,h+1,2.4,6,'#c5c5a7',16);cylinder(-l*.02,side*w*.26,h+7,2.35,.3,'#dee0c0',16);beam([-l*.02,side*w*.26,h+1],[l*.18,side*w*.26,h+1],.35,'#819a96');}
      const towerX=l*.19,base=6,top=3,height=22;
      for(const a of [-1,1])for(const b of [-1,1]){beam([towerX+a*base,b*base,h+1],[towerX+a*top,b*top,h+height],.35,'#d4cc9f');}
      for(let level=0;level<4;level++){const z=h+1+level*5,r=base-level*.68;for(const side of [-1,1]){beam([towerX-r,side*r,z],[towerX+r,side*r,z+4.5],.14,'#b5b895');beam([towerX+r,side*r,z],[towerX-r,side*r,z+4.5],.14,'#b5b895');beam([towerX+side*r,-r,z],[towerX+side*r,r,z+4.5],.14,'#8eac9c');}}
      g.box(towerX,0,h+height,7,7,.65,'#e4ddaf','#9aaa97');for(let z=h+1;z<h+height;z+=.8)beam([towerX+base,-.8,z],[towerX+base,.8,z],.07,'#b7c4b3');
    }else if(type==='repair'){
      for(const side of [-1,1])g.box(l*.08,side*w*.2,h+.2,7,3,2.5,'#8eac96','#557b79');beam([l*.27,0,h],[l*.27,0,h+8],.3,'#b5c8b2');beam([l*.27,0,h+8],[l*.05,0,h+10],.25,'#b5c8b2');beam([l*.05,0,h+10],[l*.05,0,h+1],.06,'#d4d7b9');
    }else{
      for(let x=-l*.03;x<l*.3;x+=8){g.box(x,0,h+.2,5,w*.25,.8,'#737f80','#4d626c');for(const side of [-1,1])g.box(x,side*w*.29,h+.25,3.2,1.7,1.5,'#a0b1a8','#5b7780');}
      if(type==='flagship'){cylinder(-l*.07,0,h+1,2,5.5,'#657d87',12);cylinder(-l*.07,0,h+6.5,2.2,.4,'#a9beb8',12);}
    }
    return new Float32Array(g.out);
  }
  function normals(vertices){const out=new Float32Array(vertices.length/6*9);for(let i=0,j=0;i<vertices.length;i+=18){const ax=vertices[i+6]-vertices[i],ay=vertices[i+7]-vertices[i+1],az=vertices[i+8]-vertices[i+2],bx=vertices[i+12]-vertices[i],by=vertices[i+13]-vertices[i+1],bz=vertices[i+14]-vertices[i+2],nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,n=Math.hypot(nx,ny,nz)||1;for(let v=0;v<3;v++){for(let k=0;k<6;k++)out[j++]=vertices[i+v*6+k];out[j++]=nx/n;out[j++]=ny/n;out[j++]=nz/n;}}return out;}
  function scenery(G){const meshes={},specs={};let seed=3918;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const leaf=(g,x,y,z,r,color)=>{const n=7,rings=4,points=[];for(let a=0;a<=rings;a++){const lat=a/rings*Math.PI,row=[];for(let b=0;b<n;b++){const angle=b/n*TAU,jitter=.86+rand()*.27;row.push([x+Math.sin(lat)*Math.cos(angle)*r*jitter,y+Math.sin(lat)*Math.sin(angle)*r*jitter,z+Math.cos(lat)*r*.7*jitter]);}points.push(row);}for(let a=0;a<rings;a++)for(let b=0;b<n;b++){const next=(b+1)%n;g.face([points[a][b],points[a][next],points[a+1][next],points[a+1][b]],color);}};
    for(let variant=0;variant<3;variant++){
      const g=G(),height=[9.8,12.3,10.7][variant],bark='#6c6853';
      g.box(.15,-.1,0,.46,.53,height*.65,'#95836a',bark);
      const colors=variant===1?['#4c7062','#648271','#718e73']:variant===2?['#6d8564','#8b996c','#788f67']:['#597957','#718a60','#829969'];
      // Three silhouettes: spreading alder, narrow cypress, trailing willow.
      // Clusters follow branches, leaving windows through the crown.
      for(let branch=0;branch<5;branch++){
        const a=branch*2.399+variant*.8,reach=variant===1?1.5:3.2+rand(),x=Math.cos(a)*reach,y=Math.sin(a)*reach;
        const z=height-(variant===1?branch*1.1:branch*.35);
        g.face([[0,0,height*.4],[.2,.1,height*.5],[x,y,z-1],[x-.2,y,z-1.3]],bark);
        for(let i=0;i<4;i++){
          const offset=(i-1.5)*.72,px=x+Math.cos(a+1.4)*offset,py=y+Math.sin(a+1.4)*offset;
          leaf(g,px,py,z+(rand()-.5)*1.3-(variant===2?Math.abs(offset)*1.5:0),variant===1?1.45:1.55+rand()*.6,colors[(branch+i)%3]);
        }
      }
      leaf(g,0,0,height,variant===1?1.3:2,colors[1]);
      meshes['tree'+variant]=new Float32Array(g.out);specs['tree'+variant]={length:12,height:15,frames:1,ppu:5};
    }
    const reeds=G();for(let i=0;i<27;i++){const x=(rand()-.5)*3,y=(rand()-.5)*3,z=1.5+rand()*2,a=rand()*TAU,lean=.3+rand()*.6,color=['#8e9663','#a5a875','#697e55'][i%3];reeds.face([[x-.025,y,0],[x+.025,y,0],[x+Math.cos(a)*lean+.04,y+Math.sin(a)*lean,z],[x+Math.cos(a)*lean-.04,y+Math.sin(a)*lean,z]],color);if(i%3===0)reeds.box(x+Math.cos(a)*lean,y+Math.sin(a)*lean,z,.1,.1,.3,'#8a7453','#665d42');}meshes.reed=new Float32Array(reeds.out);specs.reed={length:5,height:4,frames:1,ppu:7};
    const rock=G();leaf(rock,0,0,.2,1.5,'#8b9180');leaf(rock,1.2,.6,.1,.8,'#b1ad93');meshes.rock=new Float32Array(rock.out);specs.rock={length:5,height:3,frames:1,ppu:6};return{meshes,specs};
  }
  // Landmarks are authored in metres around each berth. Small repeated fittings
  // are baked once with the building, rather than submitted as separate objects.
  function landings(G){const meshes={},specs={};
    for(const id of ['yard','mill','reeds']){const g=G();
      function shed(x,y,l,w,h,roof,wall){const z=2,peak=h+w*.24;
        g.box(x,y,z,l,w,h,'#a99775',wall);g.face([[x-l/2,y-w/2,z+h],[x-l/2,y,z+peak],[x-l/2,y+w/2,z+h]],wall);g.face([[x+l/2,y-w/2,z+h],[x+l/2,y+w/2,z+h],[x+l/2,y,z+peak]],wall);
        for(const side of [-1,1]){g.face([[x-l/2-1,y,z+peak],[x+l/2+1,y,z+peak],[x+l/2+1,y+side*(w/2+1),z+h-.5],[x-l/2-1,y+side*(w/2+1),z+h-.5]],roof);
          for(let a=-l/2;a<l/2;a+=1.7)g.box(x+a,y+side*(w/2+.04),z,.09,.12,h,'#9f9477','#8b8167');
          for(let a=-l*.34;a<l*.4;a+=6){g.box(x+a,y+side*(w/2+.1),z+3,2.1,.18,2.5,'#e2cb92','#d5bb82');g.box(x+a,y+side*(w/2+.22),z+3.2,1.6,.12,1.9,'#3b6570','#3b6570');g.box(x+a,y+side*(w/2+.3),z+3.9,1.7,.12,.13,'#b4b59c','#b4b59c');}}
        for(let a=-l/2;a<l/2;a+=1.5)for(const side of [-1,1])g.face([[x+a,y,z+peak+.06],[x+a+.08,y,z+peak+.06],[x+a+.08,y+side*(w/2+1),z+h-.44],[x+a,y+side*(w/2+1),z+h-.44]],'#91a1a0');
        g.box(x+l/2+.12,y,z,.2,w*.36,h*.7,'#52635c','#4c5a53');for(const offset of [-1,1])g.box(x+l/2+.25,y+offset*w*.19,z,.2,.3,h*.72,'#c9bda0','#ab9e84');
      }
      function pier(x,y,l,w,alongY){const length=alongY?w:l,width=alongY?l:w;g.box(x,y,1,length,width,.65,'#9c8b6d','#5e6e67');
        for(let t=-l/2;t<l/2;t+=.9){const px=x+(alongY?0:t),py=y+(alongY?t:0);g.box(px,py,1.66,alongY?w:.055,alongY?.055:w,.04,'#5d6e63','#5d6e63');}
        for(let t=-l/2+1;t<l/2;t+=7)for(const side of [-1,1]){const px=x+(alongY?side*(w/2-.4):t),py=y+(alongY?t:side*(w/2-.4));g.box(px,py,-1,.65,.65,3.4,'#c5b38e','#625f4c');g.box(px,py,2.35,.85,.85,.15,'#ddd1a9','#7e7e63');}
      }
      function crate(x,y,z,l=2){g.box(x,y,z,l,l,l*.8,'#b3a174','#7c795b');for(const side of [-1,1]){g.box(x+side*l*.33,y,z+l*.8+.03,.14,l+.1,.12,'#d1bc8e','#9a936d');g.box(x+side*l*.33,y+l/2+.04,z,.14,.1,l*.8,'#b7aa7b','#b7aa7b');}}
      if(id==='yard'){shed(-10,-139,35,24,9,'#587c88','#98977b');shed(-64,-123,17,15,7,'#8a7869','#9e9374');
        for(let i=0;i<10;i++)crate(-33+(i%4)*3,-111+Math.floor(i/4)*3,2,i%3===0?2.5:1.8);g.box(-17,-116,2,.7,.7,12,'#b9ba9f','#657d77');g.box(-12,-116,13,11,.6,.6,'#c0c3aa','#738c88');g.box(-7,-116,4,.1,.1,9,'#d2cfb4','#d2cfb4');
        for(let i=0;i<7;i++)g.box(-64+i*.8,-112,2, .6,11,.8,'#b8a47d','#8a8666');
      }else if(id==='mill'){shed(-86,-146,42,25,15,'#897968','#a39272');shed(-135,-125,24,18,10,'#68857f','#b0a17e');
        g.box(-95,-145,17,4,4,14,'#b5a27b','#8b7d62');g.box(-95,-145,31,5,5,.7,'#d3be92','#9c9075');for(let i=0;i<15;i++)crate(-79+(i%5)*2.8,-121+Math.floor(i/5)*2.7,2);
        for(let i=0;i<8;i++)g.box(-119+i*.9,-102,2,.7,18,1.2,'#ac956b','#817757');
      }else{shed(-41,0,11,9,5,'#aaa17c','#9c9475');crate(-34,6,2,1.8);crate(-33,8,2,1.5);
        for(let i=0;i<9;i++)g.box(-29+i*.15,-6,1.7,.08,4,.18,'#819281','#667e72');
      }
      for(const p of root.WidewakeEstuary.ports.find(p=>p.id===id).piers)pier(p.x,p.y,p.length,p.width,p.alongY);
      meshes['landing_'+id]=new Float32Array(g.out);specs['landing_'+id]={length:180,height:35,frames:1,ppu:2};
    }return{meshes,specs};
  }
  const bakeVertex=`#version 300 es
    precision highp float;layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aColor;layout(location=4)in vec3 aNormal;
    uniform vec2 uRotation;uniform vec4 uRect;uniform vec2 uSize;uniform float uRange;out vec3 vColor;out vec3 vNormal;out vec3 vLocal;out float vDepth;
    void main(){vec3 p=vec3(aPosition.x*uRotation.x-aPosition.y*uRotation.y,aPosition.x*uRotation.y+aPosition.y*uRotation.x,aPosition.z);vNormal=vec3(aNormal.x*uRotation.x-aNormal.y*uRotation.y,aNormal.x*uRotation.y+aNormal.y*uRotation.x,aNormal.z);vColor=aColor;vLocal=aPosition;vDepth=(p.x+p.y)*.6123724+p.z*.5;
      vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254);vec2 pixel=vec2(screen.x-uRect.x,uRect.y-screen.y)*uRect.z+2.;gl_Position=vec4(pixel/uSize*2.-1.,-vDepth/uRange,1.);}`;
  const bakeFragment=`#version 300 es
    precision highp float;in vec3 vColor;in vec3 vNormal;in vec3 vLocal;in float vDepth;uniform float uRange;layout(location=0)out vec4 color;layout(location=1)out vec4 height;
    float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    void main(){vec3 normal=normalize(vNormal),light=normalize(vec3(-.45,-.65,1.));float diffuse=.48+.52*max(0.,dot(normal,light)),grain=(hash(floor(vLocal*5.))-.5)*.035;float edge=pow(max(0.,dot(normal,normalize(vec3(-.2,-.5,1.)))),16.)*.055;
      color=vec4(vColor*(diffuse+grain)+edge,1.);float z=clamp(vDepth/uRange*.5+.5,0.,.99999);height=vec4(floor(z*255.)/255.,fract(z*255.),0.,1.);}`;
  const spriteVertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;
    uniform vec2 uSize;uniform float uZoom;uniform vec2 uCell;uniform vec4 uRect;uniform float uFrames;uniform float uTime;uniform float uFoliage;
    out vec2 uv;flat out vec3 frames;out float depth;out float flash;out float spriteScale;
    void main(){float heading=mod(atan(aPose.x,aWorld.w)/6.28318530718*uFrames+uFrames,uFrames);frames=vec3(floor(heading),mod(floor(heading)+1.,uFrames),fract(heading));uv=aPosition*.5+.5;
      vec2 local=vec2(uRect.x+(uv.x*uCell.x-2.)/uRect.z,uRect.y-(uv.y*uCell.y-2.)/uRect.z)*aPose.y;vec3 p=aWorld.xyz;local.x+=sin(uTime*1.5+aPose.w)*max(0.,-local.y)*uFoliage*.025;vec2 screen=(vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)+local)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,0.,1.);depth=(p.x+p.y)*.6123724+p.z*.5;flash=aPose.z;spriteScale=aPose.y;}`;
  const spriteFragment=`#version 300 es
    precision highp float;precision highp sampler2DArray;
    in vec2 uv;flat in vec3 frames;in float depth;in float flash;in float spriteScale;uniform sampler2DArray uColor;uniform sampler2DArray uDepth;uniform float uRange;uniform bool uEdges;out vec4 color;
    void main(){vec3 a=vec3(uv,frames.x),b=vec3(uv,frames.y);vec4 ca=texture(uColor,a),cb=frames.x==frames.y?ca:texture(uColor,b),c=mix(ca,cb,frames.z);if(c.a<.008||uEdges==(c.a>.998))discard;
      vec4 d=mix(texture(uDepth,a),texture(uDepth,b),frames.z);float local=(((d.r+d.g/255.)/max(d.a,.008))*2.-1.)*uRange;
      gl_FragDepth=clamp(.5-(depth+local*spriteScale)/40000.,.001,.999);color=vec4(mix(c.rgb/max(c.a,.008),vec3(1.,.94,.77),flash),c.a);}`;
  class Atlas{
    constructor(view){this.view=view;this.gl=view.gl;this.entries={};this.pending=[];this.bytes=0;const gl=this.gl;
      // Each heading occupies its own array layer. Complete mip chains can never
      // sample a neighbouring heading, including when a distant hull is one pixel.
      for(const [type,spec] of Object.entries({...root.WidewakeBattle.roles,...view.battle.visualRoles,...view.artSpecs,raider0:{length:13,height:4},raider1:{length:16,height:4},raider2:{length:23,height:4}})){
        const mesh=view.meshes[type];if(!mesh)continue;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,range=0;const frames=spec.frames||(type.startsWith('raider')?32:64),ppu=spec.ppu||(type==='launch'?8:spec.length>70?1.25:spec.length>50?1.65:type.startsWith('raider')?1.5:2);
        for(let f=0;f<frames;f++){const c=Math.cos(f/frames*TAU),s=Math.sin(f/frames*TAU);for(let i=0;i<mesh.length;i+=6){const x=mesh[i]*c-mesh[i+1]*s,y=mesh[i]*s+mesh[i+1]*c,z=mesh[i+2],px=(x-y)*Math.SQRT1_2,py=(x+y)*Math.SQRT1_2*.5-z*Math.sqrt(.75);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);range=Math.max(range,Math.abs((x+y)*.6123724+z*.5)+1);}}
        const w=Math.ceil(((maxX-minX)*ppu+4)/4)*4,h=Math.ceil(((maxY-minY)*ppu+4)/4)*4,levels=1+Math.floor(Math.log2(Math.max(w,h)));
        if(Math.max(w,h)>gl.getParameter(gl.MAX_TEXTURE_SIZE)||frames>gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS))throw Error('Sprite frames exceed device limit');
        this.entries[type]={mesh,minX,maxY,ppu,w,h,frames,range,levels};
        for(let level=0;level<levels;level++)this.bytes+=Math.max(1,w>>level)*Math.max(1,h>>level)*frames*8;
      }
      this.bake();this.program=root.WidewakeOcean.program(gl,spriteVertex,spriteFragment);
      const quad=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]);this.batches={};for(const type of Object.keys(this.entries))this.batches[type]=new root.WidewakeOcean.Batch(gl,quad,type.startsWith('raider')?32768:view.artSpecs?.[type]?1600:64,true);
    }
    bake(){const gl=this.gl,program=root.WidewakeOcean.program(gl,bakeVertex,bakeFragment),framebuffer=gl.createFramebuffer(),depth=gl.createRenderbuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.disable(gl.BLEND);gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clearColor(0,0,0,0);gl.useProgram(program);
      for(const entry of Object.values(this.entries)){
        const texture=(format,levels,filter)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,levels,format,entry.w,entry.h,entry.frames);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,levels>1?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
        entry.color=texture(gl.RGBA8,entry.levels,gl.LINEAR_MIPMAP_LINEAR);entry.depth=texture(gl.RGBA8,entry.levels,gl.LINEAR_MIPMAP_LINEAR);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,entry.w,entry.h);
        const data=normals(entry.mesh),vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(const [index,offset]of [[0,0],[1,12],[4,24]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,offset);}gl.viewport(0,0,entry.w,entry.h);gl.uniform2f(gl.getUniformLocation(program,'uSize'),entry.w,entry.h);gl.uniform4f(gl.getUniformLocation(program,'uRect'),entry.minX,entry.maxY,entry.ppu,0);gl.uniform1f(gl.getUniformLocation(program,'uRange'),entry.range);
        for(let f=0;f<entry.frames;f++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,entry.color,0,f);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,entry.depth,0,f);if(f===0&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Sprite frame framebuffer unavailable');gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(gl.getUniformLocation(program,'uRotation'),Math.cos(f/entry.frames*TAU),Math.sin(f/entry.frames*TAU));gl.drawArrays(gl.TRIANGLES,0,data.length/9);}
        for(const t of [entry.color,entry.depth]){gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);}gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(depth);gl.deleteProgram(program);
    }
    bind(type,edges){const gl=this.gl,entry=this.entries[type];this.view.uniforms(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'uCell'),entry.w,entry.h);gl.uniform4f(gl.getUniformLocation(this.program,'uRect'),entry.minX,entry.maxY,entry.ppu,0);gl.uniform1f(gl.getUniformLocation(this.program,'uRange'),entry.range);gl.uniform1f(gl.getUniformLocation(this.program,'uFrames'),entry.frames);gl.uniform1f(gl.getUniformLocation(this.program,'uTime'),this.view.reduced?0:this.view.visualTime);gl.uniform1f(gl.getUniformLocation(this.program,'uFoliage'),this.view.reduced?0:type.startsWith('tree')||type==='reed'?1:0);gl.uniform1i(gl.getUniformLocation(this.program,'uEdges'),edges?1:0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,entry.color);gl.uniform1i(gl.getUniformLocation(this.program,'uColor'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,entry.depth);gl.uniform1i(gl.getUniformLocation(this.program,'uDepth'),1);
    }
    begin(){this.pending.length=0;}
    draw(type,source){if(!source.count)return 0;const batch=this.batches[type];if(batch!==source)batch.data.set(source.data.subarray(0,source.count*8));batch.count=source.count;this.bind(type,false);this.pending.push(type);return batch.draw();}
    edges(){
      // Finish opaque depth first. Filtered silhouettes then blend over the scene
      // without writing depth or turning fractional coverage into flashing pixels.
      const gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);let draws=0;
      for(const type of this.pending){this.bind(type,true);draws+=this.batches[type].draw(false);this.view.stats.triangles+=this.batches[type].count*2;}this.pending.length=0;gl.depthMask(true);gl.disable(gl.BLEND);return draws;
    }
    dispose(){const gl=this.gl;for(const entry of Object.values(this.entries)){gl.deleteTexture(entry.color);gl.deleteTexture(entry.depth);}gl.deleteProgram(this.program);for(const batch of Object.values(this.batches))batch.dispose();}
  }
  function noiseTexture(gl){const size=128,data=new Uint8Array(size*size*4);let seed=1729;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return texture;}
  const waterGLSL=`
    uniform sampler2D uNoise;
    vec3 seaColor(vec2 world,float depth,float salt,vec2 current,float time,float zoom){
      vec2 p=world-current*time*.55;
      vec2 uv=p*vec2(.0018,.0032);vec2 drift=vec2(time*.0014,-time*.0007);
      float a=texture(uNoise,uv+drift).r,b=texture(uNoise,uv*2.13-drift*.7).g,c=texture(uNoise,uv*4.27+drift*.4).b;
      float swell=a*.62+b*.27+c*.11;
      float macro=texture(uNoise,world*.00014+vec2(time*.000025,0.)).a;
      vec3 deep=mix(vec3(.072,.19,.195),vec3(.055,.17,.225),salt),light=mix(vec3(.13,.27,.25),vec3(.12,.29,.34),salt);
      vec3 result=mix(deep,light,.2+smoothstep(.22,.78,swell)*.28+macro*.12);
      float bottom=exp(-max(depth,0.)*.55),sand=texture(uNoise,world*.012).g;
      result=mix(result,vec3(.27,.31,.22)+sand*.035,bottom*.68);
      float crest=smoothstep(.68,.84,a*.65+b*.35)*smoothstep(.50,.72,c);result+=vec3(.16,.22,.23)*crest*.18;
      float fine=texture(uNoise,p*vec2(.018,.044)+drift*3.).r;
      result+=vec3(.035,.05,.05)*smoothstep(.74,.9,fine)*smoothstep(.62,.79,swell)*min(1.,zoom*1.8);
      float edge=exp(-abs(depth-.16)*4.5),wash=smoothstep(.46,.7,texture(uNoise,world*.014+drift*.7).b+sin(time*.6+depth*5.)*.07);
      result=mix(result,vec3(.52,.59,.50),edge*wash*(.2+salt*.25));return result;
    }
  `;
  // Twelve seconds of world-space history, with fixed storage independent of
  // enemy count or session length. Only friendly hulls produce persistent wakes.
  class WakeTrail{
    constructor(){this.capacity=128;this.limit=24;this.life=12;this.tracks=Array.from({length:this.limit},()=>({x:new Float32Array(128),y:new Float32Array(128),time:new Float64Array(128),power:new Float32Array(128),head:0,count:0,last:-1}));this.count=0;this.bytes=this.limit*this.capacity*20;this.startNormal=new Float64Array(3);this.endNormal=new Float64Array(3);}
    clear(){for(const t of this.tracks){t.count=t.head=0;t.last=-1;}this.count=0;}
    sample(ships,poses,time){
      this.count=0;
      for(let id=0;id<this.limit;id++){
        const t=this.tracks[id],s=ships[id],p=poses[id];if(!s||!p||s.hp<=0){t.count=0;continue;}
        const c=Math.cos(p.angle),sn=Math.sin(p.angle),x=p.x-c*s.length*.38,y=p.y-sn*s.length*.38,speed=Math.hypot(s.vx,s.vy);
        t.width=s.width*.32;t.spread=.2+s.speed*.14;t.liveX=x;t.liveY=y;t.liveTime=time;t.livePower=Math.min(1,speed/(s.speed*.6));
        const previous=(t.head+127)%128;
        if(time<t.last||t.count&&Math.hypot(x-t.x[previous],y-t.y[previous])>Math.max(40,s.length*2)){t.count=0;t.last=-1;}
        while(t.count&&time-t.time[(t.head-t.count+128)%128]>this.life)t.count--;
        if(speed>.12&&(t.last<0||time-t.last>=.1-1e-7)){
          const i=t.head;t.x[i]=x;t.y[i]=y;t.time[i]=time;t.power[i]=t.livePower;t.head=(i+1)%128;t.count=Math.min(128,t.count+1);t.last=time;
        }
        this.count+=t.count;
      }
    }
    tangent(t,n,out){
      const at=(t.head-t.count+n+128)%128,prior=(at+127)%128,next=(at+1)%128;
      const x=n===t.count?t.liveX:t.x[at],y=n===t.count?t.liveY:t.y[at],px=n===0?x:t.x[prior],py=n===0?y:t.y[prior],nx=n>=t.count-1?t.liveX:t.x[next],ny=n>=t.count-1?t.liveY:t.y[next];
      const dx=nx-px,dy=ny-py,length=Math.hypot(dx,dy)||1,ax=x-px,ay=y-py,bx=nx-x,by=ny-y,cross=Math.abs(ax*by-ay*bx);
      out[0]=-dy/length;out[1]=dx/length;
      // Limit expansion inside a tight turn, where an oversized ribbon would
      // fold through itself and make bright triangular seams.
      out[2]=cross>1e-6?Math.hypot(ax,ay)*Math.hypot(bx,by)*length/(2*cross)*.7:1e6;
    }
    segments(view,emit){
      const now=view.visualTime,scale=view.zoom*view.baseScale;
      for(const t of this.tracks){
        if(t.count<1)continue;
        // A stride in wide view avoids spending fill and CPU on subpixel foam.
        const stride=scale<.25?3:scale<.7?2:1;
        for(let n=0;n<t.count;n+=stride){
          const i=(t.head-t.count+n+128)%128,next=Math.min(t.count,n+stride),live=next===t.count,j=(t.head-t.count+next+128)%128;
          const x=t.x[i],y=t.y[i],ex=live?t.liveX:t.x[j],ey=live?t.liveY:t.y[j],endTime=live?t.liveTime:t.time[j],age=now-t.time[i],endAge=now-endTime;
          if(age>=this.life||endTime-t.time[i]>.5||Math.hypot(ex-x,ey-y)<.04)continue;
          this.tangent(t,n,this.startNormal);this.tangent(t,next,this.endNormal);const left=this.startNormal,right=this.endNormal,width=Math.min(left[2],t.width+age*t.spread*t.power[i]**2),endWidth=Math.min(right[2],t.width+endAge*t.spread*(live?t.livePower:t.power[j])**2);
          if(!view.visible((x+ex)*.5,(y+ey)*.5,(Math.hypot(ex-x,ey-y)+width)*scale+2))continue;
          const alpha=t.power[i]*Math.pow(Math.max(0,1-age/this.life),1.5)*Math.min(1,n/6),endAlpha=(live?t.livePower:t.power[j])*Math.pow(Math.max(0,1-endAge/this.life),1.5)*Math.min(1,next/6);
          emit(x,y,ex,ey,width,endWidth,alpha,endAlpha,left[0],left[1],right[0],right[1]);
        }
      }
      // Small bow shoulders indicate speed and hull heading without covering it.
      for(const s of view.battle.ships){if(s.hp<=0)continue;const p=view.poses[s.id],speed=Math.hypot(s.vx,s.vy),power=Math.min(1,speed/(s.speed*.8));if(power<.05||!view.visible(p.x,p.y,40))continue;
        const c=Math.cos(p.angle),sn=Math.sin(p.angle);for(const side of [-1,1]){
          const x=p.x+c*s.length*.47-sn*s.width*.13*side,y=p.y+sn*s.length*.47+c*s.width*.13*side;
          emit(x,y,x-c*s.length*.3-sn*s.width*.44*side,y-sn*s.length*.3+c*s.width*.44*side,s.width*.025,s.width*.12,power*.75,0);
        }
      }
    }
    drawCanvas(view){const c=view.fallback;let count=0;c.save();c.lineCap='round';this.segments(view,(x,y,ex,ey,w,ew,a,ea)=>{const p=view.project(x,y),q=view.project(ex,ey);c.strokeStyle='#b1c6ba';c.globalAlpha=(a+ea)*.12;c.lineWidth=Math.max(.5,(w+ew)*view.zoom*view.baseScale);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();count++;});c.restore();view.stats.wakeSegments=count;}
  }
  const wakeVertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;layout(location=4)in vec2 aFade;uniform vec2 uSize;uniform vec2 uCamera;uniform float uZoom;out vec2 uv;out vec2 world;out float opacity;
    void main(){uv=aPosition*.5+.5;vec2 p=mix(aWorld.xy,aWorld.zw,uv.x)+mix(aPose.xy,aPose.zw,uv.x)*aPosition.y;world=p+uCamera;opacity=mix(aFade.x,aFade.y,uv.x);vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-.025)*uZoom;gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+.03)/20000.,-.99,.99),1.);}`;
  const wakeFragment=`#version 300 es
    precision highp float;in vec2 uv;in vec2 world;in float opacity;uniform sampler2D uNoise;uniform float uTime;out vec4 color;
    void main(){float y=abs(uv.y*2.-1.);float coarse=texture(uNoise,world*.005+vec2(uTime*.0008,0.)).g;float foam=texture(uNoise,world*.032+vec2(uTime*.0015,0.)).r;float edge=exp(-pow((y-.62-coarse*.16)*7.,2.))*smoothstep(.28,.75,coarse);float churn=exp(-y*y*4.)*smoothstep(.20,.8,foam)*(.35+coarse*.65);float alpha=(edge*.48+churn*.58)*(1.-smoothstep(.8,1.,y))*opacity;if(alpha<.008)discard;color=vec4(.70,.81,.74,alpha);}`;
  class WaterMotion{
    constructor(view){this.view=view;const gl=view.gl,O=root.WidewakeOcean;this.program=O.program(gl,wakeVertex,wakeFragment);this.batch=new O.Batch(gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),3120,true);
      const b=this.batch;b.data=new Float32Array(b.capacity*10);gl.bindVertexArray(b.vao);gl.bindBuffer(gl.ARRAY_BUFFER,b.instances);gl.bufferData(gl.ARRAY_BUFFER,b.data.byteLength,gl.DYNAMIC_DRAW);for(const [index,size,offset]of [[2,4,0],[3,4,16],[4,2,32]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,40,offset);gl.vertexAttribDivisor(index,1);}}
    draw(){const v=this.view,gl=v.gl;this.batch.count=0;v.wakes.segments(v,(x,y,ex,ey,w,ew,a,ea,nx,ny,enx,eny)=>{const b=this.batch;if(b.count>=b.capacity)return;if(nx===undefined){const length=Math.hypot(ex-x,ey-y)||1;nx=enx=-(ey-y)/length;ny=eny=(ex-x)/length;}let i=b.count++*10;const d=b.data;d[i++]=x-v.camera.x;d[i++]=y-v.camera.y;d[i++]=ex-v.camera.x;d[i++]=ey-v.camera.y;d[i++]=nx*w;d[i++]=ny*w;d[i++]=enx*ew;d[i++]=eny*ew;d[i++]=a;d[i]=ea;});v.stats.wakeSegments=this.batch.count;
      v.uniforms(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'uCamera'),v.camera.x,v.camera.y);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,v.noise);gl.uniform1i(gl.getUniformLocation(this.program,'uNoise'),2);gl.uniform1f(gl.getUniformLocation(this.program,'uTime'),v.reduced?0:v.visualTime);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);const b=this.batch;gl.bindVertexArray(b.vao);gl.bindBuffer(gl.ARRAY_BUFFER,b.instances);gl.bufferSubData(gl.ARRAY_BUFFER,0,b.data,0,b.count*10);if(b.count)gl.drawArraysInstanced(gl.TRIANGLES,0,6,b.count);gl.depthMask(true);gl.disable(gl.BLEND);return b.count?1:0;}
    dispose(){this.batch.dispose();this.view.gl.deleteProgram(this.program);}
  }
  const shadowVertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;uniform vec2 uSize;uniform float uZoom;out vec2 uv;
    void main(){uv=aPosition;vec2 q=aPosition*vec2(aPose.y,aPose.z)*.5;vec2 p=aWorld.xy+vec2(q.x*aWorld.w-q.y*aPose.x,q.x*aPose.x+q.y*aWorld.w)+vec2(.45,.65)*aPose.w;float z=aWorld.z;vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-z*.8660254)*uZoom;gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+z*.5)/20000.,-.99,.99),1.);}`;
  const shadowFragment=`#version 300 es
    precision mediump float;in vec2 uv;out vec4 color;void main(){float d=dot(uv,uv),alpha=(1.-smoothstep(.48,1.,d))*.25;if(alpha<.01)discard;color=vec4(.025,.045,.05,alpha);}`;
  class Shadows{
    constructor(view){this.view=view;this.program=root.WidewakeOcean.program(view.gl,shadowVertex,shadowFragment);this.batch=new root.WidewakeOcean.Batch(view.gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),4096,true);}
    draw(){const v=this.view,gl=v.gl;v.uniforms(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);const n=this.batch.draw();gl.depthMask(true);gl.disable(gl.BLEND);return n;}
    ships(){const v=this.view;this.batch.count=0;for(const s of v.battle.ships){if(s.hp<=0||!v.visible(s.x,s.y,100))continue;const p=v.poses[s.id];this.batch.add(p.x-v.camera.x,p.y-v.camera.y,.08,Math.cos(p.angle),Math.sin(p.angle),s.length,s.width,Math.min(3,s.height*.16));}return this.draw();}
    dispose(){this.batch.dispose();this.view.gl.deleteProgram(this.program);}
  }
  class Mechanisms{
    constructor(view){this.view=view;this.phases=new Float64Array(64);this.lastTime=view.visualTime||0;const O=root.WidewakeOcean,gl=view.gl;this.batches={};
      const capstan=O.geometry();capstan.box(0,0,0,1.8,1.8,1.2,'#a6b8ad','#597779');capstan.box(0,0,1.2,3.2,.2,.2,'#d9c9a3','#867e68');capstan.box(0,0,1.2,.2,3.2,.2,'#d9c9a3','#867e68');this.batches.winch=new O.Batch(gl,new Float32Array(capstan.out),48);
      const pump=O.geometry();pump.box(0,0,0,.65,.65,13,'#bfc7b8','#728c8c');pump.box(0,0,11,2.5,2.5,2,'#a5b6a3','#5b7f78');this.batches.pump=new O.Batch(gl,new Float32Array(pump.out),48);
      const rotor=O.geometry();for(let i=0;i<4;i++){const a=i/4*TAU,b=(i+.3)/4*TAU;rotor.face([[0,0,0],[Math.cos(a)*1.2,Math.sin(a)*1.2,0],[Math.cos(b)*.8,Math.sin(b)*.8,0]],'#94b2a7');}this.batches.rotor=new O.Batch(gl,new Float32Array(rotor.out),48);
    }
    draw(){const v=this.view,b=v.battle,dt=Math.max(0,Math.min(.1,v.visualTime-this.lastTime));this.lastTime=v.visualTime;for(const batch of Object.values(this.batches))batch.count=0;
      for(const s of b.ships){if(s.hp<=0||!v.visible(s.x,s.y,80))continue;const p=v.poses[s.id],c=Math.cos(p.angle),sn=Math.sin(p.angle),h=Math.min(8,s.height*.28)+(p.z||0),active=s.working&&b.work&&b.center&&(s.x-b.center.x-s.slot.x)**2+(s.y-b.center.y-s.slot.y)**2<900&&s.cargo<s.hold&&!v.reduced,time=(this.phases[s.id]+=active?dt:0),offset=(along,across=0)=>({x:p.x-v.camera.x+c*along-sn*across,y:p.y-v.camera.y+sn*along+c*across});
        if(s.type==='trawler'){const q=offset(s.length*.07);this.batches.winch.add(q.x,q.y,h+1,Math.cos(time*2.2),Math.sin(time*2.2),1);}
        if(s.type==='oilrig'){const q=offset(s.length*.19);this.batches.pump.add(q.x,q.y,h+3+Math.sin(time*1.8)*2,c,sn);}
        const speed=Math.hypot(s.vx,s.vy);if(speed>.8&&!v.reduced){const q=offset(-s.length*.44),a=v.visualTime*speed*3;this.batches.rotor.add(q.x,q.y,.15,Math.cos(a),Math.sin(a),s.type==='launch'?.22:s.width*.09);}
      }
      v.uniforms(v.main);let draws=0;for(const batch of Object.values(this.batches))draws+=batch.draw();return draws;
    }
    dispose(){for(const batch of Object.values(this.batches))batch.dispose();}
  }
  root.WidewakeOceanArt={mesh,normals,scenery,landings,Atlas,noiseTexture,waterGLSL,WakeTrail,WaterMotion,Shadows,Mechanisms};
})(globalThis);
