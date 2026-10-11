/* Exterior smoke pressure loads the existing elastic slime ring. */
(function(root){
  'use strict';
  function create(definition,fluid,world){
    var field=null,clock=0,pushes=0,pressureImpulseX=0,pressureImpulseY=0,peakLoad=0,bodyStart=null;
    var savedConfig={},keys=['CURL','VELOCITY_DISSIPATION','DENSITY_DISSIPATION','PRESSURE_ITERATIONS'];
    keys.forEach(function(k){savedConfig[k]=fluid.config[k];});
    fluid.config.CURL=0;fluid.config.VELOCITY_DISSIPATION=.025;fluid.config.DENSITY_DISSIPATION=.06;fluid.config.PRESSURE_ITERATIONS=32;
    var savedPhysics=fluid.getPhysics();fluid.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0,VISCOSITY:.08,EDGE_SPIN:0},0);
    function fill(){
      for(var x=176;x<=224;x+=16)for(var y=176;y<=224;y+=16)
        fluid.splat(x/world.w,1-y/world.h,0,0,{r:.8,g:.72,b:.6},.11);
    }
    function push(){
      if(definition.noPush)return false;
      fill();
      // One declared impulse across the rear of the chamber. The opening and
      // projection solve form the counter-rotating section, not authored spin.
      for(var x=112;x<=224;x+=16)for(var y=168;y<=232;y+=16)
        fluid.splatVelocity(x/world.w,1-y/world.h,210,0,.065);
      pushes++;return true;
    }
    function sample(x,y){
      if(!field)return {vx:0,vy:0,p:0,dye:0};
      var gx=x/world.w*field.width-.5,gy=(1-y/world.h)*field.height-.5;
      var x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,r={vx:0,vy:0,p:0,dye:0};
      for(var k=0;k<4;k++){
        var col=Math.max(0,Math.min(field.width-1,x0+(k&1))),row=Math.max(0,Math.min(field.height-1,y0+(k>>1)));
        var w=((k&1)?fx:1-fx)*((k>>1)?fy:1-fy),i=(row*field.width+col)*4;
        r.vx+=w*field.values[i];r.vy-=w*field.values[i+1];r.p+=w*field.values[i+2];r.dye+=w*field.values[i+3];
      }
      return r;
    }
    function capture(dt,bodies){
      clock+=dt;field=fluid.sampleFlow(world.w,world.h);
      if(!field)throw new Error('The smoke cannon needs a WebGL 2 pressure field.');
      for(var i=0;i<field.values.length;i++)if(!Number.isFinite(field.values[i]))throw new Error('Smoke field contains a non-finite value.');
      bodies.forEach(function(b){if(!bodyStart)bodyStart={x:b.cx,y:b.cy};b.sleeping=false;b.sleepFrames=0;});
    }
    function load(b,h,timescale){
      if(!field || !b.ringN)return;
      var dt=h/timescale,massPoint=.09,airDensity=.00006;
      // Uniform exterior pressure has zero net force around a closed ring.
      // Each edge's traction is split between its two existing gel nodes.
      var mean=0,loads=[];
      for(var k=0;k<b.ringN;k++){
        var i=b.ring[k],j=b.ring[(k+1)%b.ringN],ex=b.px[j]-b.px[i],ey=b.py[j]-b.py[i],length=Math.hypot(ex,ey);
        if(!(length>0))continue;
        var mx=(b.px[i]+b.px[j])*.5,my=(b.py[i]+b.py[j])*.5,nx=ey/length,ny=-ex/length;
        if(nx*(mx-b.cx)+ny*(my-b.cy)<0){nx=-nx;ny=-ny;}
        var p=sample(mx+nx*6,my+ny*6).p;mean+=p;
        loads.push({i:i,j:j,nx:nx,ny:ny,length:length,p:p});
      }
      mean/=Math.max(1,loads.length);
      loads.forEach(function(edge){
        var fx=-(edge.p-mean)*airDensity*edge.nx*edge.length,fy=-(edge.p-mean)*airDensity*edge.ny*edge.length;
        var amount=.5*dt*dt/massPoint;
        b.px[edge.i]+=fx*amount;b.py[edge.i]+=fy*amount;b.px[edge.j]+=fx*amount;b.py[edge.j]+=fy*amount;
        pressureImpulseX+=fx*dt;pressureImpulseY+=fy*dt;peakLoad=Math.max(peakLoad,Math.hypot(fx,fy));
      });
    }
    function stats(bodies){
      var upper=0,lower=0,dye=0,dx=0,dy=0,cx=0,travelDye=0;
      if(field){var hx=world.w/field.width,hy=world.h/field.height,v=field.values;
        for(var row=1;row<field.height-1;row++)for(var col=1;col<field.width-1;col++){
          var i=(row*field.width+col)*4,x=(col+.5)*hx,y=world.h-(row+.5)*hy;
          if(x<248)continue;
          var d=Math.max(0,v[i+3]);dye+=d;cx+=d*x;if(x>330)travelDye+=d;
          var curl=(v[i+field.width*4]-v[i-field.width*4])/(2*hy)-(v[i+5]-v[i-3])/(2*hx);
          if(y<200)upper+=curl;else lower+=curl;
        }
      }
      var b=bodies[0],strain=0;
      if(b){dx=b.cx-(bodyStart?bodyStart.x:b.cx);dy=b.cy-(bodyStart?bodyStart.y:b.cy);
        for(var k=0;k<b.springN;k++){var a=b.sA[k],c=b.sB[k],r=b.sRest[k];if(r>0)strain=Math.max(strain,Math.abs(Math.hypot(b.px[a]-b.px[c],b.py[a]-b.py[c])/r-1));}}
      return {seconds:clock,pushes:pushes,fieldReady:!!field,upperCirculation:upper,lowerCirculation:lower,
        outsideDye:dye,travelDye:travelDye,dyeCenterX:dye?cx/dye:null,slimeDX:dx,slimeDY:dy,strain:strain,
        pressureImpulseX:pressureImpulseX,pressureImpulseY:pressureImpulseY,peakEdgeLoad:peakLoad,
        noPush:definition.noPush,model:'2D vortex-pair section; current projection pressure traction; no authored path or wobble'};
    }
    if(definition.noPush)fill();else push();
    return {push:push,capture:capture,load:load,stats:stats,sample:sample,
      destroy:function(){keys.forEach(function(k){fluid.config[k]=savedConfig[k];});fluid.setPhysics(savedPhysics,0);}};
  }
  root.WSSSmokeCannon={create:create};
})(typeof window!=='undefined'?window:globalThis);
