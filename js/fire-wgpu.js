/* Sluice reacting fire. Original WGSL implementation of a bounded MAC flow,
 * conservative species transport, surface exchange and finite fuel reactions.
 * References and scope: docs/game/FIRE_SIMULATION_RESEARCH.md, FIRE_SIMULATION.md.
 * One shared device, persistent buffers, batched submissions, tiny async mirrors.
 */
(function () {
  'use strict';
  var CAP = 48, STEP = 1 / 60;
  var shader = `
struct Gas { a: vec4f, b: vec4f }
struct Body { a: vec4f, b: vec4f, c: vec4f, d: vec4f }
struct Meta { a: vec4f, b: vec4f, c: vec4f, d: vec4f }
struct Params { grid: vec4f, flow: vec4f, view: vec4f, misc: vec4f, bodies: array<Meta,${CAP}> }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage,read> gi: array<Gas>;
@group(0) @binding(2) var<storage,read_write> go: array<Gas>;
@group(0) @binding(3) var<storage,read> vi: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> vo: array<vec4f>;
@group(0) @binding(5) var<storage,read> mask: array<vec2i>;
@group(0) @binding(6) var<storage,read> bi: array<Body>;
@group(0) @binding(7) var<storage,read_write> bo: array<Body>;
@group(0) @binding(8) var<storage,read> surface: array<u32>;
@group(0) @binding(9) var<storage,read> pi: array<f32>;
@group(0) @binding(10) var<storage,read_write> po: array<f32>;
@group(0) @binding(11) var<storage,read_write> divergence: array<f32>;
@group(0) @binding(12) var<storage,read_write> stats: array<vec4f>;
@group(0) @binding(13) var<storage,read> remapInfo: array<vec2i>;
@group(0) @binding(14) var<storage,read> remapNext: array<i32>;
@group(0) @binding(15) var<storage,read> hullEdges: array<vec4f>;
@group(0) @binding(16) var<storage,read> splitParents: array<i32>;
@group(0) @binding(17) var<storage,read> radiance: array<vec4f>;
@group(0) @binding(18) var<storage,read_write> lightOutput: array<vec4f>;
@compute @workgroup_size(1) fn splitBody(@builtin(global_invocation_id) id:vec3u){
 let b=id.x;if(b>=${CAP}u){return;}let parent=splitParents[b];
 bo[b]=bi[select(i32(b),parent,parent>=0)];
}
fn dims() -> vec2i { return vec2i(p.grid.xy); }
fn at(q:vec2i) -> u32 { let c=clamp(q,vec2i(0),dims()-1); return u32(c.y*dims().x+c.x); }
fn inside(q:vec2i)->bool { return all(q>=vec2i(0)) && all(q<dims()); }
fn wall(q:vec2i)->bool { if(!inside(q)){return p.flow.w<=0.;} return mask[at(q)].x != -1; }
fn vessel(q:vec2i)->bool { return inside(q) && mask[at(q)].x == -2; }
fn ambient()->Gas { return Gas(vec4f(0.,0.275,0.905,0.),vec4f(0.)); }
fn mass(g:Gas)->f32 { return dot(g.a,vec4f(1.))+g.b.y; }
fn temp(g:Gas)->f32 { return 300.+g.b.x/max(0.05,mass(g)); }
fn gas(q:vec2i)->Gas { if(!inside(q)){return ambient();} return gi[at(q)]; }
fn add(a:Gas,b:Gas)->Gas { return Gas(a.a+b.a,a.b+b.b); }
fn velocity(q:vec2i)->vec2f { return vi[at(q)].xy; }
// The top outlet and left secondary inlet have explicit extra face slots.
// x/y velocity lives on the right/bottom cell face. Both adjacent cells use
// this exact face value, so a transport flux has one donor and one recipient.
fn face(q:vec2i,axis:i32)->f32 {
 let n=q+select(vec2i(0,1),vec2i(1,0),axis==0);
 if(wall(q)||wall(n)){return 0.;}
 if(q.y == -1 && axis==1){return vi[u32(p.grid.x*p.grid.y+f32(q.x))].y;}
 if(q.x == -1 && axis==0){return vi[u32(p.grid.x*p.grid.y+p.grid.x+f32(q.y))].x;}
 return velocity(q)[axis];
}
fn sampleV(q:vec2f)->vec2f {
 let c=vec2i(floor(q));let f=fract(q);
 return mix(mix(velocity(c),velocity(c+vec2i(1,0)),f.x),mix(velocity(c+vec2i(0,1)),velocity(c+vec2i(1,1)),f.x),f.y);
}
@compute @workgroup_size(8,8) fn init(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let i=at(vec2i(id.xy));go[i]=ambient();vo[i]=vec4f(0.);po[i]=0.;if(id.y==0u){vo[u32(p.grid.x*p.grid.y)+id.x]=vec4f(0.);}
 if(id.x==0u){vo[u32(p.grid.x*p.grid.y+p.grid.x)+id.y]=vec4f(0.);}
}
// Gather displaced gas into its nearest remaining fluid cell. Newly uncovered
// cells begin empty and fill through fluxes; moving fuel cannot manufacture air.
@compute @workgroup_size(8,8) fn remap(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let i=at(vec2i(id.xy));
 var g=Gas(vec4f(0.),vec4f(0.));
 if(mask[i].x == -1){
  if(remapInfo[i].y!=0){g=gi[i];}
  var source=remapInfo[i].x;
  loop{if(source==0){break;}let j=u32(source-1);g=add(g,gi[j]);source=remapNext[j];}
 }go[i]=g;
}
@compute @workgroup_size(8,8) fn advectVelocity(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);
 if(q.y==0){let top=u32(p.grid.x*p.grid.y)+id.x;vo[top]=vec4f(0.,select(vi[top].y,0.,wall(q)),0.,0.);}
 if(q.x==0){let left=u32(p.grid.x*p.grid.y+p.grid.x)+id.y;vo[left]=vec4f(select((0.10+p.flow.z*0.04)*p.flow.w,0.,wall(q)),0.,0.,0.);}
 if(wall(q)){vo[i]=vec4f(0.);return;}
 let back=vec2f(q)-velocity(q)*p.grid.z/p.flow.x;
 var v=sampleV(back)*exp(-p.grid.z*0.12);
 let T=temp(gi[i]);
 v.y-=p.grid.z*1.5*clamp((T-300.)/900.,0.,2.);
 // Curl confinement restores resolved rolling motion lost to velocity advection.
 let curl=(velocity(q+vec2i(1,0)).y-velocity(q-vec2i(1,0)).y-velocity(q+vec2i(0,1)).x+velocity(q-vec2i(0,1)).x)*0.5;
 let n=vec2f(abs(vi[at(q+vec2i(1,0))].z)-abs(vi[at(q-vec2i(1,0))].z),abs(vi[at(q+vec2i(0,1))].z)-abs(vi[at(q-vec2i(0,1))].z));
 v+=vec2f(n.y,-n.x)/max(length(n),0.00001)*curl*0.8;
 // A fixed physical speed bound makes eight conservative transport substeps
 // positive at every quality tier (including their explicit diffusion flux).
 let cap=min(0.40,p.flow.x/(p.grid.z/8.)*0.20);
 v=clamp(v,vec2f(-cap),vec2f(cap));
 if(q.y==dims().y-1){v=vec2f(0.,-min(cap*0.95,(0.18+p.flow.z*0.14)*(1.-p.misc.x*0.8))*p.flow.w);}

 if(q.x==dims().x-1){v.x=-(0.10+p.flow.z*0.04)*p.flow.w;}
 if(wall(q+vec2i(1,0))){v.x=0.;}if(wall(q+vec2i(0,1))){v.y=0.;}
 vo[i]=vec4f(v,curl,vi[i].w);
}
// Density relaxation requests outward flow when injection or a moving solid
// compresses a cell. Species still move only through conservative face fluxes.
@compute @workgroup_size(8,8) fn diverge(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);
 divergence[i]=select((face(q,0)-face(q-vec2i(1,0),0)+face(q,1)-face(q-vec2i(0,1),1))/p.flow.x-vi[i].w-clamp((mass(gi[i])/1.18-1.)*6.,-3.,3.),0.,wall(q));
}
fn pressure(q:vec2i,center:f32)->f32 { if(!inside(q)){return select(0.,center,q.y>=dims().y || q.x<0 || q.x>=dims().x || p.flow.w<=0.);}if(wall(q)){return center;}return pi[at(q)]; }
@compute @workgroup_size(8,8) fn pressureStep(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);
 if(wall(q)){po[i]=0.;return;}let c=pi[i];
 po[i]=(pressure(q+vec2i(1,0),c)+pressure(q-vec2i(1,0),c)+pressure(q+vec2i(0,1),c)+pressure(q-vec2i(0,1),c)-divergence[i]*p.flow.x*p.flow.x)*0.25;
}
@compute @workgroup_size(8,8) fn project(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);
 var v=vi[i].xy-vec2f(pressure(q+vec2i(1,0),pi[i])-pi[i],pressure(q+vec2i(0,1),pi[i])-pi[i])/p.flow.x;
 let cap=min(0.40,p.flow.x/(p.grid.z/8.)*0.20);v=clamp(v,vec2f(-cap),vec2f(cap));
 if(q.y==dims().y-1){v=vec2f(0.,-min(cap*0.95,(0.18+p.flow.z*0.14)*(1.-p.misc.x*0.8))*p.flow.w);}
 if(q.x==dims().x-1){v.x=-(0.10+p.flow.z*0.04)*p.flow.w;}
 if(wall(q)||wall(q+vec2i(1,0))){v.x=0.;}if(wall(q)||wall(q+vec2i(0,1))){v.y=0.;}
 vo[i]=vec4f(v,vi[i].z,0.);
 if(q.x==0){let left=u32(p.grid.x*p.grid.y+p.grid.x)+id.y;vo[left]=vi[left];}
 if(q.y==0){let top=u32(p.grid.x*p.grid.y)+id.x;vo[top]=vec4f(0.,select(clamp(vi[top].y-pi[i]/p.flow.x,-cap,cap),0.,wall(q)||p.flow.w<=0.),0.,0.);}
}
fn flux(q:vec2i,n:vec2i,v:f32)->Gas {
 if(wall(q)||wall(n)){return Gas(vec4f(0.),vec4f(0.));}
 // First-order finite-volume transport plus bounded molecular mixing. The
 // flame is a reaction to transported species, not a decaying painted color.
 let a=gas(q);let b=gas(n);let up=select(b.a,a.a,v>=0.);let ub=select(b.b,a.b,v>=0.);
 return Gas(v*up+(a.a-b.a)*0.006,v*ub+(a.b-b.b)*0.006);
}
@compute @workgroup_size(8,8) fn transport(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);
 if(wall(q)){go[i]=ambient();return;}
 let r=flux(q,q+vec2i(1,0),face(q,0));let l=flux(q-vec2i(1,0),q,face(q-vec2i(1,0),0));
 let d=flux(q,q+vec2i(0,1),face(q,1));let u=flux(q-vec2i(0,1),q,face(q-vec2i(0,1),1));
 let rate=p.grid.z*0.125/p.flow.x;let old=gi[i];
 go[i]=Gas(max(vec4f(0.),old.a+(l.a+u.a-r.a-d.a)*rate),max(vec4f(0.),old.b+(l.b+u.b-r.b-d.b)*rate));
}
// Surface amounts are kg and kJ per step. Both the gas and the solid gather
// call the same function against the same immutable input. No atomic fuel
// counters, competing reservoirs, or CPU estimates of oxygen are involved.
struct Exchange { gas:f32, carbon:f32, water:f32, heat:f32 }
fn exchange(i:u32,b:u32)->Exchange {
 let m=p.bodies[b];let s=bi[b];let count=max(1.,m.a.y);let kg=m.a.z;let dt=p.grid.z;
 let skin=max(300.,s.a.w);let core=max(300.,s.b.x);let g=gi[i];let T=temp(g);
 let wood=m.b.w;let pyro=smoothstep(mix(540.,450.,wood),mix(1050.,850.,wood),skin);
 var dry=min(s.a.z*kg/count,dt*kg*0.12*max(0.,(skin-373.)/600.)/count);
 var fuel=min(s.a.x*kg/count,dt*kg/m.a.w*mix(1.75,2.4,wood)*pyro*(1.-min(0.85,s.a.z*8.))/count);
 let capacity=kg*(0.16*0.8+s.a.z*4.18);
 let budget=max(0.,skin-300.)*capacity/count*0.3;
 let fraction=min(1.,budget/max(0.0000001,dry*(2260.+1.8*(skin-300.))+fuel*(280.+skin-300.)));
 dry*=fraction;fuel*=fraction;
 let demand=min(s.a.y*kg/count,dt*kg/m.a.w*smoothstep(580.,1020.,core)*(1.-s.b.y*0.35)/count);
 let carbon=min(demand,max(0.,g.a.y)*p.flow.y/2.667*(1.-exp(-dt*18.)));
 let raw=(skin-T)*0.0018*p.grid.z/count;
 let heat=clamp(raw,-g.b.x*p.flow.y*0.3,max(0.,skin-300.)*capacity/count*0.15);
 return Exchange(fuel,carbon,dry,heat);
}
@compute @workgroup_size(8,8) fn react(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let q=vec2i(id.xy);let i=at(q);var g=gi[i];
 if(q.y==0){let top=u32(p.grid.x*p.grid.y)+id.x;vo[top]=vi[top];}
 if(q.x==0){let left=u32(p.grid.x*p.grid.y+p.grid.x)+id.y;vo[left]=vi[left];}
 if(wall(q)){go[i]=ambient();vo[i]=vec4f(0.);return;}
 let owner=mask[i].y;var expansion=0.;
 if(owner>=0){
  let b=u32(owner);let e=exchange(i,b);let inv=1./p.flow.y;
  g.a.x+=e.gas*0.96*inv;g.a.w+=e.gas*0.04*inv;g.a.y-=e.carbon*2.667*inv;g.a.z+=e.carbon*3.667*inv;g.b.y+=e.water*inv;
  g.b.x+=(e.heat+e.carbon*32000.*0.35+(e.gas+e.water*1.8)*max(0.,bi[b].a.w-300.))*inv;
  // Flint is an explicit finite ignition event in the gas as well as the
  // solid. Merely heating a fuel reservoir is not an ignited flame front.
  if(p.bodies[b].b.x>bi[b].d.w && p.bodies[b].b.y>0.){
   g.b.x+=0.06/max(1.,p.bodies[b].a.y)*inv;
  }
 }
 // A rear air manifold supplies the depth direction missing from this 2D
 // slice. Incoming ambient air displaces an equal fraction of local gas out
 // of the open front. Closing the damper seals this exchange as well.
 let worldY=p.view.z+(f32(q.y)+0.5)*p.view.w/p.grid.y;
 let lower=exp(-pow((worldY-185.)/17.,2.));
 let upper=exp(-pow((worldY-85.)/55.,2.));
 let vent=(1.-exp(-p.grid.z*(lower*2.5+upper*0.65+select(0.,2.,owner>=0))*(1.+p.flow.z)))*p.flow.w;
 g=Gas(mix(g.a,ambient().a,vent),mix(g.b,vec4f(0.),vent));
 let T=temp(g);let ignition=smoothstep(540.,780.,T);
 let fuel=min(g.a.x,g.a.y/3.4)*(1.-exp(-p.grid.z*18.*ignition));
 let rich=clamp(g.a.x*3.4/max(0.001,g.a.y)-1.,0.,1.);
 let soot=fuel*(0.015+0.07*rich);g.a.x-=fuel;g.a.y-=3.4*fuel;g.a.z+=4.4*fuel-soot;g.a.w+=soot;
 let sootBurn=min(g.a.w,g.a.y/2.667)*(1.-exp(-p.grid.z*1.2*smoothstep(780.,1400.,T)));
 g.a.w-=sootBurn;g.a.y-=sootBurn*2.667;g.a.z+=sootBurn*3.667;
 // Soot keeps its chemical energy until it oxidizes.
 let released=fuel*26000.-soot*32000.+sootBurn*32000.;g.b.x+=released;
 g.b.z=mix(g.b.z,fuel/max(0.00001,p.grid.z),0.55);
 let nearWall=vessel(q+vec2i(0,-1))||vessel(q+vec2i(1,0))||vessel(q-vec2i(1,0));
 let loss=g.b.x*(1.-exp(-p.grid.z*(0.55+select(0.,5.,nearWall))));
 g.b.x-=loss;g.b.w=loss*p.flow.y*0.65;
 // Expansion remains in the projection target; limiting it is a documented
 // low-speed approximation, not a compressible explosion solver.
 expansion=min(4.,released/max(40.,mass(g)*1200.)/p.grid.z);
 vo[i]=vec4f(vi[i].xyz,expansion);go[i]=Gas(max(g.a,vec4f(0.)),max(g.b,vec4f(0.)));
}
@compute @workgroup_size(1) fn solid(@builtin(global_invocation_id) id:vec3u){
 let b=id.x;if(b>=${CAP}u){return;}let m=p.bodies[b];var s=bi[b];if(m.a.z<=0.){bo[b]=s;return;}
 let kg=m.a.z;let dt=p.grid.z;var gasMass=0.;var charMass=0.;var water=0.;var Q=0.;var oxygen=0.;
 let count=u32(m.a.y);let start=u32(m.a.x);
 for(var j=0u;j<count;j++){let i=surface[start+j];let e=exchange(i,b);gasMass+=e.gas;charMass+=e.carbon;water+=e.water;Q+=e.heat;oxygen+=clamp(gi[i].a.y/0.275,0.,1.);}
 let command=m.b.x>s.d.w;
 if(command && m.b.y>0.){s.a.w=300.+max((s.a.w-300.)*(0.16*0.8+s.a.z*4.18),(m.b.y-300.)*0.16*0.8)/(0.16*0.8+s.a.z*4.18);s.b.x=max(s.b.x,select(0.,1100.,m.b.y>0.));}
 // A quench carries real water mass into the reservoir and spends sensible
 // heat warming it. Evaporation is charged separately below.
 if(command){let oldCapacity=kg*(0.16*0.8+s.a.z*4.18);s.a.z+=m.b.z/kg;s.a.w=300.+(s.a.w-300.)*oldCapacity/(oldCapacity+m.b.z*4.18);s.d.w=m.b.x;}
 let skinCapacity=kg*(0.16*0.8+s.a.z*4.18);let coreCapacity=kg*0.84*0.8;
 let conduction=clamp((s.a.w-s.b.x)*kg*0.035*dt,-max(0.,s.b.x-300.)*coreCapacity*0.10,max(0.,s.a.w-300.)*skinCapacity*0.10);
 var neighbors=0.;
 if(m.c.w==0.){for(var other=0u;other<${CAP}u;other++){
  let om=p.bodies[other];if(other==b||om.a.z<=0.||om.c.w>0.){continue;}
  let os=bi[other];let gap=max(0.,distance(m.c.xy,om.c.xy)-m.c.z-om.c.z);
  var view=1./(1.+pow(gap/16.,2.));
  // Direct radiation is occluded by intervening fuel bodies.
  let line=om.c.xy-m.c.xy;
  for(var blocker=0u;blocker<${CAP}u;blocker++){
   let bm=p.bodies[blocker];if(blocker==b||blocker==other||bm.a.z<=0.||bm.c.w>0.){continue;}
   let t=dot(bm.c.xy-m.c.xy,line)/max(1.,dot(line,line));
   if(t>0.&&t<1.&&distance(m.c.xy+line*t,bm.c.xy)<bm.c.z*0.75){view=0.;}
  }
  let contactBits=u32(select(m.d.x,m.d.z,other>=24u));
  // Normalize reciprocal view factors so a crowded pile cannot multiply
  // one lump's radiating area by its number of neighbors.
  view/=max(1.,max(m.d.w,om.d.w));
  let touching=(contactBits&(1u<<(other%24u)))!=0u;
  let q=(0.0000000000567*0.0035*view*(pow(os.a.w,4.)-pow(bi[b].a.w,4.))+select(0.,0.00012*(os.a.w-bi[b].a.w),touching))*dt;
  neighbors+=clamp(q,-max(0.,bi[b].a.w-300.)*kg*(0.16*0.8+bi[b].a.z*4.18)/72.,max(0.,os.a.w-300.)*om.a.z*(0.16*0.8+os.a.z*4.18)/72.);
 }}
 let radiation=min(max(0.,s.a.w-300.)*skinCapacity*0.10,0.0000000000567*0.0018*(pow(s.a.w,4.)-pow(300.,4.))*dt);
 let change=charMass*32000.*0.65-Q-water*(2260.+1.8*max(0.,bi[b].a.w-300.))-gasMass*(280.+max(0.,bi[b].a.w-300.))-conduction-radiation+neighbors;
 s.a.w=300.+max(0.,(s.a.w-300.)*skinCapacity+change)/max(kg*0.16*0.8,skinCapacity-water*4.18);s.b.x=max(300.,s.b.x+conduction/coreCapacity);
 s.a=vec4f(max(vec3f(0.),s.a.xyz-vec3f(gasMass,charMass,water)/kg),s.a.w);s.b.y=clamp(s.b.y+charMass/kg*0.9,0.,1.);
 s.b.z=select(radiation/dt*0.65,0.,m.c.w>0.);s.b.w=(gasMass*26000.+charMass*32000.)/dt;
 s.c=vec4f(oxygen/max(1.,f32(count)),gasMass/dt/kg*m.a.w,water/dt/kg*12.,charMass/dt/kg*m.a.w);
 s.d=vec4f(s.d.xyz+vec3f(gasMass,charMass,water),s.d.w);
 bo[b]=s;
}
var<workgroup> sums:array<vec4f,64>;
@compute @workgroup_size(64) fn reduce(@builtin(global_invocation_id) id:vec3u,@builtin(local_invocation_id) lid:vec3u,@builtin(workgroup_id) wid:vec3u){
 var value=vec4f(0.);let n=u32(p.grid.x*p.grid.y);
 for(var i=id.x;i<n;i+=4096u){let g=gi[i];if(mask[i].x == -1){value+=vec4f(g.b.w,g.b.z*p.flow.y,g.a.x*p.flow.y,g.a.w*p.flow.y);}}
 sums[lid.x]=value;workgroupBarrier();
 for(var stride=32u;stride>0u;stride/=2u){if(lid.x<stride){sums[lid.x]+=sums[lid.x+stride];}workgroupBarrier();}
 if(lid.x==0u){stats[wid.x]=sums[0];}
}
struct Vertex { @builtin(position) pos:vec4f, @location(0) uv:vec2f }
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex {
 let q=vec2f(f32((i<<1u)&2u),f32(i&2u));return Vertex(vec4f(q*2.-1.,0.,1.),vec2f(q.x,1.-q.y));
}
fn sampleLight(uv:vec2f)->vec4f {
 let q=uv*p.grid.xy-0.5;let c=vec2i(floor(q));let f=fract(q);
 return mix(mix(radiance[at(c)],radiance[at(c+vec2i(1,0))],f.x),mix(radiance[at(c+vec2i(0,1))],radiance[at(c+vec2i(1,1))],f.x),f.y);
}
// Reconstruct emitted light, not averaged temperature. Thermal emission is
// nonlinear: mixing hot and cold gas before evaluating it erases thin flames.
// Positive cubic B-spline weights reconstruct a continuous display field.
// Normalize over fluid samples so empty solid cells cannot darken hot surfaces.
// This is presentation only: the conservative solver retains its own fields.
fn cubicWeights(t:f32)->vec4f {
 let t2=t*t;let t3=t2*t;let u=1.-t;
 return vec4f(u*u*u,3.*t3-6.*t2+4.,-3.*t3+3.*t2+3.*t+1.,t3)/6.;
}
fn smoothLight(uv:vec2f)->vec4f {
 let q=uv*p.grid.xy-0.5;let c=vec2i(floor(q));let f=fract(q);
 let wx=cubicWeights(f.x);let wy=cubicWeights(f.y);
 var value=vec4f(0.);var total=0.;
 for(var y=0;y<4;y++){for(var x=0;x<4;x++){
  let i=at(c+vec2i(x-1,y-1));let weight=wx[x]*wy[y]*select(0.,1.,mask[i].x == -1);
  value+=radiance[i]*weight;total+=weight;
 }}
 return value/max(total,0.00001);
}
// Four nearby grid cells nominate polygons; their actual edge planes, rather
// than the stair-stepped simulation mask, clip the light at display resolution.
fn fuelCoverage(uv:vec2f,aa:f32)->f32 {
 let c=vec2i(floor(uv*p.grid.xy-0.5));let point=uv*vec2f(320.,p.view.w)+vec2f(0.,p.view.z);
 var coverage=1.;var visited=vec2u(0u);
 for(var k=0;k<4;k++){
  let body=mask[at(c+vec2i(k%2,k/2))].x;
  if(body<0){continue;}let lane=u32(body)/24u;let bit=1u<<(u32(body)%24u);if((visited[lane]&bit)!=0u){continue;}visited[lane]|=bit;
  let count=i32(p.bodies[body].d.y);var distance=-10000.;
  for(var edge=0;edge<count;edge++){
   let plane=hullEdges[body*16+edge];distance=max(distance,dot(plane.xy,point)-plane.z);
  }
  coverage*=smoothstep(-aa,aa,distance);
 }
 return coverage;
}
fn light(g:Gas)->vec3f {
 // Display calibration lifts the dim red end for the illustrated chamber.
 // It never changes the Kelvin fields, ignition, heat transfer or fuel use.
 let T=clamp(300.+(temp(g)-300.)*1.25,300.,2600.);
 let black=vec3f(1.,1.91,4.24)/(exp(vec3f(22135.,26159.,31973.)/T)-1.)*24000000.;
 let incandescence=black*(1.-exp(-g.a.w*180.));
 let reaction=vec3f(0.025,0.065,0.16)*g.b.z*smoothstep(700.,1100.,T)*2.;
 return incandescence+reaction;
}
// Evaluate the spectrum once per solver cell rather than per display sample.
@compute @workgroup_size(8,8) fn emission(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=vec2u(p.grid.xy))){return;}let i=at(vec2i(id.xy));
 if(mask[i].x != -1){lightOutput[i]=vec4f(0.);return;}
 let g=gi[i];let vapor=g.b.y*(1.-smoothstep(330.,410.,temp(g)));
 lightOutput[i]=vec4f(light(g),1.-exp(-g.a.w*10.-g.a.x*0.15-vapor*0.3));
}
@fragment fn fragment(v:Vertex)->@location(0) vec4f {
 let point=v.uv*vec2f(320.,p.view.w)+vec2f(0.,p.view.z);let aa=max(length(dpdx(point)),length(dpdy(point)))*0.7;
 let cell=at(vec2i(v.uv*p.grid.xy));let mode=i32(p.view.x);
 if(mode>0){
  if(mask[cell].x != -1){return vec4f(0.);}let g=gi[cell];let T=temp(g);
  var c=vec3f(0.);if(mode==1){c=vec3f(1.,0.3,0.04)*clamp((T-300.)/1600.,0.,1.);}
  if(mode==2){c=vec3f(0.15,0.55,1.)*clamp(g.a.y/0.275,0.,1.);}
  if(mode==3){c=vec3f(0.15,1.,0.35)*(1.-exp(-g.a.x*3.));}
  if(mode==4){c=vec3f(0.5+vi[cell].x*2.,0.5-vi[cell].y*2.,abs(vi[cell].z)*12.);}
  if(mode==5){c=vec3f(1.,0.4,0.1)*(1.-exp(-g.b.z*2.));}return vec4f(c,0.96);
 }
 if(mask[cell].x == -2){return vec4f(0.);}
 let coverage=fuelCoverage(v.uv,aa);if(coverage<=0.){return vec4f(0.);}
 let l=smoothLight(v.uv);
 let center=l.rgb;var halo=vec3f(0.);
 for(var k=0;k<4;k++){let offset=select(select(vec2f(0.,-1.),vec2f(0.,1.),k==2),select(vec2f(-1.,0.),vec2f(1.,0.),k==0),k<2);
  halo+=sampleLight(v.uv+offset*vec2f(5.)/p.grid.xy).rgb;}
 let emitted=center+halo*0.08;
 let smoke=l.a;
 let color=vec3f(1.)-exp(-emitted*3.8);
 let alpha=clamp(max(max(color.r,color.g),color.b)+smoke*0.7,0.,0.98);
 return vec4f(color+vec3f(0.15,0.145,0.12)*smoke*(1.-color.r),alpha)*coverage;
}
`;

  function create(options) {
    options = options || {};
    var device = options.device, w = options.width || 192, top = -(options.headroom || 0), height = 210-top;
    var h = Math.round(w * height / 320), n = w * h;
    var sim = { available: false, failed: false, width: w, height: h, bufferBytes: n*148+(w+h)*32+64+CAP*516+2048, steps: 0, submissions: 0,
      mirrored: 0, cpuMs: 0, debug: 0, errors: [], outputKW: 0, gasKg: 0, sootKg: 0, gasBurnKgPerSecond: 0 };
    var buffers = [], pipelines = {}, groups = {}, gasIndex = 0, velIndex = 0, bank = 0, time = 0;
    var slots = new Array(CAP).fill(null), masks = new Int32Array(n * 2), lists = new Uint32Array(n), uniform = new Float32Array(16+CAP*16);
    var rbPending = false, revision = 0, resetGeneration = 0, signature = '', contacts = new Uint32Array(CAP*2), geometryFresh = true;
    var radiationViews = new Float32Array(CAP);
    var previousMasks = new Int32Array(n*2), owners = new Int32Array(n), frontier = new Int32Array(n);
    var remapData = new Int32Array(n*2), remapLinks = new Int32Array(n);
    var edgeData = new Float32Array(CAP*16*4);
    var inherited = new Map(), splitData = new Int32Array(CAP).fill(-1);
    var ignition = new Map(), quenches = new Map(), commands = new Map(), commandSerial = 0, lost = false;
    function buffer(size, extra) { var b = device.createBuffer({ size: size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | (extra || 0) }); buffers.push(b); return b; }
    var g = [buffer(n * 32), buffer(n * 32)], v = [buffer((n+w+h) * 16), buffer((n+w+h) * 16)];
    var m = buffer(n * 8), bodies = [buffer(CAP * 64), buffer(CAP * 64)], surfaceBuffer = buffer(n * 4);
    var remapBuffer = buffer(n*8), remapLinkBuffer = buffer(n*4);
    var lightBuffer = buffer(n*16);
    var edgeBuffer = buffer(edgeData.byteLength), splitBuffer = buffer(CAP*4);
    var pressures = [buffer(n * 4), buffer(n * 4)], div = buffer(n * 4), statsBuffer = buffer(64 * 16);
    var ub = device.createBuffer({ size: uniform.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); buffers.push(ub);
    var rbSize = CAP * 64 + 64 * 16;
    var rb = device.createBuffer({ size: rbSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); buffers.push(rb);
    var surfaceStart = new Int32Array(CAP), surfaceCount = new Int32Array(CAP);
    var gpuCanvas = document.createElement('canvas'), context = gpuCanvas.getContext('webgpu');
    gpuCanvas.className = 'sluice-fire-layer'; gpuCanvas.setAttribute('aria-hidden', 'true');
    gpuCanvas.style.cssText = 'position:absolute;pointer-events:none;z-index:9;display:none;image-rendering:auto;';
    sim.canvas = gpuCanvas;
    context.configure({ device: device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied' });
    var definitions = {
      splitBody: [6,7,16], init: [0,2,4,10], remap: [0,1,2,5,13,14], advectVelocity: [0,1,3,4,5], diverge: [0,1,3,5,11],
      pressureStep: [0,5,9,10,11], project: [0,3,4,5,9], transport: [0,1,2,3,5],
      react: [0,1,2,3,4,5,6], solid: [0,1,6,7,8], reduce: [0,1,5,12], emission: [0,1,5,18], fragment: [0,1,3,5,15,17]
    };
    function resources(gi, vi, pr) { return [ub,g[gi],g[1-gi],v[vi],v[1-vi],m,bodies[0],bodies[1],surfaceBuffer,pressures[pr],pressures[1-pr],div,statsBuffer,remapBuffer,remapLinkBuffer,edgeBuffer,splitBuffer,lightBuffer,lightBuffer]; }
    function bind(name, gi, vi, pr) {
      var key = name + gi + vi + pr;
      if (!groups[key]) { var res = resources(gi,vi,pr); groups[key] = device.createBindGroup({ layout: pipelines[name].getBindGroupLayout(0), entries: definitions[name].map(function (id) { return { binding: id, resource: { buffer: res[id] } }; }) }); }
      return groups[key];
    }
    function run(enc, name, pr) {
      var pass = enc.beginComputePass(); pass.setPipeline(pipelines[name]); pass.setBindGroup(0,bind(name,gasIndex,velIndex,pr || 0));
      if (name === 'solid' || name === 'splitBody') pass.dispatchWorkgroups(CAP);
      else if (name === 'reduce') pass.dispatchWorkgroups(64);
      else pass.dispatchWorkgroups(Math.ceil(w/8),Math.ceil(h/8));
      pass.end();
    }
    function uploadUniform(air, damper) {
      uniform.set([w,h,STEP,time,0.8/w,(0.8/w)*(height*0.8/320/h)*0.04,air,damper,sim.debug,300,top,height,sim.ashLoad||0,0,0,0]);
      for (var b=0;b<CAP;b++) {
        var body=slots[b], o=16+b*16;
        uniform.set([surfaceStart[b],surfaceCount[b],body ? body.dryKg || 0.018*Math.pow(body.baseR/34,2) : 0,body ? body.life : 100,
          body ? commands.get(body) || 0 : 0,body ? ignition.get(body) || 0 : 0,body ? quenches.get(body) || 0 : 0,body && body.material === 'wood' ? 1 : 0,
          body ? body.x : 0,body ? body.y : 0,body ? body.r : 0,body && body.held ? 1 : 0,0,0,0,0],o);
        uniform[o+12]=contacts[b*2];uniform[o+14]=contacts[b*2+1];uniform[o+15]=radiationViews[b];
        uniform[o+13]=body && !body.held && body.vertices ? Math.min(16,body.vertices.length) : 0;
      }
      device.queue.writeBuffer(ub,0,uniform);
    }
    function geometry(chunks) {
      var old = slots.slice(), used = new Set(chunks); splitData.fill(-1);
      for(var b=0;b<CAP;b++) if(slots[b] && !used.has(slots[b])) { commands.delete(slots[b]);ignition.delete(slots[b]);quenches.delete(slots[b]);slots[b]=null; }
      // Keep one child in each parent slot until the GPU inheritance pass.
      // New fuel must never overwrite a source, even when earlier slots are empty.
      chunks.forEach(function(body){var source=old.indexOf(inherited.get(body));if(source>=0 && !slots[source])slots[source]=body;});
      chunks.forEach(function(body){if(slots.indexOf(body)<0){var b=slots.indexOf(null);if(b>=0)slots[b]=body;}});
      for(var b=0;b<CAP;b++) if(old[b]!==slots[b]) {
        revision++; var body=slots[b], data=new Float32Array(16);
        if(body) data.set([body.volatile||0,body.carbon||0,body.moisture||0,body.surfaceKelvin || 300+(body.heat||0)*1200,
          body.coreKelvin || 300+(body.core||0)*1200,body.coating||0,0,0,1,0,0,0,0,0,0,0]);
        var parent = inherited.get(body), parentSlot = parent ? old.indexOf(parent) : -1;
        if(parentSlot>=0) splitData[b]=parentSlot;
        else if(body || !Array.from(inherited.values()).includes(old[b])) device.queue.writeBuffer(bodies[0],b*64,data);
      }
      device.queue.writeBuffer(splitBuffer,0,splitData);
      var next=slots.map(function(b){return b ? [b.id,b.held,b.x.toFixed(2),b.y.toFixed(2),b.r.toFixed(2),b.angle.toFixed(3)].join(',') : '-';}).join(';');
      if(next===signature)return false;signature=next;previousMasks.set(masks);
      // Convex hull separation, shared by contact conduction and the visible
      // body geometry. Circumcircle overlap alone is not physical contact.
      function separates(a,b) {
        for(var j=0;j<a.length;j++) {
          var c=a[j],d=a[(j+1)%a.length],nx=d[1]-c[1],ny=c[0]-d[0],len=Math.hypot(nx,ny),nearest=Infinity;
          for(var k=0;k<b.length;k++)nearest=Math.min(nearest,(b[k][0]-c[0])*nx+(b[k][1]-c[1])*ny);
          if(nearest/len>2)return true;
        }return false;
      }
      contacts.fill(0);radiationViews.fill(0);
      for(var b=0;b<CAP;b++)for(var other=b+1;other<CAP;other++) {
        var a=slots[b],c=slots[other];if(!a||!c||a.held||c.held||!a.vertices||!c.vertices)continue;
        var gap=Math.max(0,Math.hypot(a.x-c.x,a.y-c.y)-a.r-c.r),view=1/(1+Math.pow(gap/16,2));
        radiationViews[b]+=view;radiationViews[other]+=view;
        if(!separates(a.vertices,c.vertices)&&!separates(c.vertices,a.vertices)){contacts[b*2+Math.floor(other/24)]|=1<<(other%24);contacts[other*2+Math.floor(b/24)]|=1<<(b%24);}
      }
      for(var i=0;i<n;i++){var x=i%w,y=(i/w)|0; masks[i*2]=(((x===0||x===w-1)&&(top+y*height/h<105||top+y*height/h>134.4))||(y===0&&(x<w*0.35||x>w*0.75))||(y===h-1&&(x*320/w)%18<7)) ? -2 : -1; masks[i*2+1]=-1;}
      edgeData.fill(0);
      for(var b=0;b<CAP;b++) {
        var body=slots[b];if(!body||body.held||!body.vertices)continue;var hull=body.vertices;
        for(var j=0;j<Math.min(16,hull.length);j++){
          var a=hull[j],c=hull[(j+1)%hull.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
          var nx=(c[1]-a[1])/len,ny=(a[0]-c[0])/len,o=(b*16+j)*4;
          edgeData.set([nx,ny,nx*a[0]+ny*a[1],0],o);
        }
        var x0=w,x1=0,y0=h,y1=0;
        hull.forEach(function(p){x0=Math.min(x0,Math.floor(p[0]*w/320));x1=Math.max(x1,Math.ceil(p[0]*w/320));y0=Math.min(y0,Math.floor((p[1]-top)*h/height));y1=Math.max(y1,Math.ceil((p[1]-top)*h/height));});
        for(var y=Math.max(0,y0);y<=Math.min(h-1,y1);y++)for(var x=Math.max(0,x0);x<=Math.min(w-1,x1);x++){
          var px=(x+.5)*320/w,py=top+(y+.5)*height/h,inside=true;
          for(var j=0;j<hull.length;j++){var a=hull[j],c=hull[(j+1)%hull.length];if((c[0]-a[0])*(py-a[1])-(c[1]-a[1])*(px-a[0])<0){inside=false;break;}}
          if(inside)masks[(y*w+x)*2]=b;
        }
      }
      device.queue.writeBuffer(edgeBuffer,0,edgeData);
      // A multi-source breadth-first search maps covered cells to their
      // nearest fluid cell in O(grid size), even after a fast drag or teleport.
      // The GPU gathers linked donor lists without floating point atomics.
      var head=0,tail=0;owners.fill(-1);remapData.fill(0);remapLinks.fill(0);
      for(var i=0;i<n;i++)if(masks[i*2]===-1){
        owners[i]=i;frontier[tail++]=i;remapData[i*2+1]=geometryFresh || previousMasks[i*2]===-1 ? 1 : 0;
      }
      if(!geometryFresh){
        while(head<tail){
          var i=frontier[head++],x=i%w;
          var a=x>0?i-1:-1,b=x<w-1?i+1:-1,c=i>=w?i-w:-1,d=i<n-w?i+w:-1;
          if(a>=0&&owners[a]<0){owners[a]=owners[i];frontier[tail++]=a;}
          if(b>=0&&owners[b]<0){owners[b]=owners[i];frontier[tail++]=b;}
          if(c>=0&&owners[c]<0){owners[c]=owners[i];frontier[tail++]=c;}
          if(d>=0&&owners[d]<0){owners[d]=owners[i];frontier[tail++]=d;}
        }
        for(var i=0;i<n;i++)if(previousMasks[i*2]===-1&&masks[i*2]!==-1&&owners[i]>=0){
          var destination=owners[i]*2;remapLinks[i]=remapData[destination];remapData[destination]=i+1;
        }
      }
      geometryFresh=false;
      device.queue.writeBuffer(remapBuffer,0,remapData);device.queue.writeBuffer(remapLinkBuffer,0,remapLinks);
      var per=Array.from({length:CAP},function(){return [];});
      for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){
        var i=y*w+x;if(masks[i*2]!==-1)continue;
        var owner=-1,adj=[i-w,i-1,i+1,i+w];
        for(var j=0;j<4;j++){var b=masks[adj[j]*2];if(b>=0){owner=b;break;}}
        if(owner>=0){masks[i*2+1]=owner;per[owner].push(i);}
      }
      var cursor=0;for(var b=0;b<CAP;b++){surfaceStart[b]=cursor;surfaceCount[b]=per[b].length;lists.set(per[b],cursor);cursor+=per[b].length;}
      device.queue.writeBuffer(m,0,masks);if(cursor)device.queue.writeBuffer(surfaceBuffer,0,lists,0,cursor);
      return true;
    }
    function mirror(enc) {
      if(rbPending)return;rbPending=true;
      var savedSlots=slots.slice(), savedRevision=revision, gen=resetGeneration;
      enc.copyBufferToBuffer(bodies[0],0,rb,0,CAP*64);enc.copyBufferToBuffer(statsBuffer,0,rb,CAP*64,64*16);
      return function(){rb.mapAsync(GPUMapMode.READ).then(function(){
        if(lost)return;var data=new Float32Array(rb.getMappedRange().slice(0));rb.unmap();rbPending=false;
        if(gen!==resetGeneration||savedRevision!==revision)return;
        var heat=0;for(var k=0;k<64;k++)heat+=data[CAP*16+k*4];
        sim.outputKW=heat/STEP;sim.gasKg=0;sim.sootKg=0;sim.gasBurnKgPerSecond=0;
        for(var k=0;k<64;k++){sim.gasBurnKgPerSecond+=data[CAP*16+k*4+1];sim.gasKg+=data[CAP*16+k*4+2];sim.sootKg+=data[CAP*16+k*4+3];}
        for(var b=0;b<CAP;b++){
          var body=savedSlots[b];if(!body||slots[b]!==body)continue;var o=b*16;
          if(data[o+15] < (commands.get(body)||0))continue;
          body.volatile=Math.min(body.material === 'wood' ? 0.76 : 0.28,Math.max(0,data[o]));body.carbon=Math.max(0,data[o+1]);body.fuel=body.volatile+body.carbon;
          if(body.fuel>1){body.carbon=Math.max(0,1-body.volatile);body.fuel=body.volatile+body.carbon;}
          body.moisture=Math.max(0,data[o+2]);
          body.heat=Math.min(1,Math.max(0,(data[o+3]-300)/1200));body.core=Math.min(1,Math.max(0,(data[o+4]-300)/1200));
          body.surfaceKelvin=data[o+3];body.coreKelvin=data[o+4];body.coating=data[o+5];sim.outputKW+=data[o+6];
          body.reaction=Math.min(1.5,data[o+7]/5);body.oxygen=data[o+8];body.flame=Math.min(1,data[o+9]*0.7);
          body.steam=data[o+10];body.smoke=Math.min(1,body.flame*(1-body.oxygen*0.8));
          body.ash=body.fuel<0.00001;if(body.ash){body.volatile=body.carbon=body.fuel=0;body.coating=1;}
          body.lit=!body.ash&&(body.coreKelvin>600||body.surfaceKelvin>700);
          body.stage=body.ash?(body.heat>0.18?'cooling ash':'ash'):body.moisture>0.008&&body.heat>0.15?'drying':!body.lit?(body.heat>0.15?'warming':'cold'):body.oxygen<0.35?'smoldering':body.volatile>0.0001?'flaming':body.fuel>0.12?'coke':'embers';
        }
        sim.mirrored++;
      }).catch(function(e){rbPending=false;if(!lost){sim.errors.push(String(e));sim.failed=true;sim.available=false;}});};
    }
    sim.step=function(dt,chunks,controls){
      if(!sim.available||sim.failed)return false;var start=performance.now();controls=controls||{};
      bank=Math.min(0.10,bank+Math.max(0,Math.min(0.10,dt)));var count=Math.min(4,Math.floor((bank+1e-8)/STEP));
      if(!count)return true;
      var remapped=geometry(chunks);
      uploadUniform(controls.air||0,controls.damper==null?1:controls.damper);
      var enc=device.createCommandEncoder({label:'Sluice fire'});
      if(inherited.size){run(enc,'splitBody');enc.copyBufferToBuffer(bodies[1],0,bodies[0],0,CAP*64);inherited.clear();}
      if(remapped){run(enc,'remap');gasIndex=1-gasIndex;}
      for(var s=0;s<count;s++){
        run(enc,'advectVelocity');velIndex=1-velIndex;run(enc,'diverge');
        for(var k=0;k<20;k++)run(enc,'pressureStep',k%2);
        run(enc,'project',0);velIndex=1-velIndex;
        for(var k=0;k<8;k++){run(enc,'transport');gasIndex=1-gasIndex;}
        // Both exchanges see the same gas and body snapshots.
        run(enc,'solid');run(enc,'react');gasIndex=1-gasIndex;velIndex=1-velIndex;
        enc.copyBufferToBuffer(bodies[1],0,bodies[0],0,CAP*64);
        sim.steps++;time+=STEP;bank-=STEP;
      }
      run(enc,'reduce');var after=mirror(enc);device.queue.submit([enc.finish()]);sim.submissions++;if(after)after();
      ignition.clear();quenches.clear();sim.cpuMs=performance.now()-start;return true;
    };
    sim.fracture=function(parent,children){
      revision++;children.forEach(function(child){
        inherited.set(child,parent);
        if(ignition.has(parent))ignition.set(child,ignition.get(parent));
        if(quenches.has(parent))quenches.set(child,quenches.get(parent)*child.dryKg/parent.dryKg);
        if(commands.has(parent))commands.set(child,commands.get(parent));
      });
    };
    sim.ignite=function(body){ignition.set(body,1500);commands.set(body,++commandSerial);};
    sim.quench=function(body,kg){if(Number.isFinite(kg)&&kg>0){quenches.set(body,(quenches.get(body)||0)+Math.min(kg,0.02));commands.set(body,++commandSerial);}};
    sim.hide=function(){gpuCanvas.style.display='none';};
    sim.draw=function(rect,parent){
      if(!sim.available||sim.failed)return false;
      if(gpuCanvas.parentNode!==parent)parent.appendChild(gpuCanvas);
      var scale=Math.min(1.5,window.devicePixelRatio||1),rw=Math.max(8,Math.ceil(rect.w*scale)),rh=Math.max(8,Math.ceil(rect.h*scale));
      if(gpuCanvas.width!==rw||gpuCanvas.height!==rh){gpuCanvas.width=rw;gpuCanvas.height=rh;}
      gpuCanvas.style.display='block';gpuCanvas.style.left=rect.x+'px';gpuCanvas.style.top=rect.y+'px';gpuCanvas.style.width=rect.w+'px';gpuCanvas.style.height=rect.h+'px';
      var enc=device.createCommandEncoder();run(enc,'emission');var pass=enc.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(pipelines.fragment);pass.setBindGroup(0,bind('fragment',gasIndex,velIndex,0));pass.draw(3);pass.end();device.queue.submit([enc.finish()]);return true;
    };
    sim.reset=function(){resetGeneration++;revision++;signature='';geometryFresh=true;bank=0;slots.fill(null);inherited.clear();ignition.clear();quenches.clear();commands.clear();sim.outputKW=0;sim.gasKg=0;sim.sootKg=0;
      uploadUniform(0,1);var enc=device.createCommandEncoder();for(var i=0;i<2;i++){gasIndex=i;velIndex=i;run(enc,'init',i);}enc.clearBuffer(bodies[0]);enc.clearBuffer(bodies[1]);device.queue.submit([enc.finish()]);gasIndex=velIndex=0;sim.hide();};
    sim.snapshot=async function(){
      await device.queue.onSubmittedWorkDone();var out=device.createBuffer({size:(n*48+(w+h)*16)+CAP*64,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      var enc=device.createCommandEncoder();enc.copyBufferToBuffer(g[gasIndex],0,out,0,n*32);enc.copyBufferToBuffer(bodies[0],0,out,n*32,CAP*64);enc.copyBufferToBuffer(v[velIndex],0,out,n*32+CAP*64,(n+w+h)*16);device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ);var result=new Float32Array(out.getMappedRange().slice(0));out.unmap();out.destroy();return {fields:result.slice(0,n*8),bodies:result.slice(n*8,n*8+CAP*16),velocities:result.slice(n*8+CAP*16),mask:masks.slice(),width:w,height:h,volume:uniform[5]};
    };
    // Only the standalone verification harness can seed individual kernels.
    // Production gameplay has no field upload or synchronous readback path.
    if(options.testing)sim.testKernel=async function(name,state){
      if(name==='geometry')geometry(state.chunks||[]);
      uploadUniform(state.air||0,state.damper==null?0:state.damper);
      if(state.fields)device.queue.writeBuffer(g[gasIndex],0,state.fields);
      if(state.velocities)device.queue.writeBuffer(v[velIndex],0,state.velocities);
      if(state.mask){masks.set(state.mask);device.queue.writeBuffer(m,0,masks);}
      var enc=device.createCommandEncoder();
      if(name==='projection'){
        run(enc,'diverge');for(var k=0;k<20;k++)run(enc,'pressureStep',k%2);run(enc,'project');velIndex=1-velIndex;
      }else run(enc,name==='geometry'?'remap':name);
      if(name==='transport'||name==='react'||name==='geometry')gasIndex=1-gasIndex;
      device.queue.submit([enc.finish()]);return sim.snapshot();
    };
    sim.dispose=function(){lost=true;sim.available=false;sim.hide();gpuCanvas.remove();buffers.forEach(function(b){try{b.destroy();}catch(e){}});};
    sim.readyPromise=(async function(){
      var scoped=false;
      try{
        device.pushErrorScope('validation');scoped=true;var module=device.createShaderModule({label:'Sluice thermochemical fire',code:shader});
        var info=await module.getCompilationInfo();var errors=info.messages.filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('\n'));
        await Promise.all(Object.keys(definitions).map(async function(name){
          pipelines[name]=name==='fragment'?await device.createRenderPipelineAsync({layout:'auto',vertex:{module:module,entryPoint:'vertex'},fragment:{module:module,entryPoint:'fragment',targets:[{format:navigator.gpu.getPreferredCanvasFormat()}]},primitive:{topology:'triangle-list'}}):await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});
        }));
        Object.keys(definitions).forEach(function(name){bind(name,0,0,0);});
        var error=await device.popErrorScope();scoped=false;if(error)throw Error(error.message);
        if(lost)return false;sim.available=true;geometry([]);sim.reset();
        gpuCanvas.width=gpuCanvas.height=8;
        var warm=device.createCommandEncoder();run(warm,'emission');var pass=warm.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
        pass.setPipeline(pipelines.fragment);pass.setBindGroup(0,bind('fragment',0,0,0));pass.draw(3);pass.end();device.queue.submit([warm.finish()]);
        await device.queue.onSubmittedWorkDone();return !lost;
      }catch(e){if(scoped)await device.popErrorScope();sim.errors.push(String(e));sim.failed=true;sim.available=false;console.warn('Sluice fire fallback: '+e);return false;}
    })();
    device.lost.then(function(){sim.dispose();sim.failed=true;});
    return sim;
  }
  window.FireWGPU={create:create,shader:shader};
})();
