/* Original shore silhouettes, baked once into the existing color/depth atlas.
   Small moving pieces are separate meshes, not new geometry each frame. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function models(G){
    const meshes={},specs={};
    const save=(name,g,ppu=2)=>{meshes[name]=new Float32Array(g.out);specs[name]={length:180,height:95,frames:1,ppu};};
    function column(g,x,y,z,r,h,color,top=color,n=8){for(let i=0;i<n;i++){const a=i/n*TAU,b=(i+1)/n*TAU;g.face([[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],[x+Math.cos(b)*r*.85,y+Math.sin(b)*r*.85,z+h],[x+Math.cos(a)*r*.85,y+Math.sin(a)*r*.85,z+h]],color);g.tri([x,y,z+h],[x+Math.cos(a)*r*.85,y+Math.sin(a)*r*.85,z+h],[x+Math.cos(b)*r*.85,y+Math.sin(b)*r*.85,z+h],top);}}
    function beam(g,a,b,w,color){const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1,px=-dy/d*w,py=dx/d*w;g.face([[a[0]+px,a[1]+py,a[2]],[a[0]-px,a[1]-py,a[2]],[b[0]-px,b[1]-py,b[2]],[b[0]+px,b[1]+py,b[2]]],color);g.face([[a[0],a[1],a[2]-w],[a[0],a[1],a[2]+w],[b[0],b[1],b[2]+w],[b[0],b[1],b[2]-w]],color);}
    function roof(g,x,y,z,l,w,color){g.face([[x-l/2,y-w/2,z],[x+l/2,y-w/2,z],[x+l/2,y,z+w*.45],[x-l/2,y,z+w*.45]],color);g.face([[x-l/2,y,z+w*.45],[x+l/2,y,z+w*.45],[x+l/2,y+w/2,z],[x-l/2,y+w/2,z]],'#596e71');for(let t=-l/2;t<=l/2;t+=2)beam(g,[x+t,y-w/2,z+.04],[x+t,y,z+w*.45+.04],.06,'#beb292');}
    function palm(g,x,y,h){column(g,x,y,0,.5,h,'#897450');for(let i=0;i<7;i++){const a=i/7*TAU,dx=Math.cos(a),dy=Math.sin(a);g.face([[x,y,h],[x+dx*5-dy*2,y+dy*5+dx*2,h+1],[x+dx*11,y+dy*11,h-4],[x+dx*5+dy*2,y+dy*5-dx*2,h+1]],i%2?'#527c60':'#7b9b65');}}
    function tower(g,x=0,y=0){g.box(x,y,0,10,10,19,'#c0b18c','#6c7e79');for(const side of [-1,1])for(const sy of [-1,1])g.box(x+side*4,y+sy*4,19,1,1,12,'#c5bc99','#788984');roof(g,x,y,31,14,14,'#769c99');column(g,x,y,22,2.4,3,'#b49b65','#d9be7c');for(let z=4;z<18;z+=5)g.box(x+5.03,y,z,.1,1.8,2.8,'#2d555d','#2d555d');}
    for(const kind of new Set(root.WidewakeWaterways.landmarks.map(m=>m.kind))){const g=G();
      if(kind==='kites'||kind==='lantern'){
        for(let i=0;i<5;i++){const x=(i-2)*9,h=12+(i%2)*5;column(g,x,0,0,.45,h,'#8b8569');beam(g,[x,0,h],[x+9,0,14],.06,'#d1c29f');
          if(kind==='kites'){g.face([[x-2,0,h-2],[x+4,0,h-1],[x+3,0,h-9],[x-3,0,h-7]],['#d5b074','#8caeaa','#bc8170'][i%3]);beam(g,[x,0,h-8],[x-2,0,h-15],.07,'#d5b074');}
          else for(let j=0;j<3;j++){const xx=x+j*2.5;column(g,xx,0,h-3-j*.4,.9,1.7,'#ce8a5d','#f1c589');column(g,xx,0,h-3.3-j*.4,.25,.4,'#705e51');}}
        for(let i=0;i<8;i++)g.box((i-4)*4,3,0,3.8,9,.6,'#9e9173','#637770');
      }else if(kind==='kilns'){
        for(let i=0;i<4;i++){const x=i*9-15,y=i%2*9;column(g,x,y,0,4.2,7+i%2*3,'#b57d55','#cf9b66');column(g,x,y,7+i%2*3,1.6,3,'#7c6152');g.box(x+3.9,y,1,.2,2.6,3,'#f3b26b','#512e30');for(let j=0;j<6;j++)column(g,x-3+j,y+6,.2,.4,.8,'#cf9d6c');}
      }else if(kind==='canopy'){
        for(let i=0;i<6;i++){const x=(i%3-1)*15,y=Math.floor(i/3)*12;palm(g,x,y,18+i%3*5);for(let k=0;k<4;k++){const a=k/4*TAU;beam(g,[x,y,6],[x+Math.cos(a)*5,y+Math.sin(a)*5,0],.6,'#6f7957');}}
        for(let i=0;i<14;i++)beam(g,[i*3-20,0,21],[i*3-18,1,7+i%4],.09,'#83995e');
      }else if(kind==='gorilla'){
        for(let i=0;i<4;i++){const x=i*5-8,y=i%2*4,z=1.3;column(g,x,y,0,1.7,1,'#9b9b83');g.box(x,y,z,1.6,1.6,1.3,'#66716b','#3a4c48');g.box(x+.4,y,z+1.1,1,1.1,.9,'#76817a','#475650');for(const side of [-1,1]){g.box(x+.7,y+side*.85,z-.4,.55,.5,1.2,'#606b61','#384b45');g.box(x-1,y+side*.5,z-.65,.6,.6,.9,'#606b61','#384b45');}g.box(x+1,y,z+1.15,.12,.65,.3,'#acaa8c','#acaa8c');}palm(g,-9,-5,14);
      }else if(kind==='roost'){
        for(let i=0;i<7;i++){const x=(i-3)*4,h=5+i%3*3;column(g,x,0,0,.3,h,'#a69d80');g.box(x,0,h,1.6,.5,.5,'#e4dfbd','#b6c8b5');beam(g,[x+.5,0,h],[x+.7,0,h+2],.15,'#d4d7b8');beam(g,[x+.7,0,h+2],[x+1.9,0,h+2],.08,'#ceae69');}}
      else if(kind==='bell')tower(g);
      else if(kind==='roofs'){for(let i=0;i<5;i++){const x=(i-2)*13,y=i%2*12;g.box(x,y,-2,10,10,4,'#90a797','#597d7b');roof(g,x,y,2,12,12,'#879d83');g.box(x+3,y,5,1,2,3,'#bfaf88','#7c8a77');}}
      else if(kind==='wheel'){
        for(const side of [-1,1])g.box(0,side*5,0,4,3,30,'#b9aa83','#7b8370');beam(g,[0,-9,20],[0,9,20],1,'#b7a279');
        for(let i=0;i<16;i++){const a=i/16*TAU,b=(i+1)/16*TAU;for(const side of [-1,1])beam(g,[Math.cos(a)*16,side*4,20+Math.sin(a)*16],[Math.cos(b)*16,side*4,20+Math.sin(b)*16],.6,'#8b9e91');}
      }else if(kind==='falls'){
        for(let i=0;i<12;i++){const x=i*3-18,h=13+(i%4)*4;column(g,x,0,0,2,h,'#879586','#9fa58c');g.face([[x-.5,2,h],[x+.6,2,h],[x+1,8,.4],[x-1,8,.4]],'#c3ddd2');g.face([[x-.2,2,h],[x+.2,2,h],[x+.5,8,.5],[x-.5,8,.5]],'#e0e7d0');}
      }else if(kind==='ribs'){
        for(let i=0;i<12;i++){const x=(i-5.5)*4,h=10*Math.sin((i+1)/13*Math.PI);for(const side of [-1,1]){beam(g,[x,side*2,0],[x,side*8,h*.6],.55,'#d4c4a2');beam(g,[x,side*8,h*.6],[x,side*6,h],.4,'#e3d0a4');}}beam(g,[-27,0,1],[27,0,1],.9,'#c1b18d');
      }else if(kind==='glow'){for(let i=0;i<20;i++){const x=Math.sin(i*2.4)*16,y=Math.cos(i*3)*10,h=1.5+i%4;column(g,x,y,0,.2,h,'#749994');column(g,x,y,h,1.1,.5,'#8cbeba','#c0ded0');}}
      else if(kind==='basalt'){for(let i=0;i<19;i++){const x=(i%7-3)*7,y=Math.floor(i/7)*6,h=14+(i*13%39);column(g,x,y,0,3.7,h,'#586a70',i%2?'#8b9691':'#abb29d',6);}}
      else if(kind==='volcano'){
        for(let i=0;i<16;i++){const a=i/16*TAU,b=(i+1)/16*TAU;g.face([[Math.cos(a)*65,Math.sin(a)*55,0],[Math.cos(b)*65,Math.sin(b)*55,0],[Math.cos(b)*10,Math.sin(b)*10,60],[Math.cos(a)*10,Math.sin(a)*10,60]],i%3?'#5d6868':'#7c7770');}
        column(g,0,0,59,8,.5,'#cf7950','#edb76d',12);
        const surface=r=>Math.max(.4,60*(65-r)/55+1.5);
        for(let i=0;i<18;i++){const x=10+i*6,y=Math.sin(i*.7)*3,z=surface(x),xx=x+6,yy=Math.sin((i+1)*.7)*3,zz=surface(xx),width=3+i*.16;
          g.face([[x,y-width,z],[xx,yy-width,zz],[xx,yy+width,zz],[x,y+width,z]],i%2?'#e58b51':'#cf6446');
          g.face([[x,y-1,z+.2],[xx,yy-1,zz+.2],[xx,yy+1,zz+.2],[x,y+1,z+.2]],'#f5c575');
        }
      }
      save('landmark_'+kind,g,kind==='volcano'?1.5:3);
    }
    {const g=G();g.box(0,0,0,3,10,1,'#c0aa79','#73877c');save('water_paddle',g,4);}
    // Harbor models share surveyed foundations and detailed materials in landings().
    return{meshes,specs};
  }
  root.WidewakeWaterwayArt={models};
})(globalThis);
