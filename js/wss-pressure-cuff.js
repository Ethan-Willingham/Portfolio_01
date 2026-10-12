/* Two gas bladders squeeze the actual native-water channel between them. */
(function(root){
'use strict';root.WSSMachines=root.WSSMachines||{};function r(x,y,width,height){return{x:x,y:y,width:width,height:height};}
function make(w,o){
 o=o||{};var d=root.WSSMachines['cartesian-divers'].make(w,{seed:o.seed,squeezed:false}),source=r(64,80,224,304),receiver=r(432,264,224,120);
 d.name='pressure-cuff';d.title='Inflatable flow cuff';d.draft=true;delete d.source;d.draftGravity=1;
 d.vessels=[{id:'source',label:'Water supply',rect:source,sealed:false},{id:'receiver',label:'Outflow',rect:receiver,sealed:false}];
 d.pipes=[{points:[{x:272,y:232},{x:448,y:232}],bore:48}];d.vents=[r(344,200,32,24),r(344,248,32,24)];d.parts=[];d.solids=[r(296,208,16,16),r(296,240,16,16)];d.marks=[{label:'Supply orifice',a:{x:296,y:224},b:{x:312,y:224}}];
 d.initial=[{kind:'rect',rect:r(72,128,208,248)},{kind:'rect',rect:r(288,216,144,32)}];
 d.slimes=[{x:360,y:196,radius:20,density:1},{x:360,y:268,radius:20,density:1}];
 d.divers={noPiston:true,dryGas:false,squeezed:false,piston:r(8,8,0,0),stroke:0,speed:0,dragRate:0,viscosity:.6,pistonLabel:''};
 d.boundaries=null;
 d.cuff={blocked:!!o.blocked,pumpRate:1.5,maxRatio:3.2};d.primary={kind:'cuff-pump',target:r(328,96,144,28)};d.action='Inflate cuff';
 d.setup=o.blocked?'blocked':'pump';d.setups=[{id:'pump',label:'Inflating cuff',options:{}},{id:'blocked',label:'Pump disconnected',options:{blocked:true}}];
 d.setupNote='Both have the same native supply. The disconnected pump admits no gas. This is a water-vessel demonstration, not a medical measurement.';
 d.viewBounds=r(48,64,624,328);d.measure={source:source,receiver:receiver};
 d.caption='Pump gas into the two elastic bladders. Their actual skins narrow the flowing water channel; vent them to reopen it.';
 d.boundaryNote='The finite upper reservoir supplies the native flow by gravity through a fixed sixteen-pixel supply orifice. The gas inventory in each attached elastic bladder increases only while the declared pump runs, at 1.5 initial room-reference volumes per native second. The vent removes gas at the same rate down to its initial amount. Its isothermal target area uses current native exterior pressure through the existing gas-slime model. Outer skin nodes are clamped to two fixed supports. The bladders displace real native water in the intervening channel; no valve or assigned flow rate imitates the restriction. Readings sample actual native water pressure upstream and downstream.';
 d.energyBudgetStatus='A declared air pump supplies external work. Bladder inflation uses the existing Boyle-law elastic-gas approximation. Water, air pressure and moving collision skins stay native. This is a two-dimensional cuff analog with no artery, calibrated blood pressure or closed energy claim.';return d;
}
var previous=root.WSSDraftRuntime;
root.WSSDraftRuntime={create:function(c){
 if(!c.definition.cuff)return previous&&previous.create?previous.create(c):null;
 var d=c.definition,L=c.liquid,M=c.airModel,bodies=c.bodies,units=root.WaterMachinesInstruments.scale({width:720,density:1}),mode='idle',clock=L.simulationClock,retired=false,pending=false,reading=null,last=-Infinity,error=null,arrived=0,previousX=null,mirrorGen=-1;
 bodies.forEach(function(b){b.pressureCuffSkin=true;});
 var anchors=bodies.map(function(b,k){var out=[];for(var i=0;i<b.n;i++)if(k?b.py[i]>256:b.py[i]<208)out.push({node:i,x:b.px[i],y:b.py[i]});return out;});
 var probes=[{x:288,y:248},{x:416,y:248}],read=L.device.createBuffer({label:'toy.cuff.water.pressure',size:96,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 function capture(){var now=performance.now();if(pending||now-last<80||retired)return;last=now;pending=true;var enc=L.device.createCommandEncoder(),at=L.simulationClock;
 probes.forEach(function(p,k){var i=Math.floor(p.y/M.cellSize)*M.width+Math.floor(p.x/M.cellSize);enc.copyBufferToBuffer(M.buffers.pressure,i*16,read,k*48,16);enc.copyBufferToBuffer(M.buffers.cells,i*32,read,k*48+16,32);});L.queue.submit([enc.finish()]);
 read.mapAsync(GPUMapMode.READ).then(function(){if(retired){read.unmap();return;}var f=new Float32Array(read.getMappedRange()),u=new Uint32Array(f.buffer);reading={clock:at,upstream:u[7]===1?f[0]:null,downstream:u[19]===1?f[12]:null,kinds:[u[7],u[19]]};read.unmap();}).catch(function(e){error=e.message;}).finally(function(){pending=false;});}
 return {primary:function(){if(d.cuff.blocked){d.action='Pump disconnected';return true;}mode=mode==='pump'?'vent':'pump';d.action=mode==='pump'?'Vent cuff':'Inflate cuff';return true;},
 tick:function(){var dt=Math.max(0,L.simulationClock-clock);clock=L.simulationClock;
 bodies.forEach(function(b){var g=b.cartesianDiver;if(!d.cuff.blocked){var delta=mode==='pump'?1:mode==='vent'?-1:0;g.amount=Math.max(g.initialArea,Math.min(g.initialArea*d.cuff.maxRatio,g.amount+delta*g.initialArea*d.cuff.pumpRate*dt));g.target=root.WSSCartesianDivers.volume(g.amount,M.settings.atmospherePressure,g.absolute);}b.sleeping=false;b.sleepFrames=0;});capture();
 var receiver=0,sourceCount=0,a=L.liquid.arrays,n=L.liquid.getCount();if(L.readbackApplyGen!==mirrorGen){mirrorGen=L.readbackApplyGen;if(!previousX)previousX=new Float32Array(n);for(var i=0;i<n;i++){if(previousX[i]>0 && previousX[i]<400 && a.x[i]>=400 && a.y[i]>208 && a.y[i]<256)arrived++;previousX[i]=a.x[i];}}for(var i=0;i<n;i++){if(a.x[i]>440 && a.x[i]<648 && a.y[i]>264 && a.y[i]<376)receiver++;if(a.x[i]>72&&a.x[i]<280&&a.y[i]>88&&a.y[i]<376)sourceCount++;}
 var upper=Math.max.apply(null,bodies[0].py),lower=Math.min.apply(null,bodies[1].py),gap=Math.max(0,lower-upper);d.readingLabel='Gas '+(bodies[0].cartesianDiver.amount/bodies[0].cartesianDiver.initialArea).toFixed(1)+' x'+(reading&&reading.upstream!==null?'; upstream '+units.psi(reading.upstream).toFixed(2)+' psi':'');
 d.cuffReading={mode:mode,blocked:d.cuff.blocked,gap:gap,amounts:bodies.map(function(b){return b.cartesianDiver.amount/b.cartesianDiver.initialArea;}),pressure:reading,receiver:receiver,source:sourceCount,passed:arrived,error:error,finite:bodies.every(function(b){return [...b.px,...b.py,...b.ox,...b.oy].every(Number.isFinite);})};},
 load:function(b){var k=bodies.indexOf(b);if(k<0)return;anchors[k].forEach(function(a){b.px[a.node]=b.ox[a.node]=a.x;b.py[a.node]=b.oy[a.node]=a.y;});},stats:function(){return d.cuffReading;},destroy:function(){retired=true;read.destroy();bodies.forEach(function(b){delete b.pressureCuffSkin;});}};
}};
root.WSSMachines['pressure-cuff']={make:make};root.WSSPressureCuff={make:make};
})(typeof window!=='undefined'?window:globalThis);
