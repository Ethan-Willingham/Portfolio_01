/* A shared, independently collected cloud history. Provider times stay intact. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./globe-data.js'),require('./globe-clouds.js'));
 else root.GlobeArchive=factory(root.GlobeData,root.GlobeClouds);
}(typeof globalThis!=='undefined'?globalThis:this,function(data,clouds){
 'use strict';
 var BASE='https://raw.githubusercontent.com/Ethan-Willingham/Portfolio_01/globe-clouds/',CACHE='daylight-globe-shared-v1';
 function validate(value){
  if(!value||![1,2].includes(value.version)||value.width!==2048||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>(value.version===2?108:30))throw new Error('Invalid shared cloud archive');
  var generated=new Date(value.generatedAt),processing=value.processing===undefined?0:value.processing;if(!Number.isFinite(+generated)||!Number.isInteger(processing)||processing<0||processing>100)throw new Error('Invalid archive clock or processing revision');
  var catalog=clouds.validate(value.catalog),last=-Infinity;
  var frames=value.frames.map(function(frame){
   var time=new Date(frame.time);if(!Number.isFinite(+time)||time.toISOString()!==frame.time||+time%(value.version===2?clouds.STEP:3600000)||+time<=last||time>generated||!clouds.published(catalog,+time)||typeof frame.natural!=='boolean')throw new Error('Invalid archived cloud time');last=+time;
   var observed=frame.sourceTimes||clouds.GROUPS.map(function(g,i){var t=clouds.productTime(catalog.products[i],+time);return (!frame.sources||frame.sources[i])&&t&&+t===+time?frame.time:null;});
   if(!Array.isArray(observed)||observed.length!==10||value.version===2&&!frame.sourceTimes)throw new Error('Missing satellite observation clocks');
   observed.forEach(function(t,i){if(t===null){if(clouds.GROUPS[i].kind==='infrared')throw new Error('Missing infrared observation');return;}var d=new Date(t),product=catalog.products[i];if(!Number.isFinite(+d)||d.toISOString()!==t||d>time||!product.periods.some(function(p){return d>=new Date(p.start)&&d<=new Date(p.end)&&(+d-Date.parse(p.start))%p.step===0&&time-d<p.step;}))throw new Error('Invalid satellite observation clock');});
   var out={time:time,natural:frame.natural,sourceTimes:observed};
   ['visible','infrared'].forEach(function(kind){var asset=frame[kind];if(!asset||!Number.isInteger(asset.bytes)||asset.bytes<40||asset.bytes>8000000||!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.file!==frame.time.replace(/[-:]/g,'').slice(0,13)+'-'+kind+'-'+asset.sha256.slice(0,16)+'.webp')throw new Error('Invalid cloud asset');out[kind]={file:asset.file,bytes:asset.bytes,sha256:asset.sha256};});return out;
  });
  return {version:value.version,processing:processing,width:value.width,generatedAt:generated,catalog:catalog,frames:frames};
 }
 function dimensions(bytes){
  function u24(i){return bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16;}
  function word(i){return bytes[i]|bytes[i+1]<<8;}
  if(bytes.length<30||String.fromCharCode.apply(null,bytes.slice(0,4))!=='RIFF'||String.fromCharCode.apply(null,bytes.slice(8,12))!=='WEBP')throw new Error('Invalid cloud WebP');
  var declared=(bytes[4]|bytes[5]<<8|bytes[6]<<16|bytes[7]<<24)>>>0;if(declared+8!==bytes.length)throw new Error('Truncated cloud WebP');
  for(var at=12;at+8<=bytes.length;){var tag=String.fromCharCode.apply(null,bytes.slice(at,at+4)),length=(bytes[at+4]|bytes[at+5]<<8|bytes[at+6]<<16|bytes[at+7]<<24)>>>0,p=at+8;if(p+length>bytes.length)throw new Error('Truncated cloud chunk');
   if(tag==='VP8X'&&length===10)return [u24(p+4)+1,u24(p+7)+1];
   if(tag==='VP8 '&&length>=10&&bytes[p+3]===157&&bytes[p+4]===1&&bytes[p+5]===42)return [word(p+6)&16383,word(p+8)&16383];
   if(tag==='VP8L'&&length>=5&&bytes[p]===47)return [1+(bytes[p+1]|(bytes[p+2]&63)<<8),1+((bytes[p+2]>>6)|bytes[p+3]<<2|(bytes[p+4]&15)<<10)];
   at=p+length+(length%2);
  }throw new Error('Missing cloud dimensions');
 }
 async function imageBlob(response,asset,width){
  var bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==asset.bytes)throw new Error('Cloud size mismatch');
  var size=dimensions(bytes);if(size[0]!==width||size[1]!==width/2)throw new Error('Cloud dimensions mismatch');
  var hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(v){return v.toString(16).padStart(2,'0');}).join('');if(hash!==asset.sha256)throw new Error('Cloud checksum mismatch');
  return new Blob([bytes],{type:'image/webp'});
 }
 async function fetchManifest(options){return validate(await data.fetchJSON(BASE+'manifest.json?v=2-'+clouds.PROCESSING+'-'+Math.floor(Date.now()/300000),Object.assign({allowText:true},options)));}
 async function fetchFrame(manifest,time,options){
  options=options||{};if(manifest.processing<clouds.PROCESSING)throw new Error('Cloud processing revision is outdated');var frame=manifest.frames.find(function(f){return +f.time===+time;});if(!frame)throw new Error('Cloud hour not archived');
  var cache=null;if(typeof caches!=='undefined')try{cache=await caches.open(CACHE);}catch(_){}
  var blobs=await Promise.all(['visible','infrared'].map(async function(kind){var asset=frame[kind],url=BASE+asset.file;if(cache){var hit=await cache.match(url);if(hit)try{return await imageBlob(hit,asset,manifest.width);}catch(_){await cache.delete(url);}}
   if(options.cacheOnly)throw new Error('Cloud hour not cached');return data.request(url,options,async function(response){var copy=cache?response.clone():null,blob=await imageBlob(response,asset,manifest.width);if(cache)try{await cache.put(url,copy);}catch(_){}return blob;});}));
  if(cache)try{var keys=await cache.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-128)).map(function(k){return cache.delete(k);}));}catch(_){}
  return {time:new Date(time),width:manifest.width,dense:true,shared:true,natural:frame.natural,sourceTimes:frame.sourceTimes,blobs:blobs};
 }
 return {BASE:BASE,validate:validate,dimensions:dimensions,imageBlob:imageBlob,fetchManifest:fetchManifest,fetchFrame:fetchFrame};
}));
