/* A cable links two rail cars. Only native water inside their open tanks adds load. */
(function(root){
  'use strict';
  root.WSSMachines=root.WSSMachines||{};
  function rect(x,y,width,height){return{x:x,y:y,width:width,height:height};}
  function make(world,options){
    var o=options||{},enabled=o.tapEnabled!==false,basin=rect(88,344,568,40);
    var railway={starts:[{x:164,y:130},{x:408,y:130}],dx:170,dy:166,
      halfWidth:29,outerHalfWidth:34,top:-26,bottom:20,wall:6,
      dryMass:600,parcelMass:1.5625,drag:1.5,fillParcels:650,emptyParcels:12,
      enabled:enabled,control:rect(64,42,112,30)};
    return {name:'ballast-railway',title:'Water-ballast cliff railway',seed:o.seed||17,draft:true,
      railway:railway,ballastRailway:railway,quietApparatus:true,
      setup:enabled?'water':'dry',setups:[{id:'water',label:'Water on',options:{}},{id:'dry',label:'Dry railway control',options:{tapEnabled:false}}],
      setupNote:'The dry comparison has the same cars, cable, rails and brakes. Without water neither car has a heavier load.',
      primary:{kind:'railway-supply',target:railway.control},action:enabled?'Stop water':'Start water',
      caption:'Water fills the upper car. Its weight pulls the other car uphill through the cable. At the station it drains, and the cars swap jobs.',
      readingLabel:enabled?'Filling car A':'Water off',viewBounds:rect(56,24,624,368),
      vessels:[{id:'collector',label:'Recycling collector',rect:basin,sealed:false}],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],
      settings:{enabled:false},boundaries:{pool:true,reserveCapacity:16000,
        tap:{x:164,y:72,width:14,height:4,rate:1100,vx:0,vy:12,enabled:enabled},
        drain:{x:96,y:368,width:552,height:8}},measure:{source:basin,receiver:basin},
      boundaryNote:'The visible tank walls and bottom doors are the moving native-water collision polygons. GPU counts of the live water inside each tank supply its ballast mass. Equal-length guides and one inextensible cable leave one mechanical coordinate: every unit of descent raises the other car by the same amount. Gravity acting on the measured mass difference accelerates the pair against bearing drag. Station brakes hold the cars during loading and unloading; a bottom arrival opens real tank doors. The brake releases only after the upper tank has enough native water and the lower tank has drained. The recycling pump is an external water supply and supplies the lifting work.',
      energyBudgetStatus:'A reduced rigid-car model with dry mass 600 and water mass 1.5625 per native parcel, in consistent native area-mass units. The cable is massless and inextensible. Native water moves freely inside real collision walls; its measured weight loads the cars. Momentum from water impacts and mass exchange is not returned to the cable, and station braking dissipates motion. Water and car energy are not a closed budget.'};
  }
  var COUNT_SOURCE=`
struct Params {counts:vec4f, tank:array<vec4f,2>};
@group(0) @binding(0) var<uniform> cfg:Params;
@group(0) @binding(1) var<storage,read> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read> flag:array<u32>;
@group(0) @binding(3) var<storage,read_write> counts:array<atomic<u32>>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(cfg.counts.x)||(flag[i]&131u)!=0u){return;}
 for(var k=0u;k<2u;k++){let r=cfg.tank[k];let p=pos[i].xy;
  if(p.x>=r.x && p.y>=r.y && p.x<=r.z && p.y<=r.w){atomicAdd(&counts[k],1u);}}
}`;
  // Backward Euler bearing drag, with the cable constraint eliminated exactly.
  function advance(s,velocity,dt,leftMass,rightMass,gravity,gradient,drag){
    var acceleration=(leftMass-rightMass)*gravity*gradient/(leftMass+rightMass);
    var next=(velocity+acceleration*dt)/(1+drag*dt);
    return {s:s+next*dt,velocity:next,drive:acceleration};
  }
  async function create(c){
    var d=c.definition,spec=d.railway,L=c.liquid,B=c.nativeBoundary;
    if(!B || !B.ready || !B.setTapPosition)throw Error('The railway needs the native water supply and movable station inlet.');
    var length=Math.hypot(spec.dx,spec.dy),ux=spec.dx/length,uy=spec.dy/length;
    var coordinate=0,velocity=0,clock=L.simulationClock,sampleClock=-Infinity,counts=[0,0],sampleTanks=[];
    var phase='filling',topCar=0,departureTop=0,drainOpen=[false,true],trips=0,departures=0,abortedTrips=0,enabled=spec.enabled;
    var retired=false,pending=false,pendingPromise=null,error=null,drive=0,maxCableError=0,brakeLoss=0;
    var departureLoads=[],arrivalLoads=[],peakCounts=[0,0],lastCounts=[0,0],filled=[0,0],drained=[0,0];
    var U=GPUBufferUsage,device=L.device,queue=L.queue,buffers=[];
    function buffer(label,size,usage){var b=device.createBuffer({label:'toy.railway.'+label,size:size,usage:usage});buffers.push(b);return b;}
    try{
    var params=buffer('count-params',48,U.UNIFORM|U.COPY_DST),sum=buffer('counts',16,U.STORAGE|U.COPY_DST|U.COPY_SRC),read=buffer('read',16,U.COPY_DST|U.MAP_READ);
    var module=device.createShaderModule({label:'toy.railway.water-load',code:COUNT_SOURCE});
    var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
    if(errors.length)throw Error(errors.map(function(m){return m.message;}).join('; '));
    var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
    var group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[params,L.buf.pos,L.buf.flag,sum].map(function(b,i){return{binding:i,resource:{buffer:b}};})});
    function poses(){return spec.starts.map(function(start,k){var travel=k?length-coordinate:coordinate;return{x:start.x+ux*travel,y:start.y+uy*travel,s:travel,vx:(k?-velocity:velocity)*ux,vy:(k?-velocity:velocity)*uy};});}
    function tanks(){return poses().map(function(p,k){return{x:p.x,y:p.y,halfWidth:spec.halfWidth,top:spec.top,bottom:spec.bottom,drainOpen:drainOpen[k],
      interior:rect(p.x-spec.halfWidth,p.y+spec.top,spec.halfWidth*2,spec.bottom-spec.top)};});}
    function masses(){return counts.map(function(n){return spec.dryMass+n*spec.parcelMass;});}
    function stationSupply(){
      var p=spec.starts[topCar];B.setTapEnabled(false);B.setTapPosition(p.x,p.y-58);
      B.setTapEnabled(enabled && phase==='filling');
    }
    function capture(){
      if(retired)return Promise.resolve();if(pending)return pendingPromise;
      pending=true;var sampled=tanks(),at=L.simulationClock,values=new Float32Array(12);values[0]=L.liquid.getCount();
      sampled.forEach(function(t,k){var r=t.interior;values.set([r.x,r.y,r.x+r.width,r.y+r.height],4+k*4);});
      queue.writeBuffer(params,0,values);
      var encoder=device.createCommandEncoder({label:'toy.railway.measure'});encoder.clearBuffer(sum);
      var pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.max(1,Math.ceil(values[0]/256)));pass.end();
      encoder.copyBufferToBuffer(sum,0,read,0,16);queue.submit([encoder.finish()]);
      pendingPromise=read.mapAsync(GPUMapMode.READ).then(function(){
        if(!retired){var next=Array.from(new Uint32Array(read.getMappedRange()).slice(0,2));
          next.forEach(function(n,k){peakCounts[k]=Math.max(peakCounts[k],n);if(n>lastCounts[k])filled[k]+=n-lastCounts[k];else drained[k]+=lastCounts[k]-n;});
          counts=next;lastCounts=next.slice();sampleClock=at;sampleTanks=sampled;updateReading();}
        read.unmap();
      }).catch(function(e){if(!retired){error=e.message;updateReading();}}).finally(function(){pending=false;});
      return pendingPromise;
    }
    function localPolygons(k){
      var w=spec.outerHalfWidth,h=spec.halfWidth,t=spec.top,b=spec.bottom,v=spec.wall;
      var out=[[-w,t,-h,t,-h,b+v,-w,b+v],[h,t,w,t,w,b+v,h,b+v]];
      if(drainOpen[k])out.push([-w,b,-w+v,b,-w+v,b+w,-w,b+w],[w-v,b,w,b,w,b+w,w-v,b+w]);
      else out.push([-w,b,0,b,0,b+v,-w,b+v],[0,b,w,b,w,b+v,0,b+v]);
      return out;
    }
    function guests(){
      var out=[];poses().forEach(function(p,k){localPolygons(k).forEach(function(v){var points=[],x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
        for(var i=0;i<v.length;i+=2){var x=p.x+v[i],y=p.y+v[i+1];points.push(x,y,p.vx,p.vy);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        out.push({x:(x0+x1)*.5,y:(y0+y1)*.5,hw:(x1-x0)*.5+.01,hh:(y1-y0)*.5+.01,mvx:p.vx,mvy:p.vy,pts:points});
      });});return out;
    }
    function phaseText(){
      if(error)return 'Railway stopped';
      if(phase==='travelling')return (velocity>=0?'A descends, B rises':'B descends, A rises');
      if(!enabled)return 'Water off';
      return counts[1-topCar]>spec.emptyParcels?'Draining car '+(topCar?'A':'B'):'Filling car '+(topCar?'B':'A');
    }
    function updateReading(){
      var positions=poses(),cableError=positions[0].s+positions[1].s-length;maxCableError=Math.max(maxCableError,Math.abs(cableError));
      d.readingLabel=phaseText();d.railwayReading={clock:clock,positions:positions,velocity:velocity,waterCounts:counts.slice(),masses:masses(),phase:phase,
        trips:trips,cycles:Math.floor(trips/2),departures:departures,abortedTrips:abortedTrips,cableError:cableError,maxCableError:maxCableError,error:error,sampleAge:Math.max(0,L.simulationClock-sampleClock),
        tanks:tanks(),countSample:{clock:sampleClock,tanks:sampleTanks,counts:counts.slice()},dryMass:spec.dryMass,parcelMass:spec.parcelMass,railLength:length,
        enabled:enabled,tapEnabled:B.stats().tapEnabled,topCar:topCar,brake:phase==='filling',drainOpen:drainOpen.slice(),driveAcceleration:drive,
        gravity:L.getSimParam('GRAVITY'),peakCounts:peakCounts.slice(),filledParcels:filled.slice(),drainedParcels:drained.slice(),
        departureLoads:departureLoads.slice(),arrivalLoads:arrivalLoads.slice(),brakeLoss:brakeLoss,finite:Number.isFinite(coordinate+velocity+clock)};
    }
    function tick(){
      if(retired)return;var now=L.simulationClock,elapsed=Math.max(0,now-clock);clock=now;
      if(!error && elapsed>0){
        var fresh=now-sampleClock<.35,loads=masses();
        if(now-sampleClock>1){error='The ballast measurement is stale. Restart the railway.';velocity=0;B.setTapEnabled(false);updateReading();capture();return;}
        if(phase==='filling' && enabled && fresh && counts[topCar]>=spec.fillParcels && counts[1-topCar]<=spec.emptyParcels){
          phase='travelling';departureTop=topCar;drainOpen=[false,false];departures++;departureLoads.push({clock:now,topCar:topCar,counts:counts.slice()});if(departureLoads.length>12)departureLoads.shift();B.setTapEnabled(false);
        }
        if(phase==='travelling'){
          var remaining=elapsed;
          while(remaining>1e-9){var h=Math.min(1/240,remaining);remaining-=h;
            var state=advance(coordinate,velocity,h,loads[0],loads[1],L.getSimParam('GRAVITY'),uy,spec.drag);coordinate=state.s;velocity=state.velocity;drive=state.drive;
            if(coordinate>=length || coordinate<=0){
              // End stops dissipate the arriving pair's motion. They only latch
              // after a traversal, never create a departure impulse.
              if((coordinate>=length && velocity>0)||(coordinate<=0 && velocity<0)){
                coordinate=coordinate>=length?length:0;brakeLoss+=.5*(loads[0]+loads[1])*velocity*velocity;velocity=0;
                topCar=coordinate===0?0:1;drainOpen=[topCar!==0,topCar!==1];phase='filling';
                if(topCar!==departureTop)trips++;else abortedTrips++;
                arrivalLoads.push({clock:now,topCar:topCar,counts:counts.slice()});if(arrivalLoads.length>12)arrivalLoads.shift();stationSupply();break;
              }
            }
          }
        }
        if(!Number.isFinite(coordinate+velocity)){error='The railway state is not finite.';B.setTapEnabled(false);}
      }
      updateReading();capture();
    }
    function draw(ctx,view){
      view=view||{};var palette=view.palette||getComputedStyle(document.documentElement),scale=view.scale||1;
      var accent=palette.getPropertyValue('--accent').trim(),dim=palette.getPropertyValue('--text-dim').trim(),rule=palette.getPropertyValue('--line-mid').trim(),body=palette.getPropertyValue('--bg-raised').trim(),text=palette.getPropertyValue('--text').trim();
      var positions=poses(),pulleys=spec.starts.map(function(p){return{x:p.x-40-ux*42,y:p.y-uy*42};});
      ctx.save();ctx.font=(12/Math.max(.7,scale))+'px "Commit Mono", monospace';ctx.textBaseline='middle';ctx.lineCap='round';ctx.lineJoin='round';
      ctx.strokeStyle=rule;ctx.lineWidth=1.5;
      spec.starts.forEach(function(p){[-6,6].forEach(function(offset){ctx.beginPath();ctx.moveTo(p.x-ux*12+offset,p.y-uy*12+32);ctx.lineTo(p.x+spec.dx+ux*12+offset,p.y+spec.dy+uy*12+32);ctx.stroke();});});
      ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(positions[0].x-40,positions[0].y);ctx.lineTo(pulleys[0].x,pulleys[0].y);ctx.lineTo(pulleys[1].x,pulleys[1].y);ctx.lineTo(positions[1].x-40,positions[1].y);ctx.stroke();
      pulleys.forEach(function(p){ctx.fillStyle=body;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.stroke();});
      ctx.fillStyle=dim;ctx.textAlign='center';ctx.fillText('Connecting cable',475,84);
      positions.forEach(function(p,k){
        ctx.strokeStyle=accent;ctx.fillStyle=body;ctx.lineWidth=1.25;
        localPolygons(k).forEach(function(v){ctx.beginPath();for(var i=0;i<v.length;i+=2){if(i)ctx.lineTo(p.x+v[i],p.y+v[i+1]);else ctx.moveTo(p.x+v[i],p.y+v[i+1]);}ctx.closePath();ctx.fill();ctx.stroke();});
        [-19,19].forEach(function(x){ctx.beginPath();ctx.arc(p.x+x,p.y+31,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();});
        ctx.beginPath();ctx.moveTo(p.x-40,p.y);ctx.lineTo(p.x-34,p.y);ctx.stroke();
        var fillPercent=Math.min(100,Math.round(100*counts[k]*spec.parcelMass/(spec.halfWidth*2*(spec.bottom-spec.top))));
        ctx.textAlign='left';ctx.fillStyle=text;ctx.fillText('Car '+(k?'B':'A'),p.x+44,p.y-18);
        ctx.fillStyle=dim;ctx.fillText(fillPercent+'% full',p.x+44,p.y-4);
        if(drainOpen[k])ctx.fillText('Draining',p.x+44,p.y+10);
        else if(phase==='filling' && k===topCar)ctx.fillText(enabled?'Filling':'Empty',p.x+44,p.y+10);
      });
      ctx.fillStyle=dim;ctx.textAlign='center';ctx.fillText(trips+' trips  /  '+Math.floor(trips/2)+' round trips',392,37);
      ctx.restore();
    }
    stationSupply();updateReading();await capture();if(error)throw Error(error);
    return {smoke:false,guests:guests,tick:tick,draw:draw,stats:function(){updateReading();return d.railwayReading;},capture:capture,
      primary:function(){enabled=!enabled;spec.enabled=enabled;d.action=enabled?'Stop water':'Start water';B.setTapEnabled(enabled&&phase==='filling');updateReading();return true;},
      destroy:function(){retired=true;buffers.forEach(function(b){b.destroy();});}};
    }catch(e){retired=true;buffers.forEach(function(b){try{b.destroy();}catch(ignored){}});throw e;}
  }
  var previous=root.WSSDraftRuntime;
  root.WSSDraftRuntime={create:async function(c){return c.definition.railway?create(c):previous&&previous.create?previous.create(c):null;}};
  root.WSSBallastRailway={make:make,create:create,advance:advance,countSource:COUNT_SOURCE};
  root.WSSMachines['ballast-railway']={make:make};
})(typeof window!=='undefined'?window:globalThis);
