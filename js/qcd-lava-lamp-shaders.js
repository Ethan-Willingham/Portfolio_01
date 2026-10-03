// Original implementation from the equations documented in QCD_LAVA_LAMP.md.
export function solverShader(L=16,n=3){return /* wgsl */`
const L:u32=${L}u; const N:u32=${L**4}u; const NC:u32=${n}u; const NN:u32=${n*n}u;
struct Matrix { v:array<vec2<f32>,${n*n}> }
struct Params { beta:f32, sweep:u32, mu:u32, parity:u32, key:vec2<u32>, mode:u32, layer:u32 }
@group(0) @binding(0) var<storage,read_write> links:array<Matrix>;
@group(0) @binding(1) var<uniform> params:Params;
@group(0) @binding(2) var<storage,read_write> charge:array<f32>;
@group(0) @binding(3) var<storage,read_write> diagnostics:array<vec4<f32>>;
fn cmul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
fn conj(a:vec2<f32>)->vec2<f32>{return vec2(a.x,-a.y);}
fn eye()->Matrix{var a:Matrix;for(var i=0u;i<NC;i++){a.v[i*NC+i]=vec2(1.,0.);}return a;}
fn mm(a:Matrix,b:Matrix)->Matrix{var c:Matrix;for(var i=0u;i<NC;i++){for(var j=0u;j<NC;j++){for(var k=0u;k<NC;k++){c.v[i*NC+j]+=cmul(a.v[i*NC+k],b.v[k*NC+j]);}}}return c;}
fn dag(a:Matrix)->Matrix{var c:Matrix;for(var i=0u;i<NC;i++){for(var j=0u;j<NC;j++){c.v[i*NC+j]=conj(a.v[j*NC+i]);}}return c;}
fn ma(a:Matrix,b:Matrix)->Matrix{var c:Matrix;for(var i=0u;i<NN;i++){c.v[i]=a.v[i]+b.v[i];}return c;}
fn tr(a:Matrix)->f32{var s=0.;for(var i=0u;i<NC;i++){s+=a.v[i*NC+i].x;}return s;}
fn coords(x:u32)->vec4<u32>{return vec4(x%L,(x/L)%L,(x/(L*L))%L,x/(L*L*L));}
fn shift(x:u32,mu:u32,s:i32)->u32{var stride=1u;for(var i=0u;i<mu;i++){stride*=L;}let c=(x/stride)%L;return u32(i32(x)+( (i32(c)+s+i32(L))%i32(L)-i32(c))*i32(stride));}
fn path(x0:u32,ds:vec4<i32>)->Matrix{var x=x0;var a=eye();for(var k=0u;k<4u;k++){let d=ds[k];let mu=u32(abs(d)-1);if(d>0){a=mm(a,links[4u*x+mu]);x=shift(x,mu,1);}else{x=shift(x,mu,-1);a=mm(a,dag(links[4u*x+mu]));}}return a;}
fn staple(x:u32,mu:u32)->Matrix{var v:Matrix;for(var nu=0u;nu<4u;nu++){if(nu!=mu){let xp=shift(x,nu,1);let xm=shift(x,nu,-1);v=ma(v,mm(mm(links[4u*x+nu],links[4u*xp+mu]),dag(links[4u*shift(x,mu,1)+nu])));v=ma(v,mm(mm(dag(links[4u*xm+nu]),links[4u*xm+mu]),links[4u*shift(xm,mu,1)+nu]));}}return v;}
fn mulhi(a:u32,b:u32)->u32{let a0=a&65535u;let a1=a>>16u;let b0=b&65535u;let b1=b>>16u;let c0=a0*b0;let c1=a1*b0+(c0>>16u);let c2=a0*b1+(c1&65535u);return a1*b1+(c1>>16u)+(c2>>16u);}
fn philox(input:vec4<u32>)->vec4<u32>{var c=input;var k=params.key;for(var r=0u;r<10u;r++){c=vec4(mulhi(0xcd9e8d57u,c.z)^c.y^k.x,0xcd9e8d57u*c.z,mulhi(0xd2511f53u,c.x)^c.w^k.y,0xd2511f53u*c.x);k+=vec2(0x9e3779b9u,0xbb67ae85u);}return c;}
struct RNG { site:u32,schedule:u32,count:u32,words:vec4<u32> }
fn random(r:ptr<function,RNG>)->f32{if((*r).count%4u==0u){(*r).words=philox(vec4((*r).site,params.sweep,(*r).schedule,(*r).count/4u));}let v=(*r).words[(*r).count%4u]>>9u;(*r).count++;return (f32(v)+.5)/8388608.;}
fn hb(alpha:f32,r:ptr<function,RNG>)->vec4<f32>{var a=0.;loop{let u=random(r);if(alpha<1.){a=2.*u-1.;}else{a=1.+log(u+(1.-u)*exp(-2.*alpha))/alpha;}let v=random(r);var weight=max(0.,1.-a*a);if(alpha<1.){weight*=exp(2.*alpha*(a-1.));}if(v*v<=weight){break;}}let z=2.*random(r)-1.;let phi=6.28318530718*random(r);let s=sqrt(max(0.,1.-a*a));let radius=s*sqrt(max(0.,1.-z*z));return vec4(a,radius*cos(phi),radius*sin(phi),s*z);}
fn qm(a:vec4<f32>,b:vec4<f32>)->vec4<f32>{return vec4(a.x*b.x-dot(a.yzw,b.yzw),a.x*b.yzw+b.x*a.yzw-cross(a.yzw,b.yzw));}
fn rotateRows(a:Matrix,q:vec4<f32>,i:u32,j:u32)->Matrix{var c=a;let aa=vec2(q.x,q.w);let ab=vec2(q.z,q.y);let ba=vec2(-q.z,q.y);let bb=vec2(q.x,-q.w);for(var k=0u;k<NC;k++){c.v[i*NC+k]=cmul(aa,a.v[i*NC+k])+cmul(ab,a.v[j*NC+k]);c.v[j*NC+k]=cmul(ba,a.v[i*NC+k])+cmul(bb,a.v[j*NC+k]);}return c;}
fn gaussian(r:ptr<function,RNG>)->vec2<f32>{let radius=sqrt(-2.*log(random(r)));let angle=6.28318530718*random(r);return radius*vec2(cos(angle),sin(angle));}
@compute @workgroup_size(64) fn initialize(@builtin(global_invocation_id) id:vec3<u32>){let x=id.x;if(x>=N){return;}for(var mu=0u;mu<4u;mu++){var u=eye();if(params.mode==2u){var r=RNG(x,128u+mu*16u,0u,vec4(0u));${n===2?'u=rotateRows(u,hb(0.,&r),0u,1u);':`
var norm=0.;for(var k=0u;k<3u;k++){u.v[k]=gaussian(&r);u.v[3u+k]=gaussian(&r);norm+=dot(u.v[k],u.v[k]);}
for(var k=0u;k<3u;k++){u.v[k]/=sqrt(norm);}var projection=vec2(0.);for(var k=0u;k<3u;k++){projection+=cmul(conj(u.v[k]),u.v[3u+k]);}
norm=0.;for(var k=0u;k<3u;k++){u.v[3u+k]-=cmul(u.v[k],projection);norm+=dot(u.v[3u+k],u.v[3u+k]);}
for(var k=0u;k<3u;k++){u.v[3u+k]/=sqrt(norm);}
u.v[6]=conj(cmul(u.v[1],u.v[5])-cmul(u.v[2],u.v[4]));u.v[7]=conj(cmul(u.v[2],u.v[3])-cmul(u.v[0],u.v[5]));u.v[8]=conj(cmul(u.v[0],u.v[4])-cmul(u.v[1],u.v[3]));`}}links[4u*x+mu]=u;}}
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3<u32>){let x=id.x;if(x>=N){return;}let c=coords(x);if((c.x+c.y+c.z+c.w)%2u!=params.parity){return;}let v=staple(x,params.mu);var u=links[4u*x+params.mu];for(var sub=0u;sub<${n===2?'1':'3'}u;sub++){var i=0u;var j=1u;if(sub==1u){j=2u;}if(sub==2u){i=1u;j=2u;}let k=mm(u,dag(v));var q=vec4((k.v[i*NC+i].x+k.v[j*NC+j].x)*.5,(k.v[i*NC+j].y+k.v[j*NC+i].y)*.5,(k.v[i*NC+j].x-k.v[j*NC+i].x)*.5,(k.v[i*NC+i].y-k.v[j*NC+j].y)*.5);let norm=length(q);if(norm>1e-12){q=vec4(q.x,-q.yzw)/norm;}else{q=vec4(1.,0.,0.,0.);}var t=vec4(1.,0.,0.,0.);if(params.mode==0u){var r=RNG(x,(params.mu*2u+params.parity)*4u+sub,0u,vec4(0u));t=hb(2.*params.beta*norm/f32(NC),&r);}u=rotateRows(u,qm(t,q),i,j);}links[4u*x+params.mu]=u;}
fn clover(x:u32,mu:u32,nu:u32)->Matrix{let a=i32(mu)+1;let b=i32(nu)+1;let c=ma(ma(path(x,vec4(a,b,-a,-b)),path(x,vec4(b,-a,-b,a))),ma(path(x,vec4(-a,-b,a,b)),path(x,vec4(-b,a,b,-a))));var f:Matrix;for(var i=0u;i<NC;i++){for(var j=0u;j<NC;j++){let z=c.v[i*NC+j]-conj(c.v[j*NC+i]);f.v[i*NC+j]=vec2(z.y,-z.x)*.125;}}let t=tr(f)/f32(NC);for(var i=0u;i<NC;i++){f.v[i*NC+i].x-=t;}return f;}
@compute @workgroup_size(64) fn measureCharge(@builtin(global_invocation_id) id:vec3<u32>){let x=id.x;if(x>=N){return;}let f01=clover(x,0u,1u);let f02=clover(x,0u,2u);let f03=clover(x,0u,3u);let f12=clover(x,1u,2u);let f13=clover(x,1u,3u);let f23=clover(x,2u,3u);charge[params.layer*N+x]=(tr(mm(f01,f23))-tr(mm(f02,f13))+tr(mm(f03,f12)))*.02533029591;}
@compute @workgroup_size(64) fn measureLive(@builtin(global_invocation_id) id:vec3<u32>){let x=id.x;if(x>=N){return;}var p=0.;for(var mu=0u;mu<4u;mu++){for(var nu=mu+1u;nu<4u;nu++){p+=tr(path(x,vec4(i32(mu)+1,i32(nu)+1,-i32(mu)-1,-i32(nu)-1)))/f32(NC);}}var unit=0.;var detError=0.;for(var mu=0u;mu<4u;mu++){let u=links[4u*x+mu];let a=mm(u,dag(u));let ident=eye();for(var k=0u;k<NN;k++){unit=max(unit,max(abs(a.v[k].x-ident.v[k].x),abs(a.v[k].y)));}var det=vec2(0.);${n===2?'det=cmul(u.v[0],u.v[3])-cmul(u.v[1],u.v[2]);':`det=cmul(u.v[0],cmul(u.v[4],u.v[8])-cmul(u.v[5],u.v[7]))-cmul(u.v[1],cmul(u.v[3],u.v[8])-cmul(u.v[5],u.v[6]))+cmul(u.v[2],cmul(u.v[3],u.v[7])-cmul(u.v[4],u.v[6]));`}detError=max(detError,length(det-vec2(1.,0.)));}diagnostics[x]=vec4(p/6.,unit,detError,0.);}
`;}
export const sliceShader=/* wgsl */`
struct View { dims:vec4<f32>, clock:vec4<f32>, levels:vec4<f32>, ranges:vec4<f32>, previousRanges:vec4<f32> }
@group(0) @binding(0) var<uniform> view:View;
@group(0) @binding(1) var<storage,read> charge:array<f32>;
@group(0) @binding(2) var<storage,read> previous:array<f32>;
@group(0) @binding(3) var volume:texture_storage_3d<rgba16float,write>;
fn sampleField(a:u32,b:u32,x:u32,mixValue:f32)->f32{let n=u32(view.dims.z);let N=n*n*n*n;let q=mix(charge[a*N+x]/view.ranges[a],charge[b*N+x]/view.ranges[b],mixValue);let p=mix(previous[a*N+x]/view.previousRanges[a],previous[b*N+x]/view.previousRanges[b],mixValue);return mix(p,q,view.clock.z);}
@compute @workgroup_size(4,4,4) fn slice(@builtin(global_invocation_id) id:vec3<u32>){let n=u32(view.dims.z);if(any(id>=vec3(n))){return;}let scan=view.clock.x*f32(n);let i=u32(floor(scan))%n;let j=(i+1u)%n;let base=n*(id.x+n*(id.y+n*id.z));let a=u32(view.levels.x);let b=u32(view.levels.y);let q=mix(sampleField(a,b,base+i,view.levels.z),sampleField(a,b,base+j,view.levels.z),fract(scan));textureStore(volume,vec3<i32>(id),vec4(q,0.,0.,1.));}
`;
export const volumeShader=/* wgsl */`
struct View { dims:vec4<f32>, clock:vec4<f32>, levels:vec4<f32>, ranges:vec4<f32>, previousRanges:vec4<f32> }
@group(0) @binding(0) var<uniform> view:View;
@group(0) @binding(1) var volume:texture_3d<f32>;
@group(0) @binding(2) var samp:sampler;
struct Out { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32> }
@vertex fn vertex(@builtin(vertex_index) i:u32)->Out{var p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));var o:Out;o.p=vec4(p[i],0.,1.);o.uv=p[i];return o;}
fn rot(p:vec3<f32>)->vec3<f32>{let a=view.clock.y;let c=cos(a);let s=sin(a);let b=-.22;let v=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);return vec3(v.x,cos(b)*v.y-sin(b)*v.z,sin(b)*v.y+cos(b)*v.z);}
fn q(p:vec3<f32>)->f32{return textureSampleLevel(volume,samp,p+.5,0.).x;}
// Contours of the measured RMS-normalized charge, with no synthetic detail.
fn density(p:vec3<f32>)->f32{
  let boundary=min(min(.5-abs(p.x),.5-abs(p.y)),.5-abs(p.z));
  return abs(q(p))*smoothstep(0.,.025,boundary);
}
fn shade(p:vec3<f32>,direction:vec3<f32>)->vec3<f32>{
  let e=.5/view.dims.z;
  let gradient=vec3(density(p+vec3(e,0.,0.))-density(p-vec3(e,0.,0.)),
                    density(p+vec3(0.,e,0.))-density(p-vec3(0.,e,0.)),
                    density(p+vec3(0.,0.,e))-density(p-vec3(0.,0.,e)));
  let normal=-gradient/max(length(gradient),.00001);
  let light=normalize(rot(vec3(-.6,.9,1.4)));
  let diffuse=max(0.,dot(normal,light));
  let halfVector=normalize(light-direction);
  let specular=pow(max(0.,dot(normal,halfVector)),36.);
  let rim=pow(1.-abs(dot(normal,direction)),3.);
  let tint=select(vec3(.24,.52,.62),vec3(.69,.27,.17),q(p)>0.);
  return tint*(.25+.85*diffuse+.12*rim)+vec3(.65,.59,.48)*specular*.45;
}
@fragment fn fragment(o:Out)->@location(0) vec4<f32>{
  let aspect=view.dims.x/view.dims.y;
  // Fit the whole volume on narrow screens without stretching its geometry.
  let uv=o.uv*vec2(aspect,1.)/min(aspect,1.);
  let origin=rot(vec3(0.,0.,2.6));
  let direction=rot(normalize(vec3(uv*.68,-2.6)));
  let inv=1./direction;
  let t0=(-vec3(.5)-origin)*inv;
  let t1=(vec3(.5)-origin)*inv;
  let low=min(t0,t1);let high=max(t0,t1);
  let near=max(max(low.x,low.y),low.z);let far=min(min(high.x,high.y),high.z);
  var color=vec3(.004,.008,.006);
  if(far>near&&far>0.){
    let start=max(near,0.);
    let ds=(far-start)/128.;
    var radiance=vec3(0.);var trans=1.;var previous=0.;
    // Entering the 1.1-RMS contour marks a charge structure. Refine the
    // crossing within its ray interval for a clean silhouette.
    for(var i=0u;i<=128u;i++){
      let t=start+f32(i)*ds;
      let value=density(origin+direction*t);
      if(previous<1.1&&value>=1.1){
        var left=max(start,t-ds);var right=t;
        for(var j=0u;j<5u;j++){
          let middle=(left+right)*.5;
          if(density(origin+direction*middle)>=1.1){right=middle;}else{left=middle;}
        }
        let p=origin+direction*((left+right)*.5);
        let opacity=.80;
        radiance+=trans*opacity*shade(p,direction);
        trans*=1.-opacity;
        if(trans<.015){break;}
      }
      previous=value;
    }
    color=radiance+color*trans;
  }
  return vec4(color*view.dims.w,1.);
}
`;
export const displayShader=/* wgsl */`
@group(0) @binding(0) var scene:texture_2d<f32>;
@group(0) @binding(1) var samp:sampler;
struct Out{@builtin(position) p:vec4<f32>,@location(0) uv:vec2<f32>}
@vertex fn vertex(@builtin(vertex_index) i:u32)->Out{var p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));var o:Out;o.p=vec4(p[i],0.,1.);o.uv=p[i]*vec2(.5,-.5)+.5;return o;}
@fragment fn fragment(o:Out)->@location(0) vec4<f32>{
  let c=textureSample(scene,samp,o.uv).rgb;
  let mapped=c/(1.+c);
  let srgb=select(mapped*12.92,1.055*pow(max(mapped,vec3(0.)),vec3(1./2.4))-.055,mapped>vec3(.0031308));
  return vec4(srgb,1.);
}
`;
