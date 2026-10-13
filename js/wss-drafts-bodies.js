/* Water-slime and floating-body sprint drafts. All liquid stays native. */
(function(root){
  'use strict';
  var entries=[
    {id:'water-balloon-fight',capability:'Water slimes',title:'Water-balloon fight',cue:'Draft. Fling the balloon at the slimes, then pop it.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:false},
    {id:'squid-jet',capability:'Water slimes',title:'Squid jet',cue:'Draft. Squeeze the slit skin and watch the released water.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:false},
    {id:'thirsty-slime',capability:'Water slimes',title:'Thirsty slime',cue:'Let it drink. Drag either gold handle inward to make water erupt.',status:'WORKS',draft:true,world:{w:720,h:400},pool:true},
    {id:'floating-block',capability:'Floating things',title:'Floating block',cue:'Push or drop the light block into water. Compare the dense block, which sinks.',status:'WORKS',draft:true,world:{w:720,h:400},pool:false},
    {id:'lorenz-wheel',capability:'Floating things',title:'Leaky-cup waterwheel',cue:'Water loads the hanging cups and turns the unpowered wheel.',status:'WORKS',draft:true,world:{w:720,h:400},pool:true},
    {id:'shishi-odoshi',capability:'Floating things',title:'Shishi-odoshi',cue:'Draft. Water pours onto a hinged trough; repeating cycles are unfinished.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:true},
    {id:'lift-lock',capability:'Floating things',title:'Peterborough lift lock',cue:'Draft. Open the link between the tanks and watch the guided carriers.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:false},
    {id:'ballast-railway',capability:'Floating things',title:'Water-ballast cliff railway',cue:'Draft. Carriers slide on rails; ballast and cable coupling are unfinished.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:true}
  ];
  function balloon(world,options,squid){
    var d=root.WSSMachines['water-balloons'].make(world,{seed:options&&options.seed,slit:squid});
    d.name=squid?'squid-jet':'water-balloon-fight';
    d.title=squid?'Squid jet':'Water-balloon fight';d.draft=true;delete d.source;
    d.setups=[];
    if(squid){
      d.action='Squeeze skin';d.primary={kind:'draft-squeeze'};d.draftGravity=0;
      d.slimes=[{x:340,y:192,radius:64}];
      d.initial=[{kind:'rect',rect:{x:280,y:176,width:120,height:64}}];
      d.caption='Draft. Squeeze the slit skin. Escaping water may push the body; propulsion is still being tested.';
      d.boundaryNote='The lower-side slit is a real missing membrane interval. The button supplies a balanced inward impulse to the gel nodes, representing a squeeze by the visitor. It gives no velocity to water and applies no jet thrust or prescribed body trajectory. Gravity is zero.';
      d.energyBudgetStatus+=' The squeeze adds declared hand work; useful propulsion has not been established.';
    }else{
      d.slimes=[{x:220,y:176,radius:56},{x:488,y:272,radius:24},{x:552,y:272,radius:28}];
      d.initial=[{kind:'rect',rect:{x:168,y:160,width:104,height:64}}];
      d.draftExtraSlimes=true;
      d.caption='Draft. Grab and fling the water balloon at the two slimes, then pop its skin.';
      d.boundaryNote+=' The two additional slimes are ordinary passive gel bodies. Grab supplies the throwing work; Pop releases the original native water.';
      d.energyBudgetStatus+=' The target slimes retain the ordinary one-way buoyancy and drag approximation.';
    }
    return d;
  }
  // A button press changes gel velocity, never its pose or the water state.
  // Subtracting the mean keeps the two virtual hands' net impulse balanced.
  function squeeze(body,h,timescale){
    if(!body||!body.n)return false;
    var dt=h/timescale,x=0,y=0,vx=[],vy=[],mx=0,my=0;
    if(!(dt>0))return false;
    for(var i=0;i<body.n;i++){x+=body.px[i];y+=body.py[i];}x/=body.n;y/=body.n;
    for(i=0;i<body.n;i++){
      var dx=body.px[i]-x,dy=body.py[i]-y,r=Math.hypot(dx,dy),a=r>1?36/r:0;
      vx[i]=dx*a;vy[i]=dy*a;mx+=vx[i];my+=vy[i];
    }
    mx/=body.n;my/=body.n;
    for(i=0;i<body.n;i++){body.ox[i]+=(vx[i]-mx)*dt;body.oy[i]+=(vy[i]-my)*dt;}
    body.sleeping=false;body.sleepFrames=0;return true;
  }
  function draft(world,options,id){
    if(id==='lorenz-wheel' && root.WSSLorenzWheel)return root.WSSLorenzWheel.make(world,options);
    if(id==='floating-block' && root.WSSFloatingBlock)return root.WSSFloatingBlock.make(world,options);
    if(world.w!==720||world.h!==400||(world.tile||8)!==8)throw Error('These drafts need the ordinary toy box.');
    var entry=entries.find(function(e){return e.id===id;}),basin={x:112,y:304,width:496,height:80};
    var d={name:id,title:entry.title,seed:options&&options.seed||17,draft:true,setup:'draft',setups:[],action:'Close tap',primary:{kind:'tap'},
      readingLabel:'Draft apparatus',caption:entry.cue,viewBounds:{x:72,y:48,width:576,height:336},
      vessels:[{id:'basin',label:'Collector',rect:basin,sealed:false}],pipes:[],solids:[],vents:[],parts:[],slimes:[],initial:[],marks:[],meters:[],
      settings:{enabled:false},boundaries:{pool:true,tap:{x:360,y:80,width:12,height:4,rate:180,vx:0,vy:40,enabled:true},drain:{x:120,y:368,width:480,height:8}},
      measure:{source:basin,receiver:basin},boundaryNote:'Draft. The marked tap and collector are declared native sources and drains. No water is moved outside the shared solver.',
      energyBudgetStatus:'The tap adds declared supply work. Ordinary gel-water buoyancy and drag remain one-way, and this draft does not claim closed mechanical energy or momentum.'};
    if(id==='thirsty-slime'){
      basin={x:112,y:240,width:496,height:144};
      d.vessels=[{id:'basin',label:'',rect:basin,sealed:false}];d.measure={source:basin,receiver:basin};
      d.viewBounds={x:80,y:72,width:560,height:328};
      d.slimes=[{x:360,y:320,radius:30}];d.initial=[];
      d.boundaries.tap.y=96;d.boundaries.tap.rate=2600;d.boundaries.tap.width=28;d.boundaries.tap.height=8;
      d.boundaries.tap.enabled=!(options && options.tapEnabled===false);
      d.setup=d.boundaries.tap.enabled?'tap-on':'tap-off';d.action=d.boundaries.tap.enabled?'Stop water':'Start water';
      d.setups=[{id:'tap-on',label:'Water running',options:{tapEnabled:true}},{id:'tap-off',label:'Water off',options:{tapEnabled:false}}];
      d.boundaries.drain={x:120,y:368,width:480,height:8};d.boundaries.boundStorage=true;d.boundaries.reserveCapacity=32768;
      d.thirsty=true;d.quietApparatus=true;d.caption=entry.cue;d.readingLabel='Drinking slime';
      d.boundaryNote='Contact transfers native water into the slime’s bound storage. Each absorbed parcel adds 1.5625 square pixels to its elastic rest area, up to sixteen times its dry area. The linked jaws have finite mass and spring handles. Compressive jaw traction drives jets through exposed skin pores. Discharge releases stored native parcels, shrinks the gel and returns the jet impulse to its material. Unabsorbed runoff recirculates through the tray.';
      d.energyBudgetStatus='This is a toy absorption model. The tap supplies lifting work. Pore pressure, elastic swelling and water drag are approximate; jet recoil returns through GPU readback. No calibrated hydrogel or closed energy claim.';
    }else if(id==='floating-block'){
      d.vessels=[{id:'basin',label:'Water',rect:{x:112,y:128,width:496,height:256},sealed:false}];
      d.initial=[{kind:'rect',rect:{x:120,y:264,width:480,height:104}}];d.slimes=[{x:352,y:224,radius:24,shape:'cube'}];
      d.boundaries=null;d.action='Push block';d.primary={kind:'draft-push'};d.draftRig=[{body:0,kind:'free'}];
      d.boundaryNote='Draft. The block is the actual square gel mesh at full shape stiffness. Least-squares rigid projection preserves its predicted center and rotation. Grab and the existing water coupling provide motion; no target water height is assigned.';
    }else if(id==='lorenz-wheel'){
      d.slimes=[{x:360,y:216,radius:28,shape:'plus'}];d.draftRig=[{body:0,kind:'hinge',x:360,y:216,motor:true}];
      d.action='Start declared motor';d.primary={kind:'draft-motor'};
      d.boundaryNote+=' The plus-shaped rotor is a real rigid-projected mesh on a fixed axle. Its optional declared motor supplies angular acceleration. Water-driven cup loading, leakage and Lorenz reversals are not connected; no flow-derived torque is invented.';
    }else if(id==='shishi-odoshi'){
      d.slimes=[{x:360,y:208,radius:28,shape:'draft-trough'}];d.draftRig=[{body:0,kind:'hinge',x:352,y:208}];
      d.boundaries.tap.x=376;d.boundaries.tap.rate=120;
      d.boundaryNote+=' The trough is the actual U-shaped rigid-projected gel mesh on a fixed pin. Gravity and ordinary contacts can turn it. Reliable water-load tipping and resetting are unproved; there is no tilt timer.';
    }else if(id==='lift-lock'){
      d.vessels=[{id:'left',label:'Left tank',rect:{x:120,y:104,width:176,height:248},sealed:false},{id:'right',label:'Right tank',rect:{x:424,y:104,width:176,height:248},sealed:false}];
      d.pipes=[{points:[{x:280,y:312},{x:440,y:312}],bore:24}];
      d.parts=[{id:'link',type:'valve',rect:{x:352,y:300,width:16,height:24},open:false}];
      d.primary={kind:'valve',id:'link'};d.action='Open tank link';d.boundaries=null;
      d.initial=[{kind:'rect',rect:{x:128,y:216,width:160,height:128}},{kind:'rect',rect:{x:432,y:296,width:160,height:48}}];
      d.slimes=[{x:208,y:184,radius:24,shape:'cube'},{x:512,y:256,radius:24,shape:'cube'}];
      d.draftRig=[{body:0,kind:'rail',a:{x:208,y:160},b:{x:208,y:320}},{body:1,kind:'rail',a:{x:512,y:160},b:{x:512,y:320}}];
      d.measure={source:d.vessels[0].rect,receiver:d.vessels[1].rect};
      d.boundaryNote='Draft. A real valve joins two fixed native-water tanks. The square carriers have physical vertical guides and ordinary buoyancy. Moving sealed caissons, a common piston and payload load are not connected yet.';
    }else if(id==='ballast-railway'){
      d.slimes=[{x:272,y:184,radius:24,shape:'cube'},{x:464,y:256,radius:24,shape:'cube'}];
      d.draftRig=[{body:0,kind:'rail',a:{x:232,y:144},b:{x:384,y:296}},{body:1,kind:'rail',a:{x:392,y:144},b:{x:544,y:296}}];
      d.boundaries.tap.x=272;
      d.boundaryNote+=' The rigid carriers have physical inclined guides and end stops. Gravity can slide them; Grab supplies hand work. Water ballast storage and the common balancing cable are not coupled, and no carrier trajectory is scripted.';
    }
    return d;
  }
  // Full-stiffness least-squares shape projection with optional holonomic
  // hinge/rail constraints. Every angle comes from predicted node positions.
  function createRig(definition,bodies){
    var motorOn=false,steps=0;
    var rigs=definition.draftRig.map(function(spec){
      var b=bodies[spec.body];if(!b)throw Error('Draft body allocation failed.');
      var cx=0,cy=0;for(var i=0;i<b.n;i++){cx+=b.px[i];cy+=b.py[i];}cx/=b.n;cy/=b.n;
      var origin=spec.kind==='hinge'?{x:spec.x,y:spec.y}:{x:cx,y:cy},qx=[],qy=[];
      for(i=0;i<b.n;i++){qx.push(b.px[i]-origin.x);qy.push(b.py[i]-origin.y);}
      return {spec:spec,body:b,qx:qx,qy:qy,origin:origin,angle:0};
    });
    function fit(r,x,y){
      var cx=0,cy=0,a=0,b=0,n=r.body.n;
      for(var i=0;i<n;i++){cx+=x[i];cy+=y[i];}cx/=n;cy/=n;
      if(r.spec.kind==='hinge'){cx=r.origin.x;cy=r.origin.y;}
      for(i=0;i<n;i++){a+=r.qx[i]*(x[i]-cx)+r.qy[i]*(y[i]-cy);b+=r.qx[i]*(y[i]-cy)-r.qy[i]*(x[i]-cx);}
      var angle=Math.atan2(b,a);
      if(r.spec.kind==='rail'){
        var p=r.spec.a,q=r.spec.b,dx=q.x-p.x,dy=q.y-p.y,t=Math.max(0,Math.min(1,((cx-p.x)*dx+(cy-p.y)*dy)/(dx*dx+dy*dy)));
        cx=p.x+dx*t;cy=p.y+dy*t;angle=0;
      }
      return {x:cx,y:cy,c:Math.cos(angle),s:Math.sin(angle),angle:angle};
    }
    return {
      project:function(body,h,timescale){
        var r=rigs.find(function(r){return r.body===body;});if(!r)return;
        var p=fit(r,body.px,body.py),old=fit(r,body.ox,body.oy),dt=h/timescale;
        body.bboxL=body.bboxT=Infinity;body.bboxR=body.bboxB=-Infinity;body.cx=body.cy=0;
        for(var i=0;i<body.n;i++){
          var x=p.c*r.qx[i]-p.s*r.qy[i],y=p.s*r.qx[i]+p.c*r.qy[i];
          body.px[i]=p.x+x;body.py[i]=p.y+y;
          body.ox[i]=old.x+old.c*r.qx[i]-old.s*r.qy[i];body.oy[i]=old.y+old.s*r.qx[i]+old.c*r.qy[i];
          if(motorOn&&r.spec.motor){body.ox[i]+=y*1.5*dt*dt;body.oy[i]-=x*1.5*dt*dt;}
          body.cx+=body.px[i];body.cy+=body.py[i];
          body.bboxL=Math.min(body.bboxL,body.px[i]);body.bboxR=Math.max(body.bboxR,body.px[i]);body.bboxT=Math.min(body.bboxT,body.py[i]);body.bboxB=Math.max(body.bboxB,body.py[i]);
        }
        body.cx/=body.n;body.cy/=body.n;body.sleeping=false;body.sleepFrames=0;r.angle=p.angle;steps++;
      },
      toggle:function(){motorOn=!motorOn;return motorOn;},
      push:function(h,timescale){var b=rigs[0].body,dt=h/timescale;for(var i=0;i<b.n;i++)b.oy[i]-=24*dt;b.sleeping=false;b.sleepFrames=0;return true;},
      stats:function(){return {steps:steps,motorOn:motorOn,bodies:rigs.map(function(r){return {x:r.body.cx,y:r.body.cy,angle:r.angle,kind:r.spec.kind,finite:Array.from(r.body.px).concat(Array.from(r.body.py),Array.from(r.body.ox),Array.from(r.body.oy)).every(Number.isFinite)};}),model:'Draft rigid projection and ideal guides; ordinary one-way water coupling.'};},
      draw:function(c){rigs.forEach(function(r){var s=r.spec;c.save();c.globalAlpha=.6;c.beginPath();if(s.kind==='rail'){c.moveTo(s.a.x,s.a.y);c.lineTo(s.b.x,s.b.y);}else if(s.kind==='hinge'){c.arc(s.x,s.y,5,0,Math.PI*2);}c.stroke();c.restore();if(s.motor)c.fillText('Declared motor',s.x+32,s.y+4);});},
      destroy:function(){rigs.length=0;}
    };
  }
  root.WSSMachines=root.WSSMachines||{};
  root.WSSMachines['water-balloon-fight']={make:function(w,o){return balloon(w,o,false);}};
  root.WSSMachines['squid-jet']={make:function(w,o){return balloon(w,o,true);}};
  entries.filter(function(e){return e.id!=='water-balloon-fight'&&e.id!=='squid-jet';}).forEach(function(e){root.WSSMachines[e.id]={make:function(w,o){return draft(w,o,e.id);}};});
  root.WSSDraftBodies={entries:entries,squeeze:squeeze,createRig:createRig,shapes:{'draft-trough':['#.....#','#.....#','#######']}};
})(typeof window!=='undefined'?window:globalThis);
