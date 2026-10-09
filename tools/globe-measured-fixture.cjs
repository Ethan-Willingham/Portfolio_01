/* Test-only observation clocks. The pixel fixtures describe each test separately. */
'use strict';
module.exports=function measuredManifest(frames,generatedAt,processing){
 const ids=['goes18','goes19','himawari9','meteosat-iodc','meteosat-mtg'],methods=['ABI-L2-CMI-C13','ABI-L2-CMI-C13','AHI-HSD-B13','msg_iodc:ir108','mtg_fd:ir105_hrfi'];
 frames.forEach(frame=>{frame.natural=false;frame.observations=Array(5).fill(null).concat(ids.map((id,i)=>({id,method:methods[i],start:new Date(Date.parse(frame.time)-600000).toISOString(),end:frame.time})));frame.sourceTimes=frame.observations.map(o=>o&&o.start);});
 return {version:3,width:2048,processing,generatedAt,catalog:{version:2,checkedAt:generatedAt,times:frames.map(f=>f.time)},frames};
};
