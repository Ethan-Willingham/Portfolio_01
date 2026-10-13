/* Finite dry grains and a force-driven rigid hourglass on the GPU.
 * Positions are glass-local; velocities and contact impulses are inertial.
 * Grain walls, rendered glass and floor contacts share the same geometry. */
(function(root){
'use strict';
var G={cx:360,top:56,bottom:344,shoulder:80,upper:108,neckTop:188,neckBottom:212,lower:292,heel:320,wide:104,end:80,neck:1.54,radius:.35,scale:2,pitch:.7*1.03};
var grainFriction=.55,glassFriction=.32;
var BODY={scale:.75,mass:1.8,sandMass:1,gripHz:3,gripDamping:.8,maxGripAcceleration:1500};
function configure(scale){
 scale=Math.max(2,Math.min(6,Number(scale)||2));
 G.radius=1.4/scale*.5;G.neck=G.radius*4.4;G.scale=scale;G.pitch=G.radius*2*1.03;
 return Object.assign({},G);
}
function smooth(t){return t*t*(3-2*t);}
function halfWidth(y){
 if(y<G.top || y>G.bottom)return G.end;
 if(y<G.shoulder)return G.end+(G.wide-G.end)*Math.sqrt(Math.max(0,1-Math.pow((G.shoulder-y)/(G.shoulder-G.top),2)));
 if(y<G.upper)return G.wide;
 if(y<G.neckTop)return G.wide+(G.neck-G.wide)*smooth((y-G.upper)/(G.neckTop-G.upper));
 if(y<G.neckBottom)return G.neck;
 if(y<G.lower)return G.neck+(G.wide-G.neck)*smooth((y-G.neckBottom)/(G.lower-G.neckBottom));
 if(y<G.heel)return G.wide;
 return G.end+(G.wide-G.end)*Math.sqrt(Math.max(0,1-Math.pow((y-G.heel)/(G.bottom-G.heel),2)));
}
function contains(x,y,pad){
 pad=pad||0;var slope=(halfWidth(Math.min(G.bottom,y+.01))-halfWidth(Math.max(G.top,y-.01)))/.02;
 return y>=G.top+pad && y<=G.bottom-pad && Math.abs(x-G.cx)<=halfWidth(y)-pad*Math.sqrt(1+slope*slope);
}
// Observe the real inventory on the simulation clock. The timer never drives
// the grains. A stable reversal starts a run, while a tumble has no useful ETA.
function createTimer(clock,total){
 var direction=1,run=1,start=clock,end=null,sampledAt=clock,remaining=total;
 var pending=0,pendingSince=clock,history=[],rate=0,lastFlow=clock,steady=true;
 function sample(now,upper,throat,lower,angle,spin){
  if(now<=sampledAt || upper+throat+lower!==total)return;
  sampledAt=now;
  var vertical=Math.cos(angle);steady=Math.abs(vertical)>.55 && Math.abs(spin)<1.4;
  var next=steady?(vertical>0?1:-1):0;
  if(next && next!==direction){
   if(pending!==next){pending=next;pendingSince=now;}
   if(now-pendingSince>=.3){direction=next;run++;start=pendingSince;end=null;pending=0;history=[];rate=0;lastFlow=now;}
  }else pending=0;
  var count=(direction===1?upper:lower)+throat;
  if(count<remaining)lastFlow=now;
  remaining=count;
  if(remaining>0)end=null;
  if(!steady || pending){history=[];rate=0;return;}
  if(remaining===0 && end===null)end=now;
  history.push([now,remaining]);
  while(history.length>1 && now-history[0][0]>3)history.shift();
  var span=now-history[0][0],moved=history[0][1]-remaining;
  rate=span>=.75 && moved>=4 && now-lastFlow<.75?Math.max(0,moved/span):0;
 }
 function stats(now){
  var status=end!==null?'complete':!steady || pending?'turning':rate>0?'flowing':now-lastFlow>1.5?'stalled':'measuring';
  return {run:run,direction:direction,elapsed:Math.max(0,(end===null?now:end)-start),remaining:remaining,total:total,
   fraction:total?1-remaining/total:0,rate:rate,remainingSeconds:status==='complete'?0:status==='flowing'?remaining/rate:null,status:status,sampledAt:sampledAt};
 }
 return {sample:sample,stats:stats};
}
function timeText(seconds,tenths){
 var ticks=Math.floor(Math.max(0,seconds)*10+1e-6),whole=Math.floor(ticks/10);
 return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0')+(tenths?'.'+ticks%10:'');
}
// Constants are authored once above and used verbatim by the actual GPU walls.
function profileSource(){return `
fn halfWidth(y:f32)->f32 {
 if(y<${G.shoulder}.) {let t=(${G.shoulder}.-y)/${G.shoulder-G.top}.;return ${G.end}.+${G.wide-G.end}.*sqrt(max(0.,1.-t*t));}
 if(y<${G.upper}.) {return ${G.wide}.;}
 if(y<${G.neckTop}.) {let t=clamp((y-${G.upper}.)/${G.neckTop-G.upper}.,0.,1.);return mix(${G.wide}.,${G.neck},t*t*(3.-2.*t));}
 if(y<${G.neckBottom}.) {return ${G.neck};}
 if(y<${G.lower}.) {let t=clamp((y-${G.neckBottom}.)/${G.lower-G.neckBottom}.,0.,1.);return mix(${G.neck},${G.wide}.,t*t*(3.-2.*t));}
 if(y<${G.heel}.) {return ${G.wide}.;}
 let t=(y-${G.heel}.)/${G.bottom-G.heel}.;return ${G.end}.+${G.wide-G.end}.*sqrt(max(0.,1.-t*t));
}
`;}
function bodyInertia(){
 var area=0,moment=0;
 for(var y=G.top;y<G.bottom;y++){
  var inside=halfWidth(y+.5),outside=inside+7,dy=y+.5-200;
  area+=2*(outside-inside);moment+=2*((outside*outside*outside-inside*inside*inside)/3+dy*dy*(outside-inside));
 }
 for(y=G.top-7;y<G.bottom+7;y++)if(y<G.top || y>=G.bottom){
  var width=G.end+7;dy=y+.5-200;area+=2*width;moment+=2*(width*width*width/3+dy*dy*width);
 }
 return BODY.mass*BODY.scale*BODY.scale*moment/area;
}
function hullPoints(){
 var points=[[-G.end-7,G.top-7-200],[G.end+7,G.top-7-200],[-G.end-7,G.bottom+7-200],[G.end+7,G.bottom+7-200]];
 for(var y=G.top;y<=G.bottom;y++)points.push([-halfWidth(y)-7,y-200],[halfWidth(y)+7,y-200]);
 // Plane contacts need only the convex hull, built from every visible edge vertex.
 // This preserves the exact mesh support while avoiding hundreds of interior points.
 points.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
 function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
 var low=[],high=[];
 points.forEach(function(p){while(low.length>1&&cross(low[low.length-2],low[low.length-1],p)<=0)low.pop();low.push(p);});
 points.slice().reverse().forEach(function(p){while(high.length>1&&cross(high[high.length-2],high[high.length-1],p)<=0)high.pop();high.push(p);});
 low.pop();high.pop();return low.concat(high);
}
function rigidSource(){var points=hullPoints(),bound=Math.max.apply(Math,points.map(function(p){return Math.hypot(p[0],p[1]);}));return `
const BODY_MASS:f32=${BODY.mass};
const BODY_INERTIA:f32=${bodyInertia()};
const HULL=array<vec2f,${points.length}>(${points.map(function(p){return 'vec2f('+p.join(',')+')';}).join(',')});
fn turn(p:vec2f,a:f32)->vec2f {let c=cos(a);let s=sin(a);return vec2f(c*p.x-s*p.y,s*p.x+c*p.y);}
fn cross2(a:vec2f,b:vec2f)->f32 {return a.x*b.y-a.y*b.x;}
fn spin(r:vec2f,w:f32)->vec2f {return vec2f(-r.y,r.x)*w;}
fn worldPoint(p:vec2f)->vec2f {return rigid.pose.xy+turn((p-vec2f(${G.cx},200))*rigid.pose.w,rigid.pose.z);}
fn bodyImpulse(j:vec2f,r:vec2f){rigid.velocity=vec4f(rigid.velocity.xy+j/BODY_MASS,rigid.velocity.z+cross2(r,j)/BODY_INERTIA,0.);}
fn stagePlane(normal:vec2f,offset:f32){
 if(dot(rigid.pose.xy,normal)-offset>${bound}*rigid.pose.w){return;}
 var penetration=0.;
 for(var i=0u;i<${points.length}u;i++){
  let p=rigid.pose.xy+turn(HULL[i]*rigid.pose.w,rigid.pose.z);
  penetration=max(penetration,offset-dot(p,normal));
 }
 rigid.pose=vec4f(rigid.pose.xy+normal*penetration,rigid.pose.zw);
 for(var i=0u;i<${points.length}u;i++){
  let r=turn(HULL[i]*rigid.pose.w,rigid.pose.z);let p=rigid.pose.xy+r;
  if(dot(p,normal)-offset>.015){continue;}
  let velocity=rigid.velocity.xy+spin(r,rigid.velocity.z);let incoming=dot(velocity,normal);
  if(incoming>=0.){continue;}
  let arm=cross2(r,normal);let inverse=1./BODY_MASS+arm*arm/BODY_INERTIA;
  let restitution=select(0.,.12,incoming< -20.);let jn=-(1.+restitution)*incoming/inverse;
  bodyImpulse(normal*jn,r);
  let tangent=vec2f(-normal.y,normal.x);let slip=dot(rigid.velocity.xy+spin(r,rigid.velocity.z),tangent);
  let tangentArm=cross2(r,tangent);let jt=clamp(-slip/(1./BODY_MASS+tangentArm*tangentArm/BODY_INERTIA),-.6*jn,.6*jn);
  bodyImpulse(tangent*jt,r);
 }
}
@compute @workgroup_size(1)
fn bodyStep(){
 rigid.previous=rigid.pose;
 rigid.velocity=vec4f(rigid.velocity.xy+vec2f(0.,cfg.gravity*cfg.h),rigid.velocity.z,0.);
 if(cfg.held>0.){
  let r=turn((cfg.hand.zw-vec2f(${G.cx},200))*rigid.pose.w,rigid.pose.z);
  let error=rigid.pose.xy+r-cfg.hand.xy;let velocity=rigid.velocity.xy+spin(r,rigid.velocity.z);
  // A damped point spring, solved with the anchor's full 2 by 2 effective mass.
  // It applies finite force and torque; it never sets pose or release velocity.
  let frequency=${BODY.gripHz}*6.28318530718;let stiffness=BODY_MASS*frequency*frequency;
  let damping=2.*${BODY.gripDamping}*BODY_MASS*frequency;
  let gamma=1./(cfg.h*(damping+cfg.h*stiffness));let beta=cfg.h*stiffness/(damping+cfg.h*stiffness);
  let kx=1./BODY_MASS+r.y*r.y/BODY_INERTIA+gamma;
  let ky=1./BODY_MASS+r.x*r.x/BODY_INERTIA+gamma;let kxy=-r.x*r.y/BODY_INERTIA;
  let rhs=velocity+error*(beta/cfg.h);let determinant=kx*ky-kxy*kxy;
  var j=-vec2f(ky*rhs.x-kxy*rhs.y,kx*rhs.y-kxy*rhs.x)/determinant;
  j*=min(1.,BODY_MASS*${BODY.maxGripAcceleration}*cfg.h/max(.00001,length(j)));bodyImpulse(j,r);
 }
 rigid.pose=vec4f(rigid.pose.xy+rigid.velocity.xy*cfg.h-vec2f(0.,.5*cfg.gravity*cfg.h*cfg.h),rigid.pose.z+rigid.velocity.z*cfg.h,rigid.pose.w);
 for(var iteration=0;iteration<4;iteration++){
  stagePlane(vec2f(1.,0.),cfg.limits.x);stagePlane(vec2f(-1.,0.),-cfg.limits.z);
  stagePlane(vec2f(0.,1.),cfg.limits.y);stagePlane(vec2f(0.,-1.),-cfg.limits.w);
 }
}
var<workgroup> sums:array<vec4f,256>;
@compute @workgroup_size(256)
fn reduceReaction(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u){
 var value=vec4f(0.);if(id.x<cfg.count){value=reaction[id.x];}sums[local.x]=value;workgroupBarrier();
 for(var stride=128u;stride>0u;stride/=2u){if(local.x<stride){sums[local.x]+=sums[local.x+stride];}workgroupBarrier();}
 if(local.x==0u){partials[group.x]=sums[0];}
}
@compute @workgroup_size(1)
fn applyReaction(){
 var impulse=vec4f(0.);for(var i=0u;i<(cfg.count+255u)/256u;i++){impulse+=partials[i];}
 rigid.velocity=vec4f(rigid.velocity.xy+impulse.xy/BODY_MASS,rigid.velocity.z+impulse.z/BODY_INERTIA,0.);
 rigid.reaction=impulse;
}
`;}
function solverSource(cols,rows,cell,grainMass){
 var t=1-(G.radius-.01)/(G.shoulder-G.top),roundedSlope=(G.wide-G.end)/(G.shoulder-G.top)*t/Math.sqrt(1-t*t);
 var funnelSlope=1.5*(G.wide-G.neck)/Math.min(G.neckTop-G.upper,G.lower-G.neckBottom);
 var safeInset=G.radius*Math.hypot(1,Math.max(roundedSlope,funnelSlope))+.01;
 return profileSource()+`
struct Params {count:u32,h:f32,gravity:f32,held:f32,hand:vec4f,limits:vec4f};
struct Rigid {pose:vec4f,velocity:vec4f,previous:vec4f,reaction:vec4f};
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> heads:array<atomic<u32>>;
@group(0) @binding(3) var<storage,read_write> links:array<u32>;
@group(0) @binding(4) var<uniform> cfg:Params;
@group(0) @binding(5) var<storage,read_write> rigid:Rigid;
@group(0) @binding(6) var<storage,read_write> reaction:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> partials:array<vec4f>;
@group(0) @binding(8) var<storage,read_write> census:vec4f;
const DIAMETER:f32=${G.radius*2};
const GRAIN_MASS:f32=${grainMass};
const SAFE_WALL_INSET:f32=${safeInset};
const CELL:f32=${cell};
const COLS:u32=${cols}u;
const ROWS:u32=${rows}u;
`+rigidSource()+`
@compute @workgroup_size(256)
fn countBulbs(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_id) local:vec3u,@builtin(workgroup_id) group:vec3u){
 var value=vec4f(0.);
 if(id.x<cfg.count){let y=source[id.x].y;value=vec4f(select(0.,1.,y<${G.neckTop}.),select(0.,1.,y>=${G.neckTop}. && y<=${G.neckBottom}.),select(0.,1.,y>${G.neckBottom}.),1.);}
 sums[local.x]=value;workgroupBarrier();
 for(var stride=128u;stride>0u;stride/=2u){if(local.x<stride){sums[local.x]+=sums[local.x+stride];}workgroupBarrier();}
 if(local.x==0u){partials[group.x]=sums[0];}
}
@compute @workgroup_size(1)
fn sumBulbs(){
 var value=vec4f(0.);for(var i=0u;i<(cfg.count+255u)/256u;i++){value+=partials[i];}census=value;
}
fn cellAt(p:vec2f)->vec2i {
 return clamp(vec2i(floor((p-vec2f(${G.cx-G.wide-2}.,${G.top-2}.))/CELL)),vec2i(0),vec2i(i32(COLS)-1,i32(ROWS)-1));
}
fn glassContact(i:u32,p:vec2f,velocity:vec2f,localNormal:vec2f)->vec2f {
 let normal=turn(localNormal,rigid.pose.z);let r=worldPoint(p)-rigid.pose.xy+normal*(${G.radius}*rigid.pose.w);
 let surfaceVelocity=rigid.velocity.xy+spin(r,rigid.velocity.z);let relative=velocity-surfaceVelocity;
 let incoming=max(0.,dot(relative,normal));let arm=cross2(r,normal);
 let normalDelta=incoming/(1.+GRAIN_MASS*(1./BODY_MASS+arm*arm/BODY_INERTIA));
 let tangent=vec2f(-normal.y,normal.x);let speed=dot(relative,tangent);let tangentArm=cross2(r,tangent);
 let tangentDelta=clamp(speed/(1.+GRAIN_MASS*(1./BODY_MASS+tangentArm*tangentArm/BODY_INERTIA)),-normalDelta*${glassFriction},normalDelta*${glassFriction});
 let delta=-normal*normalDelta-tangent*tangentDelta;let j=-delta*GRAIN_MASS;
 reaction[i]+=vec4f(j,cross2(r,j),length(j));return velocity+delta;
}
fn wall(state:vec4f,i:u32)->vec4f {
 var p=state.xy;var v=state.zw;
 // The floor and ceiling resist sliding just like the curved glass does.
 if(p.y<${G.top+G.radius}){p.y=${G.top+G.radius};v=glassContact(i,p,v,vec2f(0.,-1.));}
 if(p.y>${G.bottom-G.radius}){p.y=${G.bottom-G.radius};v=glassContact(i,p,v,vec2f(0.,1.));}
 for(var k=0;k<4;k++){
  let side=select(-1.,1.,p.x>=${G.cx}.);
  let width=halfWidth(p.y);
  // This analytic slope bound rejects interior grains before expensive normals.
  if(width-abs(p.x-${G.cx}.)>=SAFE_WALL_INSET){break;}
  let slope=(halfWidth(min(${G.bottom}.,p.y+.01))-halfWidth(max(${G.top}.,p.y-.01)))/.02;
  let normal=normalize(vec2f(side,-slope));
  let distance=(width-abs(p.x-${G.cx}.))*abs(normal.x);
  if(distance>=${G.radius}){break;}
  p-=normal*(${G.radius}-distance);
  p.y=clamp(p.y,${G.top+G.radius},${G.bottom-G.radius});
  v=glassContact(i,p,v,normal);
 }
 return vec4f(p,v);
}
@compute @workgroup_size(256)
fn predict(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.count){return;}
 let p=source[i];let acceleration=vec2f(0.,cfg.gravity);reaction[i]=vec4f(0.);
 let previousWorld=rigid.previous.xy+turn((p.xy-vec2f(${G.cx},200))*rigid.previous.w,rigid.previous.z);
 let position=previousWorld+p.zw*cfg.h+acceleration*(.5*cfg.h*cfg.h);
 let local=vec2f(${G.cx},200)+turn(position-rigid.pose.xy,-rigid.pose.z)/rigid.pose.w;
 dest[i]=wall(vec4f(local,p.zw+acceleration*cfg.h),i);
}
@compute @workgroup_size(256)
fn clear(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.count){return;}
 let c=cellAt(source[i].xy);atomicStore(&heads[u32(c.y)*COLS+u32(c.x)],0u);
}
@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.count){return;}
 let c=cellAt(source[i].xy);let slot=u32(c.y)*COLS+u32(c.x);
 links[i]=atomicExchange(&heads[slot],i+1u);
}
@compute @workgroup_size(256)
fn contacts(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.count){return;}let p=source[i];let c=cellAt(p.xy);
 let cosine=cos(rigid.pose.z);let sine=sin(rigid.pose.z);
 var shift=vec2f(0.);var impulse=vec2f(0.);var neighbors=0.;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let q=c+vec2i(x,y);if(any(q<vec2i(0))||q.x>=i32(COLS)||q.y>=i32(ROWS)){continue;}
  var entry=atomicLoad(&heads[u32(q.y)*COLS+u32(q.x)]);
  // Every member is visited, with no bucket cap or sampled representatives.
  while(entry!=0u){
   let j=entry-1u;entry=links[j];if(j==i){continue;}
   let other=source[j];let delta=p.xy-other.xy;let d2=dot(delta,delta);
   if(d2>=DIAMETER*DIAMETER){continue;}
   var normal=vec2f(select(-1.,1.,i<j),0.);var distance=0.;
   if(d2>1e-12){distance=sqrt(d2);normal=delta/distance;}
   shift+=normal*(DIAMETER-distance)*.5;neighbors+=1.;
   let worldNormal=vec2f(cosine*normal.x-sine*normal.y,sine*normal.x+cosine*normal.y);let relative=p.zw-other.zw;
   let support=(DIAMETER-distance)*.5*rigid.pose.w/cfg.h;
   let tangent=relative-worldNormal*dot(relative,worldNormal);
   impulse-=tangent*min(.5,${grainFriction}*support/max(length(tangent),.00001));
  }
 }}
 // One symmetric relaxation factor keeps each pair's impulses equal and opposite.
 // A per-grain neighbor-count divisor would create momentum in an uneven pile.
 let relax=.25;shift*=relax;
 // Reconstruct velocity from the position correction in inertial world space.
 // A uniform moving pile keeps its momentum; compression supplies its own support.
 let velocity=p.zw+turn(shift*rigid.pose.w/cfg.h,rigid.pose.z)+impulse*relax;
 dest[i]=wall(vec4f(p.xy+shift,velocity),i);
}
`;}

function finishSource(){return `
struct View {size:vec4f,low:vec4f,high:vec4f,glassLow:vec4f,glassHigh:vec4f};
struct Rigid {pose:vec4f,velocity:vec4f,previous:vec4f,reaction:vec4f};
@group(0) @binding(0) var<storage,read> pos:array<vec4f>;
@group(0) @binding(1) var<storage,read> flag:array<u32>;
@group(0) @binding(2) var<uniform> view:View;
@group(0) @binding(3) var<storage,read> body:Rigid;
struct Out {@builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) tint:f32};
fn turn(p:vec2f)->vec2f {let c=cos(body.pose.z);let s=sin(body.pose.z);return vec2f(c*p.x-s*p.y,s*p.x+c*p.y);}
fn position(p:vec2f)->vec4f {let point=body.pose.xy+turn((p-vec2f(${G.cx},200))*body.pose.w);return vec4f(point.x/view.size.x*2.-1.,1.-point.y/view.size.y*2.,0.,1.);}
@vertex fn glassVs(@location(0) local:vec2f,@location(1) tint:f32)->Out {
 var o:Out;o.p=position(local);o.uv=vec2f(0.);o.tint=tint;return o;
}
@fragment fn glassFs(o:Out)->@location(0) vec4f {return vec4f(mix(view.glassLow.rgb,view.glassHigh.rgb,o.tint),1.);}
@vertex fn vs(@builtin(vertex_index) vid:u32,@builtin(instance_index) i:u32)->Out {
 var o:Out;o.p=vec4f(2.,2.,0.,1.);o.uv=vec2f(0.);o.tint=0.;
 if((flag[i]&32u)!=0u){return o;}
 let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let c=corners[vid];let offset=c*(${G.radius}*body.pose.w+.5*view.size.z);
 o.p=position(pos[i].xy);o.p+=vec4f(offset.x/view.size.x*2.,-offset.y/view.size.y*2.,0.,0.);o.uv=offset;
 // Stable mineral variation rides the grain identity, never screen pixels.
 var hash=i*747796405u+2891336453u;hash=(hash^(hash>>16u))*2246822519u;hash^=hash>>13u;o.tint=f32(hash&65535u)/65535.;return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 // Pixel coverage conserves the disc's area, even below one device pixel.
 // The half-pixel fringe is antialiasing, never a larger collision footprint.
 let pixel=view.size.z;let radius=${G.radius}*body.pose.w;let support=radius+.5*pixel;
 let inner=max(0.,radius-.5*pixel);
 let coverage=3.*pixel*radius*radius/(support*support*support-inner*inner*inner);
 let alpha=clamp((support-length(o.uv))/pixel,0.,1.)*coverage;
 let uv=clamp(o.uv/radius,vec2f(-1.),vec2f(1.));let r=min(1.,length(uv));
 let light=clamp(.48+.23*o.tint-.18*uv.x-.2*uv.y-.18*r*r,0.,1.);
 let color=mix(view.low.rgb,view.high.rgb,light);
 return vec4f(color*alpha,alpha);
}
`;}
function rgb(hex){return [1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16)/255;});}
function glassMesh(){
 var data=[];
 function vertex(x,y){data.push(x,y,Math.max(0,Math.min(1,.65-.45*(x-G.cx)/G.wide-.12*(y-200)/144)));}
 function quad(a,b,c,d){[a,b,c,c,b,d].forEach(function(p){vertex(p[0],p[1]);});}
 for(var y=G.top;y<G.bottom;y++){
  var a=halfWidth(y),b=halfWidth(y+1);
  quad([G.cx+a,y],[G.cx+a+7,y],[G.cx+b,y+1],[G.cx+b+7,y+1]);
  quad([G.cx-a-7,y],[G.cx-a,y],[G.cx-b-7,y+1],[G.cx-b,y+1]);
 }
 quad([G.cx-G.end-7,G.top-7],[G.cx+G.end+7,G.top-7],[G.cx-G.end-7,G.top],[G.cx+G.end+7,G.top]);
 quad([G.cx-G.end-7,G.bottom],[G.cx+G.end+7,G.bottom],[G.cx-G.end-7,G.bottom+7],[G.cx+G.end+7,G.bottom+7]);
 return new Float32Array(data);
}
async function create(context){
 var L=context.liquid,device=L.device,queue=L.queue,slip=L.materialSlip;
 var canvas=document.createElement('canvas');canvas.id='toy-hourglass-grains';canvas.setAttribute('aria-hidden','true');
 canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;';
 var renderContext=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();
 var buffers=[],retired=false,previousStats=slip.stats,previousUpdate=L.update,previousDraw=L.draw,previousTiming=L.getTimingState,previousAwake=L.awakeCount,previousVisibility=L.renderCanvas.style.visibility;
 function buffer(label,size,usage){var b=device.createBuffer({label:label,size:size,usage:usage});buffers.push(b);return b;}
 var uniform=GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,storage=GPUBufferUsage.STORAGE;
 var count=buffer('hourglass.step',48,uniform),view=buffer('hourglass.finishView',80,uniform);
 var cell=G.radius*2,cols=Math.ceil((G.wide*2+4)/cell),rows=Math.ceil((G.bottom-G.top+4)/cell);
 var heads=buffer('hourglass.cellHeads',cols*rows*4,storage),links=buffer('hourglass.nextGrain',L.maxParticles*4,storage);
 var next=buffer('hourglass.contactSnapshot',L.maxParticles*16,storage|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 var body=buffer('hourglass.rigidBody',64,storage|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 var reaction=buffer('hourglass.grainReactions',L.maxParticles*16,storage);
 var partials=buffer('hourglass.reducedReactions',Math.ceil(L.maxParticles/256)*16,storage);
 var census=buffer('hourglass.bulbInventory',16,storage|GPUBufferUsage.COPY_SRC);
 var read=buffer('hourglass.bodyMirror',80,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
 var mesh=glassMesh(),glass=buffer('hourglass.glassMesh',mesh.byteLength,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);queue.writeBuffer(glass,0,mesh);
 var bodyMirror=new Float32Array([360,384-(G.bottom+7-200)*BODY.scale,0,BODY.scale,0,0,0,0,360,384-(G.bottom+7-200)*BODY.scale,0,BODY.scale,0,0,0,0]);queue.writeBuffer(body,0,bodyMirror);
 var held=false,hand={x:360,y:200,localX:360,localY:200},mirrorPending=false;
 var state=[L.buf.pos,next],pipes={},groups={};
 device.pushErrorScope('validation');var scopeOpen=true;
 try{
  var contactModule=device.createShaderModule({label:'hourglass.exactGrains',code:solverSource(cols,rows,cell,BODY.sandMass/L.uploadedCount)});
  var finishModule=device.createShaderModule({label:'hourglass.residentGrains',code:finishSource()});
  var info=await Promise.all([contactModule.getCompilationInfo(),finishModule.getCompilationInfo()]);
  var faults=info.flatMap(function(result){return result.messages.filter(function(message){return message.type==='error';}).map(function(message){return message.lineNum+': '+message.message;});});
  if(faults.length)throw Error(faults.join('\n'));
  var bindings={bodyStep:[4,5],predict:[0,1,4,5,6],clear:[0,2,4],scatter:[0,2,3,4],contacts:[0,1,2,3,4,5,6],reduceReaction:[4,6,7],applyReaction:[4,5,7],countBulbs:[0,4,7],sumBulbs:[4,7,8]};
  await Promise.all(Object.keys(bindings).map(async function(name){
   var pipeline=await device.createComputePipelineAsync({label:'hourglass.'+name,layout:'auto',compute:{module:contactModule,entryPoint:name}});pipes[name]=pipeline;
   groups[name]=[0,1].map(function(side){var resources=[state[side],state[1-side],heads,links,count,body,reaction,partials,census];return device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});});
  }));
  var finish=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:finishModule,entryPoint:'vs'},fragment:{module:finishModule,entryPoint:'fs',targets:[{format:format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}});
  var finishGroup=device.createBindGroup({layout:finish.getBindGroupLayout(0),entries:[L.buf.pos,L.buf.flag,view,body].map(function(b,i){return {binding:i,resource:{buffer:b}};})});
  var glassFinish=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:finishModule,entryPoint:'glassVs',buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32'}]}]},fragment:{module:finishModule,entryPoint:'glassFs',targets:[{format:format}]},primitive:{topology:'triangle-list'}});
  var glassGroup=device.createBindGroup({layout:glassFinish.getBindGroupLayout(0),entries:[{binding:2,resource:{buffer:view}},{binding:3,resource:{buffer:body}}]});
  var error=await device.popErrorScope();scopeOpen=false;if(error)throw Error(error.message);
 }catch(e){if(scopeOpen)try{await device.popErrorScope();}catch(_){}buffers.forEach(function(b){b.destroy();});throw e;}
 var stage=document.getElementById('toy-stage');stage.appendChild(canvas);
 renderContext.configure({device:device,format:format,alphaMode:'premultiplied'});
 L.renderCanvas.style.visibility='hidden';L.awakeCount=L.uploadedCount;
 var palette=getComputedStyle(document.documentElement),gold=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--accent').trim()),cream=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--text').trim());
 var finishParams=new Float32Array(20);finishParams.set([720,400,720/Math.max(1,canvas.width),0]);
 finishParams.set(gold.map(function(v){return v*.56;}).concat([1]),4);finishParams.set(cream.concat([1]),8);
 finishParams.set(rgb(palette.getPropertyValue('--rule-strong').trim()).concat([1]),12);
 finishParams.set(rgb(palette.getPropertyValue('--line-mid').trim()).concat([1]),16);queue.writeBuffer(view,0,finishParams);
 var input=document.getElementById('toy-input'),previousCursor=input.style.cursor,previousLabel=input.getAttribute('aria-label');
 input.style.cursor='grab';input.setAttribute('aria-label','Hourglass. Grab the glass, swing it, and release to toss. Use the arrow keys and Enter to grab and release.');
 var timer=createTimer(L.simulationClock,L.uploadedCount),lastCensus=-Infinity;
 var timerPanel=document.createElement('section');timerPanel.id='toy-hourglass-timer';timerPanel.className='toy-hourglass-timer';timerPanel.setAttribute('aria-label','Hourglass timer');
 timerPanel.innerHTML='<div class="hourglass-timer-label">Elapsed<span class="hourglass-timer-paused">Paused</span></div><div class="hourglass-timer-value" role="timer" aria-label="Elapsed simulation time" aria-live="off">0:00.0</div><div class="hourglass-timer-detail">Measuring flow</div><div class="hourglass-timer-track" role="progressbar" aria-label="Sand through the neck" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="hourglass-timer-note">Flip to start a new run</div>';
 document.getElementById('toy-viewport').appendChild(timerPanel);
 var timerValue=timerPanel.querySelector('.hourglass-timer-value'),timerDetail=timerPanel.querySelector('.hourglass-timer-detail'),timerTrack=timerPanel.querySelector('.hourglass-timer-track'),timerFill=timerTrack.firstElementChild;
 function drawTimer(){
  var t=timer.stats(L.simulationClock),value=timeText(t.elapsed,true);
  var detail=t.status==='complete'?'Complete':t.status==='turning'?'Turning':t.status==='stalled'?'Flow stopped':t.remainingSeconds===null?'Measuring flow':'About '+timeText(Math.ceil(t.remainingSeconds),false)+' remaining';
  if(timerValue.textContent!==value)timerValue.textContent=value;
  if(timerDetail.textContent!==detail)timerDetail.textContent=detail;
  timerPanel.dataset.status=t.status;timerTrack.setAttribute('aria-valuenow',String(Math.floor(t.fraction*100)));timerFill.style.transform='scaleX('+t.fraction+')';
 }
 // A fixed small quantum preserves the common clock. Three contact iterations
 // ping-pong immutable snapshots, rebuilding exact neighbor lists each time.
 // The final result always lives in the native resident buffer, including jolt.
 var h=1/(720*G.scale),accumulator=0,stepBytes=new ArrayBuffer(48),stepU=new Uint32Array(stepBytes),stepF=new Float32Array(stepBytes);
 var completedSteps=0;
 function dispatch(pass,name,side,work){pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name][side]);pass.dispatchWorkgroups(Math.ceil(work/256));}
 L.update=function(dt){
  if(retired||!L.simActive||!Number.isFinite(dt)||dt<=0)return;
  accumulator+=Math.min(dt,.05)*L.getSimParam('TIMESCALE');
  var steps=Math.floor((accumulator+1e-10)/h);if(!steps)return;
  accumulator-=steps*h;stepU[0]=L.uploadedCount;stepF[1]=h;stepF[2]=L.getSimParam('GRAVITY');stepF[3]=held?1:0;
  stepF.set([hand.x,hand.y,hand.localX,hand.localY],4);stepF.set([16,16,704,384],8);queue.writeBuffer(count,0,stepBytes);
  var encoder=device.createCommandEncoder({label:'hourglass.fineGrains'}),pass=encoder.beginComputePass();
  for(var step=0;step<steps;step++){
   dispatch(pass,'bodyStep',0,1);
   dispatch(pass,'predict',0,L.uploadedCount);var side=1;
   for(var iteration=0;iteration<3;iteration++){
    dispatch(pass,'scatter',side,L.uploadedCount);dispatch(pass,'contacts',side,L.uploadedCount);
    // Clear exactly the cells just read. Empty glass costs no clearing work.
    dispatch(pass,'clear',side,L.uploadedCount);side=1-side;
   }
   dispatch(pass,'reduceReaction',0,L.uploadedCount);dispatch(pass,'applyReaction',0,1);
  }
  var sampleClock=L.simulationClock+steps*h,mirror=!mirrorPending,measure=mirror && sampleClock-lastCensus>=.1;
  // Reuse the reaction scratch space after its final reduction. Only four
  // inventory totals join the body readback, at most ten times per sim second.
  if(measure){dispatch(pass,'countBulbs',0,L.uploadedCount);dispatch(pass,'sumBulbs',0,1);lastCensus=sampleClock;}
  pass.end();if(mirror){mirrorPending=true;encoder.copyBufferToBuffer(body,0,read,0,64);if(measure)encoder.copyBufferToBuffer(census,0,read,64,16);}
  queue.submit([encoder.finish()]);L.stepDt=h;L.simulationClock+=steps*h;completedSteps+=steps;
  if(mirror)read.mapAsync(GPUMapMode.READ).then(function(){if(!retired){var data=new Float32Array(read.getMappedRange());bodyMirror.set(data.subarray(0,16));if(measure){timer.sample(sampleClock,data[16],data[17],data[18],data[2],data[6]);drawTimer();}}read.unmap();}).catch(function(){}).finally(function(){mirrorPending=false;});
 };
 // Keep the established viewport sizing without drawing an invisible water
 // surface, running its grid, or copying the entire pile back to the CPU.
 L.getTimingState=function(){return {fixedStep:true,accumulator:accumulator,substepDt:h,timeScale:L.getSimParam('TIMESCALE'),gravity:L.getSimParam('GRAVITY'),moduleSharedAccumulator:false};};
 L.draw=function(){var v=L.liquid.getView(),source=L.renderCanvas;if(source.width!==v.canvasW)source.width=v.canvasW;if(source.height!==v.canvasH)source.height=v.canvasH;return L.uploadedCount;};
 slip.stats=function(){return Object.assign({},previousStats.call(slip),{commonGravity:L.getSimParam('GRAVITY'),referenceArea:Math.PI*Math.pow(G.radius*BODY.scale,2),grainDiameter:G.radius*2,method:'Finite dry grains and a dynamic rigid glass body. Equal and opposite wall impulses, friction, gravity and a finite-force point grip.'});};
 function bodyStats(){return {x:bodyMirror[0],y:bodyMirror[1],angle:bodyMirror[2],scale:bodyMirror[3],vx:bodyMirror[4],vy:bodyMirror[5],angularVelocity:bodyMirror[6],mass:BODY.mass,sandMass:BODY.sandMass,inertia:bodyInertia(),held:held,anchor:{x:hand.localX,y:hand.localY},hand:{x:hand.x,y:hand.y},reaction:{x:bodyMirror[12],y:bodyMirror[13],torque:bodyMirror[14]}};}
 function pick(x,y){
  var dx=(x-bodyMirror[0])/BODY.scale,dy=(y-bodyMirror[1])/BODY.scale,a=-bodyMirror[2];
  var localX=G.cx+dx*Math.cos(a)-dy*Math.sin(a),localY=200+dx*Math.sin(a)+dy*Math.cos(a);
  if(localY<G.top-7 || localY>G.bottom+7 || Math.abs(localX-G.cx)>halfWidth(Math.max(G.top,Math.min(G.bottom,localY)))+7)return null;
  return {x:localX,y:localY};
 }
 return {
  rigidBuffer:body,
  captureBody:async function(){var copy=device.createBuffer({size:64,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{var e=device.createCommandEncoder();e.copyBufferToBuffer(body,0,copy,0,64);queue.submit([e.finish()]);await copy.mapAsync(GPUMapMode.READ);bodyMirror.set(new Float32Array(copy.getMappedRange()));return bodyStats();}finally{copy.destroy();}},
  grab:function(x,y){var local=pick(x,y);if(retired || !local)return false;hand={x:x,y:y,localX:local.x,localY:local.y};held=true;input.style.cursor='grabbing';return true;},
  move:function(x,y){if(held && Number.isFinite(x) && Number.isFinite(y)){hand.x=x;hand.y=y;}},
  release:function(){held=false;input.style.cursor='grab';},
  render:function(){
   if(retired || !L.renderActive)return;
   drawTimer();
   // Match the source display resolution, including zoom and device density.
   var source=L.renderCanvas;if(canvas.width!==source.width || canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height;finishParams[2]=720/canvas.width;queue.writeBuffer(view,0,finishParams);}
   var encoder=device.createCommandEncoder({label:'hourglass.finish'}),pass=encoder.beginRenderPass({colorAttachments:[{view:renderContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
   pass.setPipeline(glassFinish);pass.setBindGroup(0,glassGroup);pass.setVertexBuffer(0,glass);pass.draw(mesh.length/3);
   pass.setPipeline(finish);pass.setBindGroup(0,finishGroup);pass.draw(6,L.uploadedCount);pass.end();queue.submit([encoder.finish()]);
  },
  draw:function(c){
   c.save();
   c.strokeStyle=palette.getPropertyValue('--rule').trim();c.lineWidth=.75;c.beginPath();c.moveTo(16,384);c.lineTo(704,384);c.stroke();
   c.fillStyle=palette.getPropertyValue('--text-dim').trim();c.font='11px "Commit Mono", monospace';c.fillText('Grab the glass. Swing and release to flip.',24,34);
   c.restore();
  },
  stats:function(){return {glassProfile:G,body:bodyStats(),timer:timer.stats(L.simulationClock),finish:'Resident physical grains and glass',finiteCharge:true,grainCount:L.uploadedCount,grainFriction:grainFriction,glassFriction:glassFriction,steps:completedSteps,stepSeconds:h,gridCells:cols*rows,neighborSearch:'Exact linked cells',solverBytes:cols*rows*4+L.maxParticles*36+Math.ceil(L.maxParticles/256)*16+mesh.byteLength+288};},
  destroy:function(){if(retired)return;retired=true;held=false;slip.stats=previousStats;L.update=previousUpdate;L.draw=previousDraw;L.getTimingState=previousTiming;L.awakeCount=previousAwake;L.renderCanvas.style.visibility=previousVisibility;input.style.cursor=previousCursor;if(previousLabel===null)input.removeAttribute('aria-label');else input.setAttribute('aria-label',previousLabel);canvas.remove();timerPanel.remove();renderContext.unconfigure();buffers.forEach(function(b){b.destroy();});}
 };
}
root.WSSHourglass={configure:configure,geometry:function(){return Object.assign({},G);},halfWidth:halfWidth,contains:contains,createTimer:createTimer,create:create};
})(typeof window!=='undefined'?window:globalThis);
