/* A steerable elastic hull. Ballast crosses a real opening in its carried skin. */
(function (root) {
  'use strict';
  var PARCEL_MASS = .002, PARCEL_AREA = 1.5625;
  function make(w, options) {
    options = options || {};
    var basin = {x:44, y:48, width:472, height:256};
    var d = {seed:options.seed || 17, pipes:[],solids:[],vents:[],parts:[],marks:[],meters:[],settings:{},boundaries:null,measure:{source:basin,receiver:basin}};
    d.name = 'slime-submarine'; d.title = 'Slime submarine'; d.draft = true;
    delete d.source;
    d.vessels = [{id:'basin', label:'Water', rect:basin, sealed:false}];
    d.initial = [{kind:'rect', rect:{x:52, y:168, width:456, height:128}}];
    d.slimes = [{x:120, y:156, radius:32}];
    d.seedClear = function(x,y) { return Math.hypot(x-120,y-156)>38; };
    d.membrane = {seedBoth:true, slit:false};
    // The permanent console owns the valve. Grabbing the hull still stretches it.
    d.primary = {kind:'ballast-valve'};
    d.action = 'Open ballast';
    d.submarine = {dryDensity:.68, blocked:!!options.blocked, basin:basin,
      targets:[{x:440,y:220}, {x:280,y:254}, {x:120,y:156}]};
    d.setup = options.blocked ? 'blocked' : 'valve';
    d.setups = [{id:'valve',label:'Floodable ballast',options:{}},
      {id:'blocked',label:'Blocked valve control',options:{blocked:true}}];
    d.setupNote = 'The blocked comparison keeps the same light hull sealed. Steering applies the same force in both setups.';
    d.caption = 'Steer through the numbered rings. Open the valve underwater to take on ballast. Lift the open hull clear of the pool to let it drain.';
    d.viewBounds = {x:36,y:32,width:488,height:280};
    d.readingLabel = 'Ballast closed'; d.draftGravity = 1;
    d.boundaryNote = 'The elastic skin is a two-sided native-water container. The gold valve marks one material interval of its collision curve. Opening it permits actual water crossings; closing it traps the existing charge. No valve or steering action creates, deletes or teleports water. Ballast mass is the measured interior parcel count times 0.002. Four directional controls apply a bounded external motor force uniformly to the shell nodes. Releasing them removes that force, leaving inertia, gravity, buoyancy and existing water drag. Course rings are non-colliding markers checked against the hull center.';
    d.energyBudgetStatus = 'Dry shell mass is 0.68 times initial displaced-water mass. The steering motor supplies external work with a maximum force of 2.4 times dry shell weight, shared across diagonal inputs. Its reaction apparatus is outside the model; it is not a simulated propeller. Buoyancy retains the one-way surface approximation with measured shell and carried-water mass. Native membrane reactions and asynchronous inventory measurements are approximate, with no calibrated submarine or closed energy claim.';
    return d;
  }
  var previous = root.WSSDraftRuntime;
  root.WSSDraftRuntime = {create:function(c) {
    if (!c.definition.submarine) return previous && previous.create ? previous.create(c) : null;
    var b=c.bodies[0], m=c.membrane, d=c.definition, L=c.liquid, basin=d.submarine.basin;
    var open=false, retired=false, initialY=b.cy, mirrorTime=-Infinity, mirrorUpdated=-Infinity;
    var count=0, max=0, visited=0, courseTime=0, total=0, surface=168;
    var input={left:false,right:false,up:false,down:false}, velocity={x:0,y:0};
    var lastX=b.cx, lastY=b.cy, lastClock=L.simulationClock, forceX=0, forceY=0;
    var cols=Math.ceil((basin.x+basin.width)/8), rows=Math.ceil((basin.y+basin.height)/8);
    var bins=new Uint16Array(cols*rows), targets=d.submarine.targets;
    function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,v)); }
    function controls() { return b.surfaceSlime && b.surfaceSlime.fluidControls; }
    function skinArea() {
      var curve=controls(), area=0;
      if (curve) {
        var ring=root.WSSWaterBalloons.geometry.curveRing(curve);
        for(var i=0;i<ring.length;i++) { var p=ring[i],q=ring[(i+1)%ring.length]; area+=p.x*q.y-q.x*p.y; }
      } else for(var k=0;k<b.ringN;k++) {
        var a=b.ring[k],z=b.ring[(k+1)%b.ringN]; area+=b.px[a]*b.py[z]-b.px[z]*b.py[a];
      }
      return Math.max(1,Math.abs(area)*.5);
    }
    var displaced=skinArea()*PARCEL_MASS/PARCEL_AREA, dry=displaced*d.submarine.dryDensity;
    var valveEdge=0, best=-Infinity;
    for(var k=0;k<20;k++) {
      var p=root.WSSWaterBalloons.geometry.quadratic(controls(),(k+.5)/20);
      var dx=p.x-b.cx,dy=p.y-b.cy,score=dx+dy*.5;
      if(dy>=0 && score>best) { best=score; valveEdge=k; }
    }
    total=dry; b.ballastBuoyancy=true;
    b.fluidDensityRatio=d.submarine.dryDensity; b.nativePointMass=dry/b.n;
    function wake() { b.sleeping=false; b.sleepFrames=0; }
    function releaseInput() {
      Object.keys(input).forEach(function(key) { input[key]=false; }); forceX=forceY=0;
    }
    function setInput(name,active) {
      if(retired || !Object.prototype.hasOwnProperty.call(input,name)) return false;
      input[name]=!!active; if(active)wake(); return true;
    }
    function updateSurface(now) {
      // Probe native water only when its CPU mirror changes. The tank dimensions
      // determine the bins; water inside the hull never defines its own surface.
      if(L.readbackAppliedTime!==mirrorTime) {
        mirrorTime=L.readbackAppliedTime; mirrorUpdated=now;
        bins.fill(0);
        var arr=L.liquid.arrays,n=L.liquid.getCount(), levels=[];
        for(var i=0;i<n;i++) {
          var x=arr.x[i],y=arr.y[i];
          if(x<basin.x+8 || x>=basin.x+basin.width-8 || y<basin.y || y>=basin.y+basin.height-8 || Math.abs(x-b.cx)<52)continue;
          bins[Math.floor(y/8)*cols+Math.floor(x/8)]++;
        }
        for(var col=Math.ceil((basin.x+8)/8);col<Math.floor((basin.x+basin.width-8)/8);col++) {
          if(Math.abs(col*8-b.cx)<52)continue;
          for(var row=Math.floor(basin.y/8);row<rows-1;row++) if(bins[row*cols+col]>=10) { levels.push(row*8); break; }
        }
        if(levels.length>6) { levels.sort(function(a,b){return a-b;}); surface=levels[Math.floor(levels.length/2)]; }
      }
      if(Number.isFinite(mirrorTime) && now-mirrorUpdated<=300)b.fluidSurfaceY=surface;
      else delete b.fluidSurfaceY;
    }
    function stats() {
      var s=m.stats();
      return {ready:!retired,open:open,valveEdge:valveEdge,blocked:d.submarine.blocked,
        carried:count,maxCarried:max,dryMass:dry,totalMass:total,density:b.fluidDensityRatio,displacedMass:displaced,
        fill:clamp(count*PARCEL_MASS/displaced,0,1),depth:clamp((b.cy-surface)/(basin.y+basin.height-8-surface),0,1),
        waterSurfaceY:surface,mirrorAgeMs:performance.now()-mirrorUpdated,x:b.cx,y:b.cy,dy:b.cy-initialY,
        vx:velocity.x,vy:velocity.y,waterCount:s.waterCount,nonfinite:s.nonfinite,sideViolations:s.sideViolations,
        visited:visited,totalTargets:targets.length,completed:visited===targets.length,courseTime:courseTime,
        input:Object.assign({},input),forceX:forceX,forceY:forceY,error:s.error || null};
    }
    function primary() {
      if(retired)return false;
      if(d.submarine.blocked) { d.action='Valve blocked'; return true; }
      open=!open; m.setSlit(open,valveEdge); d.action=open?'Close ballast':'Open ballast'; wake();
      d.submarineReading=stats(); return true;
    }
    function tick() {
      var s=m.stats(), now=performance.now(), dt=Math.max(0,L.simulationClock-lastClock);
      if(dt>0) { velocity.x=(b.cx-lastX)/dt; velocity.y=(b.cy-lastY)/dt; }
      lastX=b.cx; lastY=b.cy; lastClock=L.simulationClock;
      count=s.carriedInside || 0; max=Math.max(max,count); total=dry+count*PARCEL_MASS;
      displaced=skinArea()*PARCEL_MASS/PARCEL_AREA;
      b.fluidDensityRatio=total/displaced; b.nativePointMass=total/b.n;
      updateSurface(now);
      if(visited<targets.length) {
        courseTime+=dt;
        var target=targets[visited];
        if(Math.hypot(b.cx-target.x,b.cy-target.y)<25)visited++;
      }
      if(Object.keys(input).some(function(key){return input[key];}))wake();
      d.readingLabel=(open?'Ballast open, ':'Ballast closed, ')+Math.round(count*PARCEL_MASS/displaced*100)+'% full';
      d.submarineReading=stats();
    }
    function load(body,h,ts) {
      if(body!==b || retired)return;
      var x=Number(input.right)-Number(input.left), y=Number(input.down)-Number(input.up);
      var length=Math.max(1,Math.hypot(x,y));
      // A declared finite motor force acts through the existing Verlet step.
      // It never assigns velocity or a destination, and a loaded hull responds
      // less to the same force. Dividing by ts^2 expresses force in real time.
      var thrust=dry*c.bodyGravity()*2.4;
      forceX=x/length*thrust; forceY=y/length*thrust;
      if(!x && !y)return;
      var dt=h/ts, sx=forceX/total*dt*dt, sy=forceY/total*dt*dt;
      for(var i=0;i<b.n;i++) { b.px[i]+=sx; b.py[i]+=sy; }
    }
    function draw(ctx,view) {
      view=view || {}; var scale=view.scale || 1, palette=view.palette;
      function color(token,fallback) { return palette ? palette.getPropertyValue(token).trim() || fallback : fallback; }
      var gold=color('--app-brass',ctx.strokeStyle),text=color('--text',ctx.fillStyle),dim=color('--text-faint',text);
      ctx.save(); ctx.lineWidth=1/scale; ctx.textAlign='center'; ctx.textBaseline='middle';
      // Depth references and the course belong to this tank, not the water field.
      for(var k=1;k<=3;k++) {
        var y=168+k*40;
        ctx.globalAlpha=.15;ctx.strokeStyle=dim;ctx.setLineDash([2/scale,7/scale]);ctx.beginPath();ctx.moveTo(basin.x+10,y);ctx.lineTo(basin.x+basin.width-10,y);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.globalAlpha=1;
      targets.forEach(function(t,index) {
        var done=index<visited, active=index===visited;
        ctx.strokeStyle=active?gold:dim;ctx.globalAlpha=done?.3:active?1:.45;ctx.lineWidth=(active?2:1)/scale;
        ctx.beginPath();ctx.arc(t.x,t.y,25,0,Math.PI*2);ctx.stroke();
        if(active) { ctx.beginPath();ctx.arc(t.x,t.y,30,-Math.PI*.8,-Math.PI*.2);ctx.stroke(); }
        ctx.fillStyle=active?gold:text;ctx.font=(14/scale)+'px "Commit Mono", monospace';ctx.fillText(done?'OK':String(index+1).padStart(2,'0'),t.x,t.y);
      });
      ctx.globalAlpha=1;
      var curve=controls(),valve=root.WSSWaterBalloons.geometry.quadratic(curve,(valveEdge+.5)/20);
      ctx.strokeStyle=gold;ctx.fillStyle=gold;ctx.lineWidth=2/scale;
      ctx.beginPath();ctx.arc(valve.x,valve.y,4,0,Math.PI*2);if(open)ctx.stroke();else ctx.fill();
      // Small arrows display the applied motor direction. Water motion remains
      // entirely the solver's output; these are controls, not painted exhaust.
      var ix=Number(input.right)-Number(input.left),iy=Number(input.down)-Number(input.up),len=Math.hypot(ix,iy);
      if(len) {
        ix/=len;iy/=len;var x=b.cx+ix*45,y=b.cy+iy*45;
        ctx.beginPath();ctx.moveTo(x-ix*12,y-iy*12);ctx.lineTo(x+ix*12,y+iy*12);
        ctx.moveTo(x+ix*12,y+iy*12);ctx.lineTo(x+ix*4-iy*6,y+iy*4+ix*6);
        ctx.moveTo(x+ix*12,y+iy*12);ctx.lineTo(x+ix*4+iy*6,y+iy*4-ix*6);ctx.stroke();
      }
      ctx.restore();
    }
    tick();
    return {primary:primary,tick:tick,load:load,draw:draw,stats:stats,setInput:setInput,releaseInput:releaseInput,
      restartCourse:function(){visited=0;courseTime=0;releaseInput();d.submarineReading=stats();return true;},
      destroy:function(){retired=true;releaseInput();delete b.ballastBuoyancy;delete b.fluidDensityRatio;delete b.nativePointMass;delete b.fluidSurfaceY;}};
  }};
  root.WSSMachines['slime-submarine']={make:make};root.WSSSlimeSubmarine={make:make};
})(typeof window!=='undefined'?window:globalThis);
