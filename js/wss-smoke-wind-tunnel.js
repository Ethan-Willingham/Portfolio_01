/* Steady forcing, canonical pressure traction and a finite point support. */
(function(root){
  'use strict';
  function create(definition,fluid,world,bodies){
    if(!bodies[0] || !(bodies[0].ringN>=3))throw Error('The smoke tunnel needs its elastic slime.');
    var pressure=root.WSSSmokeCannon.create(Object.assign({},definition,{noPush:true}),fluid,world,{initial:false});
    var ambientWind=fluid.config.wind_x;fluid.config.wind_x=0;
    var optics={},opticalKeys=['OPTICAL_DENSITY','OPTICAL_BRIGHTNESS','OPTICAL_ABSORPTION'];
    opticalKeys.forEach(function(key){optics[key]=fluid.config[key];});
    fluid.config.OPTICAL_DENSITY=1;fluid.config.OPTICAL_BRIGHTNESS=.55;fluid.config.OPTICAL_ABSORPTION=12;
    fluid.config.DENSITY_DISSIPATION=.12;
    var body=bodies[0],support=definition.support,fan=definition.fan,tracer=definition.tracer,node=-1,nearest=Infinity;
    for(var k=0;k<body.ringN;k++){
      var i=body.ring[k],distance=Math.hypot(body.px[i]-support.x,body.py[i]-support.y);
      if(distance<nearest){nearest=distance;node=i;}
    }
    // The spring is born stress-free at the chosen material point.
    var anchor={x:body.px[node],y:body.py[node]},fanImpulse=0,supportWork=0;
    // Passive initial streaks expose the first flow; they carry no momentum.
    for(var sx=tracer.start;sx<=tracer.end;sx+=tracer.step)for(var sy=tracer.top;sy<=tracer.bottom;sy+=tracer.spacing)
      fluid.splat(sx/world.w,1-sy/world.h,0,0,{r:.20*tracer.initialAmount,g:.185*tracer.initialAmount,b:.165*tracer.initialAmount},tracer.radius);
    function prepare(dt){
      var scale=fluid.config.SIM_RESOLUTION/world.h;
      for(var y=fan.top;y<=fan.bottom;y+=fan.spacing){
        fluid.splat(fan.x/world.w,1-y/world.h,0,0,{r:.20*dt*tracer.rate,g:.185*dt*tracer.rate,b:.165*dt*tracer.rate},.025);
        if(fan.enabled)fluid.splatVelocity(fan.x/world.w,1-y/world.h,fan.acceleration*dt*scale,0,.10);
      }
      if(fan.enabled)fanImpulse+=fan.acceleration*dt;
    }
    function load(b,h,timescale){
      pressure.load(b,h,timescale);
      if(b!==body)return;
      var dt=h/timescale,mass=.09,stiffness=support.stiffness,damping=support.damping;
      var vx=(b.px[node]-b.ox[node])/dt,vy=(b.py[node]-b.oy[node])/dt;
      var denominator=1+(stiffness*dt*dt+damping*dt)/mass;
      var fx=(-stiffness*(b.px[node]-anchor.x)-damping*vx)/denominator;
      var fy=(-stiffness*(b.py[node]-anchor.y)-damping*vy)/denominator;
      var dx=fx*dt*dt/mass,dy=fy*dt*dt/mass;
      b.px[node]+=dx;b.py[node]+=dy;supportWork+=fx*dx+fy*dy;
    }
    function stats(list){
      var base=pressure.stats(list),x=body.cx+definition.slimes[0].radius+48,y=body.cy;
      // Current flow samples describe the wake; no sample drives motion.
      var dx=8,dy=8,upper=pressure.sample(x,y-20),lower=pressure.sample(x,y+20);
      function curl(cx,cy){return (pressure.sample(cx+dx,cy).vy-pressure.sample(cx-dx,cy).vy)/(2*dx)-
        (pressure.sample(cx,cy+dy).vx-pressure.sample(cx,cy-dy).vx)/(2*dy);}
      return Object.assign(base,{fanEnabled:fan.enabled,fanImpulse:fanImpulse,
        wakeUpperVY:upper.vy,wakeLowerVY:lower.vy,wakeCenterVY:pressure.sample(x,y).vy,
        wakeUpperCurl:curl(x,y-20),wakeLowerCurl:curl(x,y+20),wakeCenterCurl:curl(x,y),
        wakeDye:upper.dye+lower.dye,supportError:Math.hypot(body.px[node]-anchor.x,body.py[node]-anchor.y),
        supportWork:supportWork,model:'Steady fan; native obstacle wake and current pressure traction; compliant material-point support; no imposed eddies or sway'});
    }
    function draw(c){
      c.save();c.lineWidth=1;c.globalAlpha=.65;c.beginPath();c.moveTo(anchor.x,support.top);
      c.lineTo(anchor.x,anchor.y);c.lineTo(body.px[node],body.py[node]);c.stroke();
      c.beginPath();c.arc(anchor.x,support.top,3,0,Math.PI*2);c.stroke();c.globalAlpha=1;
      c.fillText(fan.enabled?'Fan on':'Fan off',80,104);c.fillText('Support',anchor.x+12,96);c.restore();
    }
    return {prepare:prepare,capture:pressure.capture,load:load,stats:stats,draw:draw,
      overlayKey:function(){return fan.enabled+':'+body.px[node].toFixed(1)+':'+body.py[node].toFixed(1);},
      toggle:function(){fan.enabled=!fan.enabled;definition.action=fan.enabled?'Stop fan':'Start fan';return true;},
      destroy:function(){pressure.destroy();fluid.config.wind_x=ambientWind;opticalKeys.forEach(function(key){fluid.config[key]=optics[key];});}};
  }
  root.WSSSmokeWindTunnel={create:create};
})(typeof window!=='undefined'?window:globalThis);
