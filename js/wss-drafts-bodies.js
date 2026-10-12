/* Water-slime and floating-body sprint drafts. All liquid stays native. */
(function(root){
  'use strict';
  var entries=[
    {id:'water-balloon-fight',capability:'Water slimes',title:'Water-balloon fight',cue:'Draft. Fling the balloon at the slimes, then pop it.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:false},
    {id:'squid-jet',capability:'Water slimes',title:'Squid jet',cue:'Draft. Squeeze the slit skin and watch the released water.',status:'PARTLY',draft:true,world:{w:720,h:400},pool:false}
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
  root.WSSMachines=root.WSSMachines||{};
  root.WSSMachines['water-balloon-fight']={make:function(w,o){return balloon(w,o,false);}};
  root.WSSMachines['squid-jet']={make:function(w,o){return balloon(w,o,true);}};
  root.WSSDraftBodies={entries:entries,squeeze:squeeze};
})(typeof window!=='undefined'?window:globalThis);
