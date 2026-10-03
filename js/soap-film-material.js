import {initialThickness} from './soap-film-model.js?v=4';

// Closed, conservative FCT thickness transport on a finer grid than the flow.
const code=`
struct Params { n:u32, flow:u32, dx:f32, dt:f32 };
@group(0) @binding(0) var<storage,read_write> src:array<f32>;
@group(0) @binding(1) var<storage,read_write> out:array<f32>;
@group(0) @binding(2) var<storage,read_write> fx:array<f32>;
@group(0) @binding(3) var<storage,read_write> fy:array<f32>;
@group(0) @binding(4) var<storage,read_write> budget:array<vec2f>;
@group(0) @binding(5) var<storage,read> u:array<f32>;
@group(0) @binding(6) var<storage,read> v:array<f32>;
@group(0) @binding(7) var<uniform> p:Params;
fn mc(a:f32,b:f32)->f32 {if(a*b<=0){return 0;}return sign(a)*min(min(2*abs(a),2*abs(b)),abs((a+b)*.5));}
fn sx(x:u32,y:u32)->f32 {if(x==0||x+1==p.n){return 0;}let i=y*p.n+x;return mc(src[i]-src[i-1],src[i+1]-src[i]);}
fn sy(x:u32,y:u32)->f32 {if(y==0||y+1==p.n){return 0;}let i=y*p.n+x;return mc(src[i]-src[i-p.n],src[i+p.n]-src[i]);}
// Normal interpolation and piecewise-constant tangential prolongation keep
// every fine cell's divergence equal to its parent MAC cell's divergence.
fn U(x:u32,y:u32)->f32 {if(x==0||x==p.n){return 0;}let q=f32(x)*f32(p.flow)/f32(p.n);let j=y*p.flow/p.n;let i=u32(q);return mix(u[j*(p.flow+1)+i],u[j*(p.flow+1)+i+1],fract(q));}
fn V(x:u32,y:u32)->f32 {if(y==0||y==p.n){return 0;}let q=f32(y)*f32(p.flow)/f32(p.n);let j=u32(q);let i=x*p.flow/p.n;return mix(v[j*p.flow+i],v[(j+1)*p.flow+i],fract(q));}
fn bx(x:u32,y:u32)->f32 {if(x==0||x==p.n){return 0;}let a=U(x,y);return a*src[y*p.n+x-select(0u,1u,a>=0)];}
fn by(x:u32,y:u32)->f32 {if(y==0||y==p.n){return 0;}let a=V(x,y);return a*src[(y-select(0u,1u,a>=0))*p.n+x];}
@compute @workgroup_size(64) fn corrections(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.n*(p.n+1)){return;}
 let x=i%(p.n+1);let y=i/(p.n+1);var a=0.0;if(x>0&&x<p.n){let vel=U(x,y);a=abs(vel)*.5*sx(x-select(0u,1u,vel>=0),y);}fx[i]=a;
 let X=i%p.n;let Y=i/p.n;var b=0.0;if(Y>0&&Y<p.n){let vel=V(X,Y);b=abs(vel)*.5*sy(X,Y-select(0u,1u,vel>=0));}fy[i]=b;
}
@compute @workgroup_size(64) fn donor(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.n*p.n){return;}let x=i%p.n;let y=i/p.n;let q=p.dt/p.dx;
 let base=src[i]-q*(bx(x+1,y)-bx(x,y)+by(x,y+1)-by(x,y));out[i]=base;
 let L=fx[y*(p.n+1)+x];let R=fx[y*(p.n+1)+x+1];let T=fy[i];let B=fy[i+p.n];
 let inc=q*(max(0.0,L)+max(0.0,-R)+max(0.0,T)+max(0.0,-B));let dec=q*(max(0.0,-L)+max(0.0,R)+max(0.0,-T)+max(0.0,B));
 let lo=min(min(min(src[i],base),min(src[y*p.n+select(x,x-1,x>0)],src[y*p.n+min(p.n-1,x+1)])),min(src[select(y,y-1,y>0)*p.n+x],src[min(p.n-1,y+1)*p.n+x]));
 let hi=max(max(max(src[i],base),max(src[y*p.n+select(x,x-1,x>0)],src[y*p.n+min(p.n-1,x+1)])),max(src[select(y,y-1,y>0)*p.n+x],src[min(p.n-1,y+1)*p.n+x]));
 budget[i]=vec2f(min(1.0,max(0.0,hi-base)/max(1e-30,inc)),min(1.0,max(0.0,base-lo)/max(1e-30,dec)));
}
@compute @workgroup_size(64) fn limit(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.n*(p.n+1)){return;}
 let x=i%(p.n+1);let y=i/(p.n+1);if(x>0&&x<p.n){let l=y*p.n+x-1;let r=l+1;fx[i]*=select(min(budget[l].x,budget[r].y),min(budget[l].y,budget[r].x),fx[i]>=0);}
 let X=i%p.n;let Y=i/p.n;if(Y>0&&Y<p.n){let t=i-p.n;fy[i]*=select(min(budget[t].x,budget[i].y),min(budget[t].y,budget[i].x),fy[i]>=0);}
}
@compute @workgroup_size(64) fn apply(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=p.n*p.n){return;}let x=i%p.n;let y=i/p.n;out[i]-=p.dt/p.dx*(fx[y*(p.n+1)+x+1]-fx[y*(p.n+1)+x]+fy[i+p.n]-fy[i]);}
@compute @workgroup_size(64) fn combine(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i<p.n*p.n){src[i]=.5*(src[i]+out[i]);}}
`;

export async function createMaterial({device,n,flowN,lengthMeters=.16,seed='51a9f17c',initialState}){
 if(n<flowN||n%flowN||n*n*8>device.limits.maxStorageBufferBindingSize)throw Error('Unsupported fine thickness grid.');
 const owned=[],buffer=(size,usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC)=>{const b=device.createBuffer({size,usage});owned.push(b);return b;};
 const state=buffer(n*n*4),stage=buffer(n*n*4),result=buffer(n*n*4),fx=buffer(n*(n+1)*4),fy=buffer(n*(n+1)*4),limits=buffer(n*n*8),u=buffer(flowN*(flowN+1)*4),v=buffer(flowN*(flowN+1)*4),uniform=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),read=buffer(n*n*4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
 const cached=new Float32Array(n*n),phase=(parseInt(seed.slice(-8),16)>>>0)/4294967296*2*Math.PI;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)cached[y*n+x]=initialState?.[y*n+x]??initialThickness((x+.5)/n,(y+.5)/n,phase);
 const initial=cached.slice();device.queue.writeBuffer(state,0,cached);
 const module=device.createShaderModule({code,label:'Fine soap-film conservative thickness'}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>m.message).join('\n'));
 const layout=device.createBindGroupLayout({entries:[...Array.from({length:7},(_,binding)=>({binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding>=5?'read-only-storage':'storage'}})),{binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}]});
 const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]}),pipelines={};
 for(const entryPoint of ['corrections','donor','limit','apply','combine'])pipelines[entryPoint]=await device.createComputePipelineAsync({layout:pipelineLayout,compute:{module,entryPoint}});
 const group=(src,out)=>device.createBindGroup({layout,entries:[src,out,fx,fy,limits,u,v,uniform].map((b,binding)=>({binding,resource:{buffer:b}}))}),ab=group(state,stage),bc=group(stage,result),ac=group(state,result);
 let pending=null,disposed=false,lastReadTime=0,steps=0,generation=0,diagnosticCache=null;const costs=[];
 function diagnostics(){if(diagnosticCache)return diagnosticCache;let sum=0,min=Infinity,max=-Infinity;for(const h of cached){sum+=h;min=Math.min(min,h);max=Math.max(max,h);}return diagnosticCache={volumeM3:sum*(lengthMeters/n)**2*1e-9,thicknessRangeNm:[min,max]};}
 return{
  n,buffer:state,cached,initialDiagnostics:diagnostics(),
  advance(dt,U,V){if(disposed)return;const start=performance.now();device.queue.writeBuffer(u,0,U);device.queue.writeBuffer(v,0,V);let max=0;for(const a of U)max=Math.max(max,Math.abs(a));for(const a of V)max=Math.max(max,Math.abs(a));const count=Math.max(1,Math.ceil(dt/(.45*(lengthMeters/n)/Math.max(1e-6,2*max)))),bytes=new ArrayBuffer(16),view=new DataView(bytes);view.setUint32(0,n,true);view.setUint32(4,flowN,true);view.setFloat32(8,lengthMeters/n,true);view.setFloat32(12,dt/count,true);device.queue.writeBuffer(uniform,0,bytes);
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
   for(let k=0;k<count;k++){for(const g of [ab,bc]){pass.setBindGroup(0,g);for(const name of ['corrections','donor','limit','apply']){pass.setPipeline(pipelines[name]);pass.dispatchWorkgroups(Math.ceil((name==='corrections'||name==='limit'?n*(n+1):n*n)/64));}}pass.setBindGroup(0,ac);pass.setPipeline(pipelines.combine);pass.dispatchWorkgroups(Math.ceil(n*n/64));}
   pass.end();device.queue.submit([encoder.finish()]);steps+=count;costs.push(performance.now()-start);if(costs.length>240)costs.shift();
  },
  readback(time){if(disposed)return Promise.resolve();if(pending)return pending;const epoch=generation,encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(state,0,read,0,n*n*4);device.queue.submit([encoder.finish()]);pending=read.mapAsync(GPUMapMode.READ).then(()=>{if(epoch===generation&&!disposed){cached.set(new Float32Array(read.getMappedRange()));lastReadTime=time;diagnosticCache=null;}read.unmap();}).finally(()=>{pending=null;});return pending;},
  sample(x,y){const X=Math.max(0,Math.min(n-1,x*n-.5)),Y=Math.max(0,Math.min(n-1,y*n-.5)),i=Math.floor(X),j=Math.floor(Y),fx=X-i,fy=Y-j,a=j*n+i,b=j*n+Math.min(n-1,i+1),c=Math.min(n-1,j+1)*n+i,d=Math.min(n-1,j+1)*n+Math.min(n-1,i+1);return(cached[a]*(1-fx)+cached[b]*fx)*(1-fy)+(cached[c]*(1-fx)+cached[d]*fx)*fy;},
  snapshot(){const c=[...costs].sort((a,b)=>a-b);return{grid:[n,n],steps,lastReadTime,diagnostics:diagnostics(),cpuEncode:c.length?{medianMs:c[Math.floor(c.length*.5)],p95Ms:c[Math.floor(c.length*.95)],samples:c.length}:null};},
  reset(){generation++;cached.set(initial);diagnosticCache=null;device.queue.writeBuffer(state,0,cached);lastReadTime=0;steps=0;},
  dispose(){disposed=true;owned.forEach(b=>b.destroy());}
 };
}
