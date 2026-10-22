/* Bounded wake crests and the Canvas sea, both using the physical wave field. */
(function(root){
  'use strict';
  const O=root.WidewakeOcean,W=root.WidewakeWaves,CAPACITY=8192,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  const vertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;
    uniform vec2 uSize;uniform float uZoom;out float across;out float opacity;
    void main(){float t=aPosition.x*.5+.5;vec2 delta=aWorld.zw-aWorld.xy,n=normalize(vec2(-delta.y,delta.x));vec2 p=mix(aWorld.xy,aWorld.zw,t)+n*aPosition.y*aPose.z;
      float z=mix(aPose.x,aPose.y,t);vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+z*.5)/20000.,-.99,.99),1.);across=aPosition.y;opacity=aPose.w;}`;
  const fragment=`#version 300 es
    precision highp float;in float across;in float opacity;out vec4 color;
    void main(){float rim=exp(-across*across*6.);color=vec4(mix(vec3(.035,.16,.23),vec3(.78,.91,.90),rim),opacity*(.08+rim*.92));}`;
  class Surface{
    constructor(view){this.view=view;this.sample={};this.water={};if(view.gl){this.program=O.program(view.gl,vertex,fragment);this.batch=new O.Batch(view.gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),CAPACITY,true);}else{this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d');this.path=new Float64Array(64*4);}}
    height(x,y){const sea=this.view.battle.sea,w=sea.field?.sample(x,y,this.water);if(w&&w.depth<.4)return null;return W.sample(x,y,this.view.visualTime,w?.depth??22,w?.salinity??1,!sea.field,this.sample).height*sea.strength;}
    crests(emit,budget=CAPACITY){const v=this.view,sea=v.battle.sea;if(!sea)return 0;const data=sea.wake,time=v.visualTime;let count=0;
      // Favor fresh crests when a dense fleet fills the fixed presentation pool.
      for(let n=0;n<sea.count;n++){
        const i=((sea.cursor-1-n+W.CAPACITY)%W.CAPACITY)*8,age=time-data[i+2];if(age<0||age>W.LIFE)continue;
        const fade=1-age/W.LIFE,r=data[i+4]+age*3.5,x=data[i],y=data[i+1],a=data[i+3]+Math.PI,amplitude=data[i+6]*fade*fade*sea.strength;
        const alpha=Math.min(.82,.16+Math.sqrt(Math.max(0,data[i+6]))*.85)*fade**1.35*sea.strength;
        if(alpha<.008||!v.visible(x,y,(r+data[i+5]*2)*v.zoom*v.baseScale))continue;
        const steps=Math.min(48,Math.max(16,Math.ceil(r*v.zoom*v.baseScale/1.8)));let last=null;
        for(let j=0;j<=steps;j++){
          const angle=a+(j/steps-.5)*3.4,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r,height=this.height(px,py);
          if(height===null){last=null;continue;}
          const mask=smooth(-.25,.25,Math.cos(angle-a)),z=height+amplitude*mask+.04;
          if(last&&(!sea.field||sea.field.sample((last.x+px)*.5,(last.y+py)*.5,this.water).depth>=.4)){if(count>=budget)return count;emit(last.x,last.y,px,py,last.z,z,data[i+5]*.42,alpha*Math.sqrt(mask*last.mask));count++;}
          last={x:px,y:py,z,mask};
        }
      }return count;
    }
    spray(emit,budget=CAPACITY){const v=this.view,sea=v.battle.sea,time=v.visualTime;let count=0;
      for(const s of v.battle.ships){
        if(s.hp<=0)continue;const p=v.poses[s.id],speed=Math.hypot(s.vx,s.vy),power=smooth(2,Math.max(8,s.speed*.8),speed);
        if(!p||power<.025||!v.visible(p.x,p.y,(s.length+s.width*2)*v.zoom*v.baseScale))continue;
        const c=Math.cos(p.angle),sn=Math.sin(p.angle),small=clamp(Math.sqrt(12/s.length),.4,1.4),drop=clamp(-(s.sea?.vz||0)/5,0,1);
        const strength=power*(.52+small*.27+drop*.35),spread=Math.max(.8,s.width*.42)*power,reach=Math.max(1.2,s.length*.20);
        for(const side of [-1,1])for(let lane=0;lane<4;lane++){
          // All outlets sit outside the hull's forward shoulder. The fan opens
          // farther outboard as it falls, so spray never crosses the deck.
          const along=s.length*(.36-lane*.025),across=(s.width*(.32+lane*.025)+.08)*side;
          const bx=p.x+c*along-sn*across,by=p.y+sn*along+c*across,bh=this.height(bx,by);if(bh===null)continue;
          const hull=(p.z||0)+(p.pitch||0)*along+(p.roll||0)*across,contact=clamp(1-(hull-bh)/Math.max(.7,s.width*.25),.12,1);
          const flutter=v.reduced?1:.86+.14*Math.sin(time*(7+lane)+s.id*2.3+side+lane*2.1),lift=Math.min(2.4,Math.max(.45+small*.35,s.width*.13))*strength*(.65+lane*.16)*flutter;
          let last=null;
          for(let j=0;j<=4;j++){
            const t=j/4,back=reach*t*(.45+lane*.13),out=spread*t*(.48+lane*.22)*side,x=bx-c*back-sn*out,y=by-sn*back+c*out,h=this.height(x,y);
            if(h===null){last=null;continue;}const z=h+.05+Math.sin(Math.PI*t)*lift;
            if(last&&(!sea.field||sea.field.sample((last.x+x)*.5,(last.y+y)*.5,this.water).depth>=.4)){if(count>=budget)return count;const opacity=strength*contact*(.50-lane*.07)*(1-t*.65),width=Math.max(.12,s.width*.025)*(1-t*.55);emit(last.x,last.y,x,y,last.z,z,width,opacity);count++;}
            last={x,y,z};
          }
        }
      }return count;
    }
    draw(){const v=this.view;if(!v.battle.sea)return 0;let count=0;
      let crests=0,spray=0;
      if(v.gl){const gl=v.gl,b=this.batch;b.count=0;const emit=(x,y,ex,ey,z,ez,width,alpha)=>b.add(x-v.camera.x,y-v.camera.y,ex-v.camera.x,ey-v.camera.y,z,ez,width,alpha);spray=this.spray(emit);crests=this.crests(emit,CAPACITY-spray);v.uniforms(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);count=b.draw();gl.depthMask(true);gl.disable(gl.BLEND);}
      else{
        const c=v.fallback,points=this.path,scale=v.zoom*v.baseScale;let length=0,lastX=0,lastY=0,lastZ=0;
        c.save();c.fillStyle='#c0e2df';
        // One filled ribbon per connected arc avoids the doubled alpha of
        // round caps at every short segment. Its ends narrow with the foam.
        const flush=()=>{
          if(length<2){length=0;return;}let peak=0;for(let n=0;n<length;n++)peak=Math.max(peak,points[n*4+3]);
          c.globalAlpha=peak*.72;c.beginPath();
          for(const side of [1,-1])for(let j=0;j<length;j++){
            const n=side===1?j:length-1-j,i=n*4,a=Math.max(0,n-1)*4,b=Math.min(length-1,n+1)*4,dx=points[b]-points[a],dy=points[b+1]-points[a+1],d=Math.hypot(dx,dy)||1;
            const half=Math.max(.25,points[i+2]*scale*.34)*Math.sqrt(points[i+3]/Math.max(.001,peak)),x=points[i]-dy/d*half*side,y=points[i+1]+dx/d*half*side;
            if(side===1&&j===0)c.moveTo(x,y);else c.lineTo(x,y);
          }c.closePath();c.fill();length=0;
        };
        const emit=(x,y,ex,ey,z,ez,width,alpha)=>{
          if(length&&(x!==lastX||y!==lastY||z!==lastZ||length===64))flush();
          if(!length){const a=v.project(x,y,z);points.set([a.x,a.y,width,alpha],0);length=1;}
          const b=v.project(ex,ey,ez);points.set([b.x,b.y,width,alpha],length++*4);lastX=ex;lastY=ey;lastZ=ez;count++;
        };
        spray=this.spray(emit);flush();crests=this.crests(emit,CAPACITY-spray);flush();c.restore();
      }
      v.stats.waveCrests=crests;v.stats.bowSpraySegments=spray;
      v.stats.waveBytes=v.battle.sea.bytes+(this.batch?.data.byteLength||0)+(this.batch?.tilts.byteLength||0)+(this.path?.byteLength||0);return count?1:0;
    }
    background(){const v=this.view,sea=v.battle.sea;if(!sea)return;const w=Math.min(200,Math.ceil(v.width/4)),h=Math.min(120,Math.ceil(v.height/4)),scale=v.zoom*v.baseScale;
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.pixels=this.ctx.createImageData(w,h);}
      const pixels=this.pixels.data;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=O.unproject(((x+.5)/w-.5)*v.width/scale,((y+.5)/h-.5)*v.height/scale),wx=p.x+v.camera.x,wy=p.y+v.camera.y;
        const water=sea.field?.sample(wx,wy,this.water),depth=water?.depth??22,salt=water?.salinity??1,q=this.sample;let px=wx,py=wy;
        // Two inverse-viewing-ray steps put lit crests underneath the hulls'
        // displaced world positions, using the same coefficients as WebGL.
        for(let n=0;n<3;n++){W.sample(px,py,v.visualTime,depth,salt,!sea.field,q);const offset=q.height*sea.strength*1.22474487;if(n<2){px=wx+offset;py=wy+offset;}}
        const height=q.height*sea.strength,dx=q.dx*sea.strength,dy=q.dy*sea.strength,shelf=Math.exp(-Math.max(0,depth)*.075),lift=height/(.3+q.exposure*2.5),face=(-dx*-.6-dy*-.8+.9)/(Math.hypot(dx,dy,1)*Math.hypot(.6,.8,.9));
        const shoulder=smooth(-.08,.24,-dx-dy)*q.exposure,light=.74+face*.32+lift*.18,crest=height/(.2+q.exposure*2.6),broken=.5+.25*Math.sin(px*.12+py*.035)+.25*Math.sin(py*.10-px*.045);
        const ridge=1-smooth(.025,.09,Math.abs((dx+dy)*.7071)),foam=smooth(.90,1.08,crest)*ridge*smooth(.58,.82,broken)*q.exposure*.20,at=(y*w+x)*4;
        pixels[at]=((10+8*shelf+7*(1-salt))*light+shoulder*8)*(1-foam)+193*foam;
        pixels[at+1]=((43+24*shelf+9*(1-salt))*light+shoulder*20)*(1-foam)+225*foam;
        pixels[at+2]=((65+22*shelf)*light+shoulder*24)*(1-foam)+221*foam;pixels[at+3]=255;
      }
      this.ctx.putImageData(this.pixels,0,0);v.fallback.drawImage(this.canvas,0,0,v.width,v.height);
    }
    dispose(){if(this.view.gl){this.batch.dispose();this.view.gl.deleteProgram(this.program);}}
  }
  root.WidewakeWaveView={Surface};
})(globalThis);
