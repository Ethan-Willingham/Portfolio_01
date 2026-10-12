/* One opt-in solid curve. Optional normal wall constraint; ordinary coupling stays stock. */
(function(root){
'use strict';
var CAPACITY=4096,CLEARANCE=.42;
function specialize(source,binding,lanes,normalProjection,multiple,virtual){
 if(source.indexOf('fn guestContainsPoint(')<0)return source;
 var header=`
@group(0) @binding(${binding}) var<uniform> curveSkin:array<vec4f,${lanes || CAPACITY+3}>;
fn curveOwned(gi:i32)->bool {return curveSkin[0].y>=3. && gi==i32(curveSkin[0].x);}
fn curveCount(gi:i32,fallback:i32)->i32 {return select(fallback,i32(curveSkin[0].y),curveOwned(gi));}
fn curvePoint(gi:i32,k:i32)->vec4f {
 if(curveOwned(gi)){return curveSkin[3u+u32(k)];}return gameP.guestPts[gi*20+k];
}
fn curveInterior(gi:i32,p:vec2f)->bool {
 if(!curveOwned(gi)){return false;}var inside=false;let count=i32(curveSkin[0].y);var j=count-1;
 for(var k=0;k<count;k++){let a=curvePoint(gi,k).xy;let b=curvePoint(gi,j).xy;
  if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x){inside=!inside;}j=k;}
 return inside;
}
fn curveContains(gi:i32,p:vec2f)->bool {
 let bounds=curveSkin[1];if(any(abs(p-bounds.xy)>bounds.zw)){return false;}
 var inside=false;var nearest=1e20;let count=i32(curveSkin[0].y);var j=count-1;
 for(var k=0;k<count;k++){let a=curvePoint(gi,k).xy;let b=curvePoint(gi,j).xy;let e=b-a;
  let t=clamp(dot(p-a,e)/max(dot(e,e),1e-10),0.,1.);let d=p-mix(a,b,t);nearest=min(nearest,dot(d,d));
  if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x){inside=!inside;}j=k;}
 return inside || nearest<=${CLEARANCE*CLEARANCE};
}
fn curveBoundaryPoint(gi:i32,interior:bool,p:vec2f,a:vec4f,b:vec4f,t:f32)->vec2f {
 let q=mix(a.xy,b.xy,t);if(!curveOwned(gi)){return q;}
 let r=p-q;let distance=length(r);let edge=b.xy-a.xy;
 // Native loops traverse current to previous, opposite the stored winding.
 let normal=select(vec2f(-edge.y,edge.x)*curveSkin[0].z/max(length(edge),1e-10),
  r/max(distance,1e-10)*select(1.,-1.,interior),distance>1e-8);
 return q+normal*${CLEARANCE};
}
`;
 if(multiple){
  // Eight independent metadata rows preserve the stock guest ABI. Point
  // offsets refer into this one supported uniform, without truncation.
  header=header.replace('fn curveOwned(gi:i32)->bool {return curveSkin[0].y>=3. && gi==i32(curveSkin[0].x);}',
   'fn curveMeta(gi:i32,row:u32)->vec4f {return curveSkin[u32(gi)*3u+row];}\nfn curveOwned(gi:i32)->bool {if(gi<0 || gi>=8){return false;}return curveMeta(gi,0u).y>=3.;}');
  header=header.replaceAll('i32(curveSkin[0].y)','i32(curveMeta(gi,0u).y)')
   .replace('curveSkin[3u+u32(k)]','curveSkin[u32(curveMeta(gi,0u).x)+u32(k)]')
   .replace('let bounds=curveSkin[1]','let bounds=curveMeta(gi,1u)')
   .replace('curveSkin[0].z','curveMeta(gi,0u).z');
 }
 if(virtual){
  var declarations='',lane='fn curveLane(k:u32)->vec4f {\n';
  for(var page=0;page<virtual.pages;page++){
   declarations+='@group(0) @binding('+(binding+page)+') var<uniform> curvePage'+page+':array<vec4f,'+virtual.lanes+'>;\n';
   lane+=' if(k<'+((page+1)*virtual.lanes)+'u){return curvePage'+page+'[k-'+(page*virtual.lanes)+'u];}\n';
  }
  lane+=' return vec4f(0.);\n}\n';
  header=header.replace(/@group\(0\) @binding\(\d+\) var<uniform> curveSkin:array<vec4f,\d+>;/,declarations+lane)
   .replace('curveSkin[u32(gi)*3u+row]','curvePage0[1u+u32(gi)*3u+row]')
   .replace('curveSkin[u32(curveMeta(gi,0u).x)+u32(k)]','curveLane(u32(curveMeta(gi,0u).x)+u32(k))')
   .replace('if(gi<0 || gi>=8){return false;}','if(gi<8 || gi>=72){return false;}')
   .replace('if(!curveOwned(gi)){return false;}var inside=false;',
    'if(!curveOwned(gi)){return false;}let bounds=curveMeta(gi,1u);if(any(abs(p-bounds.xy)>bounds.zw)){return false;}var inside=false;');
  header+=`fn curveLoopCount()->i32 {return i32(curveLane(0u).x);}
fn curveSuppressed(gi:i32)->bool {
 if(gi<0 || gi>=8){return false;}return (u32(curveLane(0u).y)&(1u<<u32(gi)))!=0u;
}
fn curveGuestMeta(index:i32)->vec4f {
 let gi=index/2;
 if(curveOwned(gi)){
  if(index%2==0){return curveMeta(gi,1u);}
  let bodyMeta=curveMeta(gi,0u);let mean=curveMeta(gi,2u);return vec4f(2.,bodyMeta.y,mean.xy);
 }
 if(gi<0 || gi>=8 || curveSuppressed(gi)){return vec4f(0.);}
 return gameP.guests[index];
}
`;
  header=header.replace('let t=clamp(dot(p-a,e)/max(dot(e,e),1e-10),0.,1.);let d=p-mix(a,b,t);nearest=min(nearest,dot(d,d));',
   `let arithmeticPad=vec2f(${CLEARANCE})+(abs(p)+abs(a)+abs(b))*0.000000476837158203125;
  if(all(p>=min(a,b)-arithmeticPad) && all(p<=max(a,b)+arithmeticPad)){
   let t=clamp(dot(p-a,e)/max(dot(e,e),1e-10),0.,1.);let d=p-mix(a,b,t);nearest=min(nearest,dot(d,d));
   if(nearest<=${CLEARANCE*CLEARANCE}){return true;}
  }`);
  header+=`fn curveEdgeCannotWin(gi:i32,p:vec2f,a:vec4f,b:vec4f,t:f32,best:f32)->bool {
 if(!curveOwned(gi)){return false;}let edge=b.xy-a.xy;
 if(dot(edge,edge)<1e-6){return false;}
 let raw=mix(a.xy,b.xy,t);let distance=length(p-raw);
 let slack=(abs(p.x)+abs(p.y)+abs(a.x)+abs(a.y)+abs(b.x)+abs(b.y)+distance)*0.000000476837158203125;
 let lower=max(0.0,distance-${CLEARANCE}-slack);
 // Keep the original distance tie band and lexicographic candidate rule.
 return lower*lower>best+0.0001;
}
`;
  // Header and all 217 metadata lanes are guaranteed to be in page zero.
  header=header.replaceAll('curveLane(0u)','curvePage0[0]');
  source=source.replace(/((?:gi|ui|oi)\s*<\s*)8(?=\s*;)/g,'$1curveLoopCount()')
   .replace(/gameP\.guests\[([^\]]+)\]/g,'curveGuestMeta($1)');
  source=source.replace('fn guestContainsPoint(gi : i32, px : f32, py : f32) -> bool {',
   'fn guestContainsPoint(gi : i32, px : f32, py : f32) -> bool {\n  if(curveSuppressed(gi)){return false;}');
 }
 // Geometry-only mode keeps stock projection, affine response, terrain-clear
 // exit, union search and grid response. The separate wall option changes grid response.
 source=source.replace('fn guestContainsPoint(gi : i32, px : f32, py : f32) -> bool {',
  'fn guestContainsPoint(gi : i32, px : f32, py : f32) -> bool {\n  if(curveOwned(gi)){return curveContains(gi,vec2f(px,py));}');
 source=source.replace(/let gn = i32\(gB.y\);/g,'let gn = curveCount(gi,i32(gB.y));');
 source=source.replace(/let un = i32\(uB.y\);/g,'let un = curveCount(ui,i32(uB.y));');
 source=source.replace(/let on = i32\(oB.y\);/g,'let on = curveCount(oi,i32(oB.y));');
 source=source.replace(/gameP.guestPts\[gBase \+ (\w+)\]/g,'curvePoint(gi,$1)');
 source=source.replace(/gameP.guestPts\[uBase \+ (\w+)\]/g,'curvePoint(ui,$1)');
 source=source.replace(/gameP.guestPts\[oBase \+ (\w+)\]/g,'curvePoint(oi,$1)');
 var query=source.indexOf('fn gridWake(')>=0?'wx,wy':'x,y';
 ['g','u','o'].forEach(function(prefix){
  var owner=prefix==='g'?'gi':prefix+'i',base=prefix+'Base',needle='let '+base+' = '+owner+' * 20;';
  source=source.replaceAll(needle,needle+'\n    let '+prefix+'Interior=curveInterior('+owner+',vec2f('+query+'));');
 });
 source=source.replace('\n    let gInterior=curveInterior(gi,vec2f('+query+'));','');
 source=source.replace('let gmvx = gB.z;\n    let gmvy = gB.w;',
  multiple ? 'let gmvx=select(gB.z,curveMeta(bestGI,2u).x,curveOwned(bestGI));\n    let gmvy=select(gB.w,curveMeta(bestGI,2u).y,curveOwned(bestGI));' :
  'let gmvx=select(gB.z,curveSkin[2].x,curveOwned(bestGI));\n    let gmvy=select(gB.w,curveSkin[2].y,curveOwned(bestGI));');
 // Both the primary and terrain-clear fallback use the same expanded
 // quadratic domain. A concavity is never replaced by its coarse envelope.
 var replaced=0;
 source=source.replace(/let qx = pa.x \+ ex \* et;\n(\s*)let qy = pa.y \+ ey \* et;/g,function(match,space,offset){
  var before=source.slice(0,offset),g=before.lastIndexOf('let gBase ='),u=before.lastIndexOf('let uBase ='),o=before.lastIndexOf('let oBase ='),prefix=o>u&&o>g?'o':u>g?'u':'g',owner=prefix==='g'?'gi':prefix+'i';replaced++;
  var bound='';
  if(virtual){var best=prefix==='g'?'ringD2':prefix==='u'?(query==='wx,wy'?'unionD2':'uD2'):'oD2';
   bound='if(curveEdgeCannotWin('+owner+',vec2f('+query+'),pa,pb,et,'+best+')){'+(prefix==='g'?'gj=ge;':'')+'continue;}\n'+space;
  }
  return bound+'let curveQ=curveBoundaryPoint('+owner+','+prefix+'Interior,vec2f('+query+'),pa,pb,et);\n'+space+'let qx=curveQ.x; let qy=curveQ.y;';
 });
 source=source.replace('let mx = (pa.x + pb.x) * 0.5;\n          let my = (pa.y + pb.y) * 0.5;',
  (virtual?'if(curveEdgeCannotWin(oi,vec2f(x,y),pa,pb,.5,oD2)){continue;}\n          ':'')+'let curveQ=curveBoundaryPoint(oi,oInterior,vec2f(x,y),pa,pb,.5);\n          let mx=curveQ.x; let my=curveQ.y;');
 if(!replaced)throw Error('Actual-curve boundary query was not bound.');
 if(normalProjection && query==='wx,wy'){
  var start=source.indexOf('    // Motion-aware eviction survives'),end=source.indexOf('\n  }\n\n  // Snow receives',start);
  if(start<0 || end<=start)throw Error('Moving-wall grid response anchor differs.');
  var stock=source.slice(start,end);
  source=source.slice(0,start)+`    if(curveOwned(bestGI)){
      // The resolved union exterior supplies the normal and interpolated
      // wall velocity. A second own-ring query could select a hidden face.
      let normal=vec2f(gox,goy);
      let wallVelocity=vec2f(bestVX,bestVY)*(stepDt/CELL);
      let velocity=vec2f(cellVelX[c],cellVelY[c]);
      let incoming=min(0.0,dot(velocity-wallVelocity,normal));
      let constrained=velocity-incoming*normal;
      cellVelX[c]=constrained.x;cellVelY[c]=constrained.y;
    }else{
`+stock+'\n    }'+source.slice(end);
 }
 return header+source;
}
function create(instance,options){
 if(options.virtual===true)return createVirtual(instance,options);
 if(options.multiple===true)return createMany(instance,options);
 var U=GPUBufferUsage,rows=[],active=false,latest=null;
 var capacity=Math.min(CAPACITY,Math.floor(instance.device.limits.maxUniformBufferBindingSize/16)-3);
 if(!Number.isInteger(capacity) || capacity<3 || instance.device.limits.maxUniformBuffersPerShaderStage<4)throw Error('Actual-curve boundaries exceed the supported uniform allocation.');
 for(var i=0;i<options.slots;i++)rows.push(instance.device.createBuffer({label:'liquid.solidCurve.'+i,size:(capacity+3)*16,usage:U.UNIFORM|U.COPY_DST}));
 function prepare(gs,state){
  var curve=options.getCurve(gs,state);active=!!curve;latest=curve;
  if(curve && (instance.pressureModel&&instance.pressureModel.enabled || instance.toyMembrane || instance.materialSlip))throw Error('Solid curve lab requires the ordinary nonpressure water path.');
  if(curve && (curve.points.length<3 || curve.points.length>capacity || !Number.isInteger(curve.slot) || curve.slot<0 || curve.slot>=8))throw Error('Invalid solid curve geometry.');
  for(var slot=0;slot<state.writeSlots;slot++){
   var data=new Float32Array(curve?(curve.points.length+3)*4:12),back=(state.steps-1-Math.min(slot,state.steps-1))*state.h;
   if(curve){
    var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,meanX=0,meanY=0,area=0,n=curve.points.length;
    curve.points.forEach(function(p,k){var vx=p.vx,vy=p.vy,speed=Math.hypot(vx,vy),cap=instance.getSimParam('MAX_VEL');
     if(!Number.isFinite(p.x+p.y+vx+vy))throw Error('Non-finite solid curve.');if(cap>0&&speed>cap){vx*=cap/speed;vy*=cap/speed;}
     var x=p.x-vx*back,y=p.y-vy*back,q=curve.points[(k+1)%n];area+=p.x*q.y-q.x*p.y;
     data.set([x,y,vx,vy],(k+3)*4);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);meanX+=vx/n;meanY+=vy/n;
    });
    data.set([curve.slot,n,area>=0?1:-1,0]);data.set([(left+right)*.5,(top+bottom)*.5,(right-left)*.5+CLEARANCE,(bottom-top)*.5+CLEARANCE],4);
    data.set([meanX,meanY,0,0],8);
   }
   instance.queue.writeBuffer(rows[slot],0,data);
  }
 }
 return {buffers:rows,specialize:function(source,binding){return specialize(source,binding,capacity+3,options.normalProjection===true);},prepare:prepare,capacity:capacity,
  get active(){return active;},get current(){return latest;},destroy:function(){rows.forEach(function(b){b.destroy();});}};
}
// The private registered-body mode uses exactly the same geometry and
// native laws. Its eight legacy slots share one separately packed uniform.
function createMany(instance,options){
 var metadata=24,lanes=Math.min(4096,Math.floor(instance.device.limits.maxUniformBufferBindingSize/16));
 var capacity=lanes-metadata,rows=[],active=false,latest=[];
 if(capacity<3 || instance.device.limits.maxUniformBuffersPerShaderStage<4)throw Error('Actual-curve boundaries exceed the supported uniform allocation.');
 for(var i=0;i<options.slots;i++)rows.push(instance.device.createBuffer({label:'liquid.solidCurves.'+i,size:lanes*16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));
 function validate(curves){
  if(!Array.isArray(curves) || curves.length>8)throw Error('Solid curve lab supports only eight registered native guest slots.');
  var seen=new Set(),total=0;
  curves.forEach(function(curve){
   if(!Number.isInteger(curve.slot) || curve.slot<0 || curve.slot>=8 || seen.has(curve.slot) || !Array.isArray(curve.points) || curve.points.length<3)throw Error('Invalid registered solid curve geometry.');
   seen.add(curve.slot);total+=curve.points.length;
   curve.points.forEach(function(p){if(!Number.isFinite(p.x+p.y+p.vx+p.vy))throw Error('Non-finite solid curve.');});
  });
  if(total>capacity)throw Error('Registered solid curves exceed the supported uniform point capacity.');
  return total;
 }
 function prepare(gs,state){
  var curves=options.getCurve(gs,state) || [],total=validate(curves);
  if(curves.length && (instance.pressureModel&&instance.pressureModel.enabled || instance.toyMembrane || instance.materialSlip))throw Error('Solid curve lab requires the ordinary nonpressure water path.');
  // Validate every payload before any native write. Rejected geometry never
  // leaves a partially advanced set of body boundaries on the GPU.
  var payloads=[];
  for(var slot=0;slot<state.writeSlots;slot++){
   var data=new Float32Array((metadata+total)*4),back=(state.steps-1-Math.min(slot,state.steps-1))*state.h,offset=metadata;
   curves.forEach(function(curve){
    var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,meanX=0,meanY=0,area=0,n=curve.points.length;
    curve.points.forEach(function(p,k){var vx=p.vx,vy=p.vy,speed=Math.hypot(vx,vy),cap=instance.getSimParam('MAX_VEL');
     if(cap>0&&speed>cap){vx*=cap/speed;vy*=cap/speed;}
     var x=p.x-vx*back,y=p.y-vy*back,q=curve.points[(k+1)%n];area+=p.x*q.y-q.x*p.y;
     data.set([x,y,vx,vy],(offset+k)*4);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);meanX+=vx/n;meanY+=vy/n;
    });
    data.set([offset,n,area>=0?1:-1,0],curve.slot*12);
    data.set([(left+right)*.5,(top+bottom)*.5,(right-left)*.5+CLEARANCE,(bottom-top)*.5+CLEARANCE],curve.slot*12+4);
    data.set([meanX,meanY,0,0],curve.slot*12+8);offset+=n;
   });
   payloads.push(data);
  }
  payloads.forEach(function(data,slot){instance.queue.writeBuffer(rows[slot],0,data);});active=curves.length>0;latest=curves;
 }
 return {buffers:rows,capacity:capacity,validate:validate,prepare:prepare,
  specialize:function(source,binding){return specialize(source,binding,lanes,options.normalProjection===true,true);},
  get active(){return active;},get current(){return latest;},destroy:function(){rows.forEach(function(b){b.destroy();});}};
}
// Virtual ordinary guests keep legacy GameParams intact. Exact adaptive
// geometry spans supported uniform pages, never extra storage bindings.
function createVirtual(instance,options){
 var metadata=217,limits=instance.device.limits,lanes=Math.min(4096,Math.floor(limits.maxUniformBufferBindingSize/16));
 var pageCount=Math.min(9,Math.floor(limits.maxUniformBuffersPerShaderStage)-3),capacity=lanes*pageCount-metadata;
 if(pageCount<1 || lanes<metadata+3)throw Error('Virtual solid curves exceed the supported uniform allocation.');
 var pages=[],rows=[],active=false,latest=[];
 for(var slot=0;slot<options.slots;slot++){
  var frame=[];for(var page=0;page<pageCount;page++)frame.push(instance.device.createBuffer({label:'liquid.virtualCurves.'+slot+'.'+page,size:lanes*16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));
  pages.push(frame);rows.push(frame[0]);
 }
 function validate(curves){
  if(!Array.isArray(curves) || curves.length>64)throw Error('Virtual curves exceed the existing gel body allocation.');
  var seen=new Set(),total=0,mask=curves.legacyMask || 0;
  if(!Number.isInteger(mask) || mask<0 || mask>255)throw Error('Invalid virtual curve legacy routing.');
  curves.forEach(function(curve){
   if(!Number.isInteger(curve.slot) || curve.slot<8 || curve.slot>=72 || seen.has(curve.slot) || !Array.isArray(curve.points) || curve.points.length<3 || curve.points.length>4096)throw Error('Invalid virtual solid curve geometry.');
   seen.add(curve.slot);total+=curve.points.length;
   curve.points.forEach(function(p){if(!Number.isFinite(p.x+p.y+p.vx+p.vy))throw Error('Non-finite solid curve.');});
  });
  if(total>capacity)throw Error('Exact virtual solid curves exceed the supported uniform point capacity.');
  return total;
 }
 function prepare(gs,state){
  var curves=options.getCurve(gs,state) || [],total=validate(curves);
  if(curves.length && (instance.pressureModel&&instance.pressureModel.enabled || instance.toyMembrane || instance.materialSlip))throw Error('Solid curve lab requires the ordinary nonpressure water path.');
  var payloads=[],loopCount=curves.reduce(function(n,c){return Math.max(n,c.slot+1);},8);
  for(var frame=0;frame<state.writeSlots;frame++){
   var data=new Float32Array((metadata+total)*4),back=(state.steps-1-Math.min(frame,state.steps-1))*state.h,offset=metadata;
   data.set([loopCount,curves.legacyMask || 0,curves.length,total]);
   curves.forEach(function(curve){
    var left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,meanX=0,meanY=0,area=0,n=curve.points.length;
    curve.points.forEach(function(p,k){var vx=p.vx,vy=p.vy,speed=Math.hypot(vx,vy),cap=instance.getSimParam('MAX_VEL');
     if(cap>0&&speed>cap){vx*=cap/speed;vy*=cap/speed;}
     var x=p.x-vx*back,y=p.y-vy*back,q=curve.points[(k+1)%n];area+=p.x*q.y-q.x*p.y;
     data.set([x,y,vx,vy],(offset+k)*4);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);meanX+=vx/n;meanY+=vy/n;
    });
    var row=(1+curve.slot*3)*4;data.set([offset,n,area>=0?1:-1,0],row);
    data.set([(left+right)*.5,(top+bottom)*.5,(right-left)*.5+CLEARANCE,(bottom-top)*.5+CLEARANCE],row+4);data.set([meanX,meanY,0,0],row+8);offset+=n;
   });payloads.push(data);
  }
  payloads.forEach(function(data,frame){pages[frame].forEach(function(buffer,page){var start=page*lanes*4;if(start<data.length)instance.queue.writeBuffer(buffer,0,data.subarray(start,Math.min(data.length,(page+1)*lanes*4)));});});active=curves.length>0;latest=curves;
 }
 return {buffers:rows,pageBuffers:pages,pageCount:pageCount,capacity:capacity,validate:validate,prepare:prepare,
  uniformLayouts:function(binding){return pages[0].map(function(_,page){return {binding:binding+page,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}};});},
  uniformBindings:function(binding,slot){return pages[slot].map(function(buffer,page){return {binding:binding+page,resource:{buffer:buffer}};});},
  specialize:function(source,binding){return specialize(source,binding,lanes,options.normalProjection===true,true,{pages:pageCount,lanes:lanes});},
  get active(){return active;},get current(){return latest;},destroy:function(){pages.forEach(function(frame){frame.forEach(function(buffer){buffer.destroy();});});}};
}
root.LiquidCurveBoundary={create:create,specialize:specialize,clearance:CLEARANCE,capacity:CAPACITY};
})(typeof window!=='undefined'?window:globalThis);
