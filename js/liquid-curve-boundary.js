/* One opt-in solid curve. Optional normal wall constraint; ordinary coupling stays stock. */
(function(root){
'use strict';
var CAPACITY=4096,CLEARANCE=.42;
function specialize(source,binding,lanes,normalProjection){
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
  'let gmvx=select(gB.z,curveSkin[2].x,curveOwned(bestGI));\n    let gmvy=select(gB.w,curveSkin[2].y,curveOwned(bestGI));');
 // Both the primary and terrain-clear fallback use the same expanded
 // quadratic domain. A concavity is never replaced by its coarse envelope.
 var replaced=0;
 source=source.replace(/let qx = pa.x \+ ex \* et;\n(\s*)let qy = pa.y \+ ey \* et;/g,function(match,space,offset){
  var before=source.slice(0,offset),g=before.lastIndexOf('let gBase ='),u=before.lastIndexOf('let uBase ='),o=before.lastIndexOf('let oBase ='),prefix=o>u&&o>g?'o':u>g?'u':'g',owner=prefix==='g'?'gi':prefix+'i';replaced++;
  return 'let curveQ=curveBoundaryPoint('+owner+','+prefix+'Interior,vec2f('+query+'),pa,pb,et);\n'+space+'let qx=curveQ.x; let qy=curveQ.y;';
 });
 source=source.replace('let mx = (pa.x + pb.x) * 0.5;\n          let my = (pa.y + pb.y) * 0.5;',
  'let curveQ=curveBoundaryPoint(oi,oInterior,vec2f(x,y),pa,pb,.5);\n          let mx=curveQ.x; let my=curveQ.y;');
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
root.LiquidCurveBoundary={create:create,specialize:specialize,clearance:CLEARANCE,capacity:CAPACITY};
})(typeof window!=='undefined'?window:globalThis);
