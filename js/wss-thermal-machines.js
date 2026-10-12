/* Finite native phase inventory and a lumped sensible/latent heat model. */
(function(root){
'use strict';
var PARCEL_GRAMS=Math.pow(1.25/24*.0254,2)*.0254*1000000,THERMAL_SPEED=15;
function r(x,y,w,h){return {x:x,y:y,width:w,height:h};}
function base(id,o){return {name:id,draft:true,seed:o.seed||17,settings:{enabled:false},vessels:[],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],boundaries:{pool:false,tap:null,drain:null,caps:[]},viewBounds:r(64,32,624,352),primary:{kind:'thermal-toggle'},setups:[],readingLabel:'Phase change',measure:{source:r(64,32,624,352),receiver:r(64,32,624,352)}};}
function ice(w,o){
 o=o||{};var d=base('melting-ice',o);root.WSSDraftBodies.shapes['thermal-ice']=['####','####','####','####','####','####'];
 d.title='Floating ice that melts';d.vessels=[{id:'bath',label:'Water bath',rect:r(152,144,416,240),sealed:false}];
 d.initial=[{kind:'rect',rect:r(160,288,400,88)},{kind:'rect',rect:r(344,216,32,48)}];d.slimes=[{x:360,y:240,radius:24,shape:'thermal-ice'}];d.draftRig=[];
 d.thermal={mode:'melt',heated:o.heated!==false,control:r(184,344,96,24),ice:r(344,216,32,48),latent:334,heaterW:120};
 d.action=d.thermal.heated?'Heater off':'Heater on';d.setups=[{id:'warm',label:'Heater on',options:{heated:true}},{id:'cold',label:'Zero-degree bath control',options:{heated:false}}];d.setup=o.heated===false?'cold':'warm';d.setupNote='Compare a zero-degree bath with the heater off. Drag the ice above the water to stop contact heat transfer.';
 d.caption='Drag the floating ice through the bath. The declared heater melts it into the same native water inventory.';
 d.boundaryNote='A stiff gel skin models an ice cube at relative density 0.917. Frozen native parcels carry its finite mass. A finite bath stores sensible heat (4.18 J/g/K), exchanges it only in water contact and receives the declared heater power. Absorbed heat pays the 334 J/g latent heat before those same parcels become water at the shrinking ice boundary. Thermal time runs 15 times faster than the physical clock. This is a lumped thermal model, not a resolved temperature field.';
 d.energyBudgetStatus='Thermal energy and phase mass are accounted separately. Established one-way buoyancy and elastic numerical work are not closed.';return d;
}
function pipe(w,o){
 o=o||{};var d=base('frozen-pipe',o);d.title='Frozen pipe';d.vessels=[{id:'pipe',label:'Enclosed pipe charge',rect:r(216,192,288,64),sealed:true},{id:'catcher',label:'Thaw collector',rect:r(160,296,400,88),sealed:false}];
 d.initial=[{kind:'rect',rect:r(224,200,272,48)}];d.thermal={mode:'freeze',heated:o.cooling!==false,control:r(264,160,176,24),ice:r(224,200,272,48),latent:334,coolerW:1200,strong:!!o.strong,wall:r(496,208,8,40),opening:{axis:'x',at:504,start:208,end:248}};
 d.vents=[r(496,208,16,40)];d.parts=[{id:'fracture',type:'valve',rect:d.thermal.wall,direction:'right',open:false,mass:1}];d.boundaries.caps=[d.thermal.opening];d.action=d.thermal.heated?'Stop cooling':'Start cooling';
 d.setups=[{id:'cool',label:'Cooling weak pipe',options:{cooling:true}},{id:'warm',label:'No cooling control',options:{cooling:false}},{id:'strong',label:'Strong pipe control',options:{cooling:true,strong:true}}];d.setup=o.strong?'strong':o.cooling===false?'warm':'cool';d.setupNote='The no-cooling charge stays liquid. The stronger wall supports the same freezing expansion without fracturing.';
 d.caption='Cooling freezes the enclosed charge. Expansion loads the pipe wall; a weak wall fractures and the thawed charge spills into the collector.';
 d.boundaryNote='The finite native charge uses a lumped enthalpy model and 0.917 ice density. Freezing expansion loads a constrained elastic shell (effective volume stiffness 20 MPa, wall radius 24 pixels, thickness 8 pixels). Hoop stress above strength breaks the actual native wall. After fracture the exposed charge absorbs heat from 20-degree ambient air at conductance 24 W/K. Thermal time runs 15 times faster than the physical clock. No timed fracture or assigned stream.';
 d.energyBudgetStatus='Phase mass and sensible/latent energy are tracked. The shell stress is a quasistatic reduced model, not a resolved crack or energy-conserving elastic pipe solver.';return d;
}
var SOURCE=`
struct P {region:vec4f, body:vec4f, state:vec4f, velocity:vec4f};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> flag:array<u32>;
@group(0) @binding(3) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> aux:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> phase:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> sums:array<atomic<u32>>;
@compute @workgroup_size(64) fn phaseStep(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.state.x)){return;}
 var s=phase[i];
 if(p.state.w<.5){
  let q=pos[i].xy;
  if(s.w<0. && all(q>=p.region.xy)&&all(q<p.region.zw)){
   let ticket=atomicAdd(&sums[0],1u);let local=q-p.body.xy;let extent=(p.region.zw-p.region.xy)*.5;let rank=s.z;s=vec4f(local,select(rank,f32(ticket),p.velocity.w>.5),select(2.,1.,p.velocity.w>.5));phase[i]=s;
   if(p.velocity.w<.5){flag[i]=32u;pos[i]=vec4f(pos[i].xy,0.,0.);affine[i]=vec4f(0.);}
  }return;
 }
 if(s.w==0. || s.w==3.){return;}
 if(p.velocity.w>.5 && p.velocity.z<.5){
  if(s.z<p.state.z){
   if(s.w==1.){phase[i]=vec4f(pos[i].xy-p.body.xy,s.z,2.);atomicAdd(&sums[2],1u);}
   pos[i]=vec4f(pos[i].xy,0.,0.);flag[i]=32u;affine[i]=vec4f(0.);
  }return;
 }
 if(s.z<p.state.y && s.w==2.){
   var q=pos[i].xy;
   // Melting releases the parcel at its current solid pose. Native skin contact supplies clearance.
   pos[i]=vec4f(q,0.,0.);aux[i]=vec4f(4.,0.,q);affine[i]=vec4f(0.);flag[i]=0u;
   phase[i].w=3.;atomicAdd(&sums[1],1u);
 }else if(s.w==2. && p.velocity.w<.5){let local=vec2f(p.velocity.x*s.x-p.velocity.y*s.y,p.velocity.y*s.x+p.velocity.x*s.y);pos[i]=vec4f(p.body.xy+local,0.,0.);flag[i]=32u;}
}
`;
function bodyAngle(b){var a=0,z=0;for(var i=0;i<b.n;i++){var x=b.rx[i]-b.rcx,y=b.ry[i]-b.rcy;a+=x*(b.px[i]-b.cx)+y*(b.py[i]-b.cy);z+=x*(b.py[i]-b.cy)-y*(b.px[i]-b.cx);}return Math.atan2(z,a);}
async function phaseModel(c){
 var d=c.definition,t=d.thermal,L=c.liquid,b=c.bodies[0],device=L.device,q=L.queue,U=GPUBufferUsage;
 var buffers=[];function buf(size,usage){var v=device.createBuffer({size:size,usage:usage});buffers.push(v);return v;}
 var params=buf(64,U.UNIFORM|U.COPY_DST),phase=buf(L.maxParticles*16,U.STORAGE|U.COPY_DST),sums=buf(12,U.STORAGE|U.COPY_SRC),read=buf(12,U.MAP_READ|U.COPY_DST);
 var a=L.liquid.arrays,n=L.liquid.getCount(),rows=[],birth=new Float32Array(n*4),ir=t.ice;
 for(var i=0;i<n;i++){var x=a.x[i],y=a.y[i];if(x>=ir.x&&x<ir.x+ir.width&&y>=ir.y&&y<ir.y+ir.height)rows.push({i:i,rank:Math.max(Math.abs(x-ir.x-ir.width/2)/(ir.width/2),Math.abs(y-ir.y-ir.height/2)/(ir.height/2))});}
 rows.sort(function(a,b){return b.rank-a.rank||a.i-b.i;});rows.forEach(function(v,k){birth[v.i*4+2]=k;birth[v.i*4+3]=-1;});q.writeBuffer(phase,0,birth);
 var mod=device.createShaderModule({code:SOURCE}),pipe=await device.createComputePipelineAsync({layout:'auto',compute:{module:mod,entryPoint:'phaseStep'}});
 var resources=[params,L.buf.pos,L.buf.flag,L.buf.affine,L.buf.aux,phase,sums];var group=device.createBindGroup({layout:pipe.getBindGroupLayout(0),entries:resources.map(function(v,i){return {binding:i,resource:{buffer:v}};})});
 var captured=false,pending=false,initialized=false,retired=false,error=null,iceCount=0,released=0,frozenTotal=0,energy=0,freeze=0,frozenAtFracture=0,thawHeat=0,fractured=false,clock=L.simulationClock,removed=false,bathEnergy=null,heaterInput=0,transferred=0,startArea=null,surface=null,fraction=null,scale=1,heated=t.heated,stats={};
 if(b){b.fluidDensityRatio=.917;b.thermalIce=true;}
 function bathContact(){
  if(!b || removed)return;
  if(L.getReadbackAge()>.3){delete b.fluidSurfaceY;delete b.fluidSubmergedFraction;surface=null;fraction=null;return;}
  var a=L.liquid.arrays,n=L.liquid.getCount(),bins=new Uint16Array(90*50),tops=new Float32Array(90*50),levels=[];tops.fill(Infinity);
  for(var i=0;i<n;i++){var x=a.x[i],y=a.y[i];if(a.frozen[i]||x<176||x>=544||y<144||y>=376||x>=b.bboxL-16&&x<=b.bboxR+16)continue;var cell=Math.floor(y/8)*90+Math.floor(x/8);bins[cell]++;tops[cell]=Math.min(tops[cell],y);}
  for(var col=22;col<68;col++){if(col*8>=b.bboxL-16&&col*8<=b.bboxR+16)continue;for(var row=18;row<47;row++)if(bins[row*90+col]>=10){levels.push(tops[row*90+col]-1.25);break;}}
  if(levels.length<6){delete b.fluidSurfaceY;delete b.fluidSubmergedFraction;surface=null;fraction=null;return;}
  levels.sort(function(a,b){return a-b;});surface=levels[Math.floor(levels.length/2)];b.fluidSurfaceY=surface;
  var ring=c.skinRing(b),cut=[];for(i=0;i<ring.length;i++){var p=ring[i],q=ring[(i+1)%ring.length],inP=p.y>=surface,inQ=q.y>=surface;if(inP)cut.push(p);if(inP!==inQ){var t=(surface-p.y)/(q.y-p.y);cut.push({x:p.x+t*(q.x-p.x),y:surface});}}
  function area(points){var sum=0;for(var k=0;k<points.length;k++){var p=points[k],q=points[(k+1)%points.length];sum+=p.x*q.y-p.y*q.x;}return Math.abs(sum)*.5;}
  fraction=Math.max(0,Math.min(1,area(cut)/Math.max(1e-6,area(ring))));b.fluidSubmergedFraction=fraction;
 }
 function update(){
  var now=L.simulationClock,dt=Math.max(0,now-clock)*c.nativeBoundary.stats().physicalSecondsPerSimulationSecond*THERMAL_SPEED;clock=now;if(!iceCount)return;if(t.mode==='melt')bathContact();
  // Parcel area 1.5625 px2, one-pixel depth; thermal parcel mass uses the shared 24 px/in, one-inch depth scale.
  var mass=iceCount*PARCEL_GRAMS,total=mass*t.latent;
  if(t.mode==='melt'){
   var bathMass=Math.max(0,L.liquid.getCount()-iceCount)*PARCEL_GRAMS,capacity=Math.max(.001,bathMass*4.18);if(bathEnergy===null)bathEnergy=capacity*(heated?20:0);var input=heated?t.heaterW*dt:0;heaterInput+=input;bathEnergy+=input;var contact=(b._wetCells||0)>0;var exchange=contact?Math.min(total-energy,bathEnergy,12*Math.max(0,bathEnergy/capacity)*dt):0;energy+=exchange;bathEnergy-=exchange;transferred+=exchange;
  }else if(!fractured){
   if(heated)energy=Math.min(total,energy+t.coolerW*dt);freeze=energy/total;
   var strain=freeze*(1/.917-1),pressure=20000000*strain,hoop=pressure*24/8,strength=t.strong?8000000:1000000;
   if(hoop>strength){fractured=true;t.fractured=true;frozenAtFracture=freeze;c.setManualValve(d.parts[0].buildId,true);c.nativeBoundary.setCaps([]);d.action='Pipe fractured';}
  }else{var ambient=Math.min(energy,480*dt);energy-=ambient;thawHeat+=ambient;}
  var melted=t.mode==='melt'?energy/total:fractured?Math.max(0,frozenAtFracture-energy/total):0;
  if(b && !removed){if(startArea===null)startArea=iceCount*1.5625/.917;scale=Math.sqrt(Math.max(.01,1-released/iceCount));c.growBody(b,0,startArea*Math.max(.01,1-released/iceCount));if(released>=iceCount && melted>=1){c.removeBody(b);removed=true;}}
  stats={mode:t.mode,thermalSpeed:THERMAL_SPEED,parcelGrams:PARCEL_GRAMS,iceParcels:iceCount,releasedParcels:released,solidParcels:(t.mode==='melt'?iceCount:frozenTotal)-released,massGrams:mass,energyJ:energy,latentJ:total,meltFraction:melted,freezeFraction:freeze,fractured:fractured,heaterOn:heated,scale:scale,bathEnergyJ:bathEnergy,heaterInputJ:heaterInput,transferredJ:transferred,releasedLatentJ:released*PARCEL_GRAMS*t.latent,phaseRemainderJ:(t.mode==='melt'?energy:thawHeat)-released*PARCEL_GRAMS*t.latent,thawHeatJ:thawHeat,totalFrozenParcels:frozenTotal,surfaceY:surface,submergedFraction:fraction,thermalContact:!!(b&&b._wetCells>0),error:error};
  if(t.mode==='freeze')Object.assign(stats,{expansionStrain:freeze*(1/.917-1),pressurePa:20000000*freeze*(1/.917-1),hoopStressPa:60000000*freeze*(1/.917-1),strengthPa:t.strong?8000000:1000000});
  d.readingLabel=t.mode==='melt'?'Ice '+Math.round((1-melted)*100)+'%':'Frozen '+Math.round(freeze*100)+'%; '+(fractured?'fractured':'intact');
 }
 var companion={error:null,beginFrame:function(enc,state){
  update();var region=t.ice,cx=b?b.cx:region.x+region.width/2,cy=b?b.cy:region.y+region.height/2;
  var radius=b?Math.sqrt(b.restArea/Math.PI):0;
  var target=stats.meltFraction||0;
  q.writeBuffer(params,0,new Float32Array([region.x,region.y,region.x+region.width,region.y+region.height,cx,cy,radius,scale,state.count,Math.floor(iceCount*target),iceCount*freeze,initialized?1:0,b?Math.cos(bodyAngle(b)):1,b?Math.sin(bodyAngle(b)):0,fractured?1:0,t.mode==='freeze'?1:0]));
 },beforeSubstep:function(enc,state){var pass=enc.beginComputePass();pass.setPipeline(pipe);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(state.count/64));pass.end();initialized=true;},afterSubstep:function(){},captureFrame:function(enc){if(!pending){pending=true;captured=true;enc.copyBufferToBuffer(sums,0,read,0,12);}},afterSubmit:function(){if(!captured)return;captured=false;read.mapAsync(GPUMapMode.READ).then(function(){if(!retired){var v=new Uint32Array(read.getMappedRange());iceCount=v[0];released=v[1];frozenTotal=v[2];}read.unmap();}).catch(function(e){error=e.message;companion.error=error;}).finally(function(){pending=false;});}};
 L.setToyMembrane(companion);
 return {tick:update,load:function(body){
  if(!b || removed || body!==b)return;
  var cx=0,cy=0,rx=0,ry=0;for(var i=0;i<b.n;i++){cx+=b.px[i];cy+=b.py[i];rx+=b.rx[i];ry+=b.ry[i];}cx/=b.n;cy/=b.n;rx/=b.n;ry/=b.n;
  var a=0,z=0;for(i=0;i<b.n;i++){var x=b.rx[i]-rx,y=b.ry[i]-ry;a+=x*(b.px[i]-cx)+y*(b.py[i]-cy);z+=x*(b.py[i]-cy)-y*(b.px[i]-cx);}
  var angle=Math.atan2(z,a),co=Math.cos(angle),si=Math.sin(angle);for(i=0;i<b.n;i++){var dx=b.px[i]-b.ox[i],dy=b.py[i]-b.oy[i],x=b.rx[i]-rx,y=b.ry[i]-ry;b.px[i]=cx+co*x-si*y;b.py[i]=cy+si*x+co*y;b.ox[i]=b.px[i]-dx;b.oy[i]=b.py[i]-dy;}
 },primary:function(){if(fractured)return true;heated=!heated;d.action=heated?(t.mode==='melt'?'Heater off':'Stop cooling'):(t.mode==='melt'?'Heater on':'Start cooling');return true;},stats:function(){return stats;},draw:function(ctx){
  var style=getComputedStyle(document.documentElement);ctx.strokeStyle=style.getPropertyValue('--text-dim').trim();ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1;ctx.strokeRect(t.control.x,t.control.y,t.control.width,t.control.height);ctx.font='11px Commit Mono';ctx.fillText(t.mode==='melt'?'Declared heater':'Declared cooler',t.control.x+6,t.control.y+16);
  if(t.mode==='freeze'){ctx.fillStyle=style.getPropertyValue('--app-brass').trim();ctx.globalAlpha=.5;var a=L.liquid.arrays;for(var i=0;i<L.liquid.getCount();i++)if(a.frozen[i]&&a.x[i]>=t.ice.x&&a.x[i]<=t.ice.x+t.ice.width&&a.y[i]>=t.ice.y&&a.y[i]<=t.ice.y+t.ice.height)ctx.fillRect(a.x[i]-.7,a.y[i]-.7,1.4,1.4);ctx.globalAlpha=1;}
 },destroy:function(){retired=true;L.setToyMembrane(null);if(b){delete b.thermalIce;delete b.fluidDensityRatio;delete b.fluidSurfaceY;delete b.fluidSubmergedFraction;}buffers.forEach(function(v){v.destroy();});}};
}
var previous=root.WSSDraftRuntime;root.WSSDraftRuntime={create:function(c){if(!c.definition.thermal)return previous&&previous.create?previous.create(c):null;return phaseModel(c);}};
root.WSSThermalMachines={ice:ice,pipe:pipe};root.WSSMachines=root.WSSMachines||{};root.WSSMachines['melting-ice']={make:ice};root.WSSMachines['frozen-pipe']={make:pipe};
})(typeof window!=='undefined'?window:globalThis);
