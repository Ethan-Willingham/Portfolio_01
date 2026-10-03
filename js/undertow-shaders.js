// Original WGSL from MAC operators, FFT butterflies and bounded MacCormack transport.
export const fluidShader=/* wgsl */`
struct Params { sizes:vec4<u32>, clock:vec4<f32>, pointer:vec4<f32>, impulse:vec4<f32>, seed:vec4<f32> }
struct Modes { wave:array<vec4<f32>,6>, rate:array<vec4<f32>,6> }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> src:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read_write> dst:array<vec2<f32>>;
@group(0) @binding(3) var<uniform> modes:Modes;
fn ix(x:i32,y:i32)->u32{let n=i32(p.sizes.x);return u32((x%n+n)%n+n*((y%n+n)%n));}
fn at(x:i32,y:i32)->vec2<f32>{return src[ix(x,y)];}
fn scalar(pos:vec2<f32>,component:u32)->f32{let n=f32(p.sizes.x);let offset=select(vec2(.5,0.),vec2(0.,.5),component==0u);let grid=pos*vec2(n*.5,n)-offset;let cell=vec2<i32>(floor(grid));let f=fract(grid);return mix(mix(at(cell.x,cell.y)[component],at(cell.x+1,cell.y)[component],f.x),mix(at(cell.x,cell.y+1)[component],at(cell.x+1,cell.y+1)[component],f.x),f.y);}
fn velocity(pos:vec2<f32>)->vec2<f32>{return vec2(scalar(pos,0u),scalar(pos,1u));}
fn psi(x:f32,y:f32)->f32{var sum=0.;for(var k=0u;k<6u;k++){let m=modes.wave[k];sum+=m.w*cos(6.28318530718*(m.x*x+m.y*y)+m.z+p.clock.x*modes.rate[k].x);}return sum;}
@compute @workgroup_size(64) fn initialize(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let x=f32(i%n)/f32(n);let y=f32(i/n)/f32(n);let s=psi(x,y);dst[i]=vec2((psi(x,y+1./f32(n))-s)*f32(n),-(psi(x+1./f32(n),y)-s)*f32(n)*.5);}
@compute @workgroup_size(64) fn advectVelocity(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let cell=vec2(f32(i%n),f32(i/n));let h=vec2(2.,1.)/f32(n);var value=vec2(0.);for(var k=0u;k<2u;k++){let pos=(cell+select(vec2(.5,0.),vec2(0.,.5),k==0u))*h;let half=pos-.5*p.clock.y*velocity(pos);let back=pos-p.clock.y*velocity(half);value[k]=scalar(back,k);}
 let x=cell.x/f32(n);let y=cell.y/f32(n);let s=psi(x,y);let force=vec2((psi(x,y+1./f32(n))-s)/h.y,-(psi(x+1./f32(n),y)-s)/h.x);
 let lap=(at(i32(cell.x)-1,i32(cell.y))+at(i32(cell.x)+1,i32(cell.y))-2.*src[i])/(h.x*h.x)+(at(i32(cell.x),i32(cell.y)-1)+at(i32(cell.x),i32(cell.y)+1)-2.*src[i])/(h.y*h.y);
 value+=p.clock.y*(force-.10*value+.000004*lap);
 if(p.pointer.z>0.){let pos=(cell+.5)*h;var d=pos-p.pointer.xy;d-=round(d/vec2(2.,1.))*vec2(2.,1.);value+=p.impulse.xy*exp(-dot(d,d)/.0025)*p.clock.y*18.;}
 dst[i]=value;
}
@compute @workgroup_size(64) fn divergence(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let x=i32(i%n);let y=i32(i/n);dst[i]=vec2((at(x+1,y).x-src[i].x)*f32(n)*.5+(at(x,y+1).y-src[i].y)*f32(n),0.);}
@compute @workgroup_size(64) fn bitReverse(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let x=reverseBits(i%n)>>(32u-p.sizes.y);let y=reverseBits(i/n)>>(32u-p.sizes.y);dst[i]=src[x+n*y];}
fn multiply(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
@compute @workgroup_size(64) fn butterfly(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let axis=p.sizes.z;let half=p.sizes.w;let x=i%n;let y=i/n;let coord=select(x,y,axis==1u);let j=coord%half;let base=coord/(2u*half)*(2u*half)+j;let a=select(base+n*y,x+n*base,axis==1u);let b=select(a+half,a+n*half,axis==1u);let angle=p.clock.z*3.14159265359*f32(j)/f32(half);let t=multiply(src[b],vec2(cos(angle),sin(angle)));dst[i]=src[a]+select(t,-t,coord%(2u*half)>=half);}
@compute @workgroup_size(64) fn poisson(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let wave=sin(3.14159265359*vec2(f32(i%n),f32(i/n))/f32(n));let lambda=-4.*dot(wave*wave,vec2(.25,1.))*f32(n*n);dst[i]=select(src[i]/min(lambda,-.00001),vec2(0.),i==0u);}
`;
export const projectShader=/* wgsl */`
struct Params { sizes:vec4<u32>, clock:vec4<f32>, pointer:vec4<f32>, impulse:vec4<f32>, seed:vec4<f32> }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> pressure:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read> velocity:array<vec2<f32>>;
@group(0) @binding(3) var<storage,read_write> output:array<vec2<f32>>;
@compute @workgroup_size(64) fn project(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.x;let i=id.x;if(i>=n*n){return;}let x=i%n;let y=i/n;let left=(x+n-1u)%n+n*y;let down=x+n*((y+n-1u)%n);let scale=f32(n*n);let grad=vec2(pressure[i].x-pressure[left].x,pressure[i].x-pressure[down].x)*vec2(.5,1.)*f32(n)/scale;output[i]=velocity[i]-grad;}
`;
export const dyeShader=/* wgsl */`
struct Params { sizes:vec4<u32>, clock:vec4<f32>, pointer:vec4<f32>, impulse:vec4<f32>, seed:vec4<f32> }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> velocity:array<vec2<f32>>;
@group(0) @binding(2) var<storage,read> src:array<vec4<f32>>;
@group(0) @binding(3) var<storage,read> original:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read_write> dst:array<vec4<f32>>;
fn index(x:i32,y:i32,n:i32)->u32{return u32((x%n+n)%n+n*((y%n+n)%n));}
fn vat(x:i32,y:i32)->vec2<f32>{return velocity[index(x,y,i32(p.sizes.x))];}
fn component(pos:vec2<f32>,k:u32)->f32{let n=f32(p.sizes.x);let g=pos*vec2(n*.5,n)-select(vec2(.5,0.),vec2(0.,.5),k==0u);let c=vec2<i32>(floor(g));let f=fract(g);return mix(mix(vat(c.x,c.y)[k],vat(c.x+1,c.y)[k],f.x),mix(vat(c.x,c.y+1)[k],vat(c.x+1,c.y+1)[k],f.x),f.y);}
fn vel(pos:vec2<f32>)->vec2<f32>{return vec2(component(pos,0u),component(pos,1u));}
fn dat(x:i32,y:i32)->vec4<f32>{return src[index(x,y,i32(p.sizes.y))];}
fn sampleDye(pos:vec2<f32>)->vec4<f32>{let g=pos*vec2(.5,1.)*f32(p.sizes.y)-.5;let c=vec2<i32>(floor(g));let f=fract(g);return mix(mix(dat(c.x,c.y),dat(c.x+1,c.y),f.x),mix(dat(c.x,c.y+1),dat(c.x+1,c.y+1),f.x),f.y);}
fn backtrace(pos:vec2<f32>,dt:f32)->vec2<f32>{return pos-dt*vel(pos-.5*dt*vel(pos));}
@compute @workgroup_size(64) fn initializeDye(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.y;let i=id.x;if(i>=n*n){return;}let uv=(vec2(f32(i%n),f32(i/n))+.5)/f32(n);let phase=6.28318530718*(2.*uv.x+uv.y+.19*sin(6.28318530718*uv.y)+.14*cos(12.566370614*uv.x))+p.seed.x;let waves=.5+.5*cos(vec3(phase,phase+2.0944,phase+4.1888));dst[i]=vec4(pow(waves,vec3(8.)),1.);}
@compute @workgroup_size(64) fn advectDye(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.y;let i=id.x;if(i>=n*n){return;}let pos=(vec2(f32(i%n),f32(i/n))+.5)*vec2(2.,1.)/f32(n);dst[i]=sampleDye(backtrace(pos,p.clock.y));}
@compute @workgroup_size(64) fn correctDye(@builtin(global_invocation_id) id:vec3<u32>){let n=p.sizes.y;let i=id.x;if(i>=n*n){return;}let pos=(vec2(f32(i%n),f32(i/n))+.5)*vec2(2.,1.)/f32(n);let reverse=sampleDye(backtrace(pos,-p.clock.y));let g=backtrace(pos,p.clock.y)*vec2(.5,1.)*f32(n)-.5;let c=vec2<i32>(floor(g));let i0=index(c.x,c.y,i32(n));let i1=index(c.x+1,c.y,i32(n));let i2=index(c.x,c.y+1,i32(n));let i3=index(c.x+1,c.y+1,i32(n));let low=min(min(original[i0],original[i1]),min(original[i2],original[i3]));let high=max(max(original[i0],original[i1]),max(original[i2],original[i3]));var value=clamp(src[i]+.5*(original[i]-reverse),low,high);
 value.xyz*=exp(-p.clock.y*.006);
 let uv=pos*vec2(.5,1.);let phase=6.28318530718*(2.*uv.x+uv.y)+p.clock.x*.16+p.seed.x;let waves=pow(.5+.5*cos(vec3(phase,phase+2.0944,phase+4.1888)),vec3(12.));value.xyz=mix(value.xyz,waves,1.-exp(-p.clock.y*.018));
 if(p.pointer.z>0.){var d=pos-p.pointer.xy;d-=round(d/vec2(2.,1.))*vec2(2.,1.);let weight=(1.-exp(-p.clock.y*25.))*exp(-dot(d,d)/.0008);let color=.5+.5*cos(vec3(p.pointer.w,p.pointer.w+2.0944,p.pointer.w+4.1888));value.xyz=mix(value.xyz,color,weight);}
 dst[i]=vec4(clamp(value.xyz,vec3(0.),vec3(1.)),1.);
}
`;
export const renderShader=/* wgsl */`
struct View { dims:vec4<f32> }
@group(0) @binding(0) var<uniform> view:View;
@group(0) @binding(1) var<storage,read> dye:array<vec4<f32>>;
struct Out{@builtin(position) p:vec4<f32>,@location(0) uv:vec2<f32>}
@vertex fn vertex(@builtin(vertex_index) i:u32)->Out{var p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));var o:Out;o.p=vec4(p[i],0.,1.);o.uv=p[i]*vec2(.5,-.5)+.5;return o;}
fn at(x:i32,y:i32)->vec3<f32>{let n=i32(view.dims.z);return dye[u32((x%n+n)%n+n*((y%n+n)%n))].xyz;}
fn sampleDye(uv:vec2<f32>)->vec3<f32>{let g=uv*view.dims.z-.5;let c=vec2<i32>(floor(g));let f=fract(g);return mix(mix(at(c.x,c.y),at(c.x+1,c.y),f.x),mix(at(c.x,c.y+1),at(c.x+1,c.y+1),f.x),f.y);}
@fragment fn fragment(o:Out)->@location(0) vec4<f32>{let uv=o.uv;let raw=sampleDye(uv);let d=pow(max(raw-vec3(min(min(raw.x,raw.y),raw.z)*.92),vec3(0.)),vec3(1.35));let e=1./view.dims.z;let gx=(sampleDye(uv+vec2(e,0.))-sampleDye(uv-vec2(e,0.)))*.5;let gy=(sampleDye(uv+vec2(0.,e))-sampleDye(uv-vec2(0.,e)))*.5;let height=dot(d,vec3(.65,.4,.55));let gradient=vec2(dot(gx,vec3(.65,.4,.55)),dot(gy,vec3(.65,.4,.55)));let normal=normalize(vec3(-gradient*28.,1.));let light=normalize(vec3(-.45,-.6,1.));let shading=.25+.8*max(0.,dot(normal,light));let spec=pow(max(0.,dot(normal,normalize(light+vec3(0.,0.,1.)))),42.);
 let gold=vec3(1.15,.48,.08);let blue=vec3(.04,.35,.60);let coral=vec3(.80,.10,.03);let total=d.x+d.y+d.z;let pigment=(d.x*gold+d.y*blue+d.z*coral)/max(total,.001);let density=1.-exp(-total*6.0);let ridges=pow(clamp(length(gradient)*9.,0.,1.),.7);var color=mix(vec3(.007,.016,.012),pigment*shading,density);color+=vec3(.55,.48,.31)*spec*.18*density+pigment*ridges*.35;
 // Linear light. Height and lighting are illustrative dye shading, not 3D geometry.
 return vec4(color*view.dims.w,1.);}
`;
export const displayShader=/* wgsl */`
@group(0) @binding(0) var scene:texture_2d<f32>;
@group(0) @binding(1) var samp:sampler;
struct Out{@builtin(position) p:vec4<f32>,@location(0) uv:vec2<f32>}
@vertex fn vertex(@builtin(vertex_index) i:u32)->Out{var p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));var o:Out;o.p=vec4(p[i],0.,1.);o.uv=p[i]*vec2(.5,-.5)+.5;return o;}
@fragment fn fragment(o:Out)->@location(0) vec4<f32>{let c=textureSample(scene,samp,o.uv).rgb;let m=c/(1.+c);return vec4(select(m*12.92,1.055*pow(max(m,vec3(0.)),vec3(1./2.4))-.055,m>vec3(.0031308)),1.);}
`;
