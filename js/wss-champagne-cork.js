/* Stored native bottle air drives an ordinary gel cork. No authored launch impulse. */
(function(root){
 'use strict';
 function rect(x,y,w,h){return{x:x,y:y,width:w,height:h};}
 function make(world,o){
  o=o||{};var d=root.WSSMachines['cartesian-divers'].make(world,{seed:o.seed,squeezed:false}),jar=rect(240,144,240,240);
  d.name='champagne-cork';d.title='Pressure-launched cork';d.draft=true;d.draftGravity=1;d.setups=[{id:'sealed',label:'Sealed bottle',options:{}},{id:'vented',label:'Open air vent',options:{vented:true}},{id:'unpressurized',label:'No compression',options:{pumped:false}}];d.setup=o.vented?'vented':o.pumped===false?'unpressurized':'sealed';d.setupNote='Each comparison starts with the same cork and water. The open vent releases pressure; no compression leaves the piston still.';delete d.source;
  d.vessels=[{id:'bottle',label:'Sealed bottle air',rect:jar,sealed:true},{id:'cup',label:'Water reference',rect:rect(80,304,80,80),sealed:false}];
  d.vents=[rect(328,136,64,24)];if(o.vented)d.vents.push(rect(232,200,24,24));
  d.pipes=[];d.parts=[];d.initial=[{kind:'rect',rect:rect(88,344,64,32)}];d.slimes=[{x:360,y:124,radius:42,density:1}];
  d.divers={dryGas:true,vented:!!o.vented,squeezed:o.pumped!==false,piston:rect(240,352,240,16),stroke:-104,speed:64,dragRate:0,viscosity:.6,pistonLabel:'Driven gas compressor',pistonRodEndY:392,pistonLabelY:376,labels:{on:'Release cork',off:'Release cork'}};
  d.primary={kind:'cork-release'};d.action='Release cork';d.cork={vented:!!o.vented,pumped:o.pumped!==false,density:.4,maxAge:.12,fixedArea:true};
  d.viewBounds=rect(184,16,368,368);d.caption='The moving piston compresses real bottle air. Release the latch to launch the cork, or compare an open vent that cannot store pressure.';
  d.boundaryNote='A visible motor compresses native trapped air while a declared latch holds the elastic cork. Releasing removes only the latch. Pressure is sampled just outside each actual cork edge; inward pressure traction, integrated over edge length, accelerates its existing nodes. Its mass is 0.4 times water density times its initial two-dimensional area, split equally across nodes. The separate water cup keeps the native MLS-MPM pressure solve active. The ordinary soft-body contact solver handles the bottle rim; no ejection impulse or path is assigned.';
  d.divers.fixedArea=true;d.energyBudgetStatus='The compressor is declared external work. The native geometric gas inventory obeys the existing isothermal closure. Boundary force uses gauge pressure in native mass/length/time units and a one-pixel extrusion depth. The gel receives that load, but this sampled one-way traction is not a closed energy-conserving two-way rigid-body solve; gas pressure updates from its changing collision geometry. No fermentation or dissolved carbon dioxide model is claimed.';
  d.measure={source:jar,receiver:jar};return d;
 }
 var previous=root.WSSDraftRuntime;
 function create(c){
  if(!c.definition.cork)return previous&&previous.create?previous.create(c):null;
  var L=c.liquid,M=c.airModel,b=c.bodies[0],d=c.definition,locked=true,retired=false,pending=false,last=-Infinity,field=null,forces=null,error=null,impulseX=0,impulseY=0,peakPressure=0,samples=0;
  var units=root.WaterMachinesInstruments.scale({width:720,density:1});
  var initial={x:Array.from(b.px),y:Array.from(b.py),cx:b.cx,cy:b.cy},area=root.WSSCartesianDivers.area(b),mass=area*d.cork.density,massPoint=mass/b.n;
  var bytes=M.width*M.height*56,read=L.device.createBuffer({label:'toy.cork.boundary.pressure',size:bytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  function edges(){var out=[];for(var k=0;k<b.ringN;k++){var i=b.ring[k],j=b.ring[(k+1)%b.ringN],ex=b.px[j]-b.px[i],ey=b.py[j]-b.py[i],len=Math.hypot(ex,ey);if(!len)continue;var x=(b.px[i]+b.px[j])*.5,y=(b.py[i]+b.py[j])*.5,nx=ey/len,ny=-ex/len;if(nx*(x-b.cx)+ny*(y-b.cy)<0){nx=-nx;ny=-ny;}out.push({i:i,j:j,x:x,y:y,nx:nx,ny:ny,len:len});}return out;}
  function capture(){
   var now=performance.now();if(retired||pending||now-last<30)return;last=now;pending=true;
   var clock=L.simulationClock,cx=b.cx,cy=b.cy,pose=edges(),enc=L.device.createCommandEncoder();enc.copyBufferToBuffer(M.buffers.pressure,0,read,0,M.width*M.height*16);enc.copyBufferToBuffer(M.buffers.cells,0,read,M.width*M.height*16,M.width*M.height*32);enc.copyBufferToBuffer(M.buffers.labels,0,read,M.width*M.height*48,M.width*M.height*8);L.queue.submit([enc.finish()]);
   read.mapAsync(GPUMapMode.READ).then(function(){if(retired){read.unmap();return;}var f=new Float32Array(read.getMappedRange()),u=new Uint32Array(f.buffer),base=M.width*M.height*4,labelBase=M.width*M.height*12;
    forces=pose.map(function(e){var col=Math.floor((e.x+e.nx*(M.cellSize+1))/M.cellSize),row=Math.floor((e.y+e.ny*(M.cellSize+1))/M.cellSize),p=0,kind=0;if(col>=0&&row>=0&&col<M.width&&row<M.height){var at=row*M.width+col;kind=u[base+at*8+3];if(kind===2){var rootId=u[labelBase+at*2];if(rootId>0&&rootId<=M.width*M.height&&Number.isFinite(f[(rootId-1)*4]))p=f[(rootId-1)*4];}}peakPressure=Math.max(peakPressure,p);return Object.assign(e,{p:p,kind:kind});});field={clock:clock,cx:cx,cy:cy};samples++;read.unmap();
   }).catch(function(e){if(!retired)error=e.message;}).finally(function(){pending=false;});
  }
  return {primary:function(){locked=false;d.action='Cork released';return true;},tick:function(){d.readingLabel='Peak gas '+units.psi(peakPressure).toFixed(1)+' psi; '+(locked?'latched':'released');b.cartesianDiver.target=area;b.restArea=area;capture();d.corkReading={locked:locked,vented:d.cork.vented,pumped:d.cork.pumped,mass:mass,samples:samples,peakPressure:peakPressure,impulseY:impulseY,dy:b.cy-initial.cy,error:error};},
   load:function(body,h,timescale){if(body!==b)return;if(locked){for(var i=0;i<b.n;i++){b.px[i]=b.ox[i]=initial.x[i];b.py[i]=b.oy[i]=initial.y[i];}b.cx=initial.cx;b.cy=initial.cy;return;}
    if(!field||!forces||L.simulationClock-field.clock>d.cork.maxAge||Math.hypot(b.cx-field.cx,b.cy-field.cy)>M.cellSize*2)return;
    var dt=h/timescale;if(!(dt>0&&Number.isFinite(dt)))return;
    forces.forEach(function(e){if(e.kind!==2)return;var fx=-e.p*e.nx*e.len,fy=-e.p*e.ny*e.len,amount=.5*dt*dt/massPoint;
     b.px[e.i]+=fx*amount;b.py[e.i]+=fy*amount;b.px[e.j]+=fx*amount;b.py[e.j]+=fy*amount;impulseX+=fx*dt;impulseY+=fy*dt;});b.sleeping=false;b.sleepFrames=0;
   },stats:function(){return{locked:locked,vented:d.cork.vented,pumped:d.cork.pumped,mass:mass,samples:samples,peakPressure:peakPressure,impulseX:impulseX,impulseY:impulseY,dx:b.cx-initial.cx,dy:b.cy-initial.cy,sampleClock:field&&field.clock,error:error};},destroy:function(){retired=true;read.destroy();}};
 }
 root.WSSDraftRuntime={create:create};root.WSSMachines['champagne-cork']={make:make};root.WSSChampagneCork={make:make};
})(typeof window!=='undefined'?window:globalThis);
