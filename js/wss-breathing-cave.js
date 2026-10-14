/* Manually pressurized cave, neck inertia and free airflow arrows. */
(function(root){
  'use strict';
  function create(definition,world){
    var spec=definition.cave,h=world.tile,w=Math.round(world.w/h),rows=Math.round(world.h/h),n=w*rows;
    var solid=new Uint8Array(n),room=new Uint8Array(n),connected=new Uint8Array(n),source=new Uint8Array(n);
    var phi=new Float64Array(n),diag=new Float64Array(n),rhs=new Float64Array(n),residual=new Float64Array(n),
      direction=new Float64Array(n),product=new Float64Array(n),preconditioned=new Float64Array(n);
    var fx=new Float64Array(n),fy=new Float64Array(n),flowPerDepth=0;
    var version=-1,sourceCells=0,volume=0,area=0,mass=0,initialMass=0,admitted=0,escaped=0,
      seconds=0,speed=0,flow=0,outside=spec.ambientPa,pressure=outside,maxResidual=0,steps=0,unitMouthFlux=0;
    var fieldResidual=0,fieldIterations=0,error=null,initialized=false,clip=null,pumped=0;
    var insideTarget=spec.controlPressure===false?null:spec.ambientPa;
    var smoke=new Float64Array(n),smokeNext=new Float64Array(n),smokeAdded=0,smokeClicks=0,revision=0;
    var markers=[],angularTravel=0,distanceTravel=0,maxAngularStep=0,maxPositionStep=0,vane=spec.arrow;
    function inChamber(x,y){var r=spec.chamber;return x>=r.x && x<r.x+r.width && y>=r.y && y<r.y+r.height;}
    function neighbors(i,visit){
      var x=i%w,y=Math.floor(i/w);
      if(x>0)visit(i-1);if(x<w-1)visit(i+1);if(y>0)visit(i-w);if(y<rows-1)visit(i+w);
    }
    function apply(input,out){
      for(var i=0;i<n;i++){
        if(solid[i] || room[i] || !connected[i]){out[i]=0;continue;}
        var value=diag[i]*input[i];neighbors(i,function(j){if(!solid[j] && !room[j])value-=input[j];});out[i]=value;
      }
    }
    function rebuild(){
      version=world.version();clip=null;sourceCells=0;phi.fill(0);room.fill(0);connected.fill(0);source.fill(0);rhs.fill(0);diag.fill(0);
      var queue=new Int32Array(n),head=0,tail=0;
      for(var i=0;i<n;i++){
        var x=(i%w+.5)*h,y=(Math.floor(i/w)+.5)*h;solid[i]=world.solidAt(x,y)?1:0;
        if(!solid[i] && (i%w<=2 || i%w>=w-3 || Math.floor(i/w)<=2 || Math.floor(i/w)>=rows-3)){
          room[i]=1;connected[i]=1;queue[tail++]=i;
        }
      }
      while(head<tail){var at=queue[head++];neighbors(at,function(j){if(!solid[j] && !connected[j]){connected[j]=1;queue[tail++]=j;}});}
      // Chamber volume includes trapped cells even while the gate is shut.
      var allChamber=0;
      for(var k=0;k<n;k++)if(!solid[k] && inChamber((k%w+.5)*h,(Math.floor(k/w)+.5)*h)){
        allChamber++;if(connected[k]){source[k]=1;sourceCells++;}
      }
      var newVolume=allChamber*h*h*spec.depth;
      if(initialized && Math.abs(newVolume-volume)>1e-8){error='The cave chamber volume changed. Reset the scene.';flow=0;speed=0;return;}
      volume=newVolume;
      var clear=0,g=spec.gate;
      for(var gy=g.y+h*.5;gy<g.y+g.height;gy+=h)if(!world.solidAt(g.x+g.width*.5,gy))clear++;
      area=clear*h*spec.depth;
      if(!initialized){mass=initialMass=spec.ambientPa*volume/(spec.gasConstant*spec.temperature);initialized=true;}
      fx.fill(0);fy.fill(0);unitMouthFlux=0;flowPerDepth=0;
      if(!sourceCells || !(area>0)){flow=0;speed=0;return;}
      for(var c=0;c<n;c++)if(!solid[c] && !room[c] && connected[c]){
        neighbors(c,function(j){if(!solid[j])diag[c]++;});rhs[c]=source[c]/sourceCells;
      }
      // Preconditioned conjugate gradients, once per actual wall edit. The
      // right-hand side is one square meter per second of integrated flux.
      var rz=0;
      for(var r=0;r<n;r++){residual[r]=rhs[r];preconditioned[r]=diag[r]?rhs[r]/diag[r]:0;direction[r]=preconditioned[r];rz+=residual[r]*preconditioned[r];}
      for(var iteration=0;iteration<1000 && rz>1e-24;iteration++){
        apply(direction,product);var dot=0;
        for(var a=0;a<n;a++)dot+=direction[a]*product[a];
        if(!(dot>0))break;
        var alpha=rz/dot,norm=0;
        for(var b=0;b<n;b++){phi[b]+=alpha*direction[b];residual[b]-=alpha*product[b];norm+=residual[b]*residual[b];}
        fieldIterations=iteration+1;if(norm<1e-20)break;
        var newRz=0;
        for(var d=0;d<n;d++){preconditioned[d]=diag[d]?residual[d]/diag[d]:0;newRz+=residual[d]*preconditioned[d];}
        var beta=newRz/rz;for(var e=0;e<n;e++)direction[e]=preconditioned[e]+beta*direction[e];rz=newRz;
      }
      apply(phi,product);fieldResidual=0;
      for(var f=0;f<n;f++)fieldResidual=Math.max(fieldResidual,Math.abs(product[f]-rhs[f]));
      if(fieldResidual>1e-7){error='The cave airflow calculation did not converge.';return;}
      for(var j=0;j<n;j++)if(!solid[j] && connected[j]){
        if(j%w<w-1 && !solid[j+1] && connected[j+1])fx[j]=(phi[j]-phi[j+1])/h;
        if(j<n-w && !solid[j+w] && connected[j+w])fy[j]=(phi[j]-phi[j+w])/h;
      }
      var mouthCol=Math.floor((g.x+g.width-h*.5)/h);
      for(var mouthRow=Math.floor(g.y/h);mouthRow<Math.ceil((g.y+g.height)/h);mouthRow++)unitMouthFlux+=fx[mouthRow*w+mouthCol]*h;
    }
    rebuild();
    function addMarker(x,y){
      if(world.solidAt(x,y))return;
      var vx=interpolate(fx,x/h-1,y/h-.5),vy=interpolate(fy,x/h-.5,y/h-1),length=Math.hypot(vx,vy);
      var rest=(length?Math.atan2(vy,vx):0)+Math.PI*.5;
      markers.push({id:markers.length,x:x,y:y,vx:0,vy:0,angle:rest,initialAngle:rest,omega:0,distance:0,contacts:0});
    }
    var chamber=spec.chamber,gate=spec.gate,mouth=definition.pipes[0].points.slice(-1)[0];
    for(var row=0,y=chamber.y+24;y<chamber.y+chamber.height-16;y+=48,row++)
      for(var x=chamber.x+24+(row%2)*12;x<chamber.x+chamber.width-16;x+=48)addMarker(x,y);
    for(var x=chamber.x+chamber.width-8;x<=mouth.x+48;x+=24)
      for(var y=gate.y+8;y<gate.y+gate.height;y+=16)addMarker(x,y);
    for(var x=mouth.x+24;x<Math.min(world.w-24,mouth.x+112);x+=32)
      for(var y=gate.y+gate.height*.5-64;y<=gate.y+gate.height*.5+64;y+=32)addMarker(x,y);
    function interpolate(values,x,y){
      var col=Math.floor(x),row=Math.floor(y),a=x-col,b=y-row,sum=0;
      for(var dy=0;dy<2;dy++)for(var dx=0;dx<2;dx++){
        var cx=col+dx,cy=row+dy;
        if(cx>=0 && cy>=0 && cx<w && cy<rows)sum+=values[cy*w+cx]*(dx?a:1-a)*(dy?b:1-b);
      }
      return sum;
    }
    function sampleVelocity(x,y){
      if(x<0 || y<0 || x>=world.w || y>=world.h || world.solidAt(x,y))return {vx:0,vy:0};
      return {vx:interpolate(fx,x/h-1,y/h-.5)*flowPerDepth,vy:interpolate(fy,x/h-.5,y/h-1)*flowPerDepth};
    }
    function wallImpulse(marker,nx,ny){
      var normal=marker.vx*nx+marker.vy*ny;
      if(normal<0){marker.vx-=normal*nx;marker.vy-=normal*ny;}
      marker.contacts++;
    }
    function clearInsertedWall(marker){
      // A closing shutter can overlap a probe. Resolve only that contact,
      // toward the nearest face, without replacing or reorienting the probe.
      var r=vane.radius;
      function clear(x,y){
        for(var row=Math.max(0,Math.floor((y-r)/h));row<=Math.min(rows-1,Math.floor((y+r)/h));row++)
          for(var col=Math.max(0,Math.floor((x-r)/h));col<=Math.min(w-1,Math.floor((x+r)/h));col++)
            if(solid[row*w+col] && x>col*h-r && x<(col+1)*h+r && y>row*h-r && y<(row+1)*h+r)return false;
        return true;
      }
      if(clear(marker.x,marker.y))return;
      var nearest=null,distance=Infinity;
      function candidate(x,y,nx,ny){
        var length=Math.hypot(x-marker.x,y-marker.y);
        if(length<distance && clear(x,y)){distance=length;nearest={x:x,y:y,nx:nx,ny:ny};}
      }
      // Validate faces against the union of solid cells, including neighboring
      // tiles, so a grid seam is never mistaken for an exposed contact face.
      for(var row=Math.max(0,Math.floor((marker.y-r)/h)-1);row<=Math.min(rows-1,Math.floor((marker.y+r)/h)+1);row++)
        for(var col=Math.max(0,Math.floor((marker.x-r)/h)-1);col<=Math.min(w-1,Math.floor((marker.x+r)/h)+1);col++){
          if(!solid[row*w+col])continue;
          candidate(col*h-r-1e-8,marker.y,-1,0);candidate((col+1)*h+r+1e-8,marker.y,1,0);
          candidate(marker.x,row*h-r-1e-8,0,-1);candidate(marker.x,(row+1)*h+r+1e-8,0,1);
        }
      if(nearest){marker.x=nearest.x;marker.y=nearest.y;wallImpulse(marker,nearest.nx,nearest.ny);}
      else error='A cave arrow is trapped inside the wall.';
    }
    function moveArrow(marker,dt){
      // Sweep a small square contact envelope through the actual solid tiles.
      // Inelastic, frictionless contact removes normal velocity and retains
      // tangential motion. A large step cannot tunnel through a wall or gate.
      for(var pass=0;pass<4 && dt>1e-12;pass++){
        var dx=marker.vx*dt,dy=marker.vy*dt,r=vane.radius,time=1,nx=0,ny=0;
        var minCol=Math.max(0,Math.floor((Math.min(marker.x,marker.x+dx)-r)/h));
        var maxCol=Math.min(w-1,Math.floor((Math.max(marker.x,marker.x+dx)+r)/h));
        var minRow=Math.max(0,Math.floor((Math.min(marker.y,marker.y+dy)-r)/h));
        var maxRow=Math.min(rows-1,Math.floor((Math.max(marker.y,marker.y+dy)+r)/h));
        for(var row=minRow;row<=maxRow;row++)for(var col=minCol;col<=maxCol;col++){
          if(!solid[row*w+col])continue;
          var left=col*h-r,right=(col+1)*h+r,top=row*h-r,bottom=(row+1)*h+r;
          if(!dx && (marker.x<=left || marker.x>=right) || !dy && (marker.y<=top || marker.y>=bottom))continue;
          var tx1=dx?(left-marker.x)/dx:-Infinity,tx2=dx?(right-marker.x)/dx:Infinity;
          var ty1=dy?(top-marker.y)/dy:-Infinity,ty2=dy?(bottom-marker.y)/dy:Infinity;
          var tx=Math.min(tx1,tx2),ty=Math.min(ty1,ty2),enter=Math.max(tx,ty),leave=Math.min(Math.max(tx1,tx2),Math.max(ty1,ty2));
          if(enter<0 || enter>time || enter>leave)continue;
          time=enter;nx=tx>=ty?-Math.sign(dx):0;ny=ty>=tx?-Math.sign(dy):0;
        }
        marker.x+=dx*time;marker.y+=dy*time;
        if(!nx && !ny)break;
        marker.x+=nx*1e-8;marker.y+=ny*1e-8;
        if(nx)wallImpulse(marker,nx,0);if(ny)wallImpulse(marker,0,ny);
        dt*=1-time;
      }
    }
    function moveArrows(dt){
      markers.forEach(function(marker){
        clearInsertedWall(marker);
        var rho=inChamber(marker.x,marker.y)?mass/volume:
          (marker.x<mouth.x?(pressure+outside)*.5:outside)/(spec.gasConstant*spec.temperature);
        var cosine=Math.cos(marker.angle),sine=Math.sin(marker.angle);
        var sails=vane.sails.map(function(sail){
          var rx=sail.arm*cosine,ry=sail.arm*sine;
          return {rx:rx,ry:ry,air:sampleVelocity(marker.x+rx,marker.y+ry),drag:.5*rho*vane.dragCoefficient*sail.area};
        });
        var vx=marker.vx,vy=marker.vy,omega=marker.omega;
        // Coupled backward Euler of m dv/dt = sum(F), I dw/dt = sum(r x F).
        // Each sail sees air relative to BOTH its translation and rotation.
        // The drag Jacobian is positive definite; solve its 3 by 3 system
        // with Cholesky. No spring, pin, target angle or reversal trigger.
        for(var iteration=0;iteration<24;iteration++){
          var a=vane.mass/dt,b=0,c=0,d=a,e=0,f=vane.inertia/dt;
          var qx=a*(vx-marker.vx),qy=a*(vy-marker.vy),qw=f*(omega-marker.omega);
          sails.forEach(function(sail){
            var rx=sail.rx,ry=sail.ry,ux=sail.air.vx-vx+omega*ry,uy=sail.air.vy-vy-omega*rx;
            var length=Math.hypot(ux,uy),drag=sail.drag,force=drag*length;
            qx-=force*ux;qy-=force*uy;qw-=force*(rx*uy-ry*ux);
            var inv=length?drag/length:0,jxx=force+inv*ux*ux,jxy=inv*ux*uy,jyy=force+inv*uy*uy;
            a+=jxx;b+=jxy;d+=jyy;c+=-ry*jxx+rx*jxy;e+=-ry*jxy+rx*jyy;
            f+=ry*ry*jxx-2*rx*ry*jxy+rx*rx*jyy;
          });
          if(Math.max(Math.abs(qx),Math.abs(qy),Math.abs(qw))<1e-11)break;
          var l0=Math.sqrt(a),l1=b/l0,l2=c/l0,l3=Math.sqrt(d-l1*l1),l4=(e-l2*l1)/l3,l5=Math.sqrt(f-l2*l2-l4*l4);
          var y0=qx/l0,y1=(qy-l1*y0)/l3,y2=(qw-l2*y0-l4*y1)/l5;
          var dw=y2/l5,dy=(y1-l4*dw)/l3,dx=(y0-l1*dy-l2*dw)/l0;
          vx-=dx;vy-=dy;omega-=dw;
        }
        var oldX=marker.x,oldY=marker.y;
        marker.vx=vx;marker.vy=vy;marker.omega=omega;marker.angle+=omega*dt;moveArrow(marker,dt);
        if(!Number.isFinite(marker.x+marker.y+marker.vx+marker.vy+marker.angle+marker.omega)){error='The cave arrow state is invalid.';return;}
        var distance=Math.hypot(marker.x-oldX,marker.y-oldY);marker.distance+=distance;distanceTravel+=distance;
        maxPositionStep=Math.max(maxPositionStep,distance);
        angularTravel+=Math.abs(omega*dt);maxAngularStep=Math.max(maxAngularStep,Math.abs(omega*dt));
      });
    }
    function increasePressure(side,amount){
      if(amount===undefined)amount=spec.pressureStepPa;
      if(side!=='inside' && side!=='outside' || !(amount>0) || !Number.isFinite(amount) || error)return false;
      if(insideTarget!==null)return setPressure(side,(side==='inside'?insideTarget:outside)+amount);
      if(side==='outside')outside+=amount;
      else{
        var added=amount*volume/(spec.gasConstant*spec.temperature);
        mass+=added;pumped+=added;pressure=spec.ambientPa+(mass-initialMass)*spec.gasConstant*spec.temperature/volume;
      }
      return true;
    }
    function regulateInside(){
      if(insideTarget===null)return;
      var targetMass=insideTarget*volume/(spec.gasConstant*spec.temperature);
      pumped+=targetMass-mass;mass=targetMass;pressure=insideTarget;
    }
    function setPressure(side,value){
      if(side!=='inside' && side!=='outside' || !Number.isFinite(value) || value<spec.pressureMinPa || value>spec.pressureMaxPa || error)return false;
      if(side==='outside')outside=value;
      else{insideTarget=value;regulateInside();}
      revision++;return true;
    }
    function addSmoke(x,y){
      if(!Number.isFinite(x+y) || x<0 || y<0 || x>=world.w || y>=world.h || world.solidAt(x,y) || error)return false;
      if(version!==world.version())rebuild();
      var weights=[],total=0,sigma=12,seen=new Uint8Array(n),queue=[Math.floor(y/h)*w+Math.floor(x/h)];seen[queue[0]]=1;
      for(var head=0;head<queue.length;head++){
        var i=queue[head],col=i%w,row=Math.floor(i/w),distance=((col+.5)*h-x)**2+((row+.5)*h-y)**2;
        if(solid[i] || distance>9*sigma*sigma)continue;
        var weight=Math.exp(-distance/(2*sigma*sigma));weights.push({i:i,weight:weight});total+=weight;
        neighbors(i,function(j){if(!seen[j] && !solid[j]){seen[j]=1;queue.push(j);}});
      }
      if(!(total>0))return false;
      weights.forEach(function(item){smoke[item.i]+=item.weight/total;});
      smokeAdded++;smokeClicks++;revision++;return true;
    }
    function moveSmoke(dt){
      if(!smokeAdded || !flowPerDepth)return;
      var rate=0;
      for(var i=0;i<n;i++)rate=Math.max(rate,Math.abs(flowPerDepth)/h*(Math.abs(fx[i])+Math.abs(fy[i])+(i%w?Math.abs(fx[i-1]):0)+(i>=w?Math.abs(fy[i-w]):0)));
      while(dt>1e-12){
        var step=Math.min(dt,rate>0 ? .9/rate : dt);dt-=step;smokeNext.set(smoke);
        for(var i=0;i<n;i++){
          // Conservative upwind transport across the same solid-free faces
          // used by the gas velocity. Smoke has no buoyancy or gas feedback.
          if(i%w<w-1 && fx[i]){
            var velocity=fx[i]*flowPerDepth,transfer=velocity*step/h*smoke[velocity>=0?i:i+1];
            smokeNext[i]-=transfer;smokeNext[i+1]+=transfer;
          }
          if(i<n-w && fy[i]){
            var velocity=fy[i]*flowPerDepth,transfer=velocity*step/h*smoke[velocity>=0?i:i+w];
            smokeNext[i]-=transfer;smokeNext[i+w]+=transfer;
          }
        }
        var swap=smoke;smoke=smokeNext;smokeNext=swap;
      }
    }
    function tick(dt){
      if(version!==world.version())rebuild();
      if(!(dt>0) || error)return;
      var remaining=dt;
      while(remaining>1e-10){
        var step=Math.min(1/120,remaining);remaining-=step;seconds+=step;
        regulateInside();pressure=insideTarget===null?spec.ambientPa+(mass-initialMass)*spec.gasConstant*spec.temperature/volume:insideTarget;
        if(area>0 && sourceCells){
          var rt=spec.gasConstant*spec.temperature;
          // Neck inertia uses mean density. Upwind transfer density is chosen
          // from the resulting signed drive, so reversal cannot select the
          // wrong donor merely because the density changed across the mouth.
          var neckDensity=(pressure+outside)*.5/rt,inertia=neckDensity*spec.neckLength/step;
          var drive=pressure-outside+inertia*speed,rho=(drive>=0?pressure:outside)/rt;
          var linear=inertia+(insideTarget===null?step*rt*rho*area/volume:0),quadratic=.5*neckDensity*spec.lossCoefficient;
          // Stable backward Euler of the entrance momentum plus gas EOS.
          speed=drive===0?0:Math.sign(drive)*2*Math.abs(drive)/(linear+Math.sqrt(linear*linear+4*quadratic*Math.abs(drive)));
          var transferred=rho*area*speed*step;mass-=transferred;
          if(transferred>=0)escaped+=transferred;else admitted-=transferred;
          pressure=spec.ambientPa+(mass-initialMass)*rt/volume;regulateInside();flow=area*speed;
          // The chamber's density is uniform. Its compression/expansion
          // divergence carries precisely the computed mass crossing its neck.
          flowPerDepth=(transferred/step)/(mass/volume)/spec.depth;
        }else{flow=0;speed=0;flowPerDepth=0;}
        moveSmoke(step);moveArrows(step);
        if(error)return;
        maxResidual=Math.max(maxResidual,Math.abs(mass-initialMass-pumped-admitted+escaped));steps++;
        if(!(mass>0) || !Number.isFinite(mass+speed)){error='The cave gas state is invalid.';return;}
      }
    }
    function stats(){
      if(version!==world.version())rebuild();
      var turning=0,moving=0,nonfinite=0,contacts=0,smokeMass=0,smokeX=0,smokeY=0,smokeMinimum=Infinity;
      for(var i=0;i<n;i++){smokeMass+=smoke[i];smokeX+=smoke[i]*(i%w+.5)*h;smokeY+=smoke[i]*(Math.floor(i/w)+.5)*h;smokeMinimum=Math.min(smokeMinimum,smoke[i]);}
      markers.forEach(function(marker){
        if(!Number.isFinite(marker.x+marker.y+marker.vx+marker.vy+marker.angle+marker.omega)){nonfinite++;return;}
        if(Math.abs(marker.omega)>.01)turning++;
        if(Math.hypot(marker.vx,marker.vy)>.01)moving++;
        contacts+=marker.contacts;
      });
      return {seconds:seconds,pressurePa:pressure,outsidePressurePa:outside,gaugePressurePa:pressure-outside,
        massKg:mass,initialMassKg:initialMass,admittedKg:admitted,escapedKg:escaped,
        pumpedKg:pumped,massResidualKg:mass-initialMass-pumped-admitted+escaped,maxMassResidualKg:maxResidual,
        flowM3PerSecond:flow,speedMetersPerSecond:speed,volumeM3:volume,mouthAreaM2:area,
        mouthOpen:area>0 && sourceCells>0,vaneCount:markers.length,turningVanes:turning,movingVanes:moving,
        vaneAngularTravel:angularTravel,maxAngularStep:maxAngularStep,nonfiniteVanes:nonfinite,
        vaneDistanceMeters:distanceTravel,maxPositionStep:maxPositionStep,wallContacts:contacts,
        visualMotion:'moving-arrows',insideTargetPa:insideTarget,pressureMinPa:spec.pressureMinPa,pressureMaxPa:spec.pressureMaxPa,
        smokeMass:smokeMass,smokeAdded:smokeAdded,smokeClicks:smokeClicks,smokeMinimum:smokeMinimum,
        smokeCentroid:smokeMass?{x:smokeX/smokeMass,y:smokeY/smokeMass}:null,revision:revision,
        fieldResidual:fieldResidual,unitMouthFlux:unitMouthFlux,fieldIterations:fieldIterations,steps:steps,error:error};
    }
    function draw(c,palette){
      if(version!==world.version())rebuild();
      if(!clip){
        clip=new Path2D();
        for(var row=0;row<rows;row++)for(var col=0;col<w;){
          if(solid[row*w+col]){col++;continue;}
          var start=col;while(col<w && !solid[row*w+col])col++;
          clip.rect(start*h,row*h,(col-start)*h,h);
        }
      }
      var scale=palette.scale || 1,size=20/scale,head=5/scale;
      c.save();c.clip(clip);
      for(var i=0;i<n;i++)if(smoke[i]>1e-5 && !solid[i]){
        var x=(i%w+.5)*h,y=(Math.floor(i/w)+.5)*h,r=h*1.2;
        var cloud=c.createRadialGradient(x,y,0,x,y,r);
        cloud.addColorStop(0,palette.smoke || palette.text || palette.accent);cloud.addColorStop(1,'transparent');
        c.fillStyle=cloud;c.globalAlpha=.65*(1-Math.exp(-smoke[i]*65));c.fillRect(x-r,y-r,2*r,2*r);
      }
      c.restore();
      c.save();c.clip(clip);c.strokeStyle=c.fillStyle=palette.air || palette.accent;c.lineWidth=1.6/scale;c.lineCap='round';
      markers.forEach(function(marker){
        var x=marker.x,y=marker.y;
        if(x<0 || y<0 || x>=world.w || y>=world.h || world.solidAt(x,y))return;
        var angle=marker.angle;
        var dx=Math.cos(angle),dy=Math.sin(angle),tipX=x+dx*size*.5,tipY=y+dy*size*.5;
        c.globalAlpha=.7;c.beginPath();c.moveTo(x-dx*size*.5,y-dy*size*.5);c.lineTo(tipX,tipY);c.stroke();
        c.globalAlpha=1;c.beginPath();c.moveTo(tipX,tipY);
        c.lineTo(tipX-dx*head*1.6-dy*head,tipY-dy*head*1.6+dx*head);
        c.lineTo(tipX-dx*head*1.6+dy*head,tipY-dy*head*1.6-dx*head);c.closePath();c.fill();
      });
      c.restore();
    }
    return {tick:tick,stats:stats,draw:draw,sampleVelocity:sampleVelocity,increasePressure:increasePressure,setPressure:setPressure,addSmoke:addSmoke,
      smokeCells:function(){return Array.from(smoke);},
      vanes:function(){return markers.map(function(marker){return Object.assign({},marker);});},
      destroy:function(){clip=null;markers.length=0;}};
  }
  root.WSSBreathingCave={create:create};
})(typeof window!=='undefined'?window:globalThis);
