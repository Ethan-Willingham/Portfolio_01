/* Manually pressurized cave, neck inertia and pivoted airflow vanes. */
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
    var markers=[],angularTravel=0,maxAngularStep=0,vane=spec.vane;
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
      markers.push({id:markers.length,x:x,y:y,angle:rest,restAngle:rest,omega:0});
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
    function turnVanes(dt){
      markers.forEach(function(marker){
        var rho=inChamber(marker.x,marker.y)?mass/volume:
          (marker.x<mouth.x?(pressure+outside)*.5:outside)/(spec.gasConstant*spec.temperature);
        var drag=.5*rho*vane.dragCoefficient*vane.area;
        var velocity=sampleVelocity(marker.x,marker.y);
        var rx=vane.arm*Math.cos(marker.angle),ry=vane.arm*Math.sin(marker.angle),omega=marker.omega;
        // Drag acts at the sail ahead of the pin. Relative velocity includes
        // the sail's rotation. A weak torsion spring biases the instrument
        // toward its resting angle; there is no direction-change trigger.
        // Solve I d(omega)/dt = r cross F - bearing drag - spring torque.
        for(var iteration=0;iteration<16;iteration++){
          var ux=velocity.vx+omega*ry,uy=velocity.vy-omega*rx,length=Math.hypot(ux,uy),cross=rx*uy-ry*ux;
          var torque=drag*length*cross;
          var residual=vane.inertia*(omega-marker.omega)/dt+vane.bearingDrag*omega+
            vane.spring*(marker.angle+omega*dt-marker.restAngle)-torque;
          var derivative=vane.inertia/dt+vane.bearingDrag+vane.spring*dt+
            drag*(vane.arm*vane.arm*length+(length?cross*cross/length:0));
          var change=residual/derivative;omega-=change;if(Math.abs(change)<1e-12)break;
        }
        marker.omega=omega;marker.angle+=omega*dt;
        if(!Number.isFinite(marker.angle+marker.omega)){error='The cave vane state is invalid.';return;}
        angularTravel+=Math.abs(omega*dt);maxAngularStep=Math.max(maxAngularStep,Math.abs(omega*dt));
      });
    }
    function increasePressure(side,amount){
      if(amount===undefined)amount=spec.pressureStepPa;
      if(side!=='inside' && side!=='outside' || !(amount>0) || !Number.isFinite(amount) || error)return false;
      if(side==='outside')outside+=amount;
      else{
        var added=amount*volume/(spec.gasConstant*spec.temperature);
        mass+=added;pumped+=added;pressure=spec.ambientPa+(mass-initialMass)*spec.gasConstant*spec.temperature/volume;
      }
      return true;
    }
    function tick(dt){
      if(version!==world.version())rebuild();
      if(!(dt>0) || error)return;
      var remaining=dt;
      while(remaining>1e-10){
        var step=Math.min(1/120,remaining);remaining-=step;seconds+=step;
        pressure=spec.ambientPa+(mass-initialMass)*spec.gasConstant*spec.temperature/volume;
        if(area>0 && sourceCells){
          var rt=spec.gasConstant*spec.temperature;
          // Neck inertia uses mean density. Upwind transfer density is chosen
          // from the resulting signed drive, so reversal cannot select the
          // wrong donor merely because the density changed across the mouth.
          var neckDensity=(pressure+outside)*.5/rt,inertia=neckDensity*spec.neckLength/step;
          var drive=pressure-outside+inertia*speed,rho=(drive>=0?pressure:outside)/rt;
          var linear=inertia+step*rt*rho*area/volume,quadratic=.5*neckDensity*spec.lossCoefficient;
          // Stable backward Euler of the entrance momentum plus gas EOS.
          speed=drive===0?0:Math.sign(drive)*2*Math.abs(drive)/(linear+Math.sqrt(linear*linear+4*quadratic*Math.abs(drive)));
          var transferred=rho*area*speed*step;mass-=transferred;
          if(transferred>=0)escaped+=transferred;else admitted-=transferred;
          pressure=spec.ambientPa+(mass-initialMass)*rt/volume;flow=area*speed;
          // The chamber's density is uniform. Its compression/expansion
          // divergence carries precisely the computed mass crossing its neck.
          flowPerDepth=(transferred/step)/(mass/volume)/spec.depth;
        }else{flow=0;speed=0;flowPerDepth=0;}
        turnVanes(step);
        if(error)return;
        maxResidual=Math.max(maxResidual,Math.abs(mass-initialMass-pumped-admitted+escaped));steps++;
        if(!(mass>0) || !Number.isFinite(mass+speed)){error='The cave gas state is invalid.';return;}
      }
    }
    function stats(){
      if(version!==world.version())rebuild();
      var moving=0,nonfinite=0;
      markers.forEach(function(marker){
        if(!Number.isFinite(marker.angle+marker.omega)){nonfinite++;return;}
        if(Math.abs(marker.omega)>.01)moving++;
      });
      return {seconds:seconds,pressurePa:pressure,outsidePressurePa:outside,gaugePressurePa:pressure-outside,
        massKg:mass,initialMassKg:initialMass,admittedKg:admitted,escapedKg:escaped,
        pumpedKg:pumped,massResidualKg:mass-initialMass-pumped-admitted+escaped,maxMassResidualKg:maxResidual,
        flowM3PerSecond:flow,speedMetersPerSecond:speed,volumeM3:volume,mouthAreaM2:area,
        mouthOpen:area>0 && sourceCells>0,vaneCount:markers.length,turningVanes:moving,
        vaneAngularTravel:angularTravel,maxAngularStep:maxAngularStep,nonfiniteVanes:nonfinite,
        visualMotion:'turning-vanes',pressureHoldRatePaPerSecond:spec.pressureHoldRatePaPerSecond,
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
      c.save();c.clip(clip);c.strokeStyle=c.fillStyle=palette.air || palette.accent;c.lineWidth=1.6/scale;c.lineCap='round';
      markers.forEach(function(marker){
        var x=marker.x,y=marker.y;
        if(world.solidAt(x,y))return;
        var angle=marker.angle;
        var dx=Math.cos(angle),dy=Math.sin(angle),tipX=x+dx*size*.5,tipY=y+dy*size*.5;
        c.globalAlpha=.7;c.beginPath();c.moveTo(x-dx*size*.5,y-dy*size*.5);c.lineTo(tipX,tipY);c.stroke();
        c.globalAlpha=1;c.beginPath();c.moveTo(tipX,tipY);
        c.lineTo(tipX-dx*head*1.6-dy*head,tipY-dy*head*1.6+dx*head);
        c.lineTo(tipX-dx*head*1.6+dy*head,tipY-dy*head*1.6-dx*head);c.closePath();c.fill();
        c.beginPath();c.arc(x,y,1.6/scale,0,Math.PI*2);c.fill();
      });
      c.restore();
    }
    return {tick:tick,stats:stats,draw:draw,sampleVelocity:sampleVelocity,increasePressure:increasePressure,
      vanes:function(){return markers.map(function(marker){return Object.assign({},marker);});},
      destroy:function(){clip=null;markers.length=0;}};
  }
  root.WSSBreathingCave={create:create};
})(typeof window!=='undefined'?window:globalThis);
