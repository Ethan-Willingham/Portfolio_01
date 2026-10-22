/* Bounded wake crests and the Canvas sea, both using the physical wave field. */
(function(root){
  'use strict';
  const O=root.WidewakeOcean,W=root.WidewakeWaves;
  const vertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;
    uniform vec2 uSize;uniform float uZoom;out float across;out float opacity;
    void main(){float t=aPosition.x*.5+.5;vec2 delta=aWorld.zw-aWorld.xy,n=normalize(vec2(-delta.y,delta.x));vec2 p=mix(aWorld.xy,aWorld.zw,t)+n*aPosition.y*aPose.z;
      float z=mix(aPose.x,aPose.y,t);vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+z*.5)/20000.,-.99,.99),1.);across=aPosition.y;opacity=aPose.w;}`;
  const fragment=`#version 300 es
    precision highp float;in float across;in float opacity;out vec4 color;
    void main(){float rim=exp(-across*across*8.);color=vec4(mix(vec3(.035,.16,.23),vec3(.52,.78,.79),rim),opacity*(.1+rim*.9));}`;
  class Surface{
    constructor(view){this.view=view;this.sample={};this.water={};if(view.gl){this.program=O.program(view.gl,vertex,fragment);this.batch=new O.Batch(view.gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),8192,true);}else{this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d');}}
    crests(emit){const v=this.view,sea=v.battle.sea;if(!sea)return;const data=sea.wake,time=v.visualTime;
      for(let n=0;n<sea.count;n++){
        const i=n*8,age=time-data[i+2];if(age<0||age>W.LIFE)continue;const r=data[i+4]+age*3.5,x=data[i],y=data[i+1],a=data[i+3]+Math.PI,alpha=(1-age/W.LIFE)**2*data[i+6]*.8*sea.strength;
        if(alpha<.004||!v.visible(x,y,(r+4)*v.zoom*v.baseScale))continue;
        const steps=Math.min(48,Math.max(12,Math.ceil(r*v.zoom*v.baseScale/2)));let last=null;
        for(let j=0;j<=steps;j++){const angle=a+(j/steps-.5)*3.4,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r,w=sea.field?.sample(px,py,this.water);
          if(w&&w.depth<.4){last=null;continue;}
          const q=W.sample(px,py,time,w?.depth??22,w?.salinity??1,!sea.field,this.sample),z=q.height*sea.strength+data[i+6]*(1-age/W.LIFE)**2*sea.strength+.04;
          if(last)emit(last.x,last.y,px,py,last.z,z,data[i+5]*.4,alpha*Math.sin(Math.PI*(j-.5)/steps));last={x:px,y:py,z};
        }
      }
    }
    draw(){const v=this.view;if(!v.battle.sea)return 0;let count=0;
      if(v.gl){const gl=v.gl,b=this.batch;b.count=0;this.crests((x,y,ex,ey,z,ez,width,alpha)=>b.add(x-v.camera.x,y-v.camera.y,ex-v.camera.x,ey-v.camera.y,z,ez,width,alpha));v.uniforms(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);count=b.draw();gl.depthMask(true);gl.disable(gl.BLEND);v.stats.waveCrests=b.count;}
      else{const c=v.fallback;c.save();c.lineCap='round';this.crests((x,y,ex,ey,z,ez,width,alpha)=>{const a=v.project(x,y,z),b=v.project(ex,ey,ez);c.globalAlpha=alpha;c.strokeStyle='#94c8cb';c.lineWidth=Math.max(.5,width*v.zoom*v.baseScale);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();count++;});c.restore();v.stats.waveCrests=count;}
      v.stats.waveBytes=v.battle.sea.bytes+(this.batch?.data.byteLength||0)+(this.batch?.tilts.byteLength||0);return count?1:0;
    }
    background(){const v=this.view,sea=v.battle.sea;if(!sea)return;const w=Math.min(240,Math.ceil(v.width/3)),h=Math.min(160,Math.ceil(v.height/3)),scale=v.zoom*v.baseScale;
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.pixels=this.ctx.createImageData(w,h);}
      const pixels=this.pixels.data;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=O.unproject(((x+.5)/w-.5)*v.width/scale,((y+.5)/h-.5)*v.height/scale);p.x+=v.camera.x;p.y+=v.camera.y;const water=sea.field?.sample(p.x,p.y,this.water),depth=water?.depth??22,salt=water?.salinity??1,q=W.sample(p.x,p.y,v.visualTime,depth,salt,!sea.field,this.sample),shelf=Math.exp(-Math.max(0,depth)*.075),lift=q.height/(.25+q.exposure*1.5),light=.94+lift*.13+Math.max(0,-q.dx-q.dy)*1.1,at=(y*w+x)*4;
        pixels[at]=(10+8*shelf+7*(1-salt))*light;pixels[at+1]=(43+24*shelf+9*(1-salt))*light;pixels[at+2]=(65+22*shelf)*light;pixels[at+3]=255;
      }
      this.ctx.putImageData(this.pixels,0,0);v.fallback.drawImage(this.canvas,0,0,v.width,v.height);
    }
    dispose(){if(this.view.gl){this.batch.dispose();this.view.gl.deleteProgram(this.program);}}
  }
  root.WidewakeWaveView={Surface};
})(globalThis);
