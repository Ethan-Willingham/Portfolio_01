/* Procedural finishes. Physics materials are fixed in stage data. */
(function(global){
  'use strict';
  const T=global.THREE;
  const recipes={
    paint0:{color:'#bc9d65',rough:.54,type:'paint'},paint1:{color:'#b8796d',rough:.54,type:'paint'},paint2:{color:'#6f9a6c',rough:.54,type:'paint'},
    maple:{color:'#ba9464',rough:.58,type:'wood'},paint:{color:'#354a3e',rough:.54,type:'paint'},
    brass:{color:'#bba069',rough:.34,metal:1,type:'metal'},card:{color:'#a99470',rough:.92,type:'paper'},
    cork:{color:'#917047',rough:.94,type:'cork'},felt:{color:'#667461',rough:1,type:'felt'},
    ceramic:{color:'#c0c2b3',rough:.18,type:'ceramic'},rubber:{color:'#44493f',rough:.88,type:'rubber'},string:{color:'#b3a385',rough:.91,type:'string'}
  };
  function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function canvas(size){const c=document.createElement('canvas');c.width=c.height=size;return c;}
  function texture(c,color=false){const t=new T.CanvasTexture(c);if(color)t.encoding=T.sRGBEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
  function build(name,end=false,seed=31){
    const r=recipes[name],size=r.type==='wood'?512:256,rand=random(seed);
    const heights=new Float32Array(size*size),color=canvas(size),normal=canvas(size),rough=canvas(size);
    const cc=color.getContext('2d'),nc=normal.getContext('2d'),rc=rough.getContext('2d');
    const ci=cc.createImageData(size,size),ni=nc.createImageData(size,size),ri=rc.createImageData(size,size);
    const base=new T.Color(r.color),rgb=[base.r*255,base.g*255,base.b*255];
    // A growth field through an elliptical trunk, sampled along or across a cut.
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=x/size,v=y/size;
      let h=.5,variation=0,roughness=r.rough;
      if(r.type==='wood'){
        const across=end?u: .25+u*.62, axial=end?v: .74+Math.sin(v*6.283)*.034;
        const px=across+1.2,py=(axial+.9)*1.4;
        const radius=Math.sqrt(px*px+py*py);
        const growth=radius*98+Math.sin(radius*11)*1.8;
        const late=Math.pow(.5+.5*Math.sin(growth),6);
        const fiber=end? .025*Math.sin(u*380+v*28) : .018*Math.sin(u*970+Math.sin(v*12)*5);
        const rays=end?Math.pow(Math.max(0,Math.sin(Math.atan2(py,px)*240)),20)*.09:.020*Math.sin(u*250+v*2.6);
        h=.56-late*.20+fiber-rays;
        variation=-.10*late+fiber*.55+(.02*Math.sin(growth*.09));
        roughness=.53+late*.08;
      }else if(r.type==='cork'){
        // Coherent cork granules, one angular cell per irregular seed point.
        const a=Math.sin(u*230+Math.sin(v*84)*2),b=Math.sin(v*260+Math.sin(u*69)*3);
        h=.48+.07*a*b+.025*(rand()-.5);variation=.08*a*b+.05*(rand()-.5);
        if(a*b>.67){h-=.17;variation-=.12;}
      }else if(r.type==='paper'||r.type==='felt'||r.type==='string'){
        h=.5+.018*(rand()-.5);variation=.026*(rand()-.5);
      }else if(r.type==='metal'){
        const brushing=Math.sin(v*1400+Math.sin(u*5)*.4);
        h=.5+.007*brushing;variation=.007*brushing;
        roughness=.25+.09*(.5+.5*Math.sin(u*18+v*3));
      }else if(r.type==='ceramic'){
        h=.5+.003*Math.sin(u*170)*Math.sin(v*121);variation=.01*Math.sin(u*14)*Math.sin(v*13);
        roughness=.17+.03*Math.sin(u*19)*Math.sin(v*22);
      }else{h=.5+.012*(rand()-.5);variation=.015*(rand()-.5);}
      const j=y*size+x,i=j*4;heights[j]=h;
      for(let k=0;k<3;k++)ci.data[i+k]=rgb[k]*(1+variation);
      ci.data[i+3]=255;ri.data[i]=ri.data[i+1]=ri.data[i+2]=roughness*255;ri.data[i+3]=255;
    }
    cc.putImageData(ci,0,0);rc.putImageData(ri,0,0);
    // Fibers are actual small strands laid into the albedo, following the material.
    if(['paper','felt','string'].includes(r.type)){
      cc.lineWidth=r.type==='felt'?.8:.5;cc.globalAlpha=r.type==='felt'?.16:.09;
      for(let n=0;n<14000;n++){
        const x=rand()*size,y=rand()*size,angle=r.type==='string'?rand()*.25:rand()*Math.PI*2,length=rand()*12+2;
        cc.strokeStyle=n%2?'#e0ceb1':'#605b49';cc.beginPath();cc.moveTo(x,y);cc.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);cc.stroke();
      }
      cc.globalAlpha=1;
    }
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size],dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x];
      const i=(y*size+x)*4;ni.data[i]=128-dx*170;ni.data[i+1]=128-dy*170;ni.data[i+2]=250;ni.data[i+3]=255;
    }
    nc.putImageData(ni,0,0);
    return new T.MeshStandardMaterial({map:texture(color,true),normalMap:texture(normal),normalScale:new T.Vector2(.32,.32),roughnessMap:texture(rough),roughness:1,metalness:r.metal||0});
  }
  function make(){const materials=Object.fromEntries(Object.keys(recipes).map(n=>[n,build(n)]));materials.mapleEnd=build('maple',true);return materials;}
  function stockGeometry(geometry,w,h,d,axisOverride){
    const axis=axisOverride??(h>=w&&h>=d?1:w>=d?0:2),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    geometry.clearGroups();const groups=[[],[]];
    for(let i=0;i<p.count;i+=3){
      const normal=[n.getX(i),n.getY(i),n.getZ(i)],face=Math.abs(normal[0])>Math.abs(normal[1])?(Math.abs(normal[0])>Math.abs(normal[2])?0:2):(Math.abs(normal[1])>Math.abs(normal[2])?1:2);
      groups[face===axis?1:0].push(i,i+1,i+2);
      for(let k=i;k<i+3;k++){
        const point=[p.getX(k),p.getY(k),p.getZ(k)];
        const dims=[w,h,d];
        if(face===axis){const other=[0,1,2].filter(a=>a!==axis);uv.setXY(k,point[other[0]]/1.9+.5,point[other[1]]/1.9+.5);}
        else {const across=[0,1,2].find(a=>a!==axis&&a!==face);uv.setXY(k,point[across]/1.9+.5,point[axis]/5.7+.5);}
      }
    }
    geometry.setIndex([...groups[0],...groups[1]]);geometry.addGroup(0,groups[0].length,0);geometry.addGroup(groups[0].length,groups[1].length,1);uv.needsUpdate=true;
  }
  global.ChainReactionMaterials={recipes,make,stockGeometry};
})(window);
