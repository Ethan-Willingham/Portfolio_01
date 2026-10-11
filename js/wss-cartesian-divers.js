/* Fixed ballast and isothermal gas in the ordinary elastic water guests. */
(function(root){
  'use strict';
  function area(b){var sum=0;for(var k=0;k<b.ringN;k++){var i=b.ring[k],j=b.ring[(k+1)%b.ringN];sum+=(b.px[i]-b.cx)*(b.py[j]-b.cy)-(b.px[j]-b.cx)*(b.py[i]-b.cy);}return Math.abs(sum)*.5;}
  function volume(amount,room,absolute){if(!(amount>0 && room>0 && absolute>0))throw Error('Diver gas needs positive absolute pressure.');return amount*room/absolute;}
  function lift(b){var d=b.cartesianDiver;return d ? area(b)/d.mass : null;}
  function create(options){
    var L=options.liquid,definition=options.definition,bodies=options.bodies,model=options.model,room=model.settings.atmospherePressure,
      clock=L.simulationClock,offset=0,squeezed=definition.divers.squeezed,pistonVelocity=0,retired=false,generation=0,pending=false,lastAt=-Infinity,
      sampleClock=clock,sampleFrame=0,latency=0,error=null,read=L.device.createBuffer({label:'toy.divers.pressure',size:bodies.length*144,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    bodies.forEach(function(b,k){var spec=definition.slimes[k],amount=area(b);b.cartesianDiver={id:k+1,amount:amount,mass:amount*spec.density,initialArea:amount,absolute:room,target:amount,pressureKind:null};});
    function guest(){var r=definition.divers.piston,x=r.x,y=r.y+offset,h=r.height,w=r.width,v=pistonVelocity;
      return {x:x+w*.5,y:y+h*.5,hw:w*.5+.01,hh:h*.5+.01,mvx:0,mvy:v,
        pts:[x,y,0,v,x+w,y,0,v,x+w,y+h,0,v,x,y+h,0,v]};}
    var controller={
      ready:true,
      tick:function(){
        if(retired)return;var now=L.simulationClock,h=Math.max(0,now-clock);clock=now;
        var target=squeezed?definition.divers.stroke:0,previous=offset,travel=definition.divers.speed*h;
        offset=Math.max(previous-travel,Math.min(previous+travel,target));pistonVelocity=h>0?(offset-previous)/h:0;
        bodies.forEach(function(b){var d=b.cartesianDiver;b.restArea=d.target;b.sleeping=false;b.sleepFrames=0;});
      },
      sample:function(){
        var now=performance.now();if(retired || pending || now-lastAt<80)return;lastAt=now;pending=true;
        var own=generation,at=L.simulationClock,frame=L.readbackTick,enc=L.device.createCommandEncoder({label:'toy.divers.pressure'});
        // Lower side probes remain in water when the base touches the floor.
        bodies.forEach(function(b,k){[[0,1],[1,.5],[-1,.5]].forEach(function(direction,j){
          var node=b.ring[0],best=-Infinity;for(var v=0;v<b.ringN;v++){var p=b.ring[v],score=(b.px[p]-b.cx)*direction[0]+(b.py[p]-b.cy)*direction[1];if(score>best){best=score;node=p;}}
          var length=Math.hypot(direction[0],direction[1]),x=b.px[node]+direction[0]/length*model.cellSize,y=b.py[node]+direction[1]/length*model.cellSize;
          var col=Math.max(0,Math.min(model.width-1,Math.floor(x/model.cellSize))),row=Math.max(0,Math.min(model.height-1,Math.floor(y/model.cellSize))),i=row*model.width+col,at=(k*3+j)*48;
          enc.copyBufferToBuffer(model.buffers.pressure,i*16,read,at,16);enc.copyBufferToBuffer(model.buffers.cells,i*32,read,at+16,32);
        });});
        L.queue.submit([enc.finish()]);read.mapAsync(GPUMapMode.READ).then(function(){
          if(retired || own!==generation){read.unmap();return;}var data=read.getMappedRange(),f=new Float32Array(data),u=new Uint32Array(data);
          bodies.forEach(function(b,k){var d=b.cartesianDiver,sum=0,count=0;for(var j=0;j<3;j++){var at=(k*3+j)*12,kind=u[at+7],pressure=f[at];
            if(kind===1 && Number.isFinite(pressure) && room+pressure>0){sum+=pressure;count++;}}
            d.pressureKind=count?1:null;if(count){d.absolute=room+sum/count;d.target=volume(d.amount,room,d.absolute);}
          });sampleClock=at;sampleFrame=frame;latency=performance.now()-now;read.unmap();
        }).catch(function(e){if(!retired && own===generation)error=e.message;}).finally(function(){pending=false;});
      },
      resetPressure:function(){generation++;sampleClock=L.simulationClock;sampleFrame=L.readbackTick;latency=0;error=null;lastAt=-Infinity;
        bodies.forEach(function(b){var d=b.cartesianDiver;d.absolute=room;d.target=d.amount;d.pressureKind=null;});},
      toggle:function(){squeezed=!squeezed;definition.action=squeezed?'Release the squeeze':'Squeeze the jar';return squeezed;},
      guest:guest,
      lift:lift,
      stats:function(){return {squeezed:squeezed,vented:definition.divers.vented,stroke:offset,sampleClock:sampleClock,sampleFrame:sampleFrame,
        ageSimulationSeconds:Math.max(0,L.simulationClock-sampleClock),latencyMs:latency,pending:pending,error:error,
        bodies:bodies.map(function(b){var d=b.cartesianDiver;return {id:d.id,x:b.cx,y:b.cy,area:area(b),initialArea:d.initialArea,targetArea:d.target,
          gasAmount:d.amount,ballastMass:d.mass,density:d.mass/area(b),absolutePressure:d.absolute,pressureKind:d.pressureKind};})};},
      draw:function(ctx){var colors=options.colors;
        var r=definition.divers.piston;ctx.save();ctx.strokeStyle=colors.accent;ctx.fillStyle=colors.accent;ctx.lineWidth=2;
        ctx.globalAlpha=.15;ctx.fillRect(r.x,r.y+offset,r.width,r.height);ctx.globalAlpha=1;ctx.strokeRect(r.x,r.y+offset,r.width,r.height);
        ctx.beginPath();ctx.moveTo(r.x+r.width*.5,r.y+offset);ctx.lineTo(r.x+r.width*.5,96);ctx.stroke();
        ctx.font='12px "Commit Mono", monospace';ctx.textAlign='center';ctx.fillText('Driven piston',r.x+r.width*.5,88);
        bodies.forEach(function(b){var d=b.cartesianDiver;ctx.fillStyle=colors.text;ctx.fillText(String(d.id),b.cx,b.cy+4);});
        ctx.restore();
      },
      destroy:function(){retired=true;generation++;read.destroy();}
    };
    return controller;
  }
  root.WSSCartesianDivers={create:create,area:area,volume:volume,lift:lift};
})(typeof window!=='undefined'?window:globalThis);
