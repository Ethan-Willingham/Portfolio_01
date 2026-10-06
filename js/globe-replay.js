/* Compact display maps for scrubbing. The original dated images stay intact. */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(typeof document==='undefined'){
    root.onmessage=async function(event){var job=event.data;try{var result=await api.prepare(job.blobs,job.width,job.natural,job.sourceWidth);root.postMessage({id:job.id,result:result},[result.pixels.buffer]);}catch(error){root.postMessage({id:job.id,error:error.message});}};
  }else root.GlobeReplay=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function smooth(a,b,x){x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);}
  function pack(visible,infrared,natural,out,start,end){
    for(var i=start||0,last=end===undefined?visible.length:end;i<last;i+=4){
      var r=visible[i]/255,g=visible[i+1]/255,b=visible[i+2]/255;
      var ice=smooth(.04,.16,Math.min(g,b)-r)*smooth(.18,.36,Math.min(g,b))*(1-smooth(.12,.32,Math.abs(g-b)))*(natural?1:0);
      var bright=Math.max(g,b);r+=(bright-r)*ice;g+=(bright-g)*ice;b+=(bright-b)*ice;
      out[i]=Math.round(smooth(.22,.85,Math.min(r,g,b))*255);
      out[i+1]=natural?visible[i+3]:0;
      out[i+2]=Math.round(smooth(.28,.75,infrared[i]/255)*255);
      out[i+3]=infrared[i+3];
    }return out;
  }
  async function read(blob,width){
    var bitmap=await createImageBitmap(blob,{resizeWidth:width,resizeHeight:width/2,resizeQuality:'high'}),canvas;
    try{canvas=typeof document==='undefined'?new OffscreenCanvas(width,width/2):document.createElement('canvas');canvas.width=width;canvas.height=width/2;
      var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,width/2);return ctx.getImageData(0,0,width,width/2).data;
    }finally{bitmap.close();if(canvas)canvas.width=canvas.height=1;}
  }
  function reduce(pixels,from,to){
    if(from===to)return pixels;
    var original=typeof document==='undefined'?new OffscreenCanvas(from,from/2):document.createElement('canvas'),small=typeof document==='undefined'?new OffscreenCanvas(to,to/2):document.createElement('canvas');
    try{original.width=from;original.height=from/2;small.width=to;small.height=to/2;
      var ctx=original.getContext('2d'),image=ctx.createImageData(from,from/2);image.data.set(pixels);ctx.putImageData(image,0,0);
      var output=small.getContext('2d',{willReadFrequently:true});output.imageSmoothingQuality='high';output.drawImage(original,0,0,to,to/2);return output.getImageData(0,0,to,to/2).data;
    }finally{original.width=original.height=small.width=small.height=1;}
  }
  async function prepare(blobs,width,natural,sourceWidth){
    var visible,infrared;
    if(blobs.length===10){
      if(!globalThis.GlobeClouds&&typeof importScripts==='function')importScripts('globe-data.js?v=20261005-18','globe-clouds.js?v=20261005-35');
      var clouds=globalThis.GlobeClouds,data=globalThis.GlobeData,sources=[],nativeWidth=sourceWidth||width;
      // Decode the original temperature codes before resizing. Interpolating
      // palette RGB first invents colors with unrelated thermal meanings.
      for(var index=0;index<10;index++){var source=blobs[index]?await read(blobs[index],nativeWidth):null;if(source&&blobs[index].type==='image/jpeg')for(var blank=0;blank<source.length;blank+=4)if(Math.max(source[blank],source[blank+1],source[blank+2])<8)source[blank+3]=0;sources.push(source);}
      clouds.maskScanArtifacts(sources,nativeWidth);
      for(var group=0;group<10;group++)if(sources[group]){if(clouds.GROUPS[group].source===clouds.NASA&&clouds.GROUPS[group].kind==='infrared')clouds.normalizeThermal(sources[group]);sources[group]=reduce(sources[group],nativeWidth,width);sources[group]=data.featherCoverage(sources[group],width);if(typeof document!=='undefined')await new Promise(function(resolve){setTimeout(resolve,0);});}
      visible=clouds.composite(sources,width,'visible');infrared=clouds.composite(sources,width,'infrared');
    }else{visible=await read(blobs[0],width);infrared=await read(blobs[1],width);}
    var pixels=new Uint8Array(visible.length),valid=0;
    // The fallback yields between short row batches when workers are blocked.
    for(var at=0;at<visible.length;at+=width*4*16){var end=Math.min(visible.length,at+width*4*16);pack(visible,infrared,natural,pixels,at,end);for(var i=at+3;i<end;i+=4)if(infrared[i]>200)valid++;if(typeof document!=='undefined')await new Promise(function(resolve){setTimeout(resolve,0);});}
    if(valid/(pixels.length/4)<.15)throw new Error('Replay image has no useful coverage');
    return {width:width,pixels:pixels,coverage:valid/(pixels.length/4)};
  }
  function preparer(url){
    var worker=null,failed=false,closed=false,queue=[],active=null,serial=0,counts={worker:0,fallback:0};
    function fallback(){var job=active;prepare(job.blobs,job.width,job.natural,job.sourceWidth).then(function(result){if(active!==job)return;counts.fallback++;finish(null,result);},function(error){if(active===job)finish(error);});}
    function finish(error,result){var job=active;active=null;if(error)job.reject(error);else job.resolve(result);pump();}
    function breakWorker(){if(worker)worker.terminate();worker=null;failed=true;if(active)fallback();}
    function pump(){if(active||!queue.length)return;queue.sort(function(a,b){return b.priority-a.priority||(a.priority?b.order-a.order:a.id-b.id);});active=queue.shift();
      if(!worker&&!failed)try{worker=new Worker(url);worker.onmessage=function(event){if(!active||event.data.id!==active.id)return;if(event.data.error){breakWorker();return;}counts.worker++;finish(null,event.data.result);};worker.onerror=breakWorker;}catch(_){failed=true;}
      if(worker)try{worker.postMessage({id:active.id,blobs:active.blobs,width:active.width,natural:active.natural,sourceWidth:active.sourceWidth});}catch(_){breakWorker();}else fallback();
    }
    return {prepare:function(blobs,width,natural,priority,key,sourceWidth){if(closed)return Promise.reject(new Error('Replay preparation closed'));return new Promise(function(resolve,reject){queue.push({id:++serial,order:serial,key:key,blobs:blobs,width:width,natural:natural,sourceWidth:sourceWidth,priority:priority||0,resolve:resolve,reject:reject});pump();});},boost:function(key,priority){queue.forEach(function(job){if(job.key===key){job.priority=Math.max(job.priority,priority);job.order=++serial;}});},stats:function(){return {worker:counts.worker,fallback:counts.fallback,queued:queue.length,active:!!active};},close:function(){closed=true;failed=true;if(worker)worker.terminate();worker=null;var error=new Error('Replay preparation closed');queue.splice(0).forEach(function(job){job.reject(error);});if(active){active.reject(error);active=null;}}};
  }
  return {pack:pack,prepare:prepare,preparer:preparer};
}));
