/* Finite dry grains with an exact, diameter-sized GPU neighbor grid.
 * Glass contacts and the visible glass thickness share the same profile. */
(function(root){
'use strict';
var G={cx:360,top:56,bottom:344,shoulder:80,upper:108,neckTop:196,neckBottom:204,lower:292,heel:320,wide:104,end:80,neck:1.54,radius:.35,scale:2,pitch:.7*1.03};
var grainFriction=.55,glassFriction=.32;
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
function contains(x,y,pad){pad=pad||0;return y>=G.top+pad && y<=G.bottom-pad && Math.abs(x-G.cx)<=halfWidth(y)-pad;}
function outline(pad){
 var p=new Path2D();p.moveTo(G.cx-G.end-pad,G.top-pad);p.lineTo(G.cx+G.end+pad,G.top-pad);
 for(var y=G.top;y<=G.bottom;y++)p.lineTo(G.cx+halfWidth(y)+pad,y);
 p.lineTo(G.cx+G.end+pad,G.bottom+pad);p.lineTo(G.cx-G.end-pad,G.bottom+pad);
 for(y=G.bottom;y>=G.top;y--)p.lineTo(G.cx-halfWidth(y)-pad,y);
 p.closePath();return p;
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
function solverSource(cols,rows,cell){return profileSource()+`
struct Params {count:u32,h:f32,gravity:f32,pad:f32};
@group(0) @binding(0) var<storage,read> source:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> dest:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> heads:array<atomic<u32>>;
@group(0) @binding(3) var<storage,read_write> links:array<u32>;
@group(0) @binding(4) var<uniform> cfg:Params;
const DIAMETER:f32=${G.radius*2};
const CELL:f32=${cell};
const COLS:u32=${cols}u;
const ROWS:u32=${rows}u;
fn cellAt(p:vec2f)->vec2i {
 return clamp(vec2i(floor((p-vec2f(${G.cx-G.wide-2}.,${G.top-2}.))/CELL)),vec2i(0),vec2i(i32(COLS)-1,i32(ROWS)-1));
}
fn glassContact(velocity:vec2f,normal:vec2f)->vec2f {
 let incoming=max(0.,dot(velocity,normal));
 let tangent=vec2f(-normal.y,normal.x);let speed=dot(velocity,tangent);
 return velocity-normal*incoming-tangent*clamp(speed,-incoming*${glassFriction},incoming*${glassFriction});
}
fn wall(state:vec4f)->vec4f {
 var p=state.xy;var v=state.zw;
 // The floor and ceiling resist sliding just like the curved glass does.
 if(p.y<${G.top+G.radius}){p.y=${G.top+G.radius};v=glassContact(v,vec2f(0.,-1.));}
 if(p.y>${G.bottom-G.radius}){p.y=${G.bottom-G.radius};v=glassContact(v,vec2f(0.,1.));}
 for(var k=0;k<4;k++){
  let side=select(-1.,1.,p.x>=${G.cx}.);
  let width=halfWidth(p.y);
  let slope=(halfWidth(min(${G.bottom}.,p.y+.01))-halfWidth(max(${G.top}.,p.y-.01)))/.02;
  let normal=normalize(vec2f(side,-slope));
  let distance=(width-abs(p.x-${G.cx}.))*abs(normal.x);
  if(distance>=${G.radius}){break;}
  p-=normal*(${G.radius}-distance);
  p.y=clamp(p.y,${G.top+G.radius},${G.bottom-G.radius});
  v=glassContact(v,normal);
 }
 return vec4f(p,v);
}
@compute @workgroup_size(256)
fn predict(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=cfg.count){return;}
 let p=source[i];let acceleration=vec2f(0.,cfg.gravity);
 dest[i]=wall(vec4f(p.xy+p.zw*cfg.h+acceleration*(.5*cfg.h*cfg.h),p.zw+acceleration*cfg.h));
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
   let relative=p.zw-other.zw;let closing=min(0.,dot(relative,normal));let support=-closing*.5;
   let tangent=relative-normal*dot(relative,normal);
   impulse+=normal*support-tangent*min(.5,${grainFriction}*support/max(length(tangent),.00001));
  }
 }}
 let relax=1./max(1.,neighbors*.5);shift*=relax;
 var velocity=p.zw+impulse*relax;
 // Remove only motion blocked by a compressive constraint, adding no bounce.
 let constraint=shift/cfg.h;let strength=dot(constraint,constraint);
 if(strength>1e-12){velocity-=constraint*min(0.,dot(velocity,constraint))/strength;}
 dest[i]=wall(vec4f(p.xy+shift,velocity));
}
`;}

function finishSource(){return `
struct View {size:vec4f,low:vec4f,high:vec4f};
@group(0) @binding(0) var<storage,read> pos:array<vec4f>;
@group(0) @binding(1) var<storage,read> flag:array<u32>;
@group(0) @binding(2) var<uniform> view:View;
struct Out {@builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) tint:f32};
@vertex fn vs(@builtin(vertex_index) vid:u32,@builtin(instance_index) i:u32)->Out {
 var o:Out;o.p=vec4f(2.,2.,0.,1.);o.uv=vec2f(0.);o.tint=0.;
 if((flag[i]&32u)!=0u){return o;}
 let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let c=corners[vid];let offset=c*(${G.radius}+.5*view.size.z);let point=pos[i].xy+offset;
 o.p=vec4f(point.x/view.size.x*2.-1.,1.-point.y/view.size.y*2.,0.,1.);o.uv=offset;
 // Stable mineral variation rides the grain identity, never screen pixels.
 var hash=i*747796405u+2891336453u;hash=(hash^(hash>>16u))*2246822519u;hash^=hash>>13u;o.tint=f32(hash&65535u)/65535.;return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 // Pixel coverage conserves the disc's area, even below one device pixel.
 // The half-pixel fringe is antialiasing, never a larger collision footprint.
 let pixel=view.size.z;let radius=${G.radius};let support=radius+.5*pixel;
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
async function create(context){
 var L=context.liquid,device=L.device,queue=L.queue,slip=L.materialSlip;
 var canvas=document.createElement('canvas');canvas.id='toy-hourglass-grains';canvas.setAttribute('aria-hidden','true');
 canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;';
 var renderContext=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();
 var buffers=[],retired=false,previousStats=slip.stats,previousUpdate=L.update,previousDraw=L.draw,previousTiming=L.getTimingState,previousAwake=L.awakeCount,previousVisibility=L.renderCanvas.style.visibility;
 function buffer(label,size,usage){var b=device.createBuffer({label:label,size:size,usage:usage});buffers.push(b);return b;}
 var uniform=GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,storage=GPUBufferUsage.STORAGE;
 var count=buffer('hourglass.step',16,uniform),view=buffer('hourglass.finishView',48,uniform);
 var cell=G.radius*2,cols=Math.ceil((G.wide*2+4)/cell),rows=Math.ceil((G.bottom-G.top+4)/cell);
 var heads=buffer('hourglass.cellHeads',cols*rows*4,storage),links=buffer('hourglass.nextGrain',L.maxParticles*4,storage);
 var next=buffer('hourglass.contactSnapshot',L.maxParticles*16,storage|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 var state=[L.buf.pos,next],pipes={},groups={};
 device.pushErrorScope('validation');var scopeOpen=true;
 try{
  var contactModule=device.createShaderModule({label:'hourglass.exactGrains',code:solverSource(cols,rows,cell)});
  var finishModule=device.createShaderModule({label:'hourglass.residentGrains',code:finishSource()});
  var info=await Promise.all([contactModule.getCompilationInfo(),finishModule.getCompilationInfo()]);
  var faults=info.flatMap(function(result){return result.messages.filter(function(message){return message.type==='error';}).map(function(message){return message.lineNum+': '+message.message;});});
  if(faults.length)throw Error(faults.join('\n'));
  var bindings={predict:[0,1,4],clear:[0,2,4],scatter:[0,2,3,4],contacts:[0,1,2,3,4]};
  await Promise.all(Object.keys(bindings).map(async function(name){
   var pipeline=await device.createComputePipelineAsync({label:'hourglass.'+name,layout:'auto',compute:{module:contactModule,entryPoint:name}});pipes[name]=pipeline;
   groups[name]=[0,1].map(function(side){var resources=[state[side],state[1-side],heads,links,count];return device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});});
  }));
  var finish=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:finishModule,entryPoint:'vs'},fragment:{module:finishModule,entryPoint:'fs',targets:[{format:format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}});
  var finishGroup=device.createBindGroup({layout:finish.getBindGroupLayout(0),entries:[L.buf.pos,L.buf.flag,view].map(function(b,i){return {binding:i,resource:{buffer:b}};})});
  var error=await device.popErrorScope();scopeOpen=false;if(error)throw Error(error.message);
 }catch(e){if(scopeOpen)try{await device.popErrorScope();}catch(_){}buffers.forEach(function(b){b.destroy();});throw e;}
 var stage=document.getElementById('toy-stage');stage.appendChild(canvas);
 renderContext.configure({device:device,format:format,alphaMode:'premultiplied'});
 L.renderCanvas.style.visibility='hidden';L.awakeCount=L.uploadedCount;
 var palette=getComputedStyle(document.documentElement),gold=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--accent').trim()),cream=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--text').trim());
 var finishParams=new Float32Array(12);finishParams.set([720,400,720/Math.max(1,canvas.width),0]);
 finishParams.set(gold.map(function(v){return v*.56;}).concat([1]),4);finishParams.set(cream.concat([1]),8);queue.writeBuffer(view,0,finishParams);
 var inner=outline(0),outer=outline(7),coat=new Path2D(outer);coat.addPath(inner);
 // A fixed small quantum preserves the slow clock. Three contact iterations
 // ping-pong immutable snapshots, rebuilding exact neighbor lists each time.
 // The final result always lives in the native resident buffer, including jolt.
 var h=1/(240*G.scale),accumulator=0,stepBytes=new ArrayBuffer(16),stepU=new Uint32Array(stepBytes),stepF=new Float32Array(stepBytes);
 var completedSteps=0;
 function dispatch(pass,name,side,work){pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name][side]);pass.dispatchWorkgroups(Math.ceil(work/256));}
 L.update=function(dt){
  if(retired||!L.simActive||!Number.isFinite(dt)||dt<=0)return;
  accumulator+=Math.min(dt,.05)*L.getSimParam('TIMESCALE');
  var steps=Math.floor((accumulator+1e-10)/h);if(!steps)return;
  accumulator-=steps*h;stepU[0]=L.uploadedCount;stepF[1]=h;stepF[2]=L.getSimParam('GRAVITY');queue.writeBuffer(count,0,stepBytes);
  var encoder=device.createCommandEncoder({label:'hourglass.fineGrains'}),pass=encoder.beginComputePass();
  for(var step=0;step<steps;step++){
   dispatch(pass,'predict',0,L.uploadedCount);var side=1;
   for(var iteration=0;iteration<3;iteration++){
    dispatch(pass,'scatter',side,L.uploadedCount);dispatch(pass,'contacts',side,L.uploadedCount);
    // Clear exactly the cells just read. Empty glass costs no clearing work.
    dispatch(pass,'clear',side,L.uploadedCount);side=1-side;
   }
  }
  pass.end();queue.submit([encoder.finish()]);L.stepDt=h;L.simulationClock+=steps*h;completedSteps+=steps;
 };
 // Keep the established viewport sizing without drawing an invisible water
 // surface, running its grid, or copying the entire pile back to the CPU.
 L.getTimingState=function(){return {fixedStep:true,accumulator:accumulator,substepDt:h,timeScale:L.getSimParam('TIMESCALE'),gravity:L.getSimParam('GRAVITY'),moduleSharedAccumulator:false};};
 L.draw=function(){var v=L.liquid.getView(),source=L.renderCanvas;if(source.width!==v.canvasW)source.width=v.canvasW;if(source.height!==v.canvasH)source.height=v.canvasH;return L.uploadedCount;};
 slip.stats=function(){return Object.assign({},previousStats.call(slip),{commonGravity:L.getSimParam('GRAVITY'),referenceArea:Math.PI*G.radius*G.radius,grainDiameter:G.radius*2,method:'Finite dry grains, exact local pair contacts and friction, with a shared glass profile. No calibrated sand constitutive law.'});};
 return {
  render:function(){
   if(retired || !L.renderActive)return;
   // Match the source display resolution, including zoom and device density.
   var source=L.renderCanvas;if(canvas.width!==source.width || canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height;finishParams[2]=720/canvas.width;queue.writeBuffer(view,0,finishParams);}
   var encoder=device.createCommandEncoder({label:'hourglass.finish'}),pass=encoder.beginRenderPass({colorAttachments:[{view:renderContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
   pass.setPipeline(finish);pass.setBindGroup(0,finishGroup);pass.draw(6,L.uploadedCount);pass.end();queue.submit([encoder.finish()]);
  },
  draw:function(c){
   c.save();
   // The cavity ends on the exact GPU profile. The glass has visible
   // thickness outside it, with all lighting clipped to that material.
   var tint=c.createLinearGradient(250,0,470,0);
   tint.addColorStop(0,palette.getPropertyValue('--line-mid').trim());
   tint.addColorStop(.3,palette.getPropertyValue('--rule-strong').trim());
   tint.addColorStop(.7,palette.getPropertyValue('--rule').trim());
   tint.addColorStop(1,palette.getPropertyValue('--rule-strong').trim());
   c.fillStyle=tint;c.fill(coat,'evenodd');
   c.clip(coat,'evenodd');c.fillStyle=palette.getPropertyValue('--text-dim').trim();c.globalAlpha=.16;
   c.fillRect(250,49,220,2);c.fillRect(250,344,220,2);
   c.restore();
  },
  stats:function(){return {glassProfile:G,finish:'Resident physical grains',finiteCharge:true,grainCount:L.uploadedCount,grainFriction:grainFriction,glassFriction:glassFriction,steps:completedSteps,stepSeconds:h,gridCells:cols*rows,neighborSearch:'Exact linked cells',solverBytes:cols*rows*4+L.maxParticles*20};},
  destroy:function(){if(retired)return;retired=true;slip.stats=previousStats;L.update=previousUpdate;L.draw=previousDraw;L.getTimingState=previousTiming;L.awakeCount=previousAwake;L.renderCanvas.style.visibility=previousVisibility;canvas.remove();renderContext.unconfigure();buffers.forEach(function(b){b.destroy();});}
 };
}
root.WSSHourglass={configure:configure,geometry:function(){return Object.assign({},G);},halfWidth:halfWidth,contains:contains,create:create};
})(typeof window!=='undefined'?window:globalThis);
