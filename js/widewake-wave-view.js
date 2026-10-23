/* Bounded bow spray and the Canvas sea, using the physical wave field. */
(function(root){
  'use strict';
  const O=root.WidewakeOcean,W=root.WidewakeWaves,CAPACITY=8192,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  const vertex=`#version 300 es
    precision highp float;layout(location=0)in vec2 aPosition;layout(location=2)in vec4 aWorld;layout(location=3)in vec4 aPose;
    uniform vec2 uSize;uniform float uZoom;out float across;out float along;out float opacity;
    void main(){float t=aPosition.x*.5+.5;vec2 delta=aWorld.zw-aWorld.xy,n=normalize(vec2(-delta.y,delta.x));vec2 p=mix(aWorld.xy,aWorld.zw,t)+n*aPosition.y*aPose.z;
      float z=mix(aPose.x,aPose.y,t);vec2 screen=vec2((p.x-p.y)*.70710678,(p.x+p.y)*.35355339-z*.8660254)*uZoom;
      gl_Position=vec4(screen.x/uSize.x*2.,-screen.y/uSize.y*2.,clamp(-((p.x+p.y)*.6123724+z*.5)/20000.,-.99,.99),1.);across=aPosition.y;along=t;opacity=aPose.w;}`;
  const fragment=`#version 300 es
    precision highp float;in float across;in float along;in float opacity;out vec4 color;
    void main(){float rim=exp(-across*across*6.);if(opacity<0.){float cell=exp(-across*across*3.-pow((along-.5)*2.,2.)*3.);color=vec4(.76,.87,.83,-opacity*cell);}
      else color=vec4(mix(vec3(.035,.16,.23),vec3(.78,.91,.90),rim),opacity*(.08+rim*.92));}`;
  class FoamField{
    constructor(){this.capacity=256;this.data=new Float64Array(this.capacity*10);this.cursor=0;this.lastTick=-1;this.lastTime=-1;this.water={};this.wave={};this.clear();}
    clear(){for(let i=0;i<this.capacity;i++)this.data[i*10+2]=-1e9;this.cursor=0;this.lastTick=-1;}
    update(v){const time=v.visualTime,sea=v.battle.sea;if(time===this.lastTime)return;if(time<this.lastTime)this.clear();this.lastTime=time;
      const tick=Math.floor(time*4);if(tick===this.lastTick||!sea)return;this.lastTick=tick;if(sea.strength===0)return;
      // At most about 400 candidates per quarter-second, regardless of zoom.
      // World cells choose irregular birth sites; only actual breaking crests
      // or exposed shallow arrivals can emit. No river-bank foam generator.
      const scale=v.zoom*v.baseScale,extent=(v.width/.70710678+v.height/.35355339)/(4*scale),step=Math.max(12,extent/10),born=tick*.25;
      const left=Math.floor((v.camera.x-extent)/step),right=Math.ceil((v.camera.x+extent)/step),top=Math.floor((v.camera.y-extent)/step),bottom=Math.ceil((v.camera.y+extent)/step);
      for(let iy=top;iy<bottom;iy++)for(let ix=left;ix<right;ix++){
        let seed=(Math.imul(ix,73856093)^Math.imul(iy,19349663)^Math.imul(tick,83492791))>>>0;
        const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        const x=(ix+.12+random()*.76)*step,y=(iy+.12+random()*.76)*step;if(!v.visible(x,y,20*scale))continue;
        const water=sea.field?.sample(x,y,this.water),depth=water?.depth??22;if(depth<.3)continue;
        const q=sea.at(x,y,born,this.wave,-1,false),ridge=q.dx*-.14865+q.dy*-.98889;
        const crest=smooth(.75,1.8,q.height)*smooth(.35,.85,q.exposure)*(1-smooth(.018,.075,Math.abs(ridge)));
        const incoming=q.exposure/Math.max(.01,smooth(.2,8,depth)),shore=smooth(.3,.8,depth)*(1-smooth(1.1,3.5,depth))*incoming*smooth(.04,.35,q.height);
        const strength=Math.max(crest,shore);if(random()>strength*.65)continue;
        const at=this.cursor*10;this.cursor=(this.cursor+1)%this.capacity;
        this.data.set([x,y,born,1.8+random()*2.4,(water?.currentX??.15)+q.vx*.18,(water?.currentY??.1)+q.vy*.18,4+random()*8,Math.atan2(-.14865,.98889)+(random()-.5)*.45,random()*1000,.45+strength*.5],at);
      }
    }
    emit(surface,emit,budget){const v=surface.view,time=v.visualTime,d=this.data;let count=0,patches=0;
      for(let i=0;i<this.capacity;i++){const at=i*10,age=time-d[at+2],life=d[at+3];if(age<=0||age>=life)continue;
        const x=d[at]+d[at+4]*age,y=d[at+1]+d[at+5]*age,span=d[at+6],angle=d[at+7],seed=d[at+8],c=Math.cos(angle),sn=Math.sin(angle);
        if(!v.visible(x,y,(span+age)*v.zoom*v.baseScale+4))continue;patches++;
        const fade=smooth(0,.18,age)*Math.pow(1-age/life,1.7)*d[at+9],spread=1+age*.22;
        for(let strand=0;strand<6;strand++){
          const n=.5+.5*Math.sin(seed+strand*17.3),m=.5+.5*Math.sin(seed*1.7+strand*7.1),phase=seed+strand*2.3;
          if(age>life*(.65+n*.35))continue;let last=null;
          for(let j=0;j<2;j++){
            const along=(n-.5)*span*spread+(j-.5)*(.5+n*n*2.8),across=(m-.5)*(1+age*.6)+Math.sin(phase+age*.6)*(.15+age*.10)+(j-.5)*Math.sin(phase)*.55;
            const px=x+c*along-sn*across,py=y+sn*along+c*across,h=surface.height(px,py);
            if(h===null){last=null;continue;}
            if(last&&(!v.battle.sea.field||v.battle.sea.field.sample((last.x+px)*.5,(last.y+py)*.5,surface.water).depth>=.3)){if(count>=budget){v.stats.seaFoamPatches=patches;return count;}emit(last.x,last.y,px,py,last.z,h+.08,(.28+m*.55)*(1+age*.08),-fade*(.60+m*.35));count++;}
            last={x:px,y:py,z:h+.08};
          }
        }
      }v.stats.seaFoamPatches=patches;return count;
    }
  }
  class Surface{
    constructor(view){this.view=view;this.sample={};this.swell={};this.water={};this.foam=view.foam||(view.foam=new FoamField());if(view.gl){this.program=O.program(view.gl,vertex,fragment);this.batch=new O.Batch(view.gl,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),CAPACITY,true);}else{this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d');this.path=new Float64Array(64*4);}}
    height(x,y){const sea=this.view.battle.sea,w=sea.field?.sample(x,y,this.water);if(w&&w.depth<.4)return null;return sea.at(x,y,this.view.visualTime,this.sample,-1,false).height;}
    bindEnvironment(program){const gl=this.view.gl,env=this.view.battle.sea?.environment;gl.uniform1i(gl.getUniformLocation(program,'uEnvironmentEnabled'),env?1:0);if(!env)return;
      if(!this.environmentTexture){this.environmentTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.environmentTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,env.width,env.height,0,gl.RGBA,gl.FLOAT,env.complete());gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.environmentTexture);gl.uniform1i(gl.getUniformLocation(program,'uEnvironment'),3);
    }
    spray(emit,budget=CAPACITY){const v=this.view,sea=v.battle.sea,time=v.visualTime;let count=0;
      for(const s of v.battle.ships){
        if(s.hp<=0||s.sea?.airborne)continue;const p=v.poses[s.id],speed=Math.hypot(s.vx,s.vy),power=smooth(2,Math.max(8,s.speed*.8),speed);
        if(!p||power<.025||!v.visible(p.x,p.y,(s.length+s.width*2)*v.zoom*v.baseScale))continue;
        const c=Math.cos(p.angle),sn=Math.sin(p.angle),small=clamp(Math.sqrt(12/s.length),.4,1.4),drop=clamp(-(s.sea?.vz||0)/5,0,1);
        const strength=power*(.52+small*.27+drop*.35),spread=Math.max(.8,s.width*.42)*power,reach=Math.max(1.2,s.length*.20);
        for(const side of [-1,1])for(let lane=0;lane<4;lane++){
          // All outlets sit outside the hull's forward shoulder. The fan opens
          // farther outboard as it falls, so spray never crosses the deck.
          const along=s.length*(.36-lane*.025),across=(s.width*(.32+lane*.025)+.08)*side;
          const bx=p.x+c*along-sn*across,by=p.y+sn*along+c*across,bh=this.height(bx,by);if(bh===null)continue;
          const hull=(p.z||0)+(p.pitch||0)*along+(p.roll||0)*across,draft=s.draft||s.width*.18;
          const contact=smooth(0,Math.max(.15,draft*.65),bh-hull+draft*.45);if(contact<.025)continue;
          const flutter=v.reduced?1:.78+.22*Math.sin(time*(7+lane)+s.id*2.3+side*1.7+lane*2.1),lift=Math.min(2.4,Math.max(.45+small*.35,s.width*.13))*strength*contact*(.65+lane*.16)*flutter;
          let last=null;
          for(let j=0;j<=4;j++){
            const t=j/4,back=reach*t*(.45+lane*.13),out=spread*t*(.48+lane*.22)*side*flutter,x=bx-c*back-sn*out,y=by-sn*back+c*out,h=this.height(x,y);
            if(h===null){last=null;continue;}const z=h+.05+Math.sin(Math.PI*t)*lift;
            if(last&&(!sea.field||sea.field.sample((last.x+x)*.5,(last.y+y)*.5,this.water).depth>=.4)){if(count>=budget)return count;const opacity=strength*contact*(.50-lane*.07)*(1-t*.65),width=Math.max(.12,s.width*.025)*(1-t*.55);emit(last.x,last.y,x,y,last.z,z,width,opacity);count++;}
            last={x,y,z};
          }
        }
      }return count;
    }
    landings(emit,budget=CAPACITY){const v=this.view,time=v.visualTime;let count=0;
      for(const s of v.battle.ships){const q=s.sea,age=time-(q?.landAt??-100);if(!q||s.hp<=0||age<0||age>.85||!(q.impact>0)||!v.visible(q.landX,q.landY,100))continue;
        const c=Math.cos(q.landAngle),sn=Math.sin(q.landAngle),power=clamp(q.impact/11,.35,1),fade=(1-age/.85)**1.3;
        // Broken sheets burst out of both shoulders at the actual contact point.
        // Their origin stays on the water after the boat has driven away.
        for(const side of [-1,1])for(let lane=0;lane<12;lane++){
          const noise=((lane*37+(side+1)*13)%23)/23,grain=((lane*13+7)%19)/19,angle=side*(.55+noise*1.8),jet=11+power*13*(.65+grain*.6),lift=4+power*4*(.6+noise);let last=null;
          for(let j=0;j<3;j++){
            const t=Math.max(0,age-(2-j)*(.005+grain*.008))*(.8+noise*.4),along=s.length*.12+Math.cos(angle)*jet*t+q.landSpeed*t*.10,across=side*s.width*.52+Math.sin(angle)*jet*t,x=q.landX+c*along-sn*across,y=q.landY+sn*along+c*across,h=this.height(x,y);
            if(h===null){last=null;continue;}const z=h+.08+Math.max(0,lift*t-7.5*t*t);
            if(last){if(count>=budget)return count;emit(last.x,last.y,x,y,last.z,z,(.11+power*.12)*(.5+noise),(.45+grain*.4)*fade*power);count++;}last={x,y,z};
          }
          // Uneven low froth connects the falling droplets to their impact.
          const along=(noise-.5)*s.length*.5+q.landSpeed*age*.08,across=side*(s.width*.32+age*(2+power*4)*grain),x=q.landX+c*along-sn*across,y=q.landY+sn*along+c*across,a=q.landAngle+(grain-.5)*1.6,ex=x-Math.cos(a)*(.3+power*.6),ey=y-Math.sin(a)*(.3+power*.6),h=this.height(x,y),eh=this.height(ex,ey);
          if(h!==null&&eh!==null){if(count>=budget)return count;emit(x,y,ex,ey,h+.08,eh+.08,(.20+power*.35)*(.6+noise*.8),fade*power*(.30+grain*.35));count++;
          }
        }
      }return count;
    }
    draw(){const v=this.view;if(!v.battle.sea)return 0;let count=0;
      let spray=0,splash=0,foam=0;this.foam.update(v);
      if(v.gl){const gl=v.gl,b=this.batch;b.count=0;const emit=(x,y,ex,ey,z,ez,width,alpha)=>b.add(x-v.camera.x,y-v.camera.y,ex-v.camera.x,ey-v.camera.y,z,ez,width,alpha);spray=this.spray(emit);splash=this.landings(emit,CAPACITY-spray);foam=this.foam.emit(this,emit,CAPACITY-spray-splash);v.uniforms(this.program);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);count=b.draw();gl.depthMask(true);gl.disable(gl.BLEND);}
      else{
        const c=v.fallback,points=this.path,scale=v.zoom*v.baseScale;let length=0,lastX=0,lastY=0,lastZ=0;
        c.save();c.fillStyle='#061b22';c.globalAlpha=.22;
        for(const s of v.battle.ships){const p=v.poses[s.id];if(s.hp<=0||!p||!v.visible(p.x,p.y,100))continue;const h=this.height(p.x,p.y);if(h===null)continue;
          const gap=Math.max(0,(p.z||0)-h),q=v.project(p.x+gap*.3,p.y+gap*.42,h+.08),heading=Math.atan2((Math.cos(p.angle)+Math.sin(p.angle))*.35355339,(Math.cos(p.angle)-Math.sin(p.angle))*.70710678);
          c.beginPath();c.ellipse(q.x,q.y,Math.max(1,s.length*scale*.36),Math.max(1,s.width*scale*.20),heading,0,Math.PI*2);c.fill();count++;
        }c.restore();
        c.save();c.fillStyle='#c0e2df';
        // One filled ribbon per connected spray fan avoids doubled alpha at
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
          // Negative alpha marks a free foam cell with soft ends, rather than
          // a connected spray ribbon. Both backends draw the same born cells.
          if(alpha<0){flush();const a=v.project(x,y,z),b=v.project(ex,ey,ez),length=Math.max(.2,Math.hypot(b.x-a.x,b.y-a.y)*.5);c.save();c.translate((a.x+b.x)*.5,(a.y+b.y)*.5);c.rotate(Math.atan2(b.y-a.y,b.x-a.x));c.scale(length,Math.max(.2,width*scale*.65));const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(194,222,212,1)');g.addColorStop(.5,'rgba(194,222,212,.45)');g.addColorStop(1,'rgba(194,222,212,0)');c.fillStyle=g;c.globalAlpha=-alpha;c.beginPath();c.arc(0,0,1,0,Math.PI*2);c.fill();c.restore();count++;return;}
          if(length&&(x!==lastX||y!==lastY||z!==lastZ||length===64))flush();
          if(!length){const a=v.project(x,y,z);points.set([a.x,a.y,width,alpha],0);length=1;}
          const b=v.project(ex,ey,ez);points.set([b.x,b.y,width,alpha],length++*4);lastX=ex;lastY=ey;lastZ=ez;count++;
        };
        spray=this.spray(emit);flush();splash=this.landings(emit,CAPACITY-spray);flush();foam=this.foam.emit(this,emit,CAPACITY-spray-splash);flush();c.restore();
      }
      // Pressure packets still rock nearby boats, but never draw circular rings.
      v.stats.waveCrests=0;v.stats.bowSpraySegments=spray;v.stats.landingSplashSegments=splash;v.stats.seaFoamSegments=foam;v.stats.foamBytes=this.foam.data.byteLength;
      v.stats.environmentBytes=v.battle.sea.environment?v.battle.sea.environment.data.byteLength+v.battle.sea.environment.ready.byteLength:0;
      v.stats.waveBytes=v.battle.sea.bytes+(this.batch?.data.byteLength||0)+(this.batch?.tilts.byteLength||0)+(this.path?.byteLength||0);return count?1:0;
    }
    background(){const v=this.view,sea=v.battle.sea;if(!sea)return;const w=Math.min(200,Math.ceil(v.width/4)),h=Math.min(120,Math.ceil(v.height/4)),scale=v.zoom*v.baseScale;
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.pixels=this.ctx.createImageData(w,h);}
      const pixels=this.pixels.data;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=O.unproject(((x+.5)/w-.5)*v.width/scale,((y+.5)/h-.5)*v.height/scale),wx=p.x+v.camera.x,wy=p.y+v.camera.y;
        const water=sea.field?.sample(wx,wy,this.water),depth=water?.depth??22,salt=water?.salinity??1,q=this.sample;let px=wx,py=wy;
        sea.at(px,py,v.visualTime,q,-1,false);let height=q.height;
        for(let n=0;n<2;n++){sea.at(wx+height*1.22474487,wy+height*1.22474487,v.visualTime,q,-1,false);height+=clamp((q.height-height)/Math.max(.22,1-1.22474487*(q.dx+q.dy)),-3,3);}
        px=wx+height*1.22474487;py=wy+height*1.22474487;sea.at(px,py,v.visualTime,q,-1,false);height=q.height;
        const dx=q.dx*1.45,dy=q.dy*1.45,norm=Math.hypot(dx,dy,1),ndv=clamp((.5-.61237244*(dx+dy))/norm,0,1),fresnel=.13+.85*(.02+.98*(1-ndv)**5),face=(.42*dx+.55*dy+.72)/norm,light=.78+.30*face+.14*smooth(-2.6,1.5,height),shelf=Math.exp(-Math.max(0,depth)*.075);
        const at=(y*w+x)*4;
        const flowX=water?.currentX||0,flowY=water?.currentY||0,ripple=Math.sin((px-flowX*v.visualTime)*1.3+(py-flowY*v.visualTime)*.8)*Math.sin((px-flowX*v.visualTime)*.28-(py-flowY*v.visualTime)*.73)*Math.min(1,scale)*1.5;
        pixels[at]=((10+8*shelf+7*(1-salt))*light*(1-fresnel)+105*fresnel+ripple);
        pixels[at+1]=((46+24*shelf+9*(1-salt))*light*(1-fresnel)+153*fresnel+ripple);
        pixels[at+2]=((64+22*shelf)*light*(1-fresnel)+171*fresnel+ripple);pixels[at+3]=255;
      }
      this.ctx.putImageData(this.pixels,0,0);v.fallback.drawImage(this.canvas,0,0,v.width,v.height);
    }
    dispose(){if(this.view.gl){this.batch.dispose();this.view.gl.deleteProgram(this.program);this.view.gl.deleteTexture(this.environmentTexture);}}
  }
  root.WidewakeWaveView={Surface,FoamField};
})(globalThis);
