/* Isolated opt-in projected MPM prototype. Native particles are the only liquid.
 * Direct quadratic staggered APIC transfer, signed density EOS and gas coupling.
 * Static tile basis integration is exact. Moving-body and liquid-interface
 * basis domains remain explicit approximations. No machine acceptance is implied.
 */
(function (global) {
  'use strict';
  var RECORD = /* wgsl */ `
struct MacRecord {
  mass:atomic<i32>, momentum:atomic<i32>, volume:atomic<i32>, errors:atomic<i32>,
  velocity:f32, density:f32, basis:f32, J:f32,
  projected:f32, represented:u32, alpha:f32, defect:f32,
  spare:vec4<f32>,
};
const MAC_MASS_SCALE:f32=16384.0;
const MAC_MOMENTUM_SCALE:f32=1024.0;
`;
  var HELPERS = /* wgsl */ `
fn macUCount()->u32{return (cfg.width+1u)*cfg.height;}
fn macVCount()->u32{return cfg.width*(cfg.height+1u);}
fn macCenter(c:u32)->u32{return macUCount()+macVCount()+c;}
fn macTotal()->u32{return macUCount()+macVCount()+cfg.cells;}
fn macFace(c:u32,d:u32)->u32 {
  let x=c%cfg.width;let y=c/cfg.width;
  if(d==0u){return y*(cfg.width+1u)+x;}if(d==1u){return y*(cfg.width+1u)+x+1u;}
  if(d==2u){return macUCount()+y*cfg.width+x;}
  return macUCount()+(y+1u)*cfg.width+x;
}
fn macPoint(q:u32)->vec2<f32>{
  if(q<macUCount()){return vec2<f32>(f32(q%(cfg.width+1u)),f32(q/(cfg.width+1u))+0.5)*cfg.dx;}
  let a=q-macUCount();if(a<macVCount()){return vec2<f32>(f32(a%cfg.width)+0.5,f32(a/cfg.width))*cfg.dx;}
  let c=a-macVCount();return vec2<f32>(f32(c%cfg.width)+0.5,f32(c/cfg.width)+0.5)*cfg.dx;
}
fn macN(z:f32)->f32{let a=abs(z);if(a<=0.5){return 0.75-z*z;}if(a<1.5){return 0.5*(1.5-a)*(1.5-a);}return 0.0;}
fn macCDF(z:f32)->f32{
  if(z<=-1.5){return 0.0;}if(z< -0.5){let t=z+1.5;return t*t*t/6.0;}
  if(z<=0.5){return 0.5+0.75*z-z*z*z/3.0;}if(z<1.5){let t=1.5-z;return 1.0-t*t*t/6.0;}return 1.0;
}
fn macTerrainSolid(x:u32,y:u32)->bool {
  let q=y*terrain[0]+x;return (terrain[4u+q/32u]&(1u<<(q%32u)))!=0u;
}
// Integrate the actual static tile union, rather than spreading its fractional
// coverage uniformly. A kind-water cell still has an approximate interface
// domain; that independent approximation is reported by macDensities.
fn macBasis(point:vec2<f32>,fluid:bool)->f32{
  let lo=vec2<i32>(floor(point/cfg.dx-vec2<f32>(1.5)));
  let hi=vec2<i32>(ceil(point/cfg.dx+vec2<f32>(1.5)));var volume=0.0;
  for(var y=lo.y;y<hi.y;y=y+1){for(var x=lo.x;x<hi.x;x=x+1){
    if(x<0 || y<0 || x>=i32(cfg.width) || y>=i32(cfg.height)){continue;}
    let c=u32(y)*cfg.width+u32(x);if(fluid && cells[c].kind!=1u){continue;}
    let cellLo=vec2<f32>(f32(x),f32(y))*cfg.dx;let cellHi=cellLo+vec2<f32>(cfg.dx);
    if(terrain[3]==1u){
      let tile=bitcast<f32>(terrain[2]);let tileLo=vec2<i32>(floor(cellLo/tile));let tileHi=vec2<i32>(ceil(cellHi/tile));
      for(var ty=tileLo.y;ty<tileHi.y;ty=ty+1){for(var tx=tileLo.x;tx<tileHi.x;tx=tx+1){
        if(tx<0 || ty<0 || tx>=i32(terrain[0]) || ty>=i32(terrain[1])){continue;}
        if(macTerrainSolid(u32(tx),u32(ty))){continue;}
        let a=(max(cellLo,vec2<f32>(f32(tx),f32(ty))*tile)-point)/cfg.dx;
        let b=(min(cellHi,vec2<f32>(f32(tx+1),f32(ty+1))*tile)-point)/cfg.dx;
        volume=volume+cfg.dx*cfg.dx*(macCDF(b.x)-macCDF(a.x))*(macCDF(b.y)-macCDF(a.y));
      }}
    }else{
      let alpha=max(0.0,1.0-geometry[c].volume.x);
      let a=(cellLo-point)/cfg.dx;let b=(cellHi-point)/cfg.dx;
      volume=volume+alpha*cfg.dx*cfg.dx*(macCDF(b.x)-macCDF(a.x))*(macCDF(b.y)-macCDF(a.y));
    }
  }}return volume;
}
`;
  var CONFIG = /* wgsl */ `
struct Config {width:u32,height:u32,cells:u32,iterations:u32,dx:f32,rho:f32,sound:f32,atmosphere:f32,
 minimum:f32,threshold:f32,volumeScale:f32,diagonalScale:f32,fluxScale:f32,neighborScale:f32,pad0:f32,pad1:f32};
struct Grid {count:u32,width:u32,height:u32,originX:u32,originY:u32,cells:u32,dt:f32,invCell:f32,
 worldCols:f32,tile:f32,worldRows:f32,pad:f32,terrainX:u32,terrainY:u32,terrainW:u32,terrainH:u32};
struct Cell {fraction:f32,u:f32,v:f32,kind:u32,rhs:f32,diagonal:f32,residual:f32,pad:f32};
struct Geometry {volume:vec4<f32>,faces:vec4<f32>};
`;
  var SCATTER = CONFIG + RECORD + /* wgsl */ `
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<uniform> grid:Grid;
@group(0) @binding(2) var<uniform> gravity:vec4<f32>;
@group(0) @binding(3) var<storage,read> pos:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read> affine:array<vec4<f32>>;
@group(0) @binding(5) var<storage,read_write> aux:array<vec4<f32>>;
@group(0) @binding(6) var<storage,read> flag:array<u32>;
@group(0) @binding(7) var<storage,read_write> mac:array<MacRecord>;
@group(0) @binding(8) var<storage,read> geometry:array<Geometry>;
@group(0) @binding(9) var<storage,read> cells:array<Cell>;
@group(0) @binding(10) var<storage,read> terrain:array<u32>;
` + HELPERS + /* wgsl */ `
fn macAcc(q:u32,m:f32,momentum:f32,volume:f32){
  if(!(m>=0.0 && m*MAC_MASS_SCALE<2147483000.0 && volume>=0.0 && volume*MAC_MASS_SCALE<2147483000.0 && abs(momentum)*MAC_MOMENTUM_SCALE<2147483000.0)){
    atomicAdd(&mac[macTotal()].errors,1);return;
  }
  let a=i32(round(m*MAC_MASS_SCALE));let b=i32(round(momentum*MAC_MOMENTUM_SCALE));let c=i32(round(volume*MAC_MASS_SCALE));
  let aa=atomicAdd(&mac[q].mass,a);let bb=atomicAdd(&mac[q].momentum,b);let cc=atomicAdd(&mac[q].volume,c);
  if(a<0 || c<0 || aa+a<aa || cc+c<cc || (bb>0 && b>0 && bb+b<0) || (bb<0 && b<0 && bb+b>0)){
    atomicAdd(&mac[macTotal()].errors,1);
  }
}
@compute @workgroup_size(128)
fn clearMac(@builtin(global_invocation_id) id:vec3<u32>){
  let q=id.x;if(q>macTotal()){return;}
  atomicStore(&mac[q].mass,0);atomicStore(&mac[q].momentum,0);atomicStore(&mac[q].volume,0);atomicStore(&mac[q].errors,0);
  mac[q].velocity=0.0;mac[q].density=0.0;mac[q].basis=0.0;mac[q].J=0.0;
  mac[q].projected=0.0;mac[q].represented=0u;mac[q].alpha=0.0;mac[q].defect=0.0;mac[q].spare=vec4<f32>(0.0);
}
@compute @workgroup_size(128)
fn initializeMaterial(@builtin(global_invocation_id) id:vec3<u32>){
  let p=id.x;if(p>=grid.count){return;}let fl=flag[p];let material=(fl&3u)|((fl>>4u)&4u);
  if(material==0u){aux[p].x=4.0;}
}
@compute @workgroup_size(128)
fn scatterMac(@builtin(global_invocation_id) id:vec3<u32>){
  let p=id.x;if(p>=grid.count){return;}let fl=flag[p];let material=(fl&3u)|((fl>>4u)&4u);
  if(material!=0u || (fl&32u)!=0u){return;}
  let pp=pos[p];let density=aux[p].x;
  if(!(density>0.0 && density<1.0e30)){atomicAdd(&mac[macTotal()].errors,1);return;}
  let J=4.0/density;let mass=cfg.rho*1.5625;let volume=1.5625*J;let af=affine[p]/grid.dt;
  for(var axis=0u;axis<3u;axis=axis+1u){
    let offset=select(select(vec2<f32>(0.0,0.5),vec2<f32>(0.5,0.0),axis==1u),vec2<f32>(0.5),axis==2u);
    let p0=pp.xy/cfg.dx-offset;let base=vec2<i32>(floor(p0+vec2<f32>(0.5)));
    let width=cfg.width+select(0u,1u,axis==0u);let height=cfg.height+select(0u,1u,axis==1u);
    let start=select(select(0u,macUCount(),axis==1u),macUCount()+macVCount(),axis==2u);
    for(var j= -1;j<=1;j=j+1){for(var i= -1;i<=1;i=i+1){
      let cell=base+vec2<i32>(i,j);if(cell.x<0 || cell.y<0 || cell.x>=i32(width) || cell.y>=i32(height)){continue;}
      let delta=vec2<f32>(cell)-p0;let weight=macN(delta.x)*macN(delta.y);let q=start+u32(cell.y)*width+u32(cell.x);
      var v=0.0;if(axis==0u){v=pp.z+dot(af.xy,delta*cfg.dx);}if(axis==1u){v=pp.w+dot(af.zw,delta*cfg.dx);}
      macAcc(q,weight*mass,weight*mass*v,weight*volume);
    }}
  }
}
@compute @workgroup_size(128)
fn normalizeMac(@builtin(global_invocation_id) id:vec3<u32>){
  let q=id.x;if(q>=macTotal()){return;}
  let mass=f32(atomicLoad(&mac[q].mass))/MAC_MASS_SCALE;let volume=f32(atomicLoad(&mac[q].volume))/MAC_MASS_SCALE;
  let basis=macBasis(macPoint(q),false);mac[q].basis=basis;mac[q].J=select(1.0,volume*cfg.rho/max(mass,1.0e-20),mass>0.0);
  mac[q].alpha=volume/max(basis,1.0e-20);mac[q].defect=max(0.0,mac[q].alpha-1.0);
  mac[q].density=select(0.0,mass/max(volume,1.0e-20),mass>0.0);
  if(q>=macUCount()+macVCount()){return;}
  var velocity=0.0;if(mass>0.0){velocity=f32(atomicLoad(&mac[q].momentum))/MAC_MOMENTUM_SCALE/mass;}
  if(q>=macUCount() && mass>0.0){velocity=velocity+grid.dt*gravity.x;}
  mac[q].velocity=velocity;mac[q].projected=velocity;
}
`;

  function replaceFunction(source, name, value) {
    var begin=source.indexOf('fn '+name+'(');if(begin<0)throw new Error('Missing pressure function '+name);
    var brace=source.indexOf('{',begin),depth=1,end=brace+1;
    while(depth && end<source.length){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
    if(depth)throw new Error('Unbalanced pressure function '+name);
    return source.slice(0,begin)+value+source.slice(end);
  }
  function pressureSource(source) {
    source=source.replace('@group(0) @binding(2) var<storage,read> mass:array<i32>;',RECORD+'\n@group(0) @binding(2) var<storage,read_write> mac:array<MacRecord>;');
    source=source.replace('@group(0) @binding(3) var<storage,read_write> gridU:array<f32>;','@group(0) @binding(3) var<storage,read> terrain:array<u32>;');
    source+=HELPERS;
    var begin=source.indexOf('fn prepare('),stop=source.indexOf('\n@compute',begin),prepare=source.slice(begin,stop);
    var a=prepare.indexOf('  var m=0.0;'),b=prepare.indexOf('  var label=NONE;',a);
    prepare=prepare.slice(0,a)+/* wgsl */ `
  let q=macCenter(c);let fraction=clamp(mac[q].alpha,0.0,1.0);
  var kind=select(2u,1u,fraction>=cfg.threshold);if(geometry[c].volume.x>=0.999999){kind=0u;}
  cells[c].fraction=fraction;cells[c].kind=kind;
  cells[c].u=(mac[macFace(c,0u)].velocity+mac[macFace(c,1u)].velocity)*0.5;
  cells[c].v=(mac[macFace(c,2u)].velocity+mac[macFace(c,3u)].velocity)*0.5;
  atomicMax(&gas[cfg.cells+1u].volume,bitcast<i32>(max(abs(cells[c].u),abs(cells[c].v))));
  cells[c].rhs=0.0;cells[c].diagonal=0.0;cells[c].residual=0.0;
`+prepare.slice(b);
    source=replaceFunction(source,'prepare',prepare.trim());
    source=replaceFunction(source,'faceVelocity',`fn faceVelocity(c:u32,n:u32,d:u32)->f32{return mac[macFace(c,d)].velocity;}`);
    source=replaceFunction(source,'conductance',`fn conductance(c:u32,n:u32,d:u32)->f32{
      let q=macFace(c,d);if(mac[q].represented==0u || mac[q].density<=0.0){return 0.0;}
      return faceOpen(c,n,d)/mac[q].density;
    }`);
    source=replaceFunction(source,'projectedFace',`fn projectedFace(c:u32,n:u32,d:u32)->f32{
      let q=macFace(c,d);if(faceOpen(c,n,d)==0.0){return wallFaceVelocity(c,n,d);}
      if(mac[q].represented==0u || mac[q].density<=0.0){return mac[q].velocity;}
      let sign=select(-1.0,1.0,d==1u || d==3u);
      return mac[q].velocity-sign*grid.dt*(pressure(n)-pressure(c))/(mac[q].density*cfg.dx);
    }`);
    var ib=source.indexOf('fn initializeWater('),ie=source.indexOf('\n@compute',ib),iw=source.slice(ib,ie);
    var i0=iw.indexOf('  let compliance='),i1=iw.indexOf('  var rhs=',i0);
    iw=iw.slice(0,i0)+`  let q=macCenter(c);let rho=mac[q].density;
  let occupiedVolume=accessibleArea(c)*select(cells[c].fraction,1.0,mac[q].represented==1u);
  let compliance=select(0.0,occupiedVolume/(rho*cfg.sound*cfg.sound),rho>0.0);
  let old=cfg.sound*cfg.sound*(rho-cfg.rho);cells[c].pad=old;
`+iw.slice(i1);
    source=replaceFunction(source,'initializeWater',iw.trim());
    source=replaceFunction(source,'applyVelocity',/* wgsl */ `fn applyVelocity(@builtin(global_invocation_id) id:vec3<u32>){
      let q=id.x;if(q>=macUCount()+macVCount()){return;}
      let vertical=q>=macUCount();let a=select(q,q-macUCount(),vertical);
      let width=select(cfg.width+1u,cfg.width,vertical);let x=i32(a%width);let y=i32(a/width);
      let left=select(index(x-1,y),index(x,y-1),vertical);let right=index(x,y);
      if(right!=NONE && cells[right].kind==1u){mac[q].projected=projectedFace(right,left,select(0u,2u,vertical));}
      else if(left!=NONE && cells[left].kind==1u){mac[q].projected=projectedFace(left,right,select(1u,3u,vertical));}
    }`);
    source+=/* wgsl */ `
// Air behind a closed wall is outside this liquid's constitutive domain.
// Restrict the interface search to four-neighbor open-face paths inside the
// quadratic support neighborhood, rather than a Cartesian room proximity.
fn macAccessibleAir(c:u32)->bool {
  if(c==NONE || cells[c].kind==0u){return false;}if(cells[c].kind==2u){return true;}
  let cx=i32(c%cfg.width);let cy=i32(c/cfg.width);var reached:array<bool,25>;
  reached[12]=true;
  for(var round=0u;round<4u;round=round+1u){var next=reached;
    for(var q=0u;q<25u;q=q+1u){if(!reached[q]){continue;}
      let x=i32(q%5u)-2;let y=i32(q/5u)-2;let a=index(cx+x,cy+y);
      for(var d=0u;d<4u;d=d+1u){let ox=select(select(0,-1,d==0u),1,d==1u);let oy=select(select(0,-1,d==2u),1,d==3u);
        let nx=x+ox;let ny=y+oy;if(nx< -2 || nx>2 || ny< -2 || ny>2){continue;}
        let b=index(cx+nx,cy+ny);if(b==NONE || cells[b].kind==0u || faceOpen(a,b,d)<=0.0){continue;}
        if(cells[b].kind==2u){return true;}next[u32(ny+2)*5u+u32(nx+2)]=true;
      }
    }reached=next;
  }return false;
}
@compute @workgroup_size(128)
fn macDensities(@builtin(global_invocation_id) id:vec3<u32>){
  let q=id.x;if(q>=macTotal()){return;}
  let mass=f32(atomicLoad(&mac[q].mass))/MAC_MASS_SCALE;let volume=f32(atomicLoad(&mac[q].volume))/MAC_MASS_SCALE;
  if(q>=macUCount()+macVCount()){
    let c=q-macUCount()-macVCount();let confined=cells[c].kind==1u && !macAccessibleAir(c);
    if(confined){mac[q].density=mass/max(mac[q].basis,1.0e-20);}
    else{mac[q].density=select(0.0,mass/max(volume,1.0e-20),mass>0.0);}
    mac[q].represented=select(0u,1u,confined);return;
  }
  let point=macPoint(q);let basis=macBasis(point,true);mac[q].basis=basis;
  mac[q].density=select(0.0,mass/max(basis,1.0e-20),basis>0.0 && mass>0.0);
  let vertical=q>=macUCount();let a=select(q,q-macUCount(),vertical);let width=select(cfg.width+1u,cfg.width,vertical);
  let x=i32(a%width);let y=i32(a/width);let left=select(index(x-1,y),index(x,y-1),vertical);let right=index(x,y);
  var represented=false;if(left!=NONE){represented=represented || cells[left].kind==1u;}if(right!=NONE){represented=represented || cells[right].kind==1u;}
  mac[q].represented=select(0u,1u,represented && basis>0.0 && mass>0.0);
  var interfaceApproximation=false;
  if(left!=NONE && cells[left].kind==1u){interfaceApproximation=macAccessibleAir(left);}
  if(right!=NONE && cells[right].kind==1u){interfaceApproximation=interfaceApproximation || macAccessibleAir(right);}
  if(mac[q].represented==1u && interfaceApproximation){mac[q].spare.x=1.0;}
}
`;
    return source;
  }

  var GATHER_DECLARATIONS = RECORD + /* wgsl */ `
struct MacGatherConfig {width:u32,height:u32,cells:u32,iterations:u32,dx:f32,rho:f32,sound:f32,atmosphere:f32,
 minimum:f32,threshold:f32,volumeScale:f32,diagonalScale:f32,fluxScale:f32,neighborScale:f32,pad0:f32,pad1:f32};
@group(0) @binding(10) var<storage,read_write> machineMac:array<MacRecord>;
@group(0) @binding(11) var<uniform> mc:MacGatherConfig;
fn machineN(z:f32)->f32{let a=abs(z);if(a<=0.5){return 0.75-z*z;}if(a<1.5){return 0.5*(1.5-a)*(1.5-a);}return 0.0;}
fn machineTotal()->u32{return (mc.width+1u)*mc.height+mc.width*(mc.height+1u)+mc.cells;}
// Centered weighted MLS preserves the first moment when wall support is cut.
// Return velocity, world gradient x/y and support rank. Rank loss is counted.
fn machineMLS(point:vec2<f32>,vertical:bool)->vec4<f32>{
  let offset=select(vec2<f32>(0.0,0.5),vec2<f32>(0.5,0.0),vertical);
  let px=point/mc.dx-offset;let base=vec2<i32>(floor(px+vec2<f32>(0.5)));
  let width=mc.width+select(1u,0u,vertical);let height=mc.height+select(0u,1u,vertical);
  let start=select(0u,(mc.width+1u)*mc.height,vertical);
  var W=0.0;var X=0.0;var Y=0.0;var XX=0.0;var XY=0.0;var YY=0.0;
  var U=0.0;var UX=0.0;var UY=0.0;
  for(var j= -1;j<=1;j=j+1){for(var i= -1;i<=1;i=i+1){
    let cell=base+vec2<i32>(i,j);if(cell.x<0 || cell.y<0 || cell.x>=i32(width) || cell.y>=i32(height)){continue;}
    let q=start+u32(cell.y)*width+u32(cell.x);if(machineMac[q].represented==0u){continue;}
    let d=(vec2<f32>(cell)-px)*mc.dx;let weight=machineN(d.x/mc.dx)*machineN(d.y/mc.dx);
    let value=machineMac[q].projected;
    W=W+weight;X=X+weight*d.x;Y=Y+weight*d.y;U=U+weight*value;
    XX=XX+weight*d.x*d.x;XY=XY+weight*d.x*d.y;YY=YY+weight*d.y*d.y;
    UX=UX+weight*value*d.x;UY=UY+weight*value*d.y;
  }}
  if(W<=1.0e-12){atomicAdd(&machineMac[machineTotal()].mass,1);return vec4<f32>(0.0);}
  let mx=X/W;let my=Y/W;let mean=U/W;
  // Accumulate centered moments directly. E[x*x]-E[x]^2 loses substantial
  // precision on slender truncated stencils and can invent an affine slope.
  XX=0.0;XY=0.0;YY=0.0;UX=0.0;UY=0.0;
  for(var j= -1;j<=1;j=j+1){for(var i= -1;i<=1;i=i+1){
    let cell=base+vec2<i32>(i,j);if(cell.x<0 || cell.y<0 || cell.x>=i32(width) || cell.y>=i32(height)){continue;}
    let q=start+u32(cell.y)*width+u32(cell.x);if(machineMac[q].represented==0u){continue;}
    let d=(vec2<f32>(cell)-px)*mc.dx;let weight=machineN(d.x/mc.dx)*machineN(d.y/mc.dx);
    let dc=d-vec2<f32>(mx,my);let uc=machineMac[q].projected-mean;
    XX=XX+weight*dc.x*dc.x;XY=XY+weight*dc.x*dc.y;YY=YY+weight*dc.y*dc.y;
    UX=UX+weight*uc*dc.x;UY=UY+weight*uc*dc.y;
  }}
  let a=max(0.0,XX/W);let b=XY/W;let c=max(0.0,YY/W);
  let bx=UX/W;let by=UY/W;let determinant=a*c-b*b;let trace=a+c;
  var cx=0.0;var cy=0.0;var rank=0.0;
  if(trace>1.0e-8*mc.dx*mc.dx){
    if(determinant>1.0e-6*trace*trace){cx=(c*bx-b*by)/determinant;cy=(a*by-b*bx)/determinant;rank=2.0;}
    else{
      let eigenvalue=0.5*(trace+sqrt((a-c)*(a-c)+4.0*b*b));var axis=vec2<f32>(1.0,0.0);
      if(abs(b)>1.0e-6*trace){axis=normalize(vec2<f32>(b,eigenvalue-a));}else if(c>a){axis=vec2<f32>(0.0,1.0);}
      let slope=dot(vec2<f32>(bx,by),axis)/eigenvalue;cx=slope*axis.x;cy=slope*axis.y;rank=1.0;
      atomicAdd(&machineMac[machineTotal()].momentum,1);
    }
  }
  return vec4<f32>(mean-cx*mx-cy*my,cx,cy,rank);
}
`;
  var GATHER = /* wgsl */ `
  let mu=machineMLS(pp.xy,false);let mv=machineMLS(pp.xy,true);
  let fallbackU=pp.z;let fallbackV=pp.w+sp.grav.x*gp.stepDt;
  var vx=select(fallbackU,mu.x,mu.w>0.0)*gp.stepDt/CELL;
  var vy=select(fallbackV,mv.x,mv.w>0.0)*gp.stepDt/CELL;
  var gv00=mu.y*gp.stepDt/4.0-vx*ddx;
  var gv01=mu.z*gp.stepDt/4.0-vx*ddy;
  var gv10=mv.y*gp.stepDt/4.0-vy*ddx;
  var gv11=mv.z*gp.stepDt/4.0-vy*ddy;
`;
  var AFTER_AFFINE = /* wgsl */ `
  let nextDensity=aux[i].x*exp(-(gv00+gv11));
  if(nextDensity>1.0e-30 && nextDensity<1.0e30){aux[i].x=nextDensity;}
  else{atomicAdd(&machineMac[machineTotal()].volume,1);}
`;

  function create(instance, options) {
    var device=instance.device,width=options.width,height=options.height,count=width*height;
    var faces=(width+1)*height+width*(height+1),records=faces+count+1;
    var buffer=device.createBuffer({label:'liquid.air.mac',size:records*64,
      usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    var terrainCapacity=Math.ceil(width*options.dx)*Math.ceil(height*options.dx);
    var terrainBuffer=device.createBuffer({label:'liquid.air.mac.terrain',size:16+Math.ceil(terrainCapacity/32)*4,
      usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    var entries=[];for(var i=0;i<11;i++)entries.push({binding:i,visibility:GPUShaderStage.COMPUTE,
      buffer:{type:i<3?'uniform':i===3 || i===4 || i===6 || i===8 || i===9 || i===10?'read-only-storage':'storage'}});
    var layout=device.createBindGroupLayout({entries:entries}),pl=device.createPipelineLayout({bindGroupLayouts:[layout]});
    var shader=device.createShaderModule({label:'liquid.air.mac.scatter',code:SCATTER}),pipes={};
    ['clearMac','scatterMac','normalizeMac','initializeMaterial'].forEach(function(name){pipes[name]=device.createComputePipeline({layout:pl,compute:{module:shader,entryPoint:name}});});
    var bound=[options.config,instance.paramsBuf,instance.simParamsBuf,instance.buf.pos,instance.buf.affine,instance.buf.aux,instance.buf.flag,buffer,options.geometry,options.cells,terrainBuffer];
    var group=device.createBindGroup({layout:layout,entries:bound.map(function(b,i){return {binding:i,resource:{buffer:b}};})});
    var gather=typeof instance.createPressureGatherPipeline==='function' ? instance.createPressureGatherPipeline({
      declarations:GATHER_DECLARATIONS,gather:GATHER,afterAffine:AFTER_AFFINE,waterOnly:true,
      bindings:[{type:'storage',buffer:buffer},{type:'uniform',buffer:options.config}]
    }) : null;
    function dispatch(pass,name,n){pass.setPipeline(pipes[name]);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.max(1,Math.ceil(n/128)));}
    return {buffer:buffer,terrainBuffer:terrainBuffer,records:records,faceRecords:faces,stride:16,source:pressureSource,gather:gather,
      geometryStaticTiles:function(walls,cols,rows,tile){
        if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols*rows>terrainCapacity||!(tile>=1)||walls.length!==cols*rows)throw new Error('Invalid MAC static terrain dimensions.');
        var words=new Uint32Array(4+Math.ceil(cols*rows/32)),view=new Float32Array(words.buffer);words.set([cols,rows,0,1]);view[2]=tile;
        for(var q=0;q<walls.length;q++)if(walls[q])words[4+(q>>5)]|=1<<(q&31);
        instance.queue.writeBuffer(terrainBuffer,0,words);
      },
      compilationInfo:Promise.all([shader.getCompilationInfo(),gather ? gather.module.getCompilationInfo() : Promise.resolve({messages:[]})]),
      before:function(encoder){var pass=encoder.beginComputePass({label:'liquid.air.mac.transfer'});dispatch(pass,'clearMac',records);dispatch(pass,'scatterMac',instance.uploadedCount|0);dispatch(pass,'normalizeMac',records-1);pass.end();},
      initializeMaterial:function(){var encoder=device.createCommandEncoder({label:'liquid.air.mac.initializeMaterial'});var pass=encoder.beginComputePass();dispatch(pass,'initializeMaterial',instance.uploadedCount|0);pass.end();instance.queue.submit([encoder.finish()]);},
      destroy:function(){buffer.destroy();terrainBuffer.destroy();}
    };
  }
  global.LiquidAirMAC={create:create,pressureSource:pressureSource,scatterSource:SCATTER,gatherDeclarations:GATHER_DECLARATIONS,gatherSource:GATHER};
})(typeof window!=='undefined'?window:globalThis);
