/* A linked pair of massive jaws and a local elastic gel. The pointer pulls a
 * spring; it never assigns the jaw or gel pose. All lengths are world pixels. */
(function(root){
  'use strict';
  function create(b,options){
    var center=360,home=212,min=24,half=8,top=164,bottom=370;
    var q=home,oldQ=q,velocity=0,target=q,held=false,side=1,offset=0;
    var mass=28,invJaw=1/mass,dt=1/360,steps=0,contacts=0,reaction=0;
    var edgeLambda=new Float64Array(b.springN),areaLambda=new Float64Array(b.triN);
    var signedArea=new Float64Array(b.triN),previousArea=-1,pointMass=1;
    var lastX=new Float64Array(b.n),lastY=new Float64Array(b.n);
    var dryArea=b.restArea,gripLambda=0,returnLambda=0;
    var pressure=0,contactTop=bottom,contactBottom=top,axialReaction=0;
    var recoilX=0,recoilY=0;
    function clamp(v,a,c){return Math.max(a,Math.min(c,v));}
    function material(){
      if(previousArea===b.restArea)return;
      previousArea=b.restArea;pointMass=b.restArea/(b.n*180);
      for(var t=0;t<b.triN;t++){
        var a=b.triA[t],c=b.triB[t],d=b.triC[t];
        signedArea[t]=((b.rx[c]-b.rx[a])*(b.ry[d]-b.ry[a])-(b.ry[c]-b.ry[a])*(b.rx[d]-b.rx[a]))*.5;
      }
    }
    function begin(h,timescale){
      dt=h/timescale;material();lastX.set(b.ox);lastY.set(b.oy);
      oldQ=q;q+=velocity*dt;
      edgeLambda.fill(0);areaLambda.fill(0);gripLambda=returnLambda=0;
      contacts=0;reaction=0;axialReaction=0;contactTop=bottom;contactBottom=top;steps++;
    }
    function spring(rest,stiffness,lambda){
      var alpha=1/(stiffness*dt*dt),dl=(-(q-rest)-alpha*lambda)/(invJaw+alpha);
      q+=invJaw*dl;return lambda+dl;
    }
    function elastic(){
      var inv=1/pointMass,alpha=1/(240*dt*dt);
      // Central nonlinear springs store shear/stretch energy. Increasing
      // tangent stiffness at large strain prevents indefinitely thin threads.
      for(var s=0;s<b.springN;s++){
        var a=b.sA[s],c=b.sB[s],dx=b.px[c]-b.px[a],dy=b.py[c]-b.py[a];
        var length=Math.sqrt(dx*dx+dy*dy),rest=b.sRest[s];if(length<1e-9)continue;
        var strain=(length-rest)/rest,hard=3*strain*strain,root=Math.sqrt(1+hard);
        var C=(length-rest)*root,gradient=(1+2*hard)/root;
        var dl=(-C-alpha*edgeLambda[s])/(2*inv*gradient*gradient+alpha);
        edgeLambda[s]+=dl;var move=inv*dl*gradient/length;
        b.px[a]-=dx*move;b.py[a]-=dy*move;b.px[c]+=dx*move;b.py[c]+=dy*move;
      }
      // Local signed area constraints resist compression and triangle
      // inversion. A single outline-area spring cannot protect the interior.
      for(var t=0;t<b.triN;t++){
        var i=b.triA[t],j=b.triB[t],k=b.triC[t],restA=signedArea[t];
        var gx=(b.py[j]-b.py[k])*.5,gy=(b.px[k]-b.px[j])*.5;
        var hx=(b.py[k]-b.py[i])*.5,hy=(b.px[i]-b.px[k])*.5;
        var ix=-gx-hx,iy=-gy-hy;
        var area=((b.px[j]-b.px[i])*(b.py[k]-b.py[i])-(b.py[j]-b.py[i])*(b.px[k]-b.px[i]))*.5;
        var aVol=Math.abs(restA)/(220000*dt*dt);
        var den=inv*(gx*gx+gy*gy+hx*hx+hy*hy+ix*ix+iy*iy);
        var impulse=(-(area-restA)-aVol*areaLambda[t])/(den+aVol);
        areaLambda[t]+=impulse;
        b.px[i]+=inv*gx*impulse;b.py[i]+=inv*gy*impulse;
        b.px[j]+=inv*hx*impulse;b.py[j]+=inv*hy*impulse;
        b.px[k]+=inv*ix*impulse;b.py[k]+=inv*iy*impulse;
      }
    }
    function collide(){
      var inv=1/pointMass;
      for(var i=0;i<b.n;i++)for(var s=-1;s<=1;s+=2){
        var x=center+s*q,dx=b.px[i]-x,y=b.py[i];
        if(Math.abs(dx)>=half+.6 || y<=top-.6 || y>=bottom+.6)continue;
        // Select the entering face from the previous pose before falling back
        // to minimum translation. This also catches a fast jaw closing on skin.
        var oldDX=lastX[i]-(center+s*oldQ),nx=0,ny=0,depth=0;
        if(Math.abs(oldDX)>=half){nx=oldDX<0?-1:1;depth=half+.6-dx*nx;}
        else if(lastY[i]<=top){ny=-1;depth=y-top+.6;}
        else if(lastY[i]>=bottom){ny=1;depth=bottom-y+.6;}
        else {
          depth=half+.6-Math.abs(dx);nx=dx<0?-1:1;
          if(y-top+.6<depth){depth=y-top+.6;nx=0;ny=-1;}
          if(bottom-y+.6<depth){depth=bottom-y+.6;nx=0;ny=1;}
        }
        if(!(depth>0))continue;
        var jawGradient=-nx*s,dl=depth/(inv+invJaw*jawGradient*jawGradient);
        b.px[i]+=inv*nx*dl;b.py[i]+=inv*ny*dl;q+=invJaw*jawGradient*dl;
        // Coulomb friction removes only relative tangent displacement, with
        // the same effective mass and a bound from this contact's normal load.
        var tx=-ny,ty=nx,jt=-tx*s;
        var slip=(b.px[i]-lastX[i])*tx+(b.py[i]-lastY[i])*ty+jt*(q-oldQ);
        var friction=clamp(-slip/(inv+invJaw*jt*jt),-.28*dl,.28*dl);
        b.px[i]+=inv*tx*friction;b.py[i]+=inv*ty*friction;q+=invJaw*jt*friction;
        reaction+=Math.abs(dl);contacts++;
        if(nx*s<0){axialReaction+=dl;contactTop=Math.min(contactTop,y);contactBottom=Math.max(contactBottom,y);}
      }
    }
    function solve(){
      for(var iteration=0;iteration<4;iteration++){
        returnLambda=spring(home,110,returnLambda);
        if(held)gripLambda=spring(target,5200,gripLambda);
        q=clamp(q,min,home+4);
        elastic();options.terrain();collide();
      }
    }
    function finish(){
      // The guide absorbs transverse load. Axial reactions remain on the jaw
      // degree of freedom, so the wet gel can oppose and reopen the press.
      collide();q=clamp(q,min,home+4);
      velocity=(q-oldQ)/dt*Math.exp(-(held?10:2.6)*dt);
      velocity=clamp(velocity,-300,300);
      // Compressive jaw traction supplies pore pressure. An unloaded jaw has
      // no source of pressure, even when the pointer is held far inward.
      var load=held && target<q ? axialReaction/(dt*dt*2*Math.max(24,contactBottom-contactTop)) : 0;
      pressure+=(load-pressure)*(1-Math.exp(-dt/.045));
    }
    function outlets(){
      var vents=[];
      for(var k=0;k<8;k++){
        var r=Math.floor((k+.375)*b.ringN/8),i=b.ring[r],a=b.ring[(r+b.ringN-1)%b.ringN],j=b.ring[(r+1)%b.ringN];
        var dx=b.px[j]-b.px[a],dy=b.py[j]-b.py[a],len=Math.max(1e-6,Math.hypot(dx,dy));
        var nx=dy/len,ny=-dx/len,x=b.px[i],y=b.py[i];
        if(nx*(x-b.cx)+ny*(y-b.cy)<0){nx=-nx;ny=-ny;}
        var ex=x+nx*9,ey=y+ny*9,open=ny<.65 && ey>18 && ey<364;
        for(var s=-1;s<=1;s+=2)if(Math.abs(ex-center-s*q)<half+5 && ey>top-5 && ey<bottom+5)open=false;
        if(options.blocked && (options.blocked(ex,ey)||options.blocked(ex+nx*8,ey+ny*8)))open=false;
        vents.push({node:i,x:x,y:y,exitX:ex,exitY:ey,nx:nx,ny:ny,open:open,
          vx:(b.px[i]-b.ox[i])/dt,vy:(b.py[i]-b.oy[i])/dt});
      }
      return vents;
    }
    function recoil(k,impulseX,impulseY){
      // Return the measured jet impulse to a local material patch. Normalized
      // weights preserve the net impulse without overloading a single vertex.
      material();var i=b.ring[Math.floor((k+.375)*b.ringN/8)],weights=new Float64Array(b.n),sum=0;
      var radius=Math.max(12,b.spacing*2.5);
      for(var j=0;j<b.n;j++){var d=Math.hypot(b.px[j]-b.px[i],b.py[j]-b.py[i]);weights[j]=Math.max(0,1-d/radius);sum+=weights[j];}
      for(j=0;j<b.n;j++){var w=weights[j]/sum*dt/pointMass;b.ox[j]-=impulseX*w;b.oy[j]-=impulseY*w;}
      recoilX+=impulseX;recoilY+=impulseY;b.sleeping=false;
    }
    function hit(x,y,scale){
      var pad=Math.max(15,22/scale);
      if(y<top-pad||y>bottom+pad)return 0;
      if(Math.abs(x-(center-q))<pad)return -1;
      if(Math.abs(x-(center+q))<pad)return 1;
      return 0;
    }
    function grab(x,y,scale){var s=hit(x,y,scale);if(!s)return false;side=s;offset=s*(x-center)-q;target=q;held=true;return true;}
    function move(x){if(held)target=clamp(side*(x-center)-offset,min,home);}
    function release(){held=false;}
    function guests(time){
      return [-1,1].map(function(s){var x=center+s*q,vx=s*velocity/time;return {
        x:x,y:(top+bottom)*.5,hw:half+.7,hh:(bottom-top)*.5+.7,mvx:vx,mvy:0,
        pts:[x-half,top,vx,0,x+half,top,vx,0,x+half,bottom,vx,0,x-half,bottom,vx,0]};});
    }
    function stats(){
      var area=0,minJ=Infinity,maxStrain=0;
      for(var k=0;k<b.ringN;k++){var a=b.ring[k],c=b.ring[(k+1)%b.ringN];area+=b.px[a]*b.py[c]-b.px[c]*b.py[a];}
      for(var t=0;t<b.triN;t++){var i=b.triA[t],j=b.triB[t],l=b.triC[t];
        var A=((b.px[j]-b.px[i])*(b.py[l]-b.py[i])-(b.py[j]-b.py[i])*(b.px[l]-b.px[i]))*.5;
        if(signedArea[t])minJ=Math.min(minJ,A/signedArea[t]);}
      for(var s=0;s<b.springN;s++)maxStrain=Math.max(maxStrain,Math.abs(Math.hypot(b.px[b.sB[s]]-b.px[b.sA[s]],b.py[b.sB[s]]-b.py[b.sA[s]])/b.sRest[s]-1));
      return {q:q,home:home,min:min,center:center,half:half,top:top,bottom:bottom,gap:2*(q-half),velocity:velocity,
        held:held,target:target,mass:mass,gelMass:pointMass*b.n,contacts:contacts,reaction:reaction/(dt*dt),
        pressure:pressure,recoilX:recoilX,recoilY:recoilY,
        area:Math.abs(area)*.5,areaRatio:Math.abs(area)*.5/b.restArea,minJ:minJ,maxStrain:maxStrain,steps:steps,growth:b.restArea/dryArea};
    }
    function draw(c,colors,scale,details){
      c.save();c.lineJoin='round';
      // Two exposed springs make the force path visible. Their endpoints are
      // the actual guide stop and jaw, never an animated substitute for motion.
      [-1,1].forEach(function(s){
        var x=center+s*q,anchor=center+s*(home+38),yy=260;
        c.strokeStyle=colors.rule;c.lineWidth=2;
        c.beginPath();c.moveTo(anchor,top+34);c.lineTo(anchor,bottom);c.stroke();
        c.beginPath();c.moveTo(anchor,yy);
        for(var k=1;k<=12;k++){var t=k/13;c.lineTo(anchor+(x-anchor)*t,yy+(k%2?5:-5));}
        c.lineTo(x,yy);c.strokeStyle=colors.accent;c.lineWidth=1.2;c.stroke();
        var gradient=c.createLinearGradient(x-half,0,x+half,0);
        gradient.addColorStop(0,colors.rule);gradient.addColorStop(.45,colors.dim);gradient.addColorStop(1,colors.rule);
        c.fillStyle=gradient;c.strokeStyle=held?colors.accent:colors.dim;c.lineWidth=1/scale;
        c.beginPath();c.roundRect(x-half,top,half*2,bottom-top,5);c.fill();c.stroke();
        c.fillStyle=colors.accent;c.beginPath();c.roundRect(x-half-2,yy-24,half*2+4,48,5);c.fill();
        c.strokeStyle=colors.rule;c.lineWidth=1/scale;
        for(var line=-2;line<=2;line++){c.beginPath();c.moveTo(x-4,yy+line*6);c.lineTo(x+4,yy+line*6);c.stroke();}
        c.fillStyle=colors.text;c.font=(13/scale)+'px "Segoe UI", sans-serif';c.textAlign='center';
        if(!held)c.fillText('Drag inward',anchor,top-14/scale);
      });
      if(held){
        c.strokeStyle=colors.accent;c.globalAlpha=.35;c.lineWidth=1/scale;c.setLineDash([3/scale,4/scale]);
        c.beginPath();c.moveTo(center+side*target,top);c.lineTo(center+side*target,bottom);c.stroke();c.setLineDash([]);
      }
      // Material flecks follow local deformation. The axes come from the
      // triangle deformation gradient, exposing shear and flattening directly.
      c.globalAlpha=.34;c.fillStyle=colors.text;
      for(var t=0;t<b.triN;t+=13){
        var i=b.triA[t],j=b.triB[t],k=b.triC[t],n=t*4,D=b.triDmInv;
        var ax=b.px[j]-b.px[i],ay=b.py[j]-b.py[i],bx=b.px[k]-b.px[i],by=b.py[k]-b.py[i];
        var f00=ax*D[n]+bx*D[n+2],f01=ax*D[n+1]+bx*D[n+3];
        var f10=ay*D[n]+by*D[n+2],f11=ay*D[n+1]+by*D[n+3];
        var size=Math.min(2.2,Math.sqrt(b.restArea/dryArea)*.7);
        c.save();c.transform(f00,f10,f01,f11,(b.px[i]+b.px[j]+b.px[k])/3,(b.py[i]+b.py[j]+b.py[k])/3);
        c.beginPath();c.ellipse(0,0,size,size*.7,0,0,Math.PI*2);c.fill();c.restore();
      }
      c.globalAlpha=pressure>12?.9:.45;
      outlets().forEach(function(v){if(!v.open)return;c.save();c.translate(v.x,v.y);c.rotate(Math.atan2(v.ny,v.nx));
        c.fillStyle=colors.rule;c.beginPath();c.ellipse(0,0,1.2,pressure>12?3.2:1.8,0,0,Math.PI*2);c.fill();c.restore();});
      if(details){
        c.globalAlpha=.2;c.strokeStyle=colors.text;c.lineWidth=.7/scale;c.beginPath();
        for(var s=0;s<b.springN;s++){c.moveTo(b.px[b.sA[s]],b.py[b.sA[s]]);c.lineTo(b.px[b.sB[s]],b.py[b.sB[s]]);}c.stroke();
      }
      c.restore();
    }
    material();
    return {body:b,begin:begin,solve:solve,finish:finish,grab:grab,move:move,release:release,hit:hit,
      guests:guests,stats:stats,draw:draw,outlets:outlets,recoil:recoil,pressure:function(){return pressure;},wake:function(){b.sleeping=false;b.sleepFrames=0;}};
  }
  root.WSSSlimePress={create:create};
})(typeof window!=='undefined'?window:globalThis);
