/* Two-sided contacts keep native water on its birth side of an elastic skin.
 * The water integrator is unchanged. Contact reactions use the existing gel nodes. */
(function(root){
  'use strict';
  var CURVE_ERROR=.01, CURVE_CAPACITY=4096, LEDGER=CURVE_CAPACITY*2;
  function quadratic(controls,u){
    var n=controls.length/2,s=u*n,i=Math.floor(s)%n,t=s-Math.floor(s),a=(i+n-1)%n,c=(i+1)%n;
    var wa=.5*(1-t)*(1-t),wc=.5*t*t,wb=1-wa-wc;
    return {x:controls[a*2]*wa+controls[i*2]*wb+controls[c*2]*wc,
      y:controls[a*2+1]*wa+controls[i*2+1]*wb+controls[c*2+1]*wc};
  }
  // Each chord's exact quadratic deviation is bounded by .01 world pixels.
  // Include all original twenty slit boundaries in this same parameterization.
  function curveRing(controls,point){
    var n=controls.length/2,out=[];
    for(var i=0;i<n;i++){
      var a=(i+n-1)%n,c=(i+1)%n,dx=(controls[a*2]+controls[c*2])*.5-controls[i*2],dy=(controls[a*2+1]+controls[c*2+1])*.5-controls[i*2+1];
      var pieces=Math.max(1,Math.ceil(Math.sqrt(Math.hypot(dx,dy)/(4*CURVE_ERROR)))),cuts=[];
      for(var k=0;k<pieces;k++)cuts.push(k/pieces);
      for(var slit=0;slit<20;slit++){var t=slit*n/20-i;if(t>1e-10 && t<1-1e-10)cuts.push(t);}
      cuts.sort(function(a,b){return a-b;});
      cuts.forEach(function(t,index){if(index && t-cuts[index-1]<1e-10)return;
        var u=(i+t)/n,q=quadratic(controls,u),v=point?point(i,t):{};
        out.push(Object.assign(v,{x:q.x,y:q.y,param:u}));
      });
    }
    if(out.length>CURVE_CAPACITY)throw Error('Exact balloon curve exceeds the native geometry allocation.');
    out.controls=Array.from(controls);return out;
  }
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
    if(b.surfaceSlime && b.surfaceSlime.fluidRing)return b.surfaceSlime.fluidRing;
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
struct Guests { data:array<vec4f,${CURVE_CAPACITY*2}> };
struct Grid { count:u32, w:u32, h:u32, ox:u32, oy:u32, cells:u32, dt:f32, inv:f32,
 cols:f32, tile:f32, rows:f32, spare:f32, tc:u32, tr:u32, tw:u32, th:u32, region:vec4f };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> g:Guests;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> flag:array<u32>;
@group(0) @binding(4) var<storage,read_write> sides:array<vec4u>;
@group(0) @binding(5) var<storage,read_write> before:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> history:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> sums:array<atomic<i32>>;
@group(0) @binding(8) var<uniform> grid:Grid;
@group(0) @binding(9) var<storage,read> terrain:array<u32>;
@group(0) @binding(10) var<storage,read_write> affine:array<vec4f>;
fn n()->u32 {return u32(p.mode.w);}
fn ring(k:u32)->vec4f {return g.data[k];}
fn hole(k:u32)->bool {let u=g.data[${CURVE_CAPACITY}u+k].x;return (p.mode.y>=0. && u>=p.mode.y/20.-.0000001 && u<(p.mode.y+1.)/20.-.0000001) || (p.world.z>=0. && u>=p.world.z/20.-.0000001 && u<(p.world.z+1.)/20.-.0000001);}
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
 atomicAdd(&sums[select(${LEDGER+1}u,${LEDGER}u,side==2u)],1);
}
@compute @workgroup_size(256) fn seal(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(live(i)){sides[i].y=select(1u,2u,inside(pos[i].xy));}}
@compute @workgroup_size(256) fn snapshot(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(live(i)){before[i]=pos[i];}}
@compute @workgroup_size(1) fn saveRing(){for(var k=0u;k<n();k++){history[k]=ring(k);}history[${CURVE_CAPACITY}]=vec4f(1.);}
@compute @workgroup_size(256) fn contact(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i) || p.mode.x<.5 || n()<3u || sides[i].x==0u){return;}
 let original=pos[i];let start=before[i].xy;let wanted=sides[i].y==2u;
 var distance=1e20;var face=0u;var along=0.;var point=vec2f(0.);var winding=0.;var hit=vec2f(2.,0.);var hitFace=0u;
 for(var k=0u;k<n();k++){
  let a=ring(k);let b=ring((k+1u)%n());let edge=b.xy-a.xy;let length=dot(edge,edge);winding+=cross(a.xy,b.xy);
  if(length<1e-10){continue;}let t=clamp(dot(original.xy-a.xy,edge)/length,0.,1.);let q=mix(a.xy,b.xy,t);let d=dot(original.xy-q,original.xy-q);
  if(d<distance){distance=d;face=k;along=t;point=q;}
  let oldA=select(a.xy,history[k].xy,history[${CURVE_CAPACITY}].x>.5);let oldB=select(b.xy,history[(k+1u)%n()].xy,history[${CURVE_CAPACITY}].x>.5);
  let crossed=sweep(oldA,oldB,a.xy,b.xy,start,original.xy);
  if(crossed.x<hit.x){hit=crossed;hitFace=k;}
 }
 let now=inside(original.xy);let slit=i32(p.mode.y);
 // Only an actual trajectory crossing the missing edge changes accessible side.
 if(hit.x<=1. && hole(hitFace)){
  sides[i].y=select(1u,2u,now);sides[i].z+=1u;atomicAdd(&sums[${LEDGER+3}],1);return;
 }
 let tunneled=hit.x<=1. && !hole(hitFace);
 if(now==wanted && distance>=1.5625 && !tunneled){return;}
 if(tunneled){face=hitFace;along=hit.y;point=mix(ring(face).xy,ring((face+1u)%n()).xy,along);}
 if(hole(face)){return;}
 let a=ring(face);let b=ring((face+1u)%n());let edge=b.xy-a.xy;let edgeLength=length(edge);if(edgeLength<.00001){return;}
 let outward=vec2f(edge.y,-edge.x)/edgeLength*select(-1.,1.,winding>0.);
 let normal=outward*select(1.,-1.,wanted);let contactPoint=point+normal*1.25;
 if(inside(contactPoint)!=wanted || !clearPath(start,contactPoint)){atomicAdd(&sums[${LEDGER+4}],1);return;}
 let faceV=mix(a.zw,b.zw,along);let closing=min(0.,dot(original.zw-faceV,normal));let velocity=original.zw-normal*closing;
 pos[i]=vec4f(contactPoint,velocity);
 flag[i]=flag[i]&~0x00ffff10u;
 let C=affine[i];let normalColumn=vec2f(C.x*normal.x+C.z*normal.y,C.y*normal.x+C.w*normal.y);
 affine[i]=C-vec4f(normal.x*normalColumn.x,normal.x*normalColumn.y,normal.y*normalColumn.x,normal.y*normalColumn.y);
 let reaction=-(velocity-original.zw)*p.mode.z;
 let left=face*2u;let right=((face+1u)%n())*2u;
 atomicAdd(&sums[left],i32(round(reaction.x*(1.-along)*4096.)));atomicAdd(&sums[left+1u],i32(round(reaction.y*(1.-along)*4096.)));
 atomicAdd(&sums[right],i32(round(reaction.x*along*4096.)));atomicAdd(&sums[right+1u],i32(round(reaction.y*along*4096.)));
 atomicAdd(&sums[${LEDGER+2}],1);
}
@compute @workgroup_size(256) fn observe(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}let v=pos[i];atomicAdd(&sums[${LEDGER+9}],1);
 if(any(v!=v) || any(abs(v)>vec4f(1e10))){atomicAdd(&sums[${LEDGER+8}],1);return;}
 if(p.world.w>.5 && n()>=3u && inside(v.xy)){atomicAdd(&sums[${LEDGER+12}],1);}
 if(sides[i].x==2u){
  let contained=n()>=3u && inside(v.xy);if(contained){atomicAdd(&sums[${LEDGER+6}],1);}else{atomicAdd(&sums[${LEDGER+7}],1);}
  atomicAdd(&sums[${LEDGER+10}],i32(round(v.x*16.)));atomicAdd(&sums[${LEDGER+11}],i32(round(v.y*16.)));
 }
 if(p.mode.x>.5 && i32(p.mode.y)<0 && sides[i].x!=0u && inside(v.xy)!=(sides[i].y==2u)){atomicAdd(&sums[${LEDGER+5}],1);}
}
`;}
  async function create(options){
    var L=options.liquid,b=options.body,device=L.device,queue=L.queue,layout=L.getGuestUniformLayout(),U=GPUBufferUsage;
    if(!L.simActive || !b || b.ringN<3)throw Error('Water balloons need native water and a closed elastic ring.');
    var secondary=-1,reseal=false,retired=false,enabled=true,error=null,frame=0,birthGeneration=0,slot=-1,slit=-1,latest=new Int32Array(LEDGER+24),pendingImpulse=[],lastClock=0,maxAge=0,previousControls=null,frameRing=[];
    function skinRing(){return options.skinRing ? options.skinRing(b) : bodyRing(b);}
    var buffers=[];
    function buffer(size,usage){var value=device.createBuffer({size:size,usage:usage});buffers.push(value);return value;}
    var params=buffer(48,U.UNIFORM|U.COPY_DST),tags=buffer(options.maxParticles*16,U.STORAGE|U.COPY_DST|U.COPY_SRC),
      before=buffer(options.maxParticles*16,U.STORAGE|U.COPY_SRC),history=buffer((CURVE_CAPACITY+1)*16,U.STORAGE|U.COPY_DST),
      sums=buffer((LEDGER+24)*4,U.STORAGE|U.COPY_DST|U.COPY_SRC),
      shapes=Array.from({length:layout.slots},function(){return buffer(CURVE_CAPACITY*32,U.STORAGE|U.COPY_DST);}),reads=[];
    function readRow(){var row={buffer:buffer((LEDGER+24)*4,U.MAP_READ|U.COPY_DST),busy:false,captured:false};reads.push(row);return row;}
    for(var ri=0;ri<3;ri++)readRow();
    // An exposed lower-side opening can drain while the base rests on the
    // basin. A bottom opening is naturally plugged by that same solid floor.
    if(options.slit){var initialRing=options.slitRing ? options.slitRing(b) : bodyRing(b),best=-Infinity;for(var k=0;k<initialRing.length;k++){
      var a=initialRing[k],c=initialRing[(k+1)%initialRing.length],x=(a.x+c.x)*.5-b.cx,y=(a.y+c.y)*.5-b.cy;
      var score=x+y*.5;if(y>=0 && score>best){best=score;slit=k;}}
    }
    var code=source(layout),module=device.createShaderModule({code:code}),info=await module.getCompilationInfo();
    if(info.messages.some(function(m){return m.type==='error';}))throw Error(info.messages.map(function(m){return m.lineNum+': '+m.message;}).join('; '));
    var pipes={},groups={};
    for(var name of ['birth','seal','snapshot','saveRing','contact','observe']){
      pipes[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});
      var used=name==='seal'?[0,1,2,3,4]:name==='birth'?[0,1,2,3,4,5,7]:name==='snapshot'?[0,2,3,5]:name==='saveRing'?[0,1,6]:name==='contact'?[0,1,2,3,4,5,6,7,8,9,10]:[0,1,2,3,4,7];
      groups[name]=shapes.map(function(shapeBuffer){
        var resources=[params,shapeBuffer,L.buf.pos,L.buf.flag,tags,before,history,sums,L.paramsBuf,L.buf.terrainMask,L.buf.affine];
        return device.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:used.map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
      });
    }
    function encode(enc,name,substep,count){var pass=enc.beginComputePass({label:'toy.balloon.'+name});pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name][substep]);pass.dispatchWorkgroups(name==='saveRing'?1:Math.max(1,Math.ceil(count/256)));pass.end();}
    var row=null;
    var companion={body:b,tags:tags,ready:true,error:null,
      setSlot:function(value){slot=value;},
      beginFrame:function(enc,state){
        if(retired)return;if(error)throw Error(error);if(enabled && slot<0)throw Error('Water balloon left its native boundary slot.');
        frame++;frameRing=enabled ? skinRing() : [];
        if(enabled && (frameRing.length<3 || frameRing.length>CURVE_CAPACITY))throw Error('Invalid balloon curve geometry.');
        var count=frameRing.length,steps=Math.round((state.clock-L.simulationClock)/state.h),old=new Float32Array((CURVE_CAPACITY+1)*4);
        // Re-sample the prior exact curve at this frame's parameters. The
        // adaptive chord count may change, but material parameters do not.
        if(previousControls && frameRing.controls){for(var k=0;k<count;k++){var v=quadratic(previousControls,frameRing[k].param);old[k*4]=v.x;old[k*4+1]=v.y;}old[CURVE_CAPACITY*4]=1;}
        queue.writeBuffer(history,0,old);
        var vmax=L.getSimParam('MAX_VEL');
        for(var q=0;q<steps;q++){var shape=new Float32Array(CURVE_CAPACITY*8),back=(steps-1-q)*state.h;
          for(var k=0;k<count;k++){var v=frameRing[k],vx=v.vx || 0,vy=v.vy || 0,speed=Math.hypot(vx,vy);if(vmax>0 && speed>vmax){vx*=vmax/speed;vy*=vmax/speed;}
            shape[k*4]=v.x-vx*back;shape[k*4+1]=v.y-vy*back;shape[k*4+2]=vx;shape[k*4+3]=vy;
            shape[CURVE_CAPACITY*4+k*4]=v.param===undefined ? k/count : v.param;}
          queue.writeBuffer(shapes[q],0,shape);
        }
        previousControls=frameRing.controls ? Array.from(frameRing.controls) : null;
        var values=new Float32Array([state.count,Math.max(0,slot),state.h,frame,enabled?1:0,slit,.002,count,options.width,options.height,secondary,options.countCarried?1:0]);
        queue.writeBuffer(params,0,values);enc.clearBuffer(sums,(LEDGER+5)*4,8*4);
        queue.writeBuffer(sums,(LEDGER+16)*4,new Float32Array([state.clock,frame,L.getSimParam('TIMESCALE'),0]));
      },
      beforeSubstep:function(enc,state){
        encode(enc,'birth',state.substep,state.count);
        if(reseal){encode(enc,'seal',state.substep,state.count);reseal=false;}
        encode(enc,'contact',state.substep,state.count);encode(enc,'saveRing',state.substep,state.count);
        encode(enc,'snapshot',state.substep,state.count);
      },
      afterSubstep:function(enc,state){encode(enc,'contact',state.substep,state.count);},
      captureFrame:function(enc,state){
        encode(enc,'observe',state.substep,state.count);row=reads.find(function(r){return !r.busy;}) || readRow();
        // Every reaction packet retains its own curve-node weights. Never
        // accumulate impulses across different adaptive tessellations.
        row.ring=frameRing;row.busy=true;row.captured=true;row.generation=birthGeneration;
        enc.copyBufferToBuffer(sums,0,row.buffer,0,(LEDGER+24)*4);enc.clearBuffer(sums,0,LEDGER*4);
      },
      afterSubmit:function(){
        var captured=row;row=null;if(!captured || !captured.captured)return;captured.captured=false;var generation=captured.generation;
        captured.buffer.mapAsync(GPUMapMode.READ).then(function(){
          if(retired || generation!==birthGeneration){captured.buffer.unmap();return;}
          var raw=captured.buffer.getMappedRange(),a=new Int32Array(raw).slice(),meta=new Float32Array(raw,(LEDGER+16)*4,4);
          lastClock=meta[0];maxAge=Math.max(maxAge,L.simulationClock-lastClock);latest=a;
          if(enabled)pendingImpulse.push({values:a.slice(0,captured.ring.length*2),ring:captured.ring,clock:lastClock,frame:meta[1],time:meta[2]});
          captured.buffer.unmap();
        }).catch(function(e){if(!retired && generation===birthGeneration){error=e.message;companion.error=error;}}).finally(function(){captured.busy=false;});
      },
      couple:function(h,timescale,massPoint){
        if(!enabled || retired)return;var packets=pendingImpulse.splice(0);
        packets.forEach(function(packet){
          var ring=packet.ring,scale=packet.time*h/(timescale*massPoint*4096);
          for(var k=0;k<ring.length;k++){var nodes=ring[k].weights || [{node:ring[k].node,weight:1}];nodes.forEach(function(point){b.ox[point.node]-=packet.values[k*2]*scale*point.weight;b.oy[point.node]-=packet.values[k*2+1]*scale*point.weight;});}
          b.sleeping=false;b.sleepFrames=0;
        });
      },
      setStaticSlit:function(value){secondary=value;},
      setSlit:function(value,edge){if(!value && slit>=0)reseal=true;slit=value?edge===undefined?options.valveSlit===undefined?5:options.valveSlit:edge:-1;return slit;},
      pop:function(){if(!enabled)return false;enabled=false;b.waterBalloon=false;pendingImpulse.length=0;return true;},
      resetBirth:function(){birthGeneration++;queue.writeBuffer(tags,0,new Uint32Array(options.maxParticles*4));queue.writeBuffer(sums,0,new Int32Array(LEDGER+24));latest=new Int32Array(LEDGER+24);previousControls=null;pendingImpulse.length=0;lastClock=L.simulationClock;maxAge=0;},
      stats:function(){var birthInside=latest[LEDGER+0];return {popped:!enabled,slitEdge:slit,birthInside:birthInside,birthOutside:latest[LEDGER+1],
        inside:latest[LEDGER+6],carriedInside:latest[LEDGER+12],outside:latest[LEDGER+7],retainedFraction:birthInside?latest[LEDGER+6]/birthInside:null,contacts:latest[LEDGER+2],slitCrossings:latest[LEDGER+3],
        terrainBlocked:latest[LEDGER+4],sideViolations:latest[LEDGER+5],nonfinite:latest[LEDGER+8],waterCount:latest[LEDGER+9],
        waterCenterX:birthInside?latest[LEDGER+10]/16/birthInside:null,waterCenterY:birthInside?latest[LEDGER+11]/16/birthInside:null,
        contactClock:lastClock,contactFrame:new Float32Array(latest.buffer,(LEDGER+16)*4,4)[1],contactAgeSimulationSeconds:Math.max(0,L.simulationClock-lastClock),
        maxContactAgeSimulationSeconds:maxAge,curvePoints:frameRing.length,curveErrorWorldPixels:CURVE_ERROR,frame:frame,pending:reads.some(function(r){return r.busy;}),error:error};},
      draw:function(ctx,body){
        if(options.skinPath){ctx.save();ctx.fillStyle=options.colors.skin;ctx.globalAlpha=.08;ctx.fill(options.skinPath(body,-1));ctx.globalAlpha=1;ctx.lineWidth=2;ctx.strokeStyle=options.colors.edge;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(options.skinPath(body,secondary>=0?[slit,secondary]:slit));ctx.restore();return;}
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
  root.WSSWaterBalloons={create:create,geometry:{quadratic:quadratic,curveRing:curveRing,curveError:CURVE_ERROR,contains:contains,nearest:nearest,bodyRing:bodyRing,sweptEdge:sweptEdge},source:source};
})(typeof window!=='undefined'?window:globalThis);
