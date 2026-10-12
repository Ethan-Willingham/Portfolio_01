/* Finite gas inventory, neck inertia and conservative passive smoke transport. */
(function(root){
  'use strict';
  function create(definition,world){
    var spec=definition.cave,h=world.tile,w=Math.round(world.w/h),rows=Math.round(world.h/h),n=w*rows;
    var solid=new Uint8Array(n),room=new Uint8Array(n),connected=new Uint8Array(n),source=new Uint8Array(n);
    var phi=new Float64Array(n),diag=new Float64Array(n),rhs=new Float64Array(n),residual=new Float64Array(n),
      direction=new Float64Array(n),product=new Float64Array(n),preconditioned=new Float64Array(n);
    var dye=new Float64Array(n),next=new Float64Array(n),fx=new Float64Array(n),fy=new Float64Array(n);
    var version=-1,sourceCells=0,volume=0,area=0,mass=0,initialMass=0,admitted=0,escaped=0,
      seconds=0,speed=0,flow=0,outside=spec.ambientPa,pressure=outside,maxResidual=0,steps=0,unitMouthFlux=0;
    var smokeInitial=0,smokeEscaped=0,fieldResidual=0,fieldIterations=0,error=null,initialized=false;
    var imageCanvas=null,imageContext=null,pixels=null,paintedStep=-1;
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
      version=world.version();paintedStep=-1;sourceCells=0;phi.fill(0);room.fill(0);connected.fill(0);source.fill(0);rhs.fill(0);diag.fill(0);
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
      fx.fill(0);fy.fill(0);unitMouthFlux=0;
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
    for(var i=0;i<n;i++)if(!solid[i]){
      var x=(i%w+.5)*h,y=(Math.floor(i/w)+.5)*h;
      if(inChamber(x,y) || x>=464 && x<600 && y>=208 && y<240){
        // A finite initial mist. Structure is initial tracer, never velocity.
        dye[i]=.025+.28*Math.exp(-((x-240)*(x-240)+(y-224)*(y-224))/2100)+
          .5*Math.exp(-((x-444)*(x-444)+(y-220)*(y-220))/1000)+
          .26*Math.exp(-((x-566)*(x-566)+(y-220)*(y-220))/500);
      }
      smokeInitial+=dye[i]*h*h;
    }
    function transport(dt,q){
      next.set(dye);
      function exchange(a,b,face){
        var flux=dt*q*face/h*(face*q>=0?dye[a]:dye[b]);
        if(!room[a])next[a]-=flux;else smokeEscaped-=flux*h*h;
        if(!room[b])next[b]+=flux;else smokeEscaped+=flux*h*h;
      }
      for(var i=0;i<n;i++)if(!solid[i] && connected[i]){
        if(fx[i])exchange(i,i+1,fx[i]);if(fy[i])exchange(i,i+w,fy[i]);
      }
      var swap=dye;dye=next;next=swap;
    }
    function tick(dt){
      if(version!==world.version())rebuild();
      if(!(dt>0) || error)return;
      var remaining=dt;
      while(remaining>1e-10){
        var step=Math.min(1/120,remaining);remaining-=step;seconds+=step;
        outside=spec.ambientPa+spec.amplitudePa*Math.sin(2*Math.PI*seconds/spec.periodSeconds);
        pressure=spec.ambientPa+(mass-initialMass)*spec.gasConstant*spec.temperature/volume;
        if(area>0 && sourceCells){
          var rt=spec.gasConstant*spec.temperature;
          var rho=(pressure-outside+mass/volume*spec.neckLength*speed/step>=0?pressure:outside)/rt;
          var inertia=rho*spec.neckLength/step,linear=inertia+step*rt*rho*area/volume,
            quadratic=.5*rho*spec.lossCoefficient,drive=pressure-outside+inertia*speed;
          // Stable backward Euler of the entrance momentum plus gas EOS.
          speed=drive===0?0:Math.sign(drive)*2*Math.abs(drive)/(linear+Math.sqrt(linear*linear+4*quadratic*Math.abs(drive)));
          var transferred=rho*area*speed*step;mass-=transferred;
          if(transferred>=0)escaped+=transferred;else admitted-=transferred;
          pressure=spec.ambientPa+(mass-initialMass)*rt/volume;flow=area*speed;
          // The chamber's density is uniform. Its compression/expansion
          // divergence carries precisely the computed mass crossing its neck.
          var q=(transferred/step)/(mass/volume)/spec.depth;
          var maxRate=0;
          for(var i=0;i<n;i++)maxRate=Math.max(maxRate,(Math.abs(fx[i])+Math.abs(fy[i])+(i%w?Math.abs(fx[i-1]):0)+(i>=w?Math.abs(fy[i-w]):0))*Math.abs(q)/h);
          var parts=Math.max(1,Math.ceil(step*maxRate/.8));
          for(var sub=0;sub<parts;sub++)transport(step/parts,q);
        }else{flow=0;speed=0;}
        maxResidual=Math.max(maxResidual,Math.abs(mass-initialMass-admitted+escaped));steps++;
        if(!(mass>0) || !Number.isFinite(mass+speed)){error='The cave gas state is invalid.';return;}
      }
    }
    function stats(){
      if(version!==world.version())rebuild();
      var smoke=0,chamberSmoke=0,minimum=Infinity;
      for(var i=0;i<n;i++){smoke+=dye[i]*h*h;if(inChamber((i%w+.5)*h,(Math.floor(i/w)+.5)*h))chamberSmoke+=dye[i]*h*h;minimum=Math.min(minimum,dye[i]);}
      return {seconds:seconds,pressurePa:pressure,outsidePressurePa:outside,gaugePressurePa:pressure-outside,
        massKg:mass,initialMassKg:initialMass,admittedKg:admitted,escapedKg:escaped,
        massResidualKg:mass-initialMass-admitted+escaped,maxMassResidualKg:maxResidual,
        flowM3PerSecond:flow,speedMetersPerSecond:speed,volumeM3:volume,mouthAreaM2:area,
        mouthOpen:area>0 && sourceCells>0,smokeInChamber:chamberSmoke,smokeAmount:smoke,initialSmokeAmount:smokeInitial,smokeEscaped:smokeEscaped,
        smokeResidual:smoke-smokeInitial+smokeEscaped,minimumSmoke:minimum,
        fieldResidual:fieldResidual,unitMouthFlux:unitMouthFlux,fieldIterations:fieldIterations,steps:steps,error:error};
    }
    function draw(c,palette){
      if(version!==world.version())rebuild();
      if(!imageCanvas){imageCanvas=document.createElement('canvas');imageCanvas.width=w;imageCanvas.height=rows;imageContext=imageCanvas.getContext('2d');pixels=imageContext.createImageData(w,rows);}
      if(paintedStep!==steps || version!==world.version()){
        var color=palette.text.match(/[0-9a-f]{2}/gi).map(function(v){return parseInt(v,16);});
        for(var i=0;i<n;i++){var at=i*4;pixels.data[at]=color[0];pixels.data[at+1]=color[1];pixels.data[at+2]=color[2];pixels.data[at+3]=solid[i]?0:Math.round(255*(1-Math.exp(-dye[i]*2.8)));}
        imageContext.putImageData(pixels,0,0);paintedStep=steps;
      }
      c.save();c.imageSmoothingEnabled=true;c.drawImage(imageCanvas,0,0,world.w,world.h);
      c.restore();
    }
    return {tick:tick,stats:stats,draw:draw,destroy:function(){imageCanvas=null;imageContext=null;pixels=null;}};
  }
  root.WSSBreathingCave={create:create};
})(typeof window!=='undefined'?window:globalThis);
