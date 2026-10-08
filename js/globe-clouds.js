/* Quarter-hour replay from the geostationary satellites. Every request uses an
   explicitly published time. See docs/DAYLIGHT_GLOBE.md for display limits. */
(function(root,factory){
 'use strict';
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./globe-data.js'));
 else root.GlobeClouds=factory(root.GlobeData);
}(typeof globalThis!=='undefined'?globalThis:this,function(data){
 'use strict';
 var STEP=900000, NASA='https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi', EUM=data.CLOUD_SERVICE, CACHE='daylight-globe-hourly-v1';
 var GROUPS=[
  {source:NASA,layers:['GOES-West_ABI_GeoColor'],kind:'visible',longitudes:[-137.2]},
  {source:NASA,layers:['GOES-East_ABI_GeoColor'],kind:'visible',longitudes:[-75.2]},
  {source:NASA,layers:['Himawari_AHI_Band3_Red_Visible_1km'],kind:'visible',longitudes:[140.7]},
  {source:EUM,layers:['msg_iodc:rgb_natural'],kind:'visible',longitudes:[45.5]},
  {source:EUM,layers:['mtg_fd:rgb_truecolour'],kind:'visible',longitudes:[0]},
  {source:NASA,layers:['GOES-West_ABI_Band13_Clean_Infrared'],kind:'infrared',longitudes:[-137.2]},
  {source:NASA,layers:['GOES-East_ABI_Band13_Clean_Infrared'],kind:'infrared',longitudes:[-75.2]},
  {source:NASA,layers:['Himawari_AHI_Band13_Clean_Infrared'],kind:'infrared',longitudes:[140.7]},
  {source:EUM,layers:['msg_iodc:ir108'],kind:'infrared',longitudes:[45.5]},
  {source:EUM,layers:['mtg_fd:ir105_hrfi'],kind:'infrared',longitudes:[0]}
 ];
 function timestamp(v){var d=new Date(v);if(!Number.isFinite(+d)||typeof v==='string'&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))throw new Error('Invalid satellite time');if(typeof v==='string'&&d.toISOString().slice(0,19)!==v.slice(0,19))throw new Error('Invalid satellite calendar date');return d;}
 function periods(xml,layer){
  if(typeof xml!=='string'||xml.length>5000000)throw new Error('Invalid satellite catalog');
  var name=new RegExp('<(?:\\w+:)?Name>\\s*'+layer+'\\s*</(?:\\w+:)?Name>').exec(xml);
  if(!name)throw new Error('Missing hourly satellite layer');
  var tail=xml.slice(name.index),end=/<\/(?:\w+:)?Layer\s*>/.exec(tail),section=end?tail.slice(0,end.index):'';
  var dim=/<(?:\w+:)?Dimension\b[^>]*name=["']time["'][^>]*>([^<]+)</.exec(section);
  if(!dim)throw new Error('Missing hourly satellite times');
  return dim[1].trim().split(',').map(function(item){var p=item.split('/'),step=p[2]==='PT10M'?600000:p[2]==='PT15M'?900000:0,start=timestamp(p[0]),finish=timestamp(p[1]);if(p.length!==3||!step||finish<start||(+finish-start)%step)throw new Error('Invalid satellite interval');return {start:start.toISOString(),end:finish.toISOString(),step:step};});
 }
 function parseCatalog(nasa,eum){var products=[];GROUPS.forEach(function(g){g.layers.forEach(function(layer){products.push({layer:layer,source:g.source,periods:periods(g.source===NASA?nasa:eum,layer)});});});var catalog=validate({version:1,products:products,checkedAt:new Date().toISOString()});try{catalog.legacy=data.parseCloudCatalog(eum);}catch(_){}return catalog;}
 function validate(value){
  if(!value||value.version!==1||!Array.isArray(value.products)||value.products.length!==10)throw new Error('Invalid hourly catalog');
  var checked=timestamp(value.checkedAt),expected=[];GROUPS.forEach(function(g){g.layers.forEach(function(l){expected.push([g.source,l]);});});
  var starts=[],ends=[],products=value.products.map(function(p,i){if(!p||p.source!==expected[i][0]||p.layer!==expected[i][1]||!Array.isArray(p.periods)||!p.periods.length||p.periods.length>4000)throw new Error('Invalid hourly product');
   var intervals=p.periods.map(function(v){var a=timestamp(v.start),b=timestamp(v.end);if(![600000,900000].includes(v.step)||b<a||(+b-a)%v.step||b-checked>300000)throw new Error('Invalid hourly publication');return {start:a.toISOString(),end:b.toISOString(),step:v.step};});intervals.sort(function(a,b){return Date.parse(a.start)-Date.parse(b.start);});if(GROUPS[i].kind==='infrared'){starts.push(Date.parse(intervals[0].start));ends.push(Date.parse(intervals[intervals.length-1].end));}return {source:p.source,layer:p.layer,periods:intervals};});
  var start=new Date(Math.ceil(Math.max.apply(null,starts)/STEP)*STEP),end=new Date(Math.floor(Math.min.apply(null,ends)/STEP)*STEP);
  if(end<start)throw new Error('No common satellite coverage');var catalog={version:1,products:products,checkedAt:checked.toISOString(),start:start,end:end,step:STEP,dense:true};if(value.legacy)catalog.legacy=data.parseCloudSnapshot({version:1,source:EUM,layers:data.CLOUD_LAYERS,start:value.legacy.start,end:value.legacy.end,step:value.legacy.step,checkedAt:checked.toISOString()});return catalog;
 }
 function productTime(product,time){var best=null;product.periods.forEach(function(v){var start=Date.parse(v.start),end=Date.parse(v.end),candidate=start+Math.floor((Math.min(time,end)-start)/v.step)*v.step;if(candidate>=start&&candidate<=time&&time-candidate<v.step&&(!best||candidate>+best))best=new Date(candidate);});return best;}
 function sourceTimes(catalog,time){return catalog.products.map(function(p){return productTime(p,+timestamp(time));});}
 function published(catalog,time){return catalog.products.every(function(p,i){return GROUPS[i].kind==='visible'||!!productTime(p,time);});}
 function frameAt(catalog,instant,now){var t=+timestamp(instant),clock=+timestamp(now===undefined?new Date():now);if(t>clock+300000||catalog.end-clock>300000)return null;var limit=Math.floor(Math.min(t,+catalog.end)/STEP)*STEP;for(var k=0;k<24&&limit>=catalog.start;k++,limit-=STEP)if(published(catalog,limit))return new Date(limit);return null;}
 function frames(catalog,instant,now){var d=timestamp(instant),start=+new Date(d.getFullYear(),d.getMonth(),d.getDate()),end=+new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),clock=+timestamp(now),out=[];for(var t=Math.max(+catalog.start,Math.floor(start/STEP)*STEP);t<end&&t<=catalog.end&&t<=clock;t+=STEP)if(published(catalog,t))out.push(new Date(t));return out;}
 async function fetchCatalog(options){
  var query='?service=WMS&version=1.3.0&request=GetCapabilities',fresh=query+'&fresh='+Math.floor(Date.now()/60000);
  var xml=await Promise.allSettled([data.fetchText(NASA+query,options),data.fetchText(NASA+fresh,options),data.fetchText(EUM+query,options),data.fetchText(EUM+fresh,options)]);
  var catalogs=[];for(var i=0;i<2;i++)for(var j=2;j<4;j++)if(xml[i].status==='fulfilled'&&xml[j].status==='fulfilled')try{catalogs.push(parseCatalog(xml[i].value,xml[j].value));}catch(_){}
  if(!catalogs.length)throw new Error('Satellite metadata unavailable');catalogs.sort(function(a,b){return b.end-a.end;});return catalogs[0];
 }
 // Infrared RGB is a temperature code. Lossy compression changes those codes
 // and can turn warm pixels into isolated bright clouds during inversion.
 function urls(time,width,catalog){if(!Number.isInteger(width)||width<2||width>4096||width%2)throw new Error('Invalid satellite image dimensions');var times=catalog?sourceTimes(catalog,time):GROUPS.map(function(g,i){var cadence=i===3||i===8?900000:600000;return new Date(Math.floor(+timestamp(time)/cadence)*cadence);});return GROUPS.map(function(g,i){if(!times[i])return null;var p=new URLSearchParams({service:'WMS',request:'GetMap',version:'1.3.0',layers:g.layers.join(','),styles:'',format:g.source===NASA&&g.kind==='infrared'?'image/png':'image/jpeg',bgcolor:'0x000000',crs:'EPSG:4326',bbox:'-90,-180,90,180',width:String(width),height:String(width/2),transparent:'true',time:g.source===NASA?times[i].toISOString().replace(/\.000Z$/,'Z'):times[i].toISOString()});return g.source+'?'+p;});}
 async function imageBlob(response,width){
  var mime=(response.headers.get('content-type')||'').split(';')[0].trim();if(mime==='image/png')return data.imageBlob(response,width);if(mime!=='image/jpeg')throw new Error('Invalid hourly image type');
  var blob=await response.blob(),bytes=new Uint8Array(await blob.slice(0,65536).arrayBuffer());if(bytes.length<12||bytes[0]!==255||bytes[1]!==216)throw new Error('Invalid satellite JPEG');
  for(var i=2;i<bytes.length;){if(bytes[i++]!==255)throw new Error('Invalid JPEG marker');while(bytes[i]===255)i++;var marker=bytes[i++];if(marker===217||marker===218)break;var length=bytes[i]*256+bytes[i+1];if(length<2||i+length>bytes.length)break;if([192,193,194].includes(marker)){var h=bytes[i+3]*256+bytes[i+4],w=bytes[i+5]*256+bytes[i+6];if(w!==width||h!==width/2)throw new Error('Invalid satellite JPEG dimensions');return blob;}i+=length;}
  throw new Error('Missing satellite JPEG dimensions');
 }
 async function fetchFrame(time,width,options){options=options||{};var cache=null,store=options.cacheStorage===undefined?(typeof caches!=='undefined'?caches:null):options.cacheStorage;if(store)try{cache=await store.open(CACHE);}catch(_){}
  var retries=Number.isFinite(options.retries)?Math.max(0,Math.min(2,Math.floor(options.retries))):1,links=urls(time,width,options.catalog),images=await Promise.allSettled(links.map(async function(url){
   if(!url)throw new Error('Satellite channel not published');
   if(cache){var hit=await cache.match(url);if(hit)try{return await imageBlob(hit,width);}catch(_){await cache.delete(url);}}
   if(options.cacheOnly)throw new Error('Satellite image not cached');
   for(var attempt=0;attempt<=retries;attempt++)try{
    // Keep the published observation clock and canonical cache identity. A
    // retry bypasses cached provider errors rather than changing the time.
    return await data.request(url+(attempt?'&retry='+Date.now()+'-'+attempt:''),options,async function(r){var copy=cache?r.clone():null,b=await imageBlob(r,width);if(cache)try{await cache.put(url,copy);}catch(_){}return b;});
   }catch(error){if(error.name==='AbortError'||options.signal&&options.signal.aborted||attempt===retries)throw error;}
  }));
  if(options.signal&&options.signal.aborted){var e=new Error('Hourly request aborted');e.name='AbortError';throw e;}
  // Require both providers, while allowing an individual Meteosat feed to fail.
  if(images.slice(5,8).some(function(r){return r.status!=='fulfilled';})||images[8].status!=='fulfilled'&&images[9].status!=='fulfilled')throw new Error('Hourly infrared coverage unavailable');
  if(cache)try{var keys=await cache.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-640)).map(function(k){return cache.delete(k);}));}catch(_){}
  return {time:timestamp(time),width:width,dense:true,urls:links,sourceTimes:links.map(function(u,i){return u&&images[i].status==='fulfilled'?new Date(new URL(u).searchParams.get('time')).toISOString():null;}),blobs:images.map(function(r){return r.status==='fulfilled'?r.value:null;})};
 }
 async function discard(time,width,catalog){if(typeof caches==='undefined')return;try{var c=await caches.open(CACHE);await Promise.all(urls(time,width,catalog).filter(Boolean).map(function(u){return c.delete(u);}));}catch(_){} }
 // NASA's published colour table is a display palette, with some repeated grey
 // values. Prefer the warm interpretation of ambiguous greys rather than turning
 // warm land into cloud. This is an illustrative thermal overlay, not cloud fraction.
 var PALETTE=[[255,255,255,-91.1],[127,0,127,-90.1],[140,13,135,-89.1],[153,25,142,-88.1],[165,38,150,-87.1],[178,51,157,-86.1],[191,64,165,-85.1],[204,76,173,-84.1],[217,89,180,-83.1],[229,102,188,-82.1],[242,114,195,-81.1],[255,127,203,-80.1],[230,230,230,-79.1],[204,204,204,-78.1],[177,177,177,-77.1],[155,155,155,-76.1],[129,129,129,-75.1],[102,102,102,-74.1],[76,76,76,-73.1],[54,54,54,-72.1],[27,27,27,-71.1],[5,5,5,-70.1],[26,0,0,-69.1],[51,0,0,-68.1],[77,0,0,-67.1],[102,0,0,-66.1],[128,0,0,-65.1],[153,0,0,-64.1],[179,0,0,-63.1],[204,0,0,-62.1],[230,0,0,-61.1],[255,0,0,-60.1],[255,26,0,-59.1],[255,51,0,-58.1],[255,77,0,-57.1],[255,102,0,-56.1],[255,128,0,-55.1],[255,153,0,-54.1],[255,179,0,-53.1],[255,204,0,-52.1],[255,230,0,-51.1],[255,255,0,-50.1],[230,255,0,-49.1],[204,255,0,-48.1],[179,255,0,-47.1],[153,255,0,-46.1],[128,255,0,-45.1],[102,255,0,-44.1],[77,255,0,-43.1],[51,255,0,-42.1],[26,255,0,-41.1],[0,255,0,-40.1],[0,234,10,-39.1],[0,212,19,-38.1],[0,191,29,-37.1],[0,170,38,-36.1],[0,149,48,-35.1],[0,128,58,-34.1],[0,106,67,-33.1],[0,85,77,-32.1],[0,64,86,-31.1],[0,42,96,-30.6],[0,21,105,-30.1],[0,0,115,-29.6],[0,0,125,-29.1],[0,13,122,-28.6],[0,26,129,-28.1],[0,38,136,-27.6],[0,51,143,-27.1],[0,64,150,-26.6],[0,76,157,-26.1],[0,89,164,-25.6],[0,102,171,-25.1],[0,115,178,-24.6],[0,128,185,-24.1],[0,140,192,-23.6],[0,153,199,-23.1],[0,166,206,-22.6],[0,178,213,-22.1],[0,191,220,-21.6],[0,204,227,-21.1],[0,217,234,-20.6],[0,230,241,-20.1],[0,242,248,-19.6],[0,255,255,-19.1],[197,197,197,-18.6],[196,196,196,-18.1],[194,194,194,-17.6],[193,193,193,-17.1],[192,192,192,-16.6],[191,191,191,-16.1],[189,189,189,-15.6],[188,188,188,-15.1],[187,187,187,-14.6],[185,185,185,-14.1],[184,184,184,-13.6],[183,183,183,-13.1],[181,181,181,-12.6],[180,180,180,-12.1],[179,179,179,-11.6],[178,178,178,-11.1],[176,176,176,-10.6],[175,175,175,-10.1],[174,174,174,-9.6],[172,172,172,-9.1],[171,171,171,-8.6],[170,170,170,-8.1],[169,169,169,-7.6],[167,167,167,-7.1],[166,166,166,-6.6],[165,165,165,-6.1],[163,163,163,-5.6],[162,162,162,-5.1],[161,161,161,-4.6],[159,159,159,-4.1],[158,158,158,-3.6],[157,157,157,-3.1],[156,156,156,-2.6],[154,154,154,-2.1],[153,153,153,-1.6],[152,152,152,-1.1],[150,150,150,-0.6],[149,149,149,-0.1],[148,148,148,0.4],[147,147,147,0.9],[145,145,145,1.4],[144,144,144,1.9],[143,143,143,2.4],[141,141,141,2.9],[140,140,140,3.4],[139,139,139,3.9],[138,138,138,4.4],[136,136,136,4.9],[135,135,135,5.4],[134,134,134,5.9],[132,132,132,6.4],[131,131,131,6.9],[130,130,130,7.4],[128,128,128,7.9],[127,127,127,8.4],[126,126,126,8.9],[125,125,125,9.4],[123,123,123,9.9],[122,122,122,10.4],[121,121,121,10.9],[119,119,119,11.4],[118,118,118,11.9],[117,117,117,12.4],[116,116,116,12.9],[114,114,114,13.4],[113,113,113,13.9],[112,112,112,14.4],[110,110,110,14.9],[109,109,109,15.4],[108,108,108,15.9],[106,106,106,16.4],[105,105,105,16.9],[104,104,104,17.4],[103,103,103,17.9],[101,101,101,18.4],[100,100,100,18.9],[99,99,99,19.4],[97,97,97,19.9],[96,96,96,20.4],[95,95,95,20.9],[94,94,94,21.4],[92,92,92,21.9],[91,91,91,22.4],[90,90,90,22.9],[88,88,88,23.4],[87,87,87,23.9],[86,86,86,24.4],[84,84,84,24.9],[83,83,83,25.4],[82,82,82,25.9],[81,81,81,26.4],[79,79,79,26.9],[78,78,78,27.4],[77,77,77,27.9],[75,75,75,28.4],[74,74,74,28.9],[73,73,73,29.4],[72,72,72,29.9],[70,70,70,30.4],[69,69,69,30.9],[68,68,68,31.4],[66,66,66,31.9],[65,65,65,32.4],[64,64,64,32.9],[62,62,62,33.4],[61,61,61,33.9],[60,60,60,34.4],[59,59,59,34.9],[57,57,57,35.4],[56,56,56,35.9],[55,55,55,36.4],[53,53,53,36.9],[52,52,52,37.4],[51,51,51,37.9],[50,50,50,38.4],[48,48,48,38.9],[47,47,47,39.4],[46,46,46,39.9],[44,44,44,40.4],[43,43,43,40.9],[42,42,42,41.4],[41,41,41,41.9],[39,39,39,42.4],[38,38,38,42.9],[37,37,37,43.4],[35,35,35,43.9],[34,34,34,44.4],[33,33,33,44.9],[31,31,31,45.4],[30,30,30,45.9],[29,29,29,46.4],[28,28,28,46.9],[26,26,26,47.4],[25,25,25,47.9],[24,24,24,48.4],[22,22,22,48.9],[21,21,21,49.4],[20,20,20,49.9],[19,19,19,50.4],[17,17,17,50.9],[16,16,16,51.4],[15,15,15,51.9],[13,13,13,52.4],[12,12,12,52.9],[11,11,11,53.4],[9,9,9,53.9],[8,8,8,54.4],[7,7,7,54.9],[6,6,6,55.4],[4,4,4,55.9],[3,3,3,56.4],[2,2,2,56.9],[1,1,1,57.4]],lut;
 function* thermalLutSteps(){if(lut)return lut;var table=new Uint8Array(32768);for(var k=0;k<32768;k++){if(k%128===0)yield;var r=((k>>10)&31)*255/31,g=((k>>5)&31)*255/31,b=(k&31)*255/31,best=Infinity,temp=60;PALETTE.forEach(function(p){var dist=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;if(dist<best-.01||Math.abs(dist-best)<.01&&p[3]>temp){best=dist;temp=p[3];}});table[k]=Math.round(Math.max(0,Math.min(1,(30-temp)/110))*255);}lut=table;return lut;}
 function* normalizeThermalSteps(pixels,width){
  var table=yield* thermalLutSteps(),kind;
  if(width){
   // Cold and warm sections of the published palette reuse grey codes. Decode
   // a whole connected patch once, rather than searching a tiny window around
   // each pixel. Only bounded patches enclosed by predominantly unambiguous
   // cold codes take the cold branch. Warm terrain, long bands and coverage
   // boundaries retain the warm branch. WMS resampling also mixes grey with
   // adjacent cold colors, so membership follows the decoded branch rather
   // than requiring exactly grey RGB. This is conservative display decoding.
   var height=pixels.length/4/width,count=width*height,queue=new Uint32Array(count);
   kind=new Uint8Array(count);
   for(var index=0;index<count;index++){
    if(index%(width*4)===0)yield;
    var at=index*4,r=pixels[at],g=pixels[at+1],b=pixels[at+2],decoded=table[(r>>3)*1024+(g>>3)*32+(b>>3)],spread=Math.max(r,g,b)-Math.min(r,g,b);
    if(pixels[at+3])kind[index]=decoded<115?1:decoded>185&&(spread>24||Math.min(r,g,b)>205)?2:3;
   }
   var maxSpan=Math.max(8,Math.ceil(width*3/360));
   for(var seed=0;seed<count;seed++){
    if(seed%(width*4)===0)yield;if(kind[seed]!==1)continue;
    var head=0,tail=1,left=width,right=-1,top=height,bottom=-1,cold=0,border=0,closed=true;
    var coldLeft=width,coldRight=-1,coldTop=height,coldBottom=-1;queue[0]=seed;kind[seed]=4;
    while(head<tail){
     if(head%(width*2)===0)yield;
     var index=queue[head++],x=index%width,y=Math.floor(index/width);
     left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
     for(var direction=0;direction<4;direction++){
      var nx=x+(direction===0?-1:direction===1?1:0),ny=y+(direction===2?-1:direction===3?1:0);
      if(ny<0||ny>=height){closed=false;continue;}nx=(nx+width)%width;var next=ny*width+nx,code=kind[next];
      if(code===1){kind[next]=4;queue[tail++]=next;continue;}if(code===4)continue;
      if(!code){closed=false;continue;}border++;
      if(code===2){cold++;coldLeft=Math.min(coldLeft,nx);coldRight=Math.max(coldRight,nx);coldTop=Math.min(coldTop,ny);coldBottom=Math.max(coldBottom,ny);}
     }
    }
    if(!closed||right-left+1>maxSpan||bottom-top+1>maxSpan||cold<4||cold<border*.6||coldLeft>left||coldRight<right||coldTop>top||coldBottom<bottom)continue;
    for(var member=0;member<tail;member++){
     var index=queue[member],at=index*4,grey=(pixels[at]+pixels[at+1]+pixels[at+2])/3,previous=PALETTE[12],temp=previous[3];
     for(var code=13;code<=21;code++){var next=PALETTE[code];if(grey>=next[0]){var fraction=Math.max(0,Math.min(1,(previous[0]-grey)/(previous[0]-next[0])));temp=previous[3]+(next[3]-previous[3])*fraction;break;}previous=next;temp=next[3];}
     pixels[at]=pixels[at+1]=pixels[at+2]=Math.round(Math.max(0,Math.min(1,(30-temp)/110))*255);kind[index]=5;
    }
   }
  }
  for(var i=0;i<pixels.length;i+=4){if(i%((width||512)*16)===0)yield;if(!pixels[i+3]||kind&&kind[i/4]===5)continue;var value=table[(pixels[i]>>3)*1024+(pixels[i+1]>>3)*32+(pixels[i+2]>>3)];pixels[i]=pixels[i+1]=pixels[i+2]=value;}return pixels;
 }
 function drain(steps){var part;do{part=steps.next();}while(!part.done);return part.value;}
 function normalizeThermal(pixels,width){return drain(normalizeThermalSteps(pixels,width));}
 // A saturated scan can be encoded as opaque white in the infrared palette
 // and cyan in GeoColor, including in the provider's PNG. Reject only broad
 // rows dominated by that exact saturation, below the polar region. This is
 // a conservative display check, not a replacement for instrument quality flags.
 function* maskScanArtifactsSteps(sources,width){
  var height=width/2;
  for(var pair=0;pair<3;pair++){var visible=sources[pair],infrared=sources[pair+5];if(!infrared)continue;var badRows=new Uint8Array(height);
   for(var y=0;y<height;y++){if(y%4===0)yield;var lat=90-(y+.5)*180/height;if(Math.abs(lat)>60)continue;var covered=0,saturated=0;
    for(var x=0;x<width;x++){var at=(y*width+x)*4;if(infrared[at+3]<200)continue;covered++;if(Math.min(infrared[at],infrared[at+1],infrared[at+2])>=248)saturated++;}
    if(saturated<width*.18||saturated<covered*.85)continue;
    badRows[y]=1;
   }
   var padding=Math.ceil(width/512);
   for(var row=0;row<height;row++){if(row%4===0)yield;if(badRows[row])for(var ry=Math.max(0,row-padding);ry<=Math.min(height-1,row+padding);ry++)for(var col=0;col<width;col++){var p=(ry*width+col)*4;infrared[p+3]=0;if(visible)visible[p+3]=0;}}
  }return sources;
 }
 function maskScanArtifacts(sources,width){return drain(maskScanArtifactsSteps(sources,width));}
 // Prefer the satellite looking more directly down on a location. Separate
 // Meteosat requests avoid its server mosaic's abrupt, stretched limb borders.
 // This is a display blend of observed pixels, not a meteorological retrieval.
 var blendWidth=0,blendLongitude=[];
 function* compositeSteps(sources,width,kind){
  if(blendWidth!==width){blendWidth=width;blendLongitude=GROUPS.map(function(g){var v=new Float32Array(width);for(var x=0;x<width;x++){var lon=(x+.5)*360/width-180,best=-1;g.longitudes.forEach(function(s){best=Math.max(best,Math.cos((lon-s)*Math.PI/180));});v[x]=best;}return v;});}
  var longitude=blendLongitude,height=width/2,out=new Uint8ClampedArray(width*height*4),indices=[];GROUPS.forEach(function(g,i){if(g.kind===kind&&sources[i])indices.push(i);});
  for(var y=0;y<height;y++){if(y%4===0)yield;var latitude=Math.cos(((y+.5)*180/height-90)*Math.PI/180);for(var x=0;x<width;x++){
   var at=(y*width+x)*4,total=0,r=0,g=0,b=0,alpha=0,bestView=0;
   for(var j=0;j<indices.length;j++){var i=indices[j],p=sources[i],a=p[at+3]/255;if(!a)continue;var view=latitude*longitude[i][x],q=Math.max(0,view-.15);q*=q;var w=q*q*a;if(!w)continue;total+=w;r+=p[at]*w;g+=p[at+1]*w;b+=p[at+2]*w;alpha=Math.max(alpha,a);bestView=Math.max(bestView,view);}
   if(total){var edge=Math.max(0,Math.min(1,(bestView-.15)/.15));out[at]=r/total;out[at+1]=g/total;out[at+2]=b/total;out[at+3]=255*alpha*edge*edge*(3-2*edge);}
  }}return out;
 }
 function composite(sources,width,kind){return drain(compositeSteps(sources,width,kind));}
 return {STEP:STEP,PROCESSING:6,GROUPS:GROUPS,NASA:NASA,CACHE:CACHE,parseCatalog:parseCatalog,validate:validate,productTime:productTime,sourceTimes:sourceTimes,published:published,frameAt:frameAt,frames:frames,fetchCatalog:fetchCatalog,urls:urls,imageBlob:imageBlob,fetchFrame:fetchFrame,discard:discard,normalizeThermal:normalizeThermal,normalizeThermalSteps:normalizeThermalSteps,maskScanArtifacts:maskScanArtifacts,maskScanArtifactsSteps:maskScanArtifactsSteps,composite:composite,compositeSteps:compositeSteps};
}));
