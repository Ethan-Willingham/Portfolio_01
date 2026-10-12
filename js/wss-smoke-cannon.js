/* A tensioned drumhead displaces air; current pressure loads skin and slime. */
(function(root){
  'use strict';
  function create(definition,fluid,world,options){
    var field=null,clock=0,pushes=0,pressureImpulseX=0,pressureImpulseY=0,peakLoad=0,bodyStart=null;
    var savedConfig={},keys=['CURL','VELOCITY_DISSIPATION','DENSITY_DISSIPATION','PRESSURE_ITERATIONS','SOLID_PROJECTION','SIM_RESOLUTION'];
    keys.forEach(function(k){savedConfig[k]=fluid.config[k];});
    fluid.config.CURL=0;fluid.config.VELOCITY_DISSIPATION=.025;fluid.config.DENSITY_DISSIPATION=.06;fluid.config.PRESSURE_ITERATIONS=32;
    var savedPhysics=fluid.getPhysics();fluid.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0,VISCOSITY:.08,EDGE_SPIN:0},0);
    fluid.config.SOLID_PROJECTION=0;
    if(definition.drum){var canvas=fluid.getCanvas();fluid.config.SIM_RESOLUTION=224;fluid.resize(canvas.width,canvas.height,true);}
    var drum=definition.drum,skin=null,skinVelocity=null,segments=[],combined=[],strikeEnergy=0,pressureWork=0,dampingLoss=0,displacedArea=0,outletSpeed=0;
    if(drum){
      skin=new Float64Array(drum.nodes);skinVelocity=new Float64Array(drum.nodes);
      for(var edge=0;edge<drum.nodes-1;edge++)segments.push({ringN:4,ring:new Int32Array([0,1,2,3]),px:new Float32Array(4),py:new Float32Array(4)});
      updateSkin();
    }
    function updateSkin(){
      if(!drum)return;
      var spacing=(drum.bottom-drum.top)/(drum.nodes-1),half=drum.thickness*.5;
      segments.forEach(function(b,i){
        var x=drum.x+skin[i],next=drum.x+skin[i+1],y=drum.top+i*spacing;
        b.px.set([x-half,x+half,next+half,next-half]);b.py.set([y,y,y+spacing,y+spacing]);
      });
    }
    function prepare(dt){
      if(!drum || !(dt>0))return;
      // Fixed substeps resolve the membrane's tension waves. No clocked
      // animation curve drives the strike or rebound.
      var steps=Math.ceil(dt/(1/480)),h=dt/steps,spacing=(drum.bottom-drum.top)/(drum.nodes-1);
      for(var s=0;s<steps;s++){
        for(var j=1;j<drum.nodes-1;j++){
          var x=drum.x+skin[j],y=drum.top+j*spacing;
          var pressure=(sample(x-drum.thickness*.5-3,y).p-sample(x+drum.thickness*.5+3,y).p)*.00006*spacing;
          var tension=drum.tension*(skin[j-1]-2*skin[j]+skin[j+1]);
          // A stiff backing stop prevents a piled-up strike folding the skin.
          var limit=drum.maxStroke || 40;
          var stop=skin[j]>limit ? -2000*(skin[j]-limit) : skin[j]<-24 ? -2000*(skin[j]+24) : 0;
          var damping=drum.damping*skinVelocity[j];
          pressureWork+=pressure*skinVelocity[j]*h;dampingLoss+=damping*skinVelocity[j]*h;
          skinVelocity[j]+=(tension+pressure+stop-damping)*h/drum.mass;
        }
        for(var k=1;k<drum.nodes-1;k++)skin[k]+=skinVelocity[k]*h;
      }
      updateSkin();
      // Compression establishes a chamber flow from the measured swept area.
      // The previous immersed-boundary-only solve lost most of this pulse.
      // This bounded velocity penalty supplies that unresolved chamber flow;
      // projection and advection then form the rolling front. Refill is left
      // to the moving boundary, not an extra reversed jet at the mouth.
      var area=0;
      for(var node=1;node<drum.nodes-1;node++)area+=skin[node]*spacing;
      outletSpeed=(area-displacedArea)/(dt*drum.opening.height);displacedArea=area;
      var scale=fluid.config.SIM_RESOLUTION/world.h,follow=1-Math.exp(-48*dt);
      var plugSpeed=outletSpeed*drum.opening.height/(drum.bottom-drum.top);
      if(plugSpeed>0)for(var x=112;x<=224;x+=16)for(var y=drum.top+16;y<=drum.bottom-16;y+=16){
        var actual=sample(x,y).vx;
        fluid.splatVelocity(x/world.w,1-y/world.h,Math.max(0,plugSpeed-actual)*scale*follow,0,.065);
      }
    }
    function movingBodies(bodies){combined.length=0;Array.prototype.push.apply(combined,bodies);Array.prototype.push.apply(combined,segments);return combined;}
    function fill(){
      var color={r:.8,g:.72,b:.6};
      for(var x=176;x<=224;x+=16)for(var y=176;y<=224;y+=16)
        fluid.splat(x/world.w,1-y/world.h,0,0,color,.11);
    }
    function push(){
      if(definition.noPush)return false;
      if(drum){
        // The visitor hits the skin, not the fluid. Its actual displacement
        // enters the shared immersed-boundary pass before pressure projection.
        if(skinVelocity.some(function(v){return Math.abs(v)>drum.strikeSpeed*.75;}))return false;
        fill();
        for(var j=1;j<drum.nodes-1;j++){
          var impulse=drum.strikeSpeed*Math.pow(Math.sin(Math.PI*j/(drum.nodes-1)),2);
          strikeEnergy+=.5*drum.mass*((skinVelocity[j]+impulse)*(skinVelocity[j]+impulse)-skinVelocity[j]*skinVelocity[j]);
          skinVelocity[j]+=impulse;
        }
        pushes++;return true;
      }
      // One declared impulse across the rear of the chamber. The opening and
      // projection solve form the counter-rotating section, not authored spin.
      fill();
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
        membrane:drum ? {displacement:Array.from(skin),velocity:Array.from(skinVelocity),centerX:drum.x+skin[(drum.nodes-1)/2],displacedArea:displacedArea,outletSpeed:outletSpeed,
          strikeEnergy:strikeEnergy,pressureWork:pressureWork,dampingLoss:dampingLoss,movingSegments:segments.length} : null,
        noPush:definition.noPush,model:drum ? 'Measured membrane swept area drives chamber compression; immersed skin and current pressure feedback; 2D vortex-pair section' : '2D vortex-pair section; current projection pressure traction; no authored path or wobble'};
    }
    function draw(c){
      if(!drum)return;
      c.save();
      // Draw the actual solid casing and fixed clamps, at the same coordinates
      // as the air obstacle mask. The generic smoothed wall outline otherwise
      // rounds these thin corners away from the membrane's pinned endpoints.
      c.fillStyle=c.strokeStyle;
      c.globalAlpha=.55;
      definition.solids.forEach(function(wall){c.fillRect(wall.x,wall.y,wall.width,wall.height);});
      c.globalAlpha=1;
      c.fillRect(drum.x-drum.thickness*.5,drum.top-drum.thickness,drum.thickness,drum.thickness);
      c.fillRect(drum.x-drum.thickness*.5,drum.bottom,drum.thickness,drum.thickness);
      c.lineWidth=drum.thickness;c.lineCap='butt';c.beginPath();
      for(var i=0;i<drum.nodes;i++){var x=drum.x+skin[i],y=drum.top+i*(drum.bottom-drum.top)/(drum.nodes-1);if(i)c.lineTo(x,y);else c.moveTo(x,y);}
      c.stroke();c.restore();
    }
    if(!options || options.initial!==false){if(definition.noPush || drum)fill();else push();}
    return {push:push,prepare:drum ? prepare : null,movingBodies:drum ? movingBodies : null,draw:drum ? draw : null,
      controlTarget:drum ? function(){var lo=0,hi=0;for(var i=1;i<skin.length-1;i++){lo=Math.min(lo,skin[i]);hi=Math.max(hi,skin[i]);}
        return {x:drum.x+(lo+hi)*.5,y:(drum.top+drum.bottom)*.5,width:Math.max(64,hi-lo+32),height:drum.bottom-drum.top+16};} : null,
      overlayKey:drum ? function(){return skin.join(',');} : null,capture:capture,load:load,stats:stats,sample:sample,
      destroy:function(){keys.forEach(function(k){fluid.config[k]=savedConfig[k];});fluid.setPhysics(savedPhysics,0);
        if(drum){var canvas=fluid.getCanvas();fluid.resize(canvas.width,canvas.height,true);}}};
  }
  root.WSSSmokeCannon={create:create};
})(typeof window!=='undefined'?window:globalThis);
