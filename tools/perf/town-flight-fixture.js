// EXPERIMENT=tools/perf/town-flight-fixture.js SCENES=human-flyover FLIGHT_ROUTE=town.
// Normal town, seven radius-25 residents, and real keyboard flight thereafter.
// QUERY=snow=0&auditfire=1 adds three burning boiler chunks before warmup.
queueMicrotask(function(){
  var start=window.__audit.start;
  window.__audit.start=function(name,disable){
    start(name,disable);
    var positions=[[713,98],[774,98],[696,98],[6585,98],[6230,98],[5065,100],[5100,100]];
    for(var i=0;i<positions.length;i++) surfaceSlimeBuild(positions[i][0],positions[i][1],{id:9500+i,seed:.08+i*.115,hue:surfaceSlimeHues[i%surfaceSlimeHues.length],r:25});
    surfaceSlimesSeeded=true;
    if(/[?&]auditfire=1(?:&|$)/.test(location.search)){
      for(var fuel=0;fuel<3;fuel++){
        var body=hearthAddChunk('boiler',HEARTH_WIDTH/2+(fuel-1)*52,HEARTH_FLOOR-40,'coal');
        if(!body)throw Error('Town flight boiler fixture could not add fuel');
        body.heat=.7;body.lit=true;hearthFireGPU.ignite(body);
      }
    }
    player.x=5730;player.y=103;player.renderX=player.x;player.renderY=player.y;player.vx=0;player.vy=0;
    cam.snap=true;updateCamera();canvas.focus({preventScroll:true});
    window.__audit.flyState=function(){return{x:player.x,altitude:SKY_ROWS*TILE-(player.y+PLAYER_H),vy:player.vy,hull:player.hull,fuel:player.fuel,left:4700,right:6750,ceiling:180};};
    return window.__audit.state();
  };
});
queueMicrotask(function(){
 var stop=window.__audit.stop;
 window.__audit.stop=function(){var r=stop();r.ops=window.__sluiceOpsStats||null;r.fire={steps:hearthFireGPU.steps,errors:hearthFireGPU.errors,failed:hearthFireGPU.failed,chunks:hearthBeds.boiler.chunks.length};return r;};
});
