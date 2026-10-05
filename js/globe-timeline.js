/* Small, bounded replay helpers. All frames retain their provider timestamps. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GlobeTimeline=factory();
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var STEP=3*3600000;
  function dayBounds(instant){
    var d=new Date(instant);
    if(!Number.isFinite(+d))throw new Error('Invalid replay day');
    return {start:new Date(d.getFullYear(),d.getMonth(),d.getDate()),end:new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)};
  }
  function cloudFrames(catalog,instant,now){
    if(!catalog)return [];
    var day=dayBounds(instant),start=+new Date(catalog.start),end=+new Date(catalog.end),clock=+new Date(now);
    if(![start,end,clock].every(Number.isFinite)||end<start||end>clock+300000) return [];
    var first=Math.max(start,start+Math.floor((day.start-start)/STEP)*STEP),last=Math.min(end,clock,+day.end-1),frames=[];
    for(var time=first;time<=last;time+=STEP)frames.push(new Date(time));
    return frames;
  }
  function order(frames,instant){var t=+new Date(instant);return frames.slice().sort(function(a,b){return Math.abs(+a-t)-Math.abs(+b-t)||+a-+b;});}
  function memoryCache(limit,options){
    options=options||{};var items=new Map(),bytes=0,pinned=null;
    function remove(key){var item=items.get(key);if(!item)return;items.delete(key);bytes-=item.bytes;if(options.dispose)options.dispose(item.value);}
    function get(key){key=String(key);var item=items.get(key);if(!item)return null;items.delete(key);items.set(key,item);return item.value;}
    function trim(){for(var key of items.keys()){if(bytes<=limit)break;if(key!==pinned)remove(key);}}
    return {
      get:get,delete:function(key){remove(String(key));},has:function(key){return items.has(String(key));},
      put:function(key,value,size){key=String(key);var previous=items.get(key);
        if(previous&&options.prefer&&!options.prefer(value,previous.value)){if(options.dispose)options.dispose(value);return get(key);}
        remove(key);items.set(key,{value:value,bytes:size});bytes+=size;trim();return items.has(key)?value:null;
      },
      pin:function(key){pinned=String(key);trim();},
      retain:function(keys){var keep=new Set(keys.map(String));for(var key of items.keys())if(key!==pinned&&!keep.has(key))remove(key);},
      stats:function(){return {bytes:bytes,count:items.size,limit:limit};}
    };
  }
  function waitFor(promise,signal){
    if(!signal)return promise;
    return new Promise(function(resolve,reject){
      function abort(){var e=new Error('Replay request aborted');e.name='AbortError';reject(e);}
      Promise.resolve(promise).then(resolve,reject).finally(function(){signal.removeEventListener('abort',abort);});
      if(signal.aborted){abort();return;}
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  return {dayBounds:dayBounds,cloudFrames:cloudFrames,order:order,memoryCache:memoryCache,waitFor:waitFor};
}));
