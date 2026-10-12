/* Open sauna: finite hot stones evaporate native water; a mixed room warms guests.
 * Vapor leaves the liquid as frozen native slots. Its white tracer uses the
 * existing air solver; pressure, condensation and room mixing are approximate. */
(function(root){
  'use strict';
  var MASS=Math.pow(1.25/24*.0254,2)*.0254*1000;
  var CP=MASS*4180, LATENT=MASS*2256400, BOIL=80*CP+LATENT;
  var SOURCE=`
struct Params {step:vec4f, stones:vec4f, heat:vec4f, fuel:vec4f};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> flags:array<u32>;
// Enthalpy above room water and phase (0 liquid, 1 escaped vapor).
@group(0) @binding(3) var<storage,read_write> parcels:array<vec2f>;
@group(0) @binding(4) var<storage,read_write> sums:array<atomic<u32>>;
// Stone temperature, input, ambient loss, heat given to water, current dose.
@group(0) @binding(5) var<storage,read_write> stone:array<f32>;
@group(0) @binding(6) var<storage,read_write> fuel:array<f32>;
fn liquid(i:u32)->bool{return (flags[i]&163u)==0u && parcels[i].y<.5;}
fn touching(i:u32)->bool{
 let d=max(max(p.stones.xy-pos[i].xy,pos[i].xy-p.stones.zw),vec2f(0.));
 return dot(d,d)<=25.;
}
fn contactEnthalpy()->f32{
 return min(p.heat.y,p.heat.z*max(0.,min(stone[0],100.)-20.)+select(0.,p.heat.w,stone[0]>100.));
}
@compute @workgroup_size(64) fn contact(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y)){return;}
 // A tool or native upload must never revive a parcel that already evaporated.
 if(parcels[i].y>.5){flags[i]=flags[i]|32u;return;}
 if(liquid(i) && touching(i)){
  atomicAdd(&sums[0],1u);
  atomicAdd(&sums[1],u32(ceil(max(0.,contactEnthalpy()-parcels[i].x)*64.)));
 }
}
@compute @workgroup_size(1) fn heat(){
 stone[6]=contactEnthalpy();let dt=p.step.x;
 // Exchange stored sensible heat on the same GPU queue as the fire. The
 // signed dose leaves one reservoir and enters the other exactly once.
 let reduced=p.fuel.x*p.heat.x/(p.fuel.x+p.heat.x);
 let input=reduced*(fuel[0]-stone[0])*(1.-exp(-p.fuel.y*dt/reduced));
 fuel[0]-=input/p.fuel.x;fuel[21]+=input;
 stone[0]+=input/p.heat.x;stone[1]+=input;
 let loss=p.heat.x*max(0.,stone[0]-20.)*(1.-exp(-1.2*dt/p.heat.x));
 stone[0]-=loss/p.heat.x;stone[2]+=loss;
 let need=f32(atomicLoad(&sums[1]))/64.;stone[5]=need;
 // Below boiling the same contact still warms water. Only fully paid
 // sensible plus latent heat can remove a native parcel from the liquid.
 let wet=f32(atomicLoad(&sums[0]));
 let available=p.heat.x*max(0.,stone[0]-select(20.,100.,stone[6]>=p.heat.y));
 let conductance=wet*18.*max(0.,stone[0]-100.)+wet*2.*max(0.,min(stone[0],100.)-20.);
 let dose=min(min(available,need),min(100000.,conductance)*dt);
 stone[0]-=dose/p.heat.x;stone[3]+=dose;stone[4]=dose;
}
@compute @workgroup_size(64) fn evaporate(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y)){return;}
 if(liquid(i) && touching(i) && stone[5]>0.){
  let need=max(0.,stone[6]-parcels[i].x);
  parcels[i].x=min(p.heat.y,parcels[i].x+stone[4]*need/stone[5]);
  if(parcels[i].x>=p.heat.y){
   parcels[i].y=1.;flags[i]=(flags[i]&0x0000000fu)|32u;
  }
 }
 if(parcels[i].y>.5){
  atomicAdd(&sums[2],1u);atomicAdd(&sums[3],u32(parcels[i].x*64.));
 }else if((flags[i]&131u)==0u){
  atomicAdd(&sums[4],1u);atomicAdd(&sums[5],u32(parcels[i].x*64.));
 }
}
`;
  async function create(options){
    var L=options.liquid,device=L.device,queue=L.queue,U=GPUBufferUsage;
    var spec=options.definition.sauna,fluid=options.fluid,bodies=options.bodies,fuel=options.fire.heatState();
    var buffers=[],retired=false,pending=false,error=null,receivedClock=0;
    function buffer(label,size,usage){var b=device.createBuffer({label:'toy.sauna.'+label,size:size,usage:usage});buffers.push(b);return b;}
    try{
      var params=buffer('params',64,U.UNIFORM|U.COPY_DST);
      var parcels=buffer('parcels',options.maxParticles*8,U.STORAGE);
      var sums=buffer('sums',32,U.STORAGE|U.COPY_DST|U.COPY_SRC);
      var stones=buffer('stones',32,U.STORAGE|U.COPY_DST|U.COPY_SRC);
      var read=buffer('read',64,U.COPY_DST|U.MAP_READ);
      var latest=new Float32Array(8);latest[0]=spec.initialC;
      var counts=new Uint32Array(8),initialHeat=spec.capacity*(spec.initialC-20);
      queue.writeBuffer(stones,0,latest);
      var module=device.createShaderModule({label:'toy.sauna.phase',code:SOURCE});
      var info=await module.getCompilationInfo();
      var errors=info.messages.filter(function(m){return m.type==='error';});
      if(errors.length)throw Error(errors.map(function(m){return m.message;}).join('; '));
      var resources=[params,L.buf.pos,L.buf.flag,parcels,sums,stones,fuel.buffer],pipelines={},groups={};
      for(var key of ['contact','heat','evaporate']){
        pipelines[key]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:key}});
        var bindings=key==='heat'?[0,4,5,6]:[0,1,2,3,4,5];
        groups[key]=device.createBindGroup({layout:pipelines[key].getBindGroupLayout(0),entries:bindings.map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
      }
    }catch(e){buffers.forEach(function(b){b.destroy();});throw e;}
    var clock=0,roomC=20,bathC=20,steamCredit=0,vaporSeen=0,steamSamples=0;
    var guestStates=new WeakMap(),sampleAcc=0,field=null;
    function tick(dt,water,fire){
      if(retired || error || !(dt>0))return;
      dt=Math.min(.1,dt);clock+=dt;
      var r=spec.stones;
      queue.writeBuffer(params,0,new Float32Array([dt,water.count,0,water.clock,r.x,r.y,r.x+r.width,r.y+r.height,spec.capacity,BOIL,CP,LATENT,fuel.capacity,4,0,0]));
      queue.writeBuffer(sums,0,new Uint32Array(8));
      var encoder=device.createCommandEncoder({label:'toy.sauna.contact-and-phase'});
      for(var name of ['contact','heat','evaporate']){
        var pass=encoder.beginComputePass();pass.setPipeline(pipelines[name]);pass.setBindGroup(0,groups[name]);
        pass.dispatchWorkgroups(name==='heat'?1:Math.max(1,Math.ceil(water.count/64)));pass.end();
      }
      var capture=!pending;
      if(capture){encoder.copyBufferToBuffer(stones,0,read,0,32);encoder.copyBufferToBuffer(sums,0,read,32,32);pending=true;}
      queue.submit([encoder.finish()]);
      if(capture)read.mapAsync(GPUMapMode.READ).then(function(){
        if(!retired){
          var data=read.getMappedRange();latest=new Float32Array(data,0,8).slice();counts=new Uint32Array(data,32,8).slice();
          var fresh=Math.max(0,counts[2]-vaporSeen);vaporSeen=counts[2];steamCredit+=fresh;
          // A vented, well-mixed room model. The remainder of vapor enthalpy
          // leaves through the open vent; this is not a sealed gas solver.
          roomC=Math.min(95,roomC+fresh*BOIL*.20/550);
          receivedClock=water.clock;
        }
        read.unmap();
      }).catch(function(e){error=e.message;}).finally(function(){pending=false;});
      roomC=20+(roomC-20)*Math.exp(-dt/32);
      bathC+=(roomC-bathC)*(1-Math.exp(-dt/12));
      var dose=Math.min(48,steamCredit);
      if(dose>0){
        steamCredit-=dose;var old=fluid.getPhysics();
        fluid.setPhysics({HEAT:.45,COOLING:.18,BUOYANCY:140},0);
        var x=r.x+r.width*.5,y=r.y-7;
        fluid.splat(x/options.width,1-y/options.height,0,18,{r:dose*.055,g:dose*.053,b:dose*.05},.038);
        fluid.setPhysics(old,0);steamSamples++;
      }
      // Sample only four times per simulated second, using a tiny target.
      sampleAcc+=dt;
      if(sampleAcc>=.25){sampleAcc=0;field=fluid.sampleTemperature(24,16);}
    }
    function react(dt,stepH,timescale,held){
      if(!(dt>0) || retired)return;
      var room=spec.room;
      bodies.forEach(function(b){
        var g=guestStates.get(b);
        if(!g){g={temperatureC:20,mood:'Cool',nextMotion:0,hue:b.hue};guestStates.set(b,g);}
        var inside=b.cx>room.x && b.cx<room.x+room.width && b.cy>room.y && b.cy<room.y+room.height;
        var localC=20;
        if(inside && field){
          var col=Math.max(0,Math.min(23,Math.floor(b.cx/options.width*24)));
          var row=Math.max(0,Math.min(15,Math.floor(b.cy/options.height*16)));
          localC=Math.min(80,field.kelvin[row*24+col]-273.15);
        }
        var target=inside ? Math.max(.8*roomC+.2*bathC,localC) : 20;
        g.temperatureC+=(target-g.temperatureC)*(1-Math.exp(-dt/2.5));
        // Hysteresis prevents the guest switching moods at one threshold.
        if(g.temperatureC>=46)g.mood='Too hot';
        else if(g.mood==='Too hot' && g.temperatureC>=42){}
        else g.mood=g.temperatureC>=29?'Relaxed':'Cool';
        g.nextMotion-=dt;
        if(!held(b) && inside && g.nextMotion<=0 && g.mood!=='Cool'){
          var hot=g.mood==='Too hot';g.nextMotion=hot ? .65 : 1.8;
          var dx=hot ? (b.cx>spec.bath.x+spec.bath.width*.5?-1:1)*12 : Math.sin(clock*2)*2;
          for(var i=0;i<b.n;i++){
            var upper=Math.max(0,Math.min(1,(b.cy-b.py[i])/Math.max(1,b.surfaceSlime.radius)));
            b.ox[i]-=dx*stepH/timescale;
            b.oy[i]-=(hot?-22:-3)*upper*stepH/timescale;
          }
          b.sleeping=false;b.sleepFrames=0;
        }
      });
    }
    function stats(){
      return {stonesC:latest[0],roomC:roomC,bathC:bathC,evaporatedParcels:counts[2],liquidParcels:counts[4],wetParcels:counts[0],steamSamples:steamSamples,
        heatInputJ:latest[1],heatLossJ:latest[2],waterHeatJ:latest[3],vaporHeatJ:counts[3]/64,liquidHeatJ:counts[5]/64,
        heatResidualJ:initialHeat+latest[1]-latest[2]-spec.capacity*(latest[0]-20)-latest[3],
        contactClock:receivedClock,error:error,
        guests:bodies.map(function(b){var g=guestStates.get(b);return {x:b.cx,y:b.cy,temperatureC:g?g.temperatureC:20,mood:g?g.mood:'Cool'};}),
        approximation:'Finite stones heat native water on contact. Each parcel pays sensible and latent heat before leaving the liquid. Vapor is represented by an advected white tracer and retained inactive liquid slots. Twenty percent of vapor enthalpy heats a well-mixed vented room; bath and guest temperatures relax toward it. Pressure, condensation, detailed heat transport and biological comfort are approximate.'};
    }
    function draw(c,palette){
      var r=spec.stones;c.save();c.fillStyle=palette.accent;
      c.globalAlpha=.2+.45*Math.max(0,Math.min(1,(latest[0]-80)/280));c.fillRect(r.x,r.y,r.width,r.height);c.globalAlpha=1;
      if(options.fire.stats().burning){
        var f=options.definition.fire,sway=Math.sin(clock*13)*2;
        c.fillStyle=palette.clay;c.beginPath();c.moveTo(f.x-9,f.y+5);
        c.bezierCurveTo(f.x-16,f.y-7,f.x+sway,f.y-11,f.x+sway,f.y-26);
        c.bezierCurveTo(f.x+13,f.y-13,f.x+15,f.y,f.x+9,f.y+5);c.closePath();c.fill();
        c.fillStyle=palette.accent;c.beginPath();c.ellipse(f.x,f.y-2,4,9,0,0,Math.PI*2);c.fill();
      }
      c.fillStyle=palette.text;c.fillText('Stones '+Math.round(latest[0]*1.8+32)+' F',r.x-22,r.y+55);
      c.fillText('Vent',spec.vent.x-36,spec.vent.y-12);
      c.fillText('Sauna '+Math.round(roomC*1.8+32)+' F',roomLabelX(),spec.room.y+32);
      c.fillText('Bath',spec.bath.x+12,spec.bath.y+spec.bath.height-12);
      bodies.forEach(function(b){
        var g=guestStates.get(b);if(!g)return;
        var blush=Math.max(0,Math.min(.42,(g.temperatureC-29)/55));
        if(blush>0 && b.ringN){
          c.save();c.beginPath();for(var i=0;i<b.ringN;i++){var p=b.ring[i];if(i)c.lineTo(b.px[p],b.py[p]);else c.moveTo(b.px[p],b.py[p]);}c.closePath();c.clip();
          c.fillStyle=palette.coral;c.globalAlpha=blush;c.beginPath();c.ellipse(b.cx,b.cy-4,b.surfaceSlime.radius*.7,b.surfaceSlime.radius*.4,0,0,Math.PI*2);c.fill();c.restore();
        }
        c.fillStyle=palette.text;c.textAlign='center';c.fillText(g.mood+' '+Math.round(g.temperatureC*1.8+32)+' F',b.cx,b.bboxT-18);c.textAlign='left';
      });c.restore();
    }
    function roomLabelX(){return spec.room.x+spec.room.width*.48;}
    return {tick:tick,react:react,stats:stats,draw:draw,heatState:function(){return {buffer:stones,capacity:spec.capacity};},destroy:function(){retired=true;buffers.forEach(function(b){try{b.destroy();}catch(e){}});}};
  }
  root.WSSSauna={create:create};
})(typeof window!=='undefined'?window:globalThis);
