/* Original nautical models, baked into directional sprites by the ocean renderer.
   Geometry is the editable source; no external game artwork is used. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function mesh(type,spec,G){
    const g=G(),l=spec.length,w=spec.width,h=Math.min(8,spec.height*.28),enemy=type.startsWith('raider'),small=type==='launch';
    const material={hull:enemy?'#a7654e':type==='trawler'?'#3e7d7c':type==='oilrig'?'#9f936a':small?'#4f8599':'#537b95',deck:enemy?'#b78b61':small?'#cfb780':'#b4a888',rail:'#b2c4bb',dark:enemy?'#352c32':'#1d3444',wood:'#a9926b',glass:'#193849',rim:enemy?'#503c39':'#344e5b'};
    const tri=(a,b,c,color)=>g.tri(a,b,c,color);
    function cylinder(x,y,z,r,height,color,n=12){for(let i=0;i<n;i++){const a=i/n*TAU,b=(i+1)/n*TAU,p=[x+Math.cos(a)*r,y+Math.sin(a)*r,z],q=[x+Math.cos(b)*r,y+Math.sin(b)*r,z],pp=[p[0],p[1],z+height],qq=[q[0],q[1],z+height];g.face([p,q,qq,pp],color);tri([x,y,z+height],pp,qq,color);}}
    function beam(a,b,r,color,n=6){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz)||1,u=[-dy,dx,0],ul=Math.hypot(...u);if(ul<.001){u[0]=1;u[1]=0;}else{u[0]/=ul;u[1]/=ul;}const v=[-dz*u[1]/length,dz*u[0]/length,(dx*u[1]-dy*u[0])/length];
      for(let i=0;i<n;i++){const ca=Math.cos(i/n*TAU)*r,sa=Math.sin(i/n*TAU)*r,cb=Math.cos((i+1)/n*TAU)*r,sb=Math.sin((i+1)/n*TAU)*r,p=a.map((value,k)=>value+u[k]*ca+v[k]*sa),q=a.map((value,k)=>value+u[k]*cb+v[k]*sb),pp=b.map((value,k)=>value+u[k]*ca+v[k]*sa),qq=b.map((value,k)=>value+u[k]*cb+v[k]*sb);g.face([p,q,qq,pp],color);}}
    // Curved bow and tumblehome, with a separate dark waterline and inset deck.
    const shape=root.WidewakeBattle.HULL_OUTLINE,ring=(scale,z)=>shape.map(p=>[p[0]*l*scale,p[1]*w*scale,z]);
    const rings=[ring(.84,-.12),ring(.96,h*.25),ring(1,h),ring(.94,h+.15)];
    for(let level=0;level<3;level++)for(let i=0;i<shape.length;i++){const j=(i+1)%shape.length;g.face([rings[level][i],rings[level][j],rings[level+1][j],rings[level+1][i]],level===0?material.dark:level===1?material.hull:material.rim);}
    g.face(rings[3],material.deck);
    // A dark gunwale separates the hull from a light deck. A pale rim around
    // the entire boat used to reduce to a single rice-shaped highlight.
    const unit=small?.26:1.5;
    for(let x=-l*.39;x<l*.29;x+=unit*1.8)g.box(x,0,h+.17,unit*.08,w*.72,.025,small?'#756b52':'#697b79','#697b79');
    for(let i=0;i<shape.length;i++){const j=(i+1)%shape.length;beam([shape[i][0]*l*.97,shape[i][1]*w*.97,h+.3],[shape[j][0]*l*.97,shape[j][1]*w*.97,h+.3],small?.045:.16,material.rim);}
    if(type==='raider3'){
      // A low iron prow, broad copper boiler and open stern distinguish the ram
      // at fleet distance. Its warn/dash motion is driven by the combat state.
      g.face([[l*.05,-w*.42,h+.5],[l*.56,0,h+1.8],[l*.05,w*.42,h+.5]],'#bea074');
      for(const side of [-1,1])beam([l*.06,side*w*.42,h+.6],[l*.56,0,h+1.9],.5,'#dfc191');
      cylinder(-l*.15,0,h,3.3,4.4,'#9f6b4c');cylinder(-l*.15,0,h+4.4,3.4,.4,'#cca67b');
      cylinder(-l*.3,0,h,1.2,7,'#504c45');g.box(-l*.32,0,h+7.1,3.2,3.2,.4,'#a89a7d','#51483e');
      for(const y of [-w*.34,w*.34])g.box(l*.02,y,h,9,1.4,1.8,'#524d46','#3d403d');
      return new Float32Array(g.out);
    }
    if(enemy){
      // Large light/dark masses survive the far camera: an open skiff, a red
      // speedboat cowling, and a raised armored wheelhouse. Keep the same hull
      // perimeter as collision; deck fittings do not inflate the hit target.
      g.box(-l*.13,0,h+.18,l*.48,w*.62,.12,'#303c43','#303c43');
      if(type==='raider0'){
        for(const x of [-l*.28,-l*.04])g.box(x,0,h+.32,l*.075,w*.57,.35,'#dcc296','#987451');
        g.box(-l*.39,0,h+.3,l*.12,w*.32,.85,'#456373','#273e4b');
      }else if(type==='raider1'){
        g.box(l*.03,0,h+.25,l*.28,w*.66,1.45,'#ce795d','#8b4c40');
        g.box(-l*.1,0,h+1.72,l*.065,w*.57,.25,'#243e4b','#243e4b');
        g.box(l*.05,0,h+1.72,l*.06,w*.62,.16,'#e0c18b','#c2956c');
      }else{
        g.box(-l*.18,0,h+.25,l*.32,w*.65,2.5,'#b5b8a3','#687e7b');
        g.box(-l*.18,0,h+2.76,l*.35,w*.7,.32,'#ddd5b1','#44565c');
        for(const side of [-1,1])g.box(-l*.16,side*w*.33,h+1.55,l*.23,.12,.72,'#253d4a','#253d4a');
        g.box(-l*.01,0,h+1.55,.15,w*.54,.72,'#253d4a','#253d4a');
      }
      cylinder(l*.26,0,h+.25,w*.21,.75,'#364952',10);beam([l*.25,0,h+1.1],[l*.47,0,h+1.2],.3,'#bbb7a0');
      return new Float32Array(g.out);
    }
    if(small){
      g.box(-.4,0,h+.2,3.3,1.65,.08,'#2c4652','#2c4652');for(const x of [-1.15,.9])g.box(x,0,h+.26,.42,1.6,.25,'#ddc596','#857458');
      g.box(-2.45,0,.15,.42,.48,.7,'#62717c','#34444f');g.box(-2.45,0,.85,.56,.56,.23,'#aeb6b0','#606c76');beam([-.15,-.8,h+.3],[.3,-.8,h+.5],.04,'#dad3af');
      for(const y of [-.76,.76])beam([-.2,y,h+.3],[.4,y,h+1.1],.035,'#b8c6bc');g.face([[.38,-.76,h+1.1],[.38,.76,h+1.1],[.22,.76,h+.7],[.22,-.76,h+.7]],'#91b8bd');
      cylinder(.3,0,h+.23,.18,.45,'#776b55',8);cylinder(.32,0,h+.68,.13,.12,'#ddc397',8);beam([-1.8,-.83,h+.34],[1.8,-.83,h+.34],.04,'#d6bd8a');
      cylinder(2.05,0,h+.16,.16,.1,'#544c3f',10);cylinder(2.05,0,h+.25,.1,.04,'#c9b486',10);return new Float32Array(g.out);
    }
    const cabinX=-l*.25,cabinL=l*.23,cabinW=w*.58,cabinH=Math.min(6,spec.height*.3);
    g.box(cabinX,0,h+.2,cabinL,cabinW,cabinH,'#e1dcc2','#809b9b');g.box(cabinX,0,h+cabinH+.2,cabinL+1,cabinW+1,.65,type==='trawler'?'#d8c697':type==='repair'?'#aad2be':'#e1dfc5','#3d5668');
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
  // Each landmark has a tightly cropped, high-resolution sprite. Keeping the
  // empty space between buildings out of the atlas pays for close-camera detail.
  function landings(G){
    const meshes={},specs={},parts=[];let g,seed=7183;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const tint=(hex,amount)=>'#'+hex.slice(1).match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+amount)).toString(16).padStart(2,'0')).join('');
    const face=(points,color,reverse=false)=>g.face(reverse?points.slice().reverse():points,color);
    function beam(a,b,r,color,n=6){
      const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d),u=Math.hypot(d[0],d[1])>.001?[-d[1],d[0],0]:[1,0,0],ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]/=ul;
      const v=[(d[1]*u[2]-d[2]*u[1])/length,(d[2]*u[0]-d[0]*u[2])/length,(d[0]*u[1]-d[1]*u[0])/length],ring=t=>Array.from({length:n},(_,i)=>a.map((p,k)=>p+d[k]*t+r*(u[k]*Math.cos(i/n*TAU)+v[k]*Math.sin(i/n*TAU))));
      const lo=ring(0),hi=ring(1);for(let i=0;i<n;i++)face([lo[i],lo[(i+1)%n],hi[(i+1)%n],hi[i]],color);face(hi,color);face(lo,color,true);
    }
    function crate(x,y,z,l=2){
      const h=l*.8;
      // Pallet feet reach the graded yard; the cargo does not float above it.
      for(const side of [-1,1])g.box(x+side*l*.32,y,z-.42,.22,l+.12,.3,'#9b8b69','#716f55');
      g.box(x,y,z-.12,l+.16,l+.16,.12,'#ae9b73','#7e775b');g.box(x,y,z,l,l,h,'#b3a174','#827d60');
      for(let t=-l/2+.26;t<l/2;t+=.32){g.box(x+t,y,z+h+.01,.025,l,.025,'#867c60');g.box(x+l/2+.01,y+t,z,.025,.026,h,'#716e56','#716e56');}
      for(const side of [-1,1]){g.box(x+side*l*.34,y,z+h+.03,.13,l+.1,.1,'#cfb98b','#9a936d');g.box(x+side*l*.34,y+l/2+.04,z,.13,.1,h,'#b7aa7b','#b7aa7b');g.box(x+l/2+.04,y+side*l*.34,z,.1,.13,h,'#b7aa7b','#b7aa7b');}
      beam([x+l/2+.1,y-l*.35,z+.13],[x+l/2+.1,y+l*.35,z+h-.13],.055,'#c1ac80',4);
    }
    function shed(l,w,h,roof,wall){
      const z=2,peak=z+h+w*.24,eave=z+h-.45,half=w/2+.75;
      // A weathered masonry footing seats the timber walls in the bank.
      g.box(0,0,.12,l+.45,w+.45,1.9,'#9d9d84','#6e7767');
      for(const side of [-1,1])for(let row=0;row<3;row++)for(let x=-l/2+.8;x<l/2;x+=1.6)g.box(x+(row%2)*.4,side*(w/2+.24),.25+row*.53,1.48,.06,.46,'#919583',tint('#777e6c',Math.floor(rand()*12)-6));
      g.box(0,0,z,l,w,h,wall,wall);
      for(const side of [-1,1]){
        face([[side*l/2,-w/2,z+h],[side*l/2,w/2,z+h],[side*l/2,0,peak]],wall,side<0);
        for(let y=-w/2+.26;y<w/2;y+=.52){const shade=tint(wall,Math.floor(rand()*13)-6),height=h+Math.max(0,w*.24*(1-(Math.abs(y)+.26)/(w/2)))-.1;g.box(side*(l/2+.03),y,z,.06,.485,height,shade,shade);}
        for(let x=-l/2+.26;x<l/2;x+=.52){
          const shade=tint(wall,Math.floor(rand()*15)-7);g.box(x,side*(w/2+.035),z,.485,.07,h,shade,shade);
          if(rand()>.45){const start=z+.3+rand()*h*.25;g.box(x+.12,side*(w/2+.08),start,.025,.018,h*.48,shade,tint(shade,-10));}
        }
        g.box(0,side*(w/2+.12),z+.15,l,.18,.24,'#ada180','#827b62');
        g.box(0,side*(w/2+.18),z+h-.65,l,.2,.45,'#817d66','#6c715e');
        for(const end of [-1,1])g.box(end*(l/2-.1),side*(w/2+.13),z,.25,.22,h,'#c0b393','#a79b7c');
        for(let x=-l*.34;x<l*.4;x+=6){
          const y=side*(w/2+.15),outside=y+side*.18;
          g.box(x,y,z+3,2.15,.2,2.5,'#c5bb98','#b4aa88');g.box(x,outside,z+3.22,1.74,.13,2.04,'#294b58','#294b58');
          g.box(x-.4,outside+side*.08,z+4.3,.74,.025,.7,'#60818b','#60818b');
          g.box(x,outside+side*.13,z+3.18,.11,.08,2.12,'#bdbb9d','#bdbb9d');g.box(x,outside+side*.14,z+4.2,1.82,.08,.1,'#bdbb9d','#bdbb9d');
          g.box(x,y+side*.12,z+2.9,2.45,.55,.18,'#c8b99a','#827e68');
        }
        // Narrow standing-seam panels follow the roof slope, with quiet wear.
        const panel=1.15,rz=t=>peak+(eave-peak)*t;
        for(let x=-l/2-.75;x<l/2+.75;x+=panel){const end=Math.min(l/2+.75,x+panel),shade=tint(roof,Math.floor(rand()*11)-5);
          face([[x,0,peak],[end,0,peak],[end,side*half,eave],[x,side*half,eave]],shade,side<0);
          beam([x,0,peak+.06],[x,side*half,eave+.06],.045,tint(roof,18),4);
          if(rand()>.6){const a=.2+rand()*.3,b=Math.min(.95,a+.25+rand()*.25),sx=x+.25,ex=Math.min(end,sx+.3);face([[sx,side*half*a,rz(a)+.015],[ex,side*half*a,rz(a)+.015],[ex,side*half*b,rz(b)+.015],[sx,side*half*b,rz(b)+.015]],tint(shade,-8),side<0);}
        }
        beam([-l/2-.85,side*half,eave-.1],[l/2+.85,side*half,eave-.1],.13,'#a7b1a3');
        for(const end of [-1,1])beam([end*(l/2+.8),0,peak],[end*(l/2+.8),side*half,eave],.12,'#b7b79b');
      }
      beam([-l/2-.9,0,peak+.08],[l/2+.9,0,peak+.08],.18,tint(roof,24));
      // Recessed loading doors, framed boards and external sliding hardware.
      const dw=w*.36,dh=h*.7,x=l/2+.06;
      g.box(x,0,z,.16,dw+.6,dh+.35,'#344b4b','#344b4b');
      for(let y=-dw/2+.2;y<dw/2;y+=.4){const c=tint('#60716a',Math.floor(rand()*14)-7);g.box(x+.12,y,z+.08,.14,.365,dh-.16,c,c);}
      for(const side of [-1,1]){
        g.box(x+.26,side*(dw/2+.25),z,.25,.28,dh+.5,'#b8ac8c','#a4987b');
        beam([x+.25,side*.17,z+.35],[x+.25,side*(dw/2-.15),z+dh-.35],.075,'#a0a18b',4);
        g.box(x+.3,side*.22,z+dh*.46,.09,.1,.4,'#313f42','#313f42');
      }
      g.box(x+.22,0,z+dh+.35,.3,dw+1.5,.18,'#b6b9a1','#626f6b');g.box(x+.5,0,1.86,1.1,dw+.8,.22,'#aaa58a','#777c69');
      // Slatted gable vent reads as a recess beneath the roof ridge.
      g.box(x+.07,0,z+h-.1,.12,w*.13,w*.1,'#344d52','#344d52');for(let i=0;i<4;i++)g.box(x+.15,0,z+h+i*w*.022,.12,w*.14,.08,'#a6a588','#8d937c');
    }
    function pier(l,w,alongY){
      const box=(t,s,z,a,b,h,top,side)=>g.box(alongY?s:t,alongY?t:s,z,alongY?b:a,alongY?a:b,h,top,side);
      const point=(t,s,z)=>alongY?[s,t,z]:[t,s,z];
      // Solid fascia and separate boards retain a clean silhouette as seams mip out.
      box(0,0,.95,l,w,.56,'#857e65','#53675f');
      for(let t=-l/2+.17;t<l/2;t+=.34){
        const a=Math.min(.315,l/2-t+.17),c=tint('#a19577',Math.floor(rand()*16)-8);box(t,0,1.51,a,w-.18,.15,c,'#736f57');
        if(rand()>.5)box(t+.08,(rand()-.5)*w*.3,1.665,.018,w*.45,.012,tint(c,-12));
        // Sparse board joints avoid a uniform dotted texture at distance.
        if(Math.floor((t+l/2)/.34)%4===0)box(t,(rand()-.5)*w*.6,1.67,a,.025,.012,'#696e59');
      }
      for(const side of [-1,1]){
        box(0,side*(w/2-.12),1.45,l,.23,.22,'#b1a282','#777961');
        for(let t=-l/2+1;t<l/2;t+=6){
          beam(point(t,side*(w/2-.4),-1.1),point(t,side*(w/2-.4),2.35),.28,'#777562',8);
          beam(point(t,side*(w/2-.4),-.15),point(t,side*(w/2-.4),.65),.3,'#415f56',8);
          beam(point(t,side*(w/2-.4),2.32),point(t,side*(w/2-.4),2.47),.34,'#c0b597',8);
          box(t,side*(w/2-.4),2.03,.59,.59,.1,'#526362','#526362');
          box(t,0,.7,.3,w,.35,'#8c866b','#5e6e60');
        }
      }
      // Iron mooring cleats, access ladder and a coiled line at the outer berth.
      for(const side of [-1,1])for(const t of [-l/2+3,l/2-3]){
        const s=side*(w/2-.85);box(t,s,1.69,.55,.5,.12,'#85958c','#455f61');beam(point(t,s,1.8),point(t,s,2.05),.1,'#7d928b');beam(point(t-.4,s,2.04),point(t+.4,s,2.04),.095,'#a6b2a0');
      }
      const end=-l/2+5,edge=w/2+.18;
      for(const offset of [-.45,.45])beam(point(end+offset,edge,-.6),point(end+offset,edge,2.1),.065,'#98a99b');
      for(let z=-.5;z<2;z+=.38)beam(point(end-.45,edge,z),point(end+.45,edge,z),.055,'#acb8a4');
      for(let coil=0;coil<3;coil++)for(let i=0;i<20;i++){const r=.38+coil*.12,a=i/20*TAU,b=(i+1)/20*TAU;beam(point(end+2+Math.cos(a)*r,Math.sin(a)*r,1.72),point(end+2+Math.cos(b)*r,Math.sin(b)*r,1.72),.035,'#c3ad80',4);}
    }
    for(const port of root.WidewakeEstuary.ports.filter(p=>!p.theme)){
      const add=(suffix,x,y,build,shadow)=>{
        g=G();build();const type='landing_'+port.id+suffix,mesh=new Float32Array(g.out);let radius=1;
        for(let i=0;i<mesh.length;i+=6)radius=Math.max(radius,Math.hypot(mesh[i],mesh[i+1])+mesh[i+2]);
        meshes[type]=mesh;specs[type]={length:radius*2,height:35,frames:1,ppu:10};parts.push({type,x:port.x+x,y:port.y+y,radius,shadow,shadowZ:suffix.startsWith('_pier')?.08:1.23});
      };
      if(port.id==='yard'){
        add('',-10,-139,()=>shed(35,24,9,'#587c88','#98977b'),[37,26,9]);
        add('_workshop',-64,-123,()=>shed(17,15,7,'#8a7869','#9e9374'),[19,17,7]);
        add('_cargo',-35,-122,()=>{for(let i=0;i<10;i++)crate(-4+(i%4)*3,-3+Math.floor(i/4)*3,1.65,i%3===0?2.5:1.8);},[15,10,1.5]);
        add('_hoist',-17,-116,()=>{
          g.box(0,0,1.2,1.7,1.7,1.1,'#a1a38a','#6b7d70');beam([0,0,2],[0,0,14],.3,'#7d968c');beam([-.7,0,13.5],[10,0,13.5],.25,'#b0ba9f');beam([0,0,8],[5,0,13.5],.15,'#8c9f8e');
          beam([9,0,13.3],[9,0,5],.035,'#c9c4a0');beam([9,0,5],[9,0,4.6],.14,'#536e70');beam([9,0,4.6],[9.35,0,4.6],.12,'#536e70');g.box(.6,0,3.2,.5,1.4,1.1,'#b5a581','#526b68');
        },[4,3,8]);
        add('_timber',-61,-112,()=>{for(const y of [-4,4])g.box(-.6,y,1.23,6,.45,.57,'#9a8b6b','#6e7057');for(let row=0;row<2;row++)for(let i=0;i<7;i++)g.box(-3+i*.8,0,1.8+row*.48,.65,11,.42,'#b8a47d','#8a8666');},[7,12,1.5]);
      }else if(port.id==='mill'){
        add('',-86,-146,()=>{shed(42,25,15,'#897968','#a39272');g.box(-9,-2,17,3.5,3.5,14,'#a08e73','#807461');for(let z=20;z<31;z+=.6)g.box(-9,-.23,z,3.55,.06,.055,'#b3a084','#a29176');g.box(-9,-2,31,4.2,4.2,.45,'#c0ad8b','#847a65');g.box(-9,-2,31.46,2.6,2.6,.04,'#344b4a');},[44,27,15]);
        add('_store',-135,-125,()=>shed(24,18,10,'#68857f','#b0a17e'),[26,20,10]);
        add('_cargo',-73,-118,()=>{for(let i=0;i<15;i++)crate(-6+(i%5)*2.8,-3+Math.floor(i/5)*2.7,1.7);},[15,10,1.5]);
        add('_timber',-116,-102,()=>{for(const y of [-6,6])g.box(.15,y,1.23,7.5,.45,.47,'#9a8b6b','#6e7057');for(let row=0;row<3;row++)for(let i=0;i<8;i++)g.box(-3+i*.9,0,1.7+row*.42,.76,18,.37,'#ac956b','#817757');},[9,19,1.5]);
      }else{
        add('',-41,0,()=>shed(11,9,5,'#aaa17c','#9c9475'),[13,11,5]);
        add('_cargo',-33,7,()=>{crate(-1,-1,1.7,1.8);crate(0,1,1.7,1.5);},[4,4,1]);
        add('_nets',-28,-6,()=>{for(let i=0;i<9;i++)g.box(-1+i*.15,0,1.7,.08,4,.18,'#819281','#667e72');});
      }
      port.piers.forEach((p,i)=>add('_pier'+i,p.x,p.y,()=>pier(p.length,p.width,p.alongY),[p.alongY?p.width:p.length,p.alongY?p.length:p.width,1]));
    }
    return{meshes,specs,parts};
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
    layout(location=5)in vec2 aTilt;uniform vec2 uSize;uniform float uZoom;uniform vec2 uCell;uniform vec4 uRect;uniform float uFrames;uniform float uTime;uniform float uFoliage;
    out vec2 uv;flat out vec3 frames;out float depth;out float flash;out float spriteScale;
    void main(){float heading=mod(atan(aPose.x,aWorld.w)/6.28318530718*uFrames+uFrames,uFrames);frames=vec3(floor(heading),mod(floor(heading)+1.,uFrames),fract(heading));uv=aPosition*.5+.5;
      vec2 local=vec2(uRect.x+(uv.x*uCell.x-2.)/uRect.z,uRect.y-(uv.y*uCell.y-2.)/uRect.z)*aPose.y;vec3 p=aWorld.xyz;vec2 plane=vec2(local.x/.70710678+local.y/.35355339,local.y/.35355339-local.x/.70710678)*.5;local.y-=dot(plane,aTilt)*.8660254;local.x+=sin(uTime*1.5+aPose.w)*max(0.,-local.y)*uFoliage*.025;vec2 screen=(vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-p.z*.8660254)+local)*uZoom;
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
      for(const [type,spec] of Object.entries({...root.WidewakeBattle.roles,...view.battle.visualRoles,...view.artSpecs,...Object.fromEntries(root.WidewakeBattle.enemies.map((spec,i)=>['raider'+i,spec]))})){
        const mesh=view.meshes[type];if(!mesh)continue;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,range=0;const frames=spec.frames||(type.startsWith('raider')?32:64),ppu=spec.ppu||(type==='launch'?8:spec.length>70?1.25:spec.length>50?1.65:2);
        for(let f=0;f<frames;f++){const c=Math.cos(f/frames*TAU),s=Math.sin(f/frames*TAU);for(let i=0;i<mesh.length;i+=6){const x=mesh[i]*c-mesh[i+1]*s,y=mesh[i]*s+mesh[i+1]*c,z=mesh[i+2],px=(x-y)*Math.SQRT1_2,py=(x+y)*Math.SQRT1_2*.5-z*Math.sqrt(.75);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);range=Math.max(range,Math.abs((x+y)*.6123724+z*.5)+1);}}
        const w=Math.ceil(((maxX-minX)*ppu+4)/4)*4,h=Math.ceil(((maxY-minY)*ppu+4)/4)*4,levels=1+Math.floor(Math.log2(Math.max(w,h)));
        if(Math.max(w,h)>gl.getParameter(gl.MAX_TEXTURE_SIZE)||frames>gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS))throw Error('Sprite frames exceed device limit');
        this.entries[type]={mesh,minX,maxY,ppu,w,h,frames,range,levels,samples:type.startsWith('landing_')?Math.min(4,gl.getParameter(gl.MAX_SAMPLES)):0};
        for(let level=0;level<levels;level++)this.bytes+=Math.max(1,w>>level)*Math.max(1,h>>level)*frames*8;
      }
      this.bake();this.program=root.WidewakeOcean.program(gl,spriteVertex,spriteFragment);
      const quad=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]);this.batches={};for(const type of Object.keys(this.entries))this.batches[type]=new root.WidewakeOcean.Batch(gl,quad,type.startsWith('raider')?32768:view.artSpecs?.[type]?1600:64,true);
    }
    bake(){const gl=this.gl,program=root.WidewakeOcean.program(gl,bakeVertex,bakeFragment),framebuffer=gl.createFramebuffer(),depth=gl.createRenderbuffer(),multisample=gl.createFramebuffer(),sampleBuffers=[gl.createRenderbuffer(),gl.createRenderbuffer(),gl.createRenderbuffer()];gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
      gl.disable(gl.BLEND);gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);gl.disable(gl.CULL_FACE);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clearColor(0,0,0,0);gl.useProgram(program);
      for(const entry of Object.values(this.entries)){
        const texture=(format,levels,filter)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.texStorage3D(gl.TEXTURE_2D_ARRAY,levels,format,entry.w,entry.h,entry.frames);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,levels>1?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
        entry.color=texture(gl.RGBA8,entry.levels,gl.LINEAR_MIPMAP_LINEAR);entry.depth=texture(gl.RGBA8,entry.levels,gl.LINEAR_MIPMAP_LINEAR);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,entry.w,entry.h);
        // Static close-up art resolves coverage before mip generation. Thin plank
        // gaps and roof seams stay continuous instead of aliasing into dotted rows.
        if(entry.samples){gl.bindFramebuffer(gl.FRAMEBUFFER,multisample);for(let i=0;i<3;i++){gl.bindRenderbuffer(gl.RENDERBUFFER,sampleBuffers[i]);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,entry.samples,i===2?gl.DEPTH_COMPONENT16:gl.RGBA8,entry.w,entry.h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,i===2?gl.DEPTH_ATTACHMENT:gl.COLOR_ATTACHMENT0+i,gl.RENDERBUFFER,sampleBuffers[i]);}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Antialiased landmark framebuffer unavailable');gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);}
        const data=normals(entry.mesh),vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(const [index,offset]of [[0,0],[1,12],[4,24]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,3,gl.FLOAT,false,36,offset);}gl.viewport(0,0,entry.w,entry.h);gl.uniform2f(gl.getUniformLocation(program,'uSize'),entry.w,entry.h);gl.uniform4f(gl.getUniformLocation(program,'uRect'),entry.minX,entry.maxY,entry.ppu,0);gl.uniform1f(gl.getUniformLocation(program,'uRange'),entry.range);
        for(let f=0;f<entry.frames;f++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,entry.color,0,f);gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,entry.depth,0,f);if(f===0&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Sprite frame framebuffer unavailable');if(entry.samples)gl.bindFramebuffer(gl.FRAMEBUFFER,multisample);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform2f(gl.getUniformLocation(program,'uRotation'),Math.cos(f/entry.frames*TAU),Math.sin(f/entry.frames*TAU));gl.drawArrays(gl.TRIANGLES,0,data.length/9);
          if(entry.samples){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,multisample);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,framebuffer);for(let attachment=0;attachment<2;attachment++){gl.readBuffer(gl.COLOR_ATTACHMENT0+attachment);gl.drawBuffers(attachment?[gl.NONE,gl.COLOR_ATTACHMENT1]:[gl.COLOR_ATTACHMENT0]);gl.blitFramebuffer(0,0,entry.w,entry.h,0,0,entry.w,entry.h,gl.COLOR_BUFFER_BIT,gl.NEAREST);}gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);}
        }
        for(const t of [entry.color,entry.depth]){gl.bindTexture(gl.TEXTURE_2D_ARRAY,t);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);}gl.deleteBuffer(buffer);gl.deleteVertexArray(vao);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(depth);for(const buffer of sampleBuffers)gl.deleteRenderbuffer(buffer);gl.deleteFramebuffer(multisample);gl.deleteProgram(program);
    }
    bind(type,edges){const gl=this.gl,entry=this.entries[type];this.view.uniforms(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'uCell'),entry.w,entry.h);gl.uniform4f(gl.getUniformLocation(this.program,'uRect'),entry.minX,entry.maxY,entry.ppu,0);gl.uniform1f(gl.getUniformLocation(this.program,'uRange'),entry.range);gl.uniform1f(gl.getUniformLocation(this.program,'uFrames'),entry.frames);gl.uniform1f(gl.getUniformLocation(this.program,'uTime'),this.view.reduced?0:this.view.visualTime);gl.uniform1f(gl.getUniformLocation(this.program,'uFoliage'),this.view.reduced?0:type.startsWith('tree')||type==='reed'?1:0);gl.uniform1i(gl.getUniformLocation(this.program,'uEdges'),edges?1:0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,entry.color);gl.uniform1i(gl.getUniformLocation(this.program,'uColor'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,entry.depth);gl.uniform1i(gl.getUniformLocation(this.program,'uDepth'),1);
    }
    begin(){this.pending.length=0;}
    draw(type,source){if(!source.count)return 0;const batch=this.batches[type];if(batch!==source)batch.data.set(source.data.subarray(0,source.count*8));batch.tilts.set(source.tilts.subarray(0,source.count*2));batch.count=source.count;this.bind(type,false);this.pending.push(type);return batch.draw();}
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
    uniform sampler2D uNoise;uniform float uOpenSea;uniform float uDetailMotion;
    ${root.WidewakeWaves?.glsl||''}
    vec3 seaSample(vec2 world,float time,float depth,float salt,out vec2 p){
      // Intersect the camera ray with the physical surface. Newton correction
      // resolves both color and depth with the same four wave evaluations.
      float h=waveSurface(world,time,depth,salt,uOpenSea).x;vec3 q;
      for(int i=0;i<2;i++){q=waveSurface(world+h*1.22474487,time,depth,salt,uOpenSea);h+=clamp((q.x-h)/max(.22,1.-1.22474487*(q.y+q.z)),-3.,3.);}
      p=world+h*1.22474487;return waveSurface(p,time,depth,salt,uOpenSea);
    }
    vec3 seaColorAt(vec2 p,vec3 wave,float depth,float salt,vec2 current,float time,float zoom){
      float exposure=seaExposure(p,depth,salt,uOpenSea);
      vec2 drift=current*time*.45;
      float broad=texture(uNoise,p*.0018).r,grain=texture(uNoise,(p-drift)*.037).g;
      vec3 offshore=vec3(.032,.175,.235),coastal=vec3(.052,.295,.315),river=vec3(.075,.235,.235);
      float shelf=exp(-max(depth,0.)*.075);
      vec3 base=mix(offshore,coastal,shelf*.8+.12);base=mix(river,base,salt);
      base*=.96+broad*.08;
      float bottom=exp(-max(depth,0.)*.62);
      base=mix(base,vec3(.23,.39,.32)+grain*.035,bottom*.72);
      vec3 normal=normalize(vec3(-wave.y,-wave.z,1.));
      vec3 sun=normalize(vec3(-.70,.25,.55)),eye=vec3(.61237244,.61237244,.5);
      float face=max(0.,dot(normal,sun)),fresnel=.025+.975*pow(1.-max(0.,dot(normal,eye)),5.);
      // One coherent light direction: reflected sky reinforces the lit face
      // rather than filling its shadow and cancelling the shape of each wave.
      vec3 result=base*(.28+face*1.20);
      result=mix(result,vec3(.31,.53,.59),fresnel*.72);
      float reflection=pow(max(0.,dot(normal,normalize(sun+eye))),150.);
      float glitter=texture(uNoise,(p-drift)*.065+vec2(time*.007,0.)).r;
      result+=vec3(.40,.47,.45)*reflection*(.08+.18*smoothstep(.50,.79,glitter))*smoothstep(.1,1.,zoom)*uDetailMotion;
      // A thin broken lip follows the ridge of the swell. A height threshold
      // alone paints broad foam islands and hides the direction of the face.
      float crest=wave.x/max(.2,exposure),ridgeSlope=dot(wave.yz,vec2(-.7909677,.6118579))/max(.2,exposure);
      float aa=max(fwidth(ridgeSlope),.0015),lip=1.-smoothstep(.005+aa,.020+aa,abs(ridgeSlope+.006));
      float broken=texture(uNoise,p*.004+vec2(time*.0009,-time*.0005)).b;
      float lace=texture(uNoise,p*.018+vec2(time*.001,-time*.0007)).r;
      float foam=smoothstep(.90,2.0,crest)*lip*smoothstep(.40,.70,broken)*(.30+.70*lace)*exposure*.44;
      result=mix(result,vec3(.73,.87,.83),foam);
      float fine=texture(uNoise,(p-drift)*vec2(.11,.17)+vec2(time*.012,-time*.009)).r;
      result+=vec3(.018,.032,.035)*(fine-.5)*smoothstep(.4,2.,zoom);
      float edge=exp(-abs(depth-.22)*3.8),wash=.45+.55*sin(time*.95+depth*7.+broad*5.);
      result=mix(result,vec3(.55,.76,.68),edge*(.22+wash*.20));return result;
    }
    vec3 seaColor(vec2 world,float depth,float salt,vec2 current,float time,float zoom){vec2 p;vec3 wave=seaSample(world,time,depth,salt,p);return seaColorAt(p,wave,depth,salt,current,time,zoom);}
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
        t.width=s.width*.42;t.spread=Math.min(12,.5+s.speed*.14);t.churn=Math.max(.32,Math.min(1.8,s.length/Math.max(8,s.speed)*1.6));t.liveX=x;t.liveY=y;t.liveTime=time;t.livePower=Math.min(1,speed/(s.speed*.8));
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
          this.tangent(t,n,this.startNormal);this.tangent(t,next,this.endNormal);const left=this.startNormal,right=this.endNormal,width=Math.min(left[2],t.width+Math.max(0,age)*t.spread*t.power[i]**1.2),endWidth=Math.min(right[2],t.width+Math.max(0,endAge)*t.spread*(live?t.livePower:t.power[j])**1.2);
          if(!view.visible((x+ex)*.5,(y+ey)*.5,(Math.hypot(ex-x,ey-y)+width)*scale+2))continue;
          const alpha=t.power[i]*Math.pow(Math.max(0,1-age/this.life),1.5)*Math.min(1,n/6),endAlpha=(live?t.livePower:t.power[j])*Math.pow(Math.max(0,1-endAge/this.life),1.5)*Math.min(1,next/6);
          emit(x,y,ex,ey,width,endWidth,alpha,endAlpha,left[0],left[1],right[0],right[1],Math.max(0,age),Math.max(0,endAge),t.churn);
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
    drawCanvas(view){const c=view.fallback,sea=view.battle.sea;let count=0;c.save();c.lineJoin='round';
      const surface=(x,y)=>view.project(x,y,(sea?.at(x,y,view.visualTime,this._surface||(this._surface={}),-1,false).height||0)+.05);
      this.segments(view,(x,y,ex,ey,w,ew,a,ea,nx,ny,enx,eny,age=0,endAge=0,churn=.5)=>{
        if(sea?.field&&sea.field.sample((x+ex)*.5,(y+ey)*.5,this._water||(this._water={})).depth<.3)return;
        if(nx===undefined){const length=Math.hypot(ex-x,ey-y)||1;nx=enx=-(ey-y)/length;ny=eny=(ex-x)/length;}
        if(sea?.field){
          // Canvas has no terrain depth buffer. Constrain both expanding edges,
          // including their interior spans, so foam cannot paint over a bank.
          const wet=scale=>{for(let n=0;n<=4;n++){const t=n/4,px=x+(ex-x)*t,py=y+(ey-y)*t,ox=(nx*w*(1-t)+enx*ew*t)*scale,oy=(ny*w*(1-t)+eny*ew*t)*scale;for(const side of [-1,1])if(sea.field.sample(px+ox*side,py+oy*side,this._water).depth<.3)return false;}return true;};
          if(!wet(1)){if(!wet(0))return;let lo=0,hi=1;for(let n=0;n<6;n++){const mid=(lo+hi)/2;if(wet(mid))lo=mid;else hi=mid;}w*=lo;ew*=lo;}
        }
        const left=surface(x+nx*w,y+ny*w),right=surface(x-nx*w,y-ny*w),endLeft=surface(ex+enx*ew,ey+eny*ew),endRight=surface(ex-enx*ew,ey-eny*ew);
        // Old prop wash clears in the middle. The two widening, broken shoulders
        // carry the wake after the short, white stern churn has subsided.
        const shade=(life,across,px,py,power)=>{const noise=.5+.25*Math.sin(px*.71+py*.29)+.25*Math.sin(px*.23-py*.83),mature=1-Math.exp(-life*2.2),flank=.25+.5*mature+(noise-.5)*.12,young=Math.exp(-life/churn*2),shoulder=Math.exp(-(((Math.abs(across)-flank)*9)**2)),core=Math.exp(-across*across*10)*young,broken=Math.max(0,Math.min(1,(noise-.28)/.4)),foam=core*(.55+noise*.35)+shoulder*mature*(.05+broken*.52),wash=(1-across*across)*.035*(1-young),white=Math.max(0,Math.min(1,(foam-.035)/.215)),alpha=(foam+wash)*power;return`rgba(${Math.round(51+145*white)},${Math.round(122+105*white)},${Math.round(143+76*white)},${alpha})`;};
        const sx=(left.x+right.x)*.5,sy=(left.y+right.y)*.5,tx=(endLeft.x+endRight.x)*.5,ty=(endLeft.y+endRight.y)*.5;
        for(let band=0;band<24;band++){const lo=band/24,hi=(band+1)/24,across=lo+hi-1,gradient=c.createLinearGradient(sx,sy,tx,ty);
          gradient.addColorStop(0,shade(age,across,x+nx*w*across,y+ny*w*across,a));gradient.addColorStop(1,shade(endAge,across,ex+enx*ew*across,ey+eny*ew*across,ea));c.globalAlpha=1;c.fillStyle=gradient;c.beginPath();
          c.moveTo(left.x+(right.x-left.x)*lo,left.y+(right.y-left.y)*lo);
          c.lineTo(endLeft.x+(endRight.x-endLeft.x)*lo,endLeft.y+(endRight.y-endLeft.y)*lo);
          c.lineTo(endLeft.x+(endRight.x-endLeft.x)*hi,endLeft.y+(endRight.y-endLeft.y)*hi);
          c.lineTo(left.x+(right.x-left.x)*hi,left.y+(right.y-left.y)*hi);c.closePath();c.fill();
        }count++;
      });c.restore();view.stats.wakeSegments=count;
    }
  }
  const wakeVertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;layout(location=4)in vec2 aFade;layout(location=5)in vec4 aWater;layout(location=6)in vec3 aLife;layout(location=7)in vec4 aEdges;uniform vec2 uSize;uniform vec2 uCamera;uniform float uZoom;uniform float uTime;uniform float uOpenSea;out vec2 uv;out vec2 world;out vec2 flatWorld;out vec2 wetWater;out float opacity;out float age;out float churn;
    ${root.WidewakeWaves?.glsl||''}
    void main(){uv=aPosition*.5+.5;vec2 p=mix(aWorld.xy,aWorld.zw,uv.x)+mix(aPose.xy,aPose.zw,uv.x)*aPosition.y;world=p+uCamera;opacity=mix(aFade.x,aFade.y,uv.x);wetWater=mix(aWater.xy,aWater.zw,uv.x);vec2 edgeDepth=mix(aEdges.xy,aEdges.zw,uv.x);wetWater.x=mix(wetWater.x,aPosition.y<0.?edgeDepth.x:edgeDepth.y,abs(aPosition.y));age=mix(aLife.x,aLife.y,uv.x);churn=aLife.z;float z=waveSurface(world,uTime,wetWater.x,wetWater.y,uOpenSea).x+.05;flatWorld=world-z*1.22474487;vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-z*.8660254)*uZoom;gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+z*.5)/20000.,-.99,.99),1.);}`;
  const wakeFragment=`#version 300 es
    precision highp float;in vec2 uv;in vec2 world;in vec2 flatWorld;in vec2 wetWater;in float opacity;in float age;in float churn;uniform float uTime;uniform vec2 uCamera;out vec4 color;
    ${waterGLSL}
    void main(){if(wetWater.x<.3)discard;float coarse=texture(uNoise,world*.003).g,fine=texture(uNoise,world*.018).r;float y=abs(uv.y*2.-1.);float mature=1.-exp(-age*2.2),young=exp(-age/max(.1,churn)*2.);float flank=.25+.5*mature+(coarse-.5)*.12;float shoulder=exp(-pow((y-flank)*9.,2.));float broken=smoothstep(.28,.58,coarse)*smoothstep(.34,.62,fine);float core=exp(-y*y*10.)*young*(.50+.50*smoothstep(.30,.62,fine));float white=core*.86+shoulder*mature*(.045+broken*.64);float wash=(1.-y*y)*.035*(1.-young);float alpha=(white+wash)*opacity*(1.-smoothstep(.90,1.,y));if(alpha<.008)discard;vec2 hitWorld;vec3 wave=seaSample(flatWorld,uTime,wetWater.x,wetWater.y,hitWorld);gl_FragDepth=clamp(.5-((hitWorld.x+hitWorld.y-uCamera.x-uCamera.y)*.6123724+wave.x*.5)/40000.,.005,.995)-.000004;color=vec4(mix(vec3(.20,.48,.56),vec3(.77,.89,.86),smoothstep(.035,.25,white)),alpha);}`;
  class WaterMotion{
    constructor(view){this.view=view;const gl=view.gl,O=root.WidewakeOcean,vertices=[];
      // Subdivide each ribbon across its width so expanding foam conforms to
      // a curved swell instead of cutting one flat triangle through it.
      for(let x=0;x<2;x++)for(let y=0;y<4;y++){const a=x-1,b=x,c=y*.5-1,d=c+.5;vertices.push(a,c,b,c,b,d,a,c,b,d,a,d);}
      this.program=O.program(gl,wakeVertex,wakeFragment);this.batch=new O.Batch(gl,new Float32Array(vertices),3120,true);
      const b=this.batch;b.data=new Float32Array(b.capacity*21);gl.bindVertexArray(b.vao);gl.bindBuffer(gl.ARRAY_BUFFER,b.instances);gl.bufferData(gl.ARRAY_BUFFER,b.data.byteLength,gl.DYNAMIC_DRAW);for(const [index,size,offset]of [[2,4,0],[3,4,16],[4,2,32],[5,4,40],[6,3,56],[7,4,68]]){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,84,offset);gl.vertexAttribDivisor(index,1);}}
    draw(){const v=this.view,gl=v.gl,field=v.battle.sea?.field;this.batch.count=0;v.wakes.segments(v,(x,y,ex,ey,w,ew,a,ea,nx,ny,enx,eny,age=0,endAge=0,churn=.5)=>{const b=this.batch;if(b.count>=b.capacity)return;const start=field?.sample(x,y,this._start||(this._start={})),end=field?.sample(ex,ey,this._end||(this._end={}));if(start&&start.depth<.3&&end.depth<.3)return;if(nx===undefined){const length=Math.hypot(ex-x,ey-y)||1;nx=enx=-(ey-y)/length;ny=eny=(ex-x)/length;}let i=b.count++*21;const d=b.data;d[i++]=x-v.camera.x;d[i++]=y-v.camera.y;d[i++]=ex-v.camera.x;d[i++]=ey-v.camera.y;d[i++]=nx*w;d[i++]=ny*w;d[i++]=enx*ew;d[i++]=eny*ew;d[i++]=a;d[i++]=ea;d[i++]=start?.depth??22;d[i++]=start?.salinity??1;d[i++]=end?.depth??22;d[i++]=end?.salinity??1;d[i++]=age;d[i++]=endAge;d[i++]=churn;
        // The middle can remain navigable while either expanding shoulder
        // reaches a bank. Carry both edge depths without flattening that channel.
        const edge=this._edge||(this._edge={});d[i++]=field?.sample(x-nx*w,y-ny*w,edge).depth??22;d[i++]=field?.sample(x+nx*w,y+ny*w,edge).depth??22;d[i++]=field?.sample(ex-enx*ew,ey-eny*ew,edge).depth??22;d[i]=field?.sample(ex+enx*ew,ey+eny*ew,edge).depth??22;
      });v.stats.wakeSegments=this.batch.count;
      v.uniforms(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'uCamera'),v.camera.x,v.camera.y);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,v.noise);gl.uniform1i(gl.getUniformLocation(this.program,'uNoise'),2);gl.uniform1f(gl.getUniformLocation(this.program,'uTime'),v.visualTime);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);const b=this.batch;gl.bindVertexArray(b.vao);gl.bindBuffer(gl.ARRAY_BUFFER,b.instances);gl.bufferSubData(gl.ARRAY_BUFFER,0,b.data,0,b.count*21);if(b.count)gl.drawArraysInstanced(gl.TRIANGLES,0,b.vertexCount,b.count);gl.depthMask(true);gl.disable(gl.BLEND);return b.count?1:0;}
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
    ships(){const v=this.view;this.batch.count=0;for(const s of v.battle.ships){if(s.hp<=0||!v.visible(s.x,s.y,100))continue;const p=v.poses[s.id],z=v.battle.sea?.at(p.x,p.y,v.visualTime,this._surface||(this._surface={}),-1,false).height||0;this.batch.add(p.x-v.camera.x,p.y-v.camera.y,z+.08,Math.cos(p.angle),Math.sin(p.angle),s.length,s.width,Math.min(3,s.height*.16));}return this.draw();}
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
        if(s.type==='trawler'){const q=offset(s.length*.07);this.batches.winch.add(q.x,q.y,h+1+(p.pitch||0)*s.length*.07,Math.cos(time*2.2),Math.sin(time*2.2),1);}
        if(s.type==='oilrig'){const q=offset(s.length*.19);this.batches.pump.add(q.x,q.y,h+3+(p.pitch||0)*s.length*.19+Math.sin(time*1.8)*2,c,sn);}
        const speed=Math.hypot(s.vx,s.vy);if(speed>.8&&!v.reduced){const q=offset(-s.length*.44),a=v.visualTime*speed*3;this.batches.rotor.add(q.x,q.y,p.z-(p.pitch||0)*s.length*.44+.15,Math.cos(a),Math.sin(a),s.type==='launch'?.22:s.width*.09);}
      }
      v.uniforms(v.main);let draws=0;for(const batch of Object.values(this.batches))draws+=batch.draw();return draws;
    }
    dispose(){for(const batch of Object.values(this.batches))batch.dispose();}
  }
  root.WidewakeOceanArt={mesh,normals,scenery,landings,Atlas,noiseTexture,waterGLSL,WakeTrail,WaterMotion,Shadows,Mechanisms};
})(globalThis);
