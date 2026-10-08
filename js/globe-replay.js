/* Prepare cloud maps away from interaction work. Original dated images stay intact. */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(typeof document==='undefined'){
    root.onmessage=async function(event){var job=event.data;try{var result=job.full?await api.prepareFull(job.blobs,job.width,job.natural,job.shared,job.sourceTimes):await api.prepare(job.blobs,job.width,job.natural,job.sourceWidth,job.sourceTimes);root.postMessage({id:job.id,result:result},job.full?result.images:[result.pixels.buffer]);}catch(error){root.postMessage({id:job.id,error:error.message});}};
  }else root.GlobeReplay=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var onMain=typeof document!=='undefined';
  function pause(){return new Promise(function(resolve){setTimeout(resolve,0);});}
  // The same numeric operations run in both paths. Browsers without worker
  // image decoding get short time slices instead of one multi-second task.
  async function run(steps){var part,started=performance.now();do{part=steps.next();if(onMain&&!part.done&&performance.now()-started>=6){await pause();started=performance.now();}}while(!part.done);return part.value;}
  function modules(){if(!globalThis.GlobeClouds&&typeof importScripts==='function')importScripts('globe-math.js?v=20261004-9','globe-data.js?v=20261008-45','globe-clouds.js?v=20261008-46');return {clouds:globalThis.GlobeClouds,data:globalThis.GlobeData};}
  function smooth(a,b,x){x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);}
  function pack(visible,infrared,natural,out,start,end){
    for(var i=start||0,last=end===undefined?visible.length:end;i<last;i+=4){
      var r=visible[i]/255,g=visible[i+1]/255,b=visible[i+2]/255;
      var ice=smooth(.04,.16,Math.min(g,b)-r)*smooth(.18,.36,Math.min(g,b))*(1-smooth(.12,.32,Math.abs(g-b)))*(natural?1:0);
      var bright=Math.max(g,b);r+=(bright-r)*ice;g+=(bright-g)*ice;b+=(bright-b)*ice;
      out[i]=Math.round(smooth(.22,.85,Math.min(r,g,b))*255);
      out[i+1]=natural?visible[i+3]:0;
      out[i+2]=Math.round(smooth(.28,1,infrared[i]/255)*255);
      out[i+3]=infrared[i+3];
    }return out;
  }
  async function read(blob,width){
    var bitmap=await createImageBitmap(blob,{resizeWidth:width,resizeHeight:width/2,resizeQuality:'high'}),canvas;
    try{canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,width/2):document.createElement('canvas');canvas.width=width;canvas.height=width/2;
      var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,width/2);
      if(!onMain)return ctx.getImageData(0,0,width,width/2).data;
      var pixels=new Uint8ClampedArray(width*width*2),started=performance.now();
      for(var y=0;y<width/2;y+=32){var rows=Math.min(32,width/2-y);pixels.set(ctx.getImageData(0,y,width,rows).data,y*width*4);if(performance.now()-started>=6){await pause();started=performance.now();}}
      return pixels;
    }finally{bitmap.close();if(canvas)canvas.width=canvas.height=1;}
  }
  async function sources(blobs,nativeWidth,width,sourceTimes){
    var api=modules(),clouds=api.clouds,data=api.data,images=[];
    for(var index=0;index<10;index++){
      var source=blobs[index]?await read(blobs[index],nativeWidth):null;
      if(source&&blobs[index].type==='image/jpeg')await run((function*(){for(var blank=0;blank<source.length;blank+=4){if(blank%(nativeWidth*16)===0)yield;if(Math.max(source[blank],source[blank+1],source[blank+2])<8)source[blank+3]=0;}})());
      images.push(source);if(onMain)await pause();
    }
    await run(clouds.maskScanArtifactsSteps(images,nativeWidth));
    for(var group=0;group<10;group++)if(images[group]){
      if(clouds.GROUPS[group].source===clouds.NASA&&clouds.GROUPS[group].kind==='infrared')await run(clouds.normalizeThermalSteps(images[group],nativeWidth));
      images[group]=reduce(images[group],nativeWidth,width);images[group]=await run(data.featherCoverageSteps(images[group],width));
    }
    await run(clouds.retainVisibleCloudsSteps(images,width,sourceTimes));
    var visible=await run(clouds.compositeSteps(images,width,'visible')),infrared=await run(clouds.compositeSteps(images,width,'infrared'));
    return [visible,infrared];
  }
  async function coverage(pixels,width){return run((function*(){var valid=0;for(var at=3;at<pixels.length;at+=4){if((at-3)%(width*16)===0)yield;if(pixels[at]>200)valid++;}return valid/(pixels.length/4);})());}
  async function prepareFull(blobs,width,natural,shared,sourceTimes){
    var maps=blobs.length===10?await sources(blobs,width,width,sourceTimes):[await read(blobs[0],width),await read(blobs[1],width)];
    var fraction=await coverage(maps[1],width);if(fraction<.15)throw new Error('Satellite image has no useful coverage');
    if(!shared&&blobs.length!==10){var api=modules();maps[0]=await run(api.data.featherCoverageSteps(maps[0],width));maps[1]=await run(api.data.featherCoverageSteps(maps[1],width));}
    var images=[],canvas;
    try{for(var i=0;i<2;i++){
      canvas=onMain?document.createElement('canvas'):new OffscreenCanvas(width,width/2);canvas.width=width;canvas.height=width/2;
      var ctx=canvas.getContext('2d'),started=performance.now();
      for(var row=0;row<width/2;row+=32){var rows=Math.min(32,width/2-row);ctx.putImageData(new ImageData(maps[i].subarray(row*width*4,(row+rows)*width*4),width,rows),0,row);if(onMain&&performance.now()-started>=6){await pause();started=performance.now();}}
      images.push(onMain?canvas:canvas.transferToImageBitmap());if(!onMain)canvas.width=canvas.height=1;canvas=null;maps[i]=null;
    }return {width:width,images:images,coverage:fraction,natural:natural};}
    catch(error){if(canvas)canvas.width=canvas.height=1;images.forEach(function(image){if(image.close)image.close();else image.width=image.height=1;});throw error;}
  }
  function reduce(pixels,from,to){
    if(from===to)return pixels;
    // Use the same canvas path in the worker and its yielding fallback.
    // Chrome's DOM and offscreen high-quality reducers differ on real imagery.
    var original=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(from,from/2):document.createElement('canvas'),small=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(to,to/2):document.createElement('canvas');
    try{original.width=from;original.height=from/2;small.width=to;small.height=to/2;
      var ctx=original.getContext('2d'),image=ctx.createImageData(from,from/2);image.data.set(pixels);ctx.putImageData(image,0,0);
      var output=small.getContext('2d',{willReadFrequently:true});output.imageSmoothingQuality='high';output.drawImage(original,0,0,to,to/2);return output.getImageData(0,0,to,to/2).data;
    }finally{original.width=original.height=small.width=small.height=1;}
  }
  async function prepare(blobs,width,natural,sourceWidth,sourceTimes){
    var visible,infrared;
    if(blobs.length===10){
      // Decode the original temperature codes before resizing. Interpolating
      // palette RGB first invents colors with unrelated thermal meanings.
      var maps=await sources(blobs,sourceWidth||width,width,sourceTimes);visible=maps[0];infrared=maps[1];
    }else{visible=await read(blobs[0],width);infrared=await read(blobs[1],width);}
    var pixels=new Uint8Array(visible.length),valid=0;
    // The fallback yields between short row batches when workers are blocked.
    for(var at=0;at<visible.length;at+=width*4*16){var end=Math.min(visible.length,at+width*4*16);pack(visible,infrared,natural,pixels,at,end);for(var i=at+3;i<end;i+=4)if(infrared[i]>200)valid++;if(typeof document!=='undefined')await new Promise(function(resolve){setTimeout(resolve,0);});}
    if(valid/(pixels.length/4)<.15)throw new Error('Replay image has no useful coverage');
    return {width:width,pixels:pixels,coverage:valid/(pixels.length/4)};
  }
  function preparer(url){
    var worker=null,failed=false,closed=false,queue=[],active=null,serial=0,counts={worker:0,fallback:0};
    function dispose(result){if(result&&result.images)result.images.forEach(function(image){if(image.close)image.close();else image.width=image.height=1;});}
    function fallback(){var job=active;(job.full?prepareFull(job.blobs,job.width,job.natural,job.shared,job.sourceTimes):prepare(job.blobs,job.width,job.natural,job.sourceWidth,job.sourceTimes)).then(function(result){if(active!==job){dispose(result);return;}counts.fallback++;finish(null,result);},function(error){if(active===job)finish(error);});}
    function finish(error,result){var job=active;active=null;if(error)job.reject(error);else job.resolve(result);pump();}
    function breakWorker(){if(worker)worker.terminate();worker=null;failed=true;if(active)fallback();}
    function pump(){if(active||!queue.length)return;queue.sort(function(a,b){return b.priority-a.priority||(a.priority?b.order-a.order:a.id-b.id);});active=queue.shift();
      if(!worker&&!failed)try{worker=new Worker(url);worker.onmessage=function(event){if(!active||event.data.id!==active.id){dispose(event.data.result);return;}if(event.data.error){breakWorker();return;}counts.worker++;finish(null,event.data.result);};worker.onerror=breakWorker;}catch(_){failed=true;}
      if(worker)try{worker.postMessage({id:active.id,blobs:active.blobs,width:active.width,natural:active.natural,sourceWidth:active.sourceWidth,full:active.full,shared:active.shared,sourceTimes:active.sourceTimes});}catch(_){breakWorker();}else fallback();
    }
    function enqueue(blobs,width,natural,priority,key,sourceWidth,sourceTimes,full,shared){if(closed)return Promise.reject(new Error('Replay preparation closed'));return new Promise(function(resolve,reject){queue.push({id:++serial,order:serial,key:key,blobs:blobs,width:width,natural:natural,sourceWidth:sourceWidth,sourceTimes:sourceTimes,full:!!full,shared:!!shared,priority:priority||0,resolve:resolve,reject:reject});pump();});}
    return {prepare:enqueue,prepareFull:function(blobs,width,natural,shared,priority,key,sourceTimes){return enqueue(blobs,width,natural,priority,key,width,sourceTimes,true,shared);},boost:function(key,priority){queue.forEach(function(job){if(job.key===key){job.priority=Math.max(job.priority,priority);job.order=++serial;}});},stats:function(){return {worker:counts.worker,fallback:counts.fallback,queued:queue.length,active:!!active};},close:function(){closed=true;failed=true;if(worker)worker.terminate();worker=null;var error=new Error('Replay preparation closed');queue.splice(0).forEach(function(job){job.reject(error);});if(active){active.reject(error);active=null;}}};
  }
  return {pack:pack,prepare:prepare,prepareFull:prepareFull,preparer:preparer};
}));
