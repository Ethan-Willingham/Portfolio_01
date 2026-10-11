/* Toy-only MLS-MPM boundaries. No separate liquid or prescribed machine flow. */
(function (global) {
  'use strict';
  var PARKED_FLAG = 128, EVENT_CAP = 256, LEDGER_WORDS = 32;
  var SOURCE = /* wgsl */ `
struct Config {
  counts:vec4<u32>, tap:vec4<f32>, velocity:vec4<f32>, world:vec4<f32>,
  drain:vec4<f32>, units:vec4<f32>, atlas:vec4<f32>, frame:vec4<u32>,
  caps:array<vec4<f32>,16>,
};
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<storage,read_write> pos:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> affine:array<vec4<f32>>;
@group(0) @binding(3) var<storage,read_write> aux:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read_write> flags:array<u32>;
@group(0) @binding(5) var<storage,read_write> slots:array<vec4<u32>>;
@group(0) @binding(6) var<storage,read_write> ledger:array<atomic<u32>>;
@group(0) @binding(7) var<storage,read_write> freeIds:array<u32>;
@group(0) @binding(8) var<storage,read_write> atlas:array<atomic<u32>>;
@group(0) @binding(9) var<storage,read_write> previous:array<vec4<f32>>;
@group(0) @binding(10) var<storage,read_write> events:array<vec4<f32>>;
@group(0) @binding(11) var<storage,read> terrain:array<u32>;
struct Grid {count:u32,w:u32,h:u32,ox:u32,oy:u32,cells:u32,dt:f32,inv:f32,
 cols:f32,tile:f32,rows:f32,pad:f32,tc:u32,tr:u32,tw:u32,th:u32,region:vec4<f32>};
@group(0) @binding(12) var<uniform> grid:Grid;
struct Chunk {counts:vec4<u32>,energy:vec4<f32>};
@group(0) @binding(13) var<storage,read_write> chunks:array<Chunk>;
struct WallEdit {rect:vec4<f32>,controls:vec4<u32>,bodies:array<vec4<f32>,16>};
@group(0) @binding(14) var<uniform> wallEdit:WallEdit;
@group(0) @binding(15) var<storage,read_write> wallCandidates:array<vec4<f32>>;
@group(0) @binding(16) var<storage,read_write> wallStatus:array<atomic<u32>>;
const SCALE:f32=65536.0;
fn value(i:u32)->f32{return bitcast<f32>(atomicLoad(&ledger[i]));}
fn put(i:u32,v:f32){atomicStore(&ledger[i],bitcast<u32>(v));}
fn finite(p:vec4<f32>)->bool{return all(p==p)&&all(abs(p)<vec4<f32>(1e8));}
fn energy(p:vec4<f32>)->f32{return cfg.units.w*(0.5*dot(p.zw,p.zw)+cfg.world.w*(cfg.world.z-p.y));}
fn solid(p:vec2<f32>)->bool{
 let x=i32(floor(p.x/grid.tile))-bitcast<i32>(grid.tc);
 let y=i32(floor(p.y/grid.tile))-bitcast<i32>(grid.tr);
 if(x<0||y<0||x>=i32(grid.tw)||y>=i32(grid.th)){return false;}
 let q=u32(y)*grid.tw+u32(x);return ((terrain[q>>5u]>>(q&31u))&1u)!=0u;
}
fn emit(p:vec2<f32>,loss:f32){
 if(!(loss>1e-12)){return;}
 let e=atomicAdd(&ledger[11],1u);
 if(e>=256u){atomicAdd(&ledger[12],1u);return;}
 events[e*2u]=vec4<f32>(p,loss,f32(atomicLoad(&ledger[15])));
 events[e*2u+1u]=vec4<f32>(f32(atomicLoad(&ledger[16])),value(10u),0.0,0.0);
}
fn reset(i:u32,p:vec4<f32>,present:bool){
 pos[i]=p;affine[i]=vec4<f32>(0.0);aux[i]=vec4<f32>(4.0,0.0,p.xy);
 previous[i*2u]=p;previous[i*2u+1u]=vec4<f32>(0.0,0.0,p.xy);
 flags[i]=select(160u,0u,present); // lifecycle bit 7 plus native frozen guard
 slots[i].z=0u;slots[i].w=0u;
 slots[i].x=select(0u,1u,present); // publish lifecycle last
}
@compute @workgroup_size(256)
fn initialize(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x){return;}
 slots[i]=vec4<u32>(0u,0u,0u,0u);
 if(i<cfg.counts.y){reset(i,pos[i],true);}else{reset(i,vec4<f32>(16.0,cfg.units.x,0.0,0.0),false);}
 if(i==0u){
  for(var k=0u;k<32u;k=k+1u){atomicStore(&ledger[k],0u);}
  atomicStore(&ledger[0],cfg.counts.y);atomicStore(&ledger[1],cfg.counts.x-cfg.counts.y);
  atomicStore(&ledger[17],cfg.counts.y);
 }
}
@compute @workgroup_size(1)
fn beginFrame(){atomicStore(&ledger[11],0u);atomicStore(&ledger[16],cfg.frame.x);}
@compute @workgroup_size(64)
fn drainChunks(@builtin(global_invocation_id) id:vec3<u32>){
 let chunk=id.x;let chunkCount=(cfg.counts.x+255u)/256u;
 if(chunk>=chunkCount){return;}
 var free=0u;var drained=0u;var outgoing=0.0;var work=0.0;
 let reserveEnergy=energy(vec4<f32>(16.0,cfg.units.x,0.0,0.0));
 let begin=chunk*256u;let end=min(cfg.counts.x,begin+256u);
 for(var i=begin;i<end;i=i+1u){
  if(slots[i].x!=0u){
   let p=pos[i];
   if(!finite(p)||p.x<0.0||p.y<0.0||p.x>cfg.world.x||p.y>cfg.world.y){atomicStore(&ledger[13],1u);continue;}
   if((flags[i]&128u)!=0u){atomicStore(&ledger[13],2u);continue;}
   if(cfg.frame.z!=0u && p.x>=cfg.drain.x && p.x<=cfg.drain.x+cfg.drain.z &&
       p.y>=cfg.drain.y && p.y<=cfg.drain.y+cfg.drain.w){
    let e=energy(p);outgoing=outgoing+e;work=work+reserveEnergy-e;drained=drained+1u;
    // The visible collector absorbs this accepted parcel at zero velocity.
    // Report only its actual kinetic loss, excluding reserve/lift work.
    emit(p.xy,cfg.units.w*0.5*dot(p.zw,p.zw));
    reset(i,vec4<f32>(16.0,cfg.units.x,0.0,0.0),false);
   }
  }else if((flags[i]&128u)==0u){atomicStore(&ledger[13],2u);}
  if(slots[i].x==0u){free=free+1u;}
 }
 chunks[chunk]=Chunk(vec4<u32>(free,drained,0u,0u),vec4<f32>(outgoing,work,0.0,0.0));
}
@compute @workgroup_size(1)
fn prefixChunks(){
 var free=0u;var drained=0u;var outgoing=0.0;var work=0.0;
 let n=(cfg.counts.x+255u)/256u;
 for(var c=0u;c<n;c=c+1u){
  chunks[c].counts.z=free;
  free=free+chunks[c].counts.x;drained=drained+chunks[c].counts.y;
  outgoing=outgoing+chunks[c].energy.x;work=work+chunks[c].energy.y;
 }
 atomicStore(&ledger[14],free);atomicStore(&ledger[0],cfg.counts.x-free);atomicStore(&ledger[1],free);
 atomicAdd(&ledger[4],drained);put(8u,value(8u)+outgoing);put(9u,value(9u)+work);
 atomicAdd(&ledger[15],1u);put(10u,value(10u)+cfg.velocity.w);
}
@compute @workgroup_size(64)
fn scatterFree(@builtin(global_invocation_id) id:vec3<u32>){
 let c=id.x;if(c>=(cfg.counts.x+255u)/256u){return;}
 let begin=c*256u;let end=min(cfg.counts.x,begin+256u);var rank=0u;
 for(var i=begin;i<end;i=i+1u){
  if(slots[i].x==0u){freeIds[chunks[c].counts.z+rank]=i;rank=rank+1u;}
 }
}
@compute @workgroup_size(256)
fn clearAtlas(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i<u32(cfg.atlas.z*cfg.atlas.w)){atomicStore(&atlas[i],0u);}
}
fn weight(p:vec2<f32>)->array<f32,6>{
 let cell=p/cfg.units.y;let delta=floor(cell)+vec2<f32>(0.5)-cell;
 return array<f32,6>(0.5*(delta.x+0.5)*(delta.x+0.5),0.75-delta.x*delta.x,
  0.5*(delta.x-0.5)*(delta.x-0.5),0.5*(delta.y+0.5)*(delta.y+0.5),
  0.75-delta.y*delta.y,0.5*(delta.y-0.5)*(delta.y-0.5));
}
fn atlasCell(x:i32,y:i32)->u32{
 let ax=x-i32(cfg.atlas.x);let ay=y-i32(cfg.atlas.y);
 if(ax<0||ay<0||ax>=i32(cfg.atlas.z)||ay>=i32(cfg.atlas.w)){return 0xffffffffu;}
 return u32(ay)*u32(cfg.atlas.z)+u32(ax);
}
fn addAtlas(p:vec2<f32>){
 let base=vec2<i32>(floor(p/cfg.units.y));let w=weight(p);
 for(var y=0;y<3;y=y+1){for(var x=0;x<3;x=x+1){
  let c=atlasCell(base.x+x-1,base.y+y-1);
  if(c!=0xffffffffu){atomicAdd(&atlas[c],u32(round(w[u32(x)]*w[u32(y)+3u]*SCALE)));}
 }}
}
@compute @workgroup_size(256)
fn splatAtlas(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i<cfg.counts.x && slots[i].x!=0u){addAtlas(pos[i].xy);}
}
fn clearCandidate(p:vec2<f32>)->bool{
 if(p.x<=0.0||p.y<=0.0||p.x>=cfg.world.x||p.y>=cfg.world.y||solid(p)){return false;}
 let base=vec2<i32>(floor(p/cfg.units.y));let w=weight(p);var density=0.0;
 for(var y=0;y<3;y=y+1){for(var x=0;x<3;x=x+1){
  let c=atlasCell(base.x+x-1,base.y+y-1);if(c==0xffffffffu){return false;}
  density=density+f32(atomicLoad(&atlas[c]))/SCALE*w[u32(x)]*w[u32(y)+3u];
 }}
 // Atmospheric, visible inlet only. Dense/underwater supply fails closed.
 return density<2.0;
}
@compute @workgroup_size(1)
fn admit(){
 if(cfg.counts.z==0u || atomicLoad(&ledger[13])!=0u){return;}
 let credit=atomicLoad(&ledger[6])+cfg.frame.w;let request=credit>>16u;
 atomicStore(&ledger[6],credit&65535u);atomicAdd(&ledger[2],request);
 let free=atomicLoad(&ledger[14]);var admitted=0u;var incoming=0.0;var work=0.0;
 let reserveEnergy=energy(vec4<f32>(16.0,cfg.units.x,0.0,0.0));
 let nx=max(1u,u32(floor(cfg.tap.z/1.25)));let ny=max(1u,u32(floor(cfg.tap.w/1.25)));
 let candidates=nx*ny;
 for(var k=0u;k<request;k=k+1u){
  if(admitted>=free){break;}var found=false;
  for(var c=0u;c<candidates;c=c+1u){
   let q=(c+atomicLoad(&ledger[3]))%candidates;
   let p=vec2<f32>(cfg.tap.x-cfg.tap.z*0.5+(f32(q%nx)+0.5)*cfg.tap.z/f32(nx),
    cfg.tap.y-cfg.tap.w*0.5+(f32(q/nx)+0.5)*cfg.tap.w/f32(ny));
   if(!clearCandidate(p)){continue;}
   let i=freeIds[admitted];let state=vec4<f32>(p,cfg.velocity.xy);
   slots[i].y=slots[i].y+1u;reset(i,state,true);addAtlas(p);
   let e=energy(state);incoming=incoming+e;work=work+e-reserveEnergy;
   admitted=admitted+1u;found=true;break;
  }
  if(!found){break;}
 }
 atomicAdd(&ledger[3],admitted);atomicAdd(&ledger[5],request-admitted);
 atomicAdd(&ledger[0],admitted);atomicSub(&ledger[1],admitted);
 put(7u,value(7u)+incoming);put(9u,value(9u)+work);
}
@compute @workgroup_size(256)
fn saveStep(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i<cfg.counts.x && slots[i].x!=0u){previous[i*2u]=pos[i];}
}
@compute @workgroup_size(256)
fn constrain(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x||slots[i].x==0u){return;}
 var p=pos[i];let old=previous[i*2u];
 if(!finite(p)||!finite(old)){atomicStore(&ledger[13],1u);return;}
 for(var c=0u;c<cfg.counts.w;c=c+1u){
  let cut=cfg.caps[c];let vertical=cut.x<0.5;
  let a=select(old.y,old.x,vertical);let b=select(p.y,p.x,vertical);
  if(a==b||(a-cut.y)*(b-cut.y)>0.0){continue;}
  let t=(cut.y-a)/(b-a);if(t<0.0||t>1.0){continue;}
  let along=select(mix(old.x,p.x,t),mix(old.y,p.y,t),vertical);
  if(along<cut.z-0.00001||along>cut.w+0.00001){continue;}
  let incoming=p.zw;let side=select(1.0,-1.0,a<cut.y);
  if(vertical){p.x=cut.y+side*0.0002;p.z=0.0;affine[i]=vec4<f32>(0.0,0.0,affine[i].zw);}
  else{p.y=cut.y+side*0.0002;p.w=0.0;affine[i]=vec4<f32>(affine[i].xy,0.0,0.0);}
  slots[i].w=slots[i].w+1u;
  emit(p.xy,cfg.units.w*0.5*max(0.0,dot(incoming,incoming)-dot(p.zw,p.zw)));
 }
 pos[i]=p;previous[i*2u]=p;
}
@compute @workgroup_size(256)
fn saveCollision(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x||slots[i].x==0u){return;}
 if(!finite(pos[i])){atomicStore(&ledger[13],1u);slots[i].z=0u;return;}
 previous[i*2u]=pos[i];previous[i*2u+1u]=vec4<f32>(aux[i].y,0.0,aux[i].zw);
 slots[i].z=select(0u,1u,finite(pos[i])&&!solid(aux[i].zw));
}
@compute @workgroup_size(256)
fn impacts(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x||slots[i].x==0u||slots[i].z<=1u){return;}
 let before=previous[i*2u];let p=pos[i];
 // The accepted native contact writes its lost squared speed. A clear,
 // finite input certificate and output exclude embedded-input recovery.
 if(!finite(p)||solid(p.xy)||length(p.xy-before.xy)>4.0){return;}
 let lost=cfg.units.w*0.5*bitcast<f32>(slots[i].z);
 emit(p.xy,lost);
}
fn editPathClear(a:vec2<f32>,b:vec2<f32>)->bool{
 if(solid(a)||solid(b)||b.x<=0.0||b.y<=0.0||b.x>=cfg.world.x||b.y>=cfg.world.y){return false;}
 for(var k=0u;k<cfg.counts.w;k=k+1u){
  let cut=cfg.caps[k];let vertical=cut.x<0.5;
  let old=select(a.y,a.x,vertical);let next=select(b.y,b.x,vertical);
  if(old==next||(old-cut.y)*(next-cut.y)>0.0){continue;}
  let t=(cut.y-old)/(next-old);let along=select(mix(a.x,b.x,t),mix(a.y,b.y,t),vertical);
  if(t>=0.0&&t<=1.0&&along>=cut.z-0.00001&&along<=cut.w+0.00001){return false;}
 }
 // Axis-aligned evacuation cannot cross a live body's conservative bounds.
 for(var k=0u;k<wallEdit.controls.y;k=k+1u){
  let body=wallEdit.bodies[k];let lo=min(a,b);let hi=max(a,b);
  if(hi.x>=body.x&&lo.x<=body.z&&hi.y>=body.y&&lo.y<=body.w){return false;}
 }
 return true;
}
@compute @workgroup_size(256)
fn stageWall(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x){return;}wallCandidates[i]=vec4<f32>(0.0);
 if(atomicLoad(&ledger[13])!=0u){atomicAdd(&wallStatus[0],1u);return;}
 if(slots[i].x==0u){return;}let p=pos[i];
 if(!finite(p)){atomicAdd(&wallStatus[0],1u);return;}
 let r=wallEdit.rect;if(p.x<r.x||p.y<r.y||p.x>=r.x+r.z||p.y>=r.y+r.w){return;}
 var found=false;var distance=1e20;var chosen=vec2<f32>(0.0);var axis=0.0;
 for(var side=0u;side<4u;side=side+1u){
  if((wallEdit.controls.x&(1u<<side))==0u){continue;}
  var q=p.xy;var normal=1.0;
  if(side==0u){q.y=r.y-0.0625;normal=2.0;}
  if(side==1u){q.x=r.x-0.0625;}
  if(side==2u){q.x=r.x+r.z+0.0625;}
  if(side==3u){q.y=r.y+r.w+0.0625;normal=2.0;}
  let d=length(q-p.xy);
  if(d<distance&&editPathClear(p.xy,q)){found=true;distance=d;chosen=q;axis=normal;}
 }
 if(!found){atomicAdd(&wallStatus[0],1u);return;}
 var after=vec4<f32>(chosen,p.zw);if(axis==1.0){after.z=0.0;}else{after.w=0.0;}
 wallCandidates[i]=vec4<f32>(chosen,axis,energy(after)-energy(p));atomicAdd(&wallStatus[1],1u);
}
@compute @workgroup_size(256)
fn applyWall(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=cfg.counts.x||atomicLoad(&wallStatus[0])!=0u||slots[i].x==0u){return;}
 let candidate=wallCandidates[i];if(candidate.z==0.0){return;}
 var p=pos[i];p.x=candidate.x;p.y=candidate.y;
 if(candidate.z==1.0){p.z=0.0;}else{p.w=0.0;}
 pos[i]=p;affine[i]=vec4<f32>(0.0);aux[i]=vec4<f32>(aux[i].xy,p.xy);flags[i]=flags[i]&0xff00006fu;
 previous[i*2u]=p;previous[i*2u+1u]=vec4<f32>(aux[i].y,0.0,p.xy);slots[i].z=0u;
}
@compute @workgroup_size(1)
fn finishWall(){
 if(atomicLoad(&wallStatus[0])!=0u){atomicStore(&wallStatus[3],wallEdit.controls.z);return;}var work=0.0;
 for(var i=0u;i<cfg.counts.x;i=i+1u){work=work+wallCandidates[i].w;}
 atomicStore(&wallStatus[2],bitcast<u32>(work));put(18u,value(18u)+work);
 atomicStore(&wallStatus[3],wallEdit.controls.z);
}
`;

  // Bit 7 is a toy-only published lifecycle certificate. Native frozen bit 5
  // is a second guard. Only the boundary transaction can publish PARKED.
  function shaderVariant(source) {
    if (source.indexOf('flag[i]')>=0 && source.indexOf('let fl = flag[i];')<0)
      throw new Error('Native lifecycle particle marker differs.');
    if (source.indexOf('dflag[iid]')>=0 && source.indexOf('  let fl = dflag[iid];')<0)
      throw new Error('Native lifecycle proof-dot marker differs.');
    if (source.indexOf('flag[iid]')>=0 && source.indexOf('dflag[iid]')<0 && source.indexOf('if (frozen != 0u')<0)
      throw new Error('Native lifecycle render marker differs.');
    source = source.replace(/(let fl = flag\[i\];)/g, '$1\n  if ((fl & 128u) != 0u) { return; }');
    source = source.replace('  let fl = dflag[iid];',
      '  let fl = dflag[iid];\n  if ((fl & 128u) != 0u) { o.pos=vec4<f32>(0.0,0.0,0.0,1.0);o.uv=vec2<f32>(0.0);o.col=vec3<f32>(0.0);return o; }');
    source = source.replaceAll('if (frozen != 0u)', 'if ((fl & 128u) != 0u || frozen != 0u)');
    source = source.replaceAll('if (frozen != 0u || isOil)', 'if ((fl & 128u) != 0u || frozen != 0u || isOil)');
    if (source.indexOf('  // Preserve the terrain-resolved state.')>=0) {
      var hit='    aux[i].y = min(1.0, auxv.y + 0.12);';
      if (source.indexOf(hit)<0) throw new Error('Native accepted-contact marker differs.');
      source='@group(0) @binding(14) var<storage,read_write> toyContactSlots:array<vec4<u32>>;\n'+source;
      source=source.replaceAll(hit,
        '    if (toyContactSlots[i].z == 1u) {\n'+
        '      let remaining=vec2<f32>(vx,vy);\n'+
        '      let loss=max(0.0,dot(pp.zw,pp.zw)-dot(remaining,remaining));\n'+
        '      toyContactSlots[i].z=select(0u,bitcast<u32>(loss),loss>0.0);\n'+
        '    }\n'+hit);
    }
    return source;
  }

  // The engine owns this opt-in buffer so retiring a configuration cannot
  // destroy the storage still bound by its native collision pipelines.
  function createCollisionSlots(instance) {
    if (!instance.buf.toyContactSlots) instance.buf.toyContactSlots=instance.device.createBuffer({
      label:'toy.native.slots',size:instance.maxParticles*16,
      usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    return instance.buf.toyContactSlots;
  }

  function create(instance, options) {
    if (!global.WSSBoundaries) throw new Error('Canonical boundary helpers are unavailable.');
    options = options || {};
    var pool = options.pool === true;
    var capacity = instance.maxParticles;
    if (!Number.isFinite(options.gravity === undefined ? 250 : options.gravity) || (options.gravity !== undefined && options.gravity<=0)) throw new Error('Boundary gravity must be positive and finite.');
    if (capacity !== 100000 && capacity !== 40000) throw new Error('Toy water allocation must be 100000 or 40000.');
    var initial = options.initialPresent;
    if (!Number.isInteger(initial) || initial < 0 || initial > capacity) throw new Error('Initial water count is invalid.');
    var count = pool ? capacity : initial;
    if (!count) throw new Error('Native boundary setup needs initial water.');
    var width=options.width, height=options.height, floor=options.floor === undefined ? height : options.floor;
    if (![width,height,floor].every(Number.isFinite) || width<=0 || height<=0) throw new Error('Boundary domain is invalid.');
    var tap=options.tap || null, drain=options.drain || null, caps=global.WSSBoundaries.normalizeCaps(options.caps);
    if(options.burstDisk && (options.hands || pool || !global.WSSBurstDisk))throw new Error('Burst disk needs its opt-in helper, finite inventory and no wall editor.');
    if (drain && (![drain.x,drain.y,drain.width,drain.height].every(Number.isFinite) || drain.width<=0 || drain.height<=0 || drain.x<0 || drain.y<0 || drain.x+drain.width>width || drain.y+drain.height>height)) throw new Error('Collector drain is outside the native domain.');
    if (options.reservoirY !== undefined && (!Number.isFinite(options.reservoirY) || options.reservoirY<0 || options.reservoirY>height)) throw new Error('Reservoir datum is outside the native domain.');
    if (!pool && (tap || drain)) throw new Error('Taps and drains require a fixed resident inventory.');
    if (caps.some(function(c){return c.x0<0||c.y0<0||c.x1>width||c.y1>height;})) throw new Error('Held cut lies outside the native domain.');
    if (tap && (!Number.isFinite(tap.rate) || tap.rate<0 || tap.rate>12000)) throw new Error('Tap rate is outside supported limits.');
    if (tap && [tap.x,tap.y,tap.vx || 0,tap.vy || 0].some(function(v){return !Number.isFinite(v);})) throw new Error('Tap state is invalid.');
    var device=instance.device, queue=instance.queue, buffers=[], destroyed=false, initialized=false;
    if(device.limits.maxStorageBuffersPerShaderStage<10)throw new Error('Native boundaries require ten storage buffers.');
    var burst=options.burstDisk ? global.WSSBurstDisk.create(instance,options.burstDisk,width,height) : null;
    if(burst){try{burst.guardCaps(caps);}catch(e){burst.destroy();throw e;}}
    function storage(label,size) {
      var b=device.createBuffer({label:'toy.native.'+label,size:Math.max(16,size),
        usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});buffers.push(b);return b;
    }
    var slotBuffer=instance.buf.toyContactSlots || storage('slots',count*16), ledger=storage('ledger',LEDGER_WORDS*4);
    var chunkCount=Math.ceil(count/256), chunks=storage('chunks',chunkCount*32);
    var freeIds=storage('freeIds',count*4), previous=storage('previous',count*32), events=storage('events',EVENT_CAP*32);
    var cell=instance.cellSize, tw=tap && tap.width || 16, th=tap && tap.height || 5;
    var ax=tap ? Math.floor((tap.x-tw*.5)/cell)-2 : 0, ay=tap ? Math.floor((tap.y-th*.5)/cell)-2 : 0;
    var aw=tap ? Math.ceil(tw/cell)+6 : 4, ah=tap ? Math.ceil(th/cell)+6 : 4;
    var atlas=storage('atlas',aw*ah*4);
    var editCandidates=null,editStatus=null,editConfig=null;
    if(options.hands){
      editCandidates=storage('wallCandidates',count*16);editStatus=storage('wallStatus',16);
      editConfig=device.createBuffer({label:'toy.native.wallEdit',size:288,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});buffers.push(editConfig);
    }
    var config=device.createBuffer({label:'toy.native.config',size:384,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});buffers.push(config);
    var bytes=new ArrayBuffer(384), ints=new Uint32Array(bytes), floats=new Float32Array(bytes);
    ints.set([count,initial,tap && tap.enabled !== false ? 1 : 0,caps.length]);
    floats.set([tap ? tap.x : 0,tap ? tap.y : 0,tw,th],4);
    floats.set([tap && tap.vx || 0,tap && tap.vy || 0,tap && tap.rate || 0,1/120],8);
    floats.set([width,height,floor,options.gravity || 250],12);
    floats.set(drain ? [drain.x,drain.y,drain.width,drain.height] : [0,0,0,0],16);
    // Thirty-inch world width, one-inch extrusion, water 1000 kg/m3.
    var mpp=.0254/(width/30), parcelMass=1.5625*mpp*mpp*.0254*1000;
    var physicalTimeScale=Math.sqrt((30/width)*(options.gravity || 250)/386.0886);
    floats.set([options.reservoirY === undefined ? floor : options.reservoirY,cell,1.5625,parcelMass*mpp*mpp/(physicalTimeScale*physicalTimeScale)],20);
    floats.set([ax,ay,aw,ah],24);ints[30]=drain ? 1 : 0;
    var resources={0:config,1:instance.buf.pos,2:instance.buf.affine,3:instance.buf.aux,4:instance.buf.flag,
      5:slotBuffer,6:ledger,7:freeIds,8:atlas,9:previous,10:events,11:instance.buf.terrainMask,12:instance.paramsBuf,13:chunks,14:editConfig,15:editCandidates,16:editStatus};
    var bindings={initialize:[0,1,2,3,4,5,6,9],beginFrame:[0,6],drainChunks:[0,1,2,3,4,5,6,9,10,13],prefixChunks:[0,6,13],scatterFree:[0,5,7,13],
      clearAtlas:[0,8],splatAtlas:[0,1,5,8],admit:[0,1,2,3,4,5,6,7,8,9,11,12],saveStep:[0,1,5,9],
      constrain:[0,1,2,5,6,9,10],saveCollision:[0,1,3,5,6,9,11,12],impacts:[0,1,3,5,6,9,10,11,12]};
    if(options.hands)Object.assign(bindings,{stageWall:[0,1,5,6,11,12,14,15,16],applyWall:[0,1,2,3,4,5,9,15,16],finishWall:[0,6,14,15,16]});
    if(burst){resources[17]=burst.buffer;bindings.constrain.push(17);}
    var module=device.createShaderModule({label:'toy.native.boundaries',code:burst ? global.WSSBurstDisk.variant(SOURCE) : SOURCE}), pipes={}, groups={};
    Object.keys(bindings).forEach(function(name){
      if(bindings[name].filter(function(b){return b!==0 && b!==12 && b!==14;}).length>10)throw new Error('Native stage exceeds ten storage bindings.');
      var entries=bindings[name].map(function(b){return {binding:b,visibility:GPUShaderStage.COMPUTE,
        buffer:{type:b===0||b===12||b===14 ? 'uniform' : b===11||b===17 ? 'read-only-storage' : 'storage'}};});
      var layout=device.createBindGroupLayout({label:'toy.native.'+name+'.layout',entries:entries});
      pipes[name]=device.createComputePipeline({label:'toy.native.'+name,layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),
        compute:{module:module,entryPoint:name}});
      groups[name]=device.createBindGroup({layout:layout,entries:bindings[name].map(function(b){return {binding:b,resource:{buffer:resources[b]}};})});
    });
    var grid=instance.createToyLifecycleGrid(slotBuffer);
    var frameId=0, latest=null, latestSnapshot=null, consumer=null, lastSnapshotAt=-Infinity;
    var frameBytes=LEDGER_WORDS*4+EVENT_CAP*32, stateBytes=LEDGER_WORDS*4+count*68+(burst ? 64 : 0);
    function readBuffer(label,size){var b=device.createBuffer({label:label,size:size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});buffers.push(b);return {buffer:b,busy:false,captured:false};}
    var eventRing=[readBuffer('toy.native.events.0',frameBytes),readBuffer('toy.native.events.1',frameBytes)];
    var stateRing=[readBuffer('toy.native.state.0',stateBytes),readBuffer('toy.native.state.1',stateBytes)];
    function encode(encoder,name,n){var pass=encoder.beginComputePass({label:'toy.native.'+name});pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name]);pass.dispatchWorkgroups(Math.max(1,Math.ceil((n || 1)/(name==='drainChunks'||name==='scatterFree'?64:256))));pass.end();}
    // Serial stages have workgroup size 1 and are always exactly one group.
    function serial(encoder,name){encode(encoder,name,1);}
    function writeCaps(){ints[3]=caps.length;floats.fill(0,32);caps.forEach(function(c,i){floats.set([c.axis==='x'?0:1,c.at,c.start,c.end],32+i*4);});queue.writeBuffer(config,0,bytes);}
    function parseLedger(buffer,at) {
      var u=new Uint32Array(buffer,0,LEDGER_WORDS), f=new Float32Array(buffer,0,LEDGER_WORDS);
      return {enabled:true,ready:initialized&&!destroyed,energyUnit:'J',physicalSecondsPerSimulationSecond:physicalTimeScale,pool:pool,tapEnabled:!!ints[2],count:count,initialPresent:initial,
        present:u[0],parked:u[1],requested:u[2],admitted:u[3],drained:u[4],shortfall:u[5],
        energyIn:f[7],energyOut:f[8],externalWork:f[9],editWork:f[18],simulationTime:f[10],tick:u[15],frameId:u[16],
        ageMs:Math.max(0,performance.now()-at),eventOverflow:u[12],error:u[13] ? 'Native boundary invariant '+u[13] : extension.error || null};
    }
    function capture(encoder,ring,state) {
      var row=ring.find(function(r){return !r.busy;});if(!row)return;
      row.busy=true;row.captured=true;row.at=performance.now();row.frameId=frameId;
      encoder.copyBufferToBuffer(ledger,0,row.buffer,0,LEDGER_WORDS*4);
      if(!state){encoder.copyBufferToBuffer(events,0,row.buffer,LEDGER_WORDS*4,EVENT_CAP*32);return;}
      var offset=LEDGER_WORDS*4;
      [[instance.buf.pos,16],[instance.buf.affine,16],[instance.buf.aux,16],[instance.buf.flag,4],[slotBuffer,16]].forEach(function(entry){
        encoder.copyBufferToBuffer(entry[0],0,row.buffer,offset,count*entry[1]);offset+=count*entry[1];
      });
      if(burst)encoder.copyBufferToBuffer(burst.buffer,0,row.buffer,offset,64);
    }
    function readRing(ring,state){ring.forEach(function(row){
      if(!row.captured)return;row.captured=false;
      row.buffer.mapAsync(GPUMapMode.READ).then(function(){
        if(destroyed){row.buffer.unmap();return;}
        var data=row.buffer.getMappedRange().slice(0);row.buffer.unmap();row.busy=false;
        var stats=parseLedger(data,row.at);stats.capturedAtMs=row.at;
        if(stats.error){extension.error=stats.error;extension.ready=false;instance.materialStateError=stats.error;}
        if(!state){
          if(!latest||stats.frameId>=latest.frameId)latest=stats;
          if(consumer && !stats.error){var e=new Float32Array(data,LEDGER_WORDS*4), rows=[];
            var eventCount=Math.min(new Uint32Array(data)[11],EVENT_CAP);
            for(var k=0;k<eventCount;k++){var j=k*8;rows.push({kind:'impact',x:e[j],y:e[j+1],energy:e[j+2],tick:e[j+3],frameId:e[j+4],simulationTime:e[j+5],ageMs:Math.max(0,performance.now()-row.at)});}
            if(rows.length)consumer(rows);
          }
        }else if(!latestSnapshot||stats.frameId>=latestSnapshot.frameId){
          var off=LEDGER_WORDS*4;
          function take(Type,words){var a=new Type(data,off,count*words);off+=count*words*4;return a;}
          latestSnapshot=Object.assign(stats,{pos:take(Float32Array,4),affine:take(Float32Array,4),aux:take(Float32Array,4),
            flags:take(Uint32Array,1),slots:take(Uint32Array,4),slotStride:4,parcelArea:1.5625,ledger:new Uint32Array(data,0,LEDGER_WORDS)});
          if(burst){latestSnapshot.burstDisk=burst.read(data,off,row.at);if(latestSnapshot.burstDisk.fault){extension.error='Native burst disk pressure or geometry fault.';extension.ready=false;instance.materialStateError=extension.error;}}
        }
      }).catch(function(e){row.busy=false;if(!destroyed){extension.error=String(e.message||e);extension.ready=false;instance.materialStateError=extension.error;}});
    });}
    var restoring=false,lastEdit=null,restoreId=0,wallResult=options.hands ? readBuffer('toy.native.wallResult',16) : null;
    function healthyWallEdit(){
      if(destroyed || !extension.ready || extension.error || instance.materialStateError)
        throw new Error(extension.error || instance.materialStateError || 'The native wall editor is not ready.');
    }
    function syncTerrain(){
      var t=instance.terrain,hook=instance.liquid.fillTerrainSolid;
      if(!t || t.capped || typeof hook!=='function')throw new Error('Wall editing needs the full native terrain region.');
      var solidTiles=instance.staging.terrainSolid,mask=instance.staging.terrainMask,words=Math.ceil(t.tiles/32);
      hook(t.originCol,t.originRow,t.w,t.h,solidTiles);mask.fill(0,0,words);
      for(var i=0;i<t.tiles;i++)if(solidTiles[i])mask[i>>5]|=1<<(i&31);
      queue.writeBuffer(instance.buf.terrainMask,0,mask,0,words);instance.terrainMaskWords=words;
    }
    var extension={ready:false,inFlight:false,error:null,grid:grid,maxSubsteps:options.maxSubsteps,
      readyPromise:Promise.all([module.getCompilationInfo()].concat(Object.keys(grid).map(function(k){return grid[k].module.getCompilationInfo();})).concat(burst ? [burst.readyPromise.then(function(){return {messages:[]};})] : [])).then(function(infos){
        var errors=infos.flatMap(function(info){return info.messages.filter(function(m){return m.type==='error';});});
        if(errors.length)throw new Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('\n'));return extension;
      }),
      initialize:function(){return extension.readyPromise.then(function(){
        if(destroyed)throw new Error('Boundary extension was destroyed.');
        if(burst)burst.attach(instance.pressureModel);
        var L=instance.liquid;
        if(L.getCount()!==count)throw new Error('Host resident count must match the native boundary count.');
        // Direct pressure transport does not upload/reset native material.
        // Own the full setup upload before reading the seeded parcel positions.
        if(typeof instance.prepareMaterialState!=='function')throw new Error('Native material upload is unavailable.');
        instance.prepareMaterialState({reset:true});
        if(typeof L.takeOps==='function')L.takeOps();
        instance.lastUploadSeq=typeof L.getMutationSeq==='function'?L.getMutationSeq():0;
        instance.uploadedCount=count;instance.residentSeeded=true;
        instance.paramsHost[0]=count;queue.writeBuffer(instance.paramsBuf,0,instance.paramsHost);
        writeCaps();var enc=device.createCommandEncoder({label:'toy.native.initialize'});encode(enc,'initialize',count);
        capture(enc,stateRing,true);queue.submit([enc.finish()]);return queue.onSubmittedWorkDone();
      }).then(function(){initialized=true;extension.ready=true;readRing(stateRing,true);return extension;});},
      validateHost:function(){
        if(extension.error)throw new Error(extension.error);
        if(instance.liquid.getCount()!==count || typeof instance.liquid.getMutationSeq==='function' && instance.liquid.getMutationSeq()!==instance.lastUploadSeq)
          throw new Error('Fixed native inventory was changed outside Restart.');
      },
      beginFrame:function(encoder){extension.inFlight=true;frameId++;ints[28]=frameId;queue.writeBuffer(config,0,bytes);serial(encoder,'beginFrame');},
      beforeSubstep:function(encoder,step){
        if(Math.abs(step.h-1/120)>1e-7)throw new Error('Native boundaries require a fixed 1/120 quantum.');
        if(burst)burst.encode(encoder);
        ints[31]=Math.round((tap && tap.rate || 0)*step.h*65536);queue.writeBuffer(config,0,bytes);
        encode(encoder,'drainChunks',chunkCount);serial(encoder,'prefixChunks');encode(encoder,'scatterFree',chunkCount);
        encode(encoder,'clearAtlas',aw*ah);
        if(tap && ints[2]){encode(encoder,'splatAtlas',count);serial(encoder,'admit');}
        encode(encoder,'saveStep',count);
      },
      constrain:function(encoder){if(caps.length || burst)encode(encoder,'constrain',count);},
      beforeCollision:function(encoder){encode(encoder,'saveCollision',count);},
      afterSubstep:function(encoder){encode(encoder,'impacts',count);if(caps.length || burst)encode(encoder,'constrain',count);},
      captureFrame:function(encoder){capture(encoder,eventRing,false);var now=performance.now();if(now-lastSnapshotAt>=150){capture(encoder,stateRing,true);lastSnapshotAt=now;}},
      afterSubmit:function(){readRing(eventRing,false);readRing(stateRing,true);
        queue.onSubmittedWorkDone().then(function(){extension.inFlight=false;}).catch(function(e){
          extension.inFlight=false;if(!destroyed){extension.error=String(e.message||e);extension.ready=false;instance.materialStateError=extension.error;}
        });
      },
      applyPressureCaps:function(geometry,w,h,dx){global.WSSBoundaries.closePressureFaces(geometry,w,h,dx,caps);if(burst)burst.applyPressureCut(geometry,w,h,dx);},
      setCaps:function(value){var next=global.WSSBoundaries.normalizeCaps(value);
        if(restoring)throw new Error('Held boundaries cannot change during wall restoration.');
        if(next.some(function(c){return c.x0<0||c.y0<0||c.x1>width||c.y1>height;}))throw new Error('Held cut lies outside the native domain.');
        var dx=instance.pressureModel && instance.pressureModel.cellSize;
        if(dx && next.some(function(c){return Math.abs(c.at-Math.round(c.at/dx)*dx)>1e-5;}))throw new Error('Held cuts must lie on pressure faces.');
        if(burst)burst.guardCaps(next);
        caps=next;writeCaps();if(instance.pressureModel && instance.pressureModel.refreshToyCaps)instance.pressureModel.refreshToyCaps();return caps.slice();},
      setTapEnabled:function(value){ints[2]=tap && value ? 1 : 0;queue.writeBuffer(config,0,bytes);return !!ints[2];},
      syncWallTerrain:syncTerrain,
      restoreWall:async function(cell,bodies){
        if(!options.hands)throw new Error('Safe wall editing was not enabled for this setup.');
        if(!extension.ready || destroyed || restoring)throw new Error('Wait for the native wall edit to finish.');
        if(!instance.pressureModel || instance.pressureModel.cellSize!==cell.width || cell.width!==cell.height ||
          [cell.x,cell.y].some(function(v){return !Number.isFinite(v)||Math.abs(v/cell.width-Math.round(v/cell.width))>1e-5;}) ||
          cell.x<=0 || cell.y<=0 || cell.x+cell.width>=width || cell.y+cell.height>=height ||
          !Number.isInteger(cell.neighbors)||cell.neighbors<0||cell.neighbors>15)
          throw new Error('Hole punch needs one complete pressure cell inside the apparatus.');
        bodies=bodies || [];
        if(bodies.length>16 || bodies.some(function(r){return !Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]>r[2]||r[1]>r[3];}))
          throw new Error('The live slime bounds cannot be guarded for this wall edit.');
        restoring=true;var scope=false,certified=false;
        try{
          await queue.onSubmittedWorkDone();healthyWallEdit();extension.validateHost();
          device.pushErrorScope('validation');scope=true;syncTerrain();
          var editBytes=new ArrayBuffer(288),ef=new Float32Array(editBytes),eu=new Uint32Array(editBytes);
          restoreId=(restoreId+1)>>>0 || 1;
          ef.set([cell.x,cell.y,cell.width,cell.height]);eu[4]=cell.neighbors;eu[5]=bodies.length;eu[6]=restoreId;
          bodies.forEach(function(r,i){ef.set(r,8+i*4);});queue.writeBuffer(editConfig,0,editBytes);
          var result=wallResult,encoder=device.createCommandEncoder({label:'toy.native.restoreWall'});
          encoder.clearBuffer(editStatus);encode(encoder,'stageWall',count);encode(encoder,'applyWall',count);serial(encoder,'finishWall');
          encoder.copyBufferToBuffer(editStatus,0,result.buffer,0,16);queue.submit([encoder.finish()]);
          await queue.onSubmittedWorkDone();var validation=await device.popErrorScope();scope=false;
          if(validation)throw new Error('Native wall restoration GPU validation: '+validation.message);
          healthyWallEdit();
          await result.buffer.mapAsync(GPUMapMode.READ);var data=result.buffer.getMappedRange().slice(0);result.buffer.unmap();
          healthyWallEdit();var u=new Uint32Array(data),f=new Float32Array(data);
          if(u[3]!==restoreId)throw new Error('Native wall restoration did not complete its transaction.');
          certified=true;
          lastEdit={displaced:u[1],blocked:u[0],workJoules:f[2]};
          if(u[0])throw new Error('Wall restoration blocked by trapped water or a closed boundary.');
          return Object.assign({},lastEdit);
        }catch(error){
          if(!certified || extension.error || instance.materialStateError || !extension.ready){
            extension.error=String(error.message || error);extension.ready=false;instance.materialStateError=extension.error;
          }
          throw error;
        }finally{try{if(scope)await device.popErrorScope();}finally{restoring=false;}}
      },
      wallEditStats:function(){return Object.assign({pending:restoring},lastEdit);},
      setEventConsumer:function(fn){consumer=typeof fn==='function'?fn:null;},
      stats:function(){var row=latest || latestSnapshot;var result=row ? Object.fromEntries(['enabled','energyUnit','physicalSecondsPerSimulationSecond','pool','count','initialPresent','present','parked','requested','admitted','drained','shortfall','energyIn','energyOut','externalWork','editWork','simulationTime','frameId','eventOverflow'].map(function(k){return [k,row[k]];}).concat([['inFlight',extension.inFlight],['pendingFrames',extension.inFlight?1:0],['tapEnabled',!!ints[2]],['ready',extension.ready],['ageMs',Math.max(0,performance.now()-row.capturedAtMs)],['error',extension.error||row.error]])) :
        {enabled:true,ready:extension.ready,inFlight:extension.inFlight,pendingFrames:extension.inFlight?1:0,energyUnit:'J',physicalSecondsPerSimulationSecond:physicalTimeScale,pool:pool,tapEnabled:!!ints[2],count:count,initialPresent:initial,present:initial,parked:count-initial,requested:0,admitted:0,drained:0,shortfall:0,
          energyIn:0,energyOut:0,externalWork:0,editWork:0,simulationTime:0,frameId:0,ageMs:null,error:extension.error,eventOverflow:0};if(burst)result.burstDisk=burst.stats();return result;},
      snapshot:function(){return latestSnapshot ? Object.assign({},latestSnapshot,{ageMs:Math.max(0,performance.now()-latestSnapshot.capturedAtMs)}) : null;},
      destroy:function(){destroyed=true;extension.ready=false;extension.inFlight=false;consumer=null;if(burst)burst.destroy();buffers.forEach(function(b){try{b.destroy();}catch(e){}});}
    };
    writeCaps();return extension;
  }
  create.shaderVariant=shaderVariant;
  create.createCollisionSlots=createCollisionSlots;
  global.WSSNative={create:create,normalizeCaps:function(input){return global.WSSBoundaries.normalizeCaps(input);}};
})(typeof window !== 'undefined' ? window : globalThis);
