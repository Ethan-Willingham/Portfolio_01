// Private optional browser probe. Install before WebGPU devices are requested.
// Measures queue completion plus JS notification delay, never display presentation.
// Exported function can be injected with installCapacityObserver.toString().
export function installCapacityObserver(options={}) {
  const rows=[],errors=[],devices=[],maxPending=64,maxRows=4096;
  let active=false,droppedRows=0,lostCoverage=0,requestOriginal=null;
  const glStates=[],contextRestores=[],seenGL=new WeakSet();
  const glIntervalMs=options.glSampleIntervalMs??250;
  const countQuanta=!!options.countQuanta;
  const unsupportedGL=[];
  const now=()=>performance.now();
  const frame=()=>window.__sluicePerformance?.frameId??null;
  const error=e=>{errors.push(String(e));if(errors.length>16)errors.shift();};
  function observe(device){
    const state={id:devices.length+1,pending:0,maxPending:0,submits:0,fences:0,completed:0,latestSubmittedFrame:null,completedThroughFrame:null,scheduled:false,coalesced:null};
    devices.push(state);
    const queue=device.queue,original=queue.submit;
    const commandInfo=new WeakMap(),encoderOriginal=device.createCommandEncoder;
    if(countQuanta){
      try{device.createCommandEncoder=function(descriptor){
        const encoder=encoderOriginal.call(device,descriptor);
        if(!active||descriptor?.label!=='liquid.frame')return encoder;
        const info={encoderLabel:descriptor.label,passes:{},waterQuanta:0,snowGrainTicks:0};
        const begin=encoder.beginComputePass.bind(encoder),finish=encoder.finish.bind(encoder);
        encoder.beginComputePass=function(passDescriptor){
          const result=begin(passDescriptor),label=passDescriptor?.label||'unlabeled';
          info.passes[label]=(info.passes[label]||0)+1;
          if(label==='liquid.g2p')info.waterQuanta++;
          if(label==='snow.predict')info.snowGrainTicks++;
          return result;
        };
        encoder.finish=function(...args){const buffer=finish(...args);commandInfo.set(buffer,info);return buffer;};
        return encoder;
      };}catch(e){lostCoverage++;error(e);}
    }
    const submit=original.bind(queue);
    try{
      queue.submit=function(commands){
        if(!active)return submit(commands);
        const list=countQuanta?Array.from(commands):commands;
        const result=submit(list);
        const at=now(),id=frame();state.submits++;state.latestSubmittedFrame=id;
        // All synchronous submissions in this callback precede this fence.
        const previous=state.coalesced;
        state.coalesced={frameId:id,submittedAt:at,quanta:previous?.quanta||[]};
        if(countQuanta)for(const buffer of list){const info=commandInfo.get(buffer);if(info)state.coalesced.quanta.push(info);}
        if(!state.scheduled){state.scheduled=true;queueMicrotask(()=>{
          state.scheduled=false;const sample=state.coalesced;state.coalesced=null;
          if(!sample)return;
          if(state.pending>=maxPending){lostCoverage++;return;}
          state.pending++;state.fences++;state.maxPending=Math.max(state.maxPending,state.pending);
          const fencedAt=now();let completion;
          try{completion=queue.onSubmittedWorkDone();}
          catch(e){state.pending--;lostCoverage++;error(e);return;}
          completion.then(()=>{
            state.pending--;state.completed++;state.completedThroughFrame=sample.frameId;
            const completedAt=now();
            if(rows.length>=maxRows){droppedRows++;return;}
            rows.push({deviceId:state.id,...sample,fencedAt,completedAt,
              submitToCompletionCallbackMs:completedAt-sample.submittedAt,
              outstandingAtCallback:state.pending});
          },e=>{state.pending--;lostCoverage++;error(e);});
        });}
        return result;
      };
      state.restore=()=>{queue.submit=original;if(countQuanta)device.createCommandEncoder=encoderOriginal;};
    }catch(e){lostCoverage++;error(e);}
    device.lost.then(info=>error('Device '+state.id+' lost: '+info.message));
    return device;
  }
  function observeWebGL(gl,identity={}){
    if(!gl||seenGL.has(gl))return gl;
    seenGL.add(gl);
    if(typeof gl.fenceSync!=='function'||typeof gl.clientWaitSync!=='function'){
      unsupportedGL.push({...identity,reason:'No nonblocking WebGL2 sync API; no finish fallback'});return gl;
    }
    const state={id:glStates.length+1,identity,pending:[],maxPending:0,lastSample:-Infinity,
      scheduled:false,timer:null,drawCalls:0,samples:0,completed:0,skipped:0,drawFrame:null,restores:[]};
    glStates.push(state);
    function discard(item){try{gl.deleteSync(item.sync);}catch(e){error(e);}}
    function poll(){
      clearTimeout(state.timer);state.timer=null;
      for(let i=0;i<state.pending.length;){
        const item=state.pending[i];let result;
        try{result=gl.clientWaitSync(item.sync,0,0);}catch(e){result=gl.WAIT_FAILED;error(e);}
        if(result===gl.TIMEOUT_EXPIRED){i++;continue;}
        state.pending.splice(i,1);discard(item);
        if(result===gl.WAIT_FAILED){lostCoverage++;error('WebGL fence wait failed '+state.id);continue;}
        const completedAt=now();state.completed++;
        if(rows.length>=maxRows){droppedRows++;continue;}
        rows.push({kind:'webgl-completion-sample',contextId:state.id,identity,...item,sync:undefined,completedAt,
          submitToCompletionCallbackMs:completedAt-item.submittedAt,outstandingAtCallback:state.pending.length});
      }
      if(state.pending.length)state.timer=setTimeout(poll,8);
    }
    function afterDraw(){
      state.scheduled=false;poll();
      if(!active)return;
      const at=now();if(at-state.lastSample<glIntervalMs)return;
      state.lastSample=at;
      if(state.pending.length>=8){state.skipped++;lostCoverage++;return;}
      try{
        const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
        if(!sync){lostCoverage++;error('WebGL null fence '+state.id);return;}
        // Flush is required for progress; it is sampled and changes batching.
        gl.flush();state.pending.push({sync,frameId:state.drawFrame,submittedAt:at});state.samples++;
        state.maxPending=Math.max(state.maxPending,state.pending.length);poll();
      }catch(e){lostCoverage++;error(e);}
    }
    for(const name of ['drawArrays','drawElements','drawRangeElements','drawArraysInstanced','drawElementsInstanced']){
      if(typeof gl[name]!=='function')continue;const original=gl[name];
      try{gl[name]=function(...args){const result=original.apply(gl,args);if(active){state.drawCalls++;state.drawFrame=frame();
        if(!state.scheduled){state.scheduled=true;queueMicrotask(afterDraw);}}return result;};
        state.restores.push(()=>{gl[name]=original;});}catch(e){lostCoverage++;error(e);}
    }
    state.restore=()=>{clearTimeout(state.timer);state.timer=null;for(const item of state.pending)discard(item);
      state.pending=[];for(const restore of state.restores)restore();};
    return gl;
  }
  if(options.webgl){
    for(const Constructor of [window.HTMLCanvasElement,window.OffscreenCanvas]){
      if(!Constructor?.prototype?.getContext)continue;
      const prototype=Constructor.prototype,original=prototype.getContext;
      try{prototype.getContext=function(type,...args){const result=original.call(this,type,...args);
        if(['webgl','webgl2','experimental-webgl'].includes(type))observeWebGL(result,{type,
          canvasId:this.id||null,canvasClass:this.className||null,width:this.width,height:this.height,
          offscreen:Constructor===window.OffscreenCanvas});return result;};
        contextRestores.push(()=>{prototype.getContext=original;});}catch(e){lostCoverage++;error(e);}
    }
  }
  const api={observeDevice:observe,observeWebGL,setActive:value=>{active=!!value;},
    drain:()=>rows.splice(0),status:()=>({active,maxPending,maxRows,droppedRows,lostCoverage,
      devices:devices.map(({restore,coalesced,...v})=>v),errors:errors.slice(),
      gl:glStates.map(({pending,restores,restore,timer,...v})=>({...v,pending:pending.length})),
      unsupportedGL:unsupportedGL.slice(),options:{webgl:!!options.webgl,glIntervalMs,countQuanta},
      limitation:'Queue completion and optional sampled WebGL2 completion plus JS/poll delay; not compositor/display presentation. WebGL1 and extension-only draw methods are not fully covered. Quanta are submitted labeled liquid.g2p and snow.predict pass counts, not independent clocks.'}),
    restore:()=>{active=false;for(const d of devices)d.restore?.();for(const gl of glStates)gl.restore();for(const restore of contextRestores)restore();
      if(requestOriginal)GPUAdapter.prototype.requestDevice=requestOriginal;}};
  if(window.GPUAdapter){
    requestOriginal=GPUAdapter.prototype.requestDevice;
    try{GPUAdapter.prototype.requestDevice=async function(descriptor){return observe(await requestOriginal.call(this,descriptor));};}
    catch(e){lostCoverage++;error(e);}
  }
  window.__sluiceCapacity=api;return api.status();
}

// CDP integration plan for an owned testing browser, not an executable launcher.
export const compositorTracePlan={
  start:{transferMode:'ReturnAsStream',categories:'benchmark,cc,viz,gpu,toplevel,disabled-by-default-devtools.timeline.frame'},
  sequence:[
    'Record Browser.getVersion, launch flags, screen metadata and headless/headful mode.',
    'Install probe before device/context creation; start observer and trace together after warmup.',
    'Add performance.mark capture start/end and periodic clock-correlation anchors.',
    'Stop observer and recorder; collect pending completion tail separately without adding tail frames to capture FPS.',
    'Tracing.end; wait tracingComplete.stream, IO.read until EOF, then IO.close; persist raw trace outside repo in finally before assertions.'
  ],
  parsing:[
    'Support JSON traceEvents and Perfetto conversion. Discover observed event names; fail coverage rather than assuming a fixed Chrome version.',
    'Build process/thread metadata map. Select target renderer and relevant Viz/GPU processes, retaining all supporting events.',
    'Use X durations and matched B/E spans for CPU/GPU service spans; union overlapping spans instead of summing nested functions or independent device queues.',
    'Join compositor frame tokens/display_trace_id or PipelineReporter async IDs where actually present. Do not join by nearest timestamp as proof.',
    'Report Draw/Swap acknowledgements as submitted or compositor-completed stages, never physical presentation.',
    'FramePresented/presentation feedback timestamps and flags are separate evidence. Require nonfailed hardware-completion/VSYNC evidence for physical native120 claim; missing flags stay unknown.',
    'Headless frames are virtual presentation even if frame-completed events exist. Unlimited RAF capacity and synthetic120 pacing are explicitly distinct from native display presentation.',
    'Produce per-second callback count, completed queue watermark, outstanding count/age, late CPU fraction, submitted quantum counts, compositor completed count, and verified presented count.',
    'Compare observer-off/queue-only/queue+sampledGL runs with identical inputs/settings and evolving-state caveat; report instrumentation cost and uncovered contexts.'
  ],
  budget:{targetHz:120,frameMs:1000/120,
    interpretation:'CPU and GPU can overlap; each critical service stage needs sustainable8.333ms throughput with headroom. Do not add nested CPU buckets or claim GPU completion from RAF. Sparse timestamp encoders cannot prove whole-frame GPU coverage.'},
  references:[
    'https://chromedevtools.github.io/devtools-protocol/tot/Tracing/',
    'https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/gfx/presentation_feedback.h',
    'https://gpuweb.github.io/gpuweb/',
    'https://registry.khronos.org/webgl/specs/latest/2.0/'
  ]
};
