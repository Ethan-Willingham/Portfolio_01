import { FilmModel, parameters } from './soap-film-model.js';
export const roomInfo = { apiVersion: 1, id: 'soap-film', title: 'Soap film',
  model: 'Flat depth-averaged Boussinesq MAC flow with conservative thickness transport, cubic gravity drainage and phenomenological rupture',
  representativeScaleMeters: .16, scaleMeaning: 'side length of the square frame, an assumed apparatus dimension',
  sources: ['https://doi.org/10.1103/PhysRevLett.100.144501','https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer','https://cie.co.at/datatable/cie-standard-illuminant-d65','https://pages.nist.gov/SCATMECH/code/filmtran.cpp'] };
const shader = `
struct Params { size: vec2f, grid: f32, exposure: f32, angle: f32, state: f32, radius: f32, pad: f32, hole: vec2f, rest: f32, pad2: f32 };
@group(0) @binding(0) var<storage,read> thickness: array<f32>;
@group(0) @binding(1) var lut: texture_2d<f32>;
@group(0) @binding(2) var<uniform> p: Params;
struct V { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) i:u32)->V { var a=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); var o:V;o.pos=vec4f(a[i],0,1);return o; }
fn value(c:vec2i)->f32 {let n=i32(p.grid);let q=clamp(c,vec2i(0),vec2i(n-1));return thickness[u32(q.y*n+q.x)];}
fn spectrum(h:f32)->vec3f {let x=clamp(h,0.0,4095.0);let y=clamp(p.angle*.5,0.0,30.0);let i=i32(x);let j=i32(y);
return mix(mix(textureLoad(lut,vec2i(i,j),0).rgb,textureLoad(lut,vec2i(min(i+1,4095),j),0).rgb,fract(x)),mix(textureLoad(lut,vec2i(i,min(j+1,30)),0).rgb,textureLoad(lut,vec2i(min(i+1,4095),min(j+1,30)),0).rgb,fract(x)),fract(y));}
@fragment fn fs(v:V)->@location(0) vec4f {
 let side=min(p.size.x*.82,p.size.y*.84);let uv=(v.pos.xy-p.size*.5)/side+.5;
 let edge=max(abs(uv.x-.5),abs(uv.y-.5));
 if(edge>.504){return vec4f(0,0,0,1);} if(edge>.5){return vec4f(vec3f(.012)*p.exposure,1);}
 if(p.state>1.5){return vec4f(0,0,0,1);}
 let q=uv*p.grid-.5;let c=vec2i(floor(q));let f=fract(q);
 let h=mix(mix(value(c),value(c+vec2i(1,0)),f.x),mix(value(c+vec2i(0,1)),value(c+vec2i(1,1)),f.x),f.y);
 var rgb=spectrum(h);let Y=max(0.0,dot(rgb,vec3f(.2126,.7152,.0722)));let lo=min(rgb.r,min(rgb.g,rgb.b));
 if(lo<0.0){rgb=mix(vec3f(Y),rgb,Y/(Y-lo));} rgb=max(rgb,vec3f(0));
 var mask=1.0;if(p.state>.5){mask=smoothstep(p.radius-.0015,p.radius+.0015,distance(uv,p.hole));}
 return vec4f(rgb*p.exposure*mask*p.rest,1);
}`;
export async function createRoom({device, seed = '51a9f17c', quality = 'medium', assetBaseURL}) {
 if(!device?.createRenderPipeline)throw Error('Soap film requires an available WebGPU device; the standalone page supplies a labelled still.');
 if(!/^[0-9a-f]+$/i.test(seed))throw Error('Soap film seed must be a fixed hexadecimal string.');
 const requestedQuality=quality; let n={low:128,medium:256,high:512}[quality];if(!n)throw Error('Unknown soap-film quality.');
 if(device.limits.maxTextureDimension2D<4096||device.limits.maxStorageBufferBindingSize<n*n*4)throw Error('WebGPU limits are insufficient for the soap-film lookup or state.');
 const base=assetBaseURL?new URL(assetBaseURL):new URL('../assets/visualizer/soap-film/',import.meta.url),abort=new AbortController();
 const response=await fetch(new URL('linear-lut.bin',base),{signal:abort.signal});if(!response.ok)throw Error('Soap-film spectral lookup failed to load.');
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==4096*31*16)throw Error('Invalid soap-film spectral lookup length.');
 let model=new FilmModel(n,seed),field=device.createBuffer({size:n*n*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const uniform=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const lut=device.createTexture({size:[4096,31],format:'rgba32float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 device.queue.writeTexture({texture:lut},bytes,{bytesPerRow:4096*16},[4096,31]);device.queue.writeBuffer(field,0,model.h);
 const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'read-only-storage'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'unfilterable-float'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
 const module=device.createShaderModule({code:shader,label:'Soap film: spectral reflection'});
 const info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>m.message).join('\n'));
 const pipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list'}});
 let group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:field}},{binding:1,resource:lut.createView()},{binding:2,resource:{buffer:uniform}}]});
 let width=1,height=1,accumulator=0,lastMeasure=0,disposed=false,angle=18,measured=model.diagnostics;
 const solverCosts=[],encodeCosts=[],gpuCosts=[];let frames=0,timingPending=false,timingInterval=60,mappingPending=false,workBudget=2,adaptiveReductions=0,droppedAmbientSeconds=0;
 const timestamps=device.features.has('timestamp-query'),queries=timestamps?device.createQuerySet({type:'timestamp',count:2}):null;
 const resolve=timestamps?device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}):null;
 const read=timestamps?device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}):null;
 const add=(a,v)=>{a.push(v);if(a.length>240)a.shift();};const stats=a=>{if(!a.length)return null;const b=[...a].sort((a,b)=>a-b);return{medianMs:b[Math.floor(b.length*.5)],p95Ms:b[Math.floor(b.length*.95)],samples:b.length};};
 return {
  resize(s){width=Math.max(1,s.width);height=Math.max(1,s.height);},
  step({dtSeconds}){if(disposed)return;const added=Math.max(0,Math.min(.1,dtSeconds));droppedAmbientSeconds+=Math.max(0,accumulator+added-.12);accumulator=Math.min(.12,accumulator+added);let work=0;const start=performance.now(),stepBefore=model.steps;
   while(accumulator>=parameters.dtSeconds&&work<workBudget){model.advance(parameters.dtSeconds);accumulator-=parameters.dtSeconds;work++;}
   if(work){if(model.steps>stepBefore)add(solverCosts,(performance.now()-start)/work);device.queue.writeBuffer(field,0,model.h);}
   if(model.time-lastMeasure>=1){measured=model.measure();lastMeasure=model.time;}
  },
  render({encoder,targetView,width:w=width,height:h=height,exposure=12}){if(disposed)return;const start=performance.now();
   const hole=model.hole;device.queue.writeBuffer(uniform,0,new Float32Array([w,h,n,exposure,angle,{intact:0,rupturing:1,rest:2}[model.state],hole?hole.radius/parameters.lengthMeters:0,0,hole?.x??0,hole?.y??0,(model.cycle>1?Math.min(1,model.age/6)**2*(3-2*Math.min(1,model.age/6)):1),0]));
   const timed=timestamps&&!timingPending&&frames++%timingInterval===0;
   const pass=encoder.beginRenderPass({colorAttachments:[{view:targetView,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}],...(timed?{timestampWrites:{querySet:queries,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{})});
   pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
   if(timed){timingPending=true;encoder.resolveQuerySet(queries,0,2,resolve,0);encoder.copyBufferToBuffer(resolve,0,read,0,16);
   } add(encodeCosts,performance.now()-start);
  },
  afterSubmit(){
   if(!timingPending||mappingPending||disposed)return;mappingPending=true;
   read.mapAsync(GPUMapMode.READ).then(()=>{const t=new BigUint64Array(read.getMappedRange());add(gpuCosts,Number(t[1]-t[0])/1e6);read.unmap();}).catch(()=>{}).finally(()=>{timingPending=false;mappingPending=false;});
  },
  snapshot(){return { ...roomInfo, numericalStepCount:model.steps,simulationTime:model.time,simulationTimeUnits:'seconds in the reduced model; rupture replay slowed 240 times',parameters:{...parameters,viewingAngleDegrees:angle},quality,requestedQuality,adaptiveReductions,workBudget,droppedAmbientSeconds,grid:[n,n],seed,seedProvenance:'offline deterministic hexadecimal seed; no random forcing or external beacon',diagnosticAgeSeconds:model.time-lastMeasure,diagnostics:{...measured},performance:{solverCPU:stats(solverCosts),opticalCompositeCPUEncode:stats(encodeCosts),opticalCompositeGPU:stats(gpuCosts),timestampQueries:timestamps},elapsedConvention:'one ambient second equals one model second while caught up; bounded work can slow wall-clock playback',precision:'Float32 state, JavaScript Float64 arithmetic'};},
  async debugReadback(){const diagnostics=model.measure();measured=diagnostics;lastMeasure=model.time;return{...this.snapshot(),state:{h:Array.from(model.h),temperatureC:Array.from(model.t),u:Array.from(model.u),v:Array.from(model.v)},events:model.events.map(e=>({...e}))};},
  sampleAt(x,y){const X=Math.max(0,Math.min(1,x)),Y=Math.max(0,Math.min(1,y));return{thicknessNm:model.sample(model.h,n,n,X*n-.5,Y*n-.5),temperatureC:model.sample(model.t,n,n,X*n-.5,Y*n-.5),x:X,y:Y,diagnosticAgeSeconds:0,hole:model.state==='rest'||(model.hole&&Math.hypot(X-model.hole.x,Y-model.hole.y)<model.hole.radius/parameters.lengthMeters)};},
  setWorkBudget(count){workBudget=Math.max(1,Math.min(2,count));},
  setTimingInterval(count){timingInterval=Math.max(1,count);},
  reduceQuality(){
   if(n<=128||disposed)return false;
   const old=model,m=n/2,next=new FilmModel(m,seed);
   for(let y=0;y<m;y++)for(let x=0;x<m;x++){const i=2*y*n+2*x,j=y*m+x;next.h[j]=(old.h[i]+old.h[i+1]+old.h[i+n]+old.h[i+n+1])/4;next.t[j]=(old.t[i]+old.t[i+1]+old.t[i+n]+old.t[i+n+1])/4;}
   for(let y=0;y<m;y++)for(let x=0;x<=m;x++)next.u[y*(m+1)+x]=(old.u[2*y*(n+1)+2*x]+old.u[(2*y+1)*(n+1)+2*x])/2;
   for(let y=0;y<=m;y++)for(let x=0;x<m;x++)next.v[y*m+x]=(old.v[2*y*n+2*x]+old.v[2*y*n+2*x+1])/2;
   for(const key of ['steps','time','cycle','evap','drain','replenished','discarded','rimVolume','state','age','phase'])next[key]=old[key];next.hole=old.hole?{...old.hole}:null;next.events=old.events.map(e=>({...e}));next.project();
   model=next;n=m;quality=m===128?'low':'medium';adaptiveReductions++;field.destroy();field=device.createBuffer({size:n*n*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
   group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:field}},{binding:1,resource:lut.createView()},{binding:2,resource:{buffer:uniform}}]});device.queue.writeBuffer(field,0,model.h);measured=model.measure();lastMeasure=model.time;solverCosts.length=0;return true;
  },
  setViewingAngle(a){angle=Math.max(0,Math.min(60,a));},
  restart(){model.h.fill(0);model.rimVolume=0;model.steps=0;model.time=0;model.cycle=0;model.events=[];model.evap=0;model.drain=0;model.replenished=0;model.discarded=0;model.reset();accumulator=0;device.queue.writeBuffer(field,0,model.h);measured=model.diagnostics;lastMeasure=model.time;},
  dispose(){disposed=true;abort.abort();field.destroy();uniform.destroy();lut.destroy();queries?.destroy();resolve?.destroy();read?.destroy();}
 };
}
