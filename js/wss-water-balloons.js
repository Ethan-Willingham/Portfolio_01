/* Two-sided contacts keep native water on its birth side of an elastic skin.
 * The water integrator is unchanged. Contact reactions use the existing gel nodes. */
(function(root){
  'use strict';
  function contains(ring,x,y){
    var inside=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var a=ring[i],b=ring[j];
      if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function nearest(ring,x,y){
    var best={distance:Infinity,edge:-1};
    for(var k=0;k<ring.length;k++){
      var a=ring[k],b=ring[(k+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
      if(l<1e-10)continue;
      var t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l)),qx=a.x+t*dx,qy=a.y+t*dy,d=Math.hypot(x-qx,y-qy);
      if(d<best.distance)best={distance:d,edge:k,t:t,x:qx,y:qy};
    }
    return best;
  }
  function bodyRing(b){
    var take=Math.min(20,b.ringN),out=[];
    for(var k=0;k<take;k++){var i=b.ring[Math.floor(k*b.ringN/take)];out.push({x:b.px[i],y:b.py[i],node:i});}
    return out;
  }
  // A point and both ends of an edge move linearly over one water quantum.
  // Solving the quadratic crossing equation catches an enter-and-exit tunnel.
  function sweptEdge(p,q,a,b,c,d){
    function cross(x,y){return x.x*y.y-x.y*y.x;}
    var e={x:b.x-a.x,y:b.y-a.y},de={x:d.x-c.x-e.x,y:d.y-c.y-e.y},
      r={x:p.x-a.x,y:p.y-a.y},dr={x:q.x-p.x-c.x+a.x,y:q.y-p.y-c.y+a.y};
    var A=cross(de,dr),B=cross(e,dr)+cross(de,r),C=cross(e,r),roots=[];
    if(Math.abs(A)<1e-9){if(Math.abs(B)>1e-9)roots.push(-C/B);}
    else {var disc=B*B-4*A*C;if(disc>=0){var s=Math.sqrt(disc);roots.push((-B-s)/(2*A),(-B+s)/(2*A));}}
    var best=null;
    roots.forEach(function(t){
      if(t<=1e-6 || t>1)return;
      var ex=e.x+de.x*t,ey=e.y+de.y*t,rx=r.x+dr.x*t,ry=r.y+dr.y*t,length=ex*ex+ey*ey;
      var along=length>1e-10?(rx*ex+ry*ey)/length:-1;
      if(along>=0 && along<=1 && (!best || t<best.t))best={t:t,along:along};
    });
    return best;
  }
  function source(layout){return `
struct Params { step:vec4f, mode:vec4f, world:vec4f };
struct Guests { data:array<vec4f,${layout.lanes/4}> };
struct Grid { count:u32, w:u32, h:u32, ox:u32, oy:u32, cells:u32, dt:f32, inv:f32,
 cols:f32, tile:f32, rows:f32, spare:f32, tc:u32, tr:u32, tw:u32, th:u32, region:vec4f };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<uniform> g:Guests;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> flag:array<u32>;
@group(0) @binding(4) var<storage,read_write> sides:array<vec4u>;
@group(0) @binding(5) var<storage,read_write> before:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> history:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> sums:array<atomic<i32>>;
@group(0) @binding(8) var<uniform> grid:Grid;
@group(0) @binding(9) var<storage,read> terrain:array<u32>;
@group(0) @binding(10) var<storage,read_write> affine:array<vec4f>;
fn n()->u32 {return u32(g.data[${layout.metaBase/4}u+u32(p.step.y)*2u+1u].y);}
fn ring(k:u32)->vec4f {return g.data[${layout.ringBase/4}u+u32(p.step.y)*20u+k];}
fn live(i:u32)->bool {return i<u32(p.step.x) && (flag[i]&128u)==0u && (flag[i]&3u)==0u;}
fn inside(v:vec2f)->bool {
 var result=false;let count=n();var j=count-1u;
 for(var k=0u;k<count;k++){let a=ring(k).xy;let b=ring(j).xy;
  if((a.y>v.y)!=(b.y>v.y)){if(v.x<(b.x-a.x)*(v.y-a.y)/(b.y-a.y)+a.x){result=!result;}}j=k;}
 return result;
}
fn solid(v:vec2f)->bool {
 if(v.x<1. || v.y<1. || v.x>p.world.x-1. || v.y>p.world.y-1.){return true;}
 let c=vec2i(floor(v/grid.tile))-vec2i(bitcast<i32>(grid.tc),bitcast<i32>(grid.tr));
 if(any(c<vec2i(0)) || c.x>=i32(grid.tw) || c.y>=i32(grid.th)){return false;}
 let at=u32(c.y)*grid.tw+u32(c.x);return (terrain[at>>5u]&(1u<<(at&31u)))!=0u;
}
fn clear(v:vec2f)->bool {
 let r=1.125;return !solid(v)&&!solid(v+vec2f(r,0.))&&!solid(v-vec2f(r,0.))&&!solid(v+vec2f(0.,r))&&!solid(v-vec2f(0.,r));
}
fn clearPath(a:vec2f,b:vec2f)->bool {
 let steps=max(1u,u32(ceil(length(b-a))));
 for(var k=1u;k<=steps;k++){if(!clear(mix(a,b,f32(k)/f32(steps)))){return false;}}return true;
}
fn cross(a:vec2f,b:vec2f)->f32 {return a.x*b.y-a.y*b.x;}
fn rootHit(t:f32,e:vec2f,de:vec2f,r:vec2f,dr:vec2f)->vec2f {
 if(t<=.000001 || t>1.){return vec2f(2.,0.);}let edge=e+de*t;let length=dot(edge,edge);
 if(length<1e-10){return vec2f(2.,0.);}let along=dot(r+dr*t,edge)/length;
 return select(vec2f(2.,0.),vec2f(t,along),along>=0. && along<=1.);
}
fn sweep(a:vec2f,b:vec2f,c:vec2f,d:vec2f,v:vec2f,w:vec2f)->vec2f {
 let e=b-a;let de=d-c-e;let r=v-a;let dr=w-v-c+a;
 let A=cross(de,dr);let B=cross(e,dr)+cross(de,r);let C=cross(e,r);
 if(abs(A)<1e-9){if(abs(B)>1e-9){return rootHit(-C/B,e,de,r,dr);}return vec2f(2.,0.);}
 let disc=B*B-4.*A*C;if(disc<0.){return vec2f(2.,0.);}let s=sqrt(disc);
 let h1=rootHit((-B-s)/(2.*A),e,de,r,dr);let h2=rootHit((-B+s)/(2.*A),e,de,r,dr);
 return select(h1,h2,h2.x<h1.x);
}
@compute @workgroup_size(256) fn birth(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}before[i]=pos[i];if(sides[i].x!=0u || n()<3u){return;}
 let side=select(1u,2u,inside(pos[i].xy));sides[i]=vec4u(side,side,0u,0u);
 atomicAdd(&sums[select(41u,40u,side==2u)],1);
}
@compute @workgroup_size(256) fn snapshot(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(live(i)){before[i]=pos[i];}}
@compute @workgroup_size(1) fn saveRing(){for(var k=0u;k<n();k++){history[k]=ring(k);}history[20]=vec4f(1.);}
@compute @workgroup_size(256) fn contact(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i) || p.mode.x<.5 || n()<3u || sides[i].x==0u){return;}
 let original=pos[i];let start=before[i].xy;let wanted=sides[i].y==2u;
 var distance=1e20;var face=0u;var along=0.;var point=vec2f(0.);var winding=0.;var hit=vec2f(2.,0.);var hitFace=0u;
 for(var k=0u;k<n();k++){
  let a=ring(k);let b=ring((k+1u)%n());let edge=b.xy-a.xy;let length=dot(edge,edge);winding+=cross(a.xy,b.xy);
  if(length<1e-10){continue;}let t=clamp(dot(original.xy-a.xy,edge)/length,0.,1.);let q=mix(a.xy,b.xy,t);let d=dot(original.xy-q,original.xy-q);
  if(d<distance){distance=d;face=k;along=t;point=q;}
  let oldA=select(a.xy,history[k].xy,history[20].x>.5);let oldB=select(b.xy,history[(k+1u)%n()].xy,history[20].x>.5);
  let crossed=sweep(oldA,oldB,a.xy,b.xy,start,original.xy);
  if(crossed.x<hit.x){hit=crossed;hitFace=k;}
 }
 let now=inside(original.xy);let slit=i32(p.mode.y);
 // Only an actual trajectory crossing the missing edge changes accessible side.
 if(hit.x<=1. && i32(hitFace)==slit){
  sides[i].y=select(1u,2u,now);sides[i].z+=1u;atomicAdd(&sums[43],1);return;
 }
 let tunneled=hit.x<=1. && i32(hitFace)!=slit;
 if(now==wanted && distance>=1.5625 && !tunneled){return;}
 if(tunneled){face=hitFace;along=hit.y;point=mix(ring(face).xy,ring((face+1u)%n()).xy,along);}
 if(i32(face)==slit){return;}
 let a=ring(face);let b=ring((face+1u)%n());let edge=b.xy-a.xy;let edgeLength=length(edge);if(edgeLength<.00001){return;}
 let outward=vec2f(edge.y,-edge.x)/edgeLength*select(-1.,1.,winding>0.);
 let normal=outward*select(1.,-1.,wanted);let contactPoint=point+normal*1.25;
 if(inside(contactPoint)!=wanted || !clearPath(start,contactPoint)){atomicAdd(&sums[44],1);return;}
 let faceV=mix(a.zw,b.zw,along);let closing=min(0.,dot(original.zw-faceV,normal));let velocity=original.zw-normal*closing;
 pos[i]=vec4f(contactPoint,velocity);
 flag[i]=flag[i]&~0x00ffff10u;
 let C=affine[i];let normalColumn=vec2f(C.x*normal.x+C.z*normal.y,C.y*normal.x+C.w*normal.y);
 affine[i]=C-vec4f(normal.x*normalColumn.x,normal.x*normalColumn.y,normal.y*normalColumn.x,normal.y*normalColumn.y);
 let reaction=-(velocity-original.zw)*p.mode.z;
 let left=face*2u;let right=((face+1u)%n())*2u;
 atomicAdd(&sums[left],i32(round(reaction.x*(1.-along)*4096.)));atomicAdd(&sums[left+1u],i32(round(reaction.y*(1.-along)*4096.)));
 atomicAdd(&sums[right],i32(round(reaction.x*along*4096.)));atomicAdd(&sums[right+1u],i32(round(reaction.y*along*4096.)));
 atomicAdd(&sums[42],1);
}
@compute @workgroup_size(256) fn observe(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}let v=pos[i];atomicAdd(&sums[49],1);
 if(any(v!=v) || any(abs(v)>vec4f(1e10))){atomicAdd(&sums[48],1);return;}
 if(sides[i].x==2u){
  let contained=n()>=3u && inside(v.xy);if(contained){atomicAdd(&sums[46],1);}else{atomicAdd(&sums[47],1);}
  atomicAdd(&sums[50],i32(round(v.x*16.)));atomicAdd(&sums[51],i32(round(v.y*16.)));
 }
 if(p.mode.x>.5 && i32(p.mode.y)<0 && sides[i].x!=0u && inside(v.xy)!=(sides[i].y==2u)){atomicAdd(&sums[45],1);}
}
`;}
  async function create(options){
    var L=options.liquid,b=options.body,device=L.device,queue=L.queue,layout=L.getGuestUniformLayout(),U=GPUBufferUsage;
    if(!L.simActive || !b || b.ringN<3)throw Error('Water balloons need native water and a closed elastic ring.');
    var retired=false,enabled=true,error=null,frame=0,birthGeneration=0,slot=-1,slit=-1,latest=new Int32Array(64),pendingImpulse=[],lastClock=0,maxAge=0;
    var buffers=[];
    function buffer(size,usage){var value=device.createBuffer({size:size,usage:usage});buffers.push(value);return value;}
    var params=buffer(48,U.UNIFORM|U.COPY_DST),tags=buffer(options.maxParticles*16,U.STORAGE|U.COPY_DST|U.COPY_SRC),
      before=buffer(options.maxParticles*16,U.STORAGE|U.COPY_SRC),history=buffer(21*16,U.STORAGE|U.COPY_DST),
      sums=buffer(64*4,U.STORAGE|U.COPY_DST|U.COPY_SRC),reads=Array.from({length:3},function(){return {buffer:buffer(256,U.MAP_READ|U.COPY_DST),busy:false,captured:false};});
    // An exposed lower-side opening can drain while the base rests on the
    // basin. A bottom opening is naturally plugged by that same solid floor.
    if(options.slit){var initialRing=bodyRing(b),best=-Infinity;for(var k=0;k<initialRing.length;k++){
      var a=initialRing[k],c=initialRing[(k+1)%initialRing.length],x=(a.x+c.x)*.5-b.cx,y=(a.y+c.y)*.5-b.cy;
      var score=x+y*.5;if(y>=0 && score>best){best=score;slit=k;}}
    }
    var code=source(layout),module=device.createShaderModule({code:code}),info=await module.getCompilationInfo();
    if(info.messages.some(function(m){return m.type==='error';}))throw Error(info.messages.map(function(m){return m.lineNum+': '+m.message;}).join('; '));
    var pipes={},groups={};
    for(var name of ['birth','snapshot','saveRing','contact','observe']){
      pipes[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});
      var used=name==='birth'?[0,1,2,3,4,5,7]:name==='snapshot'?[0,2,3,5]:name==='saveRing'?[0,1,6]:name==='contact'?[0,1,2,3,4,5,6,7,8,9,10]:[0,1,2,3,4,7];
      groups[name]=L.gameParamsBufs.map(function(guestBuffer){
        var resources=[params,guestBuffer,L.buf.pos,L.buf.flag,tags,before,history,sums,L.paramsBuf,L.buf.terrainMask,L.buf.affine];
        return device.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:used.map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
      });
    }
    function encode(enc,name,substep,count){var pass=enc.beginComputePass({label:'toy.balloon.'+name});pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name][substep]);pass.dispatchWorkgroups(name==='saveRing'?1:Math.max(1,Math.ceil(count/256)));pass.end();}
    var row=null;
    var companion={body:b,tags:tags,ready:true,error:null,
      setSlot:function(value){slot=value;},
      beginFrame:function(enc,state){
        if(retired)return;if(error)throw Error(error);if(enabled && slot<0)throw Error('Water balloon left its native boundary slot.');
        frame++;var values=new Float32Array([state.count,Math.max(0,slot),state.h,frame,enabled?1:0,slit,.002,0,options.width,options.height,state.clock,L.getSimParam('TIMESCALE')]);
        queue.writeBuffer(params,0,values);enc.clearBuffer(sums,45*4,7*4);
        queue.writeBuffer(sums,56*4,new Float32Array([state.clock,frame,L.getSimParam('TIMESCALE'),0]));
      },
      beforeSubstep:function(enc,state){
        encode(enc,'birth',state.substep,state.count);
        encode(enc,'contact',state.substep,state.count);encode(enc,'saveRing',state.substep,state.count);
        encode(enc,'snapshot',state.substep,state.count);
      },
      afterSubstep:function(enc,state){encode(enc,'contact',state.substep,state.count);},
      captureFrame:function(enc,state){
        encode(enc,'observe',state.substep,state.count);row=reads.find(function(r){return !r.busy;}) || null;
        if(row){row.busy=true;row.captured=true;row.generation=birthGeneration;enc.copyBufferToBuffer(sums,0,row.buffer,0,256);enc.clearBuffer(sums,0,40*4);}
      },
      afterSubmit:function(){
        var captured=row;row=null;if(!captured || !captured.captured)return;captured.captured=false;var generation=captured.generation;
        captured.buffer.mapAsync(GPUMapMode.READ).then(function(){
          if(retired || generation!==birthGeneration){captured.buffer.unmap();return;}
          var raw=captured.buffer.getMappedRange(),a=new Int32Array(raw).slice(),meta=new Float32Array(raw,56*4,4);
          lastClock=meta[0];maxAge=Math.max(maxAge,L.simulationClock-lastClock);latest=a;
          if(enabled)pendingImpulse.push({values:a.slice(0,40),clock:lastClock,frame:meta[1],time:meta[2]});
          captured.buffer.unmap();
        }).catch(function(e){if(!retired && generation===birthGeneration){error=e.message;companion.error=error;}}).finally(function(){captured.busy=false;});
      },
      couple:function(h,timescale,massPoint){
        if(!enabled || retired)return;var packets=pendingImpulse.splice(0),ring=bodyRing(b);
        packets.forEach(function(packet){
          var scale=packet.time*h/(timescale*massPoint*4096);
          for(var k=0;k<ring.length;k++){var i=ring[k].node;b.ox[i]-=packet.values[k*2]*scale;b.oy[i]-=packet.values[k*2+1]*scale;}
          b.sleeping=false;b.sleepFrames=0;
        });
      },
      pop:function(){if(!enabled)return false;enabled=false;b.waterBalloon=false;pendingImpulse.length=0;return true;},
      resetBirth:function(){birthGeneration++;queue.writeBuffer(tags,0,new Uint32Array(options.maxParticles*4));queue.writeBuffer(sums,0,new Int32Array(64));latest=new Int32Array(64);pendingImpulse.length=0;lastClock=L.simulationClock;maxAge=0;},
      stats:function(){var birthInside=latest[40];return {popped:!enabled,slitEdge:slit,birthInside:birthInside,birthOutside:latest[41],
        inside:latest[46],outside:latest[47],retainedFraction:birthInside?latest[46]/birthInside:null,contacts:latest[42],slitCrossings:latest[43],
        terrainBlocked:latest[44],sideViolations:latest[45],nonfinite:latest[48],waterCount:latest[49],
        waterCenterX:birthInside?latest[50]/16/birthInside:null,waterCenterY:birthInside?latest[51]/16/birthInside:null,
        contactClock:lastClock,contactFrame:new Float32Array(latest.buffer,56*4,4)[1],contactAgeSimulationSeconds:Math.max(0,L.simulationClock-lastClock),
        maxContactAgeSimulationSeconds:maxAge,frame:frame,pending:reads.some(function(r){return r.busy;}),error:error};},
      draw:function(ctx,body){
        var points=bodyRing(body);ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
        points.slice(1).forEach(function(v){ctx.lineTo(v.x,v.y);});ctx.closePath();ctx.fillStyle=options.colors.skin;ctx.globalAlpha=.08;ctx.fill();ctx.globalAlpha=1;
        ctx.lineWidth=2;ctx.strokeStyle=options.colors.edge;
        for(var k=0;k<points.length;k++){if(k===slit)continue;var a=points[k],c=points[(k+1)%points.length];ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();}
        ctx.restore();
      },
      destroy:function(){retired=true;pendingImpulse.length=0;buffers.forEach(function(value){try{value.destroy();}catch(e){}});}
    };
    return companion;
  }
  root.WSSWaterBalloons={create:create,geometry:{contains:contains,nearest:nearest,bodyRing:bodyRing,sweptEdge:sweptEdge},source:source};
})(typeof window!=='undefined'?window:globalThis);
