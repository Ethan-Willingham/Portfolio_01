/* Opt-in air and acoustic pressure experiment for the existing MLS-MPM grid.
 * This module does not own, spawn or remove liquid particles. Its optional
 * velocity reconstruction is consumed by the native particle gather.
 * Pressure units are rho * world-pixel^2 / simulation-second^2.
 * All topology and interface fluxes use the current GPU grid, never its mirror.
 * Acceptance and integration status are recorded in docs/WATER_MACHINES.md.
 */
(function (global) {
  'use strict';

  var SOURCE = /* wgsl */ `
struct Config {
  width:u32, height:u32, cells:u32, iterations:u32,
  dx:f32, rho:f32, sound:f32, atmosphere:f32,
  minimum:f32, threshold:f32, volumeScale:f32, diagonalScale:f32,
  fluxScale:f32, neighborScale:f32, pad0:f32, pad1:f32,
};
struct Grid {
  count:u32, width:u32, height:u32, originX:u32,
  originY:u32, cells:u32, dt:f32, invCell:f32,
  worldCols:f32, tile:f32, worldRows:f32, pad:f32,
  terrainX:u32, terrainY:u32, terrainW:u32, terrainH:u32,
};
struct Cell {
  fraction:f32, u:f32, v:f32, kind:u32,
  rhs:f32, diagonal:f32, residual:f32, pad:f32,
};
struct Label { current:atomic<u32>, previous:u32 };
struct Geometry { volume:vec4<f32>, faces:vec4<f32> };
struct History {
  pressure:f32, fraction:f32, amount:i32, volume:i32,
  geometricVolume:f32, airRoot:u32, vapor:u32, eosError:f32,
};
struct Gas {
  volume:atomic<i32>, overlap:atomic<i32>, amount:atomic<i32>, inherited:atomic<u32>,
  diagonal:atomic<i32>, flux:atomic<i32>, neighbors:atomic<i32>, pad:atomic<i32>,
  integratedVolume:atomic<i32>, vapor:atomic<u32>, allocatedAmount:atomic<i32>, allocatedVolume:atomic<i32>,
  destination:atomic<u32>, oldRootMin:atomic<u32>, oldRootMax:atomic<u32>, solvedVolume:atomic<i32>,
};
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<uniform> grid:Grid;
@group(0) @binding(2) var<storage,read> mass:array<i32>;
@group(0) @binding(3) var<storage,read_write> gridU:array<f32>;
@group(0) @binding(4) var<storage,read_write> gridV:array<f32>;
// Geometry: solid, horizontal wall speed, vertical wall speed, room seed.
@group(0) @binding(5) var<storage,read> geometry:array<Geometry>;
@group(0) @binding(6) var<storage,read_write> cells:array<Cell>;
@group(0) @binding(7) var<storage,read_write> labels:array<Label>;
@group(0) @binding(8) var<storage,read_write> history:array<History>;
@group(0) @binding(9) var<storage,read_write> gas:array<Gas>;
@group(0) @binding(10) var<storage,read_write> inputP:array<vec4<f32>>;
@group(0) @binding(11) var<storage,read_write> outputP:array<vec4<f32>>;
const NONE:u32=0xffffffffu;
const ALIGNED_TRANSPORT:bool=false;
const COLLAPSE_EMPTY_CELLS:bool=false;
const GEOMETRIC_GAS:bool=false;
const RED_BLACK:bool=false;
const NONLINEAR_GAS:bool=false;
const VAPOR_CLOSURE:bool=false;
const MASS_SCALE:f32=1048576.0;

// Four phase records share one Gas-sized slot in the same storage binding.
// Each logical record is [expansion f32, priorKind u32, status u32, diagnostic f32].
fn phaseGet(c:u32,word:u32)->u32 {
  let slot=cfg.cells+2u+c/4u;
  switch((c%4u)*4u+word){
    case 0u:{return bitcast<u32>(atomicLoad(&gas[slot].volume));}
    case 1u:{return bitcast<u32>(atomicLoad(&gas[slot].overlap));}
    case 2u:{return bitcast<u32>(atomicLoad(&gas[slot].amount));}
    case 3u:{return atomicLoad(&gas[slot].inherited);}
    case 4u:{return bitcast<u32>(atomicLoad(&gas[slot].diagonal));}
    case 5u:{return bitcast<u32>(atomicLoad(&gas[slot].flux));}
    case 6u:{return bitcast<u32>(atomicLoad(&gas[slot].neighbors));}
    case 7u:{return bitcast<u32>(atomicLoad(&gas[slot].pad));}
    case 8u:{return bitcast<u32>(atomicLoad(&gas[slot].integratedVolume));}
    case 9u:{return atomicLoad(&gas[slot].vapor);}
    case 10u:{return bitcast<u32>(atomicLoad(&gas[slot].allocatedAmount));}
    case 11u:{return bitcast<u32>(atomicLoad(&gas[slot].allocatedVolume));}
    case 12u:{return atomicLoad(&gas[slot].destination);}
    case 13u:{return atomicLoad(&gas[slot].oldRootMin);}
    case 14u:{return atomicLoad(&gas[slot].oldRootMax);}
    case 15u:{return bitcast<u32>(atomicLoad(&gas[slot].solvedVolume));}
    default:{return 0u;}
  }
}
fn phaseSet(c:u32,word:u32,value:u32){
  let slot=cfg.cells+2u+c/4u;
  switch((c%4u)*4u+word){
    case 0u:{atomicStore(&gas[slot].volume,bitcast<i32>(value));}
    case 1u:{atomicStore(&gas[slot].overlap,bitcast<i32>(value));}
    case 2u:{atomicStore(&gas[slot].amount,bitcast<i32>(value));}
    case 3u:{atomicStore(&gas[slot].inherited,value);}
    case 4u:{atomicStore(&gas[slot].diagonal,bitcast<i32>(value));}
    case 5u:{atomicStore(&gas[slot].flux,bitcast<i32>(value));}
    case 6u:{atomicStore(&gas[slot].neighbors,bitcast<i32>(value));}
    case 7u:{atomicStore(&gas[slot].pad,bitcast<i32>(value));}
    case 8u:{atomicStore(&gas[slot].integratedVolume,bitcast<i32>(value));}
    case 9u:{atomicStore(&gas[slot].vapor,value);}
    case 10u:{atomicStore(&gas[slot].allocatedAmount,bitcast<i32>(value));}
    case 11u:{atomicStore(&gas[slot].allocatedVolume,bitcast<i32>(value));}
    case 12u:{atomicStore(&gas[slot].destination,value);}
    case 13u:{atomicStore(&gas[slot].oldRootMin,value);}
    case 14u:{atomicStore(&gas[slot].oldRootMax,value);}
    case 15u:{atomicStore(&gas[slot].solvedVolume,bitcast<i32>(value));}
    default:{}
  }
}
fn phaseExpansion(c:u32)->f32{return bitcast<f32>(phaseGet(c,0u));}
fn setPhaseExpansion(c:u32,value:f32){phaseSet(c,0u,bitcast<u32>(value));}

fn fixed(v:f32,scale:f32)->i32 {
  let x=v*scale;
  if(abs(x)>1.5e9){atomicAdd(&gas[cfg.cells].oldRootMax,1u);}
  return i32(round(clamp(x,-1.5e9,1.5e9)));
}
fn encodeVolume(v:f32)->i32 { return fixed(v,cfg.volumeScale); }
fn encodeDiagonal(v:f32)->i32 { return fixed(v,cfg.diagonalScale); }
fn encodeFlux(v:f32)->i32 { return fixed(v,cfg.fluxScale); }
fn encodeNeighbor(v:f32)->i32 { return fixed(v,cfg.neighborScale); }
fn diagonalScale(r:u32)->f32 {
  let faces=max(1.0,f32(atomicLoad(&gas[r].pad)));
  return min(cfg.diagonalScale,1.0e9/max(faces*grid.dt*grid.dt/cfg.rho,1.0e-20));
}
fn fluxScale(r:u32)->f32 {
  let faces=max(1.0,f32(atomicLoad(&gas[r].pad)));
  let speed=bitcast<f32>(atomicLoad(&gas[cfg.cells+1u].volume));
  return min(cfg.fluxScale,1.0e9/max(faces*grid.dt*cfg.dx*speed,1.0e-20));
}
fn neighborScale(r:u32)->f32 {
  let faces=max(1.0,f32(atomicLoad(&gas[r].pad)));
  let pressure=bitcast<f32>(atomicLoad(&gas[cfg.cells+1u].overlap));
  return min(cfg.neighborScale,1.0e9/max(faces*grid.dt*grid.dt*pressure/cfg.rho,1.0e-20));
}
fn index(x:i32,y:i32)->u32 {
  if(x<0 || y<0 || x>=i32(cfg.width) || y>=i32(cfg.height)){return NONE;}
  return u32(y)*cfg.width+u32(x);
}
fn neighbor(c:u32,d:u32)->u32 {
  let x=i32(c%cfg.width); let y=i32(c/cfg.width);
  if(d==0u){return index(x-1,y);} if(d==1u){return index(x+1,y);}
  if(d==2u){return index(x,y-1);} return index(x,y+1);
}
fn root(c:u32)->u32 {
  var p=atomicLoad(&labels[c].current);
  for(var k=0u;k<64u;k=k+1u){
    if(p==0u || p==NONE){return p;}
    let q=atomicLoad(&labels[p-1u].current);
    if(q==p){return p;} p=q;
  }
  return p;
}
fn join(a:u32,b:u32){
  var x=root(a); var y=root(b);
  for(var k=0u;k<64u;k=k+1u){
    if(x==y || x==NONE || y==NONE){return;}
    let hi=max(x,y);let lo=min(x,y);
    let old=atomicMin(&labels[hi-1u].current,lo);
    if(old==hi){return;}
    x=old;if(old>0u && old!=NONE){x=root(old-1u);}
    y=lo;if(lo>0u && lo!=NONE){y=root(lo-1u);}
  }
}
fn dof(c:u32)->u32 {
  if(c==NONE){return NONE;} if(cells[c].kind==1u){return c;}
  if(cells[c].kind==2u){let r=atomicLoad(&labels[c].current);if(r>0u && r!=NONE){return r-1u;}}
  return NONE;
}
fn pressure(c:u32)->f32 {
  let q=dof(c);if(q==NONE){return 0.0;}return inputP[q].x;
}
fn airRoot(c:u32)->u32 {
  if(cells[c].kind==2u){return atomicLoad(&labels[c].current);}
  if(cells[c].kind!=1u || cells[c].fraction>=1.0){return NONE;}
  var r=NONE;
  for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);
    if(n!=NONE && cells[n].kind==2u && faceOpen(c,n,d)>0.0){let q=atomicLoad(&labels[n].current);
      if(r!=NONE && r!=q){return NONE;}r=q;
    }
  }return r;
}
fn accessibleArea(c:u32)->f32 {return max(0.0,1.0-geometry[c].volume.x)*cfg.dx*cfg.dx;}
fn localAirArea(c:u32)->f32 {
  if(cells[c].kind==0u){return 0.0;}return (1.0-cells[c].fraction)*accessibleArea(c);
}
fn faceOpen(c:u32,n:u32,d:u32)->f32 {
  if(n==NONE || cells[c].kind==0u || cells[n].kind==0u){return 0.0;}
  let opposite=select(select(2u,3u,d==2u),select(0u,1u,d==0u),d<2u);
  return clamp(min(geometry[c].faces[d],geometry[n].faces[opposite]),0.0,1.0);
}
fn wallVelocity(c:u32,d:u32)->f32 {
  if(c==NONE){return 0.0;}return select(geometry[c].volume.y,geometry[c].volume.z,d>=2u);
}
fn wallFaceVelocity(c:u32,n:u32,d:u32)->f32 {
  if(n==NONE){return 0.0;}
  if(geometry[c].volume.x>geometry[n].volume.x){return wallVelocity(c,d);}return wallVelocity(n,d);
}
fn faceVelocity(c:u32,n:u32,d:u32)->f32 {
  if(n==NONE || cells[n].kind==0u){return wallFaceVelocity(c,n,d);}
  let a=select(cells[c].u,cells[c].v,d>=2u);
  if(cells[n].kind==2u){return a;}
  let b=select(cells[n].u,cells[n].v,d>=2u);
  return (a+b)*0.5;
}
fn conductance(c:u32,n:u32,d:u32)->f32 {
  // Unit extrusion depth. Shared face area preserves operator symmetry.
  return faceOpen(c,n,d)/cfg.rho;
}
fn faceFlux(c:u32,n:u32,d:u32,projected:bool)->f32 {
  let open=faceOpen(c,n,d);
  var velocity=faceVelocity(c,n,d);
  if(projected){velocity=projectedFace(c,n,d);}
  return cfg.dx*(open*velocity+(1.0-open)*wallFaceVelocity(c,n,d));
}
fn oldPressure(c:u32,x0:f32,y0:f32)->f32 {
  let start=vec2<f32>(f32(c%cfg.width),f32(c/cfg.width));
  let endpoint=clamp(vec2<f32>(x0,y0),vec2<f32>(0.0),vec2<f32>(f32(cfg.width-1u),f32(cfg.height-1u)));
  let distance=length(endpoint-start);let steps=max(1u,u32(ceil(distance*2.0)));
  var clear=start;
  for(var s=1u;s<=steps;s=s+1u){let p=mix(start,endpoint,f32(s)/f32(steps));
    let q=index(i32(floor(p.x+0.5)),i32(floor(p.y+0.5)));
    if(q==NONE || geometry[q].volume.x>=0.999999 || labels[q].previous!=NONE){break;}clear=p;
  }
  let x=clear.x;let y=clear.y;
  let bx=i32(floor(x));let by=i32(floor(y));let f=fract(vec2<f32>(x,y));
  var sum=0.0;var weight=0.0;
  for(var dy=0;dy<2;dy=dy+1){for(var dx=0;dx<2;dx=dx+1){
    let c=index(bx+dx,by+dy);if(c==NONE || geometry[c].volume.x>=0.999999 || labels[c].previous!=NONE){continue;}
    let w=select(1.0-f.x,f.x,dx==1)*select(1.0-f.y,f.y,dy==1);
    sum=sum+w*history[c].pressure;weight=weight+w;
  }}
  if(weight==0.0){return history[c].pressure;}return sum/weight;
}

@compute @workgroup_size(1)
fn clearDiagnostics(){
  atomicStore(&gas[cfg.cells].volume,0);atomicStore(&gas[cfg.cells].overlap,0);
  atomicStore(&gas[cfg.cells].amount,0);atomicStore(&gas[cfg.cells].diagonal,0);
  atomicStore(&gas[cfg.cells].flux,0);atomicStore(&gas[cfg.cells].neighbors,0);
  atomicStore(&gas[cfg.cells].pad,0);atomicStore(&gas[cfg.cells].integratedVolume,0);
  atomicStore(&gas[cfg.cells].vapor,0u);atomicStore(&gas[cfg.cells].oldRootMin,0u);
  atomicStore(&gas[cfg.cells].oldRootMax,0u);atomicStore(&gas[cfg.cells].solvedVolume,0);
  atomicStore(&gas[cfg.cells+1u].volume,0);atomicStore(&gas[cfg.cells+1u].overlap,0);
  atomicStore(&gas[cfg.cells+1u].amount,0);atomicStore(&gas[cfg.cells+1u].inherited,0u);
  atomicStore(&gas[cfg.cells+1u].diagonal,0);atomicStore(&gas[cfg.cells+1u].flux,0);
  atomicStore(&gas[cfg.cells+1u].neighbors,0);atomicStore(&gas[cfg.cells+1u].pad,0);
  atomicStore(&gas[cfg.cells+1u].solvedVolume,0);
}

@compute @workgroup_size(128)
fn prepare(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  phaseSet(c,1u,cells[c].kind);phaseSet(c,2u,0u);
  // The fourth phase word persists accessible area between geometry updates.
  let opened=max(0.0,accessibleArea(c)-bitcast<f32>(phaseGet(c,3u)));
  phaseSet(c,3u,bitcast<u32>(opened));
  if(history[c].pressure>cfg.minimum+0.01 || cells[c].kind!=1u){
    atomicAdd(&gas[cfg.cells+1u].amount,encodeVolume(phaseExpansion(c)));setPhaseExpansion(c,0.0);
  }
  labels[c].previous=atomicLoad(&labels[c].current);
  atomicStore(&gas[c].volume,0);atomicStore(&gas[c].overlap,0);
  atomicStore(&gas[c].amount,0);atomicStore(&gas[c].inherited,0u);
  atomicStore(&gas[c].diagonal,0);atomicStore(&gas[c].flux,0);
  atomicStore(&gas[c].neighbors,0);atomicStore(&gas[c].pad,0);
  atomicStore(&gas[c].integratedVolume,0);atomicStore(&gas[c].vapor,0u);
  atomicStore(&gas[c].allocatedAmount,0);atomicStore(&gas[c].allocatedVolume,0);
  atomicStore(&gas[c].destination,NONE);atomicStore(&gas[c].oldRootMin,NONE);
  atomicStore(&gas[c].oldRootMax,0u);atomicStore(&gas[c].solvedVolume,0);
  var m=0.0;var u=0.0;var v=0.0;var fineArea=1.0;
  if(ALIGNED_TRANSPORT){
    // Integrate the overlap when a pressure cell is not an integer number
    // of native cells. Eight-pixel pressure cells can then fit the walls.
  let ratio=cfg.dx*grid.invCell;
  let x=f32(c%cfg.width)*cfg.dx;let y=f32(c/cfg.width)*cfg.dx;
  let lo=vec2<f32>(x,y)*grid.invCell;let hi=lo+vec2<f32>(ratio);
  let begin=vec2<i32>(floor(lo));let end=vec2<i32>(ceil(hi));
  for(var iy=begin.y;iy<end.y;iy=iy+1){for(var ix=begin.x;ix<end.x;ix=ix+1){
    let gx=ix-bitcast<i32>(grid.originX);let gy=iy-bitcast<i32>(grid.originY);
    if(gx<0 || gy<0 || gx>=i32(grid.width) || gy>=i32(grid.height)){continue;}
    let q=u32(gy)*grid.width+u32(gx);
    let overlap=max(vec2<f32>(0.0),min(hi,vec2<f32>(f32(ix+1),f32(iy+1)))-max(lo,vec2<f32>(f32(ix),f32(iy))));
    let mm=max(0.0,f32(mass[q])/MASS_SCALE)*overlap.x*overlap.y;
    m=m+mm;u=u+mm*gridU[q];v=v+mm*gridV[q];
  }}
    fineArea=ratio*ratio;
  }else{
  let ratio=max(1u,u32(round(cfg.dx*grid.invCell)));
  let x=f32(c%cfg.width)*cfg.dx;let y=f32(c/cfg.width)*cfg.dx;
  for(var iy=0u;iy<ratio;iy=iy+1u){for(var ix=0u;ix<ratio;ix=ix+1u){
    let gx=i32(floor((x+(f32(ix)+0.5)/grid.invCell)*grid.invCell))-bitcast<i32>(grid.originX);
    let gy=i32(floor((y+(f32(iy)+0.5)/grid.invCell)*grid.invCell))-bitcast<i32>(grid.originY);
    if(gx<0 || gy<0 || gx>=i32(grid.width) || gy>=i32(grid.height)){continue;}
    let q=u32(gy)*grid.width+u32(gx);
    let mm=max(0.0,f32(mass[q])/MASS_SCALE);
    m=m+mm;u=u+mm*gridU[q];v=v+mm*gridV[q];
  }}
    fineArea=f32(ratio*ratio);
  }
  let open=max(0.0,1.0-geometry[c].volume.x);
  let fraction=clamp(m/(4.0*fineArea*max(open,1.0e-8)),0.0,1.0);
  var kind=select(2u,1u,fraction>=cfg.threshold);
  if(geometry[c].volume.x>=0.999999){kind=0u;}
  cells[c].fraction=fraction;cells[c].kind=kind;
  cells[c].u=u/max(m,1.0e-8)/grid.invCell/grid.dt;
  cells[c].v=v/max(m,1.0e-8)/grid.invCell/grid.dt;
  atomicMax(&gas[cfg.cells+1u].volume,bitcast<i32>(max(max(abs(cells[c].u),abs(cells[c].v)),max(abs(geometry[c].volume.y),abs(geometry[c].volume.z)))));
  cells[c].rhs=0.0;cells[c].diagonal=0.0;cells[c].residual=0.0;
  var label=NONE;
  if(kind==2u){label=select(c+1u,0u,geometry[c].volume.w>0.5);}
  atomicStore(&labels[c].current,label);
}

@compute @workgroup_size(128)
fn connect(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=2u){return;}
  let r=neighbor(c,1u);let b=neighbor(c,3u);
  if(r!=NONE && cells[r].kind==2u && faceOpen(c,r,1u)>0.0){join(c,r);}
  if(b!=NONE && cells[b].kind==2u && faceOpen(c,b,3u)>0.0){join(c,b);}
}
@compute @workgroup_size(128)
fn compress(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=2u){return;}
  atomicStore(&labels[c].current,root(c));
}
@compute @workgroup_size(128)
fn collectPhase(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  let r=airRoot(c);phaseSet(c,2u,r);if(r==NONE || r==0u){return;}
  let q=r-1u;let area=localAirArea(c);
  atomicAdd(&gas[q].volume,encodeVolume(area));
  atomicAdd(&gas[q].overlap,encodeVolume(phaseExpansion(c)));
  atomicAdd(&gas[q].allocatedAmount,encodeVolume(min(area,bitcast<f32>(phaseGet(c,3u)))));
  let old=history[c].airRoot;
  if(old>0u && old!=NONE && history[old-1u].volume>0){
    if(history[old-1u].amount>0){atomicOr(&gas[q].inherited,1u);}
    else{
      let priorArea=max(0.0,(1.0-history[c].fraction)*cfg.dx*cfg.dx);
      let share=min(priorArea,area)/max(history[old-1u].geometricVolume,1.0e-8);
      atomicAdd(&gas[q].allocatedVolume,encodeVolume(share*f32(history[old-1u].volume)/cfg.volumeScale));
    }
  }else if(phaseGet(c,1u)==2u && labels[c].previous==0u){atomicOr(&gas[q].inherited,1u);}
}
@compute @workgroup_size(128)
fn classifyPhase(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  let r=phaseGet(c,2u);phaseSet(c,2u,0u);if(r==NONE){return;}
  if(r==0u){phaseSet(c,2u,1u);return;}
  let q=r-1u;
  let required=f32(atomicLoad(&gas[q].volume))/cfg.volumeScale;
  let credit=f32(atomicLoad(&gas[q].overlap))/cfg.volumeScale;
  let geometryVoid=f32(atomicLoad(&gas[q].allocatedAmount))/cfg.volumeScale;
  let priorVoid=f32(atomicLoad(&gas[q].allocatedVolume))/cfg.volumeScale;
  let inherited=atomicLoad(&gas[q].inherited)>0u;
  let needed=max(0.0,required-geometryVoid-priorVoid);
  let permit=inherited || credit+0.5/cfg.volumeScale>=needed;
  if(!permit && c==q){atomicAdd(&gas[cfg.cells+1u].diagonal,encodeVolume(max(0.0,needed-credit)));}
  if(permit){
    if(!inherited && credit>0.0){let debit=min(credit,needed)*phaseExpansion(c)/credit;
      setPhaseExpansion(c,max(0.0,phaseExpansion(c)-debit));
      atomicAdd(&gas[cfg.cells+1u].flux,encodeVolume(debit));
    }
    if(cells[c].kind==2u){phaseSet(c,2u,select(select(3u,5u,phaseGet(c,1u)==2u),1u,inherited));
      if(bitcast<f32>(phaseGet(c,3u))>0.0){phaseSet(c,2u,2u);atomicAdd(&gas[cfg.cells+1u].neighbors,encodeVolume(min(localAirArea(c),bitcast<f32>(phaseGet(c,3u)))));}}
  }else if(cells[c].kind==2u){
    if(phaseGet(c,1u)==1u){
      if(COLLAPSE_EMPTY_CELLS){
      // A transport-created empty region cannot supply liquid pressure.
      // Preserve the defect above, but give this real void zero gas amount.
      // initializeGas therefore treats it as a collapsing vapor cavity.
      phaseSet(c,2u,6u);
      }else{
      cells[c].kind=1u;phaseSet(c,2u,4u);
      atomicAdd(&gas[cfg.cells+1u].inherited,1u);
      if(cells[c].fraction<1.0e-6){atomicAdd(&gas[cfg.cells+1u].pad,1);}
      }
    }else{phaseSet(c,2u,select(5u,2u,phaseGet(c,1u)==0u));}
  }
}
@compute @workgroup_size(128)
fn restartTopology(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  atomicStore(&gas[c].volume,0);atomicStore(&gas[c].overlap,0);atomicStore(&gas[c].inherited,0u);
  atomicStore(&gas[c].allocatedAmount,0);atomicStore(&gas[c].allocatedVolume,0);
  var label=NONE;if(cells[c].kind==2u){label=select(c+1u,0u,geometry[c].volume.w>0.5);}
  atomicStore(&labels[c].current,label);
}
@compute @workgroup_size(128)
fn checkConnectivity(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=2u){return;}
  for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);
    if(n!=NONE && cells[n].kind==2u && faceOpen(c,n,d)>0.0 && atomicLoad(&labels[c].current)!=atomicLoad(&labels[n].current)){
      atomicAdd(&gas[cfg.cells].oldRootMin,1u);
    }
  }
}
@compute @workgroup_size(128)
fn collectVolumes(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  let now=airRoot(c);let old=history[c].airRoot;
  let volume=localAirArea(c);
  if(now>0u && now!=NONE){atomicAdd(&gas[now-1u].volume,encodeVolume(volume));}
  if(now!=NONE && old>0u && old!=NONE && history[old-1u].volume>0){
    let overlap=min((1.0-history[c].fraction)*cfg.dx*cfg.dx,localAirArea(c));
    atomicAdd(&gas[old-1u].overlap,encodeVolume(max(0.0,overlap)));
  }
}
@compute @workgroup_size(128)
fn remapAmounts(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || atomicLoad(&gas[cfg.cells].inherited)==0u){return;}
  let now=airRoot(c);let old=history[c].airRoot;
  if(now==NONE){return;}
  if(old>0u && old!=NONE && history[old-1u].volume>0){
    let denominator=atomicLoad(&gas[old-1u].overlap);
    let overlap=encodeVolume(max(0.0,min((1.0-history[c].fraction)*cfg.dx*cfg.dx,localAirArea(c))));
    if(denominator<=0 || overlap<=0){return;}
    let share=f32(overlap)/f32(denominator);
    let amount=i32(floor(f32(history[old-1u].amount)*share));
    let volume=i32(floor(f32(history[old-1u].volume)*share));
    atomicAdd(&gas[old-1u].allocatedAmount,amount);atomicAdd(&gas[old-1u].allocatedVolume,volume);
    atomicMin(&gas[old-1u].destination,now);
    if(now==0u){atomicAdd(&gas[cfg.cells].diagonal,amount);return;}
    atomicAdd(&gas[now-1u].amount,amount);atomicAdd(&gas[now-1u].integratedVolume,volume);
    atomicAdd(&gas[now-1u].inherited,1u);atomicMin(&gas[now-1u].oldRootMin,old);atomicMax(&gas[now-1u].oldRootMax,old);
  }else if(old==0u && now>0u){
    let amount=encodeVolume(max(0.0,min((1.0-history[c].fraction)*cfg.dx*cfg.dx,localAirArea(c))));
    atomicAdd(&gas[now-1u].amount,amount);atomicAdd(&gas[now-1u].integratedVolume,amount);
    atomicOr(&gas[now-1u].inherited,0x80000000u);atomicAdd(&gas[cfg.cells].overlap,amount);
  }
}
@compute @workgroup_size(128)
fn balanceAmounts(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || labels[c].previous!=c+1u || history[c].volume<=0){return;}
  let amount=history[c].amount;atomicAdd(&gas[cfg.cells].volume,amount);
  let dest=atomicLoad(&gas[c].destination);
  if(dest==NONE){atomicAdd(&gas[cfg.cells].flux,amount);return;}
  let remainder=amount-atomicLoad(&gas[c].allocatedAmount);
  let volumeRemainder=history[c].volume-atomicLoad(&gas[c].allocatedVolume);
  if(dest==0u){atomicAdd(&gas[cfg.cells].diagonal,remainder);return;}
  atomicAdd(&gas[dest-1u].amount,remainder);atomicAdd(&gas[dest-1u].integratedVolume,volumeRemainder);
}
@compute @workgroup_size(128)
fn initializeGas(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || atomicLoad(&labels[c].current)!=c+1u){return;}
  let volume=f32(atomicLoad(&gas[c].volume))/cfg.volumeScale;
  var amount=f32(atomicLoad(&gas[c].amount))/cfg.volumeScale;
  var integrated=f32(atomicLoad(&gas[c].integratedVolume))/cfg.volumeScale;
  if(atomicLoad(&gas[cfg.cells].inherited)==0u){
    amount=volume;integrated=volume;atomicStore(&gas[c].amount,encodeVolume(amount));
    atomicAdd(&gas[cfg.cells].overlap,encodeVolume(amount));
  }
  if(integrated<=0.0){integrated=volume;}
  // Keep the discrepancy visible before anchoring pressure to the cavity
  // occupied by this gas in the current particle/solid geometry.
  atomicAdd(&gas[cfg.cells].integratedVolume,encodeVolume(abs(volume-integrated)));
  if(GEOMETRIC_GAS){integrated=volume;}
  atomicStore(&gas[c].integratedVolume,encodeVolume(integrated));
  atomicAdd(&gas[cfg.cells].amount,atomicLoad(&gas[c].amount));
  var p=cfg.minimum;
  if(amount>0.0){
    let minRoot=atomicLoad(&gas[c].oldRootMin);let maxRoot=atomicLoad(&gas[c].oldRootMax);
    p=cfg.atmosphere*amount/max(integrated,1.0e-8)-cfg.atmosphere;
    if(!GEOMETRIC_GAS && minRoot>0u && minRoot!=NONE && minRoot==maxRoot && (atomicLoad(&gas[c].inherited)&0x80000000u)==0u){p=history[minRoot-1u].pressure;}
  }else{atomicStore(&gas[c].vapor,1u);atomicAdd(&gas[cfg.cells].vapor,1u);}
  let absolute=max(cfg.atmosphere+cfg.minimum,cfg.atmosphere+p);
  let compliance=select(integrated/max(absolute,1.0e-8),0.0,amount<=0.0);
  cells[c].rhs=compliance*p;cells[c].diagonal=compliance;cells[c].pad=p;
  inputP[c]=vec4<f32>(p,0.0,0.0,0.0);
}
@compute @workgroup_size(128)
fn initializeWater(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=1u){return;}
  let compliance=cells[c].fraction*accessibleArea(c)/(cfg.rho*cfg.sound*cfg.sound);
  // Persisted final MAC transport velocity excludes the current body-force impulse.
  let backX=f32(c%cfg.width)-inputP[c].y*grid.dt/cfg.dx;
  let backY=f32(c/cfg.width)-inputP[c].z*grid.dt/cfg.dx;
  let old=oldPressure(c,backX,backY);cells[c].pad=old;
  var rhs=compliance*old;var diagonal=compliance;
  for(var d=0u;d<4u;d=d+1u){
    let n=neighbor(c,d);let w=grid.dt*grid.dt*conductance(c,n,d);
    let sign=select(-1.0,1.0,d==1u || d==3u);
    let flux=sign*faceFlux(c,n,d,false);
    rhs=rhs-grid.dt*flux;diagonal=diagonal+w;
    if(n!=NONE && cells[n].kind==2u){
      let r=atomicLoad(&labels[n].current);
      if(r>0u && r!=NONE){
        atomicAdd(&gas[r-1u].diagonal,fixed(w,diagonalScale(r-1u)));
        atomicAdd(&gas[r-1u].flux,fixed(grid.dt*sign*cfg.dx*faceOpen(c,n,d)*faceVelocity(c,n,d),fluxScale(r-1u)));
      }
    }
  }
  cells[c].rhs=rhs;cells[c].diagonal=diagonal;
  inputP[c]=vec4<f32>(old,0.0,0.0,0.0);
}
@compute @workgroup_size(128)
fn countInterfaces(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  if(cells[c].kind==1u){
    for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);
      if(n!=NONE && cells[n].kind==2u){let r=atomicLoad(&labels[n].current);
        if(r>0u && r!=NONE){atomicAdd(&gas[r-1u].pad,1);}
      }
    }
  }else if(cells[c].kind==2u){
    let r=atomicLoad(&labels[c].current);if(r==0u || r==NONE){return;}
    for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);
      if(faceOpen(c,n,d)<1.0){atomicAdd(&gas[r-1u].pad,1);}
    }
  }
}
@compute @workgroup_size(128)
fn gasWallFlux(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=2u){return;}
  let r=atomicLoad(&labels[c].current);if(r==0u || r==NONE){return;}
  for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);
    if(faceOpen(c,n,d)<1.0){
      let sign=select(-1.0,1.0,d==1u || d==3u);
      let delta=grid.dt*sign*cfg.dx*(1.0-faceOpen(c,n,d))*wallFaceVelocity(c,n,d);
      atomicAdd(&gas[r-1u].flux,fixed(-delta,fluxScale(r-1u)));
      atomicAdd(&gas[r-1u].solvedVolume,encodeVolume(delta));
    }
  }
}
@compute @workgroup_size(1)
fn clearPressureBound(){atomicStore(&gas[cfg.cells+1u].overlap,0);}
var<workgroup> pressureBounds:array<i32,128>;
@compute @workgroup_size(128)
fn measurePressure(@builtin(global_invocation_id) id:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>){
  var bound=0;if(id.x<cfg.cells){bound=bitcast<i32>(abs(inputP[id.x].x));}
  pressureBounds[local.x]=bound;workgroupBarrier();
  for(var stride=64u;stride>0u;stride=stride/2u){
    if(local.x<stride){pressureBounds[local.x]=max(pressureBounds[local.x],pressureBounds[local.x+stride]);}
    workgroupBarrier();
  }
  if(local.x==0u){atomicMax(&gas[cfg.cells+1u].overlap,pressureBounds[0]);}
}
@compute @workgroup_size(128)
fn waterJacobi(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  if(cells[c].kind!=1u){outputP[c]=inputP[c];return;}
  var sum=0.0;
  for(var d=0u;d<4u;d=d+1u){
    let n=neighbor(c,d);let w=grid.dt*grid.dt*conductance(c,n,d);
    sum=sum+w*pressure(n);
    if(n!=NONE && cells[n].kind==2u){let r=atomicLoad(&labels[n].current);
      if(r>0u && r!=NONE){atomicAdd(&gas[r-1u].neighbors,fixed(w*inputP[c].x,neighborScale(r-1u)));}
    }
  }
  let p=max(cfg.minimum,(cells[c].rhs+sum)/max(cells[c].diagonal,1.0e-12));
  outputP[c]=vec4<f32>(p,0.0,0.0,0.0);
}
// The four-face water stencil is bipartite. A color reads only the other
// color, whose values stay fixed throughout this dispatch. Gas is held
// fixed until both colors finish, so there are no simultaneous read/writes.
fn waterColor(c:u32,color:u32){
  if(c>=cfg.cells || cells[c].kind!=1u || (c%cfg.width+c/cfg.width)%2u!=color){return;}
  let old=inputP[c].x;var sum=0.0;
  for(var d=0u;d<4u;d=d+1u){
    let n=neighbor(c,d);let w=grid.dt*grid.dt*conductance(c,n,d);
    sum=sum+w*pressure(n);
    if(n!=NONE && cells[n].kind==2u){let r=atomicLoad(&labels[n].current);
      if(r>0u && r!=NONE){atomicAdd(&gas[r-1u].neighbors,fixed(w*old,neighborScale(r-1u)));}
    }
  }
  inputP[c]=vec4<f32>(max(cfg.minimum,(cells[c].rhs+sum)/max(cells[c].diagonal,1.0e-12)),0.0,0.0,0.0);
}
@compute @workgroup_size(128)
fn waterRed(@builtin(global_invocation_id) id:vec3<u32>){waterColor(id.x,0u);}
@compute @workgroup_size(128)
fn waterBlack(@builtin(global_invocation_id) id:vec3<u32>){waterColor(id.x,1u);}
@compute @workgroup_size(128)
fn gasJacobi(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || atomicLoad(&labels[c].current)!=c+1u){return;}
  let diagonal=cells[c].diagonal+f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
  let rhs=cells[c].rhs+f32(atomicLoad(&gas[c].flux))/fluxScale(c);
  let sum=f32(atomicLoad(&gas[c].neighbors))/neighborScale(c);
  var p=cfg.minimum;if(atomicLoad(&gas[c].vapor)==0u){p=max(cfg.minimum,(rhs+sum)/max(diagonal,1.0e-12));}
  if(VAPOR_CLOSURE && atomicLoad(&gas[c].vapor)>0u){
    // Vapor can collapse completely. At positive volume it stays at the
    // pressure floor; once closed, pressure rises to keep volume nonnegative.
    let k=f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
    let flux=f32(atomicLoad(&gas[c].flux))/fluxScale(c);
    let volume=f32(atomicLoad(&gas[c].integratedVolume))/cfg.volumeScale;
    p=max(cfg.minimum,(flux+sum-volume)/max(k,1.0e-12));
  }
  if(NONLINEAR_GAS && atomicLoad(&gas[c].amount)>0){
    // Isothermal gas: (V - F - S + K*p)*(atmosphere+p)=atmosphere*amount.
    // Solve in gauge pressure without subtracting two room-sized pressures.
    // The stable root also avoids the linear compliance approximation for a
    // pocket compressed substantially in one step.
    let k=f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
    let amount=f32(atomicLoad(&gas[c].amount))/cfg.volumeScale;
    let base=f32(atomicLoad(&gas[c].integratedVolume))/cfg.volumeScale;
    let flux=f32(atomicLoad(&gas[c].flux))/fluxScale(c)+sum;
    let b=base-flux+k*cfg.atmosphere;
    let constant=cfg.atmosphere*((base-amount)-flux);
    var candidate=0.0;
    if(k<=1.0e-20){candidate=-constant/max(b,1.0e-20);}
    else{
      let discriminant=sqrt(max(0.0,b*b-4.0*k*constant));
      if(b>=0.0){candidate=-2.0*constant/max(b+discriminant,1.0e-20);}
      else{candidate=(discriminant-b)/(2.0*k);}
    }
    p=max(cfg.minimum,candidate);
  }
  if(RED_BLACK){inputP[c]=vec4<f32>(p,0.0,0.0,0.0);}
  else{outputP[c]=vec4<f32>(p,0.0,0.0,0.0);}
  atomicStore(&gas[c].neighbors,0);
}
fn projectedFace(c:u32,n:u32,d:u32)->f32 {
  let velocity=faceVelocity(c,n,d);
  if(faceOpen(c,n,d)==0.0){return wallFaceVelocity(c,n,d);}
  let sign=select(-1.0,1.0,d==1u || d==3u);
  return velocity-sign*grid.dt*(pressure(n)-pressure(c))/(cfg.rho*cfg.dx);
}
// The fine-grid provisional velocity has not yet enforced impermeability.
// Include that missing wall impulse in the additive reconstruction; otherwise
// a basal hydrostatic cell retains half of the provisional gravity impulse.
fn faceCorrection(c:u32,n:u32,d:u32)->f32 {
  let open=faceOpen(c,n,d);
  var provisional=select(cells[c].u,cells[c].v,d>=2u);
  if(n!=NONE && cells[n].kind==1u){provisional=faceVelocity(c,n,d);}
  // Fine nodes carry fluid velocity, not face-area-averaged volume flux.
  // Open area belongs in the pressure operator and flux budget. Multiplying
  // this correction by it would brake uniform tangential motion in cut cells.
  if(open>0.0){return projectedFace(c,n,d)-faceVelocity(c,n,d);}
  return wallFaceVelocity(c,n,d)-provisional;
}
@compute @workgroup_size(128)
fn finish(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  var u=0.0;var v=0.0;var residual=0.0;
  if(cells[c].kind==1u){
    u=(faceCorrection(c,neighbor(c,0u),0u)+faceCorrection(c,neighbor(c,1u),1u))*0.5;
    v=(faceCorrection(c,neighbor(c,2u),2u)+faceCorrection(c,neighbor(c,3u),3u))*0.5;
    var sum=0.0;for(var d=0u;d<4u;d=d+1u){let n=neighbor(c,d);let w=grid.dt*grid.dt*conductance(c,n,d);
      sum=sum+w*pressure(n);
      if(n!=NONE && cells[n].kind==2u){let r=atomicLoad(&labels[n].current);
        if(r>0u && r!=NONE){
          let sign=select(-1.0,1.0,d==1u || d==3u);
          let gasVolumeDelta=-grid.dt*sign*cfg.dx*faceOpen(c,n,d)*projectedFace(c,n,d);
          atomicAdd(&gas[r-1u].solvedVolume,encodeVolume(gasVolumeDelta));
          atomicAdd(&gas[r-1u].neighbors,fixed(w*inputP[c].x,neighborScale(r-1u)));
        }
      }
    }
    residual=cells[c].diagonal*inputP[c].x-sum-cells[c].rhs;
    if(inputP[c].x<=cfg.minimum+0.01){atomicAdd(&gas[cfg.cells].neighbors,encodeVolume(max(0.0,residual)));}
    let violation=select(abs(residual),max(0.0,-residual),inputP[c].x<=cfg.minimum+0.01);
    atomicMax(&gas[cfg.cells+1u].solvedVolume,bitcast<i32>(violation/max(cells[c].diagonal,1.0e-20)));
  }
  let p=pressure(c);
  if(cells[c].kind==1u){
    inputP[c].y=(projectedFace(c,neighbor(c,0u),0u)+projectedFace(c,neighbor(c,1u),1u))*0.5;
    inputP[c].z=(projectedFace(c,neighbor(c,2u),2u)+projectedFace(c,neighbor(c,3u),3u))*0.5;
  }
  outputP[c]=vec4<f32>(p,u,v,residual);
  cells[c].residual=residual;
  history[c].pressure=p;history[c].fraction=1.0-localAirArea(c)/(cfg.dx*cfg.dx);history[c].airRoot=airRoot(c);
  phaseSet(c,3u,bitcast<u32>(accessibleArea(c)));
  if(atomicLoad(&labels[c].current)!=c+1u){history[c].amount=0;history[c].volume=0;history[c].vapor=0u;history[c].eosError=0.0;}
}
@compute @workgroup_size(128)
fn finishGas(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || atomicLoad(&labels[c].current)!=c+1u){return;}
  let p=inputP[c].x;
  var diagonal=cells[c].diagonal+f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
  let rhs=cells[c].rhs+f32(atomicLoad(&gas[c].flux))/fluxScale(c);
  let neighbors=f32(atomicLoad(&gas[c].neighbors))/neighborScale(c);
  var residual=diagonal*p-neighbors-rhs;
  if(NONLINEAR_GAS && atomicLoad(&gas[c].amount)>0){
    let k=f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
    let a=cfg.atmosphere*f32(atomicLoad(&gas[c].amount))/cfg.volumeScale;
    let absolute=max(cfg.atmosphere+p,1.0e-8);
    residual=f32(atomicLoad(&gas[c].integratedVolume)-atomicLoad(&gas[c].amount))/cfg.volumeScale
      -f32(atomicLoad(&gas[c].flux))/fluxScale(c)-neighbors+k*p+(a/cfg.atmosphere)*p/absolute;
    diagonal=k+a/(absolute*absolute);
  }
  if(VAPOR_CLOSURE && atomicLoad(&gas[c].vapor)>0u){
    diagonal=f32(atomicLoad(&gas[c].diagonal))/diagonalScale(c);
    residual=f32(atomicLoad(&gas[c].integratedVolume))/cfg.volumeScale
      -f32(atomicLoad(&gas[c].flux))/fluxScale(c)-neighbors+diagonal*p;
  }
  if(atomicLoad(&gas[c].vapor)==0u || VAPOR_CLOSURE){
    let violation=select(abs(residual),max(0.0,-residual),p<=cfg.minimum+0.01);
    atomicMax(&gas[cfg.cells+1u].solvedVolume,bitcast<i32>(violation/max(diagonal,1.0e-20)));
  }
  var volume=atomicLoad(&gas[c].integratedVolume)+atomicLoad(&gas[c].solvedVolume);
  if(volume<=0){atomicAdd(&gas[cfg.cells].solvedVolume,1);volume=1;}
  history[c].amount=atomicLoad(&gas[c].amount);history[c].volume=volume;
  history[c].geometricVolume=f32(atomicLoad(&gas[c].volume))/cfg.volumeScale;
  history[c].vapor=atomicLoad(&gas[c].vapor);
  var error=0.0;
  if(history[c].amount>0){error=(cfg.atmosphere+p)*f32(volume)/(cfg.atmosphere*f32(history[c].amount))-1.0;}
  history[c].eosError=error;cells[c].residual=residual;outputP[c].w=residual;
  atomicStore(&gas[c].neighbors,0);
}
@compute @workgroup_size(128)
fn certifyExpansion(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells || cells[c].kind!=1u){return;}
  if(inputP[c].x<=cfg.minimum+0.01 && bitcast<f32>(atomicLoad(&gas[cfg.cells+1u].solvedVolume))<=cfg.pad0){
    setPhaseExpansion(c,phaseExpansion(c)+max(0.0,cells[c].residual));
  }else{
    atomicAdd(&gas[cfg.cells+1u].amount,encodeVolume(phaseExpansion(c)));setPhaseExpansion(c,0.0);
  }
}
@compute @workgroup_size(1)
fn finishDiagnostics(){atomicStore(&gas[cfg.cells].inherited,1u);}
fn nativeProvisionalFace(c:u32,n:u32,d:u32)->f32 {
  // Native grid velocities have not received the wall projection. The
  // pressure flux uses an impermeable wall already, but particle transport
  // must still subtract the native normal velocity at that same face.
  if(faceOpen(c,n,d)==0.0){
    var v=select(cells[c].u,cells[c].v,d>=2u);
    if(n!=NONE && cells[n].kind==1u){v=faceVelocity(c,n,d);}
    return v;
  }
  return faceVelocity(c,n,d);
}
@compute @workgroup_size(128)
fn publishTransport(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=cfg.cells){return;}
  var faces=vec4<f32>(0.0);
  if(cells[c].kind==1u){
    faces=vec4<f32>(projectedFace(c,neighbor(c,0u),0u),projectedFace(c,neighbor(c,1u),1u),
      projectedFace(c,neighbor(c,2u),2u),projectedFace(c,neighbor(c,3u),3u));
  }
  outputP[c*3u]=faces;
  var closed=0u;
  for(var d=0u;d<4u;d=d+1u){if(faceOpen(c,neighbor(c,d),d)==0.0){closed=closed|(1u<<d);}}
  outputP[c*3u+1u]=vec4<f32>(f32(cells[c].kind),geometry[c].volume.x,f32(closed),0.0);
  outputP[c*3u+2u]=vec4<f32>(nativeProvisionalFace(c,neighbor(c,0u),0u),nativeProvisionalFace(c,neighbor(c,1u),1u),
    nativeProvisionalFace(c,neighbor(c,2u),2u),nativeProvisionalFace(c,neighbor(c,3u),3u));
}
fn transferredFace(c:u32,n:u32,d:u32)->f32 {
  if(cfg.pad1>0.5){return projectedFace(c,n,d);}
  return faceCorrection(c,n,d);
}
fn staggeredCorrection(ix:i32,iy:i32,vertical:bool)->f32 {
  if(vertical){
    if(ix<0 || ix>=i32(cfg.width) || iy<0 || iy>i32(cfg.height)){return 0.0;}
    let top=index(ix,iy-1);let bottom=index(ix,iy);
    if(bottom!=NONE && cells[bottom].kind==1u){return transferredFace(bottom,top,2u);}
    if(top!=NONE && cells[top].kind==1u){return transferredFace(top,bottom,3u);}
  }else{
    if(ix<0 || ix>i32(cfg.width) || iy<0 || iy>=i32(cfg.height)){return 0.0;}
    let left=index(ix-1,iy);let right=index(ix,iy);
    if(right!=NONE && cells[right].kind==1u){return transferredFace(right,left,0u);}
    if(left!=NONE && cells[left].kind==1u){return transferredFace(left,right,1u);}
  }return 0.0;
}
fn representedFace(ix:i32,iy:i32,vertical:bool)->bool {
  if(vertical){
    if(ix<0 || ix>=i32(cfg.width) || iy<0 || iy>i32(cfg.height)){return false;}
    let top=index(ix,iy-1);let bottom=index(ix,iy);
    return (bottom!=NONE && cells[bottom].kind==1u) || (top!=NONE && cells[top].kind==1u);
  }
  if(ix<0 || ix>i32(cfg.width) || iy<0 || iy>=i32(cfg.height)){return false;}
  let left=index(ix-1,iy);let right=index(ix,iy);
  return (right!=NONE && cells[right].kind==1u) || (left!=NONE && cells[left].kind==1u);
}
fn sampleCorrection(x:f32,y:f32,vertical:bool)->vec2<f32> {
  let bx=i32(floor(x));let by=i32(floor(y));let f=fract(vec2<f32>(x,y));
  var sum=0.0;var weight=0.0;
  for(var dy=0;dy<2;dy=dy+1){for(var dx=0;dx<2;dx=dx+1){
    let ix=bx+dx;let iy=by+dy;
    // Populated B-spline nodes may lie inside a solid or air cell. Extend
    // represented fluid corrections into their support instead of blending
    // them with absent zero-valued faces and diluting the wall/body impulse.
    if(!representedFace(ix,iy,vertical)){continue;}
    let w=select(1.0-f.x,f.x,dx==1)*select(1.0-f.y,f.y,dy==1);
    sum=sum+w*staggeredCorrection(ix,iy,vertical);weight=weight+w;
  }}return vec2<f32>(sum/max(weight,1.0e-8),weight);
}
@compute @workgroup_size(128)
fn applyVelocity(@builtin(global_invocation_id) id:vec3<u32>){
  let c=id.x;if(c>=grid.cells || mass[c]<=0){return;}
  let x=(f32(c%grid.width)+f32(bitcast<i32>(grid.originX))+0.5)/grid.invCell/cfg.dx;
  let y=(f32(c/grid.width)+f32(bitcast<i32>(grid.originY))+0.5)/grid.invCell/cfg.dx;
  // Keep MAC staggering through the transfer. Averaging to cell centers first
  // would erase the checkerboard pressure mode despite a converged solve.
  let sx=sampleCorrection(x,y-0.5,false);
  let sy=sampleCorrection(x-0.5,y,true);
  let u=sx.x*grid.dt*grid.invCell;
  let v=sy.x*grid.dt*grid.invCell;
  if(cfg.pad1>0.5){
    // Use the velocity whose flux the pressure solve constrained. Adding only
    // its correction to the fine grid leaves unresolved compression modes.
    // Unrepresented spray keeps its native ballistic velocity and gravity.
    if(sx.y>0.0){gridU[c]=u;}
    if(sy.y>0.0){gridV[c]=v;}
  }else{gridU[c]=gridU[c]+u;gridV[c]=gridV[c]+v;}
}
`;

  var TRANSPORT_DECLARATIONS = /* wgsl */ `
struct TransportConfig {width:u32,height:u32,cells:u32,iterations:u32,dx:f32,rho:f32,sound:f32,atmosphere:f32,
 minimum:f32,threshold:f32,volumeScale:f32,diagonalScale:f32,fluxScale:f32,neighborScale:f32,pad0:f32,pad1:f32};
@group(0) @binding(10) var<storage,read> flow:array<vec4<f32>>;
@group(0) @binding(11) var<uniform> tc:TransportConfig;
fn transportCell(p:vec2<f32>)->u32 {
  let c=vec2<i32>(floor(p/tc.dx));
  if(c.x<0 || c.y<0 || c.x>=i32(tc.width) || c.y>=i32(tc.height)){return 0xffffffffu;}
  return u32(c.y)*tc.width+u32(c.x);
}
const BOUNDARY_RECONSTRUCTION:bool=false;
// A fine-scale residual must have zero normal component at a closed face.
// Interior bubble functions retain the native density response while making
// the reconstructed field, not just its coarse average, obey the wall.
fn boundaryShape(f:f32,closed:u32,axis:u32)->vec2<f32> {
  let lo=(closed&(1u<<axis))!=0u;let hi=(closed&(2u<<axis))!=0u;
  if(lo && hi){return vec2<f32>(4.0*f*(1.0-f),4.0*(1.0-2.0*f)/tc.dx);}
  if(lo){return vec2<f32>(f,1.0/tc.dx);}
  if(hi){return vec2<f32>(1.0-f,-1.0/tc.dx);}
  return vec2<f32>(1.0,0.0);
}
fn transportVelocity(p:vec2<f32>,fallback:vec2<f32>)->vec2<f32> {
  let c=transportCell(p);if(c==0xffffffffu || (flow[c*3u+1u].x!=1.0 || flow[c*3u+1u].y>0.0)){return fallback;}
  let f=fract(p/tc.dx);let v=flow[c*3u];let provisional=flow[c*3u+2u];
  if(!BOUNDARY_RECONSTRUCTION){return fallback+vec2<f32>(mix(v.x-provisional.x,v.y-provisional.y,f.x),mix(v.z-provisional.z,v.w-provisional.w,f.y));}
  let closed=u32(flow[c*3u+1u].z);
  let shape=vec2<f32>(boundaryShape(f.x,closed,0u).x,boundaryShape(f.y,closed,2u).x);
  let projected=vec2<f32>(mix(v.x,v.y,f.x),mix(v.z,v.w,f.y));
  let prior=vec2<f32>(mix(provisional.x,provisional.y,f.x),mix(provisional.z,provisional.w,f.y));
  return projected+shape*(fallback-prior);
}
fn transportAffine(p:vec2<f32>,fallback:vec2<f32>,native:vec4<f32>,dt:f32)->vec4<f32> {
  let c=transportCell(p);if(c==0xffffffffu || flow[c*3u+1u].x!=1.0 || flow[c*3u+1u].y>0.0){return native;}
  let f=fract(p/tc.dx);let v=flow[c*3u];let prior=flow[c*3u+2u];
  let projectedGradient=vec2<f32>(v.y-v.x,v.w-v.z)/tc.dx;
  let priorGradient=vec2<f32>(prior.y-prior.x,prior.w-prior.z)/tc.dx;
  if(!BOUNDARY_RECONSTRUCTION){return native+vec4<f32>(projectedGradient.x-priorGradient.x,0.0,0.0,projectedGradient.y-priorGradient.y)*dt;}
  let closed=u32(flow[c*3u+1u].z);let sx=boundaryShape(f.x,closed,0u);let sy=boundaryShape(f.y,closed,2u);
  let residual=fallback-vec2<f32>(mix(prior.x,prior.y,f.x),mix(prior.z,prior.w,f.y));
  return vec4<f32>(sx.x*native.x+(projectedGradient.x-sx.x*priorGradient.x+sx.y*residual.x)*dt,
    sx.x*native.y,sy.x*native.z,
    sy.x*native.w+(projectedGradient.y-sy.x*priorGradient.y+sy.y*residual.y)*dt);
}
`;
  var TRANSPORT_GATHER = /* wgsl */ `
  var vx=0.0;var vy=0.0;var gv00=0.0;var gv01=0.0;var gv10=0.0;var gv11=0.0;
  // The native grid remains the fallback for free spray outside the pressure support.
  for(var s=0u;s<9u;s=s+1u){
    let value=vec2<f32>(cellVelX[nbr[s]],cellVelY[nbr[s]])*wgt[s];
    let off=vec2<f32>(f32(s%3u)-1.0,f32(s/3u)-1.0);
    vx=vx+value.x;vy=vy+value.y;
    gv00=gv00+value.x*off.x;gv01=gv01+value.x*off.y;
    gv10=gv10+value.y*off.x;gv11=gv11+value.y*off.y;
  }
  let nativeVelocity=vec2<f32>(vx,vy)/(gp.stepDt*gp.invCell);
  let atStart=transportVelocity(pp.xy,nativeVelocity);
  let atMid=transportVelocity(pp.xy+0.5*gp.stepDt*atStart,nativeVelocity);
  let originalVx=vx;let originalVy=vy;
  vx=atMid.x*gp.stepDt*gp.invCell;vy=atMid.y*gp.stepDt*gp.invCell;
  // Carry fine native pressure/affine modes and add the coarse correction.
  gv00=gv00+(originalVx-vx)*ddx;gv01=gv01+(originalVx-vx)*ddy;
  gv10=gv10+(originalVy-vy)*ddx;gv11=gv11+(originalVy-vy)*ddy;
  // The native suffix reconstructs C = 4 * (g + v * dd). Use the
  // analytic derivative of the same field used for particle advection.
  let nativeAffine=4.0*vec4<f32>(gv00+vx*ddx,gv01+vx*ddy,gv10+vy*ddx,gv11+vy*ddy);
  let corrected=transportAffine(pp.xy,nativeVelocity,nativeAffine,gp.stepDt);
  gv00=corrected.x*0.25-vx*ddx;gv01=corrected.y*0.25-vx*ddy;
  gv10=corrected.z*0.25-vy*ddx;gv11=corrected.w*0.25-vy*ddy;
`;
  var TERRAIN_NORMAL_RESPONSE = /* wgsl */ `
  var moveHit = false;
  var moveHitX = false;
  var moveHitY = false;
  let intendedX = x;
  let intendedY = y;
  let moveDX = x - prevX;
  let moveDY = y - prevY;
  let moveDist = sqrt(moveDX * moveDX + moveDY * moveDY);
  if (moveDist > 0.001) {
    let moveStep = max(0.75, r * 0.75);
    let moveN = min(128.0, max(1.0, ceil(moveDist / moveStep)));
    var moveI : f32 = 1.0;
    var clearX = prevX;
    var clearY = prevY;
    loop {
      if (moveI > moveN) { break; }
      let mt = moveI / moveN;
      let sampleX = prevX + moveDX * mt;
      let sampleY = prevY + moveDY * mt;
      if (solidRing(sampleX, sampleY, r)) {
        moveHitX = terrainSolidAt(sampleX-r,sampleY) || terrainSolidAt(sampleX+r,sampleY);
        moveHitY = terrainSolidAt(sampleX,sampleY-r) || terrainSolidAt(sampleX,sampleY+r);
        x = clearX;
        y = clearY;
        moveHit = true;
        break;
      }
      clearX = sampleX;
      clearY = sampleY;
      moveI = moveI + 1.0;
    }
  } else if (solidRing(x, y, r)) {
    moveHitX = terrainSolidAt(x-r,y) || terrainSolidAt(x+r,y);
    moveHitY = terrainSolidAt(x,y-r) || terrainSolidAt(x,y+r);
    x = prevX;
    y = prevY;
    moveHit = true;
  }

  // On a hit: reflect velocity, bump aeration, then nudge only if the
  // rollback/last-clear point was already embedded by moving geometry.
  if (moveHit) {
    if(moveHitX){vx=vx*(-bounce);}
    if(moveHitY){vy=vy*(-bounce);}
    if(!moveHitX && !moveHitY){vx=vx*(-bounce);vy=vy*(-bounce);}
    aux[i].y = min(1.0, auxv.y + 0.12);
    if (solidRing(x, y, r) && !minerContains(vec2<f32>(x, y), r)) {
      // Keep the native direction order. The offset must exceed the radius
      // to recover a center immediately beside a wall, with f32 clearance.
      var nudged = false;
      let step = r + 0.0625;
      var nx : f32; var ny : f32;
      // (0,-1)
      if (!nudged) { nx = x; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,0)
      if (!nudged) { nx = x - step; ny = y;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,0)
      if (!nudged) { nx = x + step; ny = y;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (0,1)
      if (!nudged) { nx = x; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,-1)
      if (!nudged) { nx = x - step; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,-1)
      if (!nudged) { nx = x + step; ny = y - step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (-1,1)
      if (!nudged) { nx = x - step; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
      // (1,1)
      if (!nudged) { nx = x + step; ny = y + step;
        if (!solidRing(nx, ny, r)) { x = nx; y = ny; nudged = true; } }
    }
  }

  // A secondary wall can block the tangent after the first normal contact.
  // Sweep to its last clear point and respond on that axis too. Retaining a
  // velocity whose displacement was discarded stores gravity at pinned corners.
  if (moveHit && (moveHitX != moveHitY) && !solidRing(x, y, r)) {
    let tangentX = select(0.0, intendedX - x, moveHitY);
    let tangentY = select(0.0, intendedY - y, moveHitX);
    let tangentDist = length(vec2<f32>(tangentX, tangentY));
    let tangentN = min(128.0, max(1.0, ceil(tangentDist / max(0.75, r * 0.75))));
    let startX = x;
    let startY = y;
    var tangentI = 1.0;
    loop {
      if (tangentI > tangentN) { break; }
      let t = tangentI / tangentN;
      let tx = startX + tangentX * t;
      let ty = startY + tangentY * t;
      if (solidRing(tx, ty, r)) {
        if (moveHitY) { vx = vx * (-bounce); }
        if (moveHitX) { vy = vy * (-bounce); }
        break;
      }
      x = tx;
      y = ty;
      tangentI = tangentI + 1.0;
    }
  }
  // Moving geometry may leave no clear local recovery. A constrained parcel
  // cannot carry a growing velocity while its position remains blocked.
  if (moveHit && solidRing(x, y, r) && !minerContains(vec2<f32>(x, y), r)) {
    vx = 0.0;
    vy = 0.0;
  }

  if (minerContains(vec2<f32>(x, y), r)) {
    let projected = projectMiner(vec2<f32>(x, y), vec2<f32>(vx, vy), r);
    x = projected.x; y = projected.y; vx = projected.z; vy = projected.w;
    flag[i] = fl & 0xff00004fu; // preserve liquid identity/heat; clear rest/sleep
  }

`;

  function create(instance, options) {
    options = options || {};
    var directTransport = options.directGather === true && options.macTransfer !== true;
    var collapseEmptyCells = directTransport && options.collapseEmptyCells === true;
    if (!instance || !instance.device || !instance.buf) throw new Error('Air model needs a ready liquid device.');
    var device = instance.device;
    if (device.limits.maxStorageBuffersPerShaderStage < 10) throw new Error('Air model needs ten storage buffers.');
    var dx = options.cellSize || instance.cellSize * 2;
    var pitchRatio = dx / instance.cellSize;
    if (!(dx >= instance.cellSize) || !directTransport && !Number.isInteger(pitchRatio))
      throw new Error('Air cell size must resolve the native grid; fractional ratios require direct transport.');
    var width = Math.ceil(options.width / dx);
    var height = Math.ceil(options.height / dx);
    var count = width * height;
    if (!(count > 0 && count < 500000)) throw new Error('Air pressure domain is outside its size limit.');
    var iterations = Math.max(4, Math.min(512, options.iterations || 64));
    var redBlack = options.redBlack === true;
    if (iterations % 2) iterations++;
    var buffers = [];
    function storage(label, size) {
      var b = device.createBuffer({label:'liquid.air.' + label, size:size,
        usage:GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC});
      buffers.push(b); return b;
    }
    var config = device.createBuffer({label:'liquid.air.config',size:64,
      usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    buffers.push(config);
    var configBytes = new ArrayBuffer(64);
    var ints = new Uint32Array(configBytes), floats = new Float32Array(configBytes);
    ints.set([width,height,count,iterations]);
    var volumeScale = Math.pow(2, Math.floor(Math.log2(Math.min(1024, 1e9 / (count * dx * dx * 4)))));
    if (!(volumeScale >= 1)) throw new Error('Air domain cannot retain adequate volume precision.');
    floats.set([dx,options.density || 1,options.soundSpeed || 500,options.atmospherePressure || 100000,
      options.minimumPressure === undefined ? -80000 : options.minimumPressure,
      options.waterThreshold || 0.45,volumeScale,Math.pow(2,36),Math.pow(2,24),Math.pow(2,24),options.pressureTolerance || .1,
      options.projectedVelocity === true && options.macTransfer !== true ? 1 : 0],4);
    if (!(floats[5] > 0 && floats[6] > 0 && floats[7] > 0 && floats[7] + floats[8] > 0 && floats[9] > 0 && floats[9] <= 1)) throw new Error('Invalid air physics settings.');
    instance.queue.writeBuffer(config,0,configBytes);
    var geometry = storage('geometry',count * 32);
    var fields = storage('cells',count * 32);
    var labels = storage('labels',count * 8);
    var history = storage('history',count * 32);
    var phaseOffset=(count+2)*64;
    var gasSize=phaseOffset+Math.ceil(count/4)*64;
    var gas = storage('gas',gasSize);
    var pressureA = storage('pressureA',count * 16);
    var pressureB = storage('pressureB',count * 16);
    var mac=null,materialInitialized=false,partialGeometryCells=0,staticFractions=null,dynamicBasisCells=0;
    if(options.macTransfer===true){
      if(!global.LiquidAirMAC)throw new Error('The isolated MAC helper is unavailable.');
      mac=global.LiquidAirMAC.create(instance,{width:width,height:height,dx:dx,config:config,geometry:geometry,cells:fields});
      buffers.push(mac.buffer,mac.terrainBuffer);
    }
    var shaderSource=SOURCE;
    if(redBlack)shaderSource=shaderSource.replace('const RED_BLACK:bool=false;', 'const RED_BLACK:bool=true;');
    if(options.nonlinearGas===true)shaderSource=shaderSource.replace('const NONLINEAR_GAS:bool=false;', 'const NONLINEAR_GAS:bool=true;');
    if(options.vaporClosure===true)shaderSource=shaderSource.replace('const VAPOR_CLOSURE:bool=false;', 'const VAPOR_CLOSURE:bool=true;');
    if(directTransport)shaderSource=shaderSource.replace('const ALIGNED_TRANSPORT:bool=false;', 'const ALIGNED_TRANSPORT:bool=true;');
    if(collapseEmptyCells)shaderSource=shaderSource.replace('const COLLAPSE_EMPTY_CELLS:bool=false;', 'const COLLAPSE_EMPTY_CELLS:bool=true;');
    if(options.geometricGas===true)shaderSource=shaderSource.replace('const GEOMETRIC_GAS:bool=false;', 'const GEOMETRIC_GAS:bool=true;');
    var shader = device.createShaderModule({label:'liquid.air.model',code:mac ? mac.source(shaderSource) : shaderSource});
    // Native parcels are mass points for this transport. Use the same wall
    // face as the pressure flux, rather than stopping their centers early.
    var terrainResponse=directTransport ? '{ let r = 0.0; \n'+TERRAIN_NORMAL_RESPONSE+'\n }' : TERRAIN_NORMAL_RESPONSE;
    var collisionOptions=directTransport ? {waterOnly:true,pointWater:true} : mac ? {guestSkinTolerance:0} : undefined;
    var collision = typeof instance.createTerrainCollisionPipeline === 'function'
      ? instance.createTerrainCollisionPipeline(terrainResponse,collisionOptions) : null;
    var entries = [{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}];
    for (var binding=2;binding<=11;binding++) entries.push({binding:binding,visibility:GPUShaderStage.COMPUTE,
      buffer:{type:binding===2 && !mac || binding===3 && mac || binding===5 ? 'read-only-storage' : 'storage'}});
    var layout = device.createBindGroupLayout({label:'liquid.air.layout',entries:entries});
    var pipelineLayout = device.createPipelineLayout({bindGroupLayouts:[layout]});
    var names = ['clearDiagnostics','prepare','connect','compress','collectPhase','classifyPhase','restartTopology','checkConnectivity','collectVolumes',
      'remapAmounts','balanceAmounts','initializeGas','countInterfaces','gasWallFlux','initializeWater','clearPressureBound',
      'measurePressure','waterJacobi','gasJacobi','finish','finishGas','certifyExpansion','finishDiagnostics','applyVelocity'];
    if(directTransport)names.push('publishTransport');
    if(mac)names.push('macDensities');
    if(redBlack)names.push('waterRed','waterBlack');
    var pipes = {};
    names.forEach(function (name) { pipes[name] = device.createComputePipeline({label:'liquid.air.'+name,
      layout:pipelineLayout,compute:{module:shader,entryPoint:name}}); });
    function group(input, output) {
      var bound=[config,instance.paramsBuf,mac ? mac.buffer : instance.buf.cellMass,mac ? mac.terrainBuffer : instance.buf.cellVelX,instance.buf.cellVelY,
        geometry,fields,labels,history,gas,input,output];
      return device.createBindGroup({layout:layout,entries:bound.map(function (buffer,i) {
        return {binding:i,resource:{buffer:buffer}};
      })});
    }
    var groups=[group(pressureA,pressureB),group(pressureB,pressureA)];
    var transport = directTransport ? storage('transport',count*48) : null;
    var transportGroup=transport ? group(pressureA,transport) : null;
    var directGather=transport ? instance.createPressureGatherPipeline({
      declarations:TRANSPORT_DECLARATIONS.replace('BOUNDARY_RECONSTRUCTION:bool=false','BOUNDARY_RECONSTRUCTION:bool='+String(options.boundaryReconstruction === true)),gather:TRANSPORT_GATHER,afterAffine:'',
      waterOnly:true,preserveGatherVelocity:true,preserveWorldPosition:true,
      bindings:[{type:'read-only-storage',buffer:transport},{type:'uniform',buffer:config}]
    }) : null;
    var geometryHost = new Float32Array(count * 8);
    var enabled = false, steps = 0, pending = false, snapshot = null, destroyed = false;
    var model = {
      width:width,height:height,cellSize:dx,iterations:iterations,geometryStride:8,redBlack:redBlack,
      settings:{density:floats[5],soundSpeed:floats[6],atmospherePressure:floats[7],minimumPressure:floats[8],threshold:floats[9],
        volumeScale:volumeScale,diagonalScale:floats[11],fluxScale:floats[12],neighborScale:floats[13],pressureTolerance:floats[14],
        particlePressure:!mac && options.particlePressure === true,projectedVelocity:floats[15]>0,directGather:!!directGather,collapseEmptyCells:collapseEmptyCells,geometricGas:options.geometricGas===true,boundaryReconstruction:options.boundaryReconstruction===true,nonlinearGas:options.nonlinearGas===true,vaporClosure:options.vaporClosure===true},
      buffers:{geometry:geometry,cells:fields,labels:labels,history:history,gas:gas,pressure:pressureA,phase:gas,mac:mac ? mac.buffer : null},phaseOffset:phaseOffset,
      enabled:false,particlePressure:!mac && options.particlePressure === true,
      frameGeometry:directTransport,
      nativeDomain:directTransport ? {minX:0,minY:0,maxX:options.width,maxY:options.height} : null,
      handlesGridBoundary:!!collision,collisionPipeline:collision ? collision.pipeline : null,
      collisionFallbackPipeline:collision ? collision.fallbackPipeline : null,
      preserveMaterialState:!!mac,gatherPipeline:directGather ? directGather.pipeline : mac && mac.gather ? mac.gather.pipeline : null,
      gatherBindGroup:directGather ? directGather.bindGroup : mac && mac.gather ? mac.gather.bindGroup : null,macStride:mac ? 16 : 0,
      macFaceRecords:mac ? mac.faceRecords : 0,macRecords:mac ? mac.records : 0,
      readyPromise:Promise.all([shader.getCompilationInfo(),collision ? collision.module.getCompilationInfo() : Promise.resolve({messages:[]}),
        mac ? mac.compilationInfo : Promise.resolve([]),directGather ? directGather.module.getCompilationInfo() : Promise.resolve({messages:[]})]).then(function (infos) {
        infos=infos.flat();
        var errors=infos.flatMap(function (info) {return info.messages.filter(function (m) {return m.type==='error';});});
        if (errors.length) throw new Error(errors.map(function (m) {return m.lineNum+': '+m.message;}).join('\n'));
        return true;
      }),
      setMinimumPressure:function(value){
        if(destroyed)throw new Error('The air model has been destroyed.');
        if(typeof value!=='number' || !Number.isFinite(value) || value>0 || !(floats[7]+value>0))
          throw new Error('Minimum pressure must be a finite nonpositive gauge pressure above vacuum.');
        var stored=Math.fround(value);
        if(!(floats[7]+stored>0))throw new Error('Minimum pressure rounds to vacuum.');
        // A queue-ordered settings write leaves material, topology, gas amount
        // and pressure history resident. Changing capacity does not reprime.
        floats[8]=stored;
        instance.queue.writeBuffer(config,32,floats,8,1);
        model.settings.minimumPressure=stored;
        return stored;
      },
      initializeMaterial:function(initialization){
        if(!mac)return Promise.resolve();
        return model.readyPromise.then(function(){
          if(typeof instance.prepareMaterialState==='function')instance.prepareMaterialState({reset:!!(initialization && initialization.reset)});
          if(instance.readbackPending)instance.readbackOpsInvalid=true;
          mac.initializeMaterial();return instance.queue.onSubmittedWorkDone();
        }).then(function(){
          materialInitialized=true;model.settings.constitutiveLaw='density-linear';model.settings.macTransfer=true;
        });
      },
      setEnabled:function (value) {
        if(value && mac && !materialInitialized)throw new Error('Initialize MAC material references before enabling.');
        enabled=!!value;model.enabled=enabled;
      },
      geometry:function (solid, room, velocityX, velocityY, faceOpen) {
        if (solid.length !== count || faceOpen && faceOpen.length !== count*4) throw new Error('Air geometry dimensions differ.');
        partialGeometryCells=0;dynamicBasisCells=0;
        for (var c=0;c<count;c++) {
          if(!(solid[c]>=0 && solid[c]<=1))throw new Error('Air solid coverage must be in [0, 1].');
          geometryHost[c*8]=solid[c];
          if(solid[c]>1e-6 && solid[c]<1-1e-6)partialGeometryCells++;
          if(staticFractions && Math.abs(solid[c]-staticFractions[c])>1e-6)dynamicBasisCells++;
          geometryHost[c*8+1]=velocityX ? velocityX[c] : 0;
          geometryHost[c*8+2]=velocityY ? velocityY[c] : 0;
          geometryHost[c*8+3]=room && room[c] ? 1 : 0;
          for(var d=0;d<4;d++){
            var x=c%width,y=Math.floor(c/width),n=d===0 ? (x ? c-1 : -1) : d===1 ? (x+1<width ? c+1 : -1)
              : d===2 ? (y ? c-width : -1) : (y+1<height ? c+width : -1);
            var open=faceOpen ? faceOpen[c*4+d] : n<0 || solid[c]>=.999999 || solid[n]>=.999999 ? 0 : 1;
            if(!(open>=0 && open<=1))throw new Error('Air face opening must be in [0, 1].');
            geometryHost[c*8+4+d]=open;
          }
        }
        instance.queue.writeBuffer(geometry,0,geometryHost);
      },
      geometryStaticTiles:function(walls,cols,rows,tile){
        if(!mac)throw new Error('Exact static kernel geometry requires MAC transfer.');
        tile=tile===undefined?8:tile;mac.geometryStaticTiles(walls,cols,rows,tile);
        staticFractions=new Float64Array(count);dynamicBasisCells=0;
        for(var y=0;y<height;y++)for(var x=0;x<width;x++){
          var area=0,x0=x*dx,y0=y*dx,x1=x0+dx,y1=y0+dx;
          for(var ty=Math.floor(y0/tile);ty<Math.ceil(y1/tile);ty++)for(var tx=Math.floor(x0/tile);tx<Math.ceil(x1/tile);tx++){
            if(tx<0||ty<0||tx>=cols||ty>=rows||walls[ty*cols+tx])area+=Math.max(0,Math.min(x1,(tx+1)*tile)-Math.max(x0,tx*tile))*Math.max(0,Math.min(y1,(ty+1)*tile)-Math.max(y0,ty*tile));
          }
          var c=y*width+x;staticFractions[c]=area/(dx*dx);
          if(Math.abs(geometryHost[c*8]-staticFractions[c])>1e-6)dynamicBasisCells++;
        }
      },
      encode:function (encoder) {
        if (!enabled || destroyed) return;
        if(mac)mac.before(encoder);
        // Sequential dispatches share storage dependencies, as in the legacy
        // pressure/update/boundary pass. Preserve their order while avoiding
        // hundreds of pass begin/end pairs per fixed step.
        var pass=encoder.beginComputePass({label:'liquid.air.step'});
        var boundParity=-1;
        function dispatch(name, parity, n) {
          parity=parity || 0;pass.setPipeline(pipes[name]);
          if(boundParity!==parity){pass.setBindGroup(0,groups[parity]);boundParity=parity;}
          pass.dispatchWorkgroups(Math.ceil((n || count)/128));
        }
        dispatch('clearDiagnostics',0,1);dispatch('prepare');
        for(var round=0;round<8;round++){dispatch('connect');dispatch('compress');}
        dispatch('collectPhase');dispatch('classifyPhase');dispatch('restartTopology');
        for(var round=0;round<8;round++){dispatch('connect');dispatch('compress');}
        dispatch('checkConnectivity');
        if(mac)dispatch('macDensities',0,mac.records-1);
        dispatch('collectVolumes');dispatch('remapAmounts');dispatch('balanceAmounts');
        dispatch('initializeGas');dispatch('countInterfaces');dispatch('gasWallFlux');dispatch('initializeWater');
        for (var i=0;i<iterations;i++) {
          var parity=redBlack ? 0 : i%2;
          dispatch('clearPressureBound',0,1);dispatch('measurePressure',parity);
          if(redBlack){dispatch('waterRed');dispatch('waterBlack');}
          else dispatch('waterJacobi',parity);
          dispatch('gasJacobi',parity);
        }
        dispatch('clearPressureBound',0,1);dispatch('measurePressure');
        dispatch('finish');dispatch('finishGas');dispatch('certifyExpansion');dispatch('finishDiagnostics',0,1);
        if(!directTransport)dispatch('applyVelocity',0,mac ? mac.faceRecords : instance.grid.cells);
        if(transport){pass.setPipeline(pipes.publishTransport);pass.setBindGroup(0,transportGroup);pass.dispatchWorkgroups(Math.ceil(count/128));}
        pass.end();
        steps++;
      },
      reset:function () {
        var encoder=device.createCommandEncoder({label:'liquid.air.reset'});
        [fields,labels,history,gas,pressureA,pressureB].forEach(function (buffer) {encoder.clearBuffer(buffer);});
        instance.queue.submit([encoder.finish()]);steps=0;snapshot=null;
      },
      capture:function () {
        if (pending || destroyed) return Promise.resolve(snapshot);
        pending=true;
        var started=performance.now();
        var sizes=[count*32,count*8,count*32,count*16,gasSize,count*32];
        if(mac)sizes.push(mac.records*64);
        var offset=0, offsets=sizes.map(function (n) {var o=offset;offset+=n;return o;});
        var read=device.createBuffer({label:'liquid.air.snapshot',size:offset,
          usage:GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
        var encoder=device.createCommandEncoder({label:'liquid.air.capture'});
        var captureBuffers=[fields,labels,history,pressureB,gas,geometry];if(mac)captureBuffers.push(mac.buffer);
        captureBuffers.forEach(function (buffer,i) {
          encoder.copyBufferToBuffer(buffer,0,read,offsets[i],sizes[i]);
        });
        instance.queue.submit([encoder.finish()]);
        var capturedSteps=steps, capturedTime=instance.simulationClock;
        return read.mapAsync(GPUMapMode.READ).then(function () {
          var bytes=read.getMappedRange();
          snapshot={width:width,height:height,cellSize:dx,steps:capturedSteps,simulationTime:capturedTime,
            latencyMs:performance.now()-started,settings:Object.assign({},model.settings),dt:instance.paramsHostF ? instance.paramsHostF[6] : instance.dt,
            cells:new Float32Array(bytes.slice(offsets[0],offsets[0]+sizes[0])),
            labels:new Uint32Array(bytes.slice(offsets[1],offsets[1]+sizes[1])),
            history:new Float32Array(bytes.slice(offsets[2],offsets[2]+sizes[2])),
            historyInts:new Int32Array(bytes.slice(offsets[2],offsets[2]+sizes[2])),
            pressure:new Float32Array(bytes.slice(offsets[3],offsets[3]+sizes[3])),
            gas:new Int32Array(bytes.slice(offsets[4],offsets[4]+phaseOffset)),
            geometry:new Float32Array(bytes.slice(offsets[5],offsets[5]+sizes[5])),geometryStride:8,
            phase:new Float32Array(bytes.slice(offsets[4]+phaseOffset,offsets[4]+phaseOffset+count*16)),phaseStride:4,
            cellStride:8,historyStride:8,velocityIsCorrection:true};
          if(mac){
            snapshot.mac=new Float32Array(bytes.slice(offsets[6],offsets[6]+sizes[6]));snapshot.macStride=16;
            var macBits=new Int32Array(snapshot.mac.buffer),diagnostic=(mac.records-1)*16;
            var approximateInterfaces=0;
            for(var face=0;face<mac.faceRecords;face++)if(snapshot.mac[face*16+12]>0)approximateInterfaces++;
            snapshot.macDiagnostics={rankZeroComponents:macBits[diagnostic],rankOneComponents:macBits[diagnostic+1],
              invalidMaterialUpdates:macBits[diagnostic+2],overflowErrors:macBits[diagnostic+3],
              partialGeometryCells:partialGeometryCells,materialInitialized:materialInitialized,
              staticTileBasis:!!staticFractions,dynamicBasisCells:dynamicBasisCells,
              geometryBasisExact:staticFractions?dynamicBasisCells===0:partialGeometryCells===0,
              interfaceBasisApproximateFaces:approximateInterfaces,interfaceBasisExact:approximateInterfaces===0};
          }
          var ledger=snapshot.gas.subarray(count*16,(count+1)*16);
          snapshot.ledger={oldAmount:ledger[0]/volumeScale,capturedAmount:ledger[1]/volumeScale,
            newAmount:ledger[2]/volumeScale,ventedAmount:ledger[4]/volumeScale,unassignedAmount:ledger[5]/volumeScale,
            voidExpansion:ledger[6]/volumeScale,geometryVolumeDrift:ledger[8]/volumeScale,vaporPockets:ledger[9],
            connectivityErrors:ledger[13],overflowErrors:ledger[14],nonpositiveVolumes:ledger[15]};
          snapshot.ledger.balanceError=snapshot.ledger.oldAmount+snapshot.ledger.capturedAmount-snapshot.ledger.newAmount
            -snapshot.ledger.ventedAmount-snapshot.ledger.unassignedAmount;
          snapshot.pockets=[];
          var phaseLedger=snapshot.gas.subarray((count+1)*16,(count+2)*16);
          snapshot.phaseLedger={clearedExpansionVolume:phaseLedger[2]/volumeScale,retainedLiquidCells:phaseLedger[3],
            unresolvedVoidVolume:phaseLedger[4]/volumeScale,consumedExpansionVolume:phaseLedger[5]/volumeScale,
            geometryOpenedVolume:phaseLedger[6]/volumeScale,zeroMassRetainedCells:phaseLedger[7],remainingExpansionVolume:0};
          for(var c=0;c<count;c++)snapshot.phaseLedger.remainingExpansionVolume+=snapshot.phase[c*4];
          var waterError=0,gasError=0,waterResidual=0,gasResidual=0,waterFloorVolume=0,gasFloorVolume=0;
          var cellBits=new Uint32Array(snapshot.cells.buffer);
          var dt=snapshot.dt, speedBits=new Float32Array(new Int32Array([snapshot.gas[(count+1)*16]]).buffer)[0];
          var pressureBits=new Float32Array(new Int32Array([snapshot.gas[(count+1)*16+1]]).buffer)[0];
          for(var c=0;c<count;c++){
            var kind=cellBits[c*8+3],p=snapshot.pressure[c*4],r=snapshot.pressure[c*4+3];
            if(kind!==1)continue;
            var active=p<=model.settings.minimumPressure+0.01,violation=active?Math.max(0,-r):Math.abs(r);
            waterResidual=Math.max(waterResidual,violation);waterError=Math.max(waterError,violation/Math.max(snapshot.cells[c*8+5],1e-20));
            if(active)waterFloorVolume+=Math.max(0,r);
          }
          for(var c=0;c<count;c++) if(snapshot.labels[c*2]===c+1){
            var faceCount=Math.max(1,snapshot.gas[c*16+7]);
            var ds=Math.min(model.settings.diagonalScale,1e9/Math.max(faceCount*dt*dt/model.settings.density,1e-20));
            var diagonal=snapshot.cells[c*8+5]+snapshot.gas[c*16+4]/ds;
            var r=snapshot.pressure[c*4+3],p=snapshot.pressure[c*4],vapor=snapshot.historyInts[c*8+6]===1;
            if(model.settings.nonlinearGas && !vapor){
              var absolute=model.settings.atmospherePressure+p;
              diagonal=snapshot.gas[c*16+4]/ds+model.settings.atmospherePressure*snapshot.historyInts[c*8+2]/volumeScale/(absolute*absolute);
            }
            var active=p<=model.settings.minimumPressure+0.01,violation=active?Math.max(0,-r):Math.abs(r);
            if(vapor && model.settings.vaporClosure)diagonal=snapshot.gas[c*16+4]/ds;
            if(!vapor || model.settings.vaporClosure){gasResidual=Math.max(gasResidual,violation);gasError=Math.max(gasError,violation/Math.max(diagonal,1e-20));}
            if(active && !vapor)gasFloorVolume+=Math.max(0,r);
            snapshot.pockets.push({root:c,pressure:p,amount:snapshot.historyInts[c*8+2]/volumeScale,
              volume:snapshot.historyInts[c*8+3]/volumeScale,geometryVolume:snapshot.history[c*8+4],
              vapor:vapor,diagonal:diagonal,eosError:snapshot.history[c*8+7],residual:snapshot.pressure[c*4+3]});
          }
          snapshot.convergence={waterPressureError:waterError,gasPressureError:gasError,
            waterResidual:waterResidual,gasResidual:gasResidual,waterFloorVolume:waterFloorVolume,gasFloorVolume:gasFloorVolume,
            maximumProvisionalSpeed:speedBits,maximumPressure:pressureBits,iterations:iterations,
            cavitationResolved:waterFloorVolume===0 && gasFloorVolume===0 && snapshot.phaseLedger.unresolvedVoidVolume===0,
            phaseResolved:snapshot.phaseLedger.unresolvedVoidVolume===0 && snapshot.phaseLedger.zeroMassRetainedCells===0};
          if(mac)snapshot.convergence.constitutiveGeometryResolved=snapshot.macDiagnostics.geometryBasisExact && snapshot.macDiagnostics.interfaceBasisExact;
          if(mac && (snapshot.macDiagnostics.invalidMaterialUpdates || snapshot.macDiagnostics.overflowErrors || !snapshot.macDiagnostics.geometryBasisExact)){
            snapshot.convergence.phaseResolved=false;snapshot.convergence.cavitationResolved=false;
          }
          if(mac && !snapshot.macDiagnostics.interfaceBasisExact)snapshot.convergence.cavitationResolved=false;
          return snapshot;
        }).finally(function () {pending=false;try{read.unmap();}catch(_){}read.destroy();});
      },
      stats:function () {return {enabled:enabled,steps:steps,pending:pending,width:width,height:height,
        cellSize:dx,iterations:iterations,snapshotTime:snapshot ? snapshot.simulationTime : null};},
      destroy:function () {destroyed=true;enabled=false;buffers.forEach(function (b) {b.destroy();});}
    };
    return model;
  }

  global.LiquidAirWGPU = {create:create,shaderSource:SOURCE};
})(typeof window !== 'undefined' ? window : globalThis);
