
struct View {size:vec2f,exposure:f32,mode:f32,n:f32,side:f32,signs:f32,count:f32,span:f32};
@group(0) @binding(0) var<storage,read> psi:array<vec2f>;
@group(0) @binding(1) var<uniform> v:View;
@group(0) @binding(2) var<storage,read> vortices:array<vec4f>;
struct Vertex { @builtin(position) pos:vec4f, @location(0) uv:vec2f };
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex{
  let xy=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
  var o:Vertex;o.pos=vec4f(xy[i],0.,1.);o.uv=xy[i];return o;
}
fn at(ij:vec2i)->vec2f{let n=i32(v.n);if(any(ij<vec2i(0))||any(ij>=vec2i(n))){return vec2f(0.);}return psi[u32(ij.y*n+ij.x)];}
fn density(ij:vec2i)->f32{let a=at(ij);return dot(a,a);}
fn lab(l:f32,a:f32,b:f32)->vec3f{
  let z=vec3f(l+.3963377774*a+.2158037573*b,l-.1055613458*a-.0638541728*b,l-.0894841775*a-1.291485548*b);
  let q=z*z*z;return max(vec3f(0.),vec3f(4.0767416621*q.x-3.3077115913*q.y+.2309699292*q.z,-1.2684380046*q.x+2.6097574011*q.y-.3413193965*q.z,-.0041960863*q.x-.7034186147*q.y+1.707614701*q.z));
}
@fragment fn fragment(o:Vertex)->@location(0) vec4f{
  let xy=o.uv* v.size/min(v.size.x,v.size.y)*v.span;
  let grid=(xy/v.side+.5)*v.n;
  let ij=vec2i(floor(grid));let f=fract(grid);
  let a=mix(mix(at(ij),at(ij+vec2i(1,0)),f.x),mix(at(ij+vec2i(0,1)),at(ij+vec2i(1,1)),f.x),f.y);
  let rho=mix(mix(density(ij),density(ij+vec2i(1,0)),f.x),mix(density(ij+vec2i(0,1)),density(ij+vec2i(1,1)),f.x),f.y);
  let phase=atan2(a.y,a.x);
  let chroma=select(.045,.12,v.mode>0.5&&v.mode<1.5);
  let color=lab(.77,chroma*cos(phase),chroma*sin(phase));
  let luminosity=1.8*(1.-exp(-1.7*max(rho,0.)))*smoothstep(.015,.08,rho);
  let bloom=(density(ij+vec2i(3,0))+density(ij-vec2i(3,0))+density(ij+vec2i(0,3))+density(ij-vec2i(0,3)))*.002;
  var scene=vec3f(.004,.007,.006)+color*luminosity+vec3f(bloom*.75,bloom,bloom*.95);
  if(v.mode>1.5 && rho>.08){
    // j = Im(conj(psi) grad psi); safe v = j/rho, no tracers.
    let gradx=(at(ij+vec2i(1,0))-at(ij-vec2i(1,0)))*v.n/(2.*v.side);
    let grady=(at(ij+vec2i(0,1))-at(ij-vec2i(0,1)))*v.n/(2.*v.side);
    let flow=vec2f(a.x*gradx.y-a.y*gradx.x,a.x*grady.y-a.y*grady.x)/max(rho,.08);
    let point=(fract(xy/3.+.5)-.5)*3.;let speed=length(flow);let dir=flow/max(speed,.001);
    let along=dot(point,dir);let across=abs(dot(point,vec2f(-dir.y,dir.x)));
    let line=(1.-smoothstep(.025,.09,across))*(1.-smoothstep(.35,.6,abs(along)))*smoothstep(.015,.06,speed);
    let head=(1.-smoothstep(.02,.08,max(0.,across-(.58-along)*.5)))*smoothstep(.2,.3,along)*(1.-smoothstep(.5,.58,along))*smoothstep(.015,.06,speed);
    scene=mix(scene,vec3f(.65,.56,.4),max(line,head)*.65);
  }
  if(v.signs>.5){for(var i=0u;i<u32(v.count);i++){
    let vortex=vortices[i];let d=length(xy-vortex.xy);
    let ring=(1.-smoothstep(.05,.12,abs(d-.68)));
    let c=select(vec3f(.2,.5,.68),vec3f(.75,.43,.24),vortex.z>0.);
    scene=mix(scene,c,ring*.8);
  }}
  return vec4f(scene*v.exposure,1.);
}