// Optional audit-sluice EXPERIMENT file (docs/game/PERFORMANCE_FLYOVER_2026-09-14.md).
// Times the calls that can make the main thread wait on the GPU, summed per
// frame (perfBucketsRaw resets at the top of loop()): canvases drawn into
// themselves, the smoke and mountain WebGL canvases drawn into the game canvas,
// other large canvas draws, readbacks, and canvases uploaded to WebGL or WebGPU.
// Also times each surface prop inside render.entities. With uncapped frames the
// GPU never catches up, so whichever of these runs first absorbs the backlog:
// use the timers to find sync points, and paced frames to judge their cost.
function syncAdd(name,t){perfRecord(name,(perfBucketsRaw[name]||0)+performance.now()-t);}
(function(){
  var P2=CanvasRenderingContext2D.prototype, drawImage=P2.drawImage, getImageData=P2.getImageData;
  P2.drawImage=function(source){
    var t=performance.now(),r=drawImage.apply(this,arguments);
    if(source===this.canvas)syncAdd('audit.selfCopy',t);
    else if(typeof smokeFluidCanvas!=='undefined'&&source===smokeFluidCanvas)syncAdd('audit.smokeToCanvas',t);
    else if(typeof mtnGPU!=='undefined'&&mtnGPU&&source===mtnGPU.canvas)syncAdd('audit.mountainsToCanvas',t);
    else if(source instanceof HTMLCanvasElement&&source.width*source.height>=250000)syncAdd('audit.bigCanvasDraw',t);
    return r;
  };
  P2.getImageData=function(){var t=performance.now(),r=getImageData.apply(this,arguments);syncAdd('audit.readback',t);return r;};
  function wrapUpload(proto,name){
    if(!proto)return;
    ['texImage2D','texSubImage2D'].forEach(function(m){
      var orig=proto[m];if(!orig)return;
      proto[m]=function(){
        var src=arguments[arguments.length-1],t=performance.now(),r=orig.apply(this,arguments);
        if(src&&(src instanceof HTMLCanvasElement||(typeof OffscreenCanvas!=='undefined'&&src instanceof OffscreenCanvas)||(typeof ImageBitmap!=='undefined'&&src instanceof ImageBitmap)))syncAdd(name,t);
        return r;
      };
    });
  }
  wrapUpload(typeof WebGL2RenderingContext!=='undefined'&&WebGL2RenderingContext.prototype,'audit.canvasToGL');
  wrapUpload(typeof WebGLRenderingContext!=='undefined'&&WebGLRenderingContext.prototype,'audit.canvasToGL');
  if(typeof GPUQueue!=='undefined'&&GPUQueue.prototype.copyExternalImageToTexture){
    var copyExt=GPUQueue.prototype.copyExternalImageToTexture;
    GPUQueue.prototype.copyExternalImageToTexture=function(){var t=performance.now(),r=copyExt.apply(this,arguments);syncAdd('audit.canvasToGPU',t);return r;};
  }
})();
function syncWrap(fn,name){if(typeof fn!=='function')return fn;return function(){var t=performance.now(),r=fn.apply(this,arguments);syncAdd('audit.'+name,t);return r;};}
if(typeof rareBirdDraw==='function')rareBirdDraw=syncWrap(rareBirdDraw,'ent.bird');
if(typeof drawTrees==='function')drawTrees=syncWrap(drawTrees,'ent.trees');
if(typeof drawSurfaceBoulders==='function')drawSurfaceBoulders=syncWrap(drawSurfaceBoulders,'ent.boulders');
if(typeof drawSurfaceTurtle==='function')drawSurfaceTurtle=syncWrap(drawSurfaceTurtle,'ent.turtle');
drawStation=syncWrap(drawStation,'ent.station');
drawShopDoorGlow=syncWrap(drawShopDoorGlow,'ent.doorGlow');
drawSurfaceFireplace=syncWrap(drawSurfaceFireplace,'ent.fireplace');
tickFireplaceSmoke=syncWrap(tickFireplaceSmoke,'ent.fireSmoke');
drawPumpPad=syncWrap(drawPumpPad,'ent.pumpPad');
drawNmzBanners=syncWrap(drawNmzBanners,'ent.banners');
if(typeof birdsDraw==='function')birdsDraw=syncWrap(birdsDraw,'ent.birds');
if(typeof drawTreeLeaves==='function')drawTreeLeaves=syncWrap(drawTreeLeaves,'ent.leaves');
drawSmoke=syncWrap(drawSmoke,'drawSmoke');
drawRocketPlume=syncWrap(drawRocketPlume,'rocketPlume');
drawPlayer=syncWrap(drawPlayer,'player');
