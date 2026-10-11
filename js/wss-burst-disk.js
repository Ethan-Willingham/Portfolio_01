/* Opt-in ideal rupture disk. Current native pressure, not a mirror, opens it.
 * The membrane has zero deflection and zero fracture energy in this prototype.
 * It never recloses or adds displaced volume, momentum or pressure work.
 */
(function (root) {
  'use strict';
  var SOURCE = /* wgsl */ `
struct Config {domain:vec4<u32>,span:vec4<u32>,parameters:vec4<f32>};
struct Disk {cut:vec4<f32>,readings:vec4<f32>,latch:vec4<u32>,work:vec4<f32>};
struct Cell {fraction:f32,u:f32,v:f32,kind:u32,extra:vec4<f32>};
struct Label {current:u32,previous:u32};
struct Geometry {volume:vec4<f32>,faces:vec4<f32>};
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<storage,read_write> disk:Disk;
@group(0) @binding(2) var<storage,read_write> geometry:array<Geometry>;
@group(0) @binding(3) var<storage,read> cells:array<Cell>;
@group(0) @binding(4) var<storage,read> labels:array<Label>;
@group(0) @binding(5) var<storage,read> pressure:array<vec4<f32>>;
fn gauge(c:u32)->f32 {
  if(cells[c].kind==1u){return pressure[c].x;}
  if(cells[c].kind==2u){let r=labels[c].current;
    if(r>0u && r<=cfg.domain.x*cfg.domain.y){return pressure[r-1u].x;}}
  return 0.0;
}
@compute @workgroup_size(1)
fn burstStep(){
  var high=0.0;var low=0.0;var invalid=false;
  for(var k=cfg.span.x;k<cfg.span.y;k=k+1u){
    let a=select((cfg.domain.w-1u)*cfg.domain.x+k,k*cfg.domain.x+cfg.domain.w-1u,cfg.domain.z==0u);
    let b=a+select(cfg.domain.x,1u,cfg.domain.z==0u);
    high=high+gauge(a);low=low+gauge(b);
    invalid=invalid || geometry[a].volume.x>0.000001 || geometry[b].volume.x>0.000001;
  }
  high=high/f32(cfg.span.y-cfg.span.x);low=low/f32(cfg.span.y-cfg.span.x);
  let delta=(high-low)*select(-1.0,1.0,cfg.span.z==1u);
  invalid=invalid || !(abs(high)<1e8 && abs(low)<1e8 && abs(delta)<1e8);
  disk.latch.y=disk.latch.y+1u;
  if(invalid){disk.latch.w=1u;} // Fault remains closed, including after a rupture.
  if(disk.latch.w==0u && disk.latch.x==0u && delta>=cfg.parameters.x){
    disk.latch.x=1u;disk.latch.z=disk.latch.y;
    disk.work.z=delta;disk.work.w=f32(disk.latch.y)*cfg.parameters.z;
  }
  disk.readings=vec4<f32>(delta,high,low,max(disk.readings.w,delta));
  let open=select(0.0,1.0,disk.latch.x!=0u && disk.latch.w==0u);
  for(var k=cfg.span.x;k<cfg.span.y;k=k+1u){
    let a=select((cfg.domain.w-1u)*cfg.domain.x+k,k*cfg.domain.x+cfg.domain.w-1u,cfg.domain.z==0u);
    let b=a+select(cfg.domain.x,1u,cfg.domain.z==0u);
    if(cfg.domain.z==0u){geometry[a].faces.y=open;geometry[b].faces.x=open;}
    else{geometry[a].faces.w=open;geometry[b].faces.z=open;}
  }
}`;
  var NATIVE_DECLARATION = '\nstruct BurstDisk {cut:vec4<f32>,readings:vec4<f32>,latch:vec4<u32>,work:vec4<f32>};\n@group(0) @binding(17) var<storage,read> burstDisk:BurstDisk;\n';
  function variant(source) {
    return source.replace('const SCALE:f32=65536.0;', NATIVE_DECLARATION+'const SCALE:f32=65536.0;')
      .replace('for(var c=0u;c<cfg.counts.w;c=c+1u){\n  let cut=cfg.caps[c];',
        'for(var c=0u;c<cfg.counts.w+1u;c=c+1u){\n  var cut:vec4<f32>;\n  if(c==cfg.counts.w){if(burstDisk.latch.x!=0u && burstDisk.latch.w==0u){continue;}cut=burstDisk.cut;}else{cut=cfg.caps[c];}');
  }
  function normalize(value, width, height) {
    if (!value || !root.WSSBoundaries) throw new Error('Burst disk configuration is unavailable.');
    var cut=root.WSSBoundaries.normalizeCaps([value.opening])[0];
    if (!cut || cut.x0<=0 || cut.y0<=0 || cut.x1>=width || cut.y1>=height ||
        !Number.isFinite(value.strength) || value.strength<=0 || value.strength>=1e8 ||
        value.direction!==1 && value.direction!==-1) throw new Error('Burst disk needs an interior cut, positive strength and pressure direction.');
    return {opening:cut,strength:value.strength,direction:value.direction};
  }
  function create(instance, value, width, height) {
    var definition=normalize(value,width,height),cut=definition.opening,device=instance.device,queue=instance.queue;
    var state=device.createBuffer({label:'toy.burst.state',size:64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    var config=device.createBuffer({label:'toy.burst.config',size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    var initial=new Float32Array(16);initial.set([cut.axis==='x'?0:1,cut.at,cut.start,cut.end]);queue.writeBuffer(state,0,initial);
    var shader=device.createShaderModule({label:'toy.burst.disk',code:SOURCE}),pipeline=null,group=null,latest=null,destroyed=false;
    function pairs(w,h,dx) {
      var line=Math.round(cut.at/dx),first=Math.round(cut.start/dx),last=Math.round(cut.end/dx);
      if([cut.at,cut.start,cut.end].some(function(v){return Math.abs(v/dx-Math.round(v/dx))>1e-5;}) || first<0 || last<=first ||
          (cut.axis==='x' ? line<=0||line>=w||last>h : line<=0||line>=h||last>w)) throw new Error('Burst disk must span complete interior pressure faces.');
      var rows=[];for(var k=first;k<last;k++){var a=cut.axis==='x'?k*w+line-1:(line-1)*w+k;rows.push([a,a+(cut.axis==='x'?1:w),cut.axis==='x'?1:3,cut.axis==='x'?0:2]);}
      return {line:line,first:first,last:last,rows:rows};
    }
    function guardCaps(caps) {caps.forEach(function(c){
      var overlap=c.axis===cut.axis ? c.at===cut.at && c.start<cut.end && c.end>cut.start :
        c.at>=cut.start && c.at<=cut.end && cut.at>=c.start && cut.at<=c.end;
      if(overlap)throw new Error('A manual cap cannot overlap the burst disk.');
    });}
    return {buffer:state,definition:definition,guardCaps:guardCaps,
      readyPromise:shader.getCompilationInfo().then(function(info){var e=info.messages.filter(function(m){return m.type==='error';});if(e.length)throw new Error(e.map(function(m){return m.lineNum+': '+m.message;}).join('\n'));}),
      attach:function(model){
        if(!model || !model.enabled || !model.redBlack || model.cellSize!==8 || !model.settings.directGather ||
            !model.settings.nonlinearGas || model.settings.constitutiveLaw || !model.buffers || !model.buffers.pressure)
          throw new Error('Burst disk requires 8-pixel native red-black pressure, direct gather and nonlinear gas.');
        var p=pairs(model.width,model.height,model.cellSize),bytes=new ArrayBuffer(48),u=new Uint32Array(bytes),f=new Float32Array(bytes);
        u.set([model.width,model.height,cut.axis==='x'?0:1,p.line,p.first,p.last,definition.direction===1?1:0,0]);f.set([definition.strength,8,1/120,0],8);queue.writeBuffer(config,0,bytes);
        var layout=device.createBindGroupLayout({entries:[0,1,2,3,4,5].map(function(b){return {binding:b,visibility:GPUShaderStage.COMPUTE,buffer:{type:b===0?'uniform':b<3?'storage':'read-only-storage'}};})});
        pipeline=device.createComputePipeline({label:'toy.burst.step',layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:shader,entryPoint:'burstStep'}});
        var resources=[config,state,model.buffers.geometry,model.buffers.cells,model.buffers.labels,model.buffers.pressure];
        group=device.createBindGroup({layout:layout,entries:resources.map(function(buffer,b){return {binding:b,resource:{buffer:buffer}};})});
      },
      applyPressureCut:function(geometry,w,h,dx){pairs(w,h,dx).rows.forEach(function(r){
        if(geometry[r[0]*8]>1e-6 || geometry[r[1]*8]>1e-6 || geometry[r[0]*8+4+r[2]]!==1 || geometry[r[1]*8+4+r[3]]!==1)
          throw new Error('Burst disk needs unobstructed faces without another moving boundary.');
      });root.WSSBoundaries.closePressureFaces(geometry,w,h,dx,[cut]);},
      encode:function(encoder){if(!pipeline || destroyed)throw new Error('Burst disk native pipeline is unavailable.');var pass=encoder.beginComputePass({label:'toy.burst.step'});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();},
      read:function(bytes,offset,at){var f=new Float32Array(bytes,offset,16),u=new Uint32Array(bytes,offset,16);latest={opened:!!u[8],tick:u[9],burstTick:u[10],fault:u[11],differential:f[4],high:f[5],low:f[6],peak:f[7],pressureWorkJ:f[12],fractureWorkJ:f[13],burstDifferential:f[14],burstLocalSeconds:f[15],capturedAtMs:at,strength:definition.strength};return latest;},
      stats:function(){return latest ? Object.assign({},latest,{ageMs:Math.max(0,performance.now()-latest.capturedAtMs)}) : {opened:false,tick:0,burstTick:0,fault:0,strength:definition.strength,pressureWorkJ:0,fractureWorkJ:0,ageMs:null};},
      destroy:function(){destroyed=true;state.destroy();config.destroy();}
    };
  }
  root.WSSBurstDisk={create:create,variant:variant,normalize:normalize};
})(typeof window!=='undefined'?window:globalThis);
