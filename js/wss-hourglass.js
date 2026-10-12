/* One glass profile for native grain contacts and its Canvas outline.
 * The finish reads the resident particle buffer; it never moves a grain. */
(function(root){
'use strict';
var G={cx:360,top:56,bottom:344,shoulder:80,upper:108,neckTop:190,neckBottom:210,lower:292,heel:320,wide:104,end:80,neck:4.5,radius:2.5/Math.sqrt(3.2)*.5};
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
var PROFILE=`
fn halfWidth(y:f32)->f32 {
 if(y<${G.shoulder}.) {let t=(${G.shoulder}.-y)/${G.shoulder-G.top}.;return ${G.end}.+${G.wide-G.end}.*sqrt(max(0.,1.-t*t));}
 if(y<${G.upper}.) {return ${G.wide}.;}
 if(y<${G.neckTop}.) {let t=clamp((y-${G.upper}.)/${G.neckTop-G.upper}.,0.,1.);return mix(${G.wide}.,${G.neck},t*t*(3.-2.*t));}
 if(y<${G.neckBottom}.) {return ${G.neck};}
 if(y<${G.lower}.) {let t=clamp((y-${G.neckBottom}.)/${G.lower-G.neckBottom}.,0.,1.);return mix(${G.neck},${G.wide}.,t*t*(3.-2.*t));}
 if(y<${G.heel}.) {return ${G.wide}.;}
 let t=(y-${G.heel}.)/${G.bottom-G.heel}.;return ${G.end}.+${G.wide-G.end}.*sqrt(max(0.,1.-t*t));
}
`;
var CONTACT=PROFILE+`
@group(0) @binding(0) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(1) var<storage,read_write> aux:array<vec4f>;
@group(0) @binding(2) var<storage,read> flag:array<u32>;
@group(0) @binding(3) var<uniform> count:vec4u;
@compute @workgroup_size(256)
fn predict(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=count.x || (flag[i]&32u)!=0u){return;}
 let h=bitcast<f32>(count.y);let gravity=bitcast<f32>(count.z);
 let p=pos[i];let acceleration=vec2f(0.,gravity);
 pos[i]=vec4f(p.xy+p.zw*h+acceleration*(.5*h*h),p.zw+acceleration*h);
 aux[i]=vec4f(aux[i].xy,p.xy);
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=count.x || (flag[i]&32u)!=0u){return;}
 var p=pos[i].xy;var v=pos[i].zw;
 // Resolve only contact. Freefall, packing, momentum and grain friction
 // remain in the native material/contact solvers.
 if(p.y<${G.top+G.radius}){p.y=${G.top+G.radius};if(v.y<0.){v.y=-v.y*.025;}}
 if(p.y>${G.bottom-G.radius}){p.y=${G.bottom-G.radius};if(v.y>0.){v.y=-v.y*.025;}}
 for(var k=0;k<4;k++){
  let side=select(-1.,1.,p.x>=${G.cx}.);
  let width=halfWidth(p.y);
  let slope=(halfWidth(min(${G.bottom}.,p.y+.05))-halfWidth(max(${G.top}.,p.y-.05)))/.1;
  let normal=normalize(vec2f(side,-slope));
  let distance=(width-abs(p.x-${G.cx}.))*abs(normal.x);
  if(distance>=${G.radius}){break;}
  p-=normal*(${G.radius}-distance);
  p.y=clamp(p.y,${G.top+G.radius},${G.bottom-G.radius});
  let incoming=dot(v,normal);
  if(incoming>0.){
   v-=normal*(1.025*incoming);
   let tangent=vec2f(-normal.y,normal.x);let speed=dot(v,tangent);
   v-=tangent*clamp(speed,-incoming*.18,incoming*.18);
  }
 }
 pos[i]=vec4f(p,v);aux[i]=vec4f(aux[i].xy,p);
}
`;
var FINISH=`
struct View {size:vec4f,low:vec4f,high:vec4f};
@group(0) @binding(0) var<storage,read> pos:array<vec4f>;
@group(0) @binding(1) var<storage,read> flag:array<u32>;
@group(0) @binding(2) var<uniform> view:View;
struct Out {@builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) tint:f32};
@vertex fn vs(@builtin(vertex_index) vid:u32,@builtin(instance_index) i:u32)->Out {
 var o:Out;o.p=vec4f(2.,2.,0.,1.);o.uv=vec2f(0.);o.tint=0.;
 if((flag[i]&32u)!=0u){return o;}
 let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 let c=corners[vid];let point=pos[i].xy+c*${G.radius};
 o.p=vec4f(point.x/view.size.x*2.-1.,1.-point.y/view.size.y*2.,0.,1.);o.uv=c;
 // Stable mineral variation rides the grain identity, never screen pixels.
 o.tint=f32((i*1664525u+1013904223u)%97u)/96.;return o;
}
@fragment fn fs(o:Out)->@location(0) vec4f {
 let r=length(o.uv);let edge=max(fwidth(r),.04);
 let alpha=1.-smoothstep(1.-edge,1.+edge,r);
 let light=clamp(.48+.23*o.tint-.18*o.uv.x-.2*o.uv.y-.18*r*r,0.,1.);
 let color=mix(view.low.rgb,view.high.rgb,light);
 return vec4f(color*alpha,alpha);
}
`;
function rgb(hex){return [1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16)/255;});}
async function create(context){
 var L=context.liquid,device=L.device,queue=L.queue,slip=L.materialSlip;
 var canvas=document.createElement('canvas');canvas.id='toy-hourglass-grains';canvas.setAttribute('aria-hidden','true');
 canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;';
 var renderContext=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();
 var buffers=[],retired=false,previousContact=slip.afterGrains,previousEncode=slip.encode,previousStats=slip.stats,previousRemainder=L.getSimParam('RETAIN_SUBQUANTUM_REMAINDER'),previousVisibility=L.renderCanvas.style.visibility;
 function buffer(label,size){var b=device.createBuffer({label:label,size:size,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});buffers.push(b);return b;}
 var count=buffer('hourglass.contactCount',16),view=buffer('hourglass.finishView',48);
 device.pushErrorScope('validation');var scopeOpen=true;
 try{
  var contactModule=device.createShaderModule({label:'hourglass.glassContact',code:CONTACT});
  var finishModule=device.createShaderModule({label:'hourglass.residentGrains',code:FINISH});
  var info=await Promise.all([contactModule.getCompilationInfo(),finishModule.getCompilationInfo()]);
  var faults=info.flatMap(function(result){return result.messages.filter(function(message){return message.type==='error';}).map(function(message){return message.lineNum+': '+message.message;});});
  if(faults.length)throw Error(faults.join('\n'));
  var pipelines=await Promise.all([
   device.createComputePipelineAsync({layout:'auto',compute:{module:contactModule,entryPoint:'main'}}),
   device.createComputePipelineAsync({layout:'auto',compute:{module:contactModule,entryPoint:'predict'}}),
   device.createRenderPipelineAsync({layout:'auto',vertex:{module:finishModule,entryPoint:'vs'},fragment:{module:finishModule,entryPoint:'fs',targets:[{format:format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}})
  ]);
  var contact=pipelines[0],predict=pipelines[1],finish=pipelines[2];
  var contactGroup=device.createBindGroup({layout:contact.getBindGroupLayout(0),entries:[L.buf.pos,L.buf.aux,L.buf.flag,count].map(function(b,i){return {binding:i,resource:{buffer:b}};})});
  var predictGroup=device.createBindGroup({layout:predict.getBindGroupLayout(0),entries:[L.buf.pos,L.buf.aux,L.buf.flag,count].map(function(b,i){return {binding:i,resource:{buffer:b}};})});
  var finishGroup=device.createBindGroup({layout:finish.getBindGroupLayout(0),entries:[L.buf.pos,L.buf.flag,view].map(function(b,i){return {binding:i,resource:{buffer:b}};})});
  var error=await device.popErrorScope();scopeOpen=false;if(error)throw Error(error.message);
 }catch(e){if(scopeOpen)try{await device.popErrorScope();}catch(_){}buffers.forEach(function(b){b.destroy();});throw e;}
 var stage=document.getElementById('toy-stage');stage.appendChild(canvas);
 renderContext.configure({device:device,format:format,alphaMode:'premultiplied'});
 L.renderCanvas.style.visibility='hidden';L.setSimParam('RETAIN_SUBQUANTUM_REMAINDER',1);
 var palette=getComputedStyle(document.documentElement),gold=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--accent').trim()),cream=rgb(palette.getPropertyValue('--app-brass').trim()||palette.getPropertyValue('--text').trim());
 var finishParams=new Float32Array(12);finishParams.set([720,400,0,0]);
 finishParams.set(gold.map(function(v){return v*.56;}).concat([1]),4);finishParams.set(cream.concat([1]),8);queue.writeBuffer(view,0,finishParams);
 var inner=outline(0),outer=outline(4),coat=new Path2D(outer);coat.addPath(inner);
 // Dry grains carry their own ballistic momentum. Reuse the stock native
 // contact passes without liquid APIC averaging in this all-grain scene.
 slip.encode=function(encoder){
  var bytes=new ArrayBuffer(16),u=new Uint32Array(bytes),f=new Float32Array(bytes);u[0]=L.uploadedCount;f[1]=L.stepDt;f[2]=L.simParamsHost[0];queue.writeBuffer(count,0,bytes);
  // Native contact reconciliation must use the actual slow simulation step.
  queue.writeBuffer(L.snowGrainParams,12,new Float32Array([L.stepDt]));
  var pass=encoder.beginComputePass({label:'hourglass.nativeGrainGravity'});pass.setPipeline(predict);pass.setBindGroup(0,predictGroup);pass.dispatchWorkgroups(Math.ceil(L.uploadedCount/256));pass.end();
 };
 slip.stats=function(){return Object.assign({},previousStats.call(slip),{method:'Ballistic native grains with compressive pair contacts and friction, inside the shared glass profile. No calibrated sand constitutive law.'});};
 slip.afterGrains=function(encoder){
  previousContact.call(slip,encoder);
  var pass=encoder.beginComputePass({label:'hourglass.sharedGlassContact'});pass.setPipeline(contact);pass.setBindGroup(0,contactGroup);pass.dispatchWorkgroups(Math.ceil(L.uploadedCount/256));pass.end();
 };
 return {
  render:function(){
   if(retired || !L.renderActive)return;
   // Match the source display resolution, including zoom and device density.
   var source=L.renderCanvas;if(canvas.width!==source.width || canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height;}
   var encoder=device.createCommandEncoder({label:'hourglass.finish'}),pass=encoder.beginRenderPass({colorAttachments:[{view:renderContext.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
   pass.setPipeline(finish);pass.setBindGroup(0,finishGroup);pass.draw(6,L.uploadedCount);pass.end();queue.submit([encoder.finish()]);
  },
  draw:function(c){
   c.save();c.lineJoin='round';
   // Thin glass with restrained edge reflections. All inner edges use the
   // same profile as the GPU contact, without the old broad covering lip.
   var tint=c.createLinearGradient(250,0,470,0);tint.addColorStop(0,'rgba('+gold.map(function(v){return Math.round(v*255);}).join(',')+',.17)');tint.addColorStop(.28,'rgba('+gold.map(function(v){return Math.round(v*255);}).join(',')+',.025)');tint.addColorStop(1,'rgba('+gold.map(function(v){return Math.round(v*255);}).join(',')+',.11)');
   c.fillStyle=tint;c.fill(coat,'evenodd');
   c.strokeStyle=palette.getPropertyValue('--accent').trim();c.lineWidth=.65;c.globalAlpha=.48;c.stroke(outer);
   c.globalAlpha=.75;c.lineWidth=.65;c.stroke(inner);
   c.globalAlpha=.2;c.lineWidth=2;c.stroke(inner);
   // Short end bands ground the two bulbs without enclosing them in a box.
   c.globalAlpha=.55;c.lineWidth=.8;c.beginPath();c.moveTo(279,52);c.lineTo(441,52);c.moveTo(279,348);c.lineTo(441,348);c.stroke();
   c.restore();
  },
  stats:function(){return {glassProfile:G,finish:'Resident native grains',finiteCharge:true};},
  destroy:function(){if(retired)return;retired=true;slip.afterGrains=previousContact;slip.encode=previousEncode;slip.stats=previousStats;L.setSimParam('RETAIN_SUBQUANTUM_REMAINDER',previousRemainder);L.renderCanvas.style.visibility=previousVisibility;canvas.remove();renderContext.unconfigure();buffers.forEach(function(b){b.destroy();});}
 };
}
root.WSSHourglass={geometry:function(){return Object.assign({},G);},halfWidth:halfWidth,contains:contains,create:create};
})(typeof window!=='undefined'?window:globalThis);
